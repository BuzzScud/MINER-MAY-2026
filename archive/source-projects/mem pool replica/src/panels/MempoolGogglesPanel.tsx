import { useState, useMemo } from 'react';
import { ResponsiveTreeMap } from '@nivo/treemap';
import { Panel } from '../components/Panel';
import { useMempoolStats } from '../hooks/useMempoolQueries';
import { useClassifiedTransactions, type TransactionFilter } from '../hooks/useClassifiedTransactions';
import { ExternalLink } from 'lucide-react';

interface TreeMapNode {
  id: string;
  value: number;
  feerate?: number;
  label?: string;
}

const FEE_RATE_COLOR_MAX = 100;

const FEE_BUCKETS = [
  { max: 1, label: '0-1', mid: 0.5 },
  { max: 2, label: '1-2', mid: 1.5 },
  { max: 3, label: '2-3', mid: 2.5 },
  { max: 5, label: '3-5', mid: 4 },
  { max: 7, label: '5-7', mid: 6 },
  { max: 10, label: '7-10', mid: 8.5 },
  { max: 15, label: '10-15', mid: 12.5 },
  { max: 25, label: '15-25', mid: 20 },
  { max: Infinity, label: '25+', mid: 50 },
];

function formatVbytes(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M vB`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k vB`;
  return `${v} vB`;
}

/** Interpolate green (low) -> yellow (high) by fee rate (sat/vB). */
function feeRateToColor(feerate: number): string {
  const t = Math.min(1, Math.max(0, Math.log1p(feerate) / Math.log1p(FEE_RATE_COLOR_MAX)));
  const r = Math.round(22 + (234 - 22) * t);
  const g = Math.round(101 + (184 - 101) * t);
  const b = Math.round(52 + (8 - 52) * t);
  return `rgb(${r},${g},${b})`;
}

/**
 * API fee_histogram: array of [feerate, vsize] ordered high->low. Each vsize is the
 * volume in the band (this feerate, previous feerate]. Use each band as one treemap block.
 * Uses unique id (band-{i}) to avoid React duplicate-key warnings; label holds display text.
 */
function feeHistogramToTreemap(feeHistogram: Array<[number, number]>): TreeMapNode[] {
  if (!feeHistogram?.length) return [{ id: 'empty', value: 1 }];

  const nodes: TreeMapNode[] = [];
  for (let i = 0; i < feeHistogram.length; i++) {
    const [feerateLow, vsize] = feeHistogram[i];
    if (vsize <= 0) continue;
    const feerateHigh = i === 0 ? null : feeHistogram[i - 1][0];
    if (feerateHigh != null && Math.abs(feerateLow - feerateHigh) < 1e-9) continue;
    const label =
      feerateHigh == null
        ? `${feerateLow.toFixed(2)}+ sat/vB`
        : `${feerateLow.toFixed(2)}-${feerateHigh.toFixed(2)} sat/vB`;
    const feerateMid = feerateHigh != null ? (feerateLow + feerateHigh) / 2 : feerateLow;
    nodes.push({ id: `band-${i}`, value: vsize, feerate: feerateMid, label });
  }
  if (nodes.length === 0) return [{ id: 'empty', value: 1 }];
  nodes.sort((a, b) => (a.feerate ?? 0) - (b.feerate ?? 0));
  return nodes;
}

function classifiedToTreemap(
  transactions: Array<{ vsize: number; fee: number; feePerVsize?: number }>
): TreeMapNode[] {
  const buckets = new Map<string, number>();

  for (const tx of transactions) {
    const feeRate = tx.feePerVsize ?? (tx.vsize > 0 ? tx.fee / tx.vsize : 0);
    const bucket = FEE_BUCKETS.find((b) => feeRate < b.max) ?? FEE_BUCKETS[FEE_BUCKETS.length - 1];
    const key = `${bucket.label} sat/vB`;
    buckets.set(key, (buckets.get(key) ?? 0) + tx.vsize);
  }

  const children = Array.from(buckets.entries())
    .filter(([, value]) => value > 0)
    .map(([id, value]) => {
      const bucket = FEE_BUCKETS.find((b) => `${b.label} sat/vB` === id);
      return { id, value, feerate: bucket?.mid };
    })
    .sort((a, b) => b.value - a.value);

  if (children.length === 0) return [{ id: 'empty', value: 1 }];
  return children;
}

type FilterTab = 'all' | TransactionFilter;

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'consolidation', label: 'Consolidation' },
  { id: 'coinjoin', label: 'Coinjoin' },
  { id: 'data', label: 'Data' },
];

