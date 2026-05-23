import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../../contexts/SettingsContext';
import { useApiHealthChecks } from './hooks/useApiHealthChecks';
import { useConnectionHistory } from './hooks/useConnectionHistory';
import { checkEndpoint } from './api/healthChecks';
import { OverviewPanel } from './panels/OverviewPanel';
import { LatencyPanel } from './panels/LatencyPanel';
import { EndpointDetailPanel } from './panels/EndpointDetailPanel';
import { ConnectionLogPanel } from './panels/ConnectionLogPanel';

export function ApiMonitorView() {
  const { generalSettings } = useSettings();
  const showTooltips = generalSettings?.showTooltips ?? true;
  const { endpoints, isLoading, error, refetch } = useApiHealthChecks();
  const connectionHistory = useConnectionHistory();
  const { pushResults } = connectionHistory;
  const [testLoadingId, setTestLoadingId] = useState(null);
  const [testOverride, setTestOverride] = useState(null);

  useEffect(() => {
    if (endpoints.length > 0) {
      const merged = testOverride
        ? endpoints.map((e) => (e.id === testOverride.id ? testOverride.result : e))
        : endpoints;
      pushResults(merged);
    }
  }, [endpoints, testOverride, pushResults]);

  const handleTestEndpoint = useCallback(async (id, config) => {
    setTestLoadingId(id);
    setTestOverride(null);
    try {
      const result = await checkEndpoint(config);
      setTestOverride({ id, result });
    } catch (err) {
      setTestOverride({
        id,
        result: {
          id,
          name: config.name,
          status: 'down',
          latencyMs: 0,
          statusCode: null,
          timestamp: new Date().toISOString(),
          error: err?.message ?? 'Test failed',
          usedBy: config.usedBy,
        },
      });
    } finally {
      setTestLoadingId(null);
    }
  }, []);

  const displayEndpoints = testOverride
    ? endpoints.map((e) => (e.id === testOverride.id ? testOverride.result : e))
    : endpoints;

  const hasData = displayEndpoints.length > 0;
  const allUp = hasData && displayEndpoints.every((e) => e.status === 'up' || e.status === 'degraded');

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 flex flex-col h-full min-h-0 overflow-hidden">
      <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2 flex-shrink-0">
        <Link to="/" className="hover:text-sky-400 dark:hover:text-sky-300 transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="font-medium text-gray-900 dark:text-white">API Monitor</span>
      </nav>
      <header className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">API Monitor</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Monitor speed, uptime, and status of all APIs and connections
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300"
            title={showTooltips ? (hasData ? (allUp ? 'All systems operational' : 'Some issues detected') : 'Checking...') : undefined}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                !hasData ? 'animate-pulse bg-amber-500' : allUp ? 'bg-green-500' : 'bg-amber-500'
              }`}
            />
            {!hasData ? 'Checking...' : allUp ? 'All up' : 'Issues'}
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Refreshing...' : 'Refresh All'}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm flex-shrink-0">
          {error.message}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
        <OverviewPanel
          endpoints={displayEndpoints}
          getHistory={connectionHistory.getHistory}
          getUptimeStats={connectionHistory.getUptimeStats}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <LatencyPanel
            endpoints={displayEndpoints}
            getHistory={connectionHistory.getHistory}
          />
          <ConnectionLogPanel connectionLog={connectionHistory.connectionLog} />
        </div>
        <EndpointDetailPanel
          endpoints={displayEndpoints}
          getLatencyStats={connectionHistory.getLatencyStats}
          onTestEndpoint={handleTestEndpoint}
          testLoadingId={testLoadingId}
        />
      </div>
    </div>
  );
}
