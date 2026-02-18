import { Panel } from '../../../components/common/Panel';
import { StatusBadge } from '../components/StatusBadge';
import { LatencySparkline } from '../components/LatencySparkline';
import { CHECK_ENDPOINTS } from '../api/healthChecks';

export function OverviewPanel({ endpoints, getHistory, getUptimeStats }) {
  const configMap = Object.fromEntries(CHECK_ENDPOINTS.map((c) => [c.id, c]));

  return (
    <Panel title="API Status Overview">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {endpoints.map((ep) => {
          const config = configMap[ep.id];
          const description = config?.description ?? '';
          const history = getHistory ? getHistory(ep.id) : [];
          const { uptimePercent } = getUptimeStats ? getUptimeStats(ep.id) : { uptimePercent: 100 };

          return (
            <div
              key={ep.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 p-3 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <StatusBadge status={ep.status} />
                <span className="text-xs font-semibold text-gray-900 dark:text-white">
                  {ep.latencyMs != null ? `${ep.latencyMs} ms` : '—'}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={ep.name}>
                {ep.name}
              </h3>
              {description && (
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                  {description}
                </p>
              )}
              <div className="flex items-center justify-between mt-2 gap-2">
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  Uptime: <span className="font-medium text-gray-900 dark:text-white">{uptimePercent}%</span>
                </span>
                <LatencySparkline data={history} width={56} height={20} maxPoints={20} />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
