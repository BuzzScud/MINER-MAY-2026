"""
Raw ctypes bindings for libcrystallinemath.
Loads .dylib on macOS, .so on Linux. Fallback: pure Python double-precision.
"""
from __future__ import annotations

import os
import platform
import sys
from ctypes import (
    CDLL,
    byref,
    c_bool,
    c_char_p,
    c_double,
    c_int,
    c_int32,
    c_uint32,
    c_void_p,
)
from pathlib import Path

# MathError enum (C int)
MATH_SUCCESS = 0
MATH_ERROR_INVALID_ARG = 1
MATH_ERROR_OVERFLOW = 2
MATH_ERROR_UNDERFLOW = 3
MATH_ERROR_DIVISION_BY_ZERO = 4
MATH_ERROR_OUT_OF_MEMORY = 5
MATH_ERROR_DOMAIN = 6
MATH_ERROR_RANGE = 7
MATH_ERROR_CONVERGENCE = 8
MATH_ERROR_NOT_FOUND = 9
MATH_ERROR_OUT_OF_RANGE = 10
MATH_ERROR_NULL_POINTER = 11
MATH_ERROR_INVALID_BASE = 12
MATH_ERROR_NOT_IMPLEMENTED = 13

_LIB: CDLL | None = None


def _find_lib() -> str | None:
    """Resolve path to libcrystallinemath.so or .dylib."""
    name = "libcrystallinemath"
    ext = "dylib" if platform.system() == "Darwin" else "so"
    lib_name = f"{name}.{ext}"
    # 1) Env
    env_path = os.environ.get("CRYSTALLINE_LIB_PATH")
    if env_path:
        p = Path(env_path) / lib_name
        if p.exists():
            return str(p)
    # 2) Sibling math/math/lib (workspace layout)
    base = Path(__file__).resolve().parent
    for root in [base, base.parent.parent]:
        candidate = root / "math" / "math" / "lib" / lib_name
        if candidate.exists():
            return str(candidate)
    # 3) Current dir / lib
    if Path(lib_name).exists():
        return lib_name
    return None


def _load_lib() -> CDLL | None:
    global _LIB
    if _LIB is not None:
        return _LIB
    path = _find_lib()
    if not path:
        return None
    try:
        _LIB = CDLL(path)
        return _LIB
    except OSError:
        return None


def _register_abacus(lib: CDLL) -> None:
    """Register abacus function prototypes."""
    # CrystallineAbacus* = pointer (c_void_p for pointer type in ctypes)
    p_abacus = c_void_p
    # abacus_new(base) -> CrystallineAbacus*
    lib.abacus_new.argtypes = [c_uint32]
    lib.abacus_new.restype = p_abacus
    # abacus_free(abacus)
    lib.abacus_free.argtypes = [p_abacus]
    lib.abacus_free.restype = None
    # abacus_from_double(value, base, precision) -> CrystallineAbacus*
    lib.abacus_from_double.argtypes = [c_double, c_uint32, c_int32]
    lib.abacus_from_double.restype = p_abacus
    # abacus_to_double(abacus, &value) -> MathError
    lib.abacus_to_double.argtypes = [p_abacus, c_void_p]
    lib.abacus_to_double.restype = c_int
    # abacus_add(result, a, b)
    lib.abacus_add.argtypes = [p_abacus, p_abacus, p_abacus]
    lib.abacus_add.restype = c_int
    lib.abacus_sub.argtypes = [p_abacus, p_abacus, p_abacus]
    lib.abacus_sub.restype = c_int
    lib.abacus_mul.argtypes = [p_abacus, p_abacus, p_abacus]
    lib.abacus_mul.restype = c_int
    # abacus_div(quotient, remainder, a, b); remainder may be NULL
    lib.abacus_div.argtypes = [p_abacus, p_abacus, p_abacus, p_abacus]
    lib.abacus_div.restype = c_int
    lib.abacus_sqrt.argtypes = [p_abacus, p_abacus]
    lib.abacus_sqrt.restype = c_int
    lib.abacus_compare.argtypes = [p_abacus, p_abacus]
    lib.abacus_compare.restype = c_int
    lib.abacus_copy.argtypes = [p_abacus]
    lib.abacus_copy.restype = p_abacus
    lib.abacus_to_string.argtypes = [p_abacus]
    lib.abacus_to_string.restype = c_char_p
    lib.abacus_is_zero.argtypes = [p_abacus]
    lib.abacus_is_zero.restype = c_bool
    lib.abacus_is_negative.argtypes = [p_abacus]
    lib.abacus_is_negative.restype = c_bool
    # abacus_new for result buffers (same base as operands)
    lib.abacus_init_zero.argtypes = [p_abacus]
    lib.abacus_init_zero.restype = c_int


