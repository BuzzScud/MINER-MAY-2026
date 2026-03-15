# Miner behavior analysis

## How the miner works

1. **Start mining** (UI): You must set a **mining address** (Bitcoin address). Without it, "Start mining" returns "Mining address required" and nothing runs.

2. **Connection**: The miner needs a running **Bitcoin Core** node and correct **RPC settings** (host, port, and either cookie file or user/password). Each round it calls `getblocktemplate`. If that fails (node not running, wrong port, auth failure), you see "RPC error: ..." in the mining log and **no hashing is done** — the loop waits 5s and retries.

3. **Mining loop** (unified mode, default):
   - **Phase 1**: Tries 1–2 "minimal" nonces (thesis entropy‑reduced). That is only **1–2 hashes** per round.
   - **Phase 2**: Builds a candidate list from base nonce + recovery using sphere-hopping ordering (12 spheres, duality, golden-ratio spiral), matching the thesis and the C miner's memory-hopping sphere hierarchy. Then either:
     - **Single worker**: Iterates over candidates, hashing each.
     - **Multiple workers**: Spawns processes; each hashes its share of candidates and updates a shared hash count.

4. **Why you might not see hashes or nonce progress**
   - **RPC failing**: If `getblocktemplate` always fails, the miner never reaches hashing. Check the **Mining log** for "RPC error". Fix: run Bitcoin Core, set the correct network (mainnet/testnet/regtest), and ensure RPC is enabled and the UI’s host/port/auth match.
   - **Stats update interval**: The UI was only updated every **10,000 hashes**, so Phase 1 (1–2 hashes) and the first part of Phase 2 showed as "Mining… (waiting for first hashes)". This is fixed so stats (and nonce progress) update much more often (every 100 hashes or 0.5s).
   - **Phase 1 only**: With 1–2 hashes per round and a new template each round, hashrate stays very low until Phase 2 runs. Phase 2 does the main nonce search (candidate list + hashing).

## What you should see when it’s working

- **Mining log**: "New round: fetching template and mining." → "Template: height N, bits XXXXXXXX" → "Phase 1: trying 2 minimal nonce(s)." → "Phase 1: 2 hash(es), no solution." → "Phase 2: searching thesis candidates…" (and, with workers, "Phase 2: spawning N workers.").
- **Stats**: Hashrate (H/s), Hashes, Nonce progress (% of 32‑bit), updating every few hundred hashes or every 0.5s.

## Entropy bounds and recovery

- **Entropy bounds** (`BTC_ENTROPY_CUT_MIN`, `BTC_ENTROPY_CUT_MAX`; default 0.18–0.45): Control how much the thesis nonce pipeline concentrates the search from the raw tetration output. Difficulty maps into this range (higher difficulty → higher entropy factor → more leading-zero bias). This is the miner’s “thesis tuning” for search concentration; it does not reduce the protocol nonce space (thesis ch.15 unbiased search is preserved).
- **Recovery** (OBJECTIVE 28): When the recovery lib is available (`c. math`/librecovery_core), Phase 1 gets a second suggested nonce in addition to the deterministic base nonce. So the minimal set is 1–2 nonces before expanding to the full candidate list. Conceptually this is analogous to a “second opinion” before committing to the full search (strategy-side analogy only; mining logic is unchanged).

## Quick checklist

| Check | Action |
|-------|--------|
| Mining address set? | Set a valid Bitcoin address in the UI before Start mining. |
| Bitcoin Core running? | Start bitcoind (or Bitcoin Core GUI) and wait for it to sync if needed. |
| RPC reachable? | In the UI, use the same host/port as in bitcoin.conf (e.g. 127.0.0.1:8332 mainnet). |
| Cookie or auth? | Use .cookie path for default datadir, or set rpcuser/rpcpassword in UI if you use them. |
| Mining log | Open the Mining log section; look for "RPC error" or "Template: height" to see if templates are fetched. |
