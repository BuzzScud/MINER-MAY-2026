import { useState } from 'react';
import { Panel } from '../components/Panel';
import { useDifficultyAdjustment } from '../hooks/useMempoolQueries';

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

const GREEN_SEGMENT_PERCENT = 6;

export function DifficultyAdjustmentPanel() {
  const [activeTab, setActiveTab] = useState<'difficulty' | 'halving'>('halving');
  const { data, isLoading, error, refetch } = useDifficultyAdjustment();

  if (error) {
    return (
      <Panel title="Difficulty Adjustment">
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

  if (isLoading || !data) {
    return (
      <Panel>
        <div className="flex animate-pulse flex-col gap-3">
          <div className="h-2 w-full rounded bg-mempool-border/50" />
          <div className="h-6 w-32 rounded bg-mempool-border/50" />
        </div>
      </Panel>
    );
  }

  const blockTimeMinutes = (data.timeAvg / 60_000).toFixed(1);
  const progressPercent = Math.min(100, Math.max(0, data.progressPercent));
  const isNextUp = data.difficultyChange > 0;
  const blueWidth = progressPercent;
  const greenWidth = GREEN_SEGMENT_PERCENT;
  const grayWidth = Math.max(0, 100 - blueWidth - greenWidth);

  return (
    <Panel>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
            Difficulty Adjustment
          </h2>
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
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-lg font-semibold text-white">~{blockTimeMinutes} minutes</p>
            <p className="text-sm text-white">Average block time</p>
          </div>
          <div>
            <p
              className={`text-lg font-semibold ${isNextUp ? 'text-green-400' : 'text-red-400'}`}
            >
              {isNextUp ? '▲' : '▼'} {Math.abs(data.difficultyChange).toFixed(2)} %
            </p>
            <p className="text-sm text-white">
              Previous: <span className="text-red-400">▼ {Math.abs(data.previousRetarget).toFixed(2)} %</span>
            </p>
          </div>
          <div>
            <p className="text-lg font-semibold text-white">
              {formatTimeUntil(data.estimatedRetargetDate)}
            </p>
            <p className="text-sm text-white">{formatDate(data.estimatedRetargetDate)}</p>
          </div>
        </div>

        {activeTab === 'halving' && (
          <p className="text-xs text-gray-500">
            Halving countdown is based on block height; difficulty view shows retarget progress.
          </p>
        )}
      </div>
    </Panel>
  );
}
