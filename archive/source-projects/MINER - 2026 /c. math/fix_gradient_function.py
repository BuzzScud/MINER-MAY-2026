#!/usr/bin/env python3
import re

# Read the file
with open('algorithms/src/thread_parameters_geometric.c', 'r') as f:
    content = f.read()

# Find and replace the function
old_func = r'''GeometricMatrix\* thread_get_gradient_matrix\(HierarchicalThread\* thread,
                                            const char\* name,
                                            uint32_t token_id\) \{
    \(void\)token_id; // Token ID not used for now
    
    if \(!thread \|\| !name\) return NULL;
    
    // First try current thread
    int idx = thread_get_geometric_parameter_index\(thread, name\);
    if \(idx >= 0 && thread->geometric_gradients\[idx\]\) \{
        return thread->geometric_gradients\[idx\];
    \}
    
    // If not found and we're not in layer 0, search layer 0 threads
    if \(thread->layer_id != 0 && thread->pool\) \{
        // Search through all layer 0 threads
        for \(uint32_t i = 0; i < thread->pool->num_threads; i\+\+\) \{
            HierarchicalThread\* layer0_thread = thread->pool->threads\[i\];
            if \(layer0_thread && layer0_thread->layer_id == 0\) \{
                idx = thread_get_geometric_parameter_index\(layer0_thread, name\);
                if \(idx >= 0 && layer0_thread->geometric_gradients\[idx\]\) \{
                    return layer0_thread->geometric_gradients\[idx\];
                \}
            \}
        \}
    \}
    
    return NULL;
\}'''

new_func = '''GeometricMatrix* thread_get_gradient_matrix(HierarchicalThread* thread,
                                            const char* name,
                                            uint32_t token_id) {
    (void)token_id; // Token ID not used for now
    
    if (!thread || !name) return NULL;
    
    int idx = thread_get_geometric_parameter_index(thread, name);
    if (idx < 0) return NULL;
    
    return thread->geometric_gradients[idx];
}

GeometricMatrix* thread_get_gradient_matrix_with_pool(
    HierarchicalThreadPool* pool,
    HierarchicalThread* thread,
    const char* name,
    uint32_t token_id) {
    (void)token_id; // Token ID not used for now
    
    if (!thread || !name) return NULL;
    
    // First try current thread
    int idx = thread_get_geometric_parameter_index(thread, name);
    if (idx >= 0 && thread->geometric_gradients[idx]) {
        return thread->geometric_gradients[idx];
    }
    
    // If not found and we're not in layer 0, search layer 0 threads
    if (thread->layer != 0 && pool) {
        // Search through all layer 0 threads
        for (uint32_t i = 0; i < pool->num_threads; i++) {
            HierarchicalThread* layer0_thread = pool->threads[i];
            if (layer0_thread && layer0_thread->layer == 0) {
                idx = thread_get_geometric_parameter_index(layer0_thread, name);
                if (idx >= 0 && layer0_thread->geometric_gradients[idx]) {
                    return layer0_thread->geometric_gradients[idx];
                }
            }
        }
    }
    
    return NULL;
}'''

# Replace
content = re.sub(old_func, new_func, content, flags=re.MULTILINE)

# Write back
with open('algorithms/src/thread_parameters_geometric.c', 'w') as f:
    f.write(content)

print("Fixed!")