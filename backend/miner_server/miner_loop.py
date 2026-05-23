"""
Build block from getblocktemplate, nonce iteration, difficulty check, submitblock.
On macOS, uses forkserver context to avoid broken-pipe errors when spawning workers
from a Flask thread that is itself a child of a Node.js process (inherited FDs).

Search space: Bitcoin uses a 32-bit nonce in the block header. We correctly iterate
the full range [0, 0xFFFFFFFF] without reducing the space. The thesis (ch. 15) notes
that narrowing nonces by position (e.g. hash mod 12) would be an attack on the
protocol; mitigation is to ensure unbiased search. This miner does not reduce the
nonce space. Thesis-aligned ordering (e.g. platonic/golden-ratio in c. math C miner)
is a different traversal order over the same space, not a reduction.

When num_workers == 4, partition is by quadrant (500D lattice): each worker tries
only nonces in its quadrant; union of all four quadrants = full 32-bit space.
Thesis ch.15 unbiased search preserved; ordering remains thesis-aligned.
"""
import hashlib
import multiprocessing
import os
import struct
import sys
import time
from typing import Any, Callable, Optional

from config import (
    MinerConfig,
    SEARCH_MODE_LINEAR,
    effective_phase3_count,
    phase3_nonces_per_worker,
    supt_sample_every,
)

_active_auto_round_restart_sec = 0


def set_auto_round_restart_sec(seconds: int) -> None:
    """Live toggle: 0 disables timed round rollover."""
    global _active_auto_round_restart_sec
    _active_auto_round_restart_sec = max(0, int(seconds))


def get_auto_round_restart_sec() -> int:
    return _active_auto_round_restart_sec


def _round_duration_exceeded(round_t0: float) -> bool:
    limit = get_auto_round_restart_sec()
    return limit > 0 and (time.time() - round_t0) >= limit
from btc_rpc import getblocktemplate, submitblock, BitcoinRPCError
from address import address_to_script_pubkey
from hasher_bridge import scan_batch as _c_scan_batch, scan_list as _c_scan_list, is_available as _c_hasher_available, get_hasher_source
from nonce_logger import log_nonce_round
import supt_streams
from thesis_mining import (
    bits_compact_to_difficulty_bits,
    nonce_generate_unified_py,
    recovery_suggested_nonce,
    build_candidate_list,
    get_minimal_nonce_list,
    get_base_nonce_source,
    get_last_seed_prime_path,
    quadrant_from_nonce,
)

# Full 32-bit nonce space size (exclusive end for ranges); build_candidate_list uses [start, end).
NONCE_SPACE = 0xFFFFFFFF + 1

# Timestamp rolling: max seconds to advance nTime before forcing extra-nonce roll or new template.
# Bitcoin allows nTime up to +7200s from median-time-past; templates expose "maxtime".
TIMESTAMP_ROLL_MAX = 60

# Extra-nonce rolling: max number of coinbase extra-nonce increments per template.
# Each increment changes the coinbase txid and merkle root, giving a new nonce space.
EXTRA_NONCE_ROLL_MAX = 16


def _supt_sample(round_id: int, nonce: int, hash_bytes: bytes, *, from_worker: bool = False) -> None:
    if round_id < 0 or not supt_streams.is_enabled():
        return
    if nonce % supt_sample_every() != 0:
        return
    if from_worker:
        supt_streams.enqueue_sample(round_id, nonce, hash_bytes)
    else:
        supt_streams.sample_hash(round_id, nonce, hash_bytes)


def _supt_sample_candidates_for_stream_a(
    round_id: int,
    version: int,
    prev_hex: str,
    merkle_root: bytes,
    time_val: int,
    bits_hex: str,
    nonces: list[int],
    *,
    from_worker: bool = False,
) -> None:
    """Sample Stream A for candidate nonces (used after C batch scan paths)."""
    if round_id < 0 or not supt_streams.is_enabled():
        return
    step = supt_sample_every()
    for nonce in nonces:
        if nonce % step != 0:
            continue
        header = _build_block_header(version, prev_hex, merkle_root, time_val, bits_hex, nonce)
        h = _double_sha256(header)
        _supt_sample(round_id, nonce, h, from_worker=from_worker)


def _supt_finish_round(
    round_id: int,
    round_t0: float,
    hashes_done: int,
    blocks_found: int,
    winning_nonce: Optional[int] = None,
) -> tuple[int, int]:
    if round_id >= 0:
        nonce_found = winning_nonce if blocks_found and winning_nonce is not None else -1
        supt_streams.end_round(round_id, nonce_found, hashes_done, time.time() - round_t0)
    return hashes_done, blocks_found


def _uint32_le(n: int) -> bytes:
    return struct.pack("<I", n & 0xFFFFFFFF)


def _varint(n: int) -> bytes:
    if n < 0xFD:
        return bytes([n])
    if n <= 0xFFFF:
        return bytes([0xFD]) + struct.pack("<H", n)
    if n <= 0xFFFFFFFF:
        return bytes([0xFE]) + struct.pack("<I", n)
    return bytes([0xFF]) + struct.pack("<Q", n)


def _double_sha256(data: bytes) -> bytes:
    """Bitcoin consensus hash: SHA256(SHA256(data)). Kept minimal for inner-loop speed."""
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def _bits_to_target(bits_hex: str) -> int:
    """Convert compact 'bits' (hex string) to 256-bit target."""
    b = bytes.fromhex(bits_hex)
    if len(b) != 4:
        raise ValueError("bits must be 4 bytes")
    exponent = b[0]
    mantissa = int.from_bytes(b[1:4], "big")
    if exponent <= 3:
        return mantissa >> (8 * (3 - exponent))
    return mantissa << (8 * (exponent - 3))


def _hash_meets_target(hash_bytes: bytes, target: int) -> bool:
    """Check if double-SHA256 hash (32 bytes LE) is <= target (valid block)."""
    return int.from_bytes(hash_bytes, "little") <= target


