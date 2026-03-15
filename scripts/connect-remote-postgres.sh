#!/bin/bash

# =============================================================================
# CONNECT THIS MAC TO POSTGRESQL ON ANOTHER MAC
# =============================================================================
#
# USE ON THIS MAC (client): run this script to test or open a session.
#
# PREREQUISITES ON THIS MAC:
#   1. Install PostgreSQL client (psql):
#      - Homebrew:  brew install libpq && brew link --force libpq
#      - Or install full Postgres:  brew install postgresql@16
#   2. Set the variables below (or export them before running).
#
# ON THE OTHER MAC (server where Postgres runs):
#   1. postgresql.conf:  listen_addresses = '*'
#   2. pg_hba.conf:  add line like:
#        host  all  all  192.168.0.0/16  scram-sha-256
#      (adjust 192.168.0.0/16 to your LAN, e.g. 10.0.0.0/8)
#   3. Restart Postgres; allow port 5432 in firewall.
#
# =============================================================================

set -e

# --- CONFIGURE THESE (or export before running) ---
REMOTE_HOST="${PGHOST:-}"          # Other Mac's IP or hostname, e.g. 192.168.1.50
REMOTE_PORT="${PGPORT:-5432}"
REMOTE_USER="${PGUSER:-}"
REMOTE_DB="${PGDATABASE:-postgres}"

# Prompt if not set
if [[ -z "$REMOTE_HOST" ]]; then
  echo "Enter the other Mac's IP or hostname (e.g. 192.168.1.50):"
  read -r REMOTE_HOST
fi
if [[ -z "$REMOTE_USER" ]]; then
  echo "Enter PostgreSQL username:"
  read -r REMOTE_USER
fi

export PGHOST="$REMOTE_HOST"
export PGPORT="$REMOTE_PORT"
export PGUSER="$REMOTE_USER"
export PGDATABASE="$REMOTE_DB"

echo "Connecting to $REMOTE_USER@$REMOTE_HOST:$REMOTE_PORT/$REMOTE_DB ..."
echo ""

# Test connection (will prompt for password)
psql -c "SELECT current_database(), current_user, inet_server_addr();"

echo ""
echo "Connection OK. Opening interactive psql session (exit with \\q)."
exec psql
