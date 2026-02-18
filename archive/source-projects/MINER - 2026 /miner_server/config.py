"""
Miner server configuration.
RPC URL, network, mining address; no hardcoded credentials.
Auto-connect via Bitcoin Core .cookie file when user/password not set (mainnet).

Process count: each worker is a separate Python process. Default 4 workers = 1 main + 4 = 5 processes.
Set BTC_NUM_WORKERS=1 for single-process mining (no multiprocessing). Set BTC_NUM_WORKERS=8 for higher throughput.
"""
import os
import platform
import sys
from dataclasses import dataclass, field
from typing import Optional

# Thesis-pure partition: num_workers=4 uses quadrant partition (500D lattice); union = full 32-bit space.
# Default 8 workers for throughput; set BTC_QUADRANT_MODE=1 or BTC_NUM_WORKERS=4 for thesis quadrant.
QUADRANT_WORKERS = 4


def use_c_nonce() -> bool:
    """True to use C libalgorithms for base nonce; False to use pure Python only (lower memory per worker).
    Set BTC_USE_C_NONCE=0 to force Python-only path and avoid loading libalgorithms."""
    return os.environ.get("BTC_USE_C_NONCE", "1").strip().lower() not in ("0", "false", "no")


def use_c_candidates() -> bool:
    """True to use C libalgorithms for sphere-hopping candidate list when available.
    Set BTC_USE_C_CANDIDATES=0 to force pure-Python build_candidate_list."""
    return os.environ.get("BTC_USE_C_CANDIDATES", "1").strip().lower() not in ("0", "false", "no")


PHASE3_DEFAULT_NONCES = 500_000


def phase3_nonces_per_worker() -> int:
    """Nonces per worker for Phase 3 linear sweep. 0 to disable Phase 3.
    Set BTC_PHASE3_NONCES_PER_WORKER=0 for thesis-pure mode (no linear sweep)."""
    s = os.environ.get("BTC_PHASE3_NONCES_PER_WORKER", str(PHASE3_DEFAULT_NONCES)).strip()
    if s.lower() in ("0", "false", "no", ""):
        return 0
    try:
        return max(0, int(s))
    except ValueError:
        return PHASE3_DEFAULT_NONCES


def default_num_workers() -> int:
    """
    Default 8 workers for throughput (1 main + 8 = 9 processes).
    Set BTC_NUM_WORKERS=4 or BTC_QUADRANT_MODE=1 for thesis quadrant partition (4 workers).
    Set BTC_NUM_WORKERS=1 for single-process mining (2 processes total: main + mining thread).
    """
    return 8


def get_bitcoin_datadir(network: str) -> str:
    """Return default Bitcoin Core datadir for the given network and OS."""
    if sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support/Bitcoin")
    else:
        base = os.path.expanduser("~/.bitcoin")
    if network == "regtest":
        return os.path.join(base, "regtest")
    if network == "testnet":
        return os.path.join(base, "testnet3")
    return base


def get_cookie_candidate_paths(network: str) -> list[str]:
    """
    Return an ordered list of absolute .cookie paths to try for auto-discovery.
    Primary: default datadir for network; on macOS mainnet also ~/.bitcoin/.cookie.
    """
    primary_dir = get_bitcoin_datadir(network)
    paths = [os.path.join(primary_dir, ".cookie")]
    if sys.platform == "darwin" and network == "mainnet":
        paths.append(os.path.expanduser("~/.bitcoin/.cookie"))
    return paths


def resolve_cookie_for_auth(
    network: str,
    cookie_path: Optional[str] = None,
    datadir: Optional[str] = None,
) -> tuple[str, bool]:
    """
    Resolve which cookie path to use and whether it exists.
    Returns (path_used, found). Used by auth and API diagnostics.
    If explicit cookie_path or datadir: single path, return (path, exists).
    Else: walk get_cookie_candidate_paths, return (first path where file exists, True)
    or (first candidate path, False) if none exist.
    """
    if cookie_path:
        path = os.path.expanduser(cookie_path)
        return (path, os.path.isfile(path))
    if datadir:
        dir_path = os.path.expanduser(datadir)
        path = os.path.join(dir_path, ".cookie")
        return (path, os.path.isfile(path))
    candidates = get_cookie_candidate_paths(network)
    for path in candidates:
        if os.path.isfile(path):
            return (path, True)
    return (candidates[0], False)