def _height_to_script_push(height: int) -> bytes:
    """BIP34: minimal encoding of block height for scriptSig."""
    if height == 0:
        return bytes([0x00])  # OP_0
    if 1 <= height <= 16:
        return bytes([0x50 + height])  # OP_1 .. OP_16
    # Push as little-endian bytes (minimal CScriptNum encoding)
    n = height
    buf = []
    while n:
        buf.append(n & 0xFF)
        n >>= 8
    # Sign-bit padding: CScriptNum is signed; if MSB has bit 7 set, append 0x00
    # to keep the value positive (matches Bitcoin Core CScriptNum::serialize).
    if buf and (buf[-1] & 0x80):
        buf.append(0x00)
    return _varint(len(buf)) + bytes(buf)


def _build_coinbase_script_sig(height: int, coinbase_aux: Optional[dict] = None) -> bytes:
    """BIP34: height in scriptSig; optional coinbaseaux data.

    Bitcoin consensus requires coinbase scriptSig to be 2-100 bytes.
    We pad with a 0x00 byte if the result would be too short.
    """
    out = _height_to_script_push(height)
    if coinbase_aux:
        for k, v in coinbase_aux.items():
            raw = bytes.fromhex(v) if isinstance(v, str) else v
            out += _varint(len(raw)) + raw
    # Ensure minimum 2 bytes (consensus rule for coinbase scriptSig length)
    if len(out) < 2:
        out += b"\x00"
    return out


def _build_coinbase(
    height: int,
    coinbase_value: int,
    script_pubkey: bytes,
    coinbase_aux: Optional[dict] = None,
    witness_commitment_hex: Optional[str] = None,
    extra_nonce: Optional[bytes] = None,
) -> bytes:
    """Serialize coinbase transaction in non-witness (stripped) format.

    This serialization is used to compute the txid for the merkle root.
    For block submission when segwit is active, wrap the result with
    _coinbase_add_witness() to produce the full segwit serialization
    that includes the BIP141 witness reserved value.
    """
    script_sig = _build_coinbase_script_sig(height, coinbase_aux)
    if extra_nonce:
        script_sig += extra_nonce
    vin = (
        bytes(32)
        + struct.pack("<I", 0xFFFFFFFF)
        + _varint(len(script_sig))
        + script_sig
        + struct.pack("<I", 0xFFFFFFFF)
    )
    out1 = struct.pack("<Q", coinbase_value) + _varint(len(script_pubkey)) + script_pubkey
    if witness_commitment_hex:
        script_commit = bytes.fromhex(witness_commitment_hex)
        out2 = struct.pack("<Q", 0) + _varint(len(script_commit)) + script_commit
        vouts = bytes([2]) + out1 + out2
    else:
        vouts = bytes([1]) + out1
    return (
        struct.pack("<I", 2)
        + bytes([1])
        + vin
        + vouts
        + struct.pack("<I", 0)
    )


def _coinbase_add_witness(stripped_coinbase: bytes) -> bytes:
    """Convert non-segwit (stripped) coinbase to segwit format with witness reserved value.

    Segwit format: version + marker(0x00) + flag(0x01) + inputs + outputs + witness + locktime.
    BIP141 witness for coinbase: 1 stack item of 32 zero bytes (witness reserved value).
    """
    version = stripped_coinbase[:4]
    locktime = stripped_coinbase[-4:]
    middle = stripped_coinbase[4:-4]
    witness = bytes([1, 32]) + bytes(32)
    return version + bytes([0x00, 0x01]) + middle + witness + locktime


def _merkle_root(hashes: list[bytes]) -> bytes:
    """Compute merkle root from list of tx hashes (32 bytes each)."""
    if not hashes:
        return bytes(32)
    while len(hashes) > 1:
        if len(hashes) % 2:
            hashes.append(hashes[-1])
        next_level = []
        for i in range(0, len(hashes), 2):
            next_level.append(_double_sha256(hashes[i] + hashes[i + 1]))
        hashes = next_level
    return hashes[0]


def _build_block_header(
    version: int,
    prev_block_hash_hex: str,
    merkle_root: bytes,
    time_val: int,
    bits_hex: str,
    nonce: int,
) -> bytes:
    """Build 80-byte block header (all LE)."""
    prev = bytes.fromhex(prev_block_hash_hex)
    if len(prev) == 32:
        prev = prev[::-1]  # to internal order
    bits_le = struct.pack("<I", int(bits_hex, 16))
    return (
        struct.pack("<I", version)
        + prev
        + merkle_root
        + struct.pack("<I", time_val)
        + bits_le
        + _uint32_le(nonce)
    )


def _build_header_template(
    version: int,
    prev_block_hash_hex: str,
    merkle_root: bytes,
    time_val: int,
    bits_hex: str,
) -> bytes:
    """Build 80-byte header template with nonce=0 for C batch scanner."""
    return _build_block_header(version, prev_block_hash_hex, merkle_root, time_val, bits_hex, 0)


C_SCAN_CHUNK = 1_000_000


def _build_block(
    template: dict,
    script_pubkey: bytes,
    header: bytes,
    coinbase_raw: bytes,
    tx_list: list[dict],
) -> bytes:
    """Full block: header + varint(n_tx) + coinbase + transactions."""
    coinbase_txid = _double_sha256(coinbase_raw)  # raw hash for merkle tree (internal byte order)
    tx_hashes = [coinbase_txid]
    tx_raws = [coinbase_raw]
    for tx in tx_list:
        data_hex = tx.get("data")
        if data_hex:
            tx_raws.append(bytes.fromhex(data_hex))
            tx_hashes.append(_double_sha256(tx_raws[-1]))
        else:
            txid_hex = tx.get("hash") or tx.get("txid")
            if txid_hex:
                tx_hashes.append(bytes.fromhex(txid_hex)[::-1])  # RPC txids are display order; reverse to internal
            tx_raws.append(bytes.fromhex(tx.get("data", "")))
    # Merkle uses txids; we already built header with correct merkle, so block body is header + txs
    n_tx = len(tx_raws)
    return header + _varint(n_tx) + b"".join(tx_raws)


