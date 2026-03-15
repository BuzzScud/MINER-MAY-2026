#!/usr/bin/env bash
# Ensures Node/npm are in PATH (e.g. when using nvm, fnm, asdf) then starts dev server + Sentiment API.
# Use this if you see "zsh: command not found: npm" in the terminal.

set -e

# Source Node version managers (in order of preference)
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
  [ -s "$HOME/.nvm/bash_completion" ] && . "$HOME/.nvm/bash_completion"
  [ -f .nvmrc ] && nvm use 2>/dev/null || true
elif command -v fnm &>/dev/null; then
  eval "$(fnm env)"
  [ -f .nvmrc ] && fnm use 2>/dev/null || true
elif [ -s "$HOME/.asdf/asdf.sh" ]; then
  . "$HOME/.asdf/asdf.sh"
fi

# Resolve npm: try PATH, then common locations
NPM_CMD=""
if command -v npm &>/dev/null; then
  NPM_CMD="npm"
elif [ -n "$NVM_BIN" ] && [ -x "$NVM_BIN/npm" ]; then
  NPM_CMD="$NVM_BIN/npm"
elif [ -d "$HOME/.nvm/versions/node" ]; then
  for dir in "$HOME/.nvm/versions/node"/*/bin; do
    if [ -x "$dir/npm" ]; then
      NPM_CMD="$dir/npm"
      break
    fi
  done
fi

if [ -z "$NPM_CMD" ] && [ -x "/usr/local/bin/npm" ]; then
  NPM_CMD="/usr/local/bin/npm"
fi

if [ -z "$NPM_CMD" ]; then
  echo "Error: npm not found."
  echo ""
  echo "Install Node.js 18+ first:"
  echo "  - https://nodejs.org/"
  echo "  - Homebrew: brew install node"
  echo "  - nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
  echo ""
  exit 1
fi

exec "$NPM_CMD" run dev
