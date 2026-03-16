# REST API Troubleshooting Guide

## 500 Internal Server Error - Common Causes

### 1. PHP Extensions Not Loaded

**Check if extensions are loaded:**
```bash
php -m | grep crystalline
php -m | grep algorithms
```

**If not loaded, add to php.ini:**
```bash
# Find your php.ini
php --ini

# Add these lines:
extension=crystalline_math.so
extension=algorithms.so

# Restart web server
sudo systemctl restart apache2  # or nginx/php-fpm
```

**For Apache with multiple PHP versions:**
```bash
# Check which PHP version Apache uses
apache2 -V | grep SERVER_CONFIG_FILE
php -v

# Make sure extensions are in the correct directory
php -i | grep extension_dir

# Copy extensions if needed
sudo cp /usr/lib/php/20220829/crystalline_math.so /usr/lib/php/modules/
sudo cp /usr/lib/php/20220829/algorithms.so /usr/lib/php/modules/
```

### 2. Check Extension Configuration

**Create a test file** (`test.php`):
```php
<?php
phpinfo();
```

Look for:
- `crystalline_math` section
- `algorithms` section
- Loaded Configuration File path

### 3. Check Server Error Logs

```bash
# Apache
sudo tail -f /var/log/apache2/error.log

# Nginx
sudo tail -f /var/log/nginx/error.log

# PHP-FPM
sudo tail -f /var/log/php-fpm/error.log
```

### 4. File Permissions

```bash
# Set correct permissions
sudo chmod 755 /var/www/html/math
sudo chmod 644 /var/www/html/math/index.php
sudo chmod 644 /var/www/html/math/calculator.html

# Set correct ownership
sudo chown -R www-data:www-data /var/www/html/math  # Ubuntu/Debian
sudo chown -R apache:apache /var/www/html/math      # CentOS/RHEL
```

### 5. SELinux (CentOS/RHEL)

```bash
# Check if SELinux is blocking
sudo getenforce

# If enforcing, set correct context
sudo chcon -R -t httpd_sys_content_t /var/www/html/math
sudo chcon -t httpd_sys_script_exec_t /var/www/html/math/index.php

# Or temporarily disable for testing
sudo setenforce 0
```

### 6. PHP Configuration

**Check PHP settings:**
```bash
php -i | grep -E "display_errors|error_reporting|log_errors"
```

**Recommended settings for debugging:**
```ini
display_errors = On
error_reporting = E_ALL
log_errors = On
error_log = /var/log/php_errors.log
```

## Quick Diagnostic Steps

### Step 1: Test PHP CLI
```bash
cd /var/www/html/math
php -r "var_dump(extension_loaded('crystalline_math'));"
```

Should output: `bool(true)`

### Step 2: Test API via CLI
```bash
cd /var/www/html/math
php -r "
\$_SERVER['REQUEST_METHOD'] = 'GET';
\$_SERVER['REQUEST_URI'] = '/?operation=debug';
\$_SERVER['SCRIPT_NAME'] = '/index.php';
\$_GET = ['operation' => 'debug'];
include 'index.php';
"
```

Should output JSON with extension info.

### Step 3: Test via Web
```bash
curl http://your-domain.com/math/?operation=debug
```

Should return JSON with:
```json
{
  "success": true,
  "php_version": "8.2.x",
  "extensions": {
    "crystalline_math": true,
    "algorithms": true
  }
}
```

### Step 4: Check test.php
```bash
curl http://your-domain.com/math/test.php
```

## Common Error Messages

### "Crystalline Math extension not loaded"
**Solution:** Install and enable the extension
```bash
sudo make install
echo "extension=crystalline_math.so" | sudo tee -a /etc/php/8.2/apache2/php.ini
echo "extension=algorithms.so" | sudo tee -a /etc/php/8.2/apache2/php.ini
sudo systemctl restart apache2
```

### "Call to undefined function is_prime()"
**Solution:** Extension is loaded but functions aren't available
```bash
# Rebuild and reinstall
cd /path/to/crystalline
make clean && make
sudo make install
sudo systemctl restart apache2
```

### "Permission denied"
**Solution:** Fix file permissions
```bash
sudo chmod -R 755 /var/www/html/math
sudo chown -R www-data:www-data /var/www/html/math
```

## Verification Checklist

- [ ] PHP extensions installed: `ls -la /usr/lib/php/*/crystalline_math.so`
- [ ] Extensions in php.ini: `grep crystalline /etc/php/*/apache2/php.ini`
- [ ] Extensions loaded in CLI: `php -m | grep crystalline`
- [ ] Extensions loaded in web: `curl http://domain.com/math/?operation=debug`
- [ ] File permissions correct: `ls -la /var/www/html/math`
- [ ] SELinux not blocking: `getenforce` (should be Permissive or Disabled)
- [ ] Error logs checked: `tail /var/log/apache2/error.log`

## Still Having Issues?

### Enable Full Error Display (temporarily)
Edit `index.php` and change:
```php
ini_set('display_errors', 0);
```
to:
```php
ini_set('display_errors', 1);
```

Then check the error message in the browser.

### Get Detailed Info
```bash
# Check PHP configuration
php -i > phpinfo.txt

# Check loaded extensions
php -m > extensions.txt

# Check extension functions
php -r "print_r(get_extension_funcs('crystalline_math'));" > functions.txt
```

### Contact Support
Include:
- PHP version: `php -v`
- OS version: `cat /etc/os-release`
- Web server: `apache2 -v` or `nginx -v`
- Error logs: Last 50 lines from error log
- Output of: `curl http://domain.com/math/?operation=debug`

## Quick Fix Script

```bash
#!/bin/bash
# quick-fix.sh - Run this to fix common issues

echo "Checking PHP extensions..."
php -m | grep crystalline || echo "ERROR: Extensions not loaded!"

echo "Checking file permissions..."
ls -la /var/www/html/math/index.php

echo "Fixing permissions..."
sudo chmod 755 /var/www/html/math
sudo chmod 644 /var/www/html/math/*.php
sudo chmod 644 /var/www/html/math/*.html

echo "Checking PHP configuration..."
php -i | grep -E "extension_dir|Loaded Configuration File"

echo "Testing API..."
curl -s http://localhost/math/?operation=debug | jq .

echo "Done! Check output above for errors."
```

Save as `quick-fix.sh`, make executable with `chmod +x quick-fix.sh`, and run with `./quick-fix.sh`.