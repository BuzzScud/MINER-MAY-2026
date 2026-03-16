/**
 * 88D Thread Pool Test
 * 
 * Tests 88D thread pool creation specifically
 */

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <signal.h>
#include "hierarchical_threading.h"

volatile sig_atomic_t timeout_occurred = 0;

void timeout_handler(int sig) {
    (void)sig;
    timeout_occurred = 1;
}

int main() {
    printf("\n");
    printf("╔══════════════════════════════════════════════════════════╗\n");
    printf("║     88D Thread Pool Test                                ║\n");
    printf("╚══════════════════════════════════════════════════════════╝\n");
    printf("\n");

    int passed = 0;
    int total = 2;

    // Set up timeout handler
    signal(SIGALRM, timeout_handler);

    // Test 1: Create 88D thread pool with timeout
    printf("Test 1: Create 88D thread pool (96 threads)... ");
    fflush(stdout);
    
    timeout_occurred = 0;
    alarm(10);  // 10 second timeout
    
    HierarchicalThreadPool* pool_88d = hierarchical_thread_pool_create_88d(60);
    
    alarm(0);  // Cancel alarm
    
    if (timeout_occurred) {
        printf("FAIL (timeout)\n");
        printf("   ERROR: Thread pool creation hung!\n");
    } else if (pool_88d) {
        printf("PASS\n");
        printf("   Created pool with %u threads\n", pool_88d->num_threads);
        printf("   Pool running: %d\n", pool_88d->running);
        passed++;
        
        // Test 2: Verify pool structure
        printf("Test 2: Verify 88D structure... ");
        if (pool_88d->use_88d_structure && 
            pool_88d->num_levels == 8 &&
            pool_88d->threads_per_level == 12) {
            printf("PASS\n");
            printf("   Levels: %u\n", pool_88d->num_levels);
            printf("   Threads per level: %u\n", pool_88d->threads_per_level);
            passed++;
        } else {
            printf("FAIL\n");
        }
        
        // Clean up - give threads time to start
        printf("\nCleaning up (waiting for threads to initialize)...\n");
        sleep(1);
        
        // Stop the pool first
        if (pool_88d->running) {
            printf("Stopping thread pool...\n");
            hierarchical_thread_pool_stop(pool_88d);
            sleep(1);  // Give threads time to stop
        }
        
        printf("Freeing thread pool...\n");
        hierarchical_thread_pool_free(pool_88d);
        printf("Cleanup complete.\n");
    } else {
        printf("FAIL (creation failed)\n");
    }

    // Summary
    printf("\n");
    printf("═══════════════════════════════════════════════════════════\n");
    printf("Results: %d/%d tests passed (%.1f%%)\n", passed, total, 
           (float)passed / total * 100.0f);
    printf("═══════════════════════════════════════════════════════════\n");
    printf("\n");

    if (passed == total) {
        printf("✓ 88D thread pool creation works!\n");
    } else {
        printf("✗ 88D thread pool has issues\n");
    }
    printf("\n");

    return (passed == total) ? 0 : 1;
}