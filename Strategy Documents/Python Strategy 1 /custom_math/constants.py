"""
Mirror of Custom Math constants.h: phi, pi*phi, lunar, retracements, extensions, Fib sequence.
Single source for trading strategy constants.
"""
from __future__ import annotations

import math

# Phi (golden ratio) - Custom Math MATH_PHI
PHI = 1.61803398874989484820
PHI_SQUARED = PHI * PHI
PHI_INVERSE = 1.0 / PHI

# Pi * Phi - Custom Math MATH_PI_TIMES_PHI (~5.083)
PI_TIMES_PHI = math.pi * PHI

# Lunar - Custom Math astronomical constants
LUNAR_MONTH = 29.53059  # Synodic month in days
SAROS_CYCLE = 223       # Eclipse cycle (223 synodic months)
METONIC_CYCLE = 235     # Lunar-solar sync (19 years = 235 months)
METONIC_YEARS = 19

# Retracements (for PD Array / OTE)
GOLDEN_RETRACEMENTS = (0.382, 0.618)
FIB_RETRACEMENTS = (0.236, 0.382, 0.5, 0.618, 0.786)

# Phi extensions (phi^3 through phi^8 + pi*phi) - key levels for targets
PHI_EXTENSIONS = (4.24, 5.08, 6.86, 11.01, 17.94, 29.03, 47)

# Fib sequence for Fib-time filter (bar counts from swing)
FIB_SEQUENCE = (1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89)
