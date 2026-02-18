"""
Build block from getblocktemplate, nonce iteration, difficulty check, submitblock.
On Apple Silicon (M2 Mac Mini), uses spawn context and scaled progress interval.

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

from config import MinerConfig, phase3_nonces_per_worker
from btc_rpc import getblocktemplate, submitblock, BitcoinRPCError
from address import address_to_script_pubkey
from nonce_logger import log_nonce_round
from thesis_mining import (
    bits_compact_to_difficulty_bits,
    nonce_generate_unified_py,
    recovery_suggested_nonce,
    build_candidate_list,
    get_minimal_nonce_list,
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
        if data_hex:
            tx_raw = bytes.fromhex(data_hex)
            tx_hashes.append(_double_sha256(tx_raw))
            tx_raws_for_block.append(tx_raw)

    merkle_root = _merkle_root(tx_hashes)
    blocks_found = 0
    hashes_done = 0
    # Full 32-bit nonce space per Bitcoin protocol; do not reduce (thesis ch.15: unbiased search).
    nonce_start = 0
    nonce_end = 0xFFFFFFFF
    bits_le = struct.pack("<I", int(bits_hex, 16))

    if on_log:
        on_log(f"Template: height {height}, bits {bits_hex}")
        on_log("Linear search: full 32-bit nonce range.")

    for nonce in range(nonce_start, nonce_end):
        if stop_flag and stop_flag():
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
        if on_hash:
            on_hash(hashes_done)
        if _hash_meets_target(h, target):
            if on_log:
                on_log(f"Solution found ({hashes_done} hashes).")
            # Bitcoin block format: 80-byte header + varint(tx_count) + coinbase + other txs
            n_tx = 1 + len(tx_raws_for_block)
            full_block = header + _varint(n_tx) + coinbase_for_block + b"".join(tx_raws_for_block)
            hex_block = full_block.hex()
            result = submitblock(config, hex_block)
            if result is None:
                blocks_found += 1
            elif on_log:
                on_log(f"Submit block rejected: {result}")
            break
    return hashes_done, blocks_found


def run_mining_loop_unified(
    config: MinerConfig,
    on_hash: Optional[Callable[[int], None]] = None,
    stop_flag: Optional[Callable[[], bool]] = None,
    on_log: Optional[Callable[[str], None]] = None,
) -> tuple[int, int]:
    """
    Unified mining: deterministic base nonce, recovery, sphere hopping, duality ordering.
    Phase 1 minimal nonces, then Phase 2 thesis candidates only; no linear fallback.
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

    # Pre-hash transaction data (unchanged across timestamp/extra-nonce rolls)
    tx_raws_for_block: list[bytes] = []
    tx_hashes_no_coinbase: list[bytes] = []
    for tx in transactions:
        data_hex = tx.get("data")
        if data_hex:
            tx_raw = bytes.fromhex(data_hex)
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
        on_log(f"Template: height {height}, bits {bits_hex}")

    # Phase 1: single-nonce-first (1-2 hashes from entropy-reduced minimal set)
    minimal_nonces = get_minimal_nonce_list(height, difficulty_bits, bits_bytes)
    if on_log:
        on_log(f"Phase 1: trying {len(minimal_nonces)} minimal nonce(s).")
    for nonce in minimal_nonces:
        if stop_flag and stop_flag():
            break
        header = _build_block_header(
            version, prev_hex, merkle_root, curtime, bits_hex, nonce
        )
        h = _double_sha256(header)
        hashes_done += 1
        if on_hash:
            on_hash(hashes_done)
        if _hash_meets_target(h, target):
            if on_log:
                on_log(f"Phase 1: solution found ({hashes_done} hash(es)).")
            n_tx = 1 + len(tx_raws_for_block)
            full_block = header + _varint(n_tx) + coinbase_for_block + b"".join(tx_raws_for_block)
            result = submitblock(config, full_block.hex())
            if result is None:
                blocks_found = 1
            elif on_log:
                on_log(f"Submit block rejected: {result}")
            return hashes_done, blocks_found
    if on_log:
        on_log(f"Phase 1: {hashes_done} hash(es), no solution.")
    if config.single_nonce_only:
        return hashes_done, blocks_found

    base_nonce = nonce_generate_unified_py(height, difficulty_bits)
    recovery_nonce = recovery_suggested_nonce(bits_bytes)
    if recovery_nonce is None:
        recovery_nonce = base_nonce

    candidates = build_candidate_list(
        base_nonce, recovery_nonce, 0, NONCE_SPACE
    )
    log_nonce_round(
        height, bits_hex, base_nonce, recovery_nonce,
        minimal_nonces, len(candidates), candidates,
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
        )

    # Single-worker: Phase 2 + Phase 3 with timestamp rolling
    phase3_count = phase3_nonces_per_worker()
    current_time = curtime
    extra_nonce_counter = 0

    while True:
        if stop_flag and stop_flag():
            break

        # Phase 2: thesis candidates
        if on_log and current_time == curtime:
            on_log("Phase 2: searching thesis candidates.")
        for nonce in candidates:
            if stop_flag and stop_flag():
                break
            header = _build_block_header(
                version, prev_hex, merkle_root, current_time, bits_hex, nonce
            )
            h = _double_sha256(header)
            hashes_done += 1
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
                return hashes_done, blocks_found

        # Phase 3: linear sweep
        if phase3_count > 0:
            if on_log and current_time == curtime:
                on_log(f"Phase 3: linear sweep ({phase3_count} nonces).")
            sweep_start = (base_nonce + extra_nonce_counter * phase3_count) & 0xFFFFFFFF
            for i in range(phase3_count):
                if stop_flag and stop_flag():
                    break
                nonce = (sweep_start + i) & 0xFFFFFFFF
                header = _build_block_header(
                    version, prev_hex, merkle_root, current_time, bits_hex, nonce
                )
                h = _double_sha256(header)
                hashes_done += 1
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
                    return hashes_done, blocks_found

        # Timestamp rolling: increment time to get a fresh nonce space
        current_time += 1
        if current_time > maxtime:
            # Extra-nonce rolling: change coinbase to get a new merkle root
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
    return hashes_done, blocks_found


