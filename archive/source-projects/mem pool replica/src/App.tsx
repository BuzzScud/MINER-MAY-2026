import { useState } from 'react';
import { FeesAndDifficultyPanel } from './panels/FeesAndDifficultyPanel';
import { MempoolGogglesPanel } from './panels/MempoolGogglesPanel';
import { RecentActivityPanel } from './panels/RecentActivityPanel';
import { BlockNavigatorPanel } from './panels/BlockNavigatorPanel';
import { useMempoolWebSocket } from './hooks/useMempoolWebSocket';
import { TransactionDetailModal } from './components/TransactionDetailModal';

function App() {
  const { connected } = useMempoolWebSocket();
  const [transactionModalTxid, setTransactionModalTxid] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-mempool-bg p-4 md:p-6">
      <TransactionDetailModal
        txid={transactionModalTxid}
        onClose={() => setTransactionModalTxid(null)}
      />
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Bitcoin Mempool</h1>
            <p className="text-sm text-gray-500">Real-time mempool and network statistics</p>
          </div>
          <div
            className="flex items-center gap-2 rounded-full px-3 py-1 text-xs"
            title={connected ? 'Live data connected' : 'Connecting to live data...'}
          >
            <span
              className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'animate-pulse bg-amber-500'}`}
            />
            {connected ? 'Live' : 'Connecting...'}
          </div>
        </header>

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
    </div>
  );
}

export default App;
