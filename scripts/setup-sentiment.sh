#!/usr/bin/env bash
# One-shot setup for Sentiment page: Node deps, Python venv, pip packages, NLTK, .env, and optional DB migrations.
# Run from project root: ./scripts/setup-sentiment.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SENTIMENT_DIR="$PROJECT_ROOT/archive/source-projects/SENTIMENT INDICATOR - 2026"

cd "$PROJECT_ROOT"

# --- Resolve npm ---
source_node_env() {
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
    [ -f "$PROJECT_ROOT/.nvmrc" ] && nvm use 2>/dev/null || true
  elif command -v fnm &>/dev/null; then
    eval "$(fnm env)"
    [ -f "$PROJECT_ROOT/.nvmrc" ] && fnm use 2>/dev/null || true
  elif [ -s "$HOME/.asdf/asdf.sh" ]; then
    . "$HOME/.asdf/asdf.sh"
  fi
}

NPM_CMD=""
source_node_env
if command -v npm &>/dev/null; then
  NPM_CMD="npm"
elif [ -d "$HOME/.nvm/versions/node" ]; then
  for dir in "$HOME/.nvm/versions/node"/*/bin; do
    if [ -x "$dir/npm" ]; then
      NPM_CMD="$dir/npm"
      break
    fi
  done
fi
[ -z "$NPM_CMD" ] && [ -x "/usr/local/bin/npm" ] && NPM_CMD="/usr/local/bin/npm"

if [ -z "$NPM_CMD" ]; then
  echo "Warning: npm not found. Skipping npm install. Run ./scripts/run-dev.sh to use nvm/fnm first."
else
  echo "Installing Node dependencies..."
  "$NPM_CMD" install
fi

# --- Sentiment Python venv ---
if [ ! -d "$SENTIMENT_DIR" ]; then
  echo "Error: Sentiment project not found at $SENTIMENT_DIR"
  exit 1
fi

cd "$SENTIMENT_DIR"

if [ ! -d ".venv" ]; then
  echo "Creating Sentiment Python venv..."
  python3 -m venv .venv
fi

echo "Installing Python dependencies..."
if [ -x ".venv/bin/pip" ]; then
  .venv/bin/pip install -r backend/requirements.txt -q
else
  .venv/Scripts/pip.exe install -r backend/requirements.txt -q
fi

echo "Downloading NLTK vader_lexicon..."
if [ -x ".venv/bin/python" ]; then
  .venv/bin/python -m nltk.downloader vader_lexicon -q 2>/dev/null || .venv/bin/python -c "import nltk; nltk.download('vader_lexicon', quiet=True)"
else
  .venv/Scripts/python.exe -m nltk.downloader vader_lexicon -q 2>/dev/null || .venv/Scripts/python.exe -c "import nltk; nltk.download('vader_lexicon', quiet=True)"
fi

# --- .env ---
if [ ! -f ".env" ]; then
  echo "Creating .env from backend/.env.example..."
  cp backend/.env.example .env
  echo "Edit $SENTIMENT_DIR/.env to set DATABASE_URL (e.g. postgresql://localhost:5433/algonov26 for main app DB) and optional API keys."
else
  echo ".env already exists."
fi

# --- Alembic migrations (optional) ---
PYTHON_EXE=""
[ -x ".venv/bin/python" ] && PYTHON_EXE=".venv/bin/python"
[ -x ".venv/Scripts/python.exe" ] && PYTHON_EXE=".venv/Scripts/python.exe"
if [ -n "$PYTHON_EXE" ]; then
  echo "Running Alembic migrations..."
  PYTHONPATH=. "$PYTHON_EXE" -m alembic upgrade head 2>/dev/null || echo "Note: Migrations may fail if Postgres is not running or DB does not exist. See archive/source-projects/SENTIMENT INDICATOR - 2026/README.md"
else
  echo "Create DB and run: cd \"$SENTIMENT_DIR\" && PYTHONPATH=. .venv/bin/python -m alembic upgrade head"
fi

echo ""
echo "Setup complete. Start dev with: ./scripts/run-dev.sh  (or npm run dev)"
