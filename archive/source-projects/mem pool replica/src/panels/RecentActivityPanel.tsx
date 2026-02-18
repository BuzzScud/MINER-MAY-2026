import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Panel } from '../components/Panel';
import { useMempoolRbf, useMempoolRecent, usePrices, useMempoolStats } from '../hooks/useMempoolQueries';
import { useMempoolWebSocket } from '../hooks/useMempoolWebSocket';
import { ExternalLink } from 'lucide-react';

const MEMPOOL_TX_URL = 'https://mempool.space/tx';
const FULLRBF_URL = 'https://fullrbf.mempool.observer';

function truncateTxid(txid: string): string {
  if (txid.length <= 12) return txid;
  return `${txid.slice(0, 5)}…${txid.slice(-5)}`;
}

function formatBtc(sats: number): string {
  const btc = sats / 1e8;
  if (btc >= 1) return btc.toFixed(4);
  if (btc >= 0.0001) return btc.toFixed(6);
  return btc.toFixed(8);
}

function formatUsd(sats: number, btcPriceUsd: number): string {
  const btc = sats / 1e8;
  const usd = btc * btcPriceUsd;
  if (usd >= 1000) return `$${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

function formatChartTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
}

type TabId = 'replacements' | 'transactions' | 'incoming';

interface RecentActivityPanelProps {
  onOpenTransaction?: (txid: string) => void;
}

export function RecentActivityPanel({ onOpenTransaction }: RecentActivityPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('transactions');

  const {
    data: replacements,
    isLoading: replacementsLoading,
    isRefetching: replacementsRefetching,
    error: replacementsError,
    refetch: refetchReplacements,
  } = useMempoolRbf();
  const { data: transactions, isLoading: transactionsLoading, error: transactionsError, refetch: refetchTransactions } =
    useMempoolRecent();
  const { data: prices } = usePrices();
  const { chartData, mempoolInfo, connected } = useMempoolWebSocket();
  const { data: mempoolStats, isError: mempoolError, refetch: refetchMempool } = useMempoolStats();

  const btcPriceUsd = (prices?.USD ?? 0) / 100;

  const incomingChartSeries = useMemo(() => {
    if (!chartData.length) return [];
    return chartData.map((p) => ({
      time: formatChartTime(p.time),
      timestamp: p.time,
      value: p.value,
    }));
  }, [chartData]);

  const minFee =
    mempoolInfo?.mempoolminfee != null
      ? (mempoolInfo.mempoolminfee * 100_000).toFixed(2)
      : '—';
  const usageBytes = mempoolInfo?.usage ?? mempoolStats?.vsize ?? 0;
  const maxBytes = mempoolInfo?.maxmempool ?? 300_000_000;
  const usageMb = (usageBytes / 1_000_000).toFixed(0);
  const maxMb = (maxBytes / 1_000_000).toFixed(0);
  const usagePercent = maxBytes > 0 ? (usageBytes / maxBytes) * 100 : 0;
  const unconfirmed = mempoolStats?.count ?? mempoolInfo?.size ?? 0;

  return (
    <Panel title="Recent Activity">
      <div className="mb-3 flex items-center gap-1 border-b border-mempool-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('replacements')}
          className={
            activeTab === 'replacements'
              ? 'text-sky-400'
              : 'text-gray-400 hover:text-white'
          }
        >
          Recent Replacements
        </button>
        <span className="text-gray-600">|</span>
        <button
          type="button"
          onClick={() => setActiveTab('transactions')}
          className={
            activeTab === 'transactions'
              ? 'text-sky-400'
              : 'text-gray-400 hover:text-white'
          }
        >
          Recent Transactions
        </button>
        <span className="text-gray-600">|</span>
        <button
          type="button"
          onClick={() => setActiveTab('incoming')}
          className={
            activeTab === 'incoming'
              ? 'text-sky-400'
              : 'text-gray-400 hover:text-white'
          }
        >
          Incoming Transactions
        </button>
      </div>

      {activeTab === 'replacements' && (
        <>
          {replacementsError && (
            <div className="py-4">
              <p className="text-red-400">Replacements data is temporarily unavailable. Please try again.</p>
              <p className="mt-1 text-sm text-gray-400">
                You can view replacements at{' '}
                <a
                  href={FULLRBF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:text-sky-300"
                >
                  fullrbf.mempool.observer
                </a>
              </p>
              <button
                type="button"
                onClick={() => refetchReplacements()}
                disabled={replacementsRefetching}
                className="mt-2 rounded bg-mempool-border px-3 py-1.5 text-sm text-gray-200 hover:bg-mempool-accent disabled:opacity-50"
              >
                {replacementsRefetching ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          )}
          {!replacementsError && replacementsLoading && (
            <div className="animate-pulse space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-mempool-border/50" />
              ))}
            </div>
          )}
          {!replacementsError && !replacementsLoading && (
            <>
              {(!replacements || replacements.length === 0) ? (
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
                    onClick={() => refetchReplacements()}
                    className="mt-3 rounded bg-mempool-border px-3 py-1.5 text-sm text-gray-200 hover:bg-mempool-accent"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
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
                </>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'transactions' && (
        <>
          {transactionsError && (
            <div className="py-4">
              <p className="text-red-400">Failed to load transactions. Please try again.</p>
              <button
                type="button"
                onClick={() => refetchTransactions()}
                className="mt-2 rounded bg-mempool-border px-3 py-1.5 text-sm text-gray-200 hover:bg-mempool-accent"
              >
                Retry
              </button>
            </div>
          )}
          {(transactionsLoading || !transactions) && !transactionsError && (
            <div className="animate-pulse space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-mempool-border/50" />
              ))}
            </div>
          )}
          {!transactionsError && !transactionsLoading && transactions && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-mempool-border text-left text-white">
                    <th className="pb-2 pr-2 font-semibold">TXID</th>
                    <th className="pb-2 pr-2 font-semibold">Amount</th>
                    <th className="pb-2 pr-2 font-semibold">USD</th>
                    <th className="pb-2 font-semibold">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 10).map((tx) => {
                    const feeRate = tx.vsize > 0 ? tx.fee / tx.vsize : 0;
                    const valueSats = tx.value ?? 0;
                    return (
                      <tr
                        key={tx.txid}
                        className="border-b border-mempool-border/50 text-gray-200"
                      >
                        <td className="py-2 pr-2">
                          {onOpenTransaction ? (
                            <button
                              type="button"
                              onClick={() => onOpenTransaction(tx.txid)}
                              className="text-left text-blue-400 hover:underline"
                            >
                              {truncateTxid(tx.txid)}
                            </button>
                          ) : (
                            <a
                              href={`${MEMPOOL_TX_URL}/${tx.txid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline"
                            >
                              {truncateTxid(tx.txid)}
                            </a>
                          )}
                        </td>
                        <td className="py-2 pr-2">{formatBtc(valueSats)} BTC</td>
                        <td className="py-2 pr-2 text-green-400">
                          {formatUsd(valueSats, btcPriceUsd)}
                        </td>
                        <td className="py-2">{feeRate.toFixed(2)} sat/vB</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === 'incoming' && (
        <>
          {mempoolError && !mempoolStats && (
            <div className="py-4">
              <p className="text-red-400">Data unavailable. mempool.space API could not be reached.</p>
              <button
                type="button"
                onClick={() => refetchMempool()}
                className="mt-2 rounded bg-mempool-border px-3 py-1.5 text-sm text-gray-200 hover:bg-mempool-accent"
              >
                Retry
              </button>
            </div>
          )}
          {(!mempoolError || mempoolStats) && (
            <>
              {connected && (
                <span className="mb-2 inline-block text-xs text-mempool-accent">Live</span>
              )}
              <div className="mb-4 flex flex-wrap items-center gap-4">
                <div>
                  <span className="text-sm text-gray-400">Minimum fee:</span>
                  <span className="ml-2 text-sm font-medium text-blue-400">{minFee} sat/vB</span>
                </div>
                <div className="min-w-[120px] flex-1">
                  <span className="text-sm text-gray-400">Memory Usage:</span>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-mempool-border">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, usagePercent)}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-400">
                      {usageMb} MB / {maxMb} MB
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-sm text-gray-400">Unconfirmed:</span>
                  <span className="ml-2 text-sm font-medium text-blue-400">
                    {unconfirmed.toLocaleString()} TXs
                  </span>
                </div>
              </div>

              <h3 className="mb-2 text-sm font-medium text-blue-400">vB/s (2h)</h3>
              <div className="h-[200px] w-full">
                {!connected && incomingChartSeries.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded bg-mempool-border/30 text-gray-500">
                    Connecting to live data...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart
                      data={incomingChartSeries}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="recentActivityChartGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                      <XAxis
                        dataKey="time"
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
                        tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#161b22',
                          border: '1px solid #21262d',
                          borderRadius: '6px',
                        }}
                        labelStyle={{ color: '#9ca3af' }}
                        formatter={(value: number | undefined) => [
                          value != null ? value.toLocaleString() : '—',
                          'vB/s',
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#22c55e"
                        strokeWidth={1.5}
                        fill="url(#recentActivityChartGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Panel>
  );
}
