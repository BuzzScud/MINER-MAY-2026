# Geometric Operations Quick Reference

## Quick Start

```c
#include "math/abacus.h"
#include "math/abacus_geometric.h"

// Create operands
CrystallineAbacus* a = abacus_from_double(5.0, 10, 5);
CrystallineAbacus* b = abacus_from_double(3.0, 10, 5);
CrystallineAbacus* result = abacus_new(10);

// Perform operation
abacus_add_geometric(a, b, result);  // 5 + 3 = 8

// Get result
double value;
abacus_to_double(result, &value);

// Cleanup
abacus_free(a);
abacus_free(b);
abacus_free(result);
```

## Operations Cheat Sheet

| Operation | Function | Example | Result |
|-----------|----------|---------|--------|
| Addition | `abacus_add_geometric(a, b, r)` | 2 + 3 | 5 |
| Subtraction | `abacus_sub_geometric(a, b, r)` | 5 - 3 | 2 |
| Multiplication | `abacus_mul_geometric(a, b, r)` | 2 × 3 | 6 |
| Division | `abacus_div_geometric(a, b, r)` | 6 ÷ 2 | 3 |

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `MATH_SUCCESS` | Operation succeeded | Continue |
| `MATH_ERROR_NULL_POINTER` | NULL parameter | Check inputs |
| `MATH_ERROR_DIVISION_BY_ZERO` | Divide by zero | Check divisor |
| `MATH_ERROR_OUT_OF_MEMORY` | Memory allocation failed | Free resources |

## Compilation

```bash
# Compile with library
gcc -o myapp myapp.c -I math/include -L math/lib -lcrystallinemath -lm

# Run with library path
LD_LIBRARY_PATH=math/lib:$LD_LIBRARY_PATH ./myapp
```

## Testing

```bash
cd math
make clean && make
LD_LIBRARY_PATH=lib:$LD_LIBRARY_PATH ./tests/test_abacus_geometric
```

## The 6-Step Pattern

```
1. MAP      → abacus to clock position
2. FOLD     → normalize to Q1
3. OPERATE  → perform arithmetic
4. TRACK    → monitor polarity
5. UNFOLD   → transform to quadrant
6. MAP BACK → clock position to abacus
```

## Common Patterns

### Pattern 1: Simple Operation
```c
CrystallineAbacus *a, *b, *result;
// ... create a, b, result
abacus_add_geometric(a, b, result);
```

### Pattern 2: Chained Operations
```c
// (a + b) × c
abacus_add_geometric(a, b, temp);
abacus_mul_geometric(temp, c, result);
```

### Pattern 3: Error Handling
```c
MathError err = abacus_div_geometric(a, b, result);
if (err == MATH_ERROR_DIVISION_BY_ZERO) {
    // Handle error
}
```

## Performance Notes

- Geometric operations: **O(1)**
- Conversion overhead: **O(n)** where n = digits
- Memory usage: **O(1)** additional space

## Test Coverage

✅ 299/299 tests passing (100%)
- Clock Triangle: 163 tests
- Clock Quadrant: 58 tests  
- Geometric Ops: 33 tests
- Extended Ops: 45 tests

## Links

- [Full Guide](GEOMETRIC_OPERATIONS_GUIDE.md)
- [Week 1 Summary](WEEK1_SUMMARY.md)
- [Repository](https://github.com/justmebob123/crystalline)