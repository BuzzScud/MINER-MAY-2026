#!/usr/bin/env python3
"""
Web UI server for BTC miner. Serves dashboard and API for status / start mining.
Run from miner_server/: python3 web_ui.py
Then open http://127.0.0.1:5000 in your browser.
"""
import sys
import os
import threading
import time
from collections import deque
from datetime import datetime
from typing import Optional

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

import json
import queue

from flask import Flask, Blueprint, request, jsonify, send_from_directory, Response, stream_with_context

from config import MinerConfig, default_num_workers, resolve_cookie_for_auth, get_bitcoin_datadir, get_cookie_candidate_paths
from btc_rpc import getblockchaininfo, getblocktemplate, getnetworkinfo, getmempoolinfo, getrawmempool, BitcoinRPCError
from miner_loop import run_mining_loop, run_loop_forever
from address import address_to_script_pubkey
from backtest_last_100_blocks import _run_backtest
from thesis_mining import (
    get_base_nonce_source,
    get_last_seed_prime_path,
    is_recovery_loaded,
)

MAX_MEMPOOL_SIZE_FOR_VERBOSE = 5000
SATS_PER_BTC = 100_000_000

app = Flask(__name__)
miner_bp = Blueprint("miner", __name__)


@app.errorhandler(404)
def not_found(e):
    return jsonify({"ok": False, "error": "Not found"}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"ok": False, "error": "Internal server error"}), 500


# Shared mining state
_mining_thread = None
_mining_stop = threading.Event()
_mining_stats = {"hashes": 0, "blocks": 0, "hashrate": 0.0, "running": False, "error": None, "start_time": None, "last_elapsed_sec": None, "num_workers": 8, "use_unified": True}

# Mining log: thread-safe deque, max 200 lines, each line "HH:MM:SS message"
_mining_log = deque(maxlen=200)
_mining_log_lock = threading.Lock()
_MINING_LOG_STATS_INTERVAL_SEC = 3

# Network activity: thread-safe deque for monitoring (last 100 entries)
_network_activity = deque(maxlen=100)
_network_activity_lock = threading.Lock()

# Optional mining activity log file (JSONL). Default path when unset; explicit "0"/"off" disables.
_activity_log_lock = threading.Lock()
_DEFAULT_ACTIVITY_LOG_PATH = os.path.join(_here, "data", "mining_activity.log")


def _resolve_activity_log_path() -> Optional[str]:
    """Return path to append to, or None to disable. Unset = default path; 0/off = disabled."""
    raw = (os.environ.get("BTC_MINING_ACTIVITY_LOG") or "").strip()
    if raw.lower() in ("0", "false", "no", "off"):
        return None
    if raw:
        return raw
    return _DEFAULT_ACTIVITY_LOG_PATH


# Lifetime stats (cumulative across restarts); path and in-memory state
_LIFETIME_STATS_PATH = os.path.join(_here, "data", "lifetime_stats.json")
_lifetime_stats = {"total_hashes": 0, "total_blocks": 0, "last_updated_iso": None, "last_session_elapsed_sec": None, "last_session_hashes": None}
_lifetime_stats_lock = threading.Lock()
_LIFETIME_WRITE_THROTTLE_SEC = 60
_last_lifetime_write_time = [0.0]


