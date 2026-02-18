import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../../contexts/SettingsContext';
import { FeesAndDifficultyPanel } from './panels/FeesAndDifficultyPanel';
import { MempoolGogglesPanel } from './panels/MempoolGogglesPanel';
import { RecentActivityPanel } from './panels/RecentActivityPanel';
import { BlockNavigatorPanel } from './panels/BlockNavigatorPanel';
import { useMempoolWebSocket } from './hooks/useMempoolWebSocket';
import { TransactionDetailModal } from './components/TransactionDetailModal';

export function MempoolView({ embedded = false }) {
  const { generalSettings } = useSettings();
  const showTooltips = generalSettings?.showTooltips ?? true;
  const { connected } = useMempoolWebSocket();
  const [transactionModalTxid, setTransactionModalTxid] = useState(null);

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4">
      <TransactionDetailModal
        txid={transactionModalTxid}
        onClose={() => setTransactionModalTxid(null)}
      />
      {!embedded && (
        <>
          <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
            <Link to="/" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="font-medium text-gray-900 dark:text-white">Mempool</span>
          </nav>
          <header className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Bitcoin Mempool</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Real-time mempool and network statistics</p>
            </div>
            <div
              className="flex items-center gap-2 rounded-full px-3 py-1 text-xs text-gray-700 dark:text-gray-300"
              title={showTooltips ? (connected ? 'Live data connected' : 'Connecting to live data...') : undefined}
            >
              <span
                className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'animate-pulse bg-amber-500'}`}
              />
              {connected ? 'Live' : 'Connecting...'}
            </div>
          </header>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <FeesAndDifficultyPanel />
          <MempoolGogglesPanel />
        </div>
        <div className="flex flex-col gap-4">
          <RecentActivityPanel onOpenTransaction={setTransactionModalTxid} />
          <BlockNavigatorPanel />
        </div>
      </div>
    </div>
  );
}
