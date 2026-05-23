import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTradingBotState } from './hooks/useTradingBotState';
import * as api from './api/tradingBotApi';
import { BotControlPanel } from './components/BotControlPanel';
import { ChartPanel } from './components/ChartPanel';
import { Toolbar } from './components/Toolbar';
import { MetricsGrid } from './components/MetricsGrid';
import { PositionsTable } from './components/PositionsTable';
import { TradesTable } from './components/TradesTable';
import { ActivityLog } from './components/ActivityLog';
import { SymbolLegend } from './components/SymbolLegend';
import { MarketOverview } from './components/MarketOverview';
import { VolumePanel } from './components/VolumePanel';
import { EquityChart } from './components/EquityChart';
import { SettingsModal } from './components/SettingsModal';
import { GoLiveModal } from './components/GoLiveModal';
import { BacktestPanel } from './components/BacktestPanel';

const TAB_DASHBOARD = 'dashboard';
const TAB_BACKTEST = 'backtest';
const INNER_TABS = [
  { id: 'performance', label: 'Performance' },
  { id: 'equity', label: 'Equity' },
  { id: 'volume', label: 'Volume' },
  { id: 'positions', label: 'Positions' },
  { id: 'trades', label: 'Trades' },
];

export function TradingBotView({ embedded = false }) {
  const state = useTradingBotState();
  const [page, setPage] = useState(TAB_DASHBOARD);
  const [innerTab, setInnerTab] = useState(INNER_TABS[0].id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goLiveOpen, setGoLiveOpen] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const s = await api.getSettings();
      state.setSettings(s != null && typeof s === 'object' ? s : {});
    } catch {
      state.setSettings({});
    }
  }, [state]);

  const runBacktest = async (params) => {
    await api.runBacktest(params);
  };

  const containerCls = embedded
    ? 'w-full max-w-[1800px] mx-auto px-0 flex flex-col h-full min-h-0 overflow-hidden'
    : 'w-full max-w-[1800px] mx-auto px-4 flex flex-col h-full min-h-0 overflow-hidden';

  return (
    <div className={containerCls}>
      {!embedded && (
        <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2 flex-shrink-0">
          <Link to="/" className="hover:text-sky-400 dark:hover:text-sky-300 transition-colors">Dashboard</Link>
          <span>/</span>
          <span className="font-medium text-gray-900 dark:text-white">Trading Bot</span>
        </nav>
      )}
      {!embedded && (
        <div className="text-center mb-3 flex-shrink-0">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Trading Bot</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Algorithmic trading dashboard — paper and live modes
          </p>
        </div>
      )}

      <div className="flex gap-2 mb-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => setPage(TAB_DASHBOARD)}
          className={`px-3 py-1.5 rounded text-sm font-medium ${page === TAB_DASHBOARD ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
        >
          Dashboard
        </button>
        <button
          type="button"
          onClick={() => setPage(TAB_BACKTEST)}
          className={`px-3 py-1.5 rounded text-sm font-medium ${page === TAB_BACKTEST ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
        >
          Backtest
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="ml-auto px-3 py-1.5 rounded text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Settings
        </button>
        <button
          type="button"
          onClick={() => state.setSocketEnabled((v) => !v)}
          className="px-3 py-1.5 rounded text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          {state.socketEnabled ? 'Disconnect bot' : 'Connect bot'}
        </button>
        <button
          type="button"
          onClick={() => setGoLiveOpen(true)}
          className="px-3 py-1.5 rounded text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Go Live
        </button>
      </div>

      {state.toast.show && (
        <div className={`mb-2 px-3 py-2 rounded text-sm ${state.toast.isError ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'}`}>
          {state.toast.message}
        </div>
      )}

      {state.backendUnreachable && page === TAB_DASHBOARD && (
        <div className="mb-2 px-3 py-2 rounded text-sm bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
          Trading Bot server (port 8080) is not running. Start it to load data with{' '}
          <code className="text-xs bg-amber-200/50 dark:bg-amber-800/50 px-1 rounded">npm run trading-bot:server</code>.
        </div>
      )}

      {page === TAB_BACKTEST ? (
        <BacktestPanel
          backtestProgress={state.backtestProgress}
          backtestResult={state.backtestResult}
          setBacktestResult={state.setBacktestResult}
          runBacktest={runBacktest}
          showToast={state.showToast}
        />
      ) : (
        <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0 overflow-hidden">
          <div className="lg:w-96 flex-shrink-0 flex flex-col min-h-0 order-2 lg:order-1">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3 pr-1">
              <BotControlPanel
                running={state.running}
                setRunning={state.setRunning}
                mode={state.mode}
                connected={state.connected}
                showToast={state.showToast}
              />
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Market Overview</h2>
                <MarketOverview marketOverview={state.marketOverview} />
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Activity Log</h2>
                <ActivityLog activityLog={state.activityLog} />
              </div>
            </div>
            <div className="flex-shrink-0 pt-3 pr-1">
              <SymbolLegend />
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-3 order-1 lg:order-2">
            <Toolbar
              chartInterval={state.chartInterval}
              setChartInterval={state.setChartInterval}
              feedProvider={state.feedProvider}
              setFeedProvider={state.setFeedProvider}
              symbols={state.symbols}
              refetchState={state.refetchState}
              showToast={state.showToast}
            />
            <ChartPanel
              symbols={state.symbols}
              activeChartSymbol={state.activeChartSymbol}
              setActiveChartSymbol={state.setActiveChartSymbol}
              bars={state.bars}
              prices={state.prices}
              chartInterval={state.chartInterval}
            />
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col flex-1 min-h-0">
              <div className="flex gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                {INNER_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setInnerTab(t.id)}
                    className={`px-2.5 py-1 rounded text-xs font-medium ${innerTab === t.id ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="p-3 flex-1 min-h-0 overflow-auto">
                {innerTab === 'performance' && <MetricsGrid equity={state.equity} />}
                {innerTab === 'equity' && (
                  <div className="h-[280px] flex flex-col min-h-0">
                    <EquityChart equityCurve={state.equity?.equity_curve || []} />
                  </div>
                )}
                {innerTab === 'volume' && (
                  <VolumePanel marketOverview={state.marketOverview} activeChartSymbol={state.activeChartSymbol} />
                )}
                {innerTab === 'positions' && (
                  <PositionsTable positions={state.positions} prices={state.prices} />
                )}
                {innerTab === 'trades' && (
                  <TradesTable trades={state.trades} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={state.settings}
        strategies={state.strategies}
        loadSettings={loadSettings}
        onSave={() => state.refetchState()}
        showToast={state.showToast}
        backendUnreachable={state.backendUnreachable}
      />
      <GoLiveModal
        isOpen={goLiveOpen}
        onClose={() => setGoLiveOpen(false)}
        mode={state.mode}
        setMode={state.setMode}
        settings={state.settings}
        refetchState={state.refetchState}
      />
    </div>
  );
}