def _register_math_double(lib: CDLL) -> None:
    """Register double-precision math_* functions."""
    lib.math_add.argtypes = [c_double, c_double]
    lib.math_add.restype = c_double
    lib.math_sub.argtypes = [c_double, c_double]
    lib.math_sub.restype = c_double
    lib.math_mul.argtypes = [c_double, c_double]
    lib.math_mul.restype = c_double
    lib.math_div.argtypes = [c_double, c_double]
    lib.math_div.restype = c_double
    lib.math_abs.argtypes = [c_double]
    lib.math_abs.restype = c_double
    lib.math_min.argtypes = [c_double, c_double]
    lib.math_min.restype = c_double
    lib.math_max.argtypes = [c_double, c_double]
    lib.math_max.restype = c_double
    lib.math_sqrt.argtypes = [c_double]
    lib.math_sqrt.restype = c_double
    lib.math_exp.argtypes = [c_double]
    lib.math_exp.restype = c_double
    lib.math_log.argtypes = [c_double]
    lib.math_log.restype = c_double


# ---------------------------------------------------------------------------
# Double-precision math (use C library when available, else stdlib)
# ---------------------------------------------------------------------------
def math_add(a: float, b: float) -> float:
    _ensure_lib_registered()
    lib = _load_lib()
    if lib is not None and hasattr(lib, "math_add"):
        return lib.math_add(c_double(a), c_double(b))
    return a + b


def math_sub(a: float, b: float) -> float:
    _ensure_lib_registered()
    lib = _load_lib()
    if lib is not None and hasattr(lib, "math_sub"):
        return lib.math_sub(c_double(a), c_double(b))
    return a - b


def math_mul(a: float, b: float) -> float:
    _ensure_lib_registered()
    lib = _load_lib()
    if lib is not None and hasattr(lib, "math_mul"):
        return lib.math_mul(c_double(a), c_double(b))
    return a * b


def math_div(a: float, b: float) -> float:
    if b == 0.0:
        return float("nan")
    _ensure_lib_registered()
    lib = _load_lib()
    if lib is not None and hasattr(lib, "math_div"):
        return lib.math_div(c_double(a), c_double(b))
    return a / b


def math_abs(x: float) -> float:
    _ensure_lib_registered()
    lib = _load_lib()
    if lib is not None and hasattr(lib, "math_abs"):
        return lib.math_abs(c_double(x))
    return abs(x)


def math_min(a: float, b: float) -> float:
    _ensure_lib_registered()
    lib = _load_lib()
    if lib is not None and hasattr(lib, "math_min"):
        return lib.math_min(c_double(a), c_double(b))
    return min(a, b)


def math_max(a: float, b: float) -> float:
    _ensure_lib_registered()
    lib = _load_lib()
    if lib is not None and hasattr(lib, "math_max"):
        return lib.math_max(c_double(a), c_double(b))
    return max(a, b)


def math_sqrt(x: float) -> float:
    _ensure_lib_registered()
    lib = _load_lib()
    if lib is not None and hasattr(lib, "math_sqrt"):
        return lib.math_sqrt(c_double(x))
    return x ** 0.5


