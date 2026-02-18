import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';

const EST_OPTS = { timeZone: 'America/New_York' };
const LATENCY_HISTORY_MAX = 60;
const LATENCY_POLL_INTERVAL_MS = 15000;
const DB_CONNECTION_POLL_MS = 10000;

function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${n} B`;
}

function ConfirmModal({ open, title, onClose, onConfirm, confirmLabel, confirmDisabled, children }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      aria-modal="true"
      role="dialog"
      aria-labelledby="confirm-modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#1c1c1c] border border-white/10 rounded-xl max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 id="confirm-modal-title" className="text-lg font-semibold text-gray-100">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-100 text-2xl leading-none" aria-label="Close">
            &times;
          </button>
        </div>
        <div className="p-5">
          {children}
          <div className="mt-5 flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-gray-100 border border-white/20 rounded-lg">
              Cancel
            </button>
            <button type="button" onClick={onConfirm} disabled={confirmDisabled} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg">
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatESTDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...EST_OPTS });
}
function formatESTTime(d) {
  return d.toLocaleDateString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit', ...EST_OPTS }) + ' EST';
}

export default function AdminDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [emergencySubmitting, setEmergencySubmitting] = useState(false);
  const [emergencyError, setEmergencyError] = useState(null);
  const [emergencySuccess, setEmergencySuccess] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyConfirming, setEmergencyConfirming] = useState(false);
  const [dateTime, setDateTime] = useState(() => new Date());
  const [dbTestResult, setDbTestResult] = useState(null);
  const [dbTesting, setDbTesting] = useState(false);
  const [latencyHistory, setLatencyHistory] = useState([]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setStats)
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    const t = setInterval(() => setDateTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const runDbTest = useCallback(() => {
    if (!token) return;
    setDbTesting(true);
    fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error('Request failed');
        return r.json();
      })
      .then((data) => {
        setDbTestResult({
          connected: true,
          latencyMs: data.latencyMs,
          databaseType: data.databaseType,
          version: data.version ?? null,
          activeConnections: data.activeConnections ?? null,
          databaseSizeBytes: data.databaseSizeBytes ?? null,
          lastChecked: new Date().toISOString(),
        });
      })
      .catch(() => setDbTestResult((prev) => ({ ...prev, connected: false, error: 'Request failed' })))
      .finally(() => setDbTesting(false));
  }, [token]);

  useEffect(() => {
    if (!token || !stats) return;
    const fetchDbMetrics = () => {
      fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Request failed'))))
        .then((data) => {
          setDbTestResult((prev) => ({
            ...prev,
            connected: true,
            latencyMs: data.latencyMs,
            databaseType: data.databaseType,
            version: data.version ?? null,
            activeConnections: data.activeConnections ?? null,
            databaseSizeBytes: data.databaseSizeBytes ?? null,
            lastChecked: new Date().toISOString(),
          }));
        })
        .catch(() => setDbTestResult((prev) => (prev ? { ...prev, connected: false } : { connected: false, error: 'Request failed' })));
    };
    fetchDbMetrics();
    const interval = setInterval(fetchDbMetrics, DB_CONNECTION_POLL_MS);
    return () => clearInterval(interval);
  }, [token, stats]);

  useEffect(() => {
    if (!token || !stats) return;
    const poll = () => {
      fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : Promise.reject(new Error('Request failed')))
        .then((data) => {
          setLatencyHistory((prev) => {
            const next = [...prev, { timestamp: Date.now(), latencyMs: data.latencyMs ?? null }];
            return next.length > LATENCY_HISTORY_MAX ? next.slice(-LATENCY_HISTORY_MAX) : next;
          });
        })
        .catch(() => {
          setLatencyHistory((prev) => {
            const next = [...prev, { timestamp: Date.now(), latencyMs: null }];
            return next.length > LATENCY_HISTORY_MAX ? next.slice(-LATENCY_HISTORY_MAX) : next;
          });
        });
    };
    poll();
    const interval = setInterval(poll, LATENCY_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token, stats]);

  const runEmergencyLogout = useCallback(async () => {
    if (!token) return;
    setEmergencyConfirming(true);
    setShowEmergencyModal(false);
    setEmergencyError(null);
    setEmergencySuccess(false);
    setEmergencySubmitting(true);
    try {
      const res = await fetch('/api/admin/emergency-logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setEmergencySuccess(true);
      setTimeout(() => setEmergencySuccess(false), 3000);
    } catch (e) {
      setEmergencyError(e.message || 'Request failed');
    } finally {
      setEmergencySubmitting(false);
      setEmergencyConfirming(false);
    }
  }, [token]);

  const chartData = latencyHistory.map((p) => ({
    ...p,
    timeLabel: new Date(p.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  }));

  const lastLatency = latencyHistory.length > 0 ? latencyHistory[latencyHistory.length - 1] : null;
  const connectionStatus = lastLatency ? (lastLatency.latencyMs != null ? 'Connected' : 'Disconnected') : null;

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-300">
        {error}
      </div>
    );
  }

  if (!stats) {
    return <div className="text-gray-400">Loading stats…</div>;
  }

  return (
    <div className="max-w-4xl">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">/admin</p>
      <h1 className="text-2xl font-bold text-gray-100 mb-6">Overview</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-white/10 bg-[#1c1c1c] p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 uppercase">Total Users</p>
              <p className="text-xl font-semibold text-gray-100">{stats.totalUsers}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">New Users (7 days)</p>
              <p className="text-xl font-semibold text-gray-100">{stats.newUsers7d}</p>
            </div>
          </div>
          <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-gray-500 uppercase">Current Date</p>
              <p className="text-sm font-semibold text-gray-100">{formatESTDate(dateTime)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Current Time</p>
              <p className="text-sm font-semibold text-gray-100">{formatESTTime(dateTime)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#1c1c1c] p-4">
          <p className="text-xs text-gray-500 uppercase mb-1">Admin Status</p>
          <p className="text-sm font-semibold text-green-400 inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" aria-hidden />
            Active
          </p>
          <p className="text-xs text-gray-500 mt-1">Logged in</p>
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-xs text-gray-500 mb-2">Emergency Logout</p>
            <p className="text-xs text-gray-400 mb-2">Log out all non-admin users. You stay logged in.</p>
            <button
              type="button"
              onClick={() => setShowEmergencyModal(true)}
              disabled={emergencySubmitting || !token}
              className="w-full px-3 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              aria-busy={emergencySubmitting}
              aria-label="Log out all non-admin users"
            >
              {emergencySubmitting ? 'Logging out…' : 'Emergency Logout'}
            </button>
            <ConfirmModal
              open={showEmergencyModal}
              title="Emergency Logout"
              onClose={() => setShowEmergencyModal(false)}
              onConfirm={runEmergencyLogout}
              confirmLabel="Emergency Logout"
              confirmDisabled={emergencyConfirming}
            >
              <p className="text-sm text-gray-300">
                Log out all non-admin users? They will be signed out on their next check (within ~30 seconds). You will stay logged in.
              </p>
            </ConfirmModal>
            {emergencyError && (
              <p className="mt-2 text-xs text-red-400" role="alert">
                {emergencyError}
              </p>
            )}
            {emergencySuccess && (
              <p className="mt-2 text-xs text-green-400" role="status">
                Done. Non-admin users will be signed out shortly.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-white/10 bg-[#1c1c1c] p-4">
          <p className="text-xs text-gray-500 uppercase mb-1">Database</p>
          <p className="text-gray-100 font-semibold">PostgreSQL</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#1c1c1c] p-4">
          <p className="text-xs text-gray-500 uppercase mb-1">API</p>
          <p className="text-gray-100 font-semibold">Node (port 4000)</p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#1c1c1c] p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <p className="text-xs text-gray-500 uppercase">Database connection</p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={runDbTest}
              disabled={dbTesting}
              className="px-4 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 disabled:opacity-50"
            >
              {dbTesting ? 'Testing…' : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={runDbTest}
              disabled={dbTesting}
              className="px-4 py-2 border border-white/20 text-gray-300 text-sm rounded-lg hover:bg-white/5 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>
        {dbTestResult == null && !dbTesting && (
          <p className="text-gray-400 text-sm">Click Test Connection to check. Metrics update every 10 seconds.</p>
        )}
        {dbTesting && (
          <p className="text-gray-400 text-sm">Checking…</p>
        )}
        {dbTestResult && !dbTesting && (
          <>
            <p className={`inline-flex items-center gap-2 font-semibold ${dbTestResult.connected ? 'text-green-400' : 'text-gray-400'}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${dbTestResult.connected ? 'bg-green-500' : 'bg-gray-500'}`} />
              {dbTestResult.connected ? 'Connected' : 'Not connected'}
              {dbTestResult.connected && dbTestResult.latencyMs != null && (
                <span className="text-sm font-normal text-gray-400">({dbTestResult.latencyMs} ms)</span>
              )}
            </p>
            {dbTestResult.connected && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {dbTestResult.databaseType && (
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Type</p>
                    <p className="text-sm font-semibold text-gray-100 truncate">{dbTestResult.databaseType}</p>
                  </div>
                )}
                {dbTestResult.latencyMs != null && (
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Latency</p>
                    <p className="text-sm font-semibold text-gray-100">{dbTestResult.latencyMs} ms</p>
                  </div>
                )}
                {dbTestResult.activeConnections != null && (
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Connections</p>
                    <p className="text-sm font-semibold text-gray-100">{dbTestResult.activeConnections}</p>
                  </div>
                )}
                {dbTestResult.databaseSizeBytes != null && (
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Size</p>
                    <p className="text-sm font-semibold text-gray-100">{formatBytes(dbTestResult.databaseSizeBytes)}</p>
                  </div>
                )}
                {dbTestResult.version != null && (
                  <div className="col-span-2 sm:col-span-4 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Version</p>
                    <p className="text-xs font-mono text-gray-300 break-words" title={dbTestResult.version}>
                      {dbTestResult.version}
                    </p>
                  </div>
                )}
                {dbTestResult.lastChecked && (
                  <div className="col-span-2 sm:col-span-4 text-[10px] text-gray-500">
                    Last updated {new Date(dbTestResult.lastChecked).toLocaleTimeString()}
                  </div>
                )}
              </div>
            )}
            {dbTestResult.error && !dbTestResult.connected && (
              <p className="mt-2 text-xs text-red-400" role="alert">{dbTestResult.error}</p>
            )}
          </>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#1c1c1c] p-4 mb-6">
        <p className="text-sm font-medium text-gray-300 mb-2">PostgreSQL connection latency (ms)</p>
        {connectionStatus != null && (
          <p className="text-xs text-gray-500 mb-3">
            Status: {connectionStatus}
            {lastLatency?.latencyMs != null && ` · Last: ${lastLatency.latencyMs} ms`}
          </p>
        )}
        {chartData.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-gray-500 text-sm">
            Collecting latency data… Check again in a moment.
          </div>
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-600" />
                <XAxis
                  dataKey="timeLabel"
                  stroke="#6b7280"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#6b7280"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v} ms`)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1c1c1c',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                  }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(value) => [value != null ? `${value} ms` : '—', 'Latency']}
                  labelFormatter={(label) => `Time: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="latencyMs"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  name="Latency"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
