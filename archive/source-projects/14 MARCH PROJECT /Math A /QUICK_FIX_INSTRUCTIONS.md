# Quick Fix Instructions - PHP Extension Build Error

## Your Error
```
/usr/bin/ld: cannot find .libs/crystalline_math_extension.o: No such file or directory
```

## Quick Fix (Run These Commands)

```bash
# Navigate to your crystalline directory
cd /home/logan/code/C/crystalline

# Pull the latest fixes
git pull

# Run the rebuild scripts
cd php/math
./rebuild.sh

cd ../algorithms
./rebuild.sh

# Go back to root and build everything
cd ../..
make
```

## What This Does

1. **Pulls the latest fixes** including:
   - Enhanced `make clean` that properly cleans PHP extensions
   - Rebuild scripts that regenerate Makefiles with correct paths
   - Improved error handling

2. **Rebuilds PHP extensions** with correct paths for your system:
   - Cleans old build artifacts
   - Runs `phpize --clean` to remove generated files
   - Regenerates configuration with `phpize`
   - Configures with `./configure`
   - Builds with `make`

3. **Builds the entire project** with all components

## Expected Result

You should see:
```
✓ Math library built successfully
✓ Algorithms shared library created
✓ Algorithms static library created
✓ CLLM shared library created
✓ crystalline_math extension built
✓ algorithms extension built
✓ All PHP extensions built successfully
✓ Build complete!
```

## If You Still Have Issues

1. **Make sure you have PHP development tools:**
   ```bash
   # On Arch Linux
   sudo pacman -S php php-devel

   # On Ubuntu/Debian
   sudo apt-get install php-dev

   # On CentOS/RHEL
   sudo yum install php-devel
   ```

2. **Check that phpize is available:**
   ```bash
   which phpize
   phpize --version
   ```

3. **Try a complete clean rebuild:**
   ```bash
   make clean
   cd php/math && ./rebuild.sh
   cd ../algorithms && ./rebuild.sh
   cd ../.. && make
   ```

## Alternative: Build Without PHP Extensions

If you don't need PHP extensions, you can build just the core libraries:

```bash
make clean
make math
make algorithms
make cllm
```

## Why This Happened

The PHP extension Makefiles were generated in my environment (`/workspace`) and contained hardcoded absolute paths. When you tried to build in your environment (`/home/logan/code/C/crystalline`), these paths were wrong, causing the compilation step to be skipped.

The rebuild scripts regenerate these Makefiles with the correct paths for your system.

## Need More Help?

See `PHP_BUILD_TROUBLESHOOTING.md` for detailed explanations and additional troubleshooting steps.