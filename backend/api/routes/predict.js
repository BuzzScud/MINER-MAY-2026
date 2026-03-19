import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const TICKER_MAX_LEN = 20;
const TICKER_PATTERN = /^[A-Za-z0-9.\-]+$/;

const PI = Math.PI;
const PHI = 1.6180339887498948;
const PI_TIMES_PHI = PI * PHI;
const FIB_RETRACEMENTS = [0.236, 0.382, 0.5, 0.618, 0.786];
// Exact Custom Math PHI_EXTENSIONS (see custom_math/constants.py)
const PHI_EXTENSIONS = [4.24, 5.08, 6.86, 11.01, 17.94, 29.03, 47];
// All checked phi/fibonacci extension ratios (from UI screenshot)
const PHI_EXTENSION_RATIOS = [0, 0.5, 1, 1.382, 1.618, 2.382, 2.618, 3.382, 3.618, 4.24, 5.08, 6.86, 11.01, 17.94];
// Key price targets: swing low (0), swing high (1), then the 5 extension levels
const KEY_PHI_TARGET_RATIOS = [0, 1, 1.382, 2.382, 3.382, 4.24, 5.08];
// Trading hours per day (used to annualise intraday volatility correctly)
const TRADING_HOURS_PER_DAY = 6.5;
// Bars per interval type — 1h bars use 6.5 bars/day, daily bars use 1
const BARS_PER_DAY = { '1h': TRADING_HOURS_PER_DAY, '1d': 1 };
// Chart lookback: show the most recent N bars in the historical series sent to the UI
const CHART_LOOKBACK_BARS = 120; // ~18 trading days at 1H
// Swing lookback expressed in trading days (scaled to bars inside the model)
const SWING_LOOKBACK_DAYS = 10;
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

function getESTNow() {
  const now = new Date();
  const estString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  return new Date(estString);
}

function getTradingDaysToFriday(estDate) {
  const day = estDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  if (day < 1 || day > 5) return 0;
  // Inclusive count from today through Friday (Mon=1 -> 5 days, Fri=5 -> 1 day)
  return 6 - day;
}

function formatDateEST(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // YYYY-MM-DD
}

// Returns "MM/DD HH:00" in EST — used for 1H chart x-axis labels
function formatDatetimeEST(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

// Fetch the first trading day candle of the current year using daily YTD data.
// Mirrors the FibStuff anchor logic: bullish candles use [low, high], bearish invert it.
async function fetchFirstYearlyCandle(ticker, assetType) {
  let symbol = ticker.toUpperCase();
  if (assetType === 'crypto' && !symbol.endsWith('-USD')) {
    symbol = `${symbol}-USD`;
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=ytd&interval=1d&includeAdjustedClose=true`;

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance error (yearly anchor): HTTP ${res.status}`);
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    throw new Error('Invalid data from Yahoo Finance (yearly anchor)');
  }

  const quote = result.indicators?.quote?.[0];
  const timestamps = result.timestamp || [];
  if (!quote || !timestamps.length) {
    throw new Error('No historical data available (yearly anchor)');
  }

  const opens = quote.open || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const closes = quote.close || [];

  const currentYear = new Date().getFullYear();
  const yearCandles = [];

  for (let i = 0; i < timestamps.length; i += 1) {
    const ts = timestamps[i];
    const date = new Date(ts * 1000);
    if (date.getFullYear() === currentYear) {
      yearCandles.push({
        index: i,
        date,
        timestamp: ts,
        open: opens[i],
        high: highs[i],
        low: lows[i],
        close: closes[i],
      });
    }
  }

  if (!yearCandles.length) {
    throw new Error('No data available for current year (yearly anchor)');
  }

  yearCandles.sort((a, b) => a.timestamp - b.timestamp);
  const firstCandle = yearCandles[0];
  if (
    firstCandle.high == null ||
    firstCandle.low == null ||
    firstCandle.open == null ||
    firstCandle.close == null
  ) {
    throw new Error('Invalid first trading day data (yearly anchor)');
  }

  const isBullish = firstCandle.close > firstCandle.open;
  const fibHigh = Math.max(Number(firstCandle.high), Number(firstCandle.low));
  const fibLow = Math.min(Number(firstCandle.high), Number(firstCandle.low));

  return {
    fibHigh,
    fibLow,
    isBullish,
    anchorDate: firstCandle.date,
  };
}

