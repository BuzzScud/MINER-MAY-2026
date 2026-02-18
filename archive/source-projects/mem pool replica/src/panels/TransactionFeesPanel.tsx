import { Panel } from '../components/Panel';
import { useRecommendedFees } from '../hooks/useMempoolQueries';
import { usePrices } from '../hooks/useMempoolQueries';

const AVG_TX_VBYTES = 250;

const FEE_TIERS = [
  { key: 'minimumFee' as const, label: 'No Priority', color: 'text-green-400' },
  { key: 'economyFee' as const, label: 'Low Priority', color: 'text-green-500' },
  { key: 'hourFee' as const, label: 'Medium Priority', color: 'text-green-600' },
  { key: 'fastestFee' as const, label: 'High Priority', color: 'text-lime-400' },
] as const;

function formatUsd(satPerVb: number, btcPriceUsd: number): string {
  const btcPerTx = (satPerVb * AVG_TX_VBYTES) / 1e8;
  const usd = btcPerTx * btcPriceUsd;
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

export function TransactionFeesPanel() {
  const { data: fees, isLoading, error, refetch } = useRecommendedFees();
  const { data: prices } = usePrices();

  const btcPriceUsd = (prices?.USD ?? 0) / 100;

  if (error) {
    return (
      <Panel title="Transaction Fees">
        <p className="text-red-400">Failed to load fees. Please try again.</p>
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

  if (isLoading || !fees) {
    return (
      <Panel title="Transaction Fees">
        <div className="flex animate-pulse flex-col gap-3">
          {FEE_TIERS.map((_, i) => (
            <div key={i} className="h-12 rounded bg-mempool-border/50" />
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Transaction Fees">
      <div className="flex flex-col gap-3">
        {FEE_TIERS.map(({ key, label, color }) => {
          const satPerVb = fees[key];
          return (
            <div key={key} className="flex flex-col">
              <span className={`text-sm font-medium ${color}`}>{label}</span>
              <span className="text-2xl font-bold text-white">
                {satPerVb} sat/vB
              </span>
              <span className="text-sm text-gray-500">
                {formatUsd(satPerVb, btcPriceUsd)}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