def run_mining_loop(
    config: MinerConfig,
    on_hash: Optional[Callable[[int], None]] = None,
    stop_flag: Optional[Callable[[], bool]] = None,
    on_log: Optional[Callable[[str], None]] = None,
) -> tuple[int, int]:
    """
    Fetch template, build block, iterate nonce, submit on success.
    Returns (hashes_done, blocks_found).
    """
    if not config.mining_address:
        raise ValueError("BTC_MINING_ADDRESS or mining_address required")
    script_pubkey = address_to_script_pubkey(config.mining_address)

    capabilities = ["segwit"]
    template = getblocktemplate(config, capabilities)
    if not template:
        raise BitcoinRPCError(-1, "empty getblocktemplate")

    version = template.get("version", 0x20000000)
    prev_hex = template.get("previousblockhash")
    bits_hex = template.get("bits")
    if not prev_hex or not isinstance(prev_hex, str) or len(prev_hex) != 64 or not all(c in "0123456789abcdefABCDEF" for c in prev_hex):
        raise BitcoinRPCError(-1, "invalid previousblockhash in template")
    if not bits_hex or not isinstance(bits_hex, str) or len(bits_hex) != 8 or not all(c in "0123456789abcdefABCDEF" for c in bits_hex):
        raise BitcoinRPCError(-1, "invalid bits in template")
    height = template["height"]
    curtime = template.get("curtime", int(time.time()))
    coinbase_value = template["coinbasevalue"]
    coinbase_aux = template.get("coinbaseaux") or {}
    transactions = template.get("transactions") or []
    witness_commitment = template.get("default_witness_commitment")

    target = _bits_to_target(bits_hex)

    # Build coinbase: stripped (non-witness) for txid/merkle, segwit for block body
    coinbase_stripped = _build_coinbase(
        height, coinbase_value, script_pubkey, coinbase_aux, witness_commitment
    )
    coinbase_for_block = (
        _coinbase_add_witness(coinbase_stripped) if witness_commitment else coinbase_stripped
    )
    coinbase_txid = _double_sha256(coinbase_stripped)
    tx_hashes = [coinbase_txid]
    tx_raws_for_block = []
    for tx in transactions:
        data_hex = tx.get("data")
        txid_hex = tx.get("txid")
        if data_hex:
            tx_raw = bytes.fromhex(data_hex)
            if txid_hex:
                tx_hashes.append(bytes.fromhex(txid_hex)[::-1])
            else:
                tx_hashes.append(_double_sha256(tx_raw))
            tx_raws_for_block.append(tx_raw)

    merkle_root = _merkle_root(tx_hashes)
    blocks_found = 0
    hashes_done = 0
    # Full 32-bit nonce space per Bitcoin protocol; do not reduce (thesis ch.15: unbiased search).
    nonce_start = 0
    nonce_end = 0x100000000
    bits_le = struct.pack("<I", int(bits_hex, 16))

    if on_log:
        on_log(f"[linear] Template: height {height}, bits {bits_hex}")
        on_log("[linear] Linear search: full 32-bit nonce range.")

    round_id = supt_streams.begin_round(height, search_mode=getattr(config, "search_mode", "linear"))
    round_t0 = time.time()
    winning_nonce: Optional[int] = None

    for nonce in range(nonce_start, nonce_end):
        if stop_flag and stop_flag():
            break
        if nonce % 4096 == 0 and _round_duration_exceeded(round_t0):
            if on_log:
                on_log(f"[linear] Auto round restart ({get_auto_round_restart_sec()}s elapsed).")
            break
        header = _build_block_header(
            version, prev_hex, merkle_root, curtime, bits_hex, nonce
        )
        if len(header) != 80:
            header = (
                struct.pack("<I", version)
                + bytes.fromhex(prev_hex)[::-1]
                + merkle_root
                + struct.pack("<I", curtime)
                + bits_le
                + _uint32_le(nonce)
            )
        h = _double_sha256(header)
        hashes_done += 1
        _supt_sample(round_id, nonce, h)
        if on_hash:
            on_hash(hashes_done)
        if _hash_meets_target(h, target):
            if on_log:
                on_log(f"[linear] Solution found ({hashes_done} hashes).")
            # Bitcoin block format: 80-byte header + varint(tx_count) + coinbase + other txs
            n_tx = 1 + len(tx_raws_for_block)
            full_block = header + _varint(n_tx) + coinbase_for_block + b"".join(tx_raws_for_block)
            hex_block = full_block.hex()
            result = submitblock(config, hex_block)
            if result is None:
                blocks_found += 1
                winning_nonce = nonce
            elif on_log:
                on_log(f"[linear] Submit block rejected: {result}")
            break
    return _supt_finish_round(round_id, round_t0, hashes_done, blocks_found, winning_nonce)


