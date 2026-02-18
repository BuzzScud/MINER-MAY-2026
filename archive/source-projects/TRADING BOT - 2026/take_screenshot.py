#!/usr/bin/env python3
"""
Simple screenshot tool for the trading bot dashboard.
Takes a screenshot and checks for JavaScript errors.
"""
import sys
import time
from pathlib import Path

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    HAS_SELENIUM = True
except ImportError:
    HAS_SELENIUM = False
    print("❌ Selenium not installed. Install with: pip install selenium")
    print("   Also need ChromeDriver: brew install chromedriver")

def take_screenshot_selenium():
    """Take screenshot using Selenium."""
    print("🚀 Taking screenshot with Selenium...")
    
    # Setup Chrome options
    chrome_options = Options()
    chrome_options.add_argument('--headless=new')
    chrome_options.add_argument('--window-size=1920,1080')
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    
    driver = None
    try:
        driver = webdriver.Chrome(options=chrome_options)
        
        # Navigate to dashboard
        print("📡 Navigating to http://127.0.0.1:8080...")
        driver.get('http://127.0.0.1:8080')
        
        # Wait for page to load
        print("⏳ Waiting for page to load...")
        time.sleep(3)
        
        # Check for JavaScript errors in console
        print("\n📋 Checking browser console...")
        logs = driver.get_log('browser')
        
        errors = [log for log in logs if log['level'] == 'SEVERE']
        warnings = [log for log in logs if log['level'] == 'WARNING']
        
        if errors:
            print(f"\n❌ Found {len(errors)} JavaScript errors:")
            for error in errors:
                print(f"   • {error['message']}")
        else:
            print("   ✓ No JavaScript errors found")
        
        if warnings:
            print(f"\n⚠️  Found {len(warnings)} warnings:")
            for warning in warnings[:5]:  # Show first 5
                print(f"   • {warning['message']}")
        
        # Get page title
        title = driver.title
        print(f"\n📄 Page title: {title}")
        
        # Check if key elements exist
        print("\n🔍 Checking for key elements...")
        elements_to_check = [
            ('chartsRow', 'Charts container'),
            ('metricsGrid', 'Metrics grid'),
            ('activityLog', 'Activity log'),
            ('marketOverviewBody', 'Market overview'),
            ('connectionStatus', 'Connection status'),
        ]
        
        for elem_id, name in elements_to_check:
            try:
                elem = driver.find_element(By.ID, elem_id)
                is_visible = elem.is_displayed()
                has_content = bool(elem.text.strip() or elem.get_attribute('innerHTML').strip())
                status = "✓ visible" if is_visible else "✗ hidden"
                content = "with content" if has_content else "EMPTY"
                print(f"   {status} - {name} ({content})")
            except Exception as e:
                print(f"   ✗ NOT FOUND - {name}")
        
        # Check connection status text
        try:
            conn_status = driver.find_element(By.ID, 'connectionStatusText')
            print(f"\n🔌 Connection Status: {conn_status.text}")
        except:
            print("\n🔌 Connection Status: NOT FOUND")
        
        # Take screenshot
        screenshot_path = Path('dashboard_screenshot.png')
        driver.save_screenshot(str(screenshot_path))
        print(f"\n📸 Screenshot saved to: {screenshot_path.absolute()}")
        
        # Get full page height for full-page screenshot
        total_height = driver.execute_script("return document.body.scrollHeight")
        driver.set_window_size(1920, total_height)
        time.sleep(1)
        
        full_screenshot_path = Path('dashboard_full_screenshot.png')
        driver.save_screenshot(str(full_screenshot_path))
        print(f"📸 Full-page screenshot saved to: {full_screenshot_path.absolute()}")
        
        # Get network requests (if available)
        print("\n🌐 Checking network requests...")
        performance_logs = driver.get_log('performance')
        
        # Count requests by status
        failed_requests = []
        for log in performance_logs:
            import json
            try:
                message = json.loads(log['message'])
                method = message.get('message', {}).get('method', '')
                
                if method == 'Network.responseReceived':
                    response = message['message']['params']['response']
                    url = response.get('url', '')
                    status = response.get('status', 0)
                    
                    if status >= 400 and ('static' in url or 'api' in url):
                        failed_requests.append((url, status))
            except:
                pass
        
        if failed_requests:
            print(f"   ❌ Found {len(failed_requests)} failed requests:")
            for url, status in failed_requests[:10]:
                print(f"      {status} - {url}")
        else:
            print("   ✓ No failed requests detected")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        if driver:
            driver.quit()

def main():
    """Main function."""
    if not HAS_SELENIUM:
        sys.exit(1)
    
    print("=" * 60)
    print("🚀 RocketBot Dashboard Screenshot & Diagnostic Tool")
    print("=" * 60)
    print()
    
    success = take_screenshot_selenium()
    
    if success:
        print("\n" + "=" * 60)
        print("✅ Screenshot complete!")
        print("=" * 60)
        print("\nNext steps:")
        print("  1. Open dashboard_screenshot.png to see the current state")
        print("  2. Review the console errors above")
        print("  3. Check the Network tab in your browser (F12)")
        print("  4. Look for any red errors in the JavaScript console")
    else:
        print("\n" + "=" * 60)
        print("❌ Screenshot failed")
        print("=" * 60)
        sys.exit(1)

if __name__ == '__main__':
    main()
