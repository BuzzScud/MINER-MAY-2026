# Phase 3: Hierarchical Memory Design for CrystallineAbacus Embeddings

## Overview

This document describes the hierarchical memory architecture for embedding storage using CrystallineAbacus with sphere packing and 12-fold symmetry.

## Core Principles

### 1. Kissing Spheres Memory Organization
- Each sphere (thread) has exactly 12 neighbors
- Shared memory boundaries between kissing spheres
- Optimal cache locality through geometric packing
- 12-fold symmetry enforced throughout

### 2. Shared Abacus Structure
- **Single Master Abacus**: One shared AbacusMatrix for all embeddings
- **Thread-Local Views**: Each thread maintains lightweight views into shared memory
- **Copy-on-Write**: Modifications create local copies, merged back periodically
- **Lock-Free Reads**: Multiple threads can read simultaneously

### 3. Hierarchical Memory Tiers
```
Tier 1: READ_ONLY (Shared Master Abacus)
├── All threads read from this tier
├── No locks required for reads
└── Updated only during synchronization

Tier 2: COPY_ON_WRITE (Thread-Local Modifications)
├── Each thread has local modification buffer
├── Writes go to local buffer first
└── Merged back to master during sync

Tier 3: LOCKED_WRITE (Critical Updates)
├── Used for gradient accumulation
├── Lock-free atomic operations
└── Minimal contention through sphere packing
```

### 4. Platonic Solid Scaling
- **Tetrahedron** (4 vertices): Small models, 48-dim embeddings
- **Cube** (8 vertices): Medium models, 96-dim embeddings
- **Octahedron** (6 vertices): Balanced models, 72-dim embeddings
- **Dodecahedron** (20 vertices): Large models, 240-dim embeddings
- **Icosahedron** (12 vertices): Maximum symmetry, 144-dim embeddings

Each solid can be **nested recursively** for infinite scaling:
- Level 1: Base solid (e.g., Icosahedron = 144 dim)
- Level 2: Each vertex becomes a solid (12 × 144 = 1,728 dim)
- Level 3: Each vertex becomes a solid (12 × 1,728 = 20,736 dim)
- Level N: 144 × 12^(N-1) dimensions

## Memory Layout

### Embedding Matrix Structure
```c
typedef struct {
    // Master shared abacus (READ_ONLY tier)
    AbacusMatrix* master_embeddings;     // [vocab_size × embedding_dim]
    
    // Sphere-based partitioning
    uint32_t num_spheres;                // Number of threads/spheres
    uint32_t tokens_per_sphere;          // Tokens assigned to each sphere
    uint32_t* token_to_sphere_map;       // [vocab_size] → sphere_id
    
    // Thread-local views (COPY_ON_WRITE tier)
    AbacusMatrix** sphere_local_views;   // [num_spheres] local modifications
    bool* sphere_has_modifications;      // [num_spheres] dirty flags
    
    // Kissing sphere boundaries (shared memory)
    AbacusMatrix** boundary_buffers;     // [num_spheres × 12] shared boundaries
    
    // Synchronization
    pthread_rwlock_t master_lock;        // Read-write lock for master
    uint64_t sync_epoch;                 // Current synchronization epoch
    
    // Statistics
    uint64_t total_reads;
    uint64_t total_writes;
    uint64_t cache_hits;
    uint64_t cache_misses;
    
} HierarchicalEmbeddings;
```

### Token-to-Sphere Mapping
Tokens are mapped to spheres using **clock lattice geometry**:

```c
uint32_t map_token_to_sphere(uint32_t token_id, uint32_t num_spheres) {
    // Use clock position to determine sphere
    ClockPosition pos;
    clock_map_index_to_position(token_id + 1, &pos);
    
    // Map angle to sphere (12-fold symmetry)
    uint32_t sphere_id = (uint32_t)(pos.angle / (2.0 * PI / num_spheres));
    return sphere_id % num_spheres;
}
```

## Operations

### 1. Initialization
```c
HierarchicalEmbeddings* create_hierarchical_embeddings(
    uint32_t vocab_size,
    uint32_t embedding_dim,
    uint32_t num_spheres
) {
    // 1. Allocate master abacus (shared, READ_ONLY)
    // 2. Create sphere-local views (COPY_ON_WRITE)
    // 3. Allocate boundary buffers (12 per sphere)
    // 4. Map tokens to spheres using clock geometry
    // 5. Initialize synchronization primitives
}
```

### 2. Embedding Lookup (Forward Pass)
```c
void lookup_embedding(
    HierarchicalEmbeddings* hemb,
    uint32_t token_id,
    uint32_t thread_id,
    double* output
) {
    // 1. Determine which sphere owns this token
    uint32_t sphere_id = hemb->token_to_sphere_map[token_id];
    
    // 2. Check if thread has local modifications
    if (thread_id == sphere_id && hemb->sphere_has_modifications[sphere_id]) {
        // Read from local view (COPY_ON_WRITE tier)
        abacus_matrix_get_row_as_doubles(
            hemb->sphere_local_views[sphere_id],
            token_id,
            output
        );
    } else {
        // Read from master (READ_ONLY tier, lock-free)
        abacus_matrix_get_row_as_doubles(
            hemb->master_embeddings,
            token_id,
            output
        );
    }
}
```