// interval: '1h' (default) or '1d'
async function fetchHistoricalFromYahoo(ticker, assetType, interval = '1h') {
  let symbol = ticker.toUpperCase();
  if (assetType === 'crypto' && !symbol.endsWith('-USD')) {
    symbol = `${symbol}-USD`;
  }

  // Yahoo Finance supports 1h data up to 730 days, but 60d gives clean recent data.
  // Daily data uses a full year for robust trend computation.
  const rangeByInterval = { '1h': '60d', '1d': '365d' };
  const range = rangeByInterval[interval] || '60d';
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

function predictWithCrystalline(series, horizonDays, barsPerDay = TRADING_HOURS_PER_DAY, fibAnchor, assetType = 'stock') {
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
  const stdAll = Math.sqrt(sumSq / Math.max(1, n));
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
      .reduce((a, b) => a + b * b, 0) / Math.max(1, half),
  );
  const std2 = Math.sqrt(
    closes
      .slice(half)
      .map((v) => v - mean2)
      .reduce((a, b) => a + b * b, 0) / Math.max(1, n - half),
  );
  const volDiff = std2 - std1;
  const volDiffPct = meanAll > 0 ? (volDiff / meanAll) * 100 : 0;
  const volScore = volDiffPct < -2.5 ? 1 : volDiffPct > 2.5 ? -1 : 0;

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

  // Swing high/low from closes only — internal Crystalline swing (signal.py recent_swing_high_low)
  const lookback = Math.min(Math.round(SWING_LOOKBACK_DAYS * barsPerDay), n);
  let swingHighInternal = -Infinity;
  let swingLowInternal = Infinity;
  for (let i = n - lookback; i < n; i += 1) {
    if (closes[i] > swingHighInternal) swingHighInternal = closes[i];
    if (closes[i] < swingLowInternal) swingLowInternal = closes[i];
  }
  let spanInternal = swingHighInternal - swingLowInternal;
  if (!Number.isFinite(spanInternal) || spanInternal <= 0) {
    spanInternal = currentPrice * 0.01;
  }

  // Fib anchor from yearly first candle (FibStuff) — used for all displayed fib/extension/target levels.
  const hasFibAnchor = fibAnchor && Number.isFinite(fibAnchor.fibHigh) && Number.isFinite(fibAnchor.fibLow);
  let fibHigh = hasFibAnchor ? fibAnchor.fibHigh : swingHighInternal;
  let fibLow = hasFibAnchor ? fibAnchor.fibLow : swingLowInternal;
  let fibSpan = fibHigh - fibLow;
  if (!Number.isFinite(fibSpan) || fibSpan <= 0) {
    fibHigh = swingHighInternal;
    fibLow = swingLowInternal;
    fibSpan = spanInternal;
  }

  // Fib retracements for Crystalline confluence checks still use thesis convention (from high down).
  const swingHigh = swingHighInternal;
  const swingLow = swingLowInternal;
  let span = spanInternal;
  if (!Number.isFinite(span) || span <= 0) {
    span = currentPrice * 0.01;
  }
  // Fib retracements: high - ratio * span — matches fibonacci.py and golden_ratio.py
  // 0.236 is near the top (premium), 0.786 is near the bottom (deep discount/OTE)
  const fibLevels = {};
  for (const r of FIB_RETRACEMENTS) {
    fibLevels[r] = swingHigh - r * span;
  }
  // Equilibrium: (high + low) / 2 — matches fibonacci.py equilibrium_50
  const eq50 = (swingHigh + swingLow) / 2;
  // Discount zone: price below the 50% equilibrium — matches fibonacci.py in_discount_zone
  const inDiscount = currentPrice <= eq50;
  // OTE zone: price near the 0.618 or 0.786 retracement (lower portion of range)
  // Matches fibonacci.py price_in_ote_zone: abs(price - level) / abs(level) <= 2%
  const FIB_TOLERANCE = 0.02;
  const nearLevel = (price, level) =>
    Math.abs(level) > 1e-12
      ? Math.abs(price - level) / Math.abs(level) <= FIB_TOLERANCE
      : Math.abs(price - level) <= FIB_TOLERANCE * Math.abs(swingHigh);
  const inOte = nearLevel(currentPrice, fibLevels[0.618]) || nearLevel(currentPrice, fibLevels[0.786]);
  const fibBullConfluence = inDiscount || inOte;
  // Bear confluence: in premium zone or near 0.382 retracement (upper portion)
  const fibBearConfluence =
    currentPrice >= eq50 || nearLevel(currentPrice, fibLevels[0.382]);

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
    // Annualise correctly: 252 trading days × barsPerDay bars per day
    volAnnual = rStd * Math.sqrt(252 * barsPerDay);
  }

  const atrScale = stdAll > 0 ? stdAll : currentPrice * 0.01;
  const horizonAnnual = horizonDays / 252;
  const volHorizon = volAnnual * Math.sqrt(Math.max(horizonAnnual, 0));
  const ext = PHI_EXTENSIONS[0];
  const phaseMod = 1 + 0.1 * Math.cos(theta);
  const targetDelta = ext * atrScale * phaseMod;
  const directionMult = crystallineScore >= 0 ? 1 : -1;
  const phiTarget = currentPrice + directionMult * targetDelta;

  // trendStrength: normalized to [0, 1] — proportion of the trend threshold reached.
  // It must not exceed 1 since it drives linear interpolation toward phiTarget.
  const trendStrength = Math.min(1, Math.abs(meanDiffPct) / Math.max(1, TREND_PCT_HIGH));
  // horizonFraction: 1 week (5 trading days) = full horizon = 1.0. Capped at 1.
  const horizonFraction = Math.min(1, horizonDays > 0 ? horizonDays / 5 : 0);
  // interp is always in [0, 1]: fraction of the way from currentPrice to phiTarget.
  const interp = trendStrength * horizonFraction;
  const predictedPrice = currentPrice + (phiTarget - currentPrice) * interp;
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

  const days = [];
  for (let d = 1; d <= horizonDays; d += 1) days.push(d);
  const t = days.map((d) => d / Math.max(1, horizonDays));
  const center = t.map(
    (tv) => currentPrice + (predictedPrice - currentPrice) * tv ** 0.7,
  );
  const bandWidth = currentPrice * volHorizon;
  const upperBand = center.map((c, idx) => c + bandWidth * Math.sqrt(t[idx]));
  const lowerBand = center.map((c, idx) => c - bandWidth * Math.sqrt(t[idx]));

  const lastDate = series[n - 1].date;
  const isCrypto = assetType === 'crypto';
  const predictedDates = [];
  {
    let cursor = new Date(lastDate.getTime());
    let added = 0;
    while (added < horizonDays) {
      cursor.setDate(cursor.getDate() + 1);
      if (!isCrypto) {
        const day = cursor.getDay();
        if (day === 0 || day === 6) continue;
      }
      predictedDates.push(formatDateEST(cursor));
      added += 1;
    }
  }
  // UI fib levels from yearly anchor: price = fibLow + ratio * fibSpan (0=low, 1=high, >1=extension)
  const fibLevelsDict = {};
  for (const r of FIB_RETRACEMENTS) {
    const level = fibLow + r * fibSpan;
    fibLevelsDict[String(r)] = Number(level.toFixed(4));
  }
  const fibPricesForChart = FIB_RETRACEMENTS.map((r) => fibLevelsDict[String(r)]);

  // Extension levels follow FibStuff.jsx convention:
  //   price = swingLow + ratio * span  (0=low, 1=high, ratio>1 extends above high)
  // Bearish extensions:
  //   price = swingLow - ratio * span  (ratio<0 in FibStuff, here expressed as positive subtraction)
  const phiExtensionLevels = PHI_EXTENSION_RATIOS.map((ratio) => ({
    ratio,
    bullish: Number((fibLow + ratio * fibSpan).toFixed(4)),
    bearish: Number((fibLow - ratio * fibSpan).toFixed(4)),
  }));

  // The 5 key price targets — highlighted prominently in the UI
  const keyPhiTargets = KEY_PHI_TARGET_RATIOS.map((ratio) => ({
    ratio,
    bullish: Number((fibLow + ratio * fibSpan).toFixed(4)),
    bearish: Number((fibLow - ratio * fibSpan).toFixed(4)),
  }));

  const volatilityAnnual = volAnnual;

  const firstTarget = predictedPrice;
  const firstTargetPct = pctChange;

  return {
    current_price: currentPrice,
    first_target: Number(firstTarget.toFixed(4)),
    first_target_pct: Number(firstTargetPct.toFixed(6)),
    predicted_price: Number(predictedPrice.toFixed(4)),
    pct_change: Number(pctChange.toFixed(6)),
    // Confidence is capped at 100 since it represents a percentage.
    confidence: Number(Math.min(100, confidence).toFixed(1)),
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
    phi_extension_levels: phiExtensionLevels,
    key_phi_targets: keyPhiTargets,
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
    const estToday = getESTNow();
    let horizonDays = getTradingDaysToFriday(estToday);
    if (!Number.isFinite(horizonDays) || horizonDays <= 0) {
      horizonDays = 1;
    }

    // Always use 1H data for intraday-level swing precision
    const dataInterval = '1h';
    const barsPerDay = BARS_PER_DAY[dataInterval];
    const series = await fetchHistoricalFromYahoo(ticker, assetType, dataInterval);
    const closes = series.map((s) => s.close);

    // Yearly fib anchor from the first trading day candle of the current year (daily YTD)
    const yearlyAnchor = await fetchFirstYearlyCandle(ticker, assetType);

    // Limit the historical series sent to the chart to the most recent bars
    const chartSeries = series.slice(Math.max(0, series.length - CHART_LOOKBACK_BARS));
    const historicalDates = chartSeries.map((s) => formatDatetimeEST(s.date));
    const historicalPrices = chartSeries.map((s) => Number(s.close.toFixed(4)));

    const out = predictWithCrystalline(series, horizonDays, barsPerDay, yearlyAnchor, assetType);
    out.current_price = closes[closes.length - 1];
    out.historical_dates = historicalDates;
    out.historical_prices = historicalPrices;
    out.interval = dataInterval;
    out.fib_anchor_date = formatDateEST(yearlyAnchor.anchorDate);
    out.fib_anchor_bullish = yearlyAnchor.isBullish;

    const pct = out.pct_change * 100;
    const dirLabel = out.direction === 'bullish' ? 'Bullish' : 'Bearish';
    out.summary = `${dirLabel} outlook: ${ticker} is projected to move ${pct.toFixed(
      1,
    )}% over the rest of this trading week (Mon–Fri, EST) with ${Math.round(
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

