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
 * @param {{ enabled?: boolean }} [options]
 * @returns {{ connected: boolean }}
 */
export function useTradingBotSocket(callbacks = {}, options = {}) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let socket;
    try {
      if (typeof io !== 'function') return;
      const url = window.location.origin;
      socket = io(url, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        // Suppress socket.io debug logs when trading bot server is not running
        ...(typeof localStorage !== 'undefined' && { logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} } }),
      });
      socketRef.current = socket;
    } catch (_err) {
      return;
    }

    socket.on('connect_error', () => {
      setConnected(false);
    });
    socket.on('connect_timeout', () => {
      setConnected(false);
    });
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
  }, [enabled]);

  return { connected };
}