export function MempoolGogglesPanel() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const { data: mempoolStats, isLoading: mempoolLoading, isError: mempoolError, refetch: refetchMempool } = useMempoolStats();
  const {
    data: classifiedTxs,
    isLoading: classifiedLoading,
    isFetching: classifiedFetching,
    isError: classifiedError,
    refetch: refetchClassified,
  } = useClassifiedTransactions(activeFilter === 'all' ? null : activeFilter);

  const treemapData = useMemo(() => {
    if (activeFilter === 'all') {
      const hist = mempoolStats?.fee_histogram;
      if (!hist) return { id: 'mempool', children: [{ id: 'loading', value: 1 }] };
      const children = feeHistogramToTreemap(hist);
      return { id: 'mempool', children };
    }

    const txs = classifiedTxs ?? [];
    const children = classifiedToTreemap(txs);
    return { id: 'mempool', children };
  }, [activeFilter, mempoolStats?.fee_histogram, classifiedTxs]);

  const isLoading = activeFilter === 'all' ? mempoolLoading : classifiedLoading || classifiedFetching;
  const showMempoolError = activeFilter === 'all' && mempoolError;
  const showClassifiedError = activeFilter !== 'all' && classifiedError;

  if (showMempoolError) {
    return (
      <Panel title="Mempool Goggles">
        <p className="text-red-400">Data unavailable. mempool.space API could not be reached.</p>
        <button
          type="button"
          onClick={() => refetchMempool()}
          className="mt-2 rounded bg-mempool-border px-3 py-1.5 text-sm text-gray-200 hover:bg-mempool-accent"
        >
          Retry
        </button>
      </Panel>
    );
  }

  const activeLabel = TABS.find((t) => t.id === activeFilter)?.label ?? 'All';

  return (
    <Panel>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
          Mempool Goggles™ : {activeLabel}
        </h2>
        <a
          href="https://mempool.space"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded p-1 text-sky-400 hover:bg-mempool-border/50 hover:text-sky-300"
          aria-label="Open mempool.space"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <p className="mb-3 text-xs text-gray-400">
        Each block is a fee range (sat/vB). Size = mempool volume. Hover for details.
      </p>

      <div className="mb-3 rounded-lg border border-sky-500/50 bg-mempool-bg/30 p-1">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-transparent text-sky-400 hover:bg-mempool-border/50 hover:text-sky-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[320px] w-full">
        {isLoading ? (
          <div className="flex h-full items-center justify-center rounded bg-mempool-border/30">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-mempool-accent border-t-transparent" />
          </div>
        ) : showClassifiedError ? (
          <div className="flex h-full flex-col items-center justify-center rounded bg-mempool-border/30 text-gray-200">
            <p className="text-sm text-red-400">Failed to load {activeFilter} data.</p>
            <button
              type="button"
              onClick={() => refetchClassified()}
              className="mt-2 rounded bg-mempool-border px-3 py-1.5 text-sm hover:bg-mempool-accent"
            >
              Retry
            </button>
          </div>
        ) : activeFilter !== 'all' && (!classifiedTxs || classifiedTxs.length === 0) ? (
          <div className="flex h-full flex-col items-center justify-center rounded bg-mempool-border/30 text-gray-500">
            <p className="text-sm">No {activeFilter} transactions in recent sample</p>
            <p className="mt-1 text-xs">Checking last 25 mempool transactions</p>
          </div>
        ) : (
          <div className="mempool-goggles-treemap h-full w-full overflow-hidden rounded bg-mempool-border/30">
            <ResponsiveTreeMap
              data={treemapData}
              identity="id"
              value="value"
              valueFormat={(v) => formatVbytes(v)}
              enableLabel={false}
              labelTextColor="#ffffff"
              margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
              innerPadding={2}
              outerPadding={2}
              enableParentLabel={false}
              colors={(node) =>
                (node.data as TreeMapNode)?.feerate != null
                  ? feeRateToColor((node.data as TreeMapNode).feerate!)
                  : '#374151'
              }
              borderColor={{ from: 'color', modifiers: [['darker', 1.4]] }}
              animate={true}
              motionConfig="gentle"
              theme={{
                background: 'transparent',
                labels: { text: { fontSize: 11, fontWeight: 600 } },
              }}
              tooltip={({ node }) => {
                const displayLabel = (node.data as TreeMapNode)?.label ?? node.id;
                return (
                  <div
                    className="rounded-lg border border-mempool-border bg-mempool-card px-3 py-2 text-sm shadow-xl"
                    style={{ borderColor: node.color }}
                  >
                    <div className="font-semibold text-white">{displayLabel}</div>
                    <div className="mt-1 text-gray-400">{formatVbytes(node.value)}</div>
                    <div className="mt-0.5 text-xs text-gray-500">Fee rate bucket · vB in mempool</div>
                  </div>
                );
              }}
            />
          </div>
        )}
      </div>
    </Panel>
  );
}
