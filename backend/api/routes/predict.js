import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const TICKER_MAX_LEN = 20;
const TICKER_PATTERN = /^[A-Za-z0-9.\-]+$/;

const PI = Math.PI;
const PHI = 1.6180339887498948;
const PI_TIMES_PHI = PI * PHI;
const FIB_RETRACEMENTS = [0.236, 0.382, 0.5, 0.618, 0.786];
const PHI_EXTENSIONS = [PHI ** 3, PI_TIMES_PHI, PHI ** 4, PHI ** 5, PHI ** 6, PHI ** 7, PHI ** 8];
const TREND_PCT_HIGH = 2.5;
const TREND_PCT_LOW = -2.5;
const PRIME_POSITIONS = new Set([3, 6, 9]);

function validateTicker(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Ticker is required');
  }
  const cleaned = raw.trim().toUpperCase().slice(0, TICKER_MAX_LEN);
  if (!cleaned) throw new Error('Ticker is required');
  const base = cleaned.replace('-USD', '') || cleaned;
  if (!TICKER_PATTERN.test(base)) {
    throw new Error('Ticker contains invalid characters');
  }
  return cleaned;
}

async function fetchHistoricalFromYahoo(ticker, assetType, periodDays = 365) {
  let symbol = ticker.toUpperCase();
  if (assetType === 'crypto' && !symbol.endsWith('-USD')) {
    symbol = `${symbol}-USD`;
  }

  // Use Yahoo chart API similar to the frontend proxy
  const range = `${periodDays}d`;
  const interval = '1d';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includeAdjustedClose=true`;

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance error: HTTP ${res.status}`);
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    throw new Error('Invalid data from Yahoo Finance');
  }
  const quote = result.indicators?.quote?.[0];
  const timestamps = result.timestamp || [];
  if (!quote || !timestamps.length) {
    throw new Error('No historical data available');
  }

  const closes = quote.close || [];
  const highs = quote.high || closes;
  const lows = quote.low || closes;

  const series = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const c = closes[i];
    if (c == null || Number.isNaN(c)) continue;
    series.push({
      date: new Date(timestamps[i] * 1000),
      close: Number(c),
      high: highs[i] != null ? Number(highs[i]) : Number(c),
      low: lows[i] != null ? Number(lows[i]) : Number(c),
    });
  }

  if (series.length < 20) {
    throw new Error('Insufficient history for Crystalline model (need at least 20 points)');
  }

  return series;
}

