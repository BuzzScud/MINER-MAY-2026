# Makefile for librecovery_core

CC = gcc
AR = ar
CFLAGS = -Wall -Wextra -O2 -fPIC -Wno-implicit-function-declaration -I./include -I../../math/include -I../../algorithms/include -I../../src
LDFLAGS = -L../../algorithms -L../../math/lib -L../..
LIBS = -lalgorithms -lcrystallinemath -lm -lpthread

# Source files
SRCS = src/recovery_core.c
OBJS = $(SRCS:.c=.o)

# Targets
TARGET_SO = librecovery_core.so
TARGET_A = librecovery_core.a

.PHONY: all clean install

all: $(TARGET_SO) $(TARGET_A)

$(TARGET_SO): $(OBJS)
	$(CC) -shared -o $@ $^ $(LDFLAGS) $(LIBS)
	@echo "✓ Built $@"

$(TARGET_A): $(OBJS)
	$(AR) rcs $@ $^
	@echo "✓ Built $@"

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET_SO) $(TARGET_A)
	@echo "✓ Cleaned recovery_core"

install: all
	install -d $(DESTDIR)/usr/local/lib
	install -d $(DESTDIR)/usr/local/include/recovery
	install -m 755 $(TARGET_SO) $(DESTDIR)/usr/local/lib/
	install -m 644 $(TARGET_A) $(DESTDIR)/usr/local/lib/
	install -m 644 include/recovery_core.h $(DESTDIR)/usr/local/include/recovery/
	ldconfig
	@echo "✓ Installed recovery_core to /usr/local"