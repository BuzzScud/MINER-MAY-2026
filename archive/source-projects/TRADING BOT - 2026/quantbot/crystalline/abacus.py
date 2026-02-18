"""
Pythonic Abacus class backed by crystalline's double-precision C math functions.
All arithmetic routes through the C library (math_add, math_sub, math_mul, math_div).
No C pointer management -- avoids GC/abacus_free heap corruption.
"""
from __future__ import annotations

from typing import Union

from quantbot.crystalline import _bindings as _b


class Abacus:
    """Value type backed by crystalline C double-precision math functions."""

    __slots__ = ("_value", "_base")

    def __init__(
        self,
        value: float | int | str,
        base: int = 10,
        precision: int = 20,
    ) -> None:
        self._base = base
        self._value: float = float(value)

    def _get_value(self) -> float:
        return self._value

    def _ensure_ptr(self) -> bool:
        """Kept for API compatibility. Always returns True when C lib is loaded."""
        return _b.abacus_available()

    def _op(self, other: Abacus | float, op: str) -> Abacus:
        o = other if isinstance(other, Abacus) else Abacus(other, self._base)
        a, b = self._value, o._value
        if op == "add":
            return Abacus(_b.math_add(a, b), self._base)
        if op == "sub":
            return Abacus(_b.math_sub(a, b), self._base)
        if op == "mul":
            return Abacus(_b.math_mul(a, b), self._base)
        if op == "div":
            return Abacus(_b.math_div(a, b), self._base)
        return Abacus(0.0, self._base)

    def __add__(self, other: Union[Abacus, float]) -> Abacus:
        return self._op(other, "add")

    def __sub__(self, other: Union[Abacus, float]) -> Abacus:
        return self._op(other, "sub")

    def __mul__(self, other: Union[Abacus, float]) -> Abacus:
        return self._op(other, "mul")

    def __truediv__(self, other: Union[Abacus, float]) -> Abacus:
        return self._op(other, "div")

    def __lt__(self, other: Union[Abacus, float]) -> bool:
        o = other if isinstance(other, Abacus) else Abacus(other)
        return self._value < o._value

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, (Abacus, int, float)):
            return False
        o = other if isinstance(other, Abacus) else Abacus(float(other))
        return self._value == o._value

    def __le__(self, other: Union[Abacus, float]) -> bool:
        o = other if isinstance(other, Abacus) else Abacus(other)
        return self._value <= o._value

    def __ge__(self, other: Union[Abacus, float]) -> bool:
        o = other if isinstance(other, Abacus) else Abacus(other)
        return self._value >= o._value

    def __gt__(self, other: Union[Abacus, float]) -> bool:
        o = other if isinstance(other, Abacus) else Abacus(other)
        return self._value > o._value

    def __float__(self) -> float:
        return self._value

    def to_float(self) -> float:
        return self._value

    def to_string(self) -> str:
        return str(self._value)

    def __str__(self) -> str:
        return self.to_string()

    def __repr__(self) -> str:
        return f"Abacus({self._value})"

    def __hash__(self) -> int:
        return hash(self._value)
