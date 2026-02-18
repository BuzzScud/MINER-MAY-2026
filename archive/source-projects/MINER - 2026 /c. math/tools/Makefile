# Tools Makefile
CC = gcc
CFLAGS = -Wall -Wextra -O2 -I../cllm/include/ai -I../algorithms/include -I../math/include
LDFLAGS = -L.. -L../algorithms -lcrystalline -lcllm -lalgorithms -lm -Wl,-rpath,'$$ORIGIN/..'

TOOLS = web_scraper train_model cllm_crawler

all: $(TOOLS)

web_scraper: web_scraper.c
	@echo "Building web_scraper..."
	$(CC) $(CFLAGS) -o $@ $< -L.. -lcrawler -lcllm -lcrystalline -lcurl -lpthread -Wl,-rpath,'$$ORIGIN/..'
	@echo "✓ web_scraper built"

train_model: train_model.c
	@echo "Building train_model..."
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)
	@echo "✓ train_model built"

cllm_crawler: cllm_crawler.c
	@echo "Building cllm_crawler..."
	$(CC) $(CFLAGS) -o $@ $< -L.. -lcrawler -lcllm -lcrystalline -lcurl -lpthread -Wl,-rpath,'$$ORIGIN/..'
	@echo "✓ cllm_crawler built"

clean:
	@echo "Cleaning tools..."
	rm -f $(TOOLS)
	@echo "✓ Tools cleaned"

.PHONY: all clean
test_train_tiny: test_train_tiny.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)


# Bitcoin recovery tool
bitcoin-recovery: bitcoin-recovery.c
	$(CC) $(CFLAGS) -I../lib/recovery_core/include -I../lib/recovery_crypto/include -I../lib/recovery_network/include \
		-o bitcoin-recovery bitcoin-recovery.c \
		-L../lib/recovery_core -L../lib/recovery_crypto -L../lib/recovery_network \
		-lrecovery_core -lrecovery_crypto -lrecovery_network -lssl -lcrypto -lcurl -lm

.PHONY: bitcoin-recovery

# Duality 88D prototype (for quadrant folding, phase mapping)
DUALITY_DIR = ../prototypes/chapter_05_clock_lattice/duality_88d
.PHONY: duality
duality:
	$(MAKE) -C $(DUALITY_DIR) libduality_88d.a

# Use minimal SHA256 when OpenSSL headers unavailable (portable build)
USE_MINIMAL_SHA256 := $(shell pkg-config --exists openssl 2>/dev/null && echo "" || echo "1")
OPENSSL_CFLAGS := $(if $(USE_MINIMAL_SHA256),-DUSE_MINIMAL_SHA256,$(shell pkg-config --cflags openssl 2>/dev/null))

# Bitcoin miner (recovery libs + algorithms + math + duality).
# Requires: build recovery libs, algorithms, math, duality. Then: make bitcoin-miner
BITCOIN_MINER_SRCS = bitcoin-miner.c
ifdef USE_MINIMAL_SHA256
BITCOIN_MINER_SRCS += sha256_minimal.c
endif
bitcoin-miner: $(BITCOIN_MINER_SRCS) duality
	$(CC) $(CFLAGS) $(OPENSSL_CFLAGS) -I../math/include -I../algorithms/include -I.. \
		-I$(DUALITY_DIR) \
		-I../lib/recovery_core/include -I../lib/recovery_crypto/include -I../lib/recovery_network/include \
		-o bitcoin-miner $(BITCOIN_MINER_SRCS) \
		-L../lib/recovery_core -L../lib/recovery_crypto -L../lib/recovery_network \
		-L../algorithms -L../math/lib -L.. -L$(DUALITY_DIR) \
		../lib/recovery_core/librecovery_core.a ../lib/recovery_crypto/librecovery_crypto.a ../lib/recovery_network/librecovery_network.a \
		-lalgorithms -lcrystallinemath -lduality_88d \
		-lcurl -lm -lpthread -Wl,-undefined,dynamic_lookup

.PHONY: bitcoin-miner