def run_mining_loop_unified(
    config: MinerConfig,
    on_hash: Optional[Callable[[int], None]] = None,
    stop_flag: Optional[Callable[[], bool]] = None,
    on_log: Optional[Callable[[str], None]] = None,
) -> tuple[int, int]:
    """
    Unified mining: deterministic base nonce, recovery, sphere hopping, duality ordering,
    polar lattice, and ordered thesis candidate list. Optional Phase 3 linear sweep only
    when BTC_PHASE3_NONCES_PER_WORKER > 0 (default 0: no linear fallback).
    """
    if not config.mining_address:
        raise ValueError("BTC_MINING_ADDRESS or mining_address required")
    script_pubkey = address_to_script_pubkey(config.mining_address)

    capabilities = ["segwit"]
    template = getblocktemplate(config, capabilities)
    if not template:
        raise BitcoinRPCError(-1, "empty getblocktemplate")

    version = template.get("version", 0x20000000)
    prev_hex = template.get("previousblockhash")
    bits_hex = template.get("bits")
    if not prev_hex or not isinstance(prev_hex, str) or len(prev_hex) != 64 or not all(c in "0123456789abcdefABCDEF" for c in prev_hex):
        raise BitcoinRPCError(-1, "invalid previousblockhash in template")
    if not bits_hex or not isinstance(bits_hex, str) or len(bits_hex) != 8 or not all(c in "0123456789abcdefABCDEF" for c in bits_hex):
        raise BitcoinRPCError(-1, "invalid bits in template")
    height = template["height"]
    curtime = template.get("curtime", int(time.time()))
    maxtime = template.get("maxtime", curtime + TIMESTAMP_ROLL_MAX)
    coinbase_value = template["coinbasevalue"]
    coinbase_aux = template.get("coinbaseaux") or {}
    transactions = template.get("transactions") or []
    witness_commitment = template.get("default_witness_commitment")

    target = _bits_to_target(bits_hex)
    bits_int = int(bits_hex, 16)
    bits_bytes = bytes.fromhex(bits_hex)
    difficulty_bits = bits_compact_to_difficulty_bits(bits_int)

    # Pre-compute txid hashes for merkle root (unchanged across timestamp/extra-nonce rolls).
    # getblocktemplate "data" is full witness serialization for segwit txs; hashing it yields
    # wtxid, not txid.  The "txid" field is the correct non-witness hash for the merkle tree.
    tx_raws_for_block: list[bytes] = []
    tx_hashes_no_coinbase: list[bytes] = []
    for tx in transactions:
        data_hex = tx.get("data")
        txid_hex = tx.get("txid")
        if data_hex:
            tx_raw = bytes.fromhex(data_hex)
            if txid_hex:
                tx_hashes_no_coinbase.append(bytes.fromhex(txid_hex)[::-1])
            else:
                tx_hashes_no_coinbase.append(_double_sha256(tx_raw))
            tx_raws_for_block.append(tx_raw)

    def _rebuild_coinbase_and_merkle(extra_nonce_bytes: Optional[bytes] = None) -> tuple[bytes, bytes, bytes]:
        """Build coinbase with optional extra-nonce, return (stripped, for_block, merkle_root)."""
        stripped = _build_coinbase(
            height, coinbase_value, script_pubkey, coinbase_aux, witness_commitment,
            extra_nonce=extra_nonce_bytes,
        )
        for_block = _coinbase_add_witness(stripped) if witness_commitment else stripped
        txid = _double_sha256(stripped)
        mr = _merkle_root([txid] + list(tx_hashes_no_coinbase))
        return stripped, for_block, mr

    coinbase_stripped, coinbase_for_block, merkle_root = _rebuild_coinbase_and_merkle()
    blocks_found = 0
    hashes_done = 0

    if on_log:
        on_log(f"[{config.search_mode}] Template: height {height}, bits {bits_hex}")

    round_id = supt_streams.begin_round(height, search_mode=config.search_mode)
    round_t0 = time.time()

    minimal_nonces = get_minimal_nonce_list(height, difficulty_bits, bits_bytes)
    if config.single_nonce_only:
        if on_log:
            on_log(f"Single-nonce mode: trying {len(minimal_nonces)} entropy-reduced nonce(s) only.")
        for nonce in minimal_nonces:
            if stop_flag and stop_flag():
                break
            header = _build_block_header(
                version, prev_hex, merkle_root, curtime, bits_hex, nonce
            )
            h = _double_sha256(header)
            hashes_done += 1
            _supt_sample(round_id, nonce, h)
            if on_hash:
                on_hash(hashes_done)
            if _hash_meets_target(h, target):
                if on_log:
                    on_log(f"Solution found in minimal set ({hashes_done} hash(es)).")
                n_tx = 1 + len(tx_raws_for_block)
                full_block = header + _varint(n_tx) + coinbase_for_block + b"".join(tx_raws_for_block)
                result = submitblock(config, full_block.hex())
                if result is None:
                    blocks_found = 1
                elif on_log:
                    on_log(f"Submit block rejected: {result}")
                return _supt_finish_round(round_id, round_t0, hashes_done, blocks_found, nonce)
        if on_log:
            on_log(f"Single-nonce mode: {hashes_done} hash(es), no solution.")
        return _supt_finish_round(round_id, round_t0, hashes_done, blocks_found)

    if on_log:
        on_log(
            f"Thesis pipeline: full candidate search (anchors {len(minimal_nonces)}: merged into ordered list; no separate 1–2 hash pass)."
        )

    base_nonce = nonce_generate_unified_py(height, difficulty_bits)
    recovery_nonce = recovery_suggested_nonce(bits_bytes)
    if recovery_nonce is None:
        recovery_nonce = base_nonce

    candidates = build_candidate_list(
        base_nonce, recovery_nonce, 0, NONCE_SPACE, block_height=height
    )
    log_nonce_round(
        height, bits_hex, base_nonce, recovery_nonce,
        minimal_nonces, len(candidates), candidates,
        base_nonce_source=get_base_nonce_source(),
        seed_prime_path=get_last_seed_prime_path(),
    )
    if on_log:
        on_log(
            f"Thesis: base={get_base_nonce_source()} seed={get_last_seed_prime_path() or 'n/a'} candidates={len(candidates)}"
        )

    if config.num_workers > 1:
        return _run_mining_loop_unified_mp(
            config,
            template,
            version,
            prev_hex,
            bits_hex,
            height,
            curtime,
            coinbase_aux,
            transactions,
            witness_commitment,
            target,
            difficulty_bits,
            bits_bytes,
            coinbase_for_block,
            tx_raws_for_block,
            merkle_root,
            on_hash,
            stop_flag,
            on_log,
            round_id,
            round_t0,
        )

    # Single-worker: thesis candidates each timestamp; optional Phase 3 linear sweep
    phase3_count = effective_phase3_count(config)
    current_time = curtime
    extra_nonce_counter = 0
    use_c = _c_hasher_available()

    while True:
        if stop_flag and stop_flag():
            break
        if _round_duration_exceeded(round_t0):
            if on_log:
                on_log(f"Auto round restart ({get_auto_round_restart_sec()}s elapsed).")
            break

        hdr_tpl = _build_header_template(version, prev_hex, merkle_root, current_time, bits_hex)

        # Phase 2: thesis candidates (C batch or Python loop)
        if on_log and current_time == curtime:
            src = get_hasher_source()
            on_log(f"Phase 2: searching {len(candidates)} thesis candidates (hasher={src}).")
        if use_c:
            hit = _c_scan_list(hdr_tpl, target, candidates)
            hashes_done += len(candidates)
            _supt_sample_candidates_for_stream_a(
                round_id, version, prev_hex, merkle_root, current_time, bits_hex, candidates
            )
            if on_hash:
                on_hash(hashes_done)
            if hit is not None:
                winning_nonce, _idx = hit
                if on_log:
                    on_log(f"Phase 2: solution nonce={winning_nonce} (total {hashes_done} hashes).")
                header = _build_block_header(version, prev_hex, merkle_root, current_time, bits_hex, winning_nonce)
                n_tx = 1 + len(tx_raws_for_block)
                full_block = header + _varint(n_tx) + coinbase_for_block + b"".join(tx_raws_for_block)
                result = submitblock(config, full_block.hex())
                if result is None:
                    blocks_found = 1
                elif on_log:
                    on_log(f"Submit block rejected: {result}")
                return _supt_finish_round(round_id, round_t0, hashes_done, blocks_found, winning_nonce)
        else:
            for nonce in candidates:
                if stop_flag and stop_flag():
                    break
                header = _build_block_header(
                    version, prev_hex, merkle_root, current_time, bits_hex, nonce
                )
                h = _double_sha256(header)
                hashes_done += 1
                _supt_sample(round_id, nonce, h)
                if on_hash:
                    on_hash(hashes_done)
                if _hash_meets_target(h, target):
                    if on_log:
                        on_log(f"Phase 2: solution found (total {hashes_done} hashes).")
                    n_tx = 1 + len(tx_raws_for_block)
                    full_block = header + _varint(n_tx) + coinbase_for_block + b"".join(tx_raws_for_block)
                    result = submitblock(config, full_block.hex())
                    if result is None:
                        blocks_found = 1
                    elif on_log:
                        on_log(f"Submit block rejected: {result}")
                    return _supt_finish_round(round_id, round_t0, hashes_done, blocks_found, nonce)

        # Phase 3: linear sweep (C batch or Python loop)
        if phase3_count > 0:
            sweep_start = (base_nonce + extra_nonce_counter * phase3_count) & 0xFFFFFFFF
            if on_log and current_time == curtime:
                on_log(f"Phase 3: sweep {phase3_count:,} nonces from {sweep_start}.")
            if use_c:
                remaining = phase3_count
                offset = 0
                while remaining > 0:
                    if stop_flag and stop_flag():
                        break
                    chunk = min(remaining, C_SCAN_CHUNK)
                    s = (sweep_start + offset) & 0xFFFFFFFF
                    winner = _c_scan_batch(hdr_tpl, target, s, chunk)
                    hashes_done += chunk
                    offset += chunk
                    remaining -= chunk
                    if on_hash:
                        on_hash(hashes_done)
                    if winner is not None:
                        if on_log:
                            on_log(f"Phase 3: solution nonce={winner} (total {hashes_done} hashes).")
                        header = _build_block_header(version, prev_hex, merkle_root, current_time, bits_hex, winner)
                        n_tx = 1 + len(tx_raws_for_block)
                        full_block = header + _varint(n_tx) + coinbase_for_block + b"".join(tx_raws_for_block)
                        result = submitblock(config, full_block.hex())
                        if result is None:
                            blocks_found = 1
                        elif on_log:
                            on_log(f"Submit block rejected: {result}")
                        return _supt_finish_round(round_id, round_t0, hashes_done, blocks_found, winner)
            else:
                for i in range(phase3_count):
                    if stop_flag and stop_flag():
                        break
                    nonce = (sweep_start + i) & 0xFFFFFFFF
                    header = _build_block_header(
                        version, prev_hex, merkle_root, current_time, bits_hex, nonce
                    )
                    h = _double_sha256(header)
                    hashes_done += 1
                    _supt_sample(round_id, nonce, h)
                    if on_hash:
                        on_hash(hashes_done)
                    if _hash_meets_target(h, target):
                        if on_log:
                            on_log(f"Phase 3: solution found (total {hashes_done} hashes).")
                        n_tx = 1 + len(tx_raws_for_block)
                        full_block = header + _varint(n_tx) + coinbase_for_block + b"".join(tx_raws_for_block)
                        result = submitblock(config, full_block.hex())
                        if result is None:
                            blocks_found = 1
                        elif on_log:
                            on_log(f"Submit block rejected: {result}")
                        return _supt_finish_round(round_id, round_t0, hashes_done, blocks_found, nonce)

        # Timestamp rolling: increment time to get a fresh nonce space
        current_time += 1
        if current_time > maxtime:
            extra_nonce_counter += 1
            if extra_nonce_counter > EXTRA_NONCE_ROLL_MAX:
                break
            extra_nonce_bytes = struct.pack("<I", extra_nonce_counter)
            _, coinbase_for_block, merkle_root = _rebuild_coinbase_and_merkle(extra_nonce_bytes)
            current_time = curtime
            if on_log:
                on_log(f"Extra-nonce roll #{extra_nonce_counter}, resetting timestamp.")

    if on_log:
        on_log(f"Round complete: {hashes_done} hashes, no solution.")
    return _supt_finish_round(round_id, round_t0, hashes_done, blocks_found)


