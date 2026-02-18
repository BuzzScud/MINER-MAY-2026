import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api/tradingBotApi';
import { useTradingBotSocket } from './useTradingBotSocket';

const DEFAULT_SYMBOLS = ['NQ', 'ES', 'EURUSD', 'GBPUSD'];
const POLL_INTERVAL_MS = 5000;

/**
 * Consolidated state and socket integration for Trading Bot.
 * Loads initial state, subscribes to Socket.IO, polls as fallback.
 */
export function useTradingBotState() {
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [prices, setPrices] = useState({});
  const [positions, setPositions] = useState([]);
  const [trades, setTrades] = useState([]);
  const [equity, setEquity] = useState(null); // { equity_curve, equity, sharpe_ratio, ... }
  const [bars, setBars] = useState({}); // symbol -> array of bar objects
  const [activityLog, setActivityLog] = useState([]);
  const [marketOverview, setMarketOverview] = useState([]);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState('paper');
  const [chartInterval, setChartInterval] = useState('1h');
  const [feedProvider, setFeedProvider] = useState('yahoo');
  const [settings, setSettings] = useState({});
  const [strategies, setStrategies] = useState({ current: 'multi_asset', options: [] });
  const [activeChartSymbol, setActiveChartSymbol] = useState(DEFAULT_SYMBOLS[0] || 'NQ');
  const [backtestProgress, setBacktestProgress] = useState({ show: false, pct: 0, text: '' });
  const [backtestResult, setBacktestResult] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '', isError: false });
  const [backendUnreachable, setBackendUnreachable] = useState(false);
  const pollRef = useRef(null);

  const showToast = useCallback((message, isError = false) => {
    setToast({ show: true, message, isError });
    setTimeout(() => setToast(prev => (prev.show ? { ...prev, show: false } : prev)), 3000);
  }, []);

  const refetchState = useCallback(async () => {
    try {
      const s = await api.getState();
      setBackendUnreachable(false);
      const syms = (s.symbols && s.symbols.length) ? s.symbols : DEFAULT_SYMBOLS;
      setSymbols(syms);
      setRunning(s.running === true);
      if (s.mode) setMode(s.mode);
      if (s.bars && Object.keys(s.bars).length) setBars(s.bars);
      if (s.prices) setPrices(s.prices);
      if (s.positions) setPositions(s.positions);
      if (s.trades) setTrades(s.trades);
      if (s.equity) setEquity(s.equity);
      if (s.activity_log) setActivityLog(s.activity_log);
      if (s.market_overview) setMarketOverview(s.market_overview);
      if (s.chart_interval) setChartInterval(s.chart_interval);
      if (s.feed_provider) setFeedProvider(s.feed_provider);
      setActiveChartSymbol(prev => (prev && syms.includes(prev) ? prev : syms[0] || 'NQ'));
    } catch (err) {
      setBackendUnreachable(true);
      console.warn('Trading bot getState error', err);
    }
  }, []);

  const { connected } = useTradingBotSocket({
    onPriceUpdate: (data) => {
      if (data.bars && Object.keys(data.bars).length) {
        setBars(prev => {
          const next = { ...prev };
          for (const [sym, barList] of Object.entries(data.bars)) {
            if (Array.isArray(barList) && barList.length) {
              const existing = next[sym] || [];
              const last = barList[barList.length - 1];
              const t = typeof last.time === 'string' ? Math.floor(new Date(last.time).getTime() / 1000) : last.time;
              const idx = existing.findIndex(b => (b.time === t || (typeof b.time === 'string' && new Date(b.time).getTime() / 1000 === t)));
              if (idx >= 0) {
                next[sym] = [...existing.slice(0, idx), ...barList].sort((a, b) => (a.time - b.time));
              } else {
                next[sym] = [...existing, ...barList].sort((a, b) => (a.time - b.time));
              }
            }
          }
          return next;
        });
      }
      if (data.prices && typeof data.prices === 'object') setPrices(prev => ({ ...prev, ...data.prices }));
    },
    onMarketOverviewUpdate: (data) => {
      if (data && Array.isArray(data)) setMarketOverview(data);
    },
    onPositionUpdate: (positionsList) => {
      setPositions(Array.isArray(positionsList) ? positionsList : []);
    },
    onEquityUpdate: (payload) => {
      if (payload && payload.equity_curve) setEquity(prev => ({ ...prev, equity_curve: payload.equity_curve, ...payload }));
      else if (payload && (payload.equity != null || payload.sharpe_ratio != null)) setEquity(prev => ({ ...prev, ...payload }));
    },
    onTradeExecuted: () => {
      refetchState();
    },
    onLogUpdate: (log) => {
      setActivityLog(Array.isArray(log) ? log : []);
    },
    onBacktestProgress: (data) => {
      setBacktestProgress({ show: true, pct: data.pct ?? 0, text: data.stage || 'Processing...' });
    },
    onBacktestComplete: (data) => {
      setBacktestProgress(prev => ({ ...prev, show: false, pct: 100, text: 'Complete' }));
      setBacktestResult(data || null);
    },
    onBacktestError: (data) => {
      setBacktestProgress({ show: false, pct: 0, text: '' });
      showToast('Backtest error: ' + (data?.error || 'Unknown'), true);
    },
  });


  useEffect(() => {
    refetchState();
    try {
      api.getSettings().then((s) => setSettings(s != null && typeof s === 'object' ? s : {})).catch(() => {});
      api.getStrategies().then((data) => {
        const opts = Array.isArray(data?.options)
          ? data.options
          : Array.isArray(data?.strategies)
            ? data.strategies
            : Array.isArray(data)
              ? data
              : [];
        setStrategies({ current: data?.current || 'multi_asset', options: opts });
      }).catch(() => {});
    } catch (_) {}
  }, []);

  useEffect(() => {
    pollRef.current = setInterval(refetchState, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refetchState]);

  return {
    symbols,
    setSymbols,
    prices,
    positions,
    trades,
    equity,
    bars,
    activityLog,
    marketOverview,
    running,
    setRunning,
    mode,
    setMode,
    chartInterval,
    setChartInterval,
    feedProvider,
    setFeedProvider,
    settings,
    setSettings,
    strategies,
    activeChartSymbol,
    setActiveChartSymbol,
    backtestProgress,
    setBacktestProgress,
    backtestResult,
    setBacktestResult,
    toast,
    showToast,
    refetchState,
    connected,
    backendUnreachable,
  };
}
