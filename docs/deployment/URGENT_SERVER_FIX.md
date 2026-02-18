# 🚨 URGENT: Server Fix Instructions

## The Problem

The server is serving **SOURCE files** (`main.jsx`) instead of **COMPILED files** (`index-*.js`).

**Evidence:**
- Browser error: "SyntaxError: Unexpected token '<'" at main.jsx:19
- Browser is trying to execute JSX code (React syntax)
- Browsers cannot run JSX - it must be compiled to JavaScript first

**Root Cause:**
Someone uploaded the entire project folder (including `src/` and source `index.html`) instead of just the `dist/` folder contents.

---

## 🔧 IMMEDIATE FIX (On Server)

### Option 1: Quick Fix - Delete Wrong Files, Upload Correct Ones

**Step 1: SSH to server**
```bash
ssh buzzscud@voynich.online
cd /var/www/html/trading/
```

**Step 2: Check what's currently deployed**
```bash
# This will show if wrong files are deployed
cat index.html | grep -E "src=|href="

# If you see "./src/main.jsx" - WRONG FILES ARE DEPLOYED
# You should see "./js/index-*.js" - CORRECT
```

**Step 3: Backup and remove wrong files**
```bash
# Backup current (broken) deployment
sudo mv /var/www/html/trading /var/www/html/trading.broken.backup

# Create fresh directory
sudo mkdir -p /var/www/html/trading
sudo chown buzzscud:www-data /var/www/html/trading
```

**Step 4: Upload ONLY dist/ contents**

From your LOCAL machine (development):
```bash
cd "/Users/christiantavarez/Downloads/CODING /NOV 17 PROJECT"

# Make sure build is current
npm run build

# Upload ONLY dist/ contents
scp -r dist/* buzzscud@voynich.online:/var/www/html/trading/
scp dist/.htaccess buzzscud@voynich.online:/var/www/html/trading/
```

**Step 5: Set permissions (on server)**
```bash
ssh buzzscud@voynich.online
cd /var/www/html/trading/
sudo chown -R www-data:www-data .
sudo find . -type d -exec chmod 755 {} \;
sudo find . -type f -exec chmod 644 {} \;
```

**Step 6: Verify fix**
```bash
# Check index.html references compiled JS
cat /var/www/html/trading/index.html | grep "script"
# Should show: <script type="module" crossorigin src="./js/index-*.js">
# Should NOT show: src="./src/main.jsx"
```

---

### Option 2: If Using Git in Production Directory

If `/var/www/html/trading/` is a git clone:

**Step 1: Fix git pull conflict**
```bash
cd /var/www/html/trading/
git restore .htaccess public/.htaccess
git pull
```

**Step 2: Build on server (if Node.js is installed)**
```bash
npm install
npm run build
```

**Step 3: Copy dist/ contents to web root**
```bash
# If trading/ IS the git repo, copy dist contents to a different location
# OR if you want to serve from trading/, use a symlink or copy

# Option A: Replace trading/ contents with dist/
rm -rf /var/www/html/trading/*
cp -r dist/* /var/www/html/trading/
cp dist/.htaccess /var/www/html/trading/
```

---

## ✅ Verification Checklist

After fixing, verify:

1. **Check index.html on server:**
   ```bash
   cat /var/www/html/trading/index.html | grep "script"
   ```
   - ✅ Should contain: `src="./js/index-` (compiled JS)
   - ❌ Should NOT contain: `src="./src/main.jsx"` (source JSX)

2. **Check file structure:**
   ```bash
   ls -la /var/www/html/trading/
   ```
   - ✅ Should have: `index.html`, `js/`, `css/`, `assets/`, `.htaccess`
   - ❌ Should NOT have: `src/`, `node_modules/`, `package.json`

3. **Test in browser:**
   - Clear cache: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Visit: https://voynich.online/trading/
   - Open DevTools (F12) → Console tab
   - ✅ No "Unexpected token '<'" errors
   - ✅ Application loads and renders

---

## 📁 What Files SHOULD Be on Server

```
/var/www/html/trading/
├── index.html              ← Compiled version (references ./js/index-*.js)
├── .htaccess               ← Apache configuration
├── js/
│   ├── index-KpUJRoaM.js   ← Main compiled JavaScript
│   ├── vendor-react-*.js   ← React vendor chunk
│   ├── vendor-charts-*.js  ← Charts vendor chunk
│   ├── vendor-misc-*.js    ← Other vendor chunk
│   └── vendor-apex-*.js    ← ApexCharts vendor chunk
├── css/
│   └── index-*.css         ← Compiled CSS
└── assets/
    └── vite-*.svg          ← Static assets
```

## ❌ What Files Should NOT Be on Server

- `src/` folder (source code)
- `node_modules/` folder
- `package.json`, `package-lock.json`
- `vite.config.js`
- Root `index.html` (the one that references `./src/main.jsx`)

---

## Prevention: Future Deployments

Always deploy from the `dist/` folder ONLY:

```bash
# On development machine
cd "/Users/christiantavarez/Downloads/CODING /NOV 17 PROJECT"

# Build
npm run build

# Deploy ONLY dist/ contents
scp -r dist/* buzzscud@voynich.online:/var/www/html/trading/
scp dist/.htaccess buzzscud@voynich.online:/var/www/html/trading/

# Set permissions on server
ssh buzzscud@voynich.online "sudo chown -R www-data:www-data /var/www/html/trading/"
```

Or use the deployment script:
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

