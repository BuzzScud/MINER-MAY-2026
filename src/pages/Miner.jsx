import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useStorage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Panel, PanelCollapseControls, PanelCollapseProvider } from '../components/common/Panel';
import { MempoolView } from '../features/mempool/MempoolView';
import '../features/mempool/mempool.css';

const MINER_API = '/api/miner';
const DEFAULT_PORTS = { mainnet: 8332, testnet: 18332, regtest: 18443, signet: 38332 };
const AUTO_ROUND_5MIN_SEC = 300;
const AUTO_ROUND_10MIN_SEC = 600;
const DEFAULT_MINING_ADDRESS = 'bc1q578vf2hd0vrtr6hf83ag4e4q3dwx0u0aeyjvzv';
const LEGACY_MINING_ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 2,
    },
  },
});

function api(path, params = {}) {
  const q = new URLSearchParams(params).toString();
  const url = q ? `${MINER_API}${path}?${q}` : `${MINER_API}${path}`;
  return fetch(url).then((r) => (r.ok ? r.json() : r.json().then((d) => ({ ok: false, error: d.error || 'Request failed' })))).catch(() => ({ ok: false, error: 'Request failed' }));
}

function post(path, body) {
  return fetch(`${MINER_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then((r) => (r.ok ? r.json() : r.json().then((d) => ({ ok: false, error: d.error || 'Request failed' }))))
    .catch(() => ({ ok: false, error: 'Request failed' }));
}

function truncateAddress(addr) {
  if (!addr || !addr.trim()) return 'Not set';
  const s = addr.trim();
  return s.length <= 16 ? s : `${s.slice(0, 8)}\u2026${s.slice(-6)}`;
}

function Metric({ label, value, mono = false }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 px-2 py-1.5 flex flex-col justify-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 text-gray-900 dark:text-white ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</div>
    </div>
  );
}

const REGIME_BADGE_CLASS = {
  DEEP_LOCK: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  COHERENCE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  CLUTCH: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  SUB_FLOOR: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  VACUUM: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function RegimeBadge({ regime }) {
  if (!regime) return null;
  const label = regime.replace(/_/g, '-');
  const cls = REGIME_BADGE_CLASS[regime] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function CompareCell({ probe }) {
  if (!probe?.ok) return <span className="text-gray-400">—</span>;
  return (
    <span className="font-mono text-gray-900 dark:text-white">
      {probe.d_ij} <RegimeBadge regime={probe.regime} />
    </span>
  );
}

function ProbeRow({ label, probe }) {
  if (!probe?.ok) {
    return (
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{label}</span>
        <span>{probe?.error ?? '—'}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
      <span className="flex items-center gap-2 font-mono">
        <span className="text-gray-900 dark:text-white">d_ij = {probe.d_ij}</span>
        <RegimeBadge regime={probe.regime} />
      </span>
    </div>
  );
}

export default function Miner() {
  const { getItem, setItem } = useStorage();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const [config, setConfig] = useState({
    rpc_host: '127.0.0.1',
    rpc_port: 8332,
    rpc_user: '',
    rpc_password: '',
    network: 'mainnet',
    mining_address: DEFAULT_MINING_ADDRESS,
    cookie_file: '',
    datadir: '',
    num_workers: 8,
    search_mode: 'thesis',
  });

  const [connectionStatus, setConnectionStatus] = useState({ state: 'idle', message: 'Not checked — open settings to connect.', connected: false });
  const [connectionHint, setConnectionHint] = useState('');
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectMessage, setDetectMessage] = useState(null);

  const [metrics, setMetrics] = useState(null);
  const [stats, setStats] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const [activityEntries, setActivityEntries] = useState([]);
  const miningLogRef = useRef(null);
  const networkActivityRef = useRef(null);
  const [thesisInfo, setThesisInfo] = useState(null);
  const [miningError, setMiningError] = useState('');

  const [backtestBlocks, setBacktestBlocks] = useState(100);
  const [backtestRunning, setBacktestRunning] = useState(false);
  const [backtestResult, setBacktestResult] = useState(null);
  const [backtestStatus, setBacktestStatus] = useState('');
  const [pollingEnabled, setPollingEnabled] = useState(false);

  const [selfTest, setSelfTest] = useState(null);
  const [selfTestRefreshing, setSelfTestRefreshing] = useState(false);
  const [suptStreams, setSuptStreams] = useState(null);
  const [suptProbe, setSuptProbe] = useState(null);
  const [suptProbeZ0, setSuptProbeZ0] = useState(null);
  const [suptCompare, setSuptCompare] = useState(null);
  const [dryRun, setDryRun] = useState(false);
  const [autoRoundRestartSec, setAutoRoundRestartSec] = useState(0);

  const getConfigForApi = useCallback(() => {
    const port = config.rpc_port || DEFAULT_PORTS[config.network] || 8332;
    return {
      rpc_host: config.rpc_host,
      rpc_port: port,
      rpc_user: config.rpc_user,
      rpc_password: config.rpc_password,
      network: config.network,
      mining_address: config.mining_address,
      cookie_file: config.cookie_file || undefined,
      datadir: config.datadir || undefined,
      num_workers: Math.max(1, Math.min(16, config.num_workers || 8)),
      use_unified: config.search_mode !== 'linear',
      search_mode: config.search_mode || 'thesis',
      auto_round_restart: autoRoundRestartSec > 0,
      auto_round_restart_sec: autoRoundRestartSec,
    };
  }, [config, autoRoundRestartSec]);

  const MINER_SERVER_UNREACHABLE = 'Request failed';
  const minerServerDownMessage = 'Miner server not running. Start it with: npm run miner:server';

  const refreshMiningStats = useCallback(() => {
    api('/stats').then((s) => {
      if (s.hashrate !== undefined) {
        setStats(s);
        if (s.auto_round_restart_sec !== undefined) {
          setAutoRoundRestartSec(Number(s.auto_round_restart_sec) || 0);
        }
      }
    });
  }, []);

  const checkConnection = useCallback(async () => {
    setCheckingConnection(true);
    const cfg = getConfigForApi();
    const params = Object.fromEntries(Object.entries(cfg).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
    const r = await api('/status', params);
    setCheckingConnection(false);
    if (r.ok && r.connected) {
      setConnectionStatus({ state: 'connected', message: `Connected: ${r.chain}, blocks ${r.blocks}`, connected: true });
      setConnectionHint('');
      setPollingEnabled(true);
    } else {
      const isServerDown = r.error === MINER_SERVER_UNREACHABLE;
      setConnectionStatus({
        state: 'error',
        message: isServerDown ? minerServerDownMessage : (r.error || 'Not connected'),
        connected: false,
      });
      setConnectionHint(
        isServerDown ? '' : (r.cookie_found === false && r.cookie_path ? `No .cookie file at ${r.cookie_path}. Start Bitcoin Core with RPC enabled.` : '')
      );
    }
    return r;
  }, [getConfigForApi]);

  const runDetect = useCallback(async () => {
    setDetecting(true);
    setDetectMessage(null);
    const r = await api('/detect');
    setDetecting(false);
    if (r.ok && r.recommended) {
      setConfig((prev) => ({
        ...prev,
        rpc_host: r.recommended.rpc_host || prev.rpc_host,
        rpc_port: r.recommended.rpc_port ?? prev.rpc_port,
        network: r.recommended.network || prev.network,
        cookie_file: r.recommended.cookie_file || '',
        datadir: r.recommended.datadir || '',
      }));
      setDetectMessage({ type: 'success', text: `Bitcoin Core detected on ${r.recommended.network} (port ${r.recommended.rpc_port}). Connection settings updated.` });
      const connected = r.results?.some((x) => x.connected);
      if (connected) {
        setConnectionStatus({ state: 'connected', message: `Auto-connected to ${r.recommended.network}`, connected: true });
      }
    } else {
      const isServerDown = r.error === MINER_SERVER_UNREACHABLE;
      setDetectMessage({
        type: 'error',
        text: isServerDown ? minerServerDownMessage : 'Bitcoin Core not found. Install and run Bitcoin Core, then try again.',
      });
    }
  }, []);

  useEffect(() => {
    getItem(STORAGE_KEYS.BTC_MINER_ADDRESS).then((addr) => {
      const trimmed = typeof addr === 'string' ? addr.trim() : '';
      const nextAddress =
        trimmed && trimmed !== LEGACY_MINING_ADDRESS ? trimmed : DEFAULT_MINING_ADDRESS;
      setConfig((prev) => ({ ...prev, mining_address: nextAddress }));
      if (nextAddress !== trimmed) {
        setItem(STORAGE_KEYS.BTC_MINER_ADDRESS, nextAddress).catch(() => {});
      }
    });
    getItem(STORAGE_KEYS.BTC_MINER_SEARCH_MODE).then((mode) => {
      if (mode === 'thesis' || mode === 'linear' || mode === 'hybrid') {
        setConfig((prev) => ({ ...prev, search_mode: mode }));
      }
    });
    getItem(STORAGE_KEYS.BTC_MINER_AUTO_ROUND).then((val) => {
      if (val === '1' || val === true) {
        setAutoRoundRestartSec(AUTO_ROUND_10MIN_SEC);
        return;
      }
      const sec = parseInt(String(val), 10);
      if (sec === AUTO_ROUND_5MIN_SEC || sec === AUTO_ROUND_10MIN_SEC) {
        setAutoRoundRestartSec(sec);
      }
    });
  }, [getItem]);

  useEffect(() => {
    let cancelled = false;
    api('/stats').then((s) => {
      if (cancelled || s.hashrate === undefined) return;
      setStats(s);
      if (s.running) setPollingEnabled(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    getItem(STORAGE_KEYS.BTC_MINER_CONNECTION).then((saved) => {
      if (saved && typeof saved === 'object' && saved.connected) {
        setConnectionStatus((prev) =>
          prev.state === 'idle' ? { state: 'connected', message: saved.message || 'Connected (restored)', connected: true } : prev
        );
      }
    });
  }, [getItem]);

  useEffect(() => {
    if (connectionStatus.connected) {
      setItem(STORAGE_KEYS.BTC_MINER_CONNECTION, { connected: true, message: connectionStatus.message }).catch(() => {});
    }
  }, [connectionStatus.connected, connectionStatus.message, setItem]);

  useEffect(() => {
    if (!pollingEnabled) return;
    const cfg = getConfigForApi();
    const params = Object.fromEntries(
      Object.entries(cfg)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)]),
    );
    const fetchAll = () => {
      api('/stats').then((r) => r.hashrate !== undefined && setStats(r));
      if (connectionStatus.connected || params.network) {
        api('/metrics', params).then((m) => m.ok && setMetrics(m));
      }
      api('/log').then((r) => r.lines && setLogLines(r.lines));
      api('/activity').then((r) => r.entries && setActivityEntries(r.entries));
      api('/supt_streams?lines=5').then((r) => r.ok && setSuptStreams(r));
    };
    fetchAll();
    const t = setInterval(fetchAll, 1000);
    return () => clearInterval(t);
  }, [getConfigForApi, connectionStatus.connected, pollingEnabled]);

  useEffect(() => {
    api('/supt_probe').then((r) => r.ok && setSuptProbe(r)).catch(() => {});
    api('/supt_probe_z0').then((r) => r.ok && setSuptProbeZ0(r)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!stats?.running) return;
    const fetchProbe = () => {
      api('/supt_probe').then((r) => r.ok && setSuptProbe(r));
      api('/supt_probe_z0').then((r) => r.ok && setSuptProbeZ0(r));
    };
    fetchProbe();
    const t = setInterval(fetchProbe, 5000);
    return () => clearInterval(t);
  }, [stats?.running]);

  useEffect(() => {
    api('/supt_compare').then((r) => r.ok && setSuptCompare(r)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pollingEnabled) return;
    const fetchCompare = () => {
      api('/supt_compare').then((r) => r.ok && setSuptCompare(r));
    };
    fetchCompare();
    const t = setInterval(fetchCompare, 10000);
    return () => clearInterval(t);
  }, [pollingEnabled]);

  useEffect(() => {
    api('/self_test').then((r) => {
      if (r.ok !== false) setSelfTest(r);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api('/thesis_math_status').then((r) => r.python_miner && setThesisInfo(r));
  }, []);

  useEffect(() => {
    if (miningLogRef.current) {
      miningLogRef.current.scrollTop = miningLogRef.current.scrollHeight;
    }
  }, [logLines]);

  useEffect(() => {
    if (networkActivityRef.current) {
      networkActivityRef.current.scrollTop = networkActivityRef.current.scrollHeight;
    }
  }, [activityEntries]);

  const handleStart = async () => {
    setMiningError('');
    const r = await post('/start', { ...getConfigForApi(), dry_run: dryRun });
    const alreadyRunning =
      r.already_running === true ||
      (typeof r.error === 'string' && r.error.toLowerCase().includes('already running'));
    if (r.ok || alreadyRunning) {
      setMiningError('');
      if (r.dry_run) {
        setMiningError('');
        if (r.self_test) setSelfTest(r.self_test);
        return;
      }
      if (r.warning) setMiningError(r.warning);
      setPollingEnabled(true);
      refreshMiningStats();
    } else {
      let msg = r.error || 'Failed to start';
      if (msg.toLowerCase().includes('bech32') || msg.toLowerCase().includes('checksum')) {
        msg += ' Copy the address exactly from your wallet (avoid digit 1 vs letter l, or 0 vs O).';
      }
      setMiningError(msg);
    }
  };

  const handleStop = async () => {
    await post('/stop');
  };

  const [restarting, setRestarting] = useState(false);
  const handleRestart = async () => {
    setRestarting(true);
    setMiningError('');
    const r = await post('/restart', getConfigForApi());
    setRestarting(false);
    if (r.ok) {
      setMiningError('');
      setPollingEnabled(true);
      setStats({ hashes: 0, blocks: 0, hashrate: 0, elapsed_sec: null });
      refreshMiningStats();
    } else {
      setMiningError(r.error || 'Restart failed');
    }
  };

  const handleAutoRoundToggle = async (intervalSec, enabled) => {
    const nextSec = enabled ? intervalSec : 0;
    setAutoRoundRestartSec(nextSec);
    setItem(STORAGE_KEYS.BTC_MINER_AUTO_ROUND, String(nextSec)).catch(() => {});
    const r = await post('/auto_round_restart', {
      auto_round_restart: nextSec > 0,
      auto_round_restart_sec: nextSec,
    });
    if (!r.ok) {
      setMiningError(r.error || 'Failed to update auto-round setting');
      return;
    }
    setMiningError('');
    refreshMiningStats();
  };

  const handleBacktest = async () => {
    setBacktestRunning(true);
    setBacktestResult(null);
    setBacktestStatus('Running backtest…');
    const numBlocks = Math.max(1, Math.min(500, backtestBlocks));
    const r = await post('/backtest', { ...getConfigForApi(), num_blocks: numBlocks });
    setBacktestRunning(false);
    setBacktestStatus(r.ok ? 'Done' : (r.error || 'Error'));
    if (r.ok) setBacktestResult(r);
    else setBacktestResult({ error: r.error });
  };

  const saveAddress = () => {
    setItem(STORAGE_KEYS.BTC_MINER_ADDRESS, config.mining_address).catch(() => {}).finally(() => setWalletModalOpen(false));
  };

  const refreshSelfTest = async () => {
    setSelfTestRefreshing(true);
    const r = await api('/self_test?refresh=1');
    setSelfTestRefreshing(false);
    if (r.ok !== false) setSelfTest(r);
  };

  const summaryText = `Network: ${config.network} · ${config.rpc_host}:${config.rpc_port || DEFAULT_PORTS[config.network]}`;

  return (
    <PanelCollapseProvider>
    <div className="w-full max-w-[1400px] mx-auto px-4">
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-4">
        <Link to="/" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <span className="font-medium text-gray-900 dark:text-white">Miner</span>
      </nav>

      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">BTC Miner</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Connect to Bitcoin Core. Use Detect Bitcoin Core to find and connect automatically.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PanelCollapseControls />
          <div
            className="flex items-center gap-2 rounded-full px-3 py-1 text-xs text-gray-700 dark:text-gray-300"
            title={connectionStatus.connected ? 'RPC connected' : 'RPC not connected'}
          >
            <span
              className={`h-2 w-2 rounded-full ${connectionStatus.connected ? 'bg-green-500' : checkingConnection ? 'animate-pulse bg-amber-500' : 'bg-red-500'}`}
            />
            {checkingConnection ? 'Checking…' : connectionStatus.connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </header>

      <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'dashboard' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
        >
          Dashboard
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mempool')}
          className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'mempool' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
        >
          Mempool
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('backtest')}
          className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'backtest' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
        >
          Backtest
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <>
          {detectMessage && (
            <div className={`mb-4 rounded-lg px-3 py-2.5 ${detectMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'}`}>
              {detectMessage.text}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <Panel title="Connection">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${connectionStatus.connected ? 'bg-green-500' : checkingConnection ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`}
                    aria-hidden
                  />
                  {checkingConnection ? 'Checking…' : connectionStatus.message}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{summaryText}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={runDetect}
                    disabled={detecting}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {detecting ? 'Detecting…' : 'Detect Bitcoin Core'}
                  </button>
                  <button type="button" onClick={() => setConnectionModalOpen(true)} className="rounded-lg bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500">
                    Connection settings
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await checkConnection().catch(() => {});
                      setPollingEnabled(true);
                    }}
                    disabled={checkingConnection}
                    className="rounded-lg bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500"
                  >
                    Connect &amp; start metrics
                  </button>
                </div>
                {connectionHint && <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">{connectionHint}</p>}
              </Panel>

              <Panel title="Mining">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Address: {truncateAddress(config.mining_address)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Use your own payout address from your wallet (paste exactly to avoid bech32 errors). Mining continues in the background when you leave this page.</p>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <select
                    value={config.num_workers}
                    onChange={(e) => setConfig((c) => ({ ...c, num_workers: Number(e.target.value) }))}
                    className="appearance-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs py-1.5 pl-2.5 pr-8 min-h-[34px] cursor-pointer bg-no-repeat bg-[length:1rem] bg-[right_0.4rem_center] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")" }}
                    aria-label="Number of workers"
                  >
                    {[1, 4, 8, 12, 16].map((n) => (
                      <option key={n} value={n}>{n} workers</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setWalletModalOpen(true)} className="rounded-lg bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500">
                    Edit address
                  </button>
                  <button type="button" onClick={handleStart} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                    Start
                  </button>
                  <button type="button" onClick={handleStop} className="rounded-lg bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500">
                    Stop
                  </button>
                  <button type="button" onClick={handleRestart} disabled={restarting} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50" title="Reset stats to 0 and restart mining">
                    {restarting ? 'Restarting…' : 'Restart'}
                  </button>
                  <label
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer"
                    title="End each mining round after 5 minutes and start a new one (logs Stream B cadence rows; keeps session stats)"
                  >
                    <input
                      type="checkbox"
                      checked={autoRoundRestartSec === AUTO_ROUND_5MIN_SEC}
                      onChange={(e) => handleAutoRoundToggle(AUTO_ROUND_5MIN_SEC, e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    5m auto-round
                  </label>
                  <label
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer"
                    title="End each mining round after 10 minutes and start a new one (logs Stream B cadence rows; keeps session stats)"
                  >
                    <input
                      type="checkbox"
                      checked={autoRoundRestartSec === AUTO_ROUND_10MIN_SEC}
                      onChange={(e) => handleAutoRoundToggle(AUTO_ROUND_10MIN_SEC, e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    10m auto-round
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Hashrate" value={stats?.hashrate != null ? `${stats.hashrate} H/s` : null} mono />
                  <Metric label="Hashes" value={stats?.hashes} mono />
                  <Metric label="Blocks" value={stats?.blocks} mono />
                  <Metric label="Elapsed" value={stats?.elapsed_sec != null ? `${stats.elapsed_sec}s` : null} mono />
                </div>
                {miningError && <p className="text-xs text-red-400 mt-2">{miningError}</p>}
              </Panel>

              <Panel title="Search Mode">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Thesis = ordered candidates (Custom Math). Linear = supt_miner baseline (nonce++). Hybrid = thesis + linear sweep (benchmark).
                </p>
                <div className="flex flex-wrap gap-3 mb-2">
                  {['thesis', 'linear', 'hybrid'].map((mode) => (
                    <label key={mode} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer capitalize">
                      <input
                        type="radio"
                        name="search_mode"
                        value={mode}
                        checked={config.search_mode === mode}
                        onChange={() => {
                          setConfig((c) => ({ ...c, search_mode: mode }));
                          setItem(STORAGE_KEYS.BTC_MINER_SEARCH_MODE, mode).catch(() => {});
                        }}
                        className="border-gray-300"
                      />
                      {mode}
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Active</span>
                  <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                    {stats?.search_mode ?? config.search_mode}
                  </span>
                </div>
                {stats?.running && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">Stop and restart mining to apply search mode.</p>
                )}
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">SUPT A/B (N=512 / N=71)</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400">
                        <th className="py-1 pr-2">Mode</th>
                        <th className="py-1 pr-2">Rounds</th>
                        <th className="py-1 pr-2">A N=512</th>
                        <th className="py-1 pr-2">A N=71</th>
                        <th className="py-1">B N=71</th>
                      </tr>
                    </thead>
                    <tbody>
                      {['thesis', 'linear'].map((mode) => {
                        const row = suptCompare?.[mode];
                        return (
                          <tr key={mode} className="border-t border-gray-200 dark:border-gray-700">
                            <td className="py-1 pr-2 capitalize font-semibold">{mode}</td>
                            <td className="py-1 pr-2 font-mono">{row?.rounds ?? '—'}</td>
                            <td className="py-1 pr-2"><CompareCell probe={row?.stream_a_512} /></td>
                            <td className="py-1 pr-2"><CompareCell probe={row?.stream_a_71} /></td>
                            <td className="py-1"><CompareCell probe={row?.stream_b_seconds_71} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {suptCompare?.note && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">{suptCompare.note}</p>
                )}
              </Panel>

              <Panel title="Engine Self-Test">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Genesis block PoW validation (double-SHA256, 80-byte header).</p>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${selfTest?.match ? 'bg-green-500' : selfTest?.loading ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`}
                    aria-hidden
                  />
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    {selfTest?.loading ? 'Running…' : selfTest?.match ? 'MATCH' : 'MISMATCH'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <Metric label="Single-thread" value={selfTest?.benchmark?.hashrate_hs != null ? `${Number(selfTest.benchmark.hashrate_hs).toLocaleString()} H/s` : null} mono />
                  <Metric label="Target diff" value={selfTest?.benchmark?.target_diff != null ? String(selfTest.benchmark.target_diff) : '1.0'} mono />
                </div>
                {selfTest?.genesis?.genesis_hash && (
                  <p className="font-mono text-[10px] text-gray-500 dark:text-gray-400 break-all mb-2">{selfTest.genesis.genesis_hash}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={refreshSelfTest} disabled={selfTestRefreshing} className="rounded-lg bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500 disabled:opacity-50">
                    {selfTestRefreshing ? 'Benchmarking…' : 'Re-run benchmark'}
                  </button>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="rounded border-gray-300" />
                    Dry-run (no mining)
                  </label>
                </div>
              </Panel>

              <Panel title="Thesis & Custom Math">
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  {(thesisInfo?.base_nonce_source || thesisInfo?.last_seed_prime_path) && (
                    <p className="font-mono text-xs mb-1">
                      Base: {thesisInfo.base_nonce_source ?? '—'} · Seed: {thesisInfo.last_seed_prime_path ?? 'n/a'}
                    </p>
                  )}
                  {thesisInfo?.python_miner && <p>{thesisInfo.python_miner}</p>}
                  {thesisInfo?.thesis_alignment && <p>{thesisInfo.thesis_alignment}</p>}
                </div>
              </Panel>
            </div>

            <div className="flex flex-col gap-3">
              <Panel title="Live Network Metrics">
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Chain" value={metrics?.chain} />
                  <Metric label="Block height" value={metrics?.blocks} mono />
                  <Metric label="Headers" value={metrics?.headers} mono />
                  <Metric label="Sync progress" value={metrics?.verification_progress != null ? `${(metrics.verification_progress * 100).toFixed(2)}%` : null} />
                  <Metric label="Difficulty" value={metrics?.difficulty} mono />
                  <Metric label="Connections" value={metrics?.connections} mono />
                </div>
              </Panel>

              <Panel title="Mining Log">
                <pre
                  ref={miningLogRef}
                  className="font-mono text-xs text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-2 py-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-all scroll-smooth"
                >
                  {logLines.length ? logLines.join('\n') : '—'}
                </pre>
              </Panel>

              <Panel title="SUPT Streams">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Stream A: raw hash search · Stream B: block cadence fold (sample every {suptStreams?.sample_every ?? 64}).
                </p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <Metric label="Stream A rows" value={suptStreams?.stream_a_rows} mono />
                  <Metric label="Stream B rows" value={suptStreams?.stream_b_rows} mono />
                </div>
                <p className="text-[10px] font-mono text-gray-500 dark:text-gray-400 break-all mb-1">A: {suptStreams?.stream_a_path ?? '—'}</p>
                <p className="text-[10px] font-mono text-gray-500 dark:text-gray-400 break-all mb-2">B: {suptStreams?.stream_b_path ?? '—'}</p>
                <div className="text-[10px] font-mono text-gray-600 dark:text-gray-300 space-y-1 max-h-24 overflow-y-auto">
                  {(suptStreams?.tail_a ?? []).slice(-3).map((row, i) => (
                    <div key={`a-${i}`}>A {row.join(', ')}</div>
                  ))}
                  {(suptStreams?.tail_b ?? []).slice(-3).map((row, i) => (
                    <div key={`b-${i}`}>B {row.join(', ')}</div>
                  ))}
                  {!suptStreams?.tail_a?.length && !suptStreams?.tail_b?.length && <div>—</div>}
                </div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">Disable with BTC_SUPT_LOG=0 (server restart).</p>
              </Panel>

              <Panel title="SUPT Probe (frozen α=0.01)">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Diagnostic frozen pipeline — does not alter nonce search. Compare at matched N (512 or 71).
                </p>
                {suptProbe?.insufficient_data && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                    Insufficient data — Stream B needs at least 71 rows for reliable N=71 probes.
                  </p>
                )}
                <div className="space-y-2 mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Stream A (raw search)</p>
                  <ProbeRow label="N=512" probe={suptProbe?.probes?.stream_a_hash_int_512} />
                  <ProbeRow label="N=71" probe={suptProbe?.probes?.stream_a_hash_int_71} />
                </div>
                <div className="space-y-2 mb-3 border-t border-gray-200 dark:border-gray-700 pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Stream B (block cadence / fold)</p>
                  <ProbeRow label="N=512 seconds" probe={suptProbe?.probes?.stream_b_seconds_512} />
                  <ProbeRow label="N=71 seconds" probe={suptProbe?.probes?.stream_b_seconds_71} />
                  <ProbeRow label="N=512 hashes_tried" probe={suptProbe?.probes?.stream_b_hashes_tried_512} />
                  <ProbeRow label="N=71 hashes_tried" probe={suptProbe?.probes?.stream_b_hashes_tried_71} />
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                    Paper anchors (Consensus Mechanism Geometry)
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-600 dark:text-gray-300">
                    {Object.entries(suptProbe?.anchors ?? {}).map(([key, a]) => (
                      <span key={key} className="font-mono">
                        {a.label ?? key}: {a.d_ij} <RegimeBadge regime={a.regime} />
                      </span>
                    ))}
                    {!suptProbe?.anchors && <span>—</span>}
                  </div>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                    Z₀ frame ({suptProbeZ0?.z0_ohm ?? '376.7303'} Ω)
                  </p>
                  {suptProbeZ0?.interpretation && (
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">{suptProbeZ0.interpretation}</p>
                  )}
                  <div className="space-y-2 mb-2">
                    <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-300">Stream A — raw vs Z₀</p>
                    <ProbeRow label="N=512 raw" probe={suptProbeZ0?.probes?.raw?.stream_a_hash_int_512} />
                    <ProbeRow label="N=512 Z₀" probe={suptProbeZ0?.probes?.z0_anchored?.stream_a_hash_int_512} />
                    <ProbeRow label="N=71 raw" probe={suptProbeZ0?.probes?.raw?.stream_a_hash_int_71} />
                    <ProbeRow label="N=71 Z₀" probe={suptProbeZ0?.probes?.z0_anchored?.stream_a_hash_int_71} />
                  </div>
                  <div className="space-y-2 mb-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                    <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-300">Stream B cadence — raw vs Z₀</p>
                    <ProbeRow label="N=71 sec raw" probe={suptProbeZ0?.probes?.raw?.stream_b_seconds_71} />
                    <ProbeRow label="N=71 sec Z₀" probe={suptProbeZ0?.probes?.z0_anchored?.stream_b_seconds_71} />
                    <ProbeRow label="N=71 hashes raw" probe={suptProbeZ0?.probes?.raw?.stream_b_hashes_tried_71} />
                    <ProbeRow label="N=71 hashes Z₀" probe={suptProbeZ0?.probes?.z0_anchored?.stream_b_hashes_tried_71} />
                  </div>
                  <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                    <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-300">Reference lattice (Z₀ frame)</p>
                    <ProbeRow label="Z₀·φⁿ" probe={suptProbeZ0?.reference_lattice?.z0_phi_powers} />
                    <ProbeRow label="Z₀·Fib ratios" probe={suptProbeZ0?.reference_lattice?.z0_fib_ratios} />
                  </div>
                </div>
                {!stats?.running && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">Start mining to refresh probe every 5s.</p>
                )}
              </Panel>

              <Panel title="Network Activity">
                <pre
                  ref={networkActivityRef}
                  className="font-mono text-xs text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-2 py-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-all scroll-smooth"
                >
                  {activityEntries.length ? activityEntries.join('\n') : '—'}
                </pre>
              </Panel>
            </div>
          </div>
        </>
      )}

      {activeTab === 'mempool' && (
        <QueryClientProvider client={queryClient}>
          <MempoolView embedded />
        </QueryClientProvider>
      )}

      {activeTab === 'backtest' && (
        <Panel title="Backtest (Last N Blocks)">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Test the miner thesis nonce logic on the last N blocks. Uses current connection settings.</p>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              Blocks to test
              <input
                type="number"
                min={1}
                max={500}
                value={backtestBlocks}
                onChange={(e) => setBacktestBlocks(Number(e.target.value) || 100)}
                className="ml-2 w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs py-1.5 px-2.5"
              />
            </label>
            <button type="button" onClick={handleBacktest} disabled={backtestRunning} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {backtestRunning ? 'Running…' : 'Run backtest'}
            </button>
          </div>
          {backtestStatus && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{backtestStatus}</p>}
          {backtestResult?.error && <p className="text-xs text-red-400">{backtestResult.error}</p>}
          {backtestResult?.ok && (
            <div className="text-xs space-y-1 mt-2">
              <p>Chain: {backtestResult.chain} · Tip: {backtestResult.tip}</p>
              <p>Phase 1 hits: {backtestResult.phase1_hits} / {backtestResult.total} · Phase 2 hits: {backtestResult.phase2_hits} / {backtestResult.total}</p>
            </div>
          )}
        </Panel>
      )}

      {connectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setConnectionModalOpen(false)}>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xs font-bold text-gray-900 dark:text-white mb-4">Connection settings</h2>
            <div className="space-y-2 mb-3">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Network
                <select value={config.network} onChange={(e) => setConfig((c) => ({ ...c, network: e.target.value, rpc_port: DEFAULT_PORTS[e.target.value] ?? c.rpc_port }))} className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs py-1.5 px-2.5">
                  {['mainnet', 'testnet', 'regtest', 'signet'].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Host
                <input type="text" value={config.rpc_host} onChange={(e) => setConfig((c) => ({ ...c, rpc_host: e.target.value }))} className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs py-1.5 px-2.5" />
              </label>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Port
                <input type="number" value={config.rpc_port} onChange={(e) => setConfig((c) => ({ ...c, rpc_port: Number(e.target.value) || DEFAULT_PORTS[c.network] }))} className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs py-1.5 px-2.5" />
              </label>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                User (optional)
                <input type="text" value={config.rpc_user} onChange={(e) => setConfig((c) => ({ ...c, rpc_user: e.target.value }))} placeholder="Optional" className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs py-1.5 px-2.5" />
              </label>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Password (optional)
                <input type="password" value={config.rpc_password} onChange={(e) => setConfig((c) => ({ ...c, rpc_password: e.target.value }))} placeholder="Optional" className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs py-1.5 px-2.5" />
              </label>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Cookie file (optional)
                <input type="text" value={config.cookie_file} onChange={(e) => setConfig((c) => ({ ...c, cookie_file: e.target.value }))} placeholder="e.g. /path/to/.cookie" className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs py-1.5 px-2.5" />
              </label>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Data folder (optional)
                <input type="text" value={config.datadir} onChange={(e) => setConfig((c) => ({ ...c, datadir: e.target.value }))} placeholder="e.g. ~/Library/Application Support/Bitcoin" className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs py-1.5 px-2.5" />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConnectionModalOpen(false)} className="rounded-lg bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200">
                Close
              </button>
              <button type="button" onClick={() => { checkConnection(); setConnectionModalOpen(false); }} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {walletModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setWalletModalOpen(false)}>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xs font-bold text-gray-900 dark:text-white mb-4">Mining payout address</h2>
            <input
              type="text"
              value={config.mining_address}
              onChange={(e) => setConfig((c) => ({ ...c, mining_address: e.target.value }))}
              placeholder="bc1q... or bcrt1q..."
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs py-1.5 px-2.5 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setWalletModalOpen(false)} className="rounded-lg bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200">
                Cancel
              </button>
              <button type="button" onClick={saveAddress} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PanelCollapseProvider>
  );
}
