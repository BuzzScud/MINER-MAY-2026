# BTC Miner Server (Python)

User-friendly, simple, and robust BTC miner that talks to Bitcoin Core via JSON-RPC. Runs on Mac (and other platforms) with **Bitcoin Core** (bitcoind) installed.

## Features

- **getblocktemplate** and **submitblock** to Bitcoin Core
- Double SHA-256 mining loop (header: version, prevblock, merkle root, time, bits, nonce)
- Config via environment or CLI (no hardcoded credentials)
- CLI: status, mine (once or continuous), hashrate display
- **500D lattice**: The nonce search graph is interpreted as a 500-dimensional embedding; the 32-bit nonce is one projection. The miner partitions over the **full 32-bit nonce space** (thesis ch.15 unbiased search): candidate derivation and worker partitioning cover the range by quadrant (4 workers) or chunk (8 workers). This is **partition and thesis-aligned ordering**, not an exhaustive linear sweep over all 4e9 values; there is no linear fallback after thesis candidates.

## Requirements

- Python 3.9+
- Bitcoin Core (bitcoind) running with RPC enabled

## Ready to mine (checklist)

Before mining, complete these 5 steps:

| Step | What to do | How the miner uses it |
|------|------------|------------------------|
| 1. Install Bitcoin Core | Download and install from bitcoin.org | Miner connects via JSON-RPC; Core must be installed separately |
| 2. Run bitcoind | `bitcoind -regtest -daemon` (or mainnet/testnet) | Miner connects to RPC; node must be running |
| 3. Add RPC settings to bitcoin.conf | `server=1`, `rpcuser`, `rpcpassword`, `rpcallowip=127.0.0.1` | Miner can auto-read from default datadir, or use .cookie; you create the file |
| 4. Generate mining address | `bitcoin-cli -regtest getnewaddress` | Required for coinbase payout; miner rejects start without it |
| 5. Pass credentials and address | Env: `BTC_RPC_USER`, `BTC_RPC_PASSWORD`, `BTC_MINING_ADDRESS` — or CLI `--user`, `--password`, `--address` — or Web UI form | Miner reads from env, CLI args, or Web UI |

**Auth fallback (no credentials passed):** If you omit user/password, the miner tries: (1) `.cookie` in default datadir, (2) `rpcuser`/`rpcpassword` from `bitcoin.conf` in default datadir.

## Bitcoin Core on Mac

1. Install Bitcoin Core (you already have it).
2. Start a node, e.g. **regtest** (no chain download):
   ```bash
   bitcoind -regtest -daemon
   ```
   RPC port: **18443** (regtest), 8332 (mainnet), 18332 (testnet).

3. Create `bitcoin.conf` (in Bitcoin data directory, e.g. `~/Library/Application Support/Bitcoin/` on Mac):
   ```
   server=1
   rpcuser=youruser
   rpcpassword=yourpass
   rpcallowip=127.0.0.1
   ```
   For regtest only you can use:
   ```
   regtest=1
   server=1
   rpcuser=user
   rpcpassword=pass
   rpcallowip=127.0.0.1
   ```

4. Generate a mining address (regtest):
   ```bash
   bitcoin-cli -regtest getnewaddress
   ```
   Use this as `BTC_MINING_ADDRESS` or `--address`.

## Build / verify

To verify the miner build, from project root run:

```bash
./verify_miner_build.sh
```

Or run the full miner test suite directly:

```bash
npm run test:miner
```

From `backend/miner_server`:

```bash
bash run_tests.sh
```

This runs the default suite: unit tests (block build, genesis hash, merkle, config, address), thesis mining (seed prime, candidate list, quadrant), nonce log, quadrant partition, and partition candidates (4-worker quadrant and 8-worker chunk over the full candidate set). Exit 0 means all tests passed.

**E2E test (optional):** `test_regtest_e2e.py` validates the full pipeline against a real regtest node (start bitcoind, mine one block with `run_mining_loop_unified`, verify block accepted). It is not run by `run_tests.sh`. It requires **Bitcoin Core regtest binaries** (`bitcoind` and `bitcoin-cli` on PATH, or set `BITCOIND_PATH` and `BITCOIN_CLI_PATH`). Run when bitcoind is available:

```bash
cd backend/miner_server && python3 test_regtest_e2e.py
```

## Usage

From the **miner_server** directory:

```bash
# Check connection
python main.py --status --user youruser --password yourpass --network regtest

# Mine (regtest); Ctrl+C to stop
export BTC_RPC_USER=youruser BTC_RPC_PASSWORD=yourpass BTC_MINING_ADDRESS=bcrt1...
python main.py --network regtest

# Or pass everything on CLI
python main.py --host 127.0.0.1 --port 18443 --user user --password pass --address bcrt1... --network regtest
```

