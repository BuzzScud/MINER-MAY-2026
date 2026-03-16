/**
 * Test: Parameter Initialization
 * 
 * Tests that parameter initialization works correctly for geometric matrices
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "ai/cllm_parameter_init.h"
#include "geometric_matrix.h"
#include "math/abacus.h"

int main() {
    printf("\n");
    printf("╔══════════════════════════════════════════════════════════╗\n");
    printf("║     Parameter Initialization Tests                      ║\n");
    printf("╚══════════════════════════════════════════════════════════╝\n");
    printf("\n");

    int passed = 0;
    int total = 6;

    // Test 1: Create geometric matrix
    printf("Test 1: Create geometric matrix... ");
    GeometricMatrix* matrix = geometric_matrix_create_with_solid(
        10,  // 10 rows
        10,  // 10 columns
        PLATONIC_TETRAHEDRON,  // 4 vertices
        "test_matrix"
    );
    
    if (matrix && matrix->num_vertices == 4) {
        printf("PASS\n");
        printf("   Created matrix with %u vertices\n", matrix->num_vertices);
        passed++;
    } else {
        printf("FAIL\n");
        if (matrix) geometric_matrix_free(matrix);
        return 1;
    }

    // Test 2: Xavier initialization
    printf("Test 2: Xavier initialization... ");
    int result = cllm_init_geometric_matrix(matrix, INIT_XAVIER, 10, 10);
    
    if (result == 0 && matrix->is_initialized) {
        printf("PASS\n");
        printf("   Matrix initialized with Xavier strategy\n");
        passed++;
    } else {
        printf("FAIL\n");
    }

    // Test 3: Verify values are not zero
    printf("Test 3: Verify non-zero values... ");
    int non_zero_count = 0;
    for (uint32_t i = 0; i < matrix->num_vertices; i++) {
        if (matrix->vertex_values[i]) {
            double value;
            abacus_to_double(matrix->vertex_values[i], &value);
            if (fabs(value) > 1e-10) {
                non_zero_count++;
            }
        }
    }
    
    if (non_zero_count > 0) {
        printf("PASS\n");
        printf("   Found %d non-zero values out of %u vertices\n", 
               non_zero_count, matrix->num_vertices);
        passed++;
    } else {
        printf("FAIL\n");
    }

    // Test 4: He initialization
    printf("Test 4: He initialization... ");
    GeometricMatrix* matrix2 = geometric_matrix_create_with_solid(
        20,  // 20 rows
        20,  // 20 columns
        PLATONIC_CUBE,  // 8 vertices
        "test_matrix2"
    );
    
    if (matrix2) {
        result = cllm_init_geometric_matrix(matrix2, INIT_HE, 20, 0);
        if (result == 0 && matrix2->is_initialized) {
            printf("PASS\n");
            printf("   Matrix initialized with He strategy\n");
            passed++;
        } else {
            printf("FAIL\n");
        }
    } else {
        printf("FAIL (creation)\n");
    }

    // Test 5: Zero initialization
    printf("Test 5: Zero initialization... ");
    GeometricMatrix* matrix3 = geometric_matrix_create_with_solid(
        15,  // 15 rows
        15,  // 15 columns
        PLATONIC_OCTAHEDRON,  // 6 vertices
        "test_matrix3"
    );
    
    if (matrix3) {
        result = cllm_init_geometric_matrix(matrix3, INIT_ZEROS, 0, 0);
        if (result == 0 && matrix3->is_initialized) {
            // Verify all values are zero
            int all_zero = 1;
            for (uint32_t i = 0; i < matrix3->num_vertices; i++) {
                if (matrix3->vertex_values[i]) {
                    double value;
                    abacus_to_double(matrix3->vertex_values[i], &value);
                    if (fabs(value) > 1e-10) {
                        all_zero = 0;
                        break;
                    }
                }
            }
            
            if (all_zero) {
                printf("PASS\n");
                printf("   All values are zero\n");
                passed++;
            } else {
                printf("FAIL (not all zero)\n");
            }
        } else {
            printf("FAIL (initialization)\n");
        }
    } else {
        printf("FAIL (creation)\n");
    }

    // Test 6: Ones initialization
    printf("Test 6: Ones initialization... ");
    GeometricMatrix* matrix4 = geometric_matrix_create_with_solid(
        30,  // 30 rows
        30,  // 30 columns
        PLATONIC_DODECAHEDRON,  // 20 vertices
        "test_matrix4"
    );
    
    if (matrix4) {
        result = cllm_init_geometric_matrix(matrix4, INIT_ONES, 0, 0);
        if (result == 0 && matrix4->is_initialized) {
            // Verify all values are one
            int all_one = 1;
            for (uint32_t i = 0; i < matrix4->num_vertices; i++) {
                if (matrix4->vertex_values[i]) {
                    double value;
                    abacus_to_double(matrix4->vertex_values[i], &value);
                    if (fabs(value - 1.0) > 1e-6) {
                        all_one = 0;
                        break;
                    }
                }
            }
            
            if (all_one) {
                printf("PASS\n");
                printf("   All values are one\n");
                passed++;
            } else {
                printf("FAIL (not all one)\n");
            }
        } else {
            printf("FAIL (initialization)\n");
        }
    } else {
        printf("FAIL (creation)\n");
    }

    // Cleanup
    geometric_matrix_free(matrix);
    if (matrix2) geometric_matrix_free(matrix2);
    if (matrix3) geometric_matrix_free(matrix3);
    if (matrix4) geometric_matrix_free(matrix4);

    // Summary
    printf("\n");
    printf("═══════════════════════════════════════════════════════════\n");
    printf("Results: %d/%d tests passed (%.1f%%)\n", passed, total, 
           (float)passed / total * 100.0f);
    printf("═══════════════════════════════════════════════════════════\n");
    printf("\n");

    if (passed == total) {
        printf("✓ Parameter initialization working!\n");
        printf("  - Xavier initialization: ✓\n");
        printf("  - He initialization: ✓\n");
        printf("  - Zero initialization: ✓\n");
        printf("  - Ones initialization: ✓\n");
        printf("  - Non-zero values verified: ✓\n");
    } else {
        printf("✗ Some tests failed\n");
    }
    printf("\n");

    return (passed == total) ? 0 : 1;
}