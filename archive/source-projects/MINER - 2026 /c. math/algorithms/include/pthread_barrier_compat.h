/**
 * @file pthread_barrier_compat.h
 * @brief pthread_barrier compatibility for macOS (which lacks POSIX barriers)
 */
#ifndef PTHREAD_BARRIER_COMPAT_H
#define PTHREAD_BARRIER_COMPAT_H

#include <pthread.h>

#ifdef __APPLE__
#ifndef PTHREAD_BARRIER_SERIAL_THREAD
#define PTHREAD_BARRIER_SERIAL_THREAD 1
#endif
#ifndef PTHREAD_BARRIER_DEFINED
#define PTHREAD_BARRIER_DEFINED
typedef struct {
    pthread_mutex_t mutex;
    pthread_cond_t cond;
    unsigned count;
    unsigned total;
    unsigned phase;
} pthread_barrier_t;
int pthread_barrier_init(pthread_barrier_t* b, const void* attr, unsigned count);
int pthread_barrier_wait(pthread_barrier_t* b);
int pthread_barrier_destroy(pthread_barrier_t* b);
#endif
#endif

#endif /* PTHREAD_BARRIER_COMPAT_H */
