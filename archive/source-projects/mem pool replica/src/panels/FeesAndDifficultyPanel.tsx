import { useState } from 'react';
import { Panel } from '../components/Panel';
import {
  useRecommendedFees,
  usePrices,
  useDifficultyAdjustment,
} from '../hooks/useMempoolQueries';

const AVG_TX_VBYTES = 250;

const FEE_TIERS = [
  { key: 'minimumFee' as const, label: 'No Priority', color: 'text-green-400' },
  { key: 'economyFee' as const, label: 'Low Priority', color: 'text-green-500' },
  { key: 'hourFee' as const, label: 'Medium Priority', color: 'text-green-600' },
  { key: 'fastestFee' as const, label: 'High Priority', color: 'text-lime-400' },
] as const;

const GREEN_SEGMENT_PERCENT = 6;

function formatUsd(satPerVb: number, btcPriceUsd: number): string {
  const btcPerTx = (satPerVb * AVG_TX_VBYTES) / 1e8;
  const usd = btcPerTx * btcPriceUsd;
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

function formatTimeUntil(date: number): string {
  const now = Date.now() / 1000;
  const diffSeconds = date - now;
  const days = Math.floor(diffSeconds / 86400);
  if (days >= 1) return `In ~${days} days`;
  const hours = Math.floor(diffSeconds / 3600);
  if (hours >= 1) return `In ~${hours} hours`;
  return 'Soon';
}

function formatDate(date: number): string {
  return new Date(date * 1000).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function FeesAndDifficultyPanel() {
  const [activeTab, setActiveTab] = useState<'difficulty' | 'halving'>('halving');
  const { data: fees, isLoading: feesLoading, error: feesError, refetch: refetchFees } =
    useRecommendedFees();
  const { data: prices } = usePrices();
  const { data: difficultyData, isLoading: difficultyLoading, error: difficultyError, refetch: refetchDifficulty } =
    useDifficultyAdjustment();

  const btcPriceUsd = (prices?.USD ?? 0) / 100;
  const hasFeesError = Boolean(feesError);
  const hasDifficultyError = Boolean(difficultyError);
  const anyError = hasFeesError || hasDifficultyError;

  if (anyError) {
    return (
      <Panel title="Transaction Fees & Difficulty Adjustment">
        <div className="space-y-3">
          {hasFeesError && (
            <p className="text-sm text-red-400">Failed to load fees. Please try again.</p>
          )}
          {hasDifficultyError && (
            <p className="text-sm text-red-400">Failed to load difficulty. Please try again.</p>
          )}
          <div className="flex gap-2">
            {hasFeesError && (
              <button
                type="button"
                onClick={() => refetchFees()}
                className="rounded bg-mempool-border px-3 py-1.5 text-sm text-gray-200 hover:bg-mempool-accent"
              >
                Retry fees
              </button>
            )}
            {hasDifficultyError && (
              <button
                type="button"
                onClick={() => refetchDifficulty()}
                className="rounded bg-mempool-border px-3 py-1.5 text-sm text-gray-200 hover:bg-mempool-accent"
              >
                Retry difficulty
              </button>
            )}
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Transaction Fees & Difficulty Adjustment">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Transaction Fees
          </h3>
          {feesLoading || !fees ? (
            <div className="flex animate-pulse flex-col gap-3">
              {FEE_TIERS.map((_, i) => (
                <div key={i} className="h-12 rounded bg-mempool-border/50" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {FEE_TIERS.map(({ key, label, color }) => {
                const satPerVb = fees[key];
                return (
                  <div key={key} className="flex flex-col">
                    <span className={`text-sm font-medium ${color}`}>{label}</span>
                    <span className="text-2xl font-bold text-white">{satPerVb} sat/vB</span>
                    <span className="text-sm text-gray-500">
                      {formatUsd(satPerVb, btcPriceUsd)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Difficulty Adjustment
          </h3>
          {difficultyLoading || !difficultyData ? (
            <div className="flex animate-pulse flex-col gap-3">
              <div className="h-2 w-full rounded bg-mempool-border/50" />
              <div className="h-6 w-32 rounded bg-mempool-border/50" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">View</span>
                <div className="flex items-center gap-1 text-sm">
                  <button
                    type="button"
                    onClick={() => setActiveTab('difficulty')}
                    className={
                      activeTab === 'difficulty'
                        ? 'text-sky-400'
                        : 'text-white hover:text-gray-300'
                    }
                  >
                    difficulty
                  </button>
                  <span className="text-gray-500">|</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('halving')}
                    className={
                      activeTab === 'halving'
                        ? 'text-sky-400'
                        : 'text-white hover:text-gray-300'
                    }
                  >
                    halving
                  </button>
                </div>
              </div>

              <div className="flex h-2 w-full overflow-hidden rounded-full">
                {(() => {
                  const progressPercent = Math.min(100, Math.max(0, difficultyData.progressPercent));
                  const blueWidth = progressPercent;
                  const greenWidth = GREEN_SEGMENT_PERCENT;
                  const grayWidth = Math.max(0, 100 - blueWidth - greenWidth);
                  return (
                    <>
                      {blueWidth > 0 && (
                        <div
                          className="h-full bg-blue-600 transition-all duration-500"
                          style={{ width: `${blueWidth}%` }}
                        />
                      )}
                      {greenWidth > 0 && (
                        <div
                          className="h-full bg-green-500 transition-all duration-500"
                          style={{ width: `${greenWidth}%` }}
                        />
                      )}
                      {grayWidth > 0 && (
                        <div
                          className="h-full bg-gray-700 transition-all duration-500"
                          style={{ width: `${grayWidth}%` }}
                        />
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-base font-semibold text-white">
                    ~{(difficultyData.timeAvg / 60_000).toFixed(1)} min
                  </p>
                  <p className="text-xs text-gray-500">Avg block time</p>
                </div>
                <div>
                  <p
                    className={`text-base font-semibold ${
                      difficultyData.difficultyChange > 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {difficultyData.difficultyChange > 0 ? '▲' : '▼'}{' '}
                    {Math.abs(difficultyData.difficultyChange).toFixed(2)} %
                  </p>
                  <p className="text-xs text-gray-500">
                    Prev ▼ {Math.abs(difficultyData.previousRetarget).toFixed(2)} %
                  </p>
                </div>
                <div>
                  <p className="text-base font-semibold text-white">
                    {formatTimeUntil(difficultyData.estimatedRetargetDate)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(difficultyData.estimatedRetargetDate)}
                  </p>
                </div>
              </div>

              {activeTab === 'halving' && (
                <p className="text-xs text-gray-500">
                  Halving countdown is based on block height; difficulty view shows retarget
                  progress.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </Panel>
  );
}
