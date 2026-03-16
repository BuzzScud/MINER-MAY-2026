# Known Issues - Crystalline Math PHP Extension

## Segmentation Fault in `crystalline_prime_nth()`

### Status
**KNOWN ISSUE** - Under investigation

### Description
The `crystalline_prime_nth()` function causes a segmentation fault when called from PHP, even though the underlying C library function works perfectly.

### Affected Function
- `crystalline_prime_nth($n)` - Get the nth prime number

### Working Functions
All other functions work correctly:
- ✅ `crystalline_prime_generate_o1($position, $magnitude)` - O(1) prime generation
- ✅ `crystalline_prime_is_prime($n)` - Primality testing
- ✅ `crystalline_rainbow_init($capacity)` - Initialize rainbow table
- ✅ `crystalline_rainbow_populate($table, $max_prime)` - Populate table
- ✅ `crystalline_rainbow_lookup($table, $index)` - Lookup by index
- ✅ `crystalline_rainbow_count($table)` - Get count
- ✅ `crystalline_clock_position($prime)` - Map to clock position
- ✅ `crystalline_clock_validate($position)` - Validate position
- ✅ `crystalline_version()` - Get version

### Root Cause
The issue appears to be related to:
1. Global rainbow table initialization in the C library
2. Possible memory management conflict between PHP and C
3. Thread safety issues (PHP may use ZTS - Zend Thread Safety)

### Investigation Results
- ✅ C library `prime_nth()` works perfectly when called directly
- ✅ PHP extension compiles without errors
- ✅ Module initialization runs successfully
- ❌ Segfault occurs when `prime_nth()` is called from PHP

### Workaround
Use `crystalline_prime_is_prime()` in a loop to find the nth prime:

```php
function get_nth_prime($n) {
    $count = 0;
    $candidate = 2;
    
    while ($count < $n) {
        if (crystalline_prime_is_prime($candidate)) {
            $count++;
            if ($count == $n) {
                return $candidate;
            }
        }
        $candidate++;
    }
    
    return 0;
}

// Usage
$prime = get_nth_prime(10);  // Returns 29 (10th prime)
```

### Alternative: Use O(1) Generation
For specific positions, use the O(1) formula:

```php
// Generate primes at position 3 (base 5)
$p1 = crystalline_prime_generate_o1(3, 0);  // 5
$p2 = crystalline_prime_generate_o1(3, 1);  // 17
$p3 = crystalline_prime_generate_o1(3, 2);  // 29
```

### Examples
See `examples/php/prime_generation_working.php` for a complete working example that avoids the problematic function.

### Future Work
- Investigate thread safety issues
- Consider alternative implementation without global state
- Add proper error handling and recovery
- Test with PHP ZTS (Zend Thread Safety) enabled/disabled

### Reporting
If you have additional information about this issue, please report it on the GitHub repository.