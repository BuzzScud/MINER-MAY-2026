/**
 * Simple Thread Pool Test
 * 
 * Tests thread pool creation without full model initialization
 */

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include "hierarchical_threading.h"

int main() {
    printf("\n");
    printf("╔══════════════════════════════════════════════════════════╗\n");
    printf("║     Simple Thread Pool Test                             ║\n");
    printf("╚══════════════════════════════════════════════════════════╝\n");
    printf("\n");

    int passed = 0;
    int total = 3;

    // Test 1: Create small thread pool
    printf("Test 1: Create small thread pool (4 threads)... ");
    HierarchicalThreadPool* small_pool = hierarchical_thread_pool_create(
        4,      // 4 threads
        12,     // 12-fold symmetry
        3,      // 3 dimensions
        false   // Not NUMA-aware
    );
    
    if (small_pool && small_pool->max_threads == 4) {
        printf("PASS\n");
        passed++;
        hierarchical_thread_pool_free(small_pool);
    } else {
        printf("FAIL\n");
    }

    // Test 2: Create medium thread pool
    printf("Test 2: Create medium thread pool (12 threads)... ");
    HierarchicalThreadPool* medium_pool = hierarchical_thread_pool_create(
        12,     // 12 threads
        12,     // 12-fold symmetry
        3,      // 3 dimensions
        false   // Not NUMA-aware
    );
    
    if (medium_pool && medium_pool->max_threads == 12) {
        printf("PASS\n");
        passed++;
        hierarchical_thread_pool_free(medium_pool);
    } else {
        printf("FAIL\n");
    }

    // Test 3: Verify pool doesn't hang (timeout test)
    printf("Test 3: Verify pool creation doesn't hang... ");
    fflush(stdout);
    
    alarm(5);  // 5 second timeout
    HierarchicalThreadPool* test_pool = hierarchical_thread_pool_create(
        12,     // 12 threads
        12,     // 12-fold symmetry
        3,      // 3 dimensions
        false   // Not NUMA-aware
    );
    alarm(0);  // Cancel alarm
    
    if (test_pool) {
        printf("PASS\n");
        passed++;
        hierarchical_thread_pool_free(test_pool);
    } else {
        printf("FAIL\n");
    }

    // Summary
    printf("\n");
    printf("═══════════════════════════════════════════════════════════\n");
    printf("Results: %d/%d tests passed (%.1f%%)\n", passed, total, 
           (float)passed / total * 100.0f);
    printf("═══════════════════════════════════════════════════════════\n");
    printf("\n");

    return (passed == total) ? 0 : 1;
}