def get_cookie_path(
    network: str = "mainnet",
    cookie_path: Optional[str] = None,
    datadir: Optional[str] = None,
) -> tuple[str, bool]:
    """
    Resolve Bitcoin Core .cookie path and whether the file exists.
    Returns (resolved_path, exists).
    """
    path = cookie_path
    if not path:
        dir_path = datadir
        if dir_path:
            dir_path = os.path.expanduser(dir_path)
        else:
            dir_path = get_bitcoin_datadir(network)
        path = os.path.join(dir_path, ".cookie")
    path = os.path.expanduser(path)
    return (path, os.path.isfile(path))


RPCWORKQUEUE_MIN = 32


def ensure_rpcworkqueue(datadir: str, min_value: int = RPCWORKQUEUE_MIN) -> tuple[bool, str]:
    """
    Ensure bitcoin.conf in datadir has rpcworkqueue >= min_value (default 32).
    Returns (changed, message). If file does not exist, returns (False, "file not found").
    """
    path = os.path.join(os.path.expanduser(datadir), "bitcoin.conf")
    if not os.path.isfile(path):
        return False, f"bitcoin.conf not found at {path}"
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except (OSError, IOError) as e:
        return False, f"Cannot read bitcoin.conf: {e}"
    current_value: Optional[int] = None
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue
        if "=" in stripped:
            key, _, val = stripped.partition("=")
            if key.strip().lower() == "rpcworkqueue":
                if current_value is not None:
                    continue
                try:
                    current_value = max(0, int(val.strip()))
                except ValueError:
                    current_value = 0
                if current_value < min_value:
                    new_lines.append(f"rpcworkqueue={min_value}\n")
                else:
                    new_lines.append(line)
                continue
        new_lines.append(line)
    if current_value is not None and current_value >= min_value:
        return False, f"rpcworkqueue already {current_value} (>= {min_value})"
    if current_value is None:
        new_lines.append(f"\nrpcworkqueue={min_value}\n")
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    except (OSError, IOError) as e:
        return False, f"Cannot write bitcoin.conf: {e}"
    return True, f"Set rpcworkqueue={min_value} in {path}. Restart Bitcoin Core for it to take effect."


def read_bitcoin_conf_credentials(datadir: str) -> Optional[tuple[str, str]]:
    """
    Read rpcuser and rpcpassword from bitcoin.conf in the given datadir.
    Returns (rpcuser, rpcpassword) only if both are present; otherwise None.
    Skips comments and supports optional spaces around '='.
    """
    path = os.path.join(os.path.expanduser(datadir), "bitcoin.conf")
    try:
        with open(path, "r") as f:
            lines = f.readlines()
    except (OSError, IOError):
        return None
    rpc_user: Optional[str] = None
    rpc_password: Optional[str] = None
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, val = line.partition("=")
            key = key.strip().lower()
            val = val.strip()
            if key == "rpcuser":
                rpc_user = val
            elif key == "rpcpassword":
                rpc_password = val
    if rpc_user and rpc_password:
        return (rpc_user, rpc_password)
    return None


def read_cookie_file(
    cookie_path: Optional[str] = None,
    datadir: Optional[str] = None,
    network: str = "mainnet",
) -> Optional[tuple[str, str]]:
    """
    Read Bitcoin Core .cookie file; return (user, password) for Basic auth, or None.
    Prefer cookie_path (full path), else datadir/.cookie, else default datadir for network.
    """
    path = cookie_path
    if not path:
        dir_path = datadir or get_bitcoin_datadir(network)
        path = os.path.join(dir_path, ".cookie")
    path = os.path.expanduser(path)
    try:
        with open(path, "r") as f:
            line = f.readline()
    except (OSError, IOError):
        return None
    if not line:
        return None
    line = line.strip()
    idx = line.find(":")
    if idx < 0:
        return None
    return (line[:idx], line[idx + 1 :])


