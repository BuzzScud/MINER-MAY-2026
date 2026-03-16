# Legacy Directory Cleanup Plan

## Current Situation

After the build reorganization, we have:
- ✅ **CLLM library** builds from `cllm/` directory
- ✅ **Crawler and document processing** integrated into CLLM
- ❌ **Legacy directories** still exist: `src/ai/`, `include/`, `src/docproc/`, etc.
- ❌ **App, demos, tools, tests** still reference root `include/` directory

## Legacy Directories Found

```
src/
├── ai/              # OLD CLLM sources (now in cllm/src/)
├── core/            # Unknown purpose
├── docproc/         # OLD document processing (now in cllm/src/document_processing/)
├── geometry/        # Unknown purpose
└── include/         # Unknown purpose

include/
├── ai/              # OLD CLLM headers (now in cllm/include/ai/)
├── algorithms/      # Symlink or old headers?
└── *.h              # OLD CLLM headers (now in cllm/include/ai/)
```

## Dependencies on Root include/

The following components still use `../include/`:
- **app/** - Main application (uses `-I../include`)
- **demos/** - Demo programs
- **tools/** - Utility tools
- **tests/** - Test suite

## Cleanup Options

### Option 1: Complete Migration (Recommended)
**Goal:** Remove all legacy directories and update all references

**Steps:**
1. Update all Makefiles to use `-I../cllm/include/ai` instead of `-I../include`
2. Update all `#include` statements in app, demos, tools, tests
3. Remove legacy directories: `src/ai/`, `include/`, `src/docproc/`
4. Verify all builds still work

**Pros:**
- Clean, single source of truth
- No confusion about which headers to use
- Smaller codebase

**Cons:**
- Requires updating many files
- Risk of breaking something

### Option 2: Compatibility Layer (Quick Fix)
**Goal:** Keep root `include/` as a compatibility layer with symlinks

**Steps:**
1. Remove all files from root `include/`
2. Create symlinks: `include/ai/ -> ../cllm/include/ai/`
3. Keep legacy directories but mark as deprecated
4. Gradually migrate over time

**Pros:**
- Minimal immediate changes
- Backward compatible
- Lower risk

**Cons:**
- Maintains technical debt
- Confusing for new developers
- Two ways to include headers

### Option 3: Hybrid Approach (Balanced)
**Goal:** Clean up unused code, keep compatibility for active components

**Steps:**
1. Identify and remove truly unused code in `src/ai/`, `src/docproc/`
2. Keep root `include/` for now with symlinks to `cllm/include/ai/`
3. Add deprecation warnings in documentation
4. Plan gradual migration in future

**Pros:**
- Removes dead code
- Maintains stability
- Clear migration path

**Cons:**
- Still some technical debt
- Requires careful analysis

## Recommended Action: Option 3 (Hybrid)

**Phase 1: Immediate (Safe)**
1. Verify `src/ai/` is not used by checking compilation
2. If unused, move to `src/ai.backup/` (don't delete yet)
3. Do the same for `src/docproc/`
4. Keep root `include/` as-is for now

**Phase 2: Future (When Time Permits)**
1. Update app/Makefile to use `-I../cllm/include/ai`
2. Update all app source files
3. Repeat for demos, tools, tests
4. Remove root `include/` directory
5. Delete backup directories

## Verification Commands

```bash
# Check if src/ai/ is referenced in Makefiles
grep -r "src/ai" Makefile */Makefile

# Check if src/ai/ is referenced in source files
find . -name "*.c" -exec grep -l "src/ai" {} \;

# Check what's using root include/
grep -r "\-I\.\./include\|\-I\./include" */Makefile

# Check include statements
find app demos tools tests -name "*.c" -exec grep -l "#include &quot;cllm" {} \;
```

## Decision Required

Before proceeding with cleanup, we need to decide:
1. Is immediate cleanup critical, or can it wait?
2. What's the risk tolerance for breaking changes?
3. How much time is available for testing after changes?

**Current Recommendation:** Keep legacy directories for now, focus on ensuring the new structure works perfectly. Clean up later when there's time for thorough testing.