From repo root:

```bash
python miner_server/main.py --status --user user --password pass --network regtest
```

## Environment variables

| Variable             | Description                    | Example        |
|----------------------|--------------------------------|----------------|
| `BTC_RPC_HOST`       | RPC host                       | `127.0.0.1`    |
| `BTC_RPC_PORT`       | RPC port                       | `18443`        |
| `BTC_RPC_USER`       | RPC username                   | `user`         |
| `BTC_RPC_PASSWORD`   | RPC password                   | `pass`         |
| `BTC_NETWORK`        | mainnet / testnet / regtest    | `regtest`      |
| `BTC_MINING_ADDRESS` | Payout address (required to mine) | `bcrt1q...` |
| `BTC_NUM_THREADS`    | Mining threads (currently 1)    | `1`            |
| `BTC_NUM_WORKERS`    | Mining worker processes (default: 4). Each worker = 1 Python process. Set `1` for single-process mining. | `1`, `4`, or `8` |
| `BTC_VERBOSE`        | Verbosity                      | `0` or `1`     |
| `BTC_SINGLE_NONCE_ONLY` | Thesis validation: try only 1–2 entropy-reduced nonces, no expansion | `0` or `1` |
| `BTC_COOKIE_FILE`    | Path to Bitcoin Core `.cookie` (overrides default) | `~/.bitcoin/.cookie` |
| `BTC_DATADIR`        | Bitcoin Core data directory (used to find `.cookie`) | `~/Library/Application Support/Bitcoin` |
| `BTC_USE_C_NONCE`    | Use C libalgorithms for base nonce; set `0` for Python-only (lower worker memory) | `1` (default) or `0` |
| `BTC_MINING_ACTIVITY_LOG` | Path to mining activity file (JSONL). When unset, defaults to `miner_server/data/mining_activity.log`. One line per stats update: `{"ts": "<iso>", "hashes": N, "blocks": B, "hashrate": H}`. Set to `0` or `off` to disable. | path or `0`/`off` |
| `BTC_NONCE_LOG_PATH` | Path to nonce log (JSONL). Default: `miner_server/data/nonces_tried.json`. One line per round: `timestamp_iso`, `height`, `bits`, `base_nonce`, `recovery_nonce`, `minimal_nonces`, `candidate_count`, `nonce_sample` (first/last 20). | path |
| `BTC_DISABLE_NONCE_LOG` | Set to `1` to disable writing the nonce log. | `0` (default) or `1` |
| `BTC_ENTROPY_CUT_MIN`   | Entropy bounds (thesis tuning): min factor 0–1. Default 0.18. | `0.18` |
| `BTC_ENTROPY_CUT_MAX`   | Entropy bounds: max factor 0–1. Default 0.45. | `0.45` |

## Process count and efficiency

The miner uses **multiprocessing**: each worker is a separate Python process. When mining, you see:
- **1 main process** (Flask web UI + mining loop coordinator)
- **N worker processes** (default 4, set by `BTC_NUM_WORKERS`)

So **1 + N** Python processes during mining (e.g. 5 with default 4 workers). To reduce process count:
- `BTC_NUM_WORKERS=1` — single-worker mining, no multiprocessing (2 processes total)
- Default 4 — thesis quadrant partition, 5 processes total
- `BTC_NUM_WORKERS=8` — higher throughput on multi-core machines, 9 processes total

Other Python processes in Activity Monitor (Pylance, test runners, etc.) are from Cursor or other apps, not the miner.

## Memory and process count

On constrained systems (e.g. 16–32 GB RAM), total usage can exceed available memory:

- **Cursor:** Can use 50+ GB when indexing large projects (e.g. c. math with 2,800+ files). Use `.cursorignore` at project root to exclude heavy subfolders, or close Cursor when mining.
- **Miner:** ~0.5–1.5 GB (main process + workers). Each worker loads Python + thesis_mining; with C libs (libalgorithms), workers use more RAM.
- **Safari / dashboard:** ~1 GB with continuous polling; the UI reduces polling when mining is stopped.

**Recommendations when memory is limited:**
- Use the **Workers** dropdown in the Mining section to reduce workers (e.g. 1 or 4 instead of 8).
- Set `BTC_USE_C_NONCE=0` to force Python-only nonce generation; workers avoid loading libalgorithms, reducing per-worker memory.
- Restart Cursor periodically if memory climbs, or use a lighter editor (e.g. VS Code) for mining sessions.

## Miner behavior (web UI)

