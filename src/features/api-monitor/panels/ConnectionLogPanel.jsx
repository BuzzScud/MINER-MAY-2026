import { Panel } from '../../../components/common/Panel';

export function ConnectionLogPanel({ connectionLog }) {
  const log = Array.isArray(connectionLog) ? connectionLog : [];

  return (
    <Panel title="Connection Log">
      <div className="max-h-64 overflow-y-auto space-y-1.5">
        {log.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 py-4 text-center">
            No status changes yet. Events appear when an API goes down or recovers.
          </p>
        ) : (
          log.map((event) => {
            const isRecovered = event.type === 'recovered';
            const dotClass = isRecovered
              ? 'bg-green-500'
              : 'bg-red-500';
            const timeStr = event.timestampISO
              ? new Date(event.timestampISO).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
              : '';

            return (
              <div
                key={event.id}
                className="flex items-start gap-2 py-1.5 px-2 rounded border-b border-gray-100 dark:border-gray-700/50 last:border-0"
              >
                <span className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${dotClass}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-900 dark:text-white">
                    {event.endpointName}
                    {isRecovered ? ' recovered' : ' went down'}
                    {timeStr ? ` at ${timeStr}` : ''}
                  </p>
                  {!isRecovered && event.previousStatus && (
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      Previous status: {event.previousStatus}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}
