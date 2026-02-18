import { useRef, useCallback, useState } from 'react';

const MAX_HISTORY_POINTS = 60;
const MAX_LOG_ENTRIES = 50;

/**
 * Maintains in-memory latency history and connection event log.
 * Call pushResults(endpoints) on each poll to update history and detect status changes.
 *
 * Stable callbacks (pushResults, getHistory, getUptimeStats, getLatencyStats) never
 * change identity, so parent useEffects that depend on them won't re-fire on log updates.
 * Only `connectionLog` triggers re-renders when events are added.
 */
export function useConnectionHistory() {
  const historyRef = useRef(new Map());
  const prevStatusRef = useRef(new Map());
  const [connectionLog, setConnectionLog] = useState([]);

  const pushResults = useCallback((endpoints) => {
    if (!Array.isArray(endpoints)) return;
    const now = Date.now();
    const prevStatus = prevStatusRef.current;
    const history = historyRef.current;
    const newEvents = [];

    endpoints.forEach((ep) => {
      const id = ep.id;
      const status = ep.status;
      const latencyMs = ep.latencyMs ?? 0;

      const prev = prevStatus.get(id);
      if (prev !== undefined && prev !== status) {
        newEvents.push({
          id: `${id}-${now}`,
          endpointId: id,
          endpointName: ep.name,
          type: status === 'up' || status === 'degraded' ? 'recovered' : 'down',
          status,
          previousStatus: prev,
          timestamp: now,
          timestampISO: new Date(now).toISOString(),
        });
      }
      prevStatus.set(id, status);

      let list = history.get(id);
      if (!list) {
        list = [];
        history.set(id, list);
      }
      list.push({ timestamp: now, latencyMs, status });
      if (list.length > MAX_HISTORY_POINTS) list.shift();
    });

    if (newEvents.length > 0) {
      setConnectionLog((prev) => [...newEvents, ...prev].slice(0, MAX_LOG_ENTRIES));
    }
  }, []);

  const getHistory = useCallback((endpointId) => {
    return historyRef.current.get(endpointId) || [];
  }, []);

  const getUptimeStats = useCallback((endpointId) => {
    const list = historyRef.current.get(endpointId) || [];
    if (list.length === 0) return { uptimePercent: 100, totalChecks: 0, upCount: 0 };
    const upCount = list.filter((p) => p.status === 'up' || p.status === 'degraded').length;
    const totalChecks = list.length;
    const uptimePercent = totalChecks > 0 ? Math.round((upCount / totalChecks) * 100) : 100;
    return { uptimePercent, totalChecks, upCount };
  }, []);

  const getLatencyStats = useCallback((endpointId) => {
    const list = historyRef.current.get(endpointId) || [];
    if (list.length === 0) return { avgMs: 0, p95Ms: 0, errorCount: 0 };
    const withLatency = list.filter((p) => p.status === 'up' || p.status === 'degraded');
    const errorCount = list.length - withLatency.length;
    if (withLatency.length === 0) return { avgMs: 0, p95Ms: 0, errorCount };
    const sorted = [...withLatency].map((p) => p.latencyMs).sort((a, b) => a - b);
    const avgMs = Math.round(sorted.reduce((s, n) => s + n, 0) / sorted.length);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95Ms = sorted[p95Index] ?? sorted[sorted.length - 1] ?? 0;
    return { avgMs, p95Ms, errorCount };
  }, []);

  return {
    pushResults,
    getHistory,
    getUptimeStats,
    getLatencyStats,
    connectionLog,
  };
}