@dataclass
class MinerConfig:
    """Configuration for the BTC miner server."""

    rpc_host: str = "127.0.0.1"
    rpc_port: int = 18443
    rpc_user: str = ""
    rpc_password: str = ""
    rpc_timeout: int = 30
    network: str = "regtest"
    mining_address: str = "bc1qwa6mt2gy4gfazg29tn9k8qvtzmxyj6ju4z0y9u"
    num_threads: int = 1
    num_workers: int = 8  # default 8; 4 = thesis quadrant partition (500D); overridden by env/CLI
    use_unified: bool = True
    single_nonce_only: bool = False  # Thesis validation: try only 1–2 entropy-reduced nonces, no expansion
    rpc_cookie_file: Optional[str] = None
    rpc_datadir: Optional[str] = None
    verbose: int = 0

    def __post_init__(self) -> None:
        if self.rpc_port <= 0:
            self.rpc_port = _default_port(self.network)

    @property
    def rpc_url(self) -> str:
        return f"http://{self.rpc_host}:{self.rpc_port}/"

    def auth_tuple(self) -> Optional[tuple[str, str]]:
        if self.rpc_user and self.rpc_password:
            return (self.rpc_user, self.rpc_password)
        cookie_path = self.rpc_cookie_file or os.environ.get("BTC_COOKIE_FILE") or None
        datadir = self.rpc_datadir or os.environ.get("BTC_DATADIR") or None
        path_used, found = resolve_cookie_for_auth(
            self.network,
            cookie_path=cookie_path,
            datadir=datadir,
        )
        if found:
            return read_cookie_file(cookie_path=path_used, datadir=None, network=self.network)
        creds = read_bitcoin_conf_credentials(get_bitcoin_datadir(self.network))
        return creds


def _default_port(network: str) -> int:
    ports = {"mainnet": 8332, "testnet": 18332, "regtest": 18443, "signet": 38332}
    return ports.get(network, 18443)


def load_config_from_env() -> MinerConfig:
    """Build config from environment variables. BTC_QUADRANT_MODE=1 forces 4 workers (thesis quadrant)."""
    network = os.environ.get("BTC_NETWORK", "regtest")
    port_str = os.environ.get("BTC_RPC_PORT", "")
    port = int(port_str) if port_str.isdigit() else _default_port(network)
    if os.environ.get("BTC_QUADRANT_MODE", "").strip().lower() in ("1", "true", "yes"):
        num_workers = QUADRANT_WORKERS
    else:
        num_workers = max(1, int(os.environ.get("BTC_NUM_WORKERS", str(default_num_workers()))))
    return MinerConfig(
        rpc_host=os.environ.get("BTC_RPC_HOST", "127.0.0.1"),
        rpc_port=port,
        rpc_user=os.environ.get("BTC_RPC_USER", ""),
        rpc_password=os.environ.get("BTC_RPC_PASSWORD", ""),
        rpc_timeout=int(os.environ.get("BTC_RPC_TIMEOUT", "30")),
        network=network,
        mining_address=os.environ.get("BTC_MINING_ADDRESS", "bc1qwa6mt2gy4gfazg29tn9k8qvtzmxyj6ju4z0y9u"),
        num_threads=max(1, int(os.environ.get("BTC_NUM_THREADS", "1"))),
        num_workers=num_workers,
        use_unified=os.environ.get("BTC_USE_UNIFIED", "1").strip() in ("1", "true", "yes"),
        single_nonce_only=os.environ.get("BTC_SINGLE_NONCE_ONLY", "0").strip() in ("1", "true", "yes"),
        rpc_cookie_file=os.environ.get("BTC_COOKIE_FILE") or None,
        rpc_datadir=os.environ.get("BTC_DATADIR") or None,
        verbose=int(os.environ.get("BTC_VERBOSE", "0")),
    )
