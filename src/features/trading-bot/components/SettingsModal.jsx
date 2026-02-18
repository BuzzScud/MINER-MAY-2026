import { useState, useEffect } from 'react';
import * as api from '../api/tradingBotApi';

const STRATEGY_FIELDS = [
  { key: 'rsi_period', label: 'RSI Period', type: 'number', min: 1, max: 100, step: 1 },
  { key: 'bb_period', label: 'BB Period', type: 'number', min: 1, max: 100, step: 1 },
  { key: 'bb_std', label: 'BB Std', type: 'number', min: 0.5, max: 5, step: 0.1 },
  { key: 'atr_period', label: 'ATR Period', type: 'number', min: 1, max: 100, step: 1 },
  { key: 'rsi_oversold', label: 'RSI Oversold', type: 'number', min: 0, max: 50, step: 1 },
  { key: 'rsi_overbought', label: 'RSI Overbought', type: 'number', min: 50, max: 100, step: 1 },
  { key: 'profit_atr_mult', label: 'Profit ATR Mult', type: 'number', min: 0.5, max: 5, step: 0.1 },
  { key: 'stop_atr_mult', label: 'Stop ATR Mult', type: 'number', min: 0.25, max: 3, step: 0.1 },
  { key: 'max_hold_minutes', label: 'Max Hold (min)', type: 'number', min: 1, max: 1440, step: 1 },
];
const RISK_FIELDS = [
  { key: 'risk_pct_per_trade', label: 'Risk % Per Trade', type: 'number', min: 0.01, max: 10, step: 0.01 },
  { key: 'max_concurrent_positions', label: 'Max Positions', type: 'number', min: 1, max: 20, step: 1 },
  { key: 'max_daily_loss_pct', label: 'Max Daily Loss %', type: 'number', min: 1, max: 100, step: 0.5 },
  { key: 'max_portfolio_pct_per_instrument', label: 'Max % Per Instrument', type: 'number', min: 1, max: 100, step: 0.5 },
  { key: 'max_vol_adjusted_exposure_pct', label: 'Max Vol Exposure %', type: 'number', min: 0.1, max: 20, step: 0.1 },
];
const CIRCUIT_FIELDS = [
  { key: 'max_drawdown_pct', label: 'Max Drawdown %', type: 'number', min: 1, max: 50, step: 0.5 },
];

const inputClass =
  'rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm px-2 py-1 w-full';

export function SettingsModal({ isOpen, onClose, settings, strategies, onSave, loadSettings, showToast, backendUnreachable }) {
  const [strategyId, setStrategyId] = useState(settings?.strategy_id || 'multi_asset');
  const [strategy, setStrategy] = useState(settings?.strategy || {});
  const [risk, setRisk] = useState(settings?.risk || {});
  const [circuit, setCircuit] = useState(settings?.circuit || {});
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoadError(false);
    if (loadSettings) {
      loadSettings().catch(() => setLoadError(true));
    }
  }, [isOpen, loadSettings]);

  useEffect(() => {
    setStrategyId(settings?.strategy_id || 'multi_asset');
    setStrategy(settings?.strategy || {});
    setRisk(settings?.risk || {});
    setCircuit(settings?.circuit || {});
  }, [settings]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const updateStrategy = (key, value) => setStrategy((s) => ({ ...s, [key]: value }));
  const updateRisk = (key, value) => setRisk((r) => ({ ...r, [key]: value }));
  const updateCircuit = (key, value) => setCircuit((c) => ({ ...c, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await api.updateSettings({
        strategy_id: strategyId,
        strategy,
        risk,
        circuit,
      });
      if (result && result.ok === false) {
        showToast?.(result.error || 'Save failed', true);
        return;
      }
      onSave?.();
      showToast?.('Settings saved');
      onClose();
    } catch (err) {
      const message = err?.message || err?.data?.error || 'Failed to save settings';
      showToast?.(message, true);
      console.warn('Save settings failed', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const rawOptions = Array.isArray(strategies?.options) ? strategies.options : [];
  const optionIds = rawOptions.map((o) => (typeof o === 'string' ? o : o?.id)).filter(Boolean);
  const idToLabel = rawOptions.reduce((acc, o) => {
    if (typeof o === 'string') acc[o] = o;
    else if (o && o.id != null) acc[o.id] = o.label ?? o.id;
    return acc;
  }, {});
  const options = optionIds.includes(strategyId) ? optionIds : [strategyId, ...optionIds];
  const safeStrategy = strategy != null && typeof strategy === 'object' ? strategy : {};
  const safeRisk = risk != null && typeof risk === 'object' ? risk : {};
  const safeCircuit = circuit != null && typeof circuit === 'object' ? circuit : {};

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-xl p-5">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-base font-semibold text-gray-900 dark:text-white">Settings</span>
          <button type="button" onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded">
            &times;
          </button>
        </div>
        {(backendUnreachable || loadError) && (
          <div className="mb-4 px-3 py-2 rounded text-sm bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
            Trading Bot server is not reachable. Start it with <code className="text-xs bg-amber-200/50 dark:bg-amber-800/50 px-1 rounded">npm run trading-bot:server</code> to load and save settings.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs font-semibold uppercase text-sky-500 dark:text-sky-400 mb-2">Strategy</div>
            <div className="space-y-2 mb-2">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Strategy</label>
                <select
                  value={strategyId}
                  onChange={(e) => setStrategyId(e.target.value)}
                  className={inputClass}
                >
                  {options.map((id) => (
                    <option key={id} value={id}>{idToLabel[id] ?? id}</option>
                  ))}
                </select>
              </div>
              {STRATEGY_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">{f.label}</label>
                  <input
                    type={f.type}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={safeStrategy[f.key] ?? ''}
                    onChange={(e) => updateStrategy(f.key, e.target.value === '' ? undefined : Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-sky-500 dark:text-sky-400 mb-2">Risk</div>
            <div className="space-y-2">
              {RISK_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">{f.label}</label>
                  <input
                    type={f.type}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={safeRisk[f.key] ?? ''}
                    onChange={(e) => updateRisk(f.key, e.target.value === '' ? undefined : Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-sky-500 dark:text-sky-400 mb-2">Circuit Breaker</div>
            <div className="space-y-2">
              {CIRCUIT_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">{f.label}</label>
                  <input
                    type={f.type}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={safeCircuit[f.key] ?? ''}
                    onChange={(e) => updateCircuit(f.key, e.target.value === '' ? undefined : Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || backendUnreachable}
            className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