- **Elapsed time:** Session elapsed is shown while mining; after you stop, the Mining card shows "Last session: X min" (or "—" if no prior session).
- **No auto-start:** Mining starts only when you click **Start** in the UI; it never starts on page load or after connecting to Bitcoin Core.
- **Block submission:** When a valid block is found, it is submitted to the network in standard format (header + varint(n_tx) + coinbase + txs, hex) and the miner stops automatically.
- **Thesis / custom math:** Unified mode uses deterministic base nonce (tetration + entropy reduction), optional recovery, then sphere-hopping candidates over the full 32-bit space (by partition and ordering; no exhaustive linear sweep). Nonce search is thesis-aligned: bits_compact_to_difficulty_bits, 64-bit tetration modulus, 500D quadrant partition.

## Entropy reduction and single-nonce-first mining

In traditional mining, the guess space is huge and cost is proportional to how many hashes you compute. This miner reduces entropy using thesis math (tetration, difficulty-based bounds 0.18–0.45, clock lattice, optional OBJECTIVE 28 recovery) to a **minimal set of guesses** (ideally one nonce). Then the time to produce a hash is minor relative to the number of guesses.

- **Phase 1:** Try only the minimal nonce set (1–2 values: base nonce and, if available, recovery-suggested nonce). One or two double-SHA256 hashes. If one meets the target, the block is submitted and we stop.
- **Phase 2:** If Phase 1 misses, we expand to the full candidate list (sphere hopping, duality ordering) over the full 32-bit nonce space—partition and ordering only; there is no linear sweep. Standard math and double-SHA256 are used throughout; when entropy is sufficiently reduced, a valid nonce/hash pair can be found with a single hash (or two).

For **thesis validation** (e.g. regtest or testing that the math concentrates to one nonce), set `BTC_SINGLE_NONCE_ONLY=1` or `--single-nonce-only`. The miner will try only the 1–2 minimal nonces and not expand to candidates or full range.

## Addresses supported

- **Legacy** (1..., 3..., m..., n...): p2pkh and p2sh
- **Bech32** (bc1..., bcrt1..., tb1...): p2wpkh (witness v0)

## Regtest quick start

```bash
bitcoind -regtest -daemon
ADDR=$(bitcoin-cli -regtest getnewaddress)
export BTC_RPC_USER=user BTC_RPC_PASSWORD=pass BTC_MINING_ADDRESS=$ADDR BTC_NETWORK=regtest
python main.py
```

After a block is found, check balance:

```bash
bitcoin-cli -regtest getbalance
```

## C math path (optional)

The miner loads C libs (libalgorithms for base nonce and candidate list) only when a directory named **`c. math`** (with a space) exists at **project root** or **parent of backend**. It looks for `c. math/algorithms` and loads `libalgorithms.dylib` or `libalgorithms.so` from there. The **reference C implementation** lives in the repo at `archive/source-projects/MINER - 2026 /c. math/`. To use C acceleration without changing the main tree, copy or symlink that folder to the project root (or parent of `backend`) so the miner can find it. If `c. math` is not found, the miner runs **Python-only** (thesis_mining pure Python); no C libs are required for correct behavior.

## Troubleshooting: process quits unexpectedly

If the **web UI process** (or miner worker) quits with a segfault or crash, it may be due to native C libs (libalgorithms, librecovery_core). Set `BTC_USE_C_NONCE=0`, `BTC_USE_C_CANDIDATES=0`, and `BTC_DISABLE_RECOVERY=1` to use Python-only paths and avoid loading those libs; this can improve stability when the C builds are missing or incompatible.

## Troubleshooting HTTP 401 (Unauthorized)

If you see **RPC error -1: HTTP 401** when connecting with user/password left blank (cookie auth):

The miner automatically checks several common cookie locations (e.g. default datadir and `~/.bitcoin`) so it can connect without setting a path in most setups.

1. **Bitcoin-Qt (GUI):** Enable the RPC server (e.g. Settings so that the node accepts RPC). The miner can also use `rpcuser`/`rpcpassword` from `bitcoin.conf` automatically if the .cookie file is not present.

2. **Cookie is only used when Bitcoin Core has no `rpcuser`/`rpcpassword`** in `bitcoin.conf`. If you set those for regtest or another node, mainnet RPC may expect those credentials and ignore the cookie. Either enter the same user/password in the miner UI, or use a `bitcoin.conf` for mainnet without `rpcuser`/`rpcpassword` so Core uses the `.cookie` file.

3. **Cookie file location**: Mainnet on macOS uses `~/Library/Application Support/Bitcoin/.cookie`. If Bitcoin Core uses a custom or sandboxed datadir (e.g. `bitcoind -datadir=/path/to/data`), the cookie is at `<datadir>/.cookie`. Set the optional **Cookie file path** or **Bitcoin datadir** in the Connection card, or use environment variables:
   - `BTC_COOKIE_FILE` — full path to the `.cookie` file
   - `BTC_DATADIR` — Bitcoin Core data directory (the miner will use `<datadir>/.cookie`)