function predictWithCrystalline(series, horizonDays) {
  const n = series.length;
  const closes = series.map((s) => s.close);
  const highs = series.map((s) => s.high);
  const lows = series.map((s) => s.low);

  const currentPrice = closes[n - 1];
  let meanAll = closes.reduce((a, b) => a + b, 0) / n;
  let sumSq = 0;
  for (let i = 0; i < n; i += 1) {
    const d = closes[i] - meanAll;
    sumSq += d * d;
  }
  const stdAll = Math.sqrt(sumSq / Math.max(1, n - 1));
  if (meanAll <= 0) meanAll = currentPrice;

  const half = Math.floor(n / 2);
  const mean1 =
    closes.slice(0, half).reduce((a, b) => a + b, 0) / Math.max(1, half);
  const mean2 =
    closes.slice(half).reduce((a, b) => a + b, 0) / Math.max(1, n - half);
  const meanDiffPct = ((mean2 - mean1) / meanAll) * 100;
  let trend;
  if (meanDiffPct > TREND_PCT_HIGH) trend = 2;
  else if (meanDiffPct > 0) trend = 1;
  else if (meanDiffPct > TREND_PCT_LOW) trend = -1;
  else trend = -2;

  const std1 = Math.sqrt(
    closes
      .slice(0, half)
      .map((v) => v - mean1)
      .reduce((a, b) => a + b * b, 0) / Math.max(1, half - 1),
  );
  const std2 = Math.sqrt(
    closes
      .slice(half)
      .map((v) => v - mean2)
      .reduce((a, b) => a + b * b, 0) / Math.max(1, n - half - 1),
  );
  const volDiff = std2 - std1;
  const volDiffPct = meanAll ? (volDiff / meanAll) * 100 : 0;
  const volScore = volDiffPct < -2 ? 1 : volDiffPct > 2 ? -1 : 0;

  const riskRatio = meanAll ? stdAll / meanAll : 0.1;
  const riskScore = riskRatio < 0.05 ? 1 : riskRatio > 0.15 ? -1 : 0;
  const crystallineScore = trend + volScore + riskScore;

  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);
  let spanPrice = maxClose - minClose;
  if (spanPrice <= 0) spanPrice = 1;
  const normalized = (currentPrice - minClose) / spanPrice;
  const position = (Math.floor(normalized * 12) % 12 + 12) % 12;
  const onPrime = PRIME_POSITIONS.has(position);
  const theta = (2 * PI * position) / 12;
  const positionContinuous = normalized * 12;
  const modVal = positionContinuous % PI_TIMES_PHI;
  const piPhiResonance =
    Math.abs(modVal) < 0.5 || Math.abs(modVal - PI_TIMES_PHI) < 0.5;

  const lookback = Math.min(30, n);
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  for (let i = n - lookback; i < n; i += 1) {
    if (highs[i] > swingHigh) swingHigh = highs[i];
    if (lows[i] < swingLow) swingLow = lows[i];
  }
  let span = swingHigh - swingLow;
  if (!Number.isFinite(span) || span <= 0) {
    span = currentPrice * 0.01;
  }
  const fibLevels = {};
  for (const r of FIB_RETRACEMENTS) {
    fibLevels[r] = swingHigh - r * span;
  }
  const eq50 = (swingHigh + swingLow) / 2;
  const inDiscount = currentPrice <= eq50;
  const inOte =
    Math.abs(currentPrice - fibLevels[0.618]) < 0.02 * span ||
    Math.abs(currentPrice - fibLevels[0.786]) < 0.02 * span;
  const fibBullConfluence = inDiscount || inOte;
  const fibBearConfluence =
    currentPrice >= eq50 ||
    Math.abs(currentPrice - fibLevels[0.382]) < 0.02 * span;

  const returns = [];
  for (let i = 1; i < n; i += 1) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (prev > 0 && Number.isFinite(curr)) {
      returns.push((curr - prev) / prev);
    }
  }
  let volAnnual = 0.15;
  if (returns.length) {
    const rMean = returns.reduce((a, b) => a + b, 0) / returns.length;
    let rVar = 0;
    for (let i = 0; i < returns.length; i += 1) {
      const d = returns[i] - rMean;
      rVar += d * d;
    }
    const rStd = Math.sqrt(rVar / Math.max(1, returns.length - 1));
    volAnnual = rStd * Math.sqrt(252);
  }

  const atrScale = stdAll > 0 ? stdAll : currentPrice * 0.01;
  const horizonAnnual = horizonDays / 252;
  const volHorizon = volAnnual * Math.sqrt(Math.max(horizonAnnual, 0));
  const ext = PHI_EXTENSIONS[0];
  const phaseMod = 1 + 0.1 * Math.cos(theta);
  const targetDelta = (ext / 100) * atrScale * phaseMod;
  const directionMult = crystallineScore >= 0 ? 1 : -1;
  const phiTarget = currentPrice + directionMult * targetDelta;

  const trendStrength = Math.min(
    2,
    Math.abs(meanDiffPct) / Math.max(1, TREND_PCT_HIGH),
  );
  let targetPrice =
    currentPrice +
    (phiTarget - currentPrice) *
      Math.min(1, trendStrength * 0.5 * (horizonDays / 30));
  targetPrice = Math.min(currentPrice * 2, Math.max(currentPrice * 0.5, targetPrice));
  const predictedPrice = targetPrice;
  const pctChange = (predictedPrice - currentPrice) / currentPrice;
  const direction = pctChange >= 0 ? 'bullish' : 'bearish';

  const scoreStrength = Math.min(1, Math.abs(crystallineScore) / 4);
  const primeBoost = onPrime ? 0.08 : 0;
  const fibBoost =
    crystallineScore >= 0 && fibBullConfluence
      ? 0.06
      : crystallineScore < 0 && fibBearConfluence
      ? 0.06
      : 0;
  const resonanceBoost = piPhiResonance ? 0.05 : 0;
  const volPenalty = riskRatio < 0.15 ? 0 : -0.1;
  let confidence =
    50 +
    scoreStrength * 35 +
    primeBoost * 100 +
    fibBoost * 100 +
    resonanceBoost * 100 +
    volPenalty * 100;
  confidence = Math.min(95, Math.max(40, confidence));

  const days = [];
  for (let d = 1; d <= horizonDays; d += 1) days.push(d);
  const t = days.map((d) => d / Math.max(1, horizonDays));
  const center = t.map(
    (tv) => currentPrice + (predictedPrice - currentPrice) * tv ** 0.7,
  );
  const bandWidth = currentPrice * volHorizon * 0.6;
  const upperBand = center.map((c, idx) => c + bandWidth * (1 - t[idx] * 0.3));
  const lowerBand = center.map((c, idx) => c - bandWidth * (1 - t[idx] * 0.3));

  const lastDate = series[n - 1].date;
  const predictedDates = days.map((d) => {
    const next = new Date(lastDate.getTime());
    next.setDate(next.getDate() + d);
    return next.toISOString().slice(0, 10);
  });
  const fibPricesForChart = FIB_RETRACEMENTS.map((r) => fibLevels[r]);
  const fibLevelsDict = {};
  for (const r of FIB_RETRACEMENTS) {
    fibLevelsDict[String(r)] = Number(fibLevels[r].toFixed(4));
  }

  let sumClose = 0;
  for (const c of closes) sumClose += c;
  let prev = closes[0];
  let sqSum = 0;
  for (let i = 0; i < closes.length; i += 1) {
    const d = closes[i] - meanAll;
    sqSum += d * d;
    prev = closes[i];
  }
  const volatilityAnnual = volAnnual;

  return {
    current_price: currentPrice,
    predicted_price: Number(predictedPrice.toFixed(4)),
    pct_change: Number(pctChange.toFixed(6)),
    confidence: Number(confidence.toFixed(1)),
    direction,
    predicted_dates: predictedDates,
    predicted_prices: center.map((p) => Number(p.toFixed(4))),
    upper_band: upperBand.map((p) => Number(p.toFixed(4))),
    lower_band: lowerBand.map((p) => Number(p.toFixed(4))),
    fib_levels: fibPricesForChart.map((p) => Number(p.toFixed(4))),
    crystalline_score: crystallineScore,
    trend_score: trend,
    vol_score: volScore,
    risk_score: riskScore,
    risk_ratio: Number(riskRatio.toFixed(6)),
    volatility_annual: Number(volatilityAnnual.toFixed(4)),
    clock_position: position,
    on_prime: onPrime,
    fib_bull_confluence: fibBullConfluence,
    fib_bear_confluence: fibBearConfluence,
    swing_high: Number(swingHigh.toFixed(4)),
    swing_low: Number(swingLow.toFixed(4)),
    fib_levels_dict: fibLevelsDict,
    phi_target: Number(phiTarget.toFixed(4)),
    mean_diff_pct: Number(meanDiffPct.toFixed(2)),
    pi_phi_resonance: piPhiResonance,
  };
}