MP_PROGRESS_INTERVAL = 2000
MP_FIRST_REPORT_HASHES = 500


def _mp_get_context():
    """Use forkserver on macOS to avoid broken-pipe errors.

    When Flask runs as a child of Node.js (via start-miner-server.js), the Python
    process inherits Node.js pipe FDs. The 'spawn' context sends Queue/Event FDs
    through a new pipe to each child, but those inherited FDs cause [Errno 32]
    Broken pipe immediately on p.start(). 'forkserver' pre-forks a clean helper
    process before any threads or extra FDs exist, so the FD set passed to workers
    is clean and the broken-pipe error does not occur.
    """
    if sys.platform == "darwin":
        return multiprocessing.get_context("forkserver")
    return multiprocessing.get_context()


def _mp_worker_mine_range(args: tuple) -> None:
    """Top-level worker for multiprocessing (must be picklable).
    When num_workers == 4, partition thesis candidates by quadrant (500D lattice).
    Each timestamp: thesis candidate scan first; optional Phase 3 linear sweep if env > 0.
    Base/recovery nonce are passed from main so workers do not load C libs.
    Workers return winning nonce only; main builds and submits full block.
    Force Python-only candidate list in workers to avoid loading libalgorithms in spawn.
    C hasher (libhasher_fast) IS loaded in workers for fast batch scanning.
    """
    os.environ["BTC_USE_C_NONCE"] = "0"
    os.environ["BTC_USE_C_CANDIDATES"] = "0"
    (
        worker_id,
        chunk_size,
        num_workers,
        progress_interval,
        stop_event,
        result_queue,
        shared_hashes,
        mining_address,
        version,
        prev_hex,
        bits_hex,
        height,
        curtime,
        maxtime,
        merkle_root,
        target,
        base_nonce,
        recovery_nonce,
        round_id,
        phase3_count,
    ) = args
    use_quadrant = num_workers == 4
    if use_quadrant:
        start_n = 0
        end_n = 0xFFFFFFFF + 1
        cands = build_candidate_list(
            base_nonce, recovery_nonce, start_n, end_n, quadrant_id=worker_id, block_height=height
        )
    else:
        start_n = worker_id * chunk_size
        end_n = (
            (worker_id + 1) * chunk_size
            if worker_id < num_workers - 1
            else 0xFFFFFFFF + 1
        )
        cands = build_candidate_list(
            base_nonce, recovery_nonce, start_n, end_n, block_height=height
        )
    h_done = 0
    last_reported = 0
    use_c = _c_hasher_available()
    p3_count = max(0, int(phase3_count))

    def _report_progress(force: bool = False) -> None:
        nonlocal last_reported
        if shared_hashes is None:
            return
        report_now = force or (
            (h_done - last_reported >= progress_interval)
            or (last_reported == 0 and h_done >= MP_FIRST_REPORT_HASHES)
        )
        if report_now and h_done > last_reported:
            with shared_hashes.get_lock():
                shared_hashes.value += h_done - last_reported
            last_reported = h_done

    current_time = curtime
    while current_time <= maxtime:
        if stop_event.is_set():
            _report_progress(force=True)
            result_queue.put((h_done, 0, None, curtime))
            return

        hdr_tpl = _build_header_template(version, prev_hex, merkle_root, current_time, bits_hex)
        if use_c and cands:
            hit = _c_scan_list(hdr_tpl, target, cands)
            h_done += len(cands)
            _supt_sample_candidates_for_stream_a(
                round_id,
                version,
                prev_hex,
                merkle_root,
                current_time,
                bits_hex,
                cands,
                from_worker=True,
            )
            _report_progress()
            if hit is not None:
                winning_nonce, _idx = hit
                _report_progress(force=True)
                result_queue.put((h_done, 1, winning_nonce, current_time))
                return
        else:
            for n in cands:
                if stop_event.is_set():
                    _report_progress(force=True)
                    result_queue.put((h_done, 0, None, curtime))
                    return
                header = _build_block_header(
                    version, prev_hex, merkle_root, current_time, bits_hex, n
                )
                h = _double_sha256(header)
                h_done += 1
                _supt_sample(round_id, n, h, from_worker=True)
                _report_progress()
                if _hash_meets_target(h, target):
                    _report_progress(force=True)
                    result_queue.put((h_done, 1, n, current_time))
                    return

        if p3_count > 0:
            sweep_start = ((base_nonce + worker_id * p3_count) & 0xFFFFFFFF)
            hdr_tpl = _build_header_template(version, prev_hex, merkle_root, current_time, bits_hex)
            if use_c:
                remaining = p3_count
                offset = 0
                while remaining > 0:
                    if stop_event.is_set():
                        _report_progress(force=True)
                        result_queue.put((h_done, 0, None, current_time))
                        return
                    chunk = min(remaining, C_SCAN_CHUNK)
                    s = (sweep_start + offset) & 0xFFFFFFFF
                    winner = _c_scan_batch(hdr_tpl, target, s, chunk)
                    h_done += chunk
                    offset += chunk
                    remaining -= chunk
                    _report_progress()
                    if winner is not None:
                        _report_progress(force=True)
                        result_queue.put((h_done, 1, winner, current_time))
                        return
            else:
                for i in range(p3_count):
                    if stop_event.is_set():
                        _report_progress(force=True)
                        result_queue.put((h_done, 0, None, current_time))
                        return
                    nonce = (sweep_start + i) & 0xFFFFFFFF
                    header = _build_block_header(
                        version, prev_hex, merkle_root, current_time, bits_hex, nonce
                    )
                    h = _double_sha256(header)
                    h_done += 1
                    _supt_sample(round_id, nonce, h, from_worker=True)
                    _report_progress()
                    if _hash_meets_target(h, target):
                        _report_progress(force=True)
                        result_queue.put((h_done, 1, nonce, current_time))
                        return

        current_time += 1

    _report_progress(force=True)
    result_queue.put((h_done, 0, None, curtime))


