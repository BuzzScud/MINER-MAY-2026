#!/bin/bash

echo "🚀 RocketBot Dashboard Diagnostics"
echo "=================================="
echo ""

# Check if server is running
echo "1. Checking if server is running on port 8080..."
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/ | grep -q "200"; then
    echo "   ✓ Server is running (HTTP 200)"
else
    echo "   ✗ Server is NOT running or not responding"
    echo "   → Start the server with: python -m quantbot.server"
    exit 1
fi
echo ""

# Check static files
echo "2. Checking static files..."
for file in "/static/css/output.css" "/static/js/preline.js" "/static/js/dashboard.js"; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8080${file}")
    if [ "$status" = "200" ]; then
        echo "   ✓ ${file} - ${status}"
    else
        echo "   ✗ ${file} - ${status}"
    fi
done
echo ""

# Check API endpoints
echo "3. Checking API endpoints..."
for endpoint in "/api/state" "/api/settings" "/api/strategies"; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8080${endpoint}")
    if [ "$status" = "200" ]; then
        echo "   ✓ ${endpoint} - ${status}"
    else
        echo "   ✗ ${endpoint} - ${status}"
    fi
done
echo ""

# Check file sizes
echo "4. Checking file sizes..."
if [ -f "quantbot/static/js/dashboard.js" ]; then
    size=$(wc -c < "quantbot/static/js/dashboard.js")
    echo "   dashboard.js: ${size} bytes"
    if [ $size -lt 1000 ]; then
        echo "   ⚠ Warning: File seems too small!"
    fi
fi

if [ -f "quantbot/static/js/preline.js" ]; then
    size=$(wc -c < "quantbot/static/js/preline.js")
    echo "   preline.js: ${size} bytes"
fi

if [ -f "quantbot/static/css/output.css" ]; then
    size=$(wc -c < "quantbot/static/css/output.css")
    echo "   output.css: ${size} bytes"
fi
echo ""

# Download and check HTML
echo "5. Checking HTML structure..."
html=$(curl -s http://127.0.0.1:8080/)
if echo "$html" | grep -q "dashboard.js"; then
    echo "   ✓ dashboard.js referenced in HTML"
else
    echo "   ✗ dashboard.js NOT found in HTML"
fi

if echo "$html" | grep -q "socket.io"; then
    echo "   ✓ Socket.IO referenced in HTML"
else
    echo "   ✗ Socket.IO NOT found in HTML"
fi

if echo "$html" | grep -q "RocketBot"; then
    echo "   ✓ Page title found"
else
    echo "   ✗ Page title NOT found"
fi
echo ""

echo "6. Opening diagnostic page in browser..."
echo "   → http://127.0.0.1:8080/"
echo "   → file://$(pwd)/test_dashboard.html"
echo ""
echo "Please:"
echo "  1. Open http://127.0.0.1:8080/ in your browser"
echo "  2. Press F12 to open Developer Tools"
echo "  3. Check the Console tab for red errors"
echo "  4. Check the Network tab for failed requests (red status codes)"
echo "  5. Open test_dashboard.html for automated diagnostics"
echo ""
echo "Common issues:"
echo "  • JavaScript errors preventing initialization"
echo "  • WebSocket connection failures"
echo "  • CORS issues (check console for CORS errors)"
echo "  • Missing or incorrect static file paths"
