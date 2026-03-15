#include <stdio.h>
#include <stdlib.h>
#include "hierarchical_threading.h"
#include "thread_parameters_geometric.h"

int main() {
    // Create thread
    HierarchicalThread* thread = (HierarchicalThread*)calloc(1, sizeof(HierarchicalThread));
    thread->thread_id = 1;
    thread->layer = 0;
    thread->dimension = 1;
    
    // Allocate parameter
    printf("Allocating parameter...\n");
    int idx = thread_allocate_geometric_parameter(thread, "test_param", 10, 10);
    printf("Allocated at index: %d\n", idx);
    printf("num_geometric_params: %u\n", thread->num_geometric_params);
    
    // Try to get it back
    printf("\nTrying to get parameter by name...\n");
    GeometricMatrix* mat = thread_get_parameter_matrix(thread, "test_param", 0);
    if (mat) {
        printf("SUCCESS: Found parameter!\n");
        printf("  Name: %s\n", mat->name);
        printf("  Dimensions: %u x %u\n", mat->rows, mat->cols);
    } else {
        printf("FAIL: Parameter not found\n");
        
        // Debug: check param_metadata
        if (thread->param_metadata) {
            printf("  param_metadata exists\n");
            printf("  param_metadata[0].name: %s\n", thread->param_metadata[0].name);
        } else {
            printf("  param_metadata is NULL!\n");
        }
    }
    
    return mat ? 0 : 1;
}