def _run_mining_loop_unified_mp(
    config: MinerConfig,
    template: dict,
    version: int,
    prev_hex: str,
    bits_hex: str,
    height: int,
    curtime: int,
    coinbase_aux: dict,
    transactions: list,
    witness_commitment: Optional[str],
    target: int,
    difficulty_bits: int,
    bits_bytes: bytes,
    coinbase_for_block: bytes,
    tx_raws_for_block: list,
    merkle_root: bytes,
    on_hash: Optional[Callable[[int], None]],
    stop_flag: Optional[Callable[[], bool]],
    on_log: Optional[Callable[[str], None]] = None,
    round_id: int = -1,
    round_t0: Optional[float] = None,
) -> tuple[int, int]:
    """Multiprocessing variant: thesis candidate workers; optional Phase 3 linear sweep (env)."""
    if round_t0 is None:
        round_t0 = time.time()
    minimal_nonces = get_minimal_nonce_list(height, difficulty_bits, bits_bytes)
    phase1_hashes = 0
    if config.single_nonce_only:
        if on_log:
            on_log(f"Single-nonce mode: trying {len(minimal_nonces)} minimal nonce(s).")
        for nonce in minimal_nonces:
            if stop_flag and stop_flag():
                return phase1_hashes, 0
            header = _build_block_header(
                version, prev_hex, merkle_root, curtime, bits_hex, nonce
            )
            h = _double_sha256(header)
            phase1_hashes += 1
            _supt_sample(round_id, nonce, h)
            if on_hash:
                on_hash(phase1_hashes)
            if _hash_meets_target(h, target):
                if on_log:
                    on_log(f"Solution found in minimal set ({phase1_hashes} hash(es)).")
                n_tx = 1 + len(tx_raws_for_block)
                full_block = header + _varint(n_tx) + coinbase_for_block + b"".join(tx_raws_for_block)
                result = submitblock(config, full_block.hex())
                if result is None:
                    return _supt_finish_round(round_id, round_t0, phase1_hashes, 1, nonce)
                if on_log:
                    on_log(f"Submit block rejected: {result}")
                return _supt_finish_round(round_id, round_t0, phase1_hashes, 0, nonce)
        if on_log:
            on_log(f"Single-nonce mode: {phase1_hashes} hash(es), no solution.")
        return _supt_finish_round(round_id, round_t0, phase1_hashes, 0)

    if on_log:
        on_log(
            f"Thesis pipeline (MP): anchors {len(minimal_nonces)}; full candidate search per worker; "
            f"optional linear sweep only if BTC_PHASE3_NONCES_PER_WORKER>0."
        )
    num_workers = min(config.num_workers, 0x100)
    base_nonce = nonce_generate_unified_py(height, difficulty_bits)
    recovery_nonce = recovery_suggested_nonce(bits_bytes)
    if recovery_nonce is None:
        recovery_nonce = base_nonce
    phase2_candidates = build_candidate_list(
        base_nonce, recovery_nonce, 0, 0xFFFFFFFF + 1, block_height=height
    )
    log_nonce_round(
        height, bits_hex, base_nonce, recovery_nonce,
        minimal_nonces, len(phase2_candidates), phase2_candidates,
        base_nonce_source=get_base_nonce_source(),
        seed_prime_path=get_last_seed_prime_path(),
    )
    if on_log:
        on_log(
            f"Thesis: base={get_base_nonce_source()} seed={get_last_seed_prime_path() or 'n/a'} candidates={len(phase2_candidates)}"
        )
        use_quadrant = num_workers == 4
        per_worker = (
            [len([n for n in phase2_candidates if quadrant_from_nonce(n) == i]) for i in range(num_workers)]
            if use_quadrant
            else []
        )
        if per_worker:
            on_log(f"Phase 2: spawning {num_workers} workers (total candidates: {len(phase2_candidates)}, per worker: {per_worker}).")
        else:
            on_log(f"Phase 2: spawning {num_workers} workers (total candidates: {len(phase2_candidates)}).")
    chunk_size = (0xFFFFFFFF + 1) // num_workers
    maxtime = template.get("maxtime", curtime + TIMESTAMP_ROLL_MAX)
    # Scale progress interval with workers to reduce lock contention (M2: 8 workers)
    progress_interval = max(MP_PROGRESS_INTERVAL, 500 * num_workers)
    ctx = _mp_get_context()
    stop_event = ctx.Event()
    result_queue = ctx.Queue()
    shared_hashes = ctx.Value("Q", 0)
    mining_address = config.mining_address or ""
    worker_args = (
        chunk_size,
        num_workers,
        progress_interval,
        stop_event,
        result_queue,
        shared_hashes,
        mining_address,
        version,
        prev_hex,
        bits_hex,
        height,
        curtime,
        maxtime,
        merkle_root,
        target,
        base_nonce,
        recovery_nonce,
        round_id,
        effective_phase3_count(config),
    )

    procs = []
    for i in range(num_workers):
        args = (i,) + worker_args
        p = ctx.Process(target=_mp_worker_mine_range, args=(args,))
        p.start()
        procs.append(p)

    total_hashes = 0
    blocks_found = 0
    winning_nonce: Optional[int] = None
    winning_time: int = curtime
    finished = 0
    while finished < num_workers:
        try:
            h_done, bf, bh, btime = result_queue.get(timeout=0.25)
            total_hashes += h_done
            if bf and bh is not None:
                if on_log:
                    on_log(f"Block found by worker (total {phase1_hashes + h_done} hashes).")
                blocks_found = 1
                winning_nonce = bh
                winning_time = btime
                break
            finished += 1
        except multiprocessing.queues.Empty:
            if stop_flag and stop_flag():
                break
            if _round_duration_exceeded(round_t0):
                if on_log:
                    on_log(f"Auto round restart ({get_auto_round_restart_sec()}s elapsed).")
                break
            live_total = shared_hashes.value
            if on_hash and (phase1_hashes > 0 or live_total > 0):
                on_hash(phase1_hashes + live_total)
            continue

    stop_event.set()
    for p in procs:
        p.join(timeout=2.0)
        if p.is_alive():
            p.terminate()
            p.join(timeout=1.0)
        if p.is_alive():
            p.kill()
            p.join(timeout=0.5)

    if not blocks_found and on_log:
        on_log(f"Workers finished (total {total_hashes + phase1_hashes} hashes), no solution.")

    if blocks_found and winning_nonce is not None:
        header = _build_block_header(
            version, prev_hex, merkle_root, winning_time, bits_hex, winning_nonce
        )
        n_tx = 1 + len(tx_raws_for_block)
        full_block = header + _varint(n_tx) + coinbase_for_block + b"".join(tx_raws_for_block)
        result = submitblock(config, full_block.hex())
        if result is not None:
            if on_log:
                on_log(f"Submit block rejected: {result}")
            blocks_found = 0

    total_hashes += phase1_hashes
    if on_hash:
        on_hash(total_hashes)
    return _supt_finish_round(
        round_id,
        round_t0,
        total_hashes,
        blocks_found,
        winning_nonce,
    )


