import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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

const DASHBOARD_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'settings', label: 'Settings' },
  { id: 'security', label: 'Security' },
  { id: 'dependencies', label: 'Dependencies' },
];

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
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60"
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

function formatUptime(seconds) {
  if (seconds == null || seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

export default function AdminDashboard({ embedded = false }) {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [emergencySubmitting, setEmergencySubmitting] = useState(false);
  const [emergencyError, setEmergencyError] = useState(null);
  const [emergencySuccess, setEmergencySuccess] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyConfirming, setEmergencyConfirming] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartSubmitting, setRestartSubmitting] = useState(false);
  const [restartError, setRestartError] = useState(null);
  const [showRestartOverlay, setShowRestartOverlay] = useState(false);
  const [restartCountdown, setRestartCountdown] = useState(null);
  const [dateTime, setDateTime] = useState(() => new Date());
  const [dbTestResult, setDbTestResult] = useState(null);
  const [dbTesting, setDbTesting] = useState(false);
  const [latencyHistory, setLatencyHistory] = useState([]);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState(null);
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementActive, setAnnouncementActive] = useState(false);
  const [announcementLoading, setAnnouncementLoading] = useState(true);
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [announcementError, setAnnouncementError] = useState(null);
  const [loginAttempts, setLoginAttempts] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [dependenciesLoading, setDependenciesLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [embeddedTab, setEmbeddedTab] = useState('overview');
  const tabParam = embedded ? embeddedTab : searchParams.get('tab');
  const activeTab = DASHBOARD_TABS.some((t) => t.id === tabParam) ? tabParam : 'overview';
  const setTab = (id) => {
    if (embedded) {
      setEmbeddedTab(id);
      return;
    }
    setSearchParams(id === 'overview' ? {} : { tab: id });
  };

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

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/settings/maintenance', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then((data) => setMaintenanceEnabled(!!data.enabled))
      .catch(() => setMaintenanceEnabled(false))
      .finally(() => setMaintenanceLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/settings/announcement', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then((data) => {
        setAnnouncementText(data.text ?? '');
        setAnnouncementActive(!!data.active);
      })
      .catch(() => {})
      .finally(() => setAnnouncementLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/login-attempts?limit=20', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then((data) => setLoginAttempts(data.attempts ?? []))
      .catch(() => setLoginAttempts([]));
  }, [token]);

  const fetchDependencies = useCallback(() => {
    if (!token) return;
    setDependenciesLoading(true);
    fetch('/api/admin/dependencies', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then((data) => setDependencies(Array.isArray(data) ? data : []))
      .catch(() => setDependencies([]))
      .finally(() => setDependenciesLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchDependencies();
    const interval = setInterval(fetchDependencies, 60000);
    return () => clearInterval(interval);
  }, [token, fetchDependencies]);

  const setMaintenance = useCallback(async (enabled) => {
    if (!token) return;
    setMaintenanceError(null);
    const previous = maintenanceEnabled;
    setMaintenanceEnabled(enabled);
    setMaintenanceSaving(true);
    try {
      const res = await fetch('/api/admin/settings/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled }),
      });
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return {}; } })() : {};
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setMaintenanceEnabled(!!data.enabled);
    } catch (e) {
      setMaintenanceEnabled(previous);
      setMaintenanceError(e.message || 'Failed to update maintenance mode');
      console.error(e);
    } finally {
      setMaintenanceSaving(false);
    }
  }, [token, maintenanceEnabled]);

  const saveAnnouncement = useCallback(async () => {
    if (!token) return;
    setAnnouncementError(null);
    setAnnouncementSaving(true);
    try {
      const res = await fetch('/api/admin/settings/announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: announcementText, active: announcementActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
    } catch (e) {
      setAnnouncementError(e.message || 'Failed to save');
    } finally {
      setAnnouncementSaving(false);
    }
  }, [token, announcementText, announcementActive]);

  const runDbTest = useCallback(() => {
    if (!token) return;
    setDbTesting(true);
    fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error('Request failed');
        return r.json();
      })
      .then((data) => {
        const point = { timestamp: Date.now(), latencyMs: data.latencyMs ?? null };
        setDbTestResult({
          connected: true,
          latencyMs: data.latencyMs,
          databaseType: data.databaseType,
          version: data.version ?? null,
          activeConnections: data.activeConnections ?? null,
          databaseSizeBytes: data.databaseSizeBytes ?? null,
          lastChecked: new Date().toISOString(),
        });
        setLatencyHistory((prev) => {
          const next = [...prev, point];
          return next.length > LATENCY_HISTORY_MAX ? next.slice(-LATENCY_HISTORY_MAX) : next;
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

  const runRestartServer = useCallback(async () => {
    if (!token) return;
    setShowRestartModal(false);
    setRestartError(null);
    setRestartSubmitting(true);
    try {
      const res = await fetch('/api/admin/restart-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setShowRestartOverlay(true);
      setRestartCountdown(15);
    } catch (e) {
      setRestartError(e.message || 'Request failed');
    } finally {
      setRestartSubmitting(false);
    }
  }, [token]);

  useEffect(() => {
    if (!showRestartOverlay) return;
    const t = setInterval(() => {
      setRestartCountdown((c) => {
        if (c == null || c <= 1) {
          clearInterval(t);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [showRestartOverlay]);

  useEffect(() => {
    if (!showRestartOverlay || restartCountdown !== 0) return;
    let cancelled = false;
    const maxAttempts = 30;
    let attempts = 0;
    const poll = async () => {
      if (cancelled || attempts >= maxAttempts) {
        if (!cancelled) window.location.href = '/';
        return;
      }
      attempts += 1;
      try {
        const res = await fetch('/api/health', { method: 'GET' });
        if (res.ok) {
          window.location.href = '/';
          return;
        }
      } catch (_) {}
      setTimeout(poll, 1000);
    };
    poll();
    return () => { cancelled = true; };
  }, [showRestartOverlay, restartCountdown]);

  const chartData = latencyHistory.map((p) => ({
    ...p,
    timeLabel: new Date(p.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  }));

  const lastLatency = latencyHistory.length > 0 ? latencyHistory[latencyHistory.length - 1] : null;
  const connectionStatus = lastLatency ? (lastLatency.latencyMs != null ? 'Connected' : 'Disconnected') : null;

  if (error) {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="w-full max-w-4xl mx-auto flex justify-center py-12">
        <p className="text-gray-400">Loading stats…</p>
      </div>
    );
  }

  return (
    <>
      {showRestartOverlay && (
        <div
          className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-gray-900 text-gray-100 p-4"
          role="alert"
          aria-live="assertive"
          aria-label="Server reset in progress"
        >
          <p className="text-xl font-semibold mb-2">Resetting…</p>
          <p className="text-gray-400" aria-live="polite">
            Will be back up in {restartCountdown ?? 15} second{restartCountdown === 1 ? '' : 's'}
          </p>
        </div>
      )}
      <div className={`w-full mx-auto space-y-6 ${embedded ? '' : 'max-w-4xl'}`}>
      {!embedded && (
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">/admin</p>
        <h1 className="text-2xl font-bold text-gray-100">Overview</h1>
      </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-white/10" role="tablist" aria-label="Dashboard sections">
        {DASHBOARD_TABS.map((tab) => (
          <button
            key={tab.id}
            id={`dashboard-tab-${tab.id}`}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-sky-500 text-sky-400 bg-white/5'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
            aria-selected={activeTab === tab.id}
            role="tab"
            aria-controls={`panel-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id="panel-overview" role="tabpanel" aria-labelledby={activeTab === 'overview' ? 'dashboard-tab-overview' : undefined} className={`pt-1 ${activeTab !== 'overview' ? 'hidden' : ''}`}>
      {(activeTab === 'overview') && (
      <>
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
            <div className="flex flex-row flex-wrap gap-4">
              <button
                type="button"
                onClick={() => setShowEmergencyModal(true)}
                disabled={emergencySubmitting || !token}
                className="w-fit px-3 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                aria-busy={emergencySubmitting}
                aria-label="Log out all non-admin users"
              >
                {emergencySubmitting ? 'Logging out…' : 'Emergency Logout'}
              </button>
              <button
                type="button"
                onClick={() => setShowRestartModal(true)}
                disabled={restartSubmitting || !token}
                className="w-fit px-3 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                aria-busy={restartSubmitting}
                aria-label="Restart server and web app"
              >
                {restartSubmitting ? 'Restarting…' : 'Restart server and web app'}
              </button>
            </div>
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
            <ConfirmModal
              open={showRestartModal}
              title="Restart server and web app"
              onClose={() => setShowRestartModal(false)}
              onConfirm={runRestartServer}
              confirmLabel="Restart"
              confirmDisabled={restartSubmitting}
            >
              <p className="text-sm text-gray-300">
                This will log everyone out, restart the server, and the app will be back in about 15 seconds. The app will be briefly unavailable.
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
            {restartError && (
              <p className="mt-2 text-xs text-red-400" role="alert">
                {restartError}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-white/10 bg-[#1c1c1c] p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="sm:border-r sm:border-white/10 sm:pr-6 pb-6 sm:pb-0 border-b border-white/10 sm:border-b-0">
              <p className="text-xs text-gray-500 uppercase mb-2">System</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Node</p>
                  <p className="font-semibold text-gray-100">{stats.nodeVersion ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">NODE_ENV</p>
                  <p className="font-semibold text-gray-100">{stats.nodeEnv ?? '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Uptime</p>
                  <p className="font-semibold text-gray-100">{formatUptime(stats.uptimeSeconds)}</p>
                </div>
              </div>
              <p className="mt-2 text-xs font-medium text-green-400 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-green-500" />
                Active
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase mb-2">App data</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Total keys</p>
                  <p className="font-semibold text-gray-100">{stats.appDataRowCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Size</p>
                  <p className="font-semibold text-gray-100">{formatBytes(stats.appDataSizeBytes)}</p>
                </div>
              </div>
              <p className="mt-2 text-xs font-medium text-green-400 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-green-500" />
                Active
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#1c1c1c] p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:border-r sm:border-white/10 sm:pr-4 pb-4 sm:pb-0 border-b border-white/10 sm:border-b-0">
              <p className="text-xs text-gray-500 uppercase mb-1">Database</p>
              <p className="text-gray-100 font-semibold">PostgreSQL</p>
              <p className={`mt-1.5 text-xs font-medium inline-flex items-center gap-1.5 ${dbTestResult?.connected ? 'text-green-400' : dbTestResult && !dbTestResult.connected ? 'text-red-400' : 'text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dbTestResult?.connected ? 'bg-green-500' : dbTestResult && !dbTestResult.connected ? 'bg-red-500' : 'bg-gray-500'}`} />
                {dbTestResult?.connected ? 'Active' : dbTestResult && !dbTestResult.connected ? 'Inactive' : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">API</p>
              <p className="text-gray-100 font-semibold">Node (port 4000)</p>
              <p className="mt-1.5 text-xs font-medium text-green-400 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-green-500" />
                Active
              </p>
            </div>
          </div>
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
      </>
      )}
      </div>

      {activeTab === 'settings' && (
      <div id="panel-settings" role="tabpanel" aria-labelledby="dashboard-tab-settings" className="pt-4 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-white/10 bg-[#1c1c1c] p-4">
          <p className="text-xs text-gray-500 uppercase mb-2">Maintenance mode</p>
          {maintenanceLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={maintenanceEnabled}
                  disabled={maintenanceSaving}
                  onClick={() => setMaintenance(!maintenanceEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1c1c1c] ${maintenanceEnabled ? 'bg-amber-500 border-amber-500' : 'bg-gray-600 border-gray-500'} focus:ring-amber-500 disabled:opacity-50`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${maintenanceEnabled ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
                </button>
                <span className="text-sm font-medium text-gray-200">{maintenanceEnabled ? 'On' : 'Off'}</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">When on, only admins can log in.</p>
              {maintenanceError && <p className="mt-2 text-xs text-red-400" role="alert">{maintenanceError}</p>}
            </>
          )}
        </div>
        <div className="rounded-xl border border-white/10 bg-[#1c1c1c] p-4">
          <p className="text-xs text-gray-500 uppercase mb-2">Announcement</p>
          {announcementLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <>
              <textarea
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                placeholder="Announcement text"
                rows={2}
                className="w-full rounded-lg border border-white/20 bg-black/20 text-gray-100 text-sm px-3 py-2 mb-2 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <label className="flex items-center gap-2 mb-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={announcementActive}
                  onChange={(e) => setAnnouncementActive(e.target.checked)}
                  className="rounded border-white/20 text-amber-500 focus:ring-amber-500"
                />
                Active (show banner to users)
              </label>
              <button
                type="button"
                onClick={saveAnnouncement}
                disabled={announcementSaving}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {announcementSaving ? 'Saving…' : 'Save'}
              </button>
              {announcementError && <p className="mt-2 text-xs text-red-400" role="alert">{announcementError}</p>}
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#1c1c1c] p-4 mb-6">
        <p className="text-xs text-gray-500 uppercase mb-1">Rate limits</p>
        <p className="text-sm text-gray-400">Coming soon. No rate limits configured.</p>
      </div>
      </div>
      )}

      {activeTab === 'security' && (
      <div id="panel-security" role="tabpanel" aria-labelledby="dashboard-tab-security" className="pt-4 space-y-6">
      <div className="rounded-xl border border-white/10 bg-[#1c1c1c] p-4 mb-6">
        <p className="text-xs text-gray-500 uppercase mb-3">Recent failed logins</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-white/10">
                <th className="py-2 pr-3 font-medium">Username</th>
                <th className="py-2 pr-3 font-medium">IP</th>
                <th className="py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {loginAttempts.filter((a) => !a.success).length === 0 ? (
                <tr><td colSpan={3} className="py-4 text-gray-500 text-center">No failed logins in this window.</td></tr>
              ) : (
                loginAttempts.filter((a) => !a.success).map((a) => (
                  <tr key={a.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 text-gray-200">{a.username ?? '—'}</td>
                    <td className="py-2 pr-3 text-gray-300 font-mono text-xs">{a.ip_address ?? '—'}</td>
                    <td className="py-2 text-gray-400">{a.timestamp ? new Date(a.timestamp).toLocaleString() : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
      )}

      {activeTab === 'dependencies' && (
      <div id="panel-dependencies" role="tabpanel" aria-labelledby="dashboard-tab-dependencies" className="pt-4 space-y-6">
      <div className="rounded-xl border border-white/10 bg-[#1c1c1c] p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-500 uppercase">Dependencies</p>
          <button
            type="button"
            onClick={fetchDependencies}
            disabled={dependenciesLoading}
            className="px-3 py-1.5 text-xs font-medium rounded border border-white/20 text-gray-300 hover:bg-white/5 disabled:opacity-50"
          >
            {dependenciesLoading ? 'Checking…' : 'Refresh'}
          </button>
        </div>
        <ul className="space-y-2">
          {dependencies.length === 0 && !dependenciesLoading && (
            <li className="text-sm text-gray-500">No services configured.</li>
          )}
          {dependencies.map((d) => (
            <li key={d.name} className="flex items-center justify-between text-sm">
              <span className="text-gray-200">{d.name}</span>
              <span className="flex items-center gap-2">
                {d.latencyMs != null && <span className="text-gray-500">{d.latencyMs} ms</span>}
                <span className={`inline-flex items-center gap-1 ${d.up ? 'text-green-400' : 'text-red-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${d.up ? 'bg-green-500' : 'bg-red-500'}`} />
                  {d.up ? 'Up' : 'Down'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      </div>
      )}
    </div>
    </>
  );
}
