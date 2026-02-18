"""
Minimal address decoder: base58check (p2pkh/p2sh) and bech32 (bc1/bcrt1).
Returns scriptPubKey bytes for use in coinbase.
"""
import hashlib
from typing import Tuple


BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _b58_decode(s: str) -> bytes:
    n = 0
    for c in s:
        n = n * 58 + BASE58_ALPHABET.index(c)
    b = n.to_bytes((n.bit_length() + 7) // 8 or 1, "big")
    pad = 0
    for c in s:
        if c != "1":
            break
        pad += 1
    return bytes(pad) + b


def _hash256(b: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(b).digest()).digest()


def decode_base58check(addr: str) -> Tuple[int, bytes]:
    """Decode base58check; returns (version_byte, payload)."""
    raw = _b58_decode(addr)
    if len(raw) < 5:
        raise ValueError("address too short")
    payload, checksum = raw[:-4], raw[-4:]
    if _hash256(payload)[:4] != checksum:
        raise ValueError("invalid checksum")
    return payload[0], payload[1:]


def _bech32_polymod(values: list) -> int:
    """BIP 173 polymod (sipa/bech32 ref): top = chk>>25; chk = (chk&0x1ffffff)<<5 ^ v; chk ^= GEN[i] for each bit i of top."""
    GEN = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for v in values:
        top = chk >> 25
        chk = ((chk & 0x1FFFFFF) << 5) ^ v
        for i in range(5):
            chk ^= GEN[i] if ((top >> i) & 1) else 0
    return chk


def _bech32_hrp_expand(hrp: str) -> list:
    return [ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp]


def _bech32_verify_checksum(hrp: str, data: list) -> bool:
    return _bech32_polymod(_bech32_hrp_expand(hrp) + data) == 1


def _bech32_convert_bits(data: list, from_bits: int, to_bits: int, pad: bool) -> list:
    acc, bits, out = 0, 0, []
    maxv = (1 << to_bits) - 1
    for d in data:
        acc = (acc << from_bits) | d
        bits += from_bits
        while bits >= to_bits:
            bits -= to_bits
            out.append((acc >> bits) & maxv)
    if pad and bits:
        out.append((acc << (to_bits - bits)) & maxv)
    return out


# BIP 173 Bech32 data-part charset (order matters for checksum)
BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def decode_bech32(addr: str) -> Tuple[str, int, bytes]:
    """Decode bech32/bcrt1; returns (hrp, witness_version, witness_program)."""
    addr = addr.lower()
    if "1" not in addr:
        raise ValueError("no separator")
    # BIP 173: HRP must not contain '1'; separator is the first '1'.
    sep = addr.index("1")
    hrp, data_part = addr[:sep], addr[sep + 1 :]
    if len(hrp) < 1 or len(hrp) > 83:
        raise ValueError("bad hrp")
    data = []
    for i, c in enumerate(data_part):
        try:
            d = BECH32_CHARSET.index(c)
        except ValueError:
            if c == "1":
                raise ValueError(
                    f"invalid character '1' at position {i+1} in Bech32 data "
                    "(use letter 'l' not digit '1')"
                )
            if c in ("O", "o"):
                raise ValueError(
                    f"invalid character '{c}' at position {i+1} in Bech32 data "
                    "(use digit '0' not letter 'O')"
                )
            raise ValueError(
                f"invalid character '{c}' (ord={ord(c)}) at position {i+1} in Bech32 address; "
                "valid chars: qpzry9x8gf2tvdw0s3jn54khce6mua7l"
            )
        data.append(d)
    if not _bech32_verify_checksum(hrp, data):
        raise ValueError(
            "invalid bech32 checksum (check for digit '1' vs letter 'l', or '0' vs 'O')"
        )
    # data is [version (1)] + payload_5bit + checksum (6); exclude checksum for witness program
    decoded = _bech32_convert_bits(data[1:-6], 5, 8, False)
    if decoded is None or len(decoded) < 2 or len(decoded) > 40:
        raise ValueError("bad witness program length")
    return hrp, data[0], bytes(decoded)


def address_to_script_pubkey(addr: str) -> bytes:
    """
    Convert Bitcoin address to scriptPubKey.
    Supports p2pkh (1...), p2sh (3...), p2wpkh (bc1..., bcrt1...).
    """
    addr = addr.strip()
    # Remove common accidental chars (periods, spaces) - not valid in any Bitcoin address
    addr = addr.replace(".", "").replace(" ", "")
    if addr.startswith("bc1") or addr.startswith("bcrt1") or addr.startswith("tb1"):
        hrp, ver, prog = decode_bech32(addr)
        if ver != 0:
            raise ValueError("only witness v0 supported")
        if len(prog) == 20:
            return bytes([0x00, 0x14]) + prog  # OP_0 push(20)
        if len(prog) == 32:
            return bytes([0x00, 0x20]) + prog  # OP_0 push(32)
        raise ValueError("unsupported witness program length")
    if addr[0] in ("1", "3", "2", "m", "n"):
        ver, payload = decode_base58check(addr)
        if ver == 0 and len(payload) == 20:
            return bytes([0x76, 0xA9, 0x14]) + payload + bytes([0x88, 0xAC])  # p2pkh
        if ver == 5 and len(payload) == 20:
            return bytes([0xA9, 0x14]) + payload + bytes([0x87])  # p2sh
        raise ValueError("unsupported legacy address type")
    raise ValueError("unknown address format")


if __name__ == "__main__":
    # BIP 173 test vector: valid Bech32 p2wpkh address
    BIP173_EXAMPLE = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
    hrp, ver, prog = decode_bech32(BIP173_EXAMPLE)
    assert hrp == "bc" and ver == 0 and len(prog) == 20, "BIP 173 decode failed"
    script = address_to_script_pubkey(BIP173_EXAMPLE)
    assert len(script) == 22 and script[0] == 0x00 and script[1] == 0x14, "BIP 173 scriptPubKey failed"
    print("BIP 173 test vector OK")
