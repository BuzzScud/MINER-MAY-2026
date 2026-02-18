/**
 * Minimal SHA-256 implementation (FIPS 180-2) for when OpenSSL is unavailable.
 * Self-contained, public domain.
 */
#ifndef SHA256_MINIMAL_H
#define SHA256_MINIMAL_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define SHA256_DIGEST_LENGTH 32

typedef struct {
    uint32_t state[8];
    uint64_t total_bytes;
    uint8_t buf[64];
    size_t buf_len;
} SHA256_CTX_minimal;

void sha256_minimal_init(SHA256_CTX_minimal* ctx);
void sha256_minimal_update(SHA256_CTX_minimal* ctx, const uint8_t* data, size_t len);
void sha256_minimal_final(uint8_t hash[32], SHA256_CTX_minimal* ctx);

/* One-shot: hash data into 32-byte hash */
void sha256_minimal(const uint8_t* data, size_t len, uint8_t hash[32]);

#ifdef __cplusplus
}
#endif

#endif