# Report stats every N hashes or at least every 0.5s so UI shows nonce search / hashing quickly.
HASH_REPORT_INTERVAL = 100

# Minimum seconds between stats updates to avoid flooding.
HASH_REPORT_MIN_INTERVAL_SEC = 0.5


def run_loop_forever(
    config: MinerConfig,
    on_stats: Optional[Callable[[int, int, float], None]] = None,
    stop_flag: Optional[Callable[[], bool]] = None,
    on_block_found: Optional[Callable[[], None]] = None,
    on_log: Optional[Callable[[str], None]] = None,
) -> None:
    """Repeatedly get template and run mining loop; report stats."""
    total_hashes = 0
    total_blocks = 0
    start = time.time()
    _last_stats_time = [0.0]
    _last_reported_hashes = [0]
    _rpc_error_logged = [False]

    supt_streams.set_active_search_mode(config.search_mode)
    mode_tag = config.search_mode

    def _prefixed_log(msg: str) -> None:
        if not on_log:
            return
        if msg.startswith("["):
            on_log(msg)
        else:
            on_log(f"[{mode_tag}] {msg}")

    def _on_hash(hashes_done_this_round: int) -> None:
        if not on_stats or hashes_done_this_round <= 0:
            return
        now = time.time()
        total = total_hashes + hashes_done_this_round
        # Report so UI shows hashes/nonce quickly: every HASH_REPORT_INTERVAL hashes, or every 0.5s, or any small count (Phase 1)
        interval_ok = hashes_done_this_round % HASH_REPORT_INTERVAL == 0
        time_ok = now - _last_stats_time[0] >= HASH_REPORT_MIN_INTERVAL_SEC
        small_count_ok = hashes_done_this_round <= 10
        if not (interval_ok or time_ok or small_count_ok):
            return
        _last_stats_time[0] = now
        _last_reported_hashes[0] = total
        elapsed = time.time() - start
        if elapsed > 0:
            on_stats(total, total_blocks, total / elapsed)

    if config.search_mode == SEARCH_MODE_LINEAR:
        mining_loop = run_mining_loop
    else:
        mining_loop = run_mining_loop_unified
    while stop_flag is None or not stop_flag():
        try:
            if on_log:
                _prefixed_log("New round: fetching template and mining.")
            hashes, blocks = mining_loop(
                config, on_hash=_on_hash, stop_flag=stop_flag, on_log=_prefixed_log if on_log else None
            )
            total_hashes += hashes
            total_blocks += blocks
            elapsed = time.time() - start
            if on_stats and elapsed > 0:
                on_stats(total_hashes, total_blocks, total_hashes / elapsed)
            if blocks > 0:
                if on_log:
                    _prefixed_log(f"Round complete: {hashes} hashes this round, block found! Continuing to mine.")
                if on_block_found:
                    on_block_found()
                _rpc_error_logged[0] = False
            if on_log:
                _prefixed_log(f"Round complete: {hashes} hashes, no block; fetching next template.")
        except BitcoinRPCError as e:
            if on_log:
                if not _rpc_error_logged[0]:
                    _rpc_error_logged[0] = True
                    _prefixed_log(f"RPC error: {e}. RPC URL: {config.rpc_url} — check host/port/network and auth. Retrying in 5s.")
                else:
                    _prefixed_log(f"RPC error: {e}. Is Bitcoin Core running and RPC correct? Retrying in 5s.")
            if config.verbose:
                print(f"RPC error: {e}")
            time.sleep(5)
        except Exception as e:
            if on_log:
                _prefixed_log(f"Non-RPC error: {e}. Retrying in 10s.")
            if config.verbose:
                print(f"Non-RPC error: {e}")
            time.sleep(10)


def run_search_mode_benchmark(config: MinerConfig, rounds: int = 3) -> dict[str, Any]:
    """Run N mining rounds in config.search_mode; return hashrate and round totals."""
    supt_streams.set_active_search_mode(config.search_mode)
    loop_fn = run_mining_loop if config.search_mode == SEARCH_MODE_LINEAR else run_mining_loop_unified
    total_hashes = 0
    total_blocks = 0
    t0 = time.time()
    errors: list[str] = []
    n_rounds = max(1, min(10, int(rounds)))
    for i in range(n_rounds):
        try:
            h, b = loop_fn(config)
            total_hashes += h
            total_blocks += b
        except Exception as e:
            errors.append(f"round {i + 1}: {e}")
    elapsed = max(time.time() - t0, 1e-6)
    return {
        "ok": len(errors) == 0,
        "search_mode": config.search_mode,
        "rounds": n_rounds,
        "total_hashes": total_hashes,
        "total_blocks": total_blocks,
        "hashrate": round(total_hashes / elapsed, 2),
        "elapsed_sec": round(elapsed, 2),
        "errors": errors or None,
    }