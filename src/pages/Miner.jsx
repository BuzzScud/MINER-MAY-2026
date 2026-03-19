import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useStorage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Panel } from '../components/common/Panel';
import { MempoolView } from '../features/mempool/MempoolView';
import '../features/mempool/mempool.css';

const MINER_API = '/api/miner';
const DEFAULT_PORTS = { mainnet: 8332, testnet: 18332, regtest: 18443, signet: 38332 };

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
    mining_address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    cookie_file: '',
    datadir: '',
    num_workers: 8,
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
      num_workers: Math.max(1, Math.min(8, config.num_workers || 8)),
      use_unified: true,
    };
  }, [config]);

  const MINER_SERVER_UNREACHABLE = 'Request failed';
  const minerServerDownMessage = 'Miner server not running. Start it with: npm run miner:server';

  const checkConnection = useCallback(async () => {
    setCheckingConnection(true);
    const cfg = getConfigForApi();
    const params = Object.fromEntries(Object.entries(cfg).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
    const r = await api('/status', params);
    setCheckingConnection(false);
    if (r.ok && r.connected) {
      setConnectionStatus({ state: 'connected', message: `Connected: ${r.chain}, blocks ${r.blocks}`, connected: true });
      setConnectionHint('');
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
      if (addr && typeof addr === 'string' && addr.trim()) {
        setConfig((prev) => ({ ...prev, mining_address: addr.trim() }));
      }
    });
  }, [getItem]);

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
      api('/stats').then(setStats);
      if (connectionStatus.connected || params.network) {
        api('/metrics', params).then((m) => m.ok && setMetrics(m));
      }
      api('/log').then((r) => r.lines && setLogLines(r.lines));
      api('/activity').then((r) => r.entries && setActivityEntries(r.entries));
    };
    fetchAll();
    const t = setInterval(fetchAll, 1000);
    return () => clearInterval(t);
  }, [getConfigForApi, connectionStatus.connected, pollingEnabled]);

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
    const r = await post('/start', getConfigForApi());
    if (r.ok) {
      setMiningError('');
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
      setStats({ hashes: 0, blocks: 0, hashrate: 0, elapsed_sec: null });
    } else {
      setMiningError(r.error || 'Restart failed');
    }
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

  const summaryText = `Network: ${config.network} · ${config.rpc_host}:${config.rpc_port || DEFAULT_PORTS[config.network]}`;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4">
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-4">
        <Link to="/" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <span className="font-medium text-gray-900 dark:text-white">Miner</span>
      </nav>

      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">BTC Miner</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Connect to Bitcoin Core. Use Detect Bitcoin Core to find and connect automatically.</p>
        </div>
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1 text-xs text-gray-700 dark:text-gray-300"
          title={connectionStatus.connected ? 'RPC connected' : 'RPC not connected'}
        >
          <span
            className={`h-2 w-2 rounded-full ${connectionStatus.connected ? 'bg-green-500' : checkingConnection ? 'animate-pulse bg-amber-500' : 'bg-red-500'}`}
          />
          {checkingConnection ? 'Checking…' : connectionStatus.connected ? 'Connected' : 'Disconnected'}
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
                    {[1, 4, 8].map((n) => (
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
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Hashrate" value={stats?.hashrate != null ? `${stats.hashrate} H/s` : null} mono />
                  <Metric label="Hashes" value={stats?.hashes} mono />
                  <Metric label="Blocks" value={stats?.blocks} mono />
                  <Metric label="Elapsed" value={stats?.elapsed_sec != null ? `${stats.elapsed_sec}s` : null} mono />
                </div>
                {miningError && <p className="text-xs text-red-400 mt-2">{miningError}</p>}
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
  );
}
