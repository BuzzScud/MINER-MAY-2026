import { useState, useEffect } from 'react';
import * as api from '../api/tradingBotApi';
import { fmtPct } from '../utils/formatters';

export function GoLiveModal({ isOpen, onClose, mode, setMode, settings, refetchState }) {
  const [step, setStep] = useState(1);
  const [liveMode, setLiveMode] = useState(mode || 'paper');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState(7497);
  const [clientId, setClientId] = useState(1);
  const [account, setAccount] = useState('');
  const [ack, setAck] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setLiveMode(mode || 'paper');
      setAck(false);
      setTestResult('');
    }
  }, [isOpen, mode]);

  const broker = { host, port, client_id: clientId, account: account || undefined };

  const handleTestConnection = async () => {
    setLoading(true);
    setTestResult('');
    try {
      const result = await api.testBrokerConnection(broker);
      setTestResult(result?.ok ? 'Connection successful.' : (result?.message || result?.error || 'Connection failed'));
    } catch (err) {
      setTestResult(err?.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (liveMode === 'live') setStep(2);
      else setStep(3);
    } else if (step === 2) {
      if (ack) setStep(3);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const result = await api.setMode(liveMode, liveMode === 'live' ? broker : {});
      if (result?.ok) {
        setMode(result.mode || liveMode);
        refetchState?.();
        onClose();
      } else {
        setTestResult(result?.message || result?.error || 'Failed');
      }
    } catch (err) {
      setTestResult(err?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const canNext = step === 1 ? true : step === 2 ? ack : false;
  const risk = settings?.risk || {};
  const circuit = settings?.circuit || {};

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl p-5">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-base font-semibold text-gray-900 dark:text-white">Trading Mode</span>
          <button type="button" onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded">
            &times;
          </button>
        </div>
        <div className="flex items-center justify-center gap-0 mb-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                  step >= s ? 'bg-sky-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-500'
                }`}
              >
                {s}
              </div>
              {s < 3 && <div className="w-8 h-0.5 bg-gray-200 dark:bg-gray-600" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Trading Mode</label>
              <select
                value={liveMode}
                onChange={(e) => setLiveMode(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1.5 text-sm"
              >
                <option value="paper">Paper Trading</option>
                <option value="live">Live Trading</option>
              </select>
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">IB Host</label>
                <input type="text" value={host} onChange={(e) => setHost(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 text-sm" placeholder="127.0.0.1" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">IB Port</label>
                <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} min={1} max={65535} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Client ID</label>
                <input type="number" value={clientId} onChange={(e) => setClientId(Number(e.target.value))} min={0} max={999} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Account (optional)</label>
                <input type="text" value={account} onChange={(e) => setAccount(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 text-sm" placeholder="DU1234567" />
              </div>
            </div>
            <button type="button" onClick={handleTestConnection} disabled={loading} className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50">
              Test Connection
            </button>
            {testResult && <p className="text-sm text-gray-600 dark:text-gray-400">{testResult}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="text-amber-600 dark:text-amber-400 font-semibold p-2 rounded bg-amber-500/10 border border-amber-500/30 text-sm">
              You are about to enable LIVE trading with REAL money.
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Current Risk Settings:</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Max Daily Loss</span><span className="text-gray-900 dark:text-white">{risk.max_daily_loss_pct != null ? fmtPct(risk.max_daily_loss_pct) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Risk Per Trade</span><span className="text-gray-900 dark:text-white">{risk.risk_pct_per_trade != null ? fmtPct(risk.risk_pct_per_trade) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Max Drawdown</span><span className="text-gray-900 dark:text-white">{circuit.max_drawdown_pct != null ? fmtPct(circuit.max_drawdown_pct) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Max Positions</span><span className="text-gray-900 dark:text-white">{risk.max_concurrent_positions ?? '—'}</span></div>
            </div>
            <label className="flex gap-2 items-start cursor-pointer text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 rounded border-gray-600" />
              <span>I understand this will execute real trades with real money. Risk limits above will be enforced.</span>
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2 text-sm">
            <div className="font-semibold text-gray-900 dark:text-white">Confirm</div>
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg divide-y divide-gray-200 dark:divide-gray-600">
              <div className="flex justify-between px-3 py-2"><span className="text-gray-500 dark:text-gray-400">Mode</span><span className="text-gray-900 dark:text-white">{liveMode.toUpperCase()}</span></div>
              <div className="flex justify-between px-3 py-2"><span className="text-gray-500 dark:text-gray-400">IB Host</span><span className="text-gray-900 dark:text-white">{host}</span></div>
              <div className="flex justify-between px-3 py-2"><span className="text-gray-500 dark:text-gray-400">IB Port</span><span className="text-gray-900 dark:text-white">{port}</span></div>
              <div className="flex justify-between px-3 py-2"><span className="text-gray-500 dark:text-gray-400">Client ID</span><span className="text-gray-900 dark:text-white">{clientId}</span></div>
              <div className="flex justify-between px-3 py-2"><span className="text-gray-500 dark:text-gray-400">Account</span><span className="text-gray-900 dark:text-white">{account || '—'}</span></div>
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={() => setStep((s) => s - 1)} className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm" style={{ display: step === 1 ? 'none' : 'block' }}>
            Back
          </button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm">
            Cancel
          </button>
          {step < 3 ? (
            <button type="button" onClick={handleNext} disabled={!canNext} className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50">
              Next
            </button>
          ) : (
            <button type="button" onClick={handleConfirm} disabled={loading} className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50">
              {liveMode === 'live' ? 'Enable Live Trading' : 'Switch to Paper'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