### 3. Gradient Update (Backward Pass)
```c
void update_embedding_gradient(
    HierarchicalEmbeddings* hemb,
    uint32_t token_id,
    uint32_t thread_id,
    const double* gradient
) {
    // 1. Determine sphere ownership
    uint32_t sphere_id = hemb->token_to_sphere_map[token_id];
    
    // 2. If this thread owns the token, update local view
    if (thread_id == sphere_id) {
        // Create local view if needed (COPY_ON_WRITE)
        if (!hemb->sphere_has_modifications[sphere_id]) {
            // Copy relevant portion from master
            copy_sphere_embeddings_to_local(hemb, sphere_id);
            hemb->sphere_has_modifications[sphere_id] = true;
        }
        
        // Apply gradient to local view
        apply_gradient_to_local_view(
            hemb->sphere_local_views[sphere_id],
            token_id,
            gradient
        );
    } else {
        // Token owned by different sphere - use boundary buffer
        uint32_t neighbor_idx = find_neighbor_index(sphere_id, thread_id);
        accumulate_gradient_to_boundary(
            hemb->boundary_buffers[sphere_id * 12 + neighbor_idx],
            token_id,
            gradient
        );
    }
}
```

### 4. Synchronization
```c
void synchronize_embeddings(HierarchicalEmbeddings* hemb) {
    // 1. Merge boundary buffers into local views
    for (uint32_t sphere = 0; sphere < hemb->num_spheres; sphere++) {
        merge_boundary_gradients(hemb, sphere);
    }
    
    // 2. Merge local views back to master (LOCKED_WRITE)
    pthread_rwlock_wrlock(&hemb->master_lock);
    for (uint32_t sphere = 0; sphere < hemb->num_spheres; sphere++) {
        if (hemb->sphere_has_modifications[sphere]) {
            merge_local_to_master(hemb, sphere);
            hemb->sphere_has_modifications[sphere] = false;
        }
    }
    hemb->sync_epoch++;
    pthread_rwlock_unlock(&hemb->master_lock);
}
```

## Memory Savings Analysis

### Traditional Approach (Double Precision)
- Embeddings: `vocab_size × embedding_dim × 8 bytes`
- Example: 50,000 × 768 × 8 = **307 MB**

### Hierarchical Abacus Approach
- Master Abacus: `vocab_size × embedding_dim × abacus_size`
  - With base-60, precision-10: ~12 bytes per value (sparse)
  - Example: 50,000 × 768 × 12 = **461 MB** (dense)
  - With sparsity (50% zeros): **230 MB** (sparse)

- Thread-Local Views: `(vocab_size / num_spheres) × embedding_dim × abacus_size`
  - With 12 spheres: 50,000/12 × 768 × 12 = **38 MB per sphere**
  - Total for 12 spheres: **461 MB** (but only allocated on modification)

- Boundary Buffers: `num_spheres × 12 × buffer_size`
  - Small buffers for gradient accumulation
  - Example: 12 × 12 × 1 MB = **144 MB**

### Total Memory (Worst Case)
- Master: 230 MB (sparse)
- Local Views: 461 MB (only if all modified)
- Boundaries: 144 MB
- **Total: ~835 MB** (vs 307 MB for doubles)

### Total Memory (Typical Case)
- Master: 230 MB (sparse)
- Local Views: 38 MB × 3 active spheres = 114 MB
- Boundaries: 144 MB
- **Total: ~488 MB** (1.6× doubles, but with arbitrary precision)

## Performance Optimization

### 1. Cache Locality
- Tokens mapped to spheres using clock geometry
- Related tokens cluster in same sphere
- Boundary buffers sized for L3 cache (1-2 MB per boundary)

### 2. Lock-Free Reads
- Master abacus is READ_ONLY during forward pass
- No locks needed for embedding lookups
- Parallel reads from all threads

### 3. Minimal Contention
- Each sphere owns disjoint token sets
- Boundary buffers for cross-sphere communication
- Synchronization only at epoch boundaries

### 4. Sparse Representation
- CrystallineAbacus uses sparse beads
- Many embedding values are small or zero
- Automatic compression through sparse storage

## Implementation Plan

### Phase 1: Basic Structure (Current)
- [x] AbacusMatrix infrastructure
- [x] Basic embedding allocation
- [ ] Hierarchical structure design ← **WE ARE HERE**

### Phase 2: Sphere Mapping
- [ ] Implement token-to-sphere mapping
- [ ] Create sphere-local views
- [ ] Allocate boundary buffers

### Phase 3: Operations
- [ ] Implement hierarchical lookup
- [ ] Implement gradient updates
- [ ] Implement synchronization

### Phase 4: Optimization
- [ ] Add caching layer
- [ ] Optimize boundary buffer sizes
- [ ] Tune synchronization frequency

### Phase 5: Testing
- [ ] Correctness tests
- [ ] Performance benchmarks
- [ ] Memory usage profiling

## Next Steps

1. Implement `HierarchicalEmbeddings` structure
2. Create token-to-sphere mapping using clock geometry
3. Implement basic lookup and update operations
4. Test with small model (100 tokens, 48 dims)
5. Benchmark and optimize