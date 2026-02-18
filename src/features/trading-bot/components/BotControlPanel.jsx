import { useState, useEffect } from 'react';
import * as api from '../api/tradingBotApi';
import { getSessionInfoClient, formatSessionTimeRemaining } from '../utils/formatters';

export function BotControlPanel({
  running,
  setRunning,
  mode,
  connected,
  showToast,
}) {
  const [sessionInfo, setSessionInfo] = useState(getSessionInfoClient());
  const [buttonsDisabled, setButtonsDisabled] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setSessionInfo(getSessionInfoClient()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setButtonsDisabled(true);
    try {
      const d = await api.startBot();
      if (d?.ok) setRunning(true);
      else showToast(d?.error || 'Start failed', true);
    } catch {
      showToast('Start failed', true);
    } finally {
      setButtonsDisabled(false);
    }
  };

  const handleStop = async () => {
    setButtonsDisabled(true);
    try {
      const d = await api.stopBot();
      if (d?.ok) setRunning(false);
      else showToast(d?.error || 'Stop failed', true);
    } catch {
      showToast('Stop failed', true);
    } finally {
      setButtonsDisabled(false);
    }
  };

  const sessionTimeStr = formatSessionTimeRemaining(sessionInfo);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        Bot Control
      </h2>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-600 dark:text-gray-400">Status</span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              running
                ? 'bg-green-600 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            {running ? 'Running' : 'Stopped'}
          </span>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleStart}
            disabled={buttonsDisabled || running}
            className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-3 text-sm font-medium"
          >
            Start
          </button>
          <button
            type="button"
            onClick={handleStop}
            disabled={buttonsDisabled || !running}
            className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-3 text-sm font-medium"
          >
            Stop
          </button>
        </div>
        <div className="pt-1 border-t border-gray-200 dark:border-gray-600">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600 dark:text-gray-400">Session</span>
            <span className="font-medium text-gray-900 dark:text-white">{sessionInfo.name}</span>
          </div>
          {sessionInfo.active && (
            <>
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-1000"
                  style={{ width: `${sessionInfo.progress * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{sessionTimeStr}</p>
            </>
          )}
        </div>
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-gray-600 dark:text-gray-400">Connection</span>
          <span className="flex items-center gap-1">
            <span
              className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}
              aria-hidden
            />
            {connected ? 'Connected' : 'Connecting…'}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600 dark:text-gray-400">Mode</span>
          <span
            className={`px-2 py-0.5 rounded font-medium ${
              mode === 'live' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {mode === 'live' ? 'LIVE' : 'PAPER'}
          </span>
        </div>
      </div>
    </div>
  );
}
