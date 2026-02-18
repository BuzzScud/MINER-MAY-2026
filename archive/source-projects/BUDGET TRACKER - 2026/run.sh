#!/bin/bash

# Budget Tracker Startup Script

echo "Starting Budget Tracker..."

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Create data directory if it doesn't exist
mkdir -p data

# Start Flask server
echo "Starting Flask server on http://localhost:5000"
python app.py