MP_PROGRESS_INTERVAL = 2000
MP_FIRST_REPORT_HASHES = 500


def _mp_get_context():
    """Use spawn on macOS (Apple Silicon) for reliable multiprocessing; fork elsewhere."""
    if sys.platform == "darwin":
        return multiprocessing.get_context("spawn")
    return multiprocessing.get_context()


def _mp_worker_mine_range(args: tuple) -> None:
    """Top-level worker for multiprocessing (must be picklable).
    When num_workers == 4, partition thesis candidates by quadrant (500D lattice).
    Phase 2: thesis candidates. Phase 3: linear sweep with timestamp rolling.
    Base/recovery nonce are passed from main so workers do not load C libs.
    Workers return winning nonce only; main builds and submits full block.
    Force Python-only candidate list in workers to avoid loading libalgorithms in spawn.
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
    ) = args
    use_quadrant = num_workers == 4
    if use_quadrant:
        start_n = 0
        end_n = 0xFFFFFFFF + 1
    else:
        start_n = worker_id * chunk_size
        end_n = (
            (worker_id + 1) * chunk_size
            if worker_id < num_workers - 1
            else 0xFFFFFFFF + 1
        )
    cands = build_candidate_list(base_nonce, recovery_nonce, start_n, end_n)
    if use_quadrant:
        cands = [n for n in cands if quadrant_from_nonce(n) == worker_id]
    h_done = 0
    last_reported = 0

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

    # Phase 2: thesis candidates (first timestamp only)
    for n in cands:
        if stop_event.is_set():
            _report_progress(force=True)
            result_queue.put((h_done, 0, None))
            return
        header = _build_block_header(
            version, prev_hex, merkle_root, curtime, bits_hex, n
        )
        h = _double_sha256(header)
        h_done += 1
        _report_progress()
        if _hash_meets_target(h, target):
            _report_progress(force=True)
            result_queue.put((h_done, 1, n))
            return

    # Phase 3: linear sweep with timestamp rolling
    p3_count = phase3_nonces_per_worker()
    current_time = curtime
    while True:
        if stop_event.is_set():
            break
        if p3_count > 0:
            sweep_start = ((base_nonce + worker_id * p3_count) & 0xFFFFFFFF)
            for i in range(p3_count):
                if stop_event.is_set():
                    _report_progress(force=True)
                    result_queue.put((h_done, 0, None))
                    return
                nonce = (sweep_start + i) & 0xFFFFFFFF
                header = _build_block_header(
                    version, prev_hex, merkle_root, current_time, bits_hex, nonce
                )
                h = _double_sha256(header)
                h_done += 1
                _report_progress()
                if _hash_meets_target(h, target):
                    _report_progress(force=True)
                    result_queue.put((h_done, 1, nonce))
                    return
        current_time += 1
        if current_time > maxtime:
            break

    _report_progress(force=True)
    result_queue.put((h_done, 0, None))


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
) -> tuple[int, int]:
    """Multiprocessing variant: Phase 1 minimal nonces, then spawn workers for Phase 2."""
    # Phase 1: try minimal nonce set (1–2 hashes) before spawning workers
    minimal_nonces = get_minimal_nonce_list(height, difficulty_bits, bits_bytes)
    if on_log:
        on_log(f"Phase 1: trying {len(minimal_nonces)} minimal nonce(s).")
    phase1_hashes = 0
    for nonce in minimal_nonces:
        if stop_flag and stop_flag():
            return phase1_hashes, 0
        header = _build_block_header(
            version, prev_hex, merkle_root, curtime, bits_hex, nonce
        )
        h = _double_sha256(header)
        phase1_hashes += 1
        if on_hash:
            on_hash(phase1_hashes)
        if _hash_meets_target(h, target):
            if on_log:
                on_log(f"Phase 1: solution found ({phase1_hashes} hash(es)).")
            n_tx = 1 + len(tx_raws_for_block)
            full_block = header + _varint(n_tx) + coinbase_for_block + b"".join(tx_raws_for_block)
            result = submitblock(config, full_block.hex())
            if result is None:
                return phase1_hashes, 1
            if on_log:
                on_log(f"Submit block rejected: {result}")
            return phase1_hashes, 0
    if on_log:
        on_log(f"Phase 1: {phase1_hashes} hash(es), no solution.")
    if config.single_nonce_only:
        return phase1_hashes, 0

    if on_log:
        on_log("Phase 2+3: searching thesis candidates then linear sweep.")
    num_workers = min(config.num_workers, 0x100)
    base_nonce = nonce_generate_unified_py(height, difficulty_bits)
    recovery_nonce = recovery_suggested_nonce(bits_bytes)
    if recovery_nonce is None:
        recovery_nonce = base_nonce
    phase2_candidates = build_candidate_list(
        base_nonce, recovery_nonce, 0, 0xFFFFFFFF + 1
    )
    log_nonce_round(
        height, bits_hex, base_nonce, recovery_nonce,
        minimal_nonces, len(phase2_candidates), phase2_candidates,
    )
    if on_log:
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
    finished = 0
    while finished < num_workers:
        try:
            h_done, bf, bh = result_queue.get(timeout=0.25)
            total_hashes += h_done
            if bf and bh is not None:
                if on_log:
                    on_log(f"Block found by worker (total {phase1_hashes + h_done} hashes).")
                blocks_found = 1
                winning_nonce = bh
                break
            finished += 1
        except multiprocessing.queues.Empty:
            if stop_flag and stop_flag():
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
            version, prev_hex, merkle_root, curtime, bits_hex, winning_nonce
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
    return total_hashes, blocks_found


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

    mining_loop = run_mining_loop_unified if config.use_unified else run_mining_loop
    while stop_flag is None or not stop_flag():
        try:
            if on_log:
                on_log("New round: fetching template and mining.")
            hashes, blocks = mining_loop(
                config, on_hash=_on_hash, stop_flag=stop_flag, on_log=on_log
            )
            total_hashes += hashes
            total_blocks += blocks
            elapsed = time.time() - start
            if on_stats and elapsed > 0:
                on_stats(total_hashes, total_blocks, total_hashes / elapsed)
            if blocks > 0:
                if on_log:
                    on_log(f"Round complete: {hashes} hashes this round, block found! Continuing to mine.")
                if on_block_found:
                    on_block_found()
                _rpc_error_logged[0] = False
            if on_log:
                on_log(f"Round complete: {hashes} hashes, no block; fetching next template.")
        except BitcoinRPCError as e:
            if on_log:
                if not _rpc_error_logged[0]:
                    _rpc_error_logged[0] = True
                    on_log(f"RPC error: {e}. RPC URL: {config.rpc_url} — check host/port/network and auth. Retrying in 5s.")
                else:
                    on_log(f"RPC error: {e}. Is Bitcoin Core running and RPC correct? Retrying in 5s.")
            if config.verbose:
                print(f"RPC error: {e}")
            time.sleep(5)
        except Exception as e:
            if on_log:
                on_log(f"Non-RPC error: {e}. Retrying in 10s.")
            if config.verbose:
                print(f"Non-RPC error: {e}")
            time.sleep(10)