router.post('/', async (req, res) => {
  try {
    if (req.headers['content-type'] && !req.headers['content-type'].includes('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
    const body = req.body || {};
    const ticker = validateTicker(body.ticker || 'AAPL');
    let assetType = (body.asset_type || 'stock').toString().trim().toLowerCase();
    if (assetType !== 'stock' && assetType !== 'crypto') {
      assetType = 'stock';
    }
    const horizonMap = { '7': 7, '30': 30, '90': 90 };
    const horizonRaw = (body.horizon ?? '30').toString().trim();
    const horizonDays = horizonMap[horizonRaw] || 30;

    const series = await fetchHistoricalFromYahoo(ticker, assetType, 365);
    const closes = series.map((s) => s.close);
    const historicalDates = series.map((s) => s.date.toISOString().slice(0, 10));

    const out = predictWithCrystalline(series, horizonDays);
    out.current_price = closes[closes.length - 1];
    out.historical_dates = historicalDates;
    out.historical_prices = closes.map((c) => Number(c.toFixed(4)));

    const pct = out.pct_change * 100;
    const dirLabel = out.direction === 'bullish' ? 'Bullish' : 'Bearish';
    out.summary = `${dirLabel} outlook: ${ticker} is projected to move ${pct.toFixed(
      1,
    )}% over the next ${horizonDays} days with ${Math.round(
      out.confidence,
    )}% model confidence.`;

    return res.json(out);
  } catch (err) {
    const message = err?.message || 'Prediction failed. Please try again.';
    const status = message.toLowerCase().includes('ticker') ? 400 : 400;
    return res.status(status).json({ error: message });
  }
});

export default router;

