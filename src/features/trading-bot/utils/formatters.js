/**
 * Formatting and session utilities for the Trading Bot dashboard.
 * Ported from quantbot/static/js/dashboard.js
 */

const EN_DASH = '\u2014';

/**
 * @param {number|null|undefined|string} v
 * @param {number} [dec]
 * @returns {string}
 */
export function fmt(v, dec = 2) {
  if (v == null || v === '') return EN_DASH;
  const n = Number(v);
  if (Number.isNaN(n)) return EN_DASH;
  return n.toFixed(dec != null ? dec : 2);
}

/**
 * @param {number|null|undefined} v
 * @returns {string}
 */
export function fmtPrice(v) {
  if (v == null) return EN_DASH;
  const n = Number(v);
  if (Number.isNaN(n)) return EN_DASH;
  if (n >= 100) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return n.toFixed(5);
}

/**
 * @param {number|null|undefined} v
 * @returns {string}
 */
export function fmtPnl(v) {
  if (v == null) return EN_DASH;
  const n = Number(v);
  if (Number.isNaN(n)) return EN_DASH;
  return (n >= 0 ? '+' : '') + n.toFixed(2);
}

/**
 * @param {number|null|undefined} v - decimal (e.g. 0.05 for 5%)
 * @returns {string}
 */
export function fmtPct(v) {
  if (v == null) return EN_DASH;
  const n = Number(v);
  if (Number.isNaN(n)) return EN_DASH;
  return (n * 100).toFixed(2) + '%';
}

/**
 * @param {string|number|Date|null|undefined} iso
 * @returns {string}
 */
export function fmtTime(iso) {
  if (!iso) return EN_DASH;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

/**
 * @param {number|null|undefined} v
 * @returns {string}
 */
export function formatVolume(v) {
  if (v == null) return EN_DASH;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return String(v);
}

/**
 * Convert bar from API to lightweight-charts format.
 * @param {{ time: string|number, open: number, high: number, low: number, close: number }} bar
 * @returns {{ time: number, open: number, high: number, low: number, close: number }|null}
 */
export function toChartBar(bar) {
  if (!bar) return null;
  let t = bar.time;
  if (typeof t === 'string') t = Math.floor(new Date(t).getTime() / 1000);
  if (typeof t !== 'number' || Number.isNaN(t)) return null;
  return {
    time: t,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}

/**
 * Deduplicate and sort bars by time.
 * @param {{ time: number }[]} bars
 * @returns {{ time: number }[]}
 */
export function dedupBars(bars) {
  if (!Array.isArray(bars)) return [];
  const seen = {};
  const out = [];
  for (let i = 0; i < bars.length; i++) {
    if (bars[i] && !seen[bars[i].time]) {
      seen[bars[i].time] = true;
      out.push(bars[i]);
    }
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

/** Candle durations in seconds per timeframe */
export const CANDLE_DURATIONS = { '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };

/**
 * Get countdown to next candle open (seconds remaining, progress 0–1, next open time).
 * @param {string} timeframe - e.g. '30m', '1h', '4h', '1d'
 * @returns {{ remainingSec: number, progress: number, nextOpenTime: Date, countdownStr: string }}
 */
export function getCandleCountdown(timeframe) {
  const duration = CANDLE_DURATIONS[timeframe];
  if (!duration) {
    return { remainingSec: 0, progress: 0, nextOpenTime: new Date(), countdownStr: '' };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const elapsed = nowSec % duration;
  const remaining = duration - elapsed;
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const parts = [];
  if (hours > 0) parts.push(String(hours).padStart(2, '0'));
  parts.push(String(minutes).padStart(2, '0'));
  parts.push(String(seconds).padStart(2, '0'));
  const countdownStr = parts.join(':');
  const nextOpenTime = new Date((nowSec + remaining) * 1000);
  const progress = elapsed / duration;
  return { remainingSec: remaining, progress, nextOpenTime, countdownStr };
}

/**
 * Session info for Asian / London / New York (client-side UTC).
 * @returns {{ name: string, progress: number, time_remaining_sec: number, active: boolean }}
 */
export function getSessionInfoClient() {
  const now = new Date();
  const totalMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (totalMin >= 0 && totalMin < 8 * 60) {
    const elapsed = totalMin;
    const durationMin = 8 * 60;
    return {
      name: 'Asian',
      progress: elapsed / durationMin,
      time_remaining_sec: (durationMin - elapsed) * 60,
      active: true,
    };
  }
  if (totalMin >= 8 * 60 && totalMin < 16 * 60) {
    const elapsedL = totalMin - 8 * 60;
    const durationL = 8 * 60;
    return {
      name: 'London',
      progress: elapsedL / durationL,
      time_remaining_sec: (durationL - elapsedL) * 60,
      active: true,
    };
  }
  if (totalMin >= 13 * 60 + 30 && totalMin < 20 * 60) {
    const elapsedN = totalMin - (13 * 60 + 30);
    const durationN = 6.5 * 60;
    return {
      name: 'New York',
      progress: Math.min(1, elapsedN / durationN),
      time_remaining_sec: Math.max(0, (durationN - elapsedN) * 60),
      active: true,
    };
  }
  return { name: 'Closed', progress: 0, time_remaining_sec: 0, active: false };
}

/**
 * Format session time remaining for display.
 * @param {{ time_remaining_sec: number, active: boolean }} info
 * @returns {string}
 */
export function formatSessionTimeRemaining(info) {
  if (!info.active || info.time_remaining_sec <= 0) {
    return info.active ? 'Active' : EN_DASH;
  }
  const m = Math.floor(info.time_remaining_sec / 60);
  const s = info.time_remaining_sec % 60;
  return `${m}m ${s}s left`;
}
