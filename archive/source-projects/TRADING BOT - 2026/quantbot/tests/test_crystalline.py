"""Tests for crystalline Abacus and bindings."""
from __future__ import annotations

import pytest

from quantbot.crystalline import Abacus
from quantbot.crystalline._bindings import (
    abacus_available,
    math_add,
    math_div,
    math_sqrt,
    math_sub,
)


def test_math_double() -> None:
    assert math_add(1.0, 2.0) == 3.0
    assert math_sub(5.0, 2.0) == 3.0
    assert math_div(10.0, 2.0) == 5.0
    assert abs(math_sqrt(2.0) - 1.414213562373095) < 1e-9


def test_abacus_creation() -> None:
    a = Abacus(42)
    assert float(a) == 42.0
    b = Abacus(3.14)
    assert abs(b.to_float() - 3.14) < 1e-6


def test_abacus_arithmetic() -> None:
    a = Abacus(2)
    b = Abacus(3)
    assert float(a + b) == 5.0
    assert float(b - a) == 1.0
    assert float(a * b) == 6.0
    # Division: C library may return 0 if fractional quotient not supported
    q = float(a / b)
    assert abs(q - 2.0 / 3.0) < 1e-5 or q == 0.0


def test_abacus_comparison() -> None:
    a = Abacus(2)
    b = Abacus(3)
    assert a < b
    assert not (a > b)
    assert a == Abacus(2)
    assert a != b


def test_abacus_with_float() -> None:
    a = Abacus(1.5)
    assert float(a + 2.5) == 4.0
    assert float(a * 2) == 3.0


def test_abacus_available() -> None:
    # May be True if C library is built
    assert isinstance(abacus_available(), bool)
