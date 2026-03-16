/**
 * Market Oracle - Frontend: form submit, API call, chart, metrics. Auto-loads QQQ on init.
 */

const NEON_GREEN = '#00ff88';
const NEON_RED = '#ff4444';

let chartInstance = null;

function formatCurrency(value) {
  if (value == null || isNaN(value)) return '—';
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(2) + 'M';
  if (value >= 1e3) return '$' + value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '$' + Number(value).toFixed(4);
}

function formatPercent(value) {
  if (value == null || isNaN(value)) return '—';
  const pct = value * 100;
  const sign = pct >= 0 ? '+' : '';
  return sign + pct.toFixed(2) + '%';
}

function showToast(message, isError) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg z-30 text-sm font-medium ' +
    (isError ? 'bg-neonRed/20 text-red-300 border border-red-500/50' : 'bg-neonGreen/20 text-green-300 border border-neonGreen/50');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function () {
    toast.remove();
  }, 4000);
}

function setLoading(active) {
  const overlay = document.getElementById('loadingOverlay');
  const btn = document.getElementById('submitBtn');
  if (overlay) overlay.classList.toggle('active', !!active);
  if (btn) {
    btn.disabled = !!active;
    btn.textContent = active ? 'Running…' : 'Run Prediction';
  }
}

function hideChartPlaceholder() {
  const el = document.getElementById('chartPlaceholder');
  if (el) el.style.display = 'none';
}

function showChartPlaceholder(label) {
  const el = document.getElementById('chartPlaceholder');
  if (!el) return;
  el.style.display = 'flex';
  const span = el.querySelector('span');
  if (span) span.textContent = label || 'Loading…';
}

function setText(id, value) {
  var el = document.getElementById(id);
  if (el) el.textContent = value != null && value !== '' ? String(value) : '—';
}

function displayResults(data, tickerLabel) {
  const currentEl = document.getElementById('currentPrice');
  const predictedEl = document.getElementById('predictedPrice');
  const pctVal = document.getElementById('pctChangeVal');
  const arrowEl = document.getElementById('directionArrow');
  const confidenceVal = document.getElementById('confidenceVal');
  const confidenceBar = document.getElementById('confidenceBar');
  const summaryEl = document.getElementById('summaryText');
  const chartTickerEl = document.getElementById('chartTicker');

  if (currentEl) currentEl.textContent = formatCurrency(data.current_price);
  if (predictedEl) predictedEl.textContent = formatCurrency(data.predicted_price);
  if (pctVal) {
    pctVal.textContent = formatPercent(data.pct_change);
    pctVal.style.color = data.direction === 'bullish' ? NEON_GREEN : NEON_RED;
  }
  if (arrowEl) {
    arrowEl.textContent = data.direction === 'bullish' ? '↑' : '↓';
    arrowEl.style.color = data.direction === 'bullish' ? NEON_GREEN : NEON_RED;
  }
  if (confidenceVal) confidenceVal.textContent = (data.confidence != null ? data.confidence : 0) + '%';
  if (confidenceBar) confidenceBar.style.width = (data.confidence != null ? Math.min(100, data.confidence) : 0) + '%';
  if (summaryEl && data.summary) summaryEl.textContent = data.summary;
  if (chartTickerEl) chartTickerEl.textContent = tickerLabel || '—';

  // Summary metrics (enriched API response)
  var score = data.crystalline_score;
  if (typeof score === 'number') {
    setText('crystallineScoreVal', score);
    var barEl = document.getElementById('crystallineScoreBar');
    if (barEl) {
      var pct = Math.max(0, Math.min(100, ((score + 4) / 8) * 100));
      barEl.style.width = pct + '%';
      barEl.style.background = score >= 0 ? NEON_GREEN : NEON_RED;
    }
    setText('trendScoreVal', data.trend_score);
    setText('volScoreVal', data.vol_score);
    setText('riskScoreVal', data.risk_score);
  }
  setText('clockPositionVal', data.clock_position);
  setText('primeAlignmentVal', data.on_prime === true ? 'Prime-aligned (3, 6, 9)' : 'Not prime-aligned');
  setText('piPhiResonanceVal', data.pi_phi_resonance === true ? 'π×φ resonance' : 'No π×φ resonance');
  setText('swingHighVal', data.swing_high != null ? formatCurrency(data.swing_high) : '—');
  setText('swingLowVal', data.swing_low != null ? formatCurrency(data.swing_low) : '—');
  var fibDict = data.fib_levels_dict || {};
  setText('fib0382Val', fibDict['0.382'] != null ? formatCurrency(fibDict['0.382']) : '—');
  setText('fib0618Val', fibDict['0.618'] != null ? formatCurrency(fibDict['0.618']) : '—');
  setText('fib0786Val', fibDict['0.786'] != null ? formatCurrency(fibDict['0.786']) : '—');
  var fibConfluence = [];
  if (data.fib_bull_confluence) fibConfluence.push('Bull confluence');
  if (data.fib_bear_confluence) fibConfluence.push('Bear confluence');
  setText('fibConfluenceVal', fibConfluence.length ? fibConfluence.join('; ') : 'None');
  setText('riskRatioVal', data.risk_ratio != null ? Number(data.risk_ratio).toFixed(4) : '—');
  setText('volatilityAnnualVal', data.volatility_annual != null ? (Number(data.volatility_annual) * 100).toFixed(2) + '%' : '—');
  setText('phiTargetVal', data.phi_target != null ? formatCurrency(data.phi_target) : '—');

  hideChartPlaceholder();
  renderChart(data);
  var legendEl = document.getElementById('chartLegend');
  if (legendEl) legendEl.classList.remove('hidden');
}

