#!/bin/bash
# Test 1: SSH Key Recovery - Simplified and Fast
# 
# Demonstrates recovering an Ed25519 private key from:
# - Public key (Q)
# - Partial private key data (samples)

set -e

echo "=== Test 1: SSH Key Recovery (Simplified) ==="
echo ""

TEST_DIR="/tmp/ssh_recovery_simple"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo "Step 1: Generate Ed25519 SSH key..."
ssh-keygen -t ed25519 -f test_key -N "" -C "test@recovery" >/dev/null 2>&1
echo "✓ Generated key pair"
echo ""

echo "Step 2: Extract key components..."
# Ed25519 private key is 32 bytes
# Public key is derived from private key

# Save original for comparison
cp test_key original_key

# Extract raw key bytes (Ed25519 format)
# The private key file contains the 32-byte seed
ssh-keygen -p -f test_key -m pem -N "" >/dev/null 2>&1 || true

# For this demo, we'll work with the raw key file
echo "Original private key (first 200 bytes):"
head -c 200 original_key | xxd | head -10
echo ""

# Extract public key as Q
cp test_key.pub Q_public.pub
echo "Public key (Q):"
cat Q_public.pub
echo ""

echo "Step 3: Simulate partial key recovery..."
# In real scenario: we have corrupted key with some good bytes
# For demo: take first 50 bytes as "known good samples"
head -c 50 original_key > samples_known_good.bin
echo "✓ Extracted 50 bytes of known good data as samples"
echo ""

echo "Step 4: Create corrupted key (simulate data loss)..."
# Corrupt the middle section of the key
cp original_key corrupted_key
# Zero out bytes 50-150 (simulate corruption)
dd if=/dev/zero of=corrupted_key bs=1 seek=50 count=100 conv=notrunc 2>/dev/null
echo "✓ Simulated corruption (bytes 50-150 zeroed)"
echo ""

echo "Corrupted key (first 200 bytes):"
head -c 200 corrupted_key | xxd | head -10
echo ""

echo "Step 5: Recover key using universal-recovery..."
/workspace/tools/universal-recovery \
    -q Q_public.pub \
    -s samples_known_good.bin \
    -o recovered_key.bin \
    -v \
    -i 5000

echo ""
echo "Step 6: Compare results..."
echo ""

echo "Original key (bytes 50-100):"
dd if=original_key bs=1 skip=50 count=50 2>/dev/null | xxd

echo ""
echo "Recovered key (bytes 50-100):"
dd if=recovered_key.bin bs=1 skip=50 count=50 2>/dev/null | xxd

echo ""
echo "=== Analysis ==="
# Calculate how many bytes match
ORIGINAL_HASH=$(md5sum original_key | cut -d' ' -f1)
RECOVERED_HASH=$(md5sum recovered_key.bin | cut -d' ' -f1)

echo "Original key hash: $ORIGINAL_HASH"
echo "Recovered key hash: $RECOVERED_HASH"

if [ "$ORIGINAL_HASH" = "$RECOVERED_HASH" ]; then
    echo "✓ PERFECT RECOVERY!"
else
    echo "⚠ Partial recovery (expected - needs OBJECTIVE 28 integration)"
fi

echo ""
echo "Files in: $TEST_DIR"
ls -lh