import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const EST_OPTS = { timeZone: 'America/New_York' };
function formatTime(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('en-US', { ...EST_OPTS }) + ' EST';
  } catch {
    return isoStr;
  }
}

const ROUTE_COLORS = ['text-sky-400', 'text-red-400', 'text-green-400', 'text-amber-400'];
function routeColorClass(route) {
  if (!route) return ROUTE_COLORS[0];
  let hash = 0;
  for (let i = 0; i < route.length; i++) hash += route.charCodeAt(i);
  return ROUTE_COLORS[Math.abs(hash) % 4];
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" aria-hidden="false">
      <div className="bg-[#1c1c1c] border border-white/10 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-100 text-2xl leading-none" aria-label="Close">
            &times;
          </button>
        </div>
        <div className="overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export default function AdminActivity() {
  const { token } = useAuth();
  const [list, setList] = useState([]);
  const [error, setError] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState(null);

  const load = useCallback(() => {
    if (!token) return;
    fetch('/api/admin/activity?limit=100', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setList)
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(load, [load]);
  useEffect(() => {
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  const handleClear = async () => {
    if (!window.confirm('Clear all activity log entries?')) return;
    setClearing(true);
    try {
      const res = await fetch('/api/admin/activity/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setList([]);
      setSelectedUsername(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setClearing(false);
    }
  };

  const byUser = list.reduce((acc, a) => {
    if (!acc[a.username] || new Date(a.timestamp) > new Date(acc[a.username].timestamp)) {
      acc[a.username] = a;
    }
    return acc;
  }, {});
  const onePerUser = Object.values(byUser).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const userActivities = selectedUsername ? list.filter((a) => a.username === selectedUsername) : [];

  return (
    <div className="max-w-4xl">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">/admin/activity</p>
      <h1 className="text-2xl font-bold text-gray-100 mb-2">User Activity</h1>
      <p className="text-sm text-gray-400 mb-4">
        User movements through the app. Updates every 2 seconds. Click a username to view their activity.
      </p>
      <div className="mb-4">
        <button
          type="button"
          onClick={handleClear}
          disabled={clearing || list.length === 0}
          className="px-4 py-2 border border-white/20 text-gray-300 rounded hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {clearing ? 'Clearing…' : 'Clear Activity Log'}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <div className="rounded-lg border border-white/10 overflow-hidden bg-[#1c1c1c] max-h-[400px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#1c1c1c] border-b border-white/10">
            <tr>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">User</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Route</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Method</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Time</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {onePerUser.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 px-4 text-center text-gray-500">
                  No activity recorded.
                </td>
              </tr>
            )}
            {onePerUser.map((a) => (
              <tr key={`${a.username}-${a.id}`} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => setSelectedUsername(a.username)}
                    className="text-sky-400 hover:underline text-left"
                  >
                    {a.username}
                  </button>
                </td>
                <td className={`py-3 px-4 font-mono text-xs ${routeColorClass(a.route)}`}>{a.route}</td>
                <td className="py-3 px-4 text-gray-400">{a.method}</td>
                <td className="py-3 px-4 text-gray-400">{formatTime(a.timestamp)}</td>
                <td className="py-3 px-4 text-gray-500">{a.ip_address || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!selectedUsername} onClose={() => setSelectedUsername(null)} title={`Activity: ${selectedUsername ?? ''}`}>
        {userActivities.length === 0 ? (
          <p className="text-gray-500">No activity for this user.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Route</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Method</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Time</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {userActivities.map((a) => (
                  <tr key={a.id} className="border-b border-white/5">
                    <td className={`py-2 px-3 font-mono text-xs ${routeColorClass(a.route)}`}>{a.route}</td>
                    <td className="py-2 px-3 text-gray-400">{a.method}</td>
                    <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{formatTime(a.timestamp)}</td>
                    <td className="py-2 px-3 text-gray-500">{a.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-white/10">
          <button type="button" onClick={() => setSelectedUsername(null)} className="px-4 py-2 border border-white/20 text-gray-300 rounded hover:bg-white/5 text-sm">
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}
