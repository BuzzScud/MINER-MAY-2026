#!/usr/bin/env bash
# Start Sentiment API (uvicorn). Uses .venv if present.
cd "$(dirname "$0")/../archive/source-projects/SENTIMENT INDICATOR - 2026"
if [ -x ".venv/bin/python" ]; then
  exec .venv/bin/python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
elif [ -x ".venv/Scripts/python.exe" ]; then
  exec .venv/Scripts/python.exe -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
else
  exec uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
fi