function renderChart(data) {
  const canvas = document.getElementById('chartCanvas');
  if (!canvas) return;

  if (!data.historical_dates || !data.historical_prices) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  const histDates = data.historical_dates || [];
  const histPrices = data.historical_prices || [];
  const predDates = data.predicted_dates || [];
  const predPrices = data.predicted_prices || [];
  const upperBand = data.upper_band || [];
  const lowerBand = data.lower_band || [];
  const fibLevels = data.fib_levels || [];

  const nHist = histDates.length;
  const allLabels = predDates.length ? histDates.concat(predDates) : histDates;
  const lastHistPrice = histPrices[nHist - 1];

  var histData = histPrices.concat(predDates.length ? Array(predDates.length).fill(null) : []);
  var predData = Array(nHist - 1).fill(null).concat([lastHistPrice], predPrices);

  var lowerBandData = Array(nHist).fill(null).concat(lowerBand);
  var upperBandData = Array(nHist).fill(null).concat(upperBand);

  var todayLabel = nHist > 0 ? histDates[nHist - 1] : null;

  var annotationPlug = typeof Chart !== 'undefined' && Chart.registry && Chart.registry.getPlugin('annotation');
  var annotations = {};
  if (todayLabel && predDates.length && annotationPlug) {
    annotations.today = {
      type: 'line',
      xMin: todayLabel,
      xMax: todayLabel,
      borderColor: 'rgba(148, 163, 184, 0.6)',
      borderWidth: 1.5,
      label: {
        display: true,
        content: 'Today',
        position: 'start',
        color: '#94a3b8',
        font: { size: 10 },
      },
    };
  }
  fibLevels.forEach(function (level, i) {
    if (level == null || level <= 0) return;
    annotations['fib' + i] = {
      type: 'line',
      yMin: level,
      yMax: level,
      borderColor: 'rgba(148, 163, 184, 0.25)',
      borderWidth: 1,
      borderDash: [2, 2],
    };
  });

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        {
          label: 'Historical',
          data: histData,
          borderColor: NEON_GREEN,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.2,
          spanGaps: false,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: 'Predicted',
          data: predData,
          borderColor: '#ff6b4a',
          backgroundColor: 'rgba(255, 107, 74, 0.06)',
          borderWidth: 3,
          borderDash: [6, 4],
          tension: 0.25,
          fill: true,
          spanGaps: false,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointBackgroundColor: '#ff6b4a',
        },
        {
          label: 'Confidence band (low)',
          data: lowerBandData,
          borderColor: 'transparent',
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          borderWidth: 0,
          fill: '+1',
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
        {
          label: 'Confidence band (high)',
          data: upperBandData,
          borderColor: 'transparent',
          backgroundColor: 'transparent',
          borderWidth: 0,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { family: 'Inter' }, filter: function (item, chart) { return item.datasetIndex < 2; } },
        },
        annotation: annotations && Object.keys(annotations).length ? { annotations: annotations } : undefined,
      },
      scales: {
        x: {
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: { color: '#64748b', maxTicksLimit: 14 },
        },
        y: {
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: { color: '#64748b', callback: function (v) { return formatCurrency(v); } },
        },
      },
    },
  });
}

function sanitizeTicker(s) {
  if (typeof s !== 'string') return 'QQQ';
  return s.trim().replace(/[^A-Za-z0-9.\-]/g, '').slice(0, 20) || 'QQQ';
}

function runPrediction() {
  const tickerInput = document.getElementById('ticker');
  const ticker = sanitizeTicker(tickerInput ? tickerInput.value : '');
  const assetType = (document.getElementById('assetType') && document.getElementById('assetType').value) || 'stock';
  const horizon = (document.getElementById('horizon') && document.getElementById('horizon').value) || '30';

  setLoading(true);
  fetch('/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker: ticker, asset_type: assetType, horizon: horizon }),
  })
    .then(function (res) {
      if (!res.ok) return res.json().then(function (body) { throw new Error(body.error || res.statusText); });
      return res.json();
    })
    .then(function (data) {
      if (data.error) throw new Error(data.error);
      displayResults(data, ticker.toUpperCase());
    })
    .catch(function (err) {
      showToast(err.message || 'Prediction failed', true);
      showChartPlaceholder('Load a ticker');
    })
    .finally(function () {
      setLoading(false);
    });
}

(function () {
  const form = document.getElementById('predictForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      runPrediction();
    });
  }

  // Auto-load QQQ on page load; chart stays up and fills with data
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { runPrediction(); });
  } else {
    runPrediction();
  }
})();
