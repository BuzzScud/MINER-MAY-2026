import { Panel } from '../components/Panel';
import { useMempoolRecent, usePrices } from '../hooks/useMempoolQueries';

const MEMPOOL_TX_URL = 'https://mempool.space/tx';

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

interface RecentTransactionsPanelProps {
  onOpenTransaction?: (txid: string) => void;
}

export function RecentTransactionsPanel({ onOpenTransaction }: RecentTransactionsPanelProps = {}) {
  const { data: transactions, isLoading, error, refetch } = useMempoolRecent();
  const { data: prices } = usePrices();
  const btcPriceUsd = (prices?.USD ?? 0) / 100;

  if (error) {
    return (
      <Panel title="Recent Transactions">
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

  if (isLoading || !transactions) {
    return (
      <Panel title="Recent Transactions">
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-mempool-border/50" />
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Recent Transactions">
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
    </Panel>
  );
}
