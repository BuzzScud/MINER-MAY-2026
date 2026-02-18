import { useState, useEffect } from 'react';
import { Panel } from '../../../components/common/Panel';
import { useRecentBlocks } from '../hooks/useMempoolQueries';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MEMPOOL_BLOCK_URL = 'https://mempool.space/block';
const SATOSHI_PER_BTC = 1e8;

function formatBtc(sats) {
  const btc = sats / SATOSHI_PER_BTC;
  if (btc >= 1) return btc.toFixed(4);
  if (btc >= 0.0001) return btc.toFixed(6);
  return btc.toFixed(8);
}

function formatTimeAgo(timestamp) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

function formatFeeRange(feeRange) {
  if (!feeRange || feeRange.length < 2) return '—';
  const min = feeRange[0].toFixed(2);
  const max = feeRange[feeRange.length - 1].toFixed(2);
  return `${min} - ${max} sat/vB`;
}

function BlockCard({ block, direction }) {
  const extras = block.extras;
  const reward = extras?.reward ?? 0;
  const totalFees = extras?.totalFees ?? 0;
  const feeRange = extras?.feeRange;
  const poolName = extras?.pool?.name ?? 'Unknown';
  const medianFee = extras?.medianFee ?? 0;

  const animationClass =
    direction === 'prev'
      ? 'animate-slide-in-right'
      : direction === 'next'
        ? 'animate-slide-in-left'
        : '';

  return (
    <div className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 p-4 ${animationClass}`}>
      <div className="mb-3 flex items-center justify-between">
        <a
          href={`${MEMPOOL_BLOCK_URL}/${block.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xl font-bold text-gray-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400 hover:underline"
        >
          {block.height.toLocaleString()}
        </a>
      </div>
      <div className="space-y-2 text-sm">
        <p className="text-black dark:text-gray-400">
          Estimated fee rate: <span className="text-gray-900 dark:text-white">~{medianFee.toFixed(0)} sat/vB</span>
        </p>
        <p className="text-amber-400/90">
          Fee range: {formatFeeRange(feeRange)}
        </p>
        <p className="text-gray-900 dark:text-white font-semibold">
          Total value: {formatBtc(reward + totalFees)} BTC
        </p>
        <p className="text-black dark:text-gray-400">
          {block.tx_count.toLocaleString()} transactions
        </p>
        <p className="text-black dark:text-gray-400">
          {formatTimeAgo(block.timestamp)}
        </p>
        <p className="mt-2 border-t border-gray-200 dark:border-gray-700/50 pt-2 text-xs text-black dark:text-gray-400">
          Mined by {poolName}
        </p>
      </div>
    </div>
  );
}

export function BlockNavigatorPanel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [olderStartHeight, setOlderStartHeight] = useState(null);
  const [accumulatedOlderBlocks, setAccumulatedOlderBlocks] = useState([]);
  const [direction, setDirection] = useState(null);

  const { data: tipBlocks = [], isLoading: tipLoading, error: tipError, refetch: refetchTip } = useRecentBlocks();
  const { data: olderBlocks = [], isSuccess: olderSuccess } = useRecentBlocks(olderStartHeight ?? undefined);

  const fullList = [...tipBlocks, ...accumulatedOlderBlocks];
  const currentBlock = fullList[currentIndex];
  const canGoNext = currentIndex > 0;
  const canGoPrevious = currentIndex < fullList.length - 1 || olderStartHeight != null;
  const isLoadingOlder = olderStartHeight != null && !olderSuccess;

  useEffect(() => {
    if (olderStartHeight == null || !olderBlocks.length) return;
    setAccumulatedOlderBlocks((prev) => [...prev, ...olderBlocks]);
    setCurrentIndex(tipBlocks.length + accumulatedOlderBlocks.length);
    setOlderStartHeight(null);
  }, [olderStartHeight, olderBlocks, tipBlocks.length, accumulatedOlderBlocks.length]);

  useEffect(() => {
    if (direction == null) return;
    const id = setTimeout(() => setDirection(null), 220);
    return () => clearTimeout(id);
  }, [direction, currentIndex]);

  const goNext = () => {
    if (!canGoNext) return;
    setDirection('next');
    setCurrentIndex((i) => i - 1);
  };

  const goPrevious = () => {
    if (currentIndex < fullList.length - 1) {
      setDirection('prev');
      setCurrentIndex((i) => i + 1);
      return;
    }
    if (olderStartHeight != null) return;
    const lastBlock = fullList[fullList.length - 1];
    if (lastBlock) {
      setDirection('prev');
      setOlderStartHeight(lastBlock.height - 1);
    }
  };

  if (tipError) {
    return (
      <Panel title="Block Navigator">
        <p className="text-red-400">Failed to load blocks.</p>
        <button
          type="button"
          onClick={() => refetchTip()}
          className="mt-2 rounded bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500"
        >
          Retry
        </button>
      </Panel>
    );
  }

  if (tipLoading && !tipBlocks.length) {
    return (
      <Panel title="Block Navigator">
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 dark:border-blue-500 border-t-transparent" />
        </div>
      </Panel>
    );
  }

  if (!fullList.length) {
    return (
      <Panel title="Block Navigator">
        <p className="text-black dark:text-gray-400">No blocks available.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Block Navigator">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-900 dark:hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next block (newer)"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          {currentBlock && (
            <BlockCard
              key={currentBlock.height}
              block={currentBlock}
              direction={direction}
            />
          )}
        </div>
        <button
          type="button"
          onClick={goPrevious}
          disabled={!canGoPrevious || isLoadingOlder}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-900 dark:hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous block (older)"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-black dark:text-gray-400">
        Block {currentIndex + 1} of {fullList.length}
        {isLoadingOlder ? ' (loading older…)' : ''}
      </p>
    </Panel>
  );
}
