"""
Bridge to libhasher_fast — ARM SHA-256 accelerated batch nonce scanning.

Provides scan_batch() and scan_list() that use the C library when available,
falling back to pure-Python hashing otherwise.  Follows the same load/probe
pattern as thesis_mining._load_libnonce.
"""
from __future__ import annotations

import hashlib
import os
import struct
from ctypes import CDLL, POINTER, byref, c_int, c_uint8, c_uint32
from typing import Optional

from config import use_c_hasher

_lib: Optional[CDLL | bool] = None
_hasher_source: str = "python"

_UINT8_80 = c_uint8 * 80
_UINT8_32 = c_uint8 * 32


def _find_lib_path() -> Optional[str]:
    here = os.path.dirname(os.path.abspath(__file__))
    for name in ("libhasher_fast.dylib", "libhasher_fast.so"):
        path = os.path.join(here, name)
        if os.path.isfile(path):
            return path
    return None


def _load_lib() -> bool:
    global _lib, _hasher_source
    if _lib is not None:
        return _lib is not False

    if not use_c_hasher():
        _lib = False
        return False

    path = _find_lib_path()
    if not path:
        _lib = False
        return False

    try:
        lib = CDLL(path)
    except OSError:
        _lib = False
        return False

    if not hasattr(lib, "hasher_fast_probe") or lib.hasher_fast_probe() != 1:
        _lib = False
        return False

    lib.scan_nonces_batch.argtypes = [
        POINTER(c_uint8),  # header_template[80]
        POINTER(c_uint8),  # target[32]
        c_uint32,          # start_nonce
        c_uint32,          # count
        POINTER(c_uint32), # winning_nonce
    ]
    lib.scan_nonces_batch.restype = c_int

    lib.scan_nonces_list.argtypes = [
        POINTER(c_uint8),  # header_template[80]
        POINTER(c_uint8),  # target[32]
        POINTER(c_uint32), # nonce_list
        c_uint32,          # list_len
        POINTER(c_uint32), # winning_nonce
    ]
    lib.scan_nonces_list.restype = c_int

    lib.double_sha256.argtypes = [POINTER(c_uint8), POINTER(c_uint8)]
    lib.double_sha256.restype = None

    _lib = lib
    _hasher_source = "c_arm_sha256"
    return True


def is_available() -> bool:
    return _load_lib()


def get_hasher_source() -> str:
    return _hasher_source


def _target_int_to_bytes(target: int) -> bytes:
    return target.to_bytes(32, "little")


def scan_batch(
    header_template: bytes,
    target: int,
    start_nonce: int,
    count: int,
) -> Optional[int]:
    """
    Scan nonces [start_nonce, start_nonce+count) for a winning hash.
    header_template: 80 bytes with nonce at bytes 76-79 (will be overwritten).
    Returns winning nonce or None.
    """
    if _load_lib() and _lib is not False:
        c_hdr = _UINT8_80(*header_template)
        c_tgt = _UINT8_32(*_target_int_to_bytes(target))
        c_win = c_uint32(0)
        found = _lib.scan_nonces_batch(
            c_hdr, c_tgt,
            c_uint32(start_nonce & 0xFFFFFFFF),
            c_uint32(count & 0xFFFFFFFF),
            byref(c_win),
        )
        if found:
            return int(c_win.value)
        return None

    return _scan_batch_py(header_template, target, start_nonce, count)


def scan_list(
    header_template: bytes,
    target: int,
    nonce_list: list[int],
) -> Optional[tuple[int, int]]:
    """
    Scan a list of specific nonces for a winning hash.
    Returns (winning_nonce, index_in_list) or None.
    """
    if not nonce_list:
        return None

    if _load_lib() and _lib is not False:
        c_hdr = _UINT8_80(*header_template)
        c_tgt = _UINT8_32(*_target_int_to_bytes(target))
        arr_type = c_uint32 * len(nonce_list)
        c_list = arr_type(*(n & 0xFFFFFFFF for n in nonce_list))
        c_win = c_uint32(0)
        found = _lib.scan_nonces_list(
            c_hdr, c_tgt, c_list,
            c_uint32(len(nonce_list)),
            byref(c_win),
        )
        if found:
            winning = int(c_win.value)
            try:
                idx = nonce_list.index(winning)
            except ValueError:
                idx = 0
            return (winning, idx)
        return None

    return _scan_list_py(header_template, target, nonce_list)


def _double_sha256_py(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def _scan_batch_py(
    header_template: bytes,
    target: int,
    start_nonce: int,
    count: int,
) -> Optional[int]:
    hdr = bytearray(header_template)
    for i in range(count):
        nonce = (start_nonce + i) & 0xFFFFFFFF
        hdr[76:80] = struct.pack("<I", nonce)
        h = _double_sha256_py(bytes(hdr))
        if int.from_bytes(h, "little") <= target:
            return nonce
    return None


def _scan_list_py(
    header_template: bytes,
    target: int,
    nonce_list: list[int],
) -> Optional[tuple[int, int]]:
    hdr = bytearray(header_template)
    for idx, nonce in enumerate(nonce_list):
        nonce = nonce & 0xFFFFFFFF
        hdr[76:80] = struct.pack("<I", nonce)
        h = _double_sha256_py(bytes(hdr))
        if int.from_bytes(h, "little") <= target:
            return (nonce, idx)
    return None
