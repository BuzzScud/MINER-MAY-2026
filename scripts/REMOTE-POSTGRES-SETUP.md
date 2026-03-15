# Connect this Mac to PostgreSQL on another Mac

## On this Mac (client – where you run the script)

1. **Install the PostgreSQL client** (so you have `psql`):
   ```bash
   brew install libpq
   brew link --force libpq
   ```
   Or install full Postgres: `brew install postgresql@16`

2. **Get the other Mac’s IP or hostname**
   - On the other Mac: System Settings → Network, or run `ifconfig | grep "inet "` and use the LAN IP (e.g. `192.168.1.50`).

3. **Run the connection script**
   ```bash
   ./scripts/connect-remote-postgres.sh
   ```
   When prompted, enter the other Mac’s IP/hostname, your Postgres username, and the database name (or accept default `postgres`). You’ll be asked for the password.

   **Or** set variables and run:
   ```bash
   export PGHOST=192.168.1.50
   export PGUSER=myuser
   export PGDATABASE=mydb
   ./scripts/connect-remote-postgres.sh
   ```

4. **Use in an app**  
   Use this connection string (replace placeholders):
   ```
   postgresql://USER:PASSWORD@OTHER_MAC_IP:5432/DATABASE
   ```

---

## On the other Mac (server – where PostgreSQL runs)

1. **Edit `postgresql.conf`**
   - Find it with: `psql -U postgres -c "SHOW config_file;"`
   - Set: `listen_addresses = '*'` (or e.g. `'localhost,192.168.1.50'`)
   - Restart PostgreSQL.

2. **Edit `pg_hba.conf`**
   - Same directory as `postgresql.conf`, or: `psql -U postgres -c "SHOW hba_file;"`
   - Add a line like (use your LAN subnet):
     ```
     host  all  all  192.168.0.0/16  scram-sha-256
     ```
   - Reload: `pg_ctl reload` or restart the Postgres service.

3. **Firewall**
   - Allow inbound TCP on port **5432** (System Settings → Network → Firewall, or `pf` rules).

4. **Same network**
   - Both Macs must be on the same LAN (or reachable via VPN) so this Mac can reach the server’s IP.
