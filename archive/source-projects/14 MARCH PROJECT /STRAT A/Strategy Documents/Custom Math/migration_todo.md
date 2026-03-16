# Complete Build System Migration - Task List

## Phase 1: Update All Include Paths ✅ COMPLETE
- [x] Update app/Makefile to use cllm/include/ai
- [x] Update demos/Makefile to use cllm/include/ai
- [x] Update tools/Makefile to use cllm/include/ai
- [x] Update tests/Makefile to use cllm/include/ai
- [x] Update all source files in app/ to use new paths
- [x] Update all source files in demos/ to use new paths
- [x] Update all source files in tools/ to use new paths
- [x] Update all source files in tests/ to use new paths

## Phase 2: Fix Compiler Warnings 🔄 IN PROGRESS
- [x] Add missing #include <math.h> in CLLM files
- [x] Fix CLLM batch iterator declarations
- [x] Fix visualization legacy includes
- [ ] Add #include <math.h> in algorithms files:
  - [ ] geometric_space_ops.c
  - [ ] hierarchical_memory.c
  - [ ] threading_integration.c
  - [ ] hierarchical_threading.c
- [ ] Remove _GNU_SOURCE redefinitions
- [ ] Fix unused parameters (mark with (void))

## Phase 3: Remove Legacy Directories ✅ COMPLETE
- [x] Move src/ai/ to .legacy_backup/
- [x] Move src/docproc/ to .legacy_backup/
- [x] Move src/core/ to .legacy_backup/
- [x] Move src/geometry/ to .legacy_backup/
- [x] Move include/ to .legacy_backup/
- [x] Update main Makefile to remove references

## Phase 4: Clean Build and Testing ⏳ PENDING
- [ ] Complete Phase 2 fixes
- [ ] make clean
- [ ] make -j4 (verify no errors)
- [ ] Verify all libraries created
- [ ] Build app (optional)
- [ ] Build demos (optional)
- [ ] Build tools (optional)
- [ ] Run test suite (optional)

## Phase 5: Git Commit ⏳ PENDING
- [ ] Commit all changes
- [ ] Push to GitHub
- [ ] Create final summary document

## Current Status
**Phase 1:** ✅ Complete  
**Phase 2:** 🔄 70% Complete (math.h warnings remain)  
**Phase 3:** ✅ Complete  
**Phase 4:** ⏳ Waiting on Phase 2  
**Phase 5:** ⏳ Waiting on Phase 4