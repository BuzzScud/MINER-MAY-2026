import { useState } from 'react';
import { Panel } from '../../../components/common/Panel';
import { StatusBadge } from '../components/StatusBadge';
import { CHECK_ENDPOINTS, getEndpointUrl } from '../api/healthChecks';

function maskUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return url
      .replace(/token=[^&]+/, 'token=••••')
      .replace(/apiKey=[^&]+/, 'apiKey=••••')
      .replace(/apiKey=[^&\s]+/, 'apiKey=••••');
  } catch {
    return url;
  }
}

export function EndpointDetailPanel({
  endpoints,
  getLatencyStats,
  onTestEndpoint,
  testLoadingId,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [showUrl, setShowUrl] = useState({});

  const configMap = Object.fromEntries(CHECK_ENDPOINTS.map((c) => [c.id, c]));

  const handleTest = async (id) => {
    const config = configMap[id];
    if (!config || !onTestEndpoint) return;
    onTestEndpoint(id, config);
  };

  return (
    <Panel title="Endpoint Details">
      <div className="space-y-2">
        {endpoints.map((ep) => {
          const config = configMap[ep.id];
          const isExpanded = expandedId === ep.id;
          const stats = getLatencyStats ? getLatencyStats(ep.id) : { avgMs: 0, p95Ms: 0, errorCount: 0 };
          const displayUrl = config ? (showUrl[ep.id] ? getEndpointUrl(config) : maskUrl(getEndpointUrl(config))) : '';
          const loading = testLoadingId === ep.id;

          return (
            <div
              key={ep.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : ep.id)}
                className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <StatusBadge status={ep.status} />
                  <span className="font-semibold text-gray-900 dark:text-white truncate">{ep.name}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    {ep.latencyMs != null ? `${ep.latencyMs} ms` : '—'}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isExpanded && config && (
                <div className="px-3 pb-3 pt-0 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  <div className="pt-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">URL</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowUrl((prev) => ({ ...prev, [ep.id]: !prev[ep.id] }));
                        }}
                        className="text-xs text-sky-500 hover:text-sky-600 dark:hover:text-sky-400"
                      >
                        {showUrl[ep.id] ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-600">
                      {displayUrl}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-2">
                      <div className="text-gray-500 dark:text-gray-400">Method</div>
                      <div className="font-medium text-gray-900 dark:text-white">{config.method || 'GET'}</div>
                    </div>
                    <div className="rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-2">
                      <div className="text-gray-500 dark:text-gray-400">Avg latency</div>
                      <div className="font-medium text-gray-900 dark:text-white">{stats.avgMs} ms</div>
                    </div>
                    <div className="rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-2">
                      <div className="text-gray-500 dark:text-gray-400">P95 latency</div>
                      <div className="font-medium text-gray-900 dark:text-white">{stats.p95Ms} ms</div>
                    </div>
                    <div className="rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-2">
                      <div className="text-gray-500 dark:text-gray-400">Errors</div>
                      <div className="font-medium text-gray-900 dark:text-white">{stats.errorCount}</div>
                    </div>
                  </div>
                  {config.usedBy && config.usedBy.length > 0 && (
                    <div className="text-xs">
                      <span className="text-gray-500 dark:text-gray-400">Used by: </span>
                      <span className="text-gray-900 dark:text-white">{config.usedBy.join(', ')}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleTest(ep.id)}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Testing...' : 'Test Now'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