def _read_lifetime_stats() -> None:
    """Load lifetime stats from disk if file exists. Call with _lifetime_stats_lock held or at startup."""
    global _lifetime_stats
    if not os.path.isfile(_LIFETIME_STATS_PATH):
        return
    try:
        with open(_LIFETIME_STATS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        _lifetime_stats["total_hashes"] = int(data.get("total_hashes", 0))
        _lifetime_stats["total_blocks"] = int(data.get("total_blocks", 0))
        _lifetime_stats["last_updated_iso"] = data.get("last_updated_iso")
        _lifetime_stats["last_session_elapsed_sec"] = data.get("last_session_elapsed_sec")
        _lifetime_stats["last_session_hashes"] = data.get("last_session_hashes")
    except (OSError, json.JSONDecodeError, ValueError):
        pass


def _write_lifetime_stats(total_hashes: int, total_blocks: int, last_session_elapsed_sec: Optional[float] = None, last_session_hashes: Optional[int] = None, force: bool = False) -> None:
    """Write lifetime stats to disk. Throttled unless force=True. Call from mining thread or worker finally."""
    with _lifetime_stats_lock:
        now = time.time()
        if not force and now - _last_lifetime_write_time[0] < _LIFETIME_WRITE_THROTTLE_SEC:
            return
        _last_lifetime_write_time[0] = now
        _lifetime_stats["total_hashes"] = total_hashes
        _lifetime_stats["total_blocks"] = total_blocks
        _lifetime_stats["last_updated_iso"] = datetime.now().isoformat()
        if last_session_elapsed_sec is not None:
            _lifetime_stats["last_session_elapsed_sec"] = round(last_session_elapsed_sec, 1)
        if last_session_hashes is not None:
            _lifetime_stats["last_session_hashes"] = last_session_hashes
        parent = os.path.dirname(_LIFETIME_STATS_PATH)
        if parent and not os.path.isdir(parent):
            try:
                os.makedirs(parent, exist_ok=True)
            except OSError:
                return
        try:
            with open(_LIFETIME_STATS_PATH, "w", encoding="utf-8") as f:
                json.dump({
                    "total_hashes": total_hashes,
                    "total_blocks": total_blocks,
                    "last_updated_iso": _lifetime_stats["last_updated_iso"],
                    "last_session_elapsed_sec": _lifetime_stats.get("last_session_elapsed_sec"),
                    "last_session_hashes": _lifetime_stats.get("last_session_hashes"),
                }, f, indent=0)
        except OSError:
            pass


# Load lifetime stats once at startup
_read_lifetime_stats()


def _mining_log_append(message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    with _mining_log_lock:
        _mining_log.append(f"{ts} {message}")


def _network_activity_append(message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    with _network_activity_lock:
        _network_activity.append(f"{ts} {message}")


def _default_port(network: str) -> int:
    return {"mainnet": 8332, "testnet": 18332, "regtest": 18443, "signet": 38332}.get(network, 18443)


_ALLOWED_NETWORKS = frozenset({"mainnet", "testnet", "regtest", "signet"})
_MAX_MINING_ADDRESS_LEN = 200
_MAX_RPC_HOST_LEN = 253


def _sanitize_rpc_host(host: str) -> str:
    """Restrict RPC host to avoid SSRF: localhost or private ranges only."""
    host = (host or "127.0.0.1").strip().lower()
    if not host or len(host) > _MAX_RPC_HOST_LEN:
        return "127.0.0.1"
    if host in ("127.0.0.1", "localhost", "::1"):
        return "127.0.0.1" if host != "::1" else host
    parts = host.split(".")
    if len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts):
        a, b = int(parts[0]), int(parts[1])
        if a == 10:
            return host
        if a == 172 and 16 <= b <= 31:
            return host
        if a == 192 and b == 168:
            return host
    return "127.0.0.1"


def _config_from_request() -> MinerConfig:
    data = request.get_json(silent=True) or request.form or {}
    network = (data.get("network") or request.args.get("network") or "mainnet").strip().lower()
    if network not in _ALLOWED_NETWORKS:
        network = "mainnet"
    port = data.get("rpc_port") or request.args.get("rpc_port")
    if port is not None and str(port).isdigit():
        port = max(1, min(65535, int(port)))
    else:
        port = _default_port(network)
    def _optional_path(val):  # treat empty or literal "undefined"/"null" as None
        s = (val or "").strip()
        if not s or s.lower() in ("undefined", "null"):
            return None
        return s
    cookie_file = _optional_path(data.get("cookie_file") or request.args.get("cookie_file"))
    datadir = _optional_path(data.get("datadir") or request.args.get("datadir"))
    raw_host = (data.get("rpc_host") or request.args.get("rpc_host") or "127.0.0.1").strip()
    rpc_host = _sanitize_rpc_host(raw_host)
    mining_address = (data.get("mining_address") or request.args.get("mining_address") or "").strip()
    if len(mining_address) > _MAX_MINING_ADDRESS_LEN:
        mining_address = mining_address[:_MAX_MINING_ADDRESS_LEN]
    raw_workers = data.get("num_workers") or request.args.get("num_workers") or os.environ.get("BTC_NUM_WORKERS", str(default_num_workers()))
    raw_val = max(1, int(raw_workers)) if str(raw_workers).strip().isdigit() else default_num_workers()
    num_workers = min(8, max(1, raw_val))
    use_unified = str(data.get("use_unified") or request.args.get("use_unified") or os.environ.get("BTC_USE_UNIFIED", "1")).strip().lower() in ("1", "true", "yes")
    return MinerConfig(
        rpc_host=rpc_host,
        rpc_port=port,
        rpc_user=(data.get("rpc_user") or request.args.get("rpc_user") or "").strip(),
        rpc_password=(data.get("rpc_password") or request.args.get("rpc_password") or "").strip(),
        network=network,
        mining_address=mining_address,
        num_workers=num_workers,
        use_unified=use_unified,
        rpc_cookie_file=cookie_file,
        rpc_datadir=datadir,
    )


def _cookie_diagnostics(config: MinerConfig) -> dict:
    """Return cookie_path and cookie_found for API responses (matches auth_tuple resolution)."""
    cookie_path = config.rpc_cookie_file or os.environ.get("BTC_COOKIE_FILE") or None
    datadir = config.rpc_datadir or os.environ.get("BTC_DATADIR") or None
    path_used, found = resolve_cookie_for_auth(
        config.network,
        cookie_path=cookie_path,
        datadir=datadir,
    )
    return {"cookie_path": path_used, "cookie_found": found}


@miner_bp.route("/status", methods=["GET", "POST"])
def api_status():
    """Check Bitcoin Core RPC connection."""
    config = _config_from_request()
    diag = _cookie_diagnostics(config)
    try:
        info = getblockchaininfo(config)
        auth_method = "userpass" if config.rpc_user and config.rpc_password else ("cookie" if diag["cookie_found"] else "config")
        chain = info.get("chain", "")
        blocks = info.get("blocks", 0)
        _network_activity_append(f"RPC status: connected to {chain} (block {blocks})")
        return jsonify({
            "ok": True,
            "connected": True,
            "chain": chain,
            "blocks": blocks,
            "headers": info.get("headers", 0),
            "cookie_path": diag["cookie_path"],
            "cookie_found": diag["cookie_found"],
            "auth_method": auth_method,
        })
    except BitcoinRPCError as e:
        _network_activity_append(f"RPC status: failed — {e}")
        return jsonify({"ok": False, "connected": False, "error": str(e), **diag})
    except Exception as e:
        _network_activity_append(f"RPC status: failed — {e}")
        return jsonify({"ok": False, "connected": False, "error": str(e), **diag})


@miner_bp.route("/metrics", methods=["GET", "POST"])
def api_metrics():
    """Real-time Bitcoin Core network metrics (blockchain + network info)."""
    config = _config_from_request()
    diag = _cookie_diagnostics(config)
    try:
        chain_info = getblockchaininfo(config)
        try:
            net_info = getnetworkinfo(config)
        except Exception:
            net_info = {}
        auth_method = "userpass" if config.rpc_user and config.rpc_password else ("cookie" if diag["cookie_found"] else "config")
        blocks = chain_info.get("blocks", 0)
        connections = net_info.get("connections", 0)
        _network_activity_append(f"Metrics: block {blocks}, connections {connections}")
        return jsonify({
            "ok": True,
            "connected": True,
            "chain": chain_info.get("chain", ""),
            "blocks": blocks,
            "headers": chain_info.get("headers", 0),
            "verification_progress": chain_info.get("verificationprogress"),
            "difficulty": chain_info.get("difficulty"),
            "connections": net_info.get("connections"),
            "connections_in": net_info.get("connections_in"),
            "connections_out": net_info.get("connections_out"),
            "version": net_info.get("version"),
            "subversion": net_info.get("subversion", "").strip("/"),
            "cookie_path": diag["cookie_path"],
            "cookie_found": diag["cookie_found"],
            "auth_method": auth_method,
        })
    except BitcoinRPCError as e:
        return jsonify({"ok": False, "connected": False, "error": str(e), **diag})
    except Exception as e:
        return jsonify({"ok": False, "connected": False, "error": str(e), **diag})


@miner_bp.route("/mempool", methods=["GET", "POST"])
def api_mempool():
    """Mempool metrics: tx count, size, fee rates (from getmempoolinfo + getrawmempool when small)."""
    config = _config_from_request()
    diag = _cookie_diagnostics(config)
    try:
        info = getmempoolinfo(config)
        if not info.get("loaded", False):
            return jsonify({
                "ok": False,
                "connected": False,
                "error": "Mempool not loaded",
                **diag,
            })
        size = info.get("size", 0) or 0
        bytes_vbytes = info.get("bytes", 0) or 0
        total_fee_btc = float(info.get("total_fee", 0) or 0)
        mempoolminfee_btc_kvb = float(info.get("mempoolminfee", 0) or 0)
        unbroadcast_count = info.get("unbroadcastcount", 0) or 0
        mempool_min_fee_sats_vb = round(mempoolminfee_btc_kvb * SATS_PER_BTC / 1000, 2) if mempoolminfee_btc_kvb else None

        avg_fee_rate_sats_vb = None
        min_fee_rate_sats_vb = None
        max_fee_rate_sats_vb = None

        if size <= MAX_MEMPOOL_SIZE_FOR_VERBOSE and size > 0:
            try:
                raw = getrawmempool(config, verbose=True)
                if isinstance(raw, dict) and raw:
                    total_fee_from_raw = 0.0
                    total_vsize = 0
                    rates = []
                    for _txid, tx in raw.items():
                        if not isinstance(tx, dict):
                            continue
                        fee_btc = float(tx.get("fee", 0) or 0)
                        vsize = int(tx.get("vsize", 0) or 0)
                        if vsize <= 0:
                            continue
                        total_fee_from_raw += fee_btc
                        total_vsize += vsize
                        rates.append((fee_btc * SATS_PER_BTC) / vsize)
                    if total_vsize > 0:
                        avg_fee_rate_sats_vb = round((total_fee_from_raw * SATS_PER_BTC) / total_vsize, 2)
                    if rates:
                        min_fee_rate_sats_vb = round(min(rates), 2)
                        max_fee_rate_sats_vb = round(max(rates), 2)
            except Exception:
                pass

        size_kvbytes = round(bytes_vbytes / 1000, 2) if bytes_vbytes else 0
        _network_activity_append(f"Mempool: {size} tx, {size_kvbytes} kvB, {total_fee_btc:.8f} BTC fees")
        return jsonify({
            "ok": True,
            "connected": True,
            "tx_count": size,
            "size_vbytes": bytes_vbytes,
            "size_kvbytes": size_kvbytes,
            "total_fee_btc": total_fee_btc,
            "mempool_min_fee_sats_vb": mempool_min_fee_sats_vb,
            "avg_fee_rate_sats_vb": avg_fee_rate_sats_vb,
            "min_fee_rate_sats_vb": min_fee_rate_sats_vb,
            "max_fee_rate_sats_vb": max_fee_rate_sats_vb,
            "unbroadcast_count": unbroadcast_count,
            **diag,
        })
    except BitcoinRPCError as e:
        _network_activity_append(f"Mempool: failed — {e}")
        return jsonify({"ok": False, "connected": False, "error": str(e), **diag})
    except Exception as e:
        _network_activity_append(f"Mempool: failed — {e}")
        return jsonify({"ok": False, "connected": False, "error": str(e), **diag})


@miner_bp.route("/stats")
def api_stats():
    """Current mining stats."""
    start_time = _mining_stats.get("start_time")
    elapsed_sec = (time.time() - start_time) if start_time and _mining_stats["running"] else None
    with _lifetime_stats_lock:
        lifetime_hashes = _lifetime_stats["total_hashes"]
        lifetime_blocks = _lifetime_stats["total_blocks"]
        last_sess_elapsed = _lifetime_stats.get("last_session_elapsed_sec")
        last_sess_hashes = _lifetime_stats.get("last_session_hashes")
    # While running, add current session to lifetime for display
    if _mining_stats["running"]:
        lifetime_hashes += _mining_stats["hashes"]
        lifetime_blocks += _mining_stats["blocks"]
    return jsonify({
        "hashes": _mining_stats["hashes"],
        "blocks": _mining_stats["blocks"],
        "hashrate": _mining_stats["hashrate"],
        "running": _mining_stats["running"],
        "error": _mining_stats.get("error"),
        "start_time": start_time,
        "elapsed_sec": round(elapsed_sec, 1) if elapsed_sec is not None else None,
        "last_elapsed_sec": round(_mining_stats["last_elapsed_sec"], 1) if _mining_stats.get("last_elapsed_sec") is not None else None,
        "num_workers": _mining_stats.get("num_workers", default_num_workers()),
        "use_unified": _mining_stats.get("use_unified", True),
        "lifetime_hashes": lifetime_hashes,
        "lifetime_blocks": lifetime_blocks,
        "last_session_elapsed_sec": last_sess_elapsed,
        "last_session_hashes": last_sess_hashes,
        "activity_log_available": bool(_resolve_activity_log_path()),
    })


def _mining_worker(config: MinerConfig) -> None:
    global _mining_stats
    _mining_stats["running"] = True
    _mining_stats["error"] = None
    _mining_stats["start_time"] = time.time()
    _mining_stats["num_workers"] = config.num_workers
    _mining_stats["use_unified"] = config.use_unified
    _mining_log_append(f"Worker started ({config.num_workers} workers, unified={config.use_unified}).")
    _network_activity_append("Mining: worker started.")
    _last_stats_log = [0.0]

    activity_log_path = _resolve_activity_log_path()
    activity_log_file_holder = [None]
    if activity_log_path:
        try:
            parent = os.path.dirname(activity_log_path)
            if parent and not os.path.isdir(parent):
                os.makedirs(parent, exist_ok=True)
            activity_log_file_holder[0] = open(activity_log_path, "a", encoding="utf-8")
        except OSError:
            activity_log_file_holder[0] = None

    with _lifetime_stats_lock:
        _base_lifetime_hashes = _lifetime_stats["total_hashes"]
        _base_lifetime_blocks = _lifetime_stats["total_blocks"]

    def stop_flag():
        return _mining_stop.is_set()

    def on_stats(total_hashes: int, total_blocks: int, hashrate: float) -> None:
        _mining_stats["hashes"] = total_hashes
        _mining_stats["blocks"] = total_blocks
        _mining_stats["hashrate"] = round(hashrate, 2)
        now = time.time()
        if now - _last_stats_log[0] >= _MINING_LOG_STATS_INTERVAL_SEC:
            _last_stats_log[0] = now
            _mining_log_append(f"Hashrate: {hashrate:.1f} H/s, Hashes: {total_hashes}")
        f = activity_log_file_holder[0]
        if f is not None:
            line = json.dumps({
                "ts": datetime.now().isoformat(),
                "hashes": total_hashes,
                "blocks": total_blocks,
                "hashrate": round(hashrate, 2),
            }) + "\n"
            with _activity_log_lock:
                try:
                    f.write(line)
                    f.flush()
                except OSError:
                    pass
        _write_lifetime_stats(_base_lifetime_hashes + total_hashes, _base_lifetime_blocks + total_blocks)

    def on_block_found() -> None:
        _mining_log_append("Block found and submitted to network; stopping miner.")
        _network_activity_append("Block found and submitted; miner stopped.")

    try:
        run_loop_forever(
            config,
            on_stats=on_stats,
            stop_flag=stop_flag,
            on_block_found=on_block_found,
            on_log=_mining_log_append,
        )
    except Exception as e:
        _mining_stats["error"] = str(e)
        _mining_log_append(f"Error: {e}")
        _network_activity_append(f"Mining: error — {e}")
    finally:
        if activity_log_file_holder[0] is not None:
            try:
                activity_log_file_holder[0].close()
            except OSError:
                pass
            activity_log_file_holder[0] = None
        _mining_stats["running"] = False
        start_time = _mining_stats.get("start_time")
        last_elapsed = time.time() - start_time if start_time is not None else None
        if start_time is not None:
            _mining_stats["last_elapsed_sec"] = last_elapsed
        _mining_stats["start_time"] = None
        _write_lifetime_stats(
            _base_lifetime_hashes + _mining_stats["hashes"],
            _base_lifetime_blocks + _mining_stats["blocks"],
            last_session_elapsed_sec=last_elapsed,
            last_session_hashes=_mining_stats["hashes"],
            force=True,
        )
        _mining_log_append("Mining stopped.")
        _network_activity_append("Mining: stopped.")


@miner_bp.route("/validate_address", methods=["GET", "POST"])
def api_validate_address():
    """Validate mining address (bech32/base58check). Returns ok and script length or error with hint."""
    data = request.get_json(silent=True) or request.form or {}
    address = (data.get("mining_address") or data.get("address") or request.args.get("mining_address") or request.args.get("address") or "").strip()
    if not address:
        return jsonify({"ok": False, "error": "Address required"})
    try:
        script = address_to_script_pubkey(address)
        return jsonify({"ok": True, "script_len": len(script)})
    except ValueError as e:
        err = str(e)
        hint = ""
        if "bech32" in err.lower() or "checksum" in err.lower():
            hint = " Copy the address exactly from your wallet (avoid digit 1 vs letter l, or 0 vs O)."
        return jsonify({"ok": False, "error": err, "hint": hint})


@miner_bp.route("/start", methods=["POST"])
def api_start():
    """Start mining (background thread)."""
    global _mining_thread, _mining_stop
    if _mining_stats["running"]:
        return jsonify({"ok": False, "error": "Mining already running"})
    try:
        config = _config_from_request()
        if not config.mining_address:
            return jsonify({"ok": False, "error": "Mining address required"})
        address_to_script_pubkey(config.mining_address)
        capabilities = ["segwit"] if config.network != "regtest" else []
        try:
            template = getblocktemplate(config, capabilities)
            if not template:
                return jsonify({"ok": False, "error": "Cannot get block template: empty response from node. Is the chain synced or regtest initialized?"})
        except BitcoinRPCError as e:
            return jsonify({"ok": False, "error": f"Cannot get block template: {e}. Check RPC host, port, network, and auth."})
        _mining_stop.clear()
        addr = (config.mining_address or "")[:20]
        if len(config.mining_address or "") > 20:
            addr += "..."
        _mining_log_append(f"Mining started (address {addr})")
        _network_activity_append("Mining: start requested.")
        _mining_thread = threading.Thread(target=_mining_worker, args=(config,), daemon=True)
        _mining_thread.start()
        return jsonify({"ok": True, "message": "Mining started"})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


@miner_bp.route("/stop", methods=["POST"])
def api_stop():
    """Stop mining."""
    _mining_stop.set()
    return jsonify({"ok": True, "message": "Stop requested"})


def _reset_mining_stats_and_logs() -> None:
    """Reset stats and logs to zero/fresh state."""
    global _mining_stats
    _mining_stats["hashes"] = 0
    _mining_stats["blocks"] = 0
    _mining_stats["hashrate"] = 0.0
    _mining_stats["start_time"] = None
    _mining_stats["last_elapsed_sec"] = None
    _mining_stats["error"] = None
    with _mining_log_lock:
        _mining_log.clear()
    with _network_activity_lock:
        _network_activity.clear()


@miner_bp.route("/restart", methods=["POST"])
def api_restart():
    """Stop mining, reset stats to 0, then start mining again with current config."""
    global _mining_thread, _mining_stop
    if _mining_stats["running"]:
        _mining_stop.set()
        if _mining_thread is not None and _mining_thread.is_alive():
            _mining_thread.join(timeout=5.0)
        _mining_thread = None
    _reset_mining_stats_and_logs()
    _mining_stop.clear()
    try:
        config = _config_from_request()
        if not config.mining_address:
            return jsonify({"ok": False, "error": "Mining address required"})
        address_to_script_pubkey(config.mining_address)
        capabilities = ["segwit"] if config.network != "regtest" else []
        try:
            template = getblocktemplate(config, capabilities)
            if not template:
                return jsonify({"ok": False, "error": "Cannot get block template. Is the chain synced? Connect first."})
        except BitcoinRPCError as e:
            return jsonify({"ok": False, "error": f"Cannot get block template: {e}. Check RPC and auth."})
        addr = (config.mining_address or "")[:20]
        if len(config.mining_address or "") > 20:
            addr += "..."
        _mining_log_append(f"Restart: mining started (address {addr})")
        _network_activity_append("Mining: restarted (stats reset to 0).")
        _mining_thread = threading.Thread(target=_mining_worker, args=(config,), daemon=True)
        _mining_thread.start()
        return jsonify({"ok": True, "message": "Mining restarted (stats reset to 0)"})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


@miner_bp.route("/mining_log", methods=["GET"])
def api_mining_log():
    """Return last N lines of mining log (timestamp + message)."""
    with _mining_log_lock:
        lines = list(_mining_log)
    last_n = 200
    if len(lines) > last_n:
        lines = lines[-last_n:]
    return jsonify({"lines": lines})


@miner_bp.route("/network_activity", methods=["GET"])
def api_network_activity():
    """Return last N network activity entries for monitoring (RPC, mempool, mining)."""
    with _network_activity_lock:
        entries = list(_network_activity)
    last_n = 80
    if len(entries) > last_n:
        entries = entries[-last_n:]
    return jsonify({"entries": entries})


@miner_bp.route("/log", methods=["GET"])
def api_log():
    """Alias for mining_log for React frontend."""
    return api_mining_log()


@miner_bp.route("/activity", methods=["GET"])
def api_activity():
    """Alias for network_activity for React frontend."""
    return api_network_activity()


def _read_recent_activity_log_lines(max_lines: int = 50) -> list:
    """Read last N lines from mining_activity.log (JSONL) for learning/observability. Returns list of parsed objects."""
    path = _resolve_activity_log_path()
    if not path or not os.path.isfile(path):
        return []
    out: list = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        for line in lines[-max_lines:]:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except (json.JSONDecodeError, ValueError):
                continue
    except (OSError, IOError):
        pass
    return out


@miner_bp.route("/activity_log", methods=["GET"])
def api_activity_log():
    """Return recent mining activity log entries (from mining_activity.log JSONL) for learning and observability."""
    limit = min(100, max(1, int(request.args.get("limit", 50))))
    entries = _read_recent_activity_log_lines(max_lines=limit)
    return jsonify({"ok": True, "entries": entries, "learning_enabled": bool(_resolve_activity_log_path())})


@miner_bp.route("/detect", methods=["GET"])
def api_detect():
    """Scan for Bitcoin Core: check default datadirs and ports, return detected connections and recommended config."""
    NETWORK_PORTS = {"mainnet": 8332, "testnet": 18332, "regtest": 18443, "signet": 38332}
    results = []
    recommended = None
    for network in ("mainnet", "testnet", "regtest", "signet"):
        port = NETWORK_PORTS[network]
        datadir = get_bitcoin_datadir(network)
        cookie_paths = get_cookie_candidate_paths(network)
        cookie_found = any(os.path.isfile(p) for p in cookie_paths)
        cookie_path_used = next((p for p in cookie_paths if os.path.isfile(p)), cookie_paths[0] if cookie_paths else None)
        config = MinerConfig(
            rpc_host="127.0.0.1",
            rpc_port=port,
            rpc_user="",
            rpc_password="",
            network=network,
            rpc_cookie_file=None,
            rpc_datadir=None,
        )
        try:
            info = getblockchaininfo(config)
            results.append({
                "network": network,
                "port": port,
                "connected": True,
                "chain": info.get("chain", network),
                "blocks": info.get("blocks", 0),
                "headers": info.get("headers", 0),
                "datadir": datadir,
                "cookie_path": cookie_path_used,
                "cookie_found": cookie_found,
            })
            if recommended is None:
                recommended = {
                    "rpc_host": "127.0.0.1",
                    "rpc_port": port,
                    "network": network,
                    "cookie_file": cookie_path_used or "",
                    "datadir": datadir,
                }
        except Exception as e:
            results.append({
                "network": network,
                "port": port,
                "connected": False,
                "error": str(e),
                "datadir": datadir,
                "cookie_path": cookie_path_used,
                "cookie_found": cookie_found,
            })
    return jsonify({
        "ok": True,
        "results": results,
        "recommended": recommended,
    })


@miner_bp.route("/thesis_math_status", methods=["GET"])
def api_thesis_math_status():
    """Return thesis alignment and custom-math usage for the miner. All nonce solutions from custom math are used in the pipeline."""
    return jsonify({
        "python_miner": "Unified Python miner: getblocktemplate, double-SHA256, deterministic base nonce, sphere hopping, duality ordering, golden-ratio spiral, optional OBJECTIVE 28 recovery, 4 or 8 workers (quadrant partition when 4, chunk partition when 8; 500D lattice).",
        "thesis_alignment": "Miner uses thesis-aligned logic: deterministic nonce (seed prime + tetration), 12-fold sphere distribution, duality prime positions {1,5,7,11}, golden-ratio offsets, recovery when lib available. Partition over full 32-bit nonce space; thesis ch.15 unbiased search preserved.",
        "custom_math_used": "Python miner: hashlib SHA256, pure-Python thesis_mining (bits_compact_to_difficulty_bits, nonce_generate_unified_py, build_candidate_list, quadrant_from_nonce). Optional recovery via c. math lib when available.",
        "nonce_solutions_used": [
            "Phase 1: minimal nonces (get_minimal_nonce_list: base + recovery, 1–2 hashes)",
            "Phase 2: thesis candidates (build_candidate_list: sphere hopping, duality, golden-ratio; 4 workers = quadrant partition, 8 workers = chunk partition)",
            "Phase 3: linear sweep (optional, per-worker disjoint range)",
        ],
        "base_nonce_source": get_base_nonce_source(),
        "recovery_loaded": is_recovery_loaded(),
        "last_seed_prime_path": get_last_seed_prime_path(),
        "use_unified_default": True,
    })


BACKTEST_BLOCKS_MIN = 1
BACKTEST_BLOCKS_MAX = 500
BACKTEST_BLOCKS_DEFAULT = 100


@miner_bp.route("/backtest", methods=["POST"])
def api_backtest():
    """Run thesis nonce backtest on last N blocks (1-500). Uses request config and num_blocks."""
    try:
        config = _config_from_request()
        data = request.get_json(silent=True) or request.form or {}
        raw = data.get("num_blocks") or data.get("blocks") or BACKTEST_BLOCKS_DEFAULT
        try:
            num_blocks = max(BACKTEST_BLOCKS_MIN, min(BACKTEST_BLOCKS_MAX, int(raw)))
        except (TypeError, ValueError):
            num_blocks = BACKTEST_BLOCKS_DEFAULT
        overrides = data.get("overrides")
        overrides = overrides if isinstance(overrides, dict) and overrides else None
        result = _run_backtest(config, num_blocks=num_blocks, overrides=overrides)
        return jsonify({"ok": True, **result})
    except BitcoinRPCError as e:
        return jsonify({"ok": False, "error": str(e)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


KEEPALIVE_INTERVAL_SEC = 15
BACKTEST_TOTAL_TIMEOUT_SEC = 300


def _stream_backtest_generator(config, num_blocks, overrides=None):
    """Generate SSE events for backtest progress and final result. Sends keepalives to avoid connection drops."""
    try:
        progress_queue = queue.Queue()
        final_result = [None]
        exc_holder = [None]

        def progress_callback(current, total, block_summary):
            progress_queue.put(("progress", current, total, block_summary))

        def run_backtest():
            try:
                final_result[0] = _run_backtest(
                    config,
                    num_blocks=num_blocks,
                    progress_callback=progress_callback,
                    overrides=overrides,
                )
            except Exception as e:
                exc_holder[0] = e
            finally:
                progress_queue.put(("done",))

        thread = threading.Thread(target=run_backtest)
        thread.start()

        total_waited_sec = 0
        while True:
            try:
                msg = progress_queue.get(timeout=KEEPALIVE_INTERVAL_SEC)
            except queue.Empty:
                total_waited_sec += KEEPALIVE_INTERVAL_SEC
                if total_waited_sec >= BACKTEST_TOTAL_TIMEOUT_SEC:
                    yield f"event: error\ndata: {json.dumps({'error': 'Backtest timeout'})}\n\n"
                    break
                yield ": keepalive\n\n"
                continue
            if msg[0] == "progress":
                _, current, total, block_summary = msg
                payload = {"current": current, "total": total, "block": block_summary}
                yield f"event: progress\ndata: {json.dumps(payload)}\n\n"
            elif msg[0] == "done":
                if exc_holder[0]:
                    yield f"event: error\ndata: {json.dumps({'error': str(exc_holder[0])})}\n\n"
                else:
                    result = final_result[0]
                    result["ok"] = True
                    yield f"event: done\ndata: {json.dumps(result)}\n\n"
                break
    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"


@miner_bp.route("/backtest/stream", methods=["POST"])
def api_backtest_stream():
    """Stream backtest progress via SSE. POST body: config + num_blocks + optional overrides."""
    try:
        config = _config_from_request()
        data = request.get_json(silent=True) or {}
        raw = data.get("num_blocks") or data.get("blocks") or BACKTEST_BLOCKS_DEFAULT
        try:
            num_blocks = max(BACKTEST_BLOCKS_MIN, min(BACKTEST_BLOCKS_MAX, int(raw)))
        except (TypeError, ValueError):
            num_blocks = BACKTEST_BLOCKS_DEFAULT
        overrides = data.get("overrides")
        overrides = overrides if isinstance(overrides, dict) and overrides else None
        return Response(
            stream_with_context(_stream_backtest_generator(config, num_blocks, overrides)),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@miner_bp.route("/backtest/regtest", methods=["POST"])
def api_backtest_regtest():
    """Run regtest self-check: backtest last block only. Returns pass/fail."""
    try:
        config = _config_from_request()
        if config.network != "regtest":
            return jsonify({
                "ok": True,
                "passed": False,
                "hits": 0,
                "total": 0,
                "message": "Regtest self-check requires network=regtest. Switch to regtest in connection settings.",
            })
        result = _run_backtest(config, num_blocks=1)
        hits = (result.get("phase1_hits") or 0) + (result.get("phase2_hits") or 0)
        total = result.get("total") or 0
        passed = total > 0 and hits >= 1
        message = (
            f"Self-check passed: {hits} hit(s) on last block (tip {result.get('tip')})."
            if passed
            else (
                "Self-check failed: 0 hits on last block. "
                "Mine a block with this miner on regtest, then run again."
                if total > 0
                else "No block was backtested."
            )
        )
        return jsonify({
            "ok": True,
            "passed": passed,
            "hits": hits,
            "total": total,
            "message": message,
        })
    except BitcoinRPCError as e:
        return jsonify({"ok": False, "error": str(e)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


app.register_blueprint(miner_bp, url_prefix="/api/miner")


@app.route("/")
def index():
    path = os.path.join(_here, "index.html")
    if os.path.exists(path):
        return send_from_directory(_here, "index.html")
    return HTML_PAGE, 200, {"Content-Type": "text/html; charset=utf-8"}


HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BTC Miner</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 560px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.5rem; }
    .card { border: 1px solid #ddd; border-radius: 10px; padding: 1.25rem; margin: 1rem 0; background: #fafafa; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card h2 { font-size: 1.1rem; margin: 0 0 0.75rem 0; }
    label { display: block; margin-top: 0.5rem; }
    input, select { width: 100%; padding: 0.4rem; margin-top: 0.2rem; }
    button { margin: 0.25rem 0.25rem 0 0; padding: 0.5rem 1rem; cursor: pointer; }
    .status { padding: 0.5rem; border-radius: 4px; margin: 0.5rem 0; }
    .status.ok { background: #e8f5e9; }
    .status.err { background: #ffebee; }
    #stats { font-family: monospace; margin-top: 0.5rem; }
    .note { font-size: 0.9rem; color: #666; margin: 0.5rem 0 0 0; }
    .connection-badge { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 0.35rem; }
    .connection-badge.connected { background: #4caf50; }
    .connection-badge.disconnected { background: #f44336; }
    .connection-badge.checking { background: #ff9800; }
    .connection-result { background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 0.75rem; margin-top: 0.75rem; }
  </style>
</head>
<body>
  <h1>BTC Miner</h1>
  <p>Connect to Bitcoin Core. On mainnet, leave user/password blank to use cookie (automatic).</p>

  <div class="card">
    <h2>Connection</h2>
    <p class="note"><span class="connection-badge disconnected" id="connection_badge"></span> <span id="connection_status_line">Not checked — click Connect below.</span></p>
    <label>Network <select id="network"><option value="regtest">regtest</option><option value="testnet">testnet</option><option value="mainnet" selected>mainnet</option></select></label>
    <label>Host <input type="text" id="rpc_host" value="127.0.0.1"></label>
    <label>Port <input type="number" id="rpc_port" value="8332"></label>
    <label>User <input type="text" id="rpc_user" value="" placeholder="Optional"></label>
    <label>Password <input type="password" id="rpc_password" value="" placeholder="Optional"></label>
    <p class="note" style="margin-bottom:0.75rem;">Leave user and password blank to use Bitcoin Core default (recommended for mainnet).</p>
    <label>Cookie file (optional) <input type="text" id="cookie_file" value="" placeholder="e.g. /path/to/.cookie"></label>
    <label>Data folder (optional) <input type="text" id="datadir" value="" placeholder="e.g. ~/Library/Application Support/Bitcoin"></label>
    <button id="btn_check">Connect</button>
    <div class="connection-result" id="connection_result_wrapper" style="display:none;">
      <div id="connection_status" class="status"></div>
      <div id="connection_hint" class="note" style="display:none; margin-top:0.5rem;"></div>
    </div>
  </div>

  <div class="card">
    <h2>Mining</h2>
    <label>Mining address <input type="text" id="mining_address" value="bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" placeholder="bc1q... or bcrt1q..."></label>
    <button id="btn_start">Start mining</button>
    <button id="btn_stop">Stop mining</button>
    <div id="stats"></div>
    <div id="mining_error" class="status err" style="display:none;"></div>
  </div>

  <script>
    const api = path => fetch(path).then(r => r.json());
    const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

    const DEFAULT_PORTS = { mainnet: 8332, testnet: 18332, regtest: 18443, signet: 38332 };
    function getConfig() {
      const network = document.getElementById('network').value;
      return {
        rpc_host: document.getElementById('rpc_host').value,
        rpc_port: parseInt(document.getElementById('rpc_port').value, 10) || DEFAULT_PORTS[network] || 8332,
        rpc_user: document.getElementById('rpc_user').value,
        rpc_password: document.getElementById('rpc_password').value,
        network: network,
        mining_address: document.getElementById('mining_address').value,
        cookie_file: document.getElementById('cookie_file').value.trim() || '',
        datadir: document.getElementById('datadir').value.trim() || ''
      };
    }
    function getConnectionHintText(r) {
      if (r.cookie_found === false && r.cookie_path) {
        return 'No .cookie file at ' + r.cookie_path + '. Start Bitcoin Core with RPC enabled and no rpcpassword in bitcoin.conf, or set RPC user/password above.\\n\\nIn Bitcoin Core (GUI): Settings > Options — enable \\'Allow incoming connections\\' or the RPC server so the .cookie file is created; or if you use a username/password in bitcoin.conf, enter them in the RPC user/password fields above.';
      }
      if (r.cookie_found === true && r.error && r.error.indexOf('401') !== -1) {
        return 'Cookie file found but server returned 401. If you use rpcuser/rpcpassword in bitcoin.conf, enter them above; otherwise check that Bitcoin Core is using the same datadir.';
      }
      return '';
    }
    function setConnectionStatusLine(badgeState, text) {
      document.getElementById('connection_badge').className = 'connection-badge ' + badgeState;
      document.getElementById('connection_status_line').textContent = text;
    }
    function setConnectionError(r, el, hintEl) {
      document.getElementById('connection_result_wrapper').style.display = 'block';
      el.style.display = 'block';
      el.className = 'status err';
      var hintText = getConnectionHintText(r);
      el.textContent = (r.error || 'Not connected') + (hintText ? '\\n\\n' + hintText : '');
      hintEl.style.display = hintText ? 'block' : 'none';
      hintEl.textContent = hintText;
      setConnectionStatusLine('disconnected', r.error || 'Not connected');
    }
    document.getElementById('btn_check').onclick = async () => {
      const el = document.getElementById('connection_status');
      const hintEl = document.getElementById('connection_hint');
      document.getElementById('connection_result_wrapper').style.display = 'block';
      el.style.display = 'block';
      el.className = 'status';
      el.textContent = 'Checking...';
      setConnectionStatusLine('checking', 'Checking...');
      try {
        const q = new URLSearchParams(getConfig());
        const r = await api('/api/status?' + q);
        if (r.ok && r.connected) {
          var msg = 'Connected: ' + r.chain + ', blocks ' + r.blocks + (r.auth_method === 'config' ? '. Connected using credentials from bitcoin.conf.' : '');
          el.className = 'status ok';
          el.textContent = msg;
          setConnectionStatusLine('connected', msg);
          hintEl.style.display = 'none';
          hintEl.textContent = '';
        } else {
          setConnectionError(r, el, hintEl);
        }
      } catch (e) {
        setConnectionError({ error: e.message || 'Request failed' }, el, hintEl);
      }
    };

    document.getElementById('btn_start').onclick = async () => {
      const errEl = document.getElementById('mining_error');
      errEl.style.display = 'none';
      try {
        const r = await post('/api/start', getConfig());
        if (r.ok) {
          errEl.style.display = 'none';
          pollStats();
        } else {
          errEl.style.display = 'block';
          errEl.textContent = r.error || 'Failed to start';
        }
      } catch (e) {
        errEl.style.display = 'block';
        errEl.textContent = e.message || 'Request failed';
      }
    };

    document.getElementById('btn_stop').onclick = async () => {
      await post('/api/stop');
    };

    function pollStats() {
      const el = document.getElementById('stats');
      function tick() {
        api('/api/stats').then(r => {
          el.textContent = r.running ? 'Hashrate: ' + r.hashrate + ' H/s | Hashes: ' + r.hashes + ' | Blocks: ' + r.blocks : 'Stopped. Hashes: ' + r.hashes + ', Blocks: ' + r.blocks;
          if (r.error) document.getElementById('mining_error').textContent = r.error;
          if (r.running) setTimeout(tick, 2000);
        });
      }
      tick();
    }
    pollStats();
  </script>
</body>
</html>
"""


if __name__ == "__main__":
    index_path = os.path.join(_here, "index.html")
    if not os.path.exists(index_path):
        with open(index_path, "w") as f:
            f.write(HTML_PAGE)
    port = int(os.environ.get("MINER_WEB_PORT", "5001" if sys.platform == "darwin" else "5000"))
    print(f"Miner web UI: http://127.0.0.1:{port}")
    print("Open this URL in your browser.")
    for rule in sorted(app.url_map.iter_rules(), key=lambda r: r.rule):
        if rule.endpoint != "static":
            print(f"  Route: {rule.rule}")
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False, threaded=True)
