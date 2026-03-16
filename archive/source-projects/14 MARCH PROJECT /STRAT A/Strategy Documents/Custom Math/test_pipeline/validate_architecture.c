#include <stdio.h>
#include <stdlib.h>
#include "../include/cllm.h"

int main() {
    printf("Testing architecture components...\n");
    
    // Create a tiny model
    CLLMModel* model = cllm_create_model(1000, 64, 2, 4, 12);
    if (!model) {
        fprintf(stderr, "Failed to create model\n");
        return 1;
    }
    
    printf("✓ Model creation successful\n");
    
    // Verify 12-fold symmetry
    if (model->symmetry_groups != 12) {
        fprintf(stderr, "✗ 12-fold symmetry not maintained: %d\n", model->symmetry_groups);
        return 1;
    }
    printf("✓ 12-fold symmetry verified\n");
    
    // Verify kissing spheres (13 total: 1 control + 12 workers)
    if (model->num_spheres != 13) {
        fprintf(stderr, "✗ Kissing spheres incorrect: %d (expected 13)\n", model->num_spheres);
        return 1;
    }
    printf("✓ Kissing spheres (13) verified\n");
    
    // Verify clock lattice size
    if (model->clock_lattice_size != 232) {
        fprintf(stderr, "✗ Clock lattice size incorrect: %d (expected 232)\n", model->clock_lattice_size);
        return 1;
    }
    printf("✓ Clock lattice (232 positions) verified\n");
    
    // Verify Platonic solid (cube: 8 vertices, 12 edges, 6 faces)
    if (model->num_vertices != 8 || model->num_edges != 12 || model->num_faces != 6) {
        fprintf(stderr, "✗ Platonic solid incorrect: V=%d E=%d F=%d\n", 
                model->num_vertices, model->num_edges, model->num_faces);
        return 1;
    }
    
    // Verify Euler's formula: V - E + F = 2
    int euler = model->num_vertices - model->num_edges + model->num_faces;
    if (euler != 2) {
        fprintf(stderr, "✗ Euler's formula failed: %d - %d + %d = %d (expected 2)\n",
                model->num_vertices, model->num_edges, model->num_faces, euler);
        return 1;
    }
    printf("✓ Platonic solid (cube) verified: V=8, E=12, F=6, Euler=2\n");
    
    // Verify blind recovery enabled
    if (!model->blind_recovery_enabled) {
        fprintf(stderr, "✗ Blind recovery not enabled\n");
        return 1;
    }
    printf("✓ Blind recovery enabled\n");
    
    // Verify harmonic integration
    if (!model->harmonic_integration_enabled) {
        fprintf(stderr, "✗ Harmonic integration not enabled\n");
        return 1;
    }
    printf("✓ Harmonic integration enabled\n");
    
    // Verify NTT attention
    if (!model->ntt_attention_enabled) {
        fprintf(stderr, "✗ NTT attention not enabled\n");
        return 1;
    }
    printf("✓ NTT attention enabled\n");
    
    cllm_free_model(model);
    
    printf("\n✓ ALL ARCHITECTURE TESTS PASSED\n");
    return 0;
}