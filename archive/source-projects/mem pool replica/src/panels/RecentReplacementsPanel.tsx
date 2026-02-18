import { Panel } from '../components/Panel';
import { useMempoolRbf } from '../hooks/useMempoolQueries';
import { ExternalLink } from 'lucide-react';

const MEMPOOL_TX_URL = 'https://mempool.space/tx';
const FULLRBF_URL = 'https://fullrbf.mempool.observer';

function truncateTxid(txid: string): string {
  if (txid.length <= 12) return txid;
  return `${txid.slice(0, 5)}…${txid.slice(-5)}`;
}

interface RecentReplacementsPanelProps {
  onOpenTransaction?: (txid: string) => void;
}

export function RecentReplacementsPanel({ onOpenTransaction }: RecentReplacementsPanelProps = {}) {
  const { data: replacements, isLoading, error, refetch } = useMempoolRbf();

  if (error) {
    return (
      <Panel title="Recent Replacements">
        <p className="text-red-400">Failed to load. Please try again.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 rounded bg-mempool-border px-3 py-1.5 text-sm text-gray-200 hover:bg-mempool-accent"
        >
          Retry
        </button>
      </Panel>
    );
  }

  if (isLoading) {
    return (
      <Panel title="Recent Replacements">
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-mempool-border/50" />
          ))}
        </div>
      </Panel>
    );
  }

  const hasData = replacements && replacements.length > 0;

  if (!hasData) {
    return (
      <Panel title="Recent Replacements">
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-gray-400">No RBF replacements right now.</p>
          <a
            href={FULLRBF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-sky-400 hover:text-sky-300"
          >
            View on fullrbf.mempool.observer
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded bg-mempool-border px-3 py-1.5 text-sm text-gray-200 hover:bg-mempool-accent"
          >
            Retry
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Recent Replacements">
      <div className="mb-2 flex items-center justify-end">
        <a
          href={FULLRBF_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-gray-400"
          aria-label="Open fullrbf.mempool.observer"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mempool-border text-left text-white">
              <th className="pb-2 pr-2 font-semibold">TXID</th>
              <th className="pb-2 pr-2 font-semibold">Previous fee</th>
              <th className="pb-2 pr-2 font-semibold">New fee</th>
              <th className="pb-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {replacements.slice(0, 10).map((row) => (
              <tr
                key={row.txid}
                className="border-b border-mempool-border/50 text-gray-200"
              >
                <td className="py-2 pr-2">
                  {onOpenTransaction ? (
                    <button
                      type="button"
                      onClick={() => onOpenTransaction(row.txid)}
                      className="text-left text-blue-400 hover:underline"
                    >
                      {truncateTxid(row.txid)}
                    </button>
                  ) : (
                    <a
                      href={`${MEMPOOL_TX_URL}/${row.txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {truncateTxid(row.txid)}
                    </a>
                  )}
                </td>
                <td className="py-2 pr-2">
                  {row.previous_fee != null ? `${row.previous_fee.toFixed(2)} sat/vB` : '—'}
                </td>
                <td className="py-2 pr-2">
                  {row.new_fee != null ? `${row.new_fee.toFixed(2)} sat/vB` : '—'}
                </td>
                <td className="py-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium text-white ${
                      row.fullRbf ? 'bg-blue-600' : 'bg-green-600'
                    }`}
                  >
                    {row.fullRbf ? 'Full RBF' : 'RBF'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