def math_exp(x: float) -> float:
    _ensure_lib_registered()
    lib = _load_lib()
    if lib is not None and hasattr(lib, "math_exp"):
        return lib.math_exp(c_double(x))
    return float(__import__("math").exp(x))


def math_log(x: float) -> float:
    _ensure_lib_registered()
    lib = _load_lib()
    if lib is not None and hasattr(lib, "math_log"):
        return lib.math_log(c_double(x))
    return float(__import__("math").log(x))


_registered = False


def _ensure_lib_registered() -> None:
    global _registered
    if _registered:
        return
    lib = _load_lib()
    if lib is None:
        return
    try:
        _register_abacus(lib)
        _register_math_double(lib)
        _registered = True
    except AttributeError:
        pass


def abacus_available() -> bool:
    """Return True if C abacus library is loaded and ready."""
    _ensure_lib_registered()
    return _registered and _LIB is not None and hasattr(_LIB, "abacus_new")


# Abacus C API wrappers (used by abacus.py)
def abacus_new(base: int) -> c_void_p | None:
    _ensure_lib_registered()
    if _LIB is None or not hasattr(_LIB, "abacus_new"):
        return None
    return _LIB.abacus_new(c_uint32(base))


def abacus_free(ptr: c_void_p) -> None:
    if _LIB is not None and ptr is not None:
        _LIB.abacus_free(ptr)


def abacus_from_double(value: float, base: int, precision: int) -> c_void_p | None:
    _ensure_lib_registered()
    if _LIB is None:
        return None
    return _LIB.abacus_from_double(c_double(value), c_uint32(base), c_int32(precision))


def abacus_to_double(ptr: c_void_p) -> float | None:
    if _LIB is None:
        return None
    out = c_double()
    err = _LIB.abacus_to_double(ptr, byref(out))
    if err != MATH_SUCCESS:
        return None
    return out.value


def abacus_add(result: c_void_p, a: c_void_p, b: c_void_p) -> int:
    if _LIB is None:
        return MATH_ERROR_NOT_IMPLEMENTED
    return _LIB.abacus_add(result, a, b)


def abacus_sub(result: c_void_p, a: c_void_p, b: c_void_p) -> int:
    if _LIB is None:
        return MATH_ERROR_NOT_IMPLEMENTED
    return _LIB.abacus_sub(result, a, b)


def abacus_mul(result: c_void_p, a: c_void_p, b: c_void_p) -> int:
    if _LIB is None:
        return MATH_ERROR_NOT_IMPLEMENTED
    return _LIB.abacus_mul(result, a, b)


def abacus_div(
    quotient: c_void_p, remainder: c_void_p | None, a: c_void_p, b: c_void_p
) -> int:
    if _LIB is None:
        return MATH_ERROR_NOT_IMPLEMENTED
    return _LIB.abacus_div(quotient, remainder or c_void_p(), a, b)


def abacus_sqrt(result: c_void_p, x: c_void_p) -> int:
    if _LIB is None:
        return MATH_ERROR_NOT_IMPLEMENTED
    return _LIB.abacus_sqrt(result, x)


def abacus_compare(a: c_void_p, b: c_void_p) -> int:
    if _LIB is None:
        return 0
    return _LIB.abacus_compare(a, b)


def abacus_init_zero(ptr: c_void_p) -> int:
    if _LIB is None:
        return MATH_ERROR_NOT_IMPLEMENTED
    return _LIB.abacus_init_zero(ptr)


def abacus_copy(src: c_void_p) -> c_void_p | None:
    if _LIB is None:
        return None
    return _LIB.abacus_copy(src)


def abacus_to_string(ptr: c_void_p) -> str | None:
    if _LIB is None:
        return None
    p = _LIB.abacus_to_string(ptr)
    if p is None:
        return None
    try:
        return p.decode("utf-8") if isinstance(p, bytes) else str(p)
    except Exception:
        return str(float(abacus_to_double(ptr) or 0))
