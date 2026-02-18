import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

/**
 * Socket.IO connection to QuantBot backend (proxied in dev to :8080).
 * Subscribes to all dashboard events and invokes callbacks.
 *
 * @param {{
 *   onConnect?: () => void;
 *   onDisconnect?: () => void;
 *   onPriceUpdate?: (data: { bars?: Record<string, unknown[]>, prices?: Record<string, number> }) => void;
 *   onMarketOverviewUpdate?: (data: unknown) => void;
 *   onPositionUpdate?: (positions: unknown[]) => void;
 *   onEquityUpdate?: (payload: { equity_curve?: unknown[], equity?: number, [k: string]: unknown }) => void;
 *   onTradeExecuted?: (data: unknown) => void;
 *   onLogUpdate?: (log: unknown[]) => void;
 *   onBacktestProgress?: (data: { pct?: number, stage?: string }) => void;
 *   onBacktestComplete?: (data: unknown) => void;
 *   onBacktestError?: (data: { error?: string }) => void;
 * }} callbacks
 * @returns {{ connected: boolean }}
 */
export function useTradingBotSocket(callbacks = {}) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let socket;
    try {
      if (typeof io !== 'function') {
        console.warn('Trading Bot: socket.io-client not available');
        return;
      }
      const url = window.location.origin;
      socket = io(url, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      socketRef.current = socket;
    } catch (err) {
      console.warn('Trading Bot: socket connection failed', err);
      return;
    }

    socket.on('connect', () => {
      setConnected(true);
      callbacksRef.current.onConnect?.();
    });

    socket.on('disconnect', () => {
      setConnected(false);
      callbacksRef.current.onDisconnect?.();
    });

    socket.on('price_update', (data) => {
      callbacksRef.current.onPriceUpdate?.(data || {});
    });

    socket.on('market_overview_update', (data) => {
      callbacksRef.current.onMarketOverviewUpdate?.(data);
    });

    socket.on('position_update', (positions) => {
      callbacksRef.current.onPositionUpdate?.(Array.isArray(positions) ? positions : []);
    });

    socket.on('equity_update', (payload) => {
      callbacksRef.current.onEquityUpdate?.(payload || {});
    });

    socket.on('trade_executed', (data) => {
      callbacksRef.current.onTradeExecuted?.(data);
    });

    socket.on('log_update', (log) => {
      callbacksRef.current.onLogUpdate?.(Array.isArray(log) ? log : []);
    });

    socket.on('backtest_progress', (data) => {
      callbacksRef.current.onBacktestProgress?.(data || {});
    });

    socket.on('backtest_complete', (data) => {
      callbacksRef.current.onBacktestComplete?.(data);
    });

    socket.on('backtest_error', (data) => {
      callbacksRef.current.onBacktestError?.(data || {});
    });

    return () => {
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      socketRef.current = null;
      setConnected(false);
    };
  }, []);

  return { connected };
}
