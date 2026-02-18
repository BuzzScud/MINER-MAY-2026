(function () {
  'use strict';

  var ALL_SYMBOLS = [];
  var visibleSymbols = {};
  var chartsBuilt = false;
  var charts = {};
  var equityChart = null;
  var equitySeries = null;
  var socket = null;
  var activeChartSymbol = null;
  var activeTimeframe = '1h';
  var activeFeedProvider = 'yahoo';
  var lastKnownPrices = {};

  function fmt(v, dec) {
    if (v == null || v === '') return '\u2014';
    var n = Number(v);
    if (isNaN(n)) return '\u2014';
    return n.toFixed(dec != null ? dec : 2);
  }

  function fmtPrice(v) {
    if (v == null) return '\u2014';
    var n = Number(v);
    if (isNaN(n)) return '\u2014';
    if (n >= 100) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n.toFixed(5);
  }

  function fmtPnl(v) {
    if (v == null) return '\u2014';
    var n = Number(v);
    if (isNaN(n)) return '\u2014';
    return (n >= 0 ? '+' : '') + n.toFixed(2);
  }

  function fmtPct(v) {
    if (v == null) return '\u2014';
    var n = Number(v);
    if (isNaN(n)) return '\u2014';
    return (n * 100).toFixed(2) + '%';
  }

  function fmtTime(iso) {
    if (!iso) return '\u2014';
    try { return new Date(iso).toLocaleString(); } catch (_) { return iso; }
  }

  function toChartBar(bar) {
    var t = bar.time;
    if (typeof t === 'string') t = Math.floor(new Date(t).getTime() / 1000);
    if (typeof t !== 'number' || isNaN(t)) return null;
    return { time: t, open: bar.open, high: bar.high, low: bar.low, close: bar.close };
  }

  function dedup(bars) {
    var seen = {};
    var out = [];
    for (var i = 0; i < bars.length; i++) {
      if (bars[i] && !seen[bars[i].time]) {
        seen[bars[i].time] = true;
        out.push(bars[i]);
      }
    }
    out.sort(function (a, b) { return a.time - b.time; });
    return out;
  }

  var baseChartOpts = {
    autoSize: true,
    layout: { background: { color: '#ffffff' }, textColor: '#374151' },
    grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
    rightPriceScale: { borderColor: '#e5e7eb', scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: {
      borderColor: '#e5e7eb',
      timeVisible: true,
      secondsVisible: false,
    },
  };

  function switchChart(sym) {
    if (!sym || !charts[sym]) return;
    activeChartSymbol = sym;
    var chartsRow = document.getElementById('chartsRow');
    var togglesEl = document.getElementById('chartToggles');
    if (chartsRow) {
      var wraps = chartsRow.querySelectorAll('.chart-wrap');
      wraps.forEach(function (w) { w.classList.remove('active'); });
      var target = chartsRow.querySelector('.chart-wrap[data-symbol="' + sym + '"]');
      if (target) target.classList.add('active');
    }
    if (togglesEl) {
      togglesEl.querySelectorAll('.chart-tab-btn').forEach(function (b) { b.classList.remove('active'); });
      var activeBtn = togglesEl.querySelector('.chart-tab-btn[data-symbol="' + sym + '"]');
      if (activeBtn) activeBtn.classList.add('active');
    }
    var obj = charts[sym];
    if (obj && obj.chart) {
      setTimeout(function () {
        obj.chart.resize(0, 0);
        obj.chart.applyOptions({ autoSize: true });
        obj.chart.timeScale().fitContent();
        positionCountdownBoxes();
      }, 50);
    }
  }

  function switchTimeframe(tf) {
    var tfBtns = document.querySelectorAll('.tf-btn');
    tfBtns.forEach(function (b) { b.classList.remove('active'); });
    var activeBtn = document.querySelector('.tf-btn[data-tf="' + tf + '"]');
    if (activeBtn) activeBtn.classList.add('active');
    activeTimeframe = tf;
    updateCandleCountdown();
    fetch('/api/timeframe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interval: tf }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok && data.bars) {
          ALL_SYMBOLS.forEach(function (sym) {
            if (data.bars[sym]) updateBars(sym, data.bars[sym]);
          });
        }
      })
      .catch(function (e) { console.warn('switchTimeframe error', e); });
  }

  function switchFeedProvider(provider) {
    if (!provider || provider === activeFeedProvider) return;
    var feedBtns = document.querySelectorAll('.feed-btn');
    feedBtns.forEach(function (b) { b.classList.remove('active'); });
    var activeBtn = document.querySelector('.feed-btn[data-feed="' + provider + '"]');
    if (activeBtn) activeBtn.classList.add('active');
    activeFeedProvider = provider;
    fetch('/api/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: provider }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok && data.provider) {
          activeFeedProvider = data.provider;
          document.querySelectorAll('.feed-btn').forEach(function (b) { b.classList.remove('active'); });
          var btn = document.querySelector('.feed-btn[data-feed="' + data.provider + '"]');
          if (btn) btn.classList.add('active');
          if (data.bars && ALL_SYMBOLS.length) {
            ALL_SYMBOLS.forEach(function (sym) {
              if (data.bars[sym]) updateBars(sym, data.bars[sym]);
            });
          }
        }
      })
      .catch(function (e) { console.warn('switchFeedProvider error', e); });
  }

  function updateFeedButtonState(provider) {
    var p = (provider || 'yahoo').toLowerCase();
    document.querySelectorAll('.feed-btn').forEach(function (b) { b.classList.remove('active'); });
    var btn = document.querySelector('.feed-btn[data-feed="' + p + '"]');
    if (btn) btn.classList.add('active');
    activeFeedProvider = p;
  }

  var CANDLE_DURATIONS = { '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
  function updateCandleCountdown() {
    var el = document.getElementById('candleCountdown');
    var fillEl = document.getElementById('candleCountdownBarFill');
    var duration = CANDLE_DURATIONS[activeTimeframe];
    if (!duration) {
      if (el) el.textContent = '';
      if (fillEl) fillEl.style.width = '0%';
      document.querySelectorAll('.chart-countdown-price').forEach(function (p) { p.textContent = ''; });
      document.querySelectorAll('.chart-countdown-value').forEach(function (v) { v.textContent = ''; });
      document.querySelectorAll('.chart-countdown-opens').forEach(function (o) { o.textContent = ''; });
      return;
    }
    var nowSec = Math.floor(Date.now() / 1000);
    var elapsed = nowSec % duration;
    var remaining = duration - elapsed;
    var hours = Math.floor(remaining / 3600);
    var minutes = Math.floor((remaining % 3600) / 60);
    var seconds = remaining % 60;
    var parts = [];
    if (hours > 0) parts.push(String(hours).padStart(2, '0'));
    parts.push(String(minutes).padStart(2, '0'));
    parts.push(String(seconds).padStart(2, '0'));
    var countdownStr = parts.join(':');
    var nextCandleTime = new Date((nowSec + remaining) * 1000);
    var nextCandleStr = nextCandleTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (el) el.textContent = 'Next candle: ' + countdownStr;
    if (fillEl) fillEl.style.width = (remaining / duration * 100) + '%';
    document.querySelectorAll('.chart-countdown-value').forEach(function (v) { v.textContent = countdownStr; });
    document.querySelectorAll('.chart-countdown-opens').forEach(function (o) { o.textContent = 'Opens ' + nextCandleStr; });
    updateCountdownBoxPrices();
    positionCountdownBoxes();
  }

  function updateCountdownBoxPrices() {
    var boxes = document.querySelectorAll('.chart-countdown-box');
    boxes.forEach(function (box) {
      var wrap = box.closest('.chart-wrap');
      if (!wrap) return;
      var sym = wrap.getAttribute('data-symbol');
      var price = lastKnownPrices[sym];
      var priceEl = box.querySelector('.chart-countdown-price');
      if (priceEl) priceEl.textContent = price != null && typeof price === 'number' ? fmtPrice(price) : '';
    });
  }

  function addChartForSymbol(sym, chartsRow, togglesEl) {
    visibleSymbols[sym] = true;
    var wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    wrap.setAttribute('data-symbol', sym);
    wrap.innerHTML = '<div class="chart-wrap-header"><h3>' + sym + '</h3><span id="price' + sym + '" class="price"></span></div><div class="chart-inner-wrap"><div id="chart' + sym + '" class="chart-inner"></div><div class="chart-countdown-box"><span class="chart-countdown-price"></span><span class="chart-countdown-value"></span><span class="chart-countdown-opens"></span></div></div>';
    chartsRow.appendChild(wrap);
    var el = document.getElementById('chart' + sym);
    if (el) {
      var chart = LightweightCharts.createChart(el, baseChartOpts);
      var series = chart.addCandlestickSeries({
        upColor: '#3fb950', downColor: '#f85149',
        borderUpColor: '#3fb950', borderDownColor: '#f85149',
        wickUpColor: '#3fb950', wickDownColor: '#f85149',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      charts[sym] = { chart: chart, series: series };
    }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chart-tab-btn';
    btn.textContent = sym;
    btn.setAttribute('data-symbol', sym);
    btn.addEventListener('click', function () {
      switchChart(btn.getAttribute('data-symbol'));
    });
    togglesEl.appendChild(btn);
  }

  function buildCharts(symbols) {
    if (!symbols || !symbols.length) symbols = ['NQ', 'ES', 'EURUSD', 'GBPUSD'];
    if (chartsBuilt) return;
    chartsBuilt = true;
    ALL_SYMBOLS = symbols.slice();
    var chartsRow = document.getElementById('chartsRow');
    var togglesEl = document.getElementById('chartToggles');
    if (!chartsRow || !togglesEl) return;
    togglesEl.innerHTML = '';
    symbols.forEach(function (sym) {
      addChartForSymbol(sym, chartsRow, togglesEl);
    });
    if (symbols.length > 0) {
      switchChart(symbols[0]);
    }
  }

  function syncCharts(newSymbols) {
    if (!newSymbols || !Array.isArray(newSymbols)) return;
    var chartsRow = document.getElementById('chartsRow');
    var togglesEl = document.getElementById('chartToggles');
    if (!chartsRow || !togglesEl || !chartsBuilt) return;
    var currentSet = {};
    ALL_SYMBOLS.forEach(function (s) { currentSet[s] = true; });
    var newSet = {};
    newSymbols.forEach(function (s) { newSet[s] = true; });
    var toRemove = [];
    var toAdd = [];
    ALL_SYMBOLS.forEach(function (s) { if (!newSet[s]) toRemove.push(s); });
    newSymbols.forEach(function (s) { if (!currentSet[s]) toAdd.push(s); });
    toRemove.forEach(function (sym) {
      var wrap = chartsRow.querySelector('.chart-wrap[data-symbol="' + sym + '"]');
      if (wrap) wrap.remove();
      var btn = togglesEl.querySelector('.chart-tab-btn[data-symbol="' + sym + '"]');
      if (btn) btn.remove();
      var obj = charts[sym];
      if (obj && obj.chart) try { obj.chart.remove(); } catch (_) {}
      delete charts[sym];
      delete visibleSymbols[sym];
      ALL_SYMBOLS = ALL_SYMBOLS.filter(function (s) { return s !== sym; });
    });
    toAdd.forEach(function (sym) {
      addChartForSymbol(sym, chartsRow, togglesEl);
      ALL_SYMBOLS = ALL_SYMBOLS.concat([sym]);
    });
    if (activeChartSymbol && !newSet[activeChartSymbol] && ALL_SYMBOLS.length > 0) {
      switchChart(ALL_SYMBOLS[0]);
    }
  }

  function initCharts() {
    var eqOpts = Object.assign({}, baseChartOpts, {
      localization: {
        priceFormatter: function (price) {
          return '$' + Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },
      },
    });
    var eqEl = document.getElementById('equityChart');
    if (eqEl) {
      if (equityChart) try { equityChart.remove(); } catch (_) {}
      equityChart = LightweightCharts.createChart(eqEl, eqOpts);
      equitySeries = equityChart.addLineSeries({ color: '#3fb950', lineWidth: 2 });
    }
  }

  var lastBarCounts = {};

  function updateBars(symbol, bars) {
    if (!bars || bars.length === 0) return;
    var obj = charts[symbol];
    if (!obj) return;
    var data = [];
    for (var i = 0; i < bars.length; i++) {
      var b = toChartBar(bars[i]);
      if (b) data.push(b);
    }
    data = dedup(data);
    if (data.length === 0) return;
    try {
      var prevCount = lastBarCounts[symbol] || 0;
      if (prevCount > 0 && data.length === prevCount) {
        var lastBar = data[data.length - 1];
        obj.series.update(lastBar);
      } else {
        obj.series.setData(data);
        obj.chart.timeScale().fitContent();
      }
      lastBarCounts[symbol] = data.length;
    } catch (e) {
      console.warn('Chart update error ' + symbol, e);
    }
  }

  function updateEquity(curve) {
    if (!equitySeries || !curve || curve.length === 0) return;
    var data = [];
    for (var i = 0; i < curve.length; i++) {
      var p = curve[i];
      var t = p.time;
      var sec;
      if (typeof t === 'number') {
        sec = t;
      } else if (typeof t === 'string') {
        sec = Math.floor(new Date(t).getTime() / 1000);
      } else {
        continue;
      }
      if (!isNaN(sec)) data.push({ time: sec, value: p.equity });
    }
    data = dedup(data);
    if (data.length === 0) return;
    try {
      equitySeries.setData(data);
      equityChart.timeScale().fitContent();
    } catch (_) {}
  }

  function renderPositions(positions) {
    var tbody = document.getElementById('positionsBody');
    if (!tbody) return;
    if (!positions || positions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-3 py-2 text-gray-400">No open positions</td></tr>';
      return;
    }
    var html = '';
    var cellCls = 'px-3 py-2';
    for (var i = 0; i < positions.length; i++) {
      var p = positions[i];
      var pnl = p.unrealized_pnl != null ? fmtPnl(p.unrealized_pnl) : '\u2014';
      var pnlCls = p.unrealized_pnl != null && p.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400';
      html += '<tr class="hover:bg-gray-700/50"><td class="' + cellCls + ' font-semibold">' + p.symbol + '</td><td class="' + cellCls + '">' + (p.side || '') + '</td><td class="' + cellCls + '">' + fmtPrice(p.entry_price) +
        '</td><td class="' + cellCls + '">' + fmtPrice(p.current_price) + '</td><td class="' + cellCls + ' ' + pnlCls + '">' + pnl + '</td></tr>';
    }
    tbody.innerHTML = html;
  }

  function renderTrades(trades) {
    var tbody = document.getElementById('tradesBody');
    if (!tbody) return;
    if (!trades || trades.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-3 py-2 text-gray-400">No trades yet</td></tr>';
      return;
    }
    var rows = trades.slice(-50).reverse();
    var html = '';
    var cellCls = 'px-3 py-2';
    for (var i = 0; i < rows.length; i++) {
      var t = rows[i];
      var pnlCls = t.pnl >= 0 ? 'text-green-400' : 'text-red-400';
      html += '<tr class="hover:bg-gray-700/50"><td class="' + cellCls + '">' + fmtTime(t.exit_time) + '</td><td class="' + cellCls + ' font-semibold">' + t.symbol + '</td><td class="' + cellCls + '">' + (t.side || '') +
        '</td><td class="' + cellCls + '">' + fmtPrice(t.entry_price) + '</td><td class="' + cellCls + '">' + fmtPrice(t.exit_price) +
        '</td><td class="' + cellCls + ' ' + pnlCls + '">' + fmtPnl(t.pnl) + '</td></tr>';
    }
    tbody.innerHTML = html;
  }

  function renderMetrics(payload) {
    if (!payload) return;
    var m = payload.metrics || {};
    var equityStr = payload.equity != null ? '$' + fmtPrice(payload.equity) : '\u2014';
    var el = document.getElementById('metricEquity');
    if (el) {
      animateValueChange(el, lastMetricValues.metricEquity, equityStr);
      lastMetricValues.metricEquity = equityStr;
      el.textContent = equityStr;
    }
    var badge = document.getElementById('equityBadge');
    if (badge) badge.textContent = equityStr;
    var ids = ['metricSharpe', 'metricSortino', 'metricCalmar', 'metricMaxDd', 'metricWinRate', 'metricExpectancy', 'metricTotalTrades', 'metricProfitFactor', 'metricTotalPnl', 'metricAvgWin', 'metricAvgLoss'];
    var vals = [
      m.sharpe != null ? fmt(m.sharpe) : '\u2014',
      m.sortino != null ? fmt(m.sortino) : '\u2014',
      m.calmar != null ? fmt(m.calmar) : '\u2014',
      m.max_drawdown != null ? fmtPct(m.max_drawdown) : '\u2014',
      m.win_rate != null ? fmtPct(m.win_rate) : '\u2014',
      m.expectancy != null ? '$' + fmt(m.expectancy) : '\u2014',
      m.total_trades != null ? String(Math.floor(m.total_trades)) : '\u2014',
      m.profit_factor != null ? fmt(m.profit_factor) : '\u2014',
      m.total_pnl != null ? '$' + fmt(m.total_pnl) : '\u2014',
      m.avg_win != null ? '$' + fmt(m.avg_win) : '\u2014',
      m.avg_loss != null ? '$' + fmt(m.avg_loss) : '\u2014',
    ];
    for (var i = 0; i < ids.length; i++) {
      el = document.getElementById(ids[i]);
      if (el) {
        animateValueChange(el, lastMetricValues[ids[i]], vals[i]);
        lastMetricValues[ids[i]] = vals[i];
        el.textContent = vals[i];
      }
    }
  }

  function renderLog(log) {
    var el = document.getElementById('activityLog');
    if (!el) return;
    if (!log || log.length === 0) {
      el.innerHTML = '<div class="le py-0.5 text-gray-400">Waiting for activity...</div>';
      return;
    }
    var html = '';
    var items = log.slice(-80).reverse();
    for (var i = 0; i < items.length; i++) {
      var e = items[i];
      var cls = e.level === 'error' ? 'text-red-400' : e.level === 'warning' ? 'text-amber-400' : 'text-gray-300';
      html += '<div class="le py-0.5 ' + cls + '">' + (e.message || '') + '</div>';
    }
    el.innerHTML = html;
    el.scrollTop = 0;
  }

  var lastMOPrices = {};
  function renderMarketOverview(data) {
    var tbody = document.getElementById('marketOverviewBody');
    if (!tbody || !data || !Array.isArray(data)) return;
    var html = '';
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var sym = row.symbol || '';
      var price = row.price != null ? fmtPrice(row.price) : '\u2014';
      var chg = row.change_pct != null ? row.change_pct.toFixed(2) + '%' : '\u2014';
      var chgCls = row.change_pct > 0 ? 'text-green-400' : (row.change_pct < 0 ? 'text-red-400' : '');
      var high = row.day_high != null ? fmtPrice(row.day_high) : '\u2014';
      var low = row.day_low != null ? fmtPrice(row.day_low) : '\u2014';
      var flash = (lastMOPrices[sym] !== undefined && lastMOPrices[sym] !== row.price) ? ' mo-flash' : '';
      html += '<tr class="hover:bg-gray-700/50' + flash + '"><td class="px-3 py-2 font-semibold">' + sym + '</td><td class="px-3 py-2">' + price + '</td><td class="px-3 py-2 ' + chgCls + '">' + chg + '</td><td class="px-3 py-2">' + high + '</td><td class="px-3 py-2">' + low + '</td></tr>';
      lastMOPrices[sym] = row.price;
    }
    tbody.innerHTML = html;
    if (html.indexOf('mo-flash') !== -1) {
      setTimeout(function () {
        var flashRows = tbody.querySelectorAll('.mo-flash');
        flashRows.forEach(function (r) { r.classList.remove('mo-flash'); });
      }, 400);
    }
    renderVolumePanel(data);
  }

  var lastTotalVolume = null;
  var lastTopPct = null;
  var VOL_PALETTE = ['#6366f1', '#818cf8', '#a78bfa', '#c4b5fd'];

  function renderVolumePanel(data) {
    var panel = document.getElementById('volumePanel');
    if (!panel || !data || !Array.isArray(data)) return;
    // Show only the symbol currently displayed on the price chart
    var currentSym = activeChartSymbol || (data.length > 0 ? (data[0].symbol || '') : '');
    var dataToShow = currentSym ? data.filter(function (row) { return (row.symbol || '') === currentSym; }) : data;
    if (dataToShow.length === 0) return;
    var totalVolume = 0;
    var maxVol = 0;
    var maxRange = 0;
    for (var i = 0; i < dataToShow.length; i++) {
      var v = dataToShow[i].volume || 0;
      totalVolume += v;
      if (v > maxVol) maxVol = v;
      var hi = dataToShow[i].day_high != null ? dataToShow[i].day_high : 0;
      var lo = dataToShow[i].day_low != null ? dataToShow[i].day_low : 0;
      var r = Math.max(0, hi - lo);
      if (r > maxRange) maxRange = r;
    }
    if (maxVol <= 0) maxVol = 1;
    if (maxRange <= 0) maxRange = 1;
    var activeCount = 0;
    for (var j = 0; j < dataToShow.length; j++) {
      if ((dataToShow[j].volume || 0) > 0) activeCount++;
    }
    var avgVolume = dataToShow.length > 0 ? Math.round(totalVolume / dataToShow.length) : 0;
    var topSymbol = '';
    var topVol = 0;
    for (var k = 0; k < dataToShow.length; k++) {
      if ((dataToShow[k].volume || 0) > topVol) {
        topVol = dataToShow[k].volume || 0;
        topSymbol = dataToShow[k].symbol || '';
      }
    }
    var topPct = totalVolume > 0 ? (topVol / totalVolume * 100) : 0;
    var totalChg = '';
    if (lastTotalVolume != null && lastTotalVolume > 0) {
      var chg = ((totalVolume - lastTotalVolume) / lastTotalVolume) * 100;
      var chgCls = chg >= 0 ? 'vol-chg-pos' : 'vol-chg-neg';
      totalChg = '<span class="' + chgCls + '">' + (chg >= 0 ? '+' : '') + chg.toFixed(1) + '%</span>';
    }
    lastTotalVolume = totalVolume;
    var prevTopPct = lastTopPct;
    lastTopPct = topPct;
    var topTrend = '';
    if (prevTopPct != null && topSymbol) {
      if (topPct < prevTopPct) topTrend = 'down from ' + prevTopPct.toFixed(1) + '%';
      else if (topPct > prevTopPct) topTrend = 'up from ' + prevTopPct.toFixed(1) + '%';
    }
    var sessionInfo = getSessionInfoClient();
    var sessionEl = document.getElementById('volSession');
    if (sessionEl) sessionEl.textContent = sessionInfo.name ? 'Session: ' + sessionInfo.name : '';
    var subEl = document.getElementById('volSubtitle');
    if (subEl) subEl.textContent = (dataToShow.length === 1 ? dataToShow[0].symbol : dataToShow.length + ' symbols') + ' (chart)';
    var totalEl = document.getElementById('volTotalVal');
    if (totalEl) totalEl.textContent = formatVolume(totalVolume);
    var totalChgEl = document.getElementById('volTotalChg');
    if (totalChgEl) totalChgEl.innerHTML = totalChg;
    var activeEl = document.getElementById('volActiveVal');
    if (activeEl) activeEl.textContent = activeCount;
    var avgEl = document.getElementById('volAvgVal');
    if (avgEl) avgEl.textContent = formatVolume(avgVolume);
    var highlightPctEl = document.getElementById('volHighlightPct');
    if (highlightPctEl) highlightPctEl.textContent = totalVolume > 0 ? topPct.toFixed(1) + '%' : '—';
    var highlightLblEl = document.getElementById('volHighlightLbl');
    if (highlightLblEl) highlightLblEl.textContent = topSymbol ? topSymbol + ' leads' : '—';
    var highlightTrendEl = document.getElementById('volHighlightTrend');
    if (highlightTrendEl) {
      highlightTrendEl.textContent = topTrend;
      highlightTrendEl.style.color = (prevTopPct != null && topPct < prevTopPct) ? 'var(--red)' : (topTrend ? 'var(--green)' : '');
    }
    var chartEl = document.getElementById('volChart');
    if (chartEl) {
      var chartHtml = '';
      for (var c = 0; c < dataToShow.length; c++) {
        var row = dataToShow[c];
        var sym = row.symbol || '';
        var vol = row.volume || 0;
        var hi = row.day_high != null ? row.day_high : 0;
        var lo = row.day_low != null ? row.day_low : 0;
        var rangeVal = Math.max(0, hi - lo);
        var volPct = (vol / maxVol) * 100;
        var rangePct = (rangeVal / maxRange) * 100;
        var color = VOL_PALETTE[c % VOL_PALETTE.length];
        chartHtml += '<div class="vol-panel-bar-group flex items-end gap-1 flex-1 min-w-0"><span class="vol-panel-bar-group-label text-xs text-gray-400 w-12 flex-shrink-0">' + sym + '</span><div class="vol-panel-bars-inner flex gap-0.5 flex-1 items-end min-h-[40px]"><div class="vol-panel-bar vol-bar-volume rounded-t bg-indigo-500 flex-1 min-w-[4px]" style="height:' + volPct.toFixed(1) + '%"></div><div class="vol-panel-bar vol-bar-range rounded-t bg-gray-600 flex-1 min-w-[4px]" style="height:' + rangePct.toFixed(1) + '%"></div></div></div>';
      }
      chartEl.innerHTML = chartHtml;
    }
    var progressEl = document.getElementById('volProgress');
    if (progressEl && totalVolume > 0) {
      var progHtml = '';
      for (var p = 0; p < dataToShow.length; p++) {
        var share = (dataToShow[p].volume || 0) / totalVolume * 100;
        var segColor = VOL_PALETTE[p % VOL_PALETTE.length];
        progHtml += '<div class="vol-panel-progress-seg h-full" style="width:' + share.toFixed(2) + '%;background:' + segColor + '"></div>';
      }
      progressEl.innerHTML = progHtml;
    }
    var symbolsEl = document.getElementById('volSymbols');
    if (symbolsEl) {
      var symHtml = '';
      for (var s = 0; s < dataToShow.length; s++) {
        var dotColor = VOL_PALETTE[s % VOL_PALETTE.length];
        symHtml += '<div class="vol-panel-symbol-item flex items-center gap-1.5"><span class="vol-panel-symbol-dot w-2 h-2 rounded-full flex-shrink-0" style="background:' + dotColor + '"></span><span>' + (dataToShow[s].symbol || '') + ' - ' + formatVolume(dataToShow[s].volume || 0) + '</span></div>';
      }
      symbolsEl.innerHTML = symHtml;
    }
  }

  function formatVolume(v) {
    if (v == null) return '\u2014';
    if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return String(v);
  }

  function updatePriceLabels(prices) {
    if (!prices) return;
    lastKnownPrices = Object.assign({}, prices);
    ALL_SYMBOLS.forEach(function (sym) {
      var el = document.getElementById('price' + sym);
      if (el && prices[sym]) el.textContent = fmtPrice(prices[sym]);
    });
    updateCountdownBoxPrices();
    positionCountdownBoxes();
  }

  function positionCountdownBoxes() {
    var boxes = document.querySelectorAll('.chart-countdown-box');
    boxes.forEach(function (box) {
      var wrap = box.closest('.chart-wrap');
      if (!wrap || !wrap.classList.contains('active')) return;
      var sym = wrap.getAttribute('data-symbol');
      if (!sym || !charts[sym]) return;
      var price = lastKnownPrices[sym];
      if (price == null || typeof price !== 'number') {
        box.style.top = '4px';
        box.style.transform = 'none';
        return;
      }
      try {
        var series = charts[sym].series;
        var y;
        if (series && typeof series.priceToCoordinate === 'function') {
          y = series.priceToCoordinate(price);
        } else if (series && typeof series.coordinateFromPrice === 'function') {
          y = series.coordinateFromPrice(price);
        } else {
          box.style.top = '4px';
          box.style.transform = 'none';
          return;
        }
        if (typeof y === 'number' && !isNaN(y)) {
          var container = wrap.querySelector('.chart-inner-wrap');
          var containerHeight = container ? container.offsetHeight : 0;
          var boxHeight = box.offsetHeight || 40;
          var minTop = 4;
          var maxTop = containerHeight > 0 ? containerHeight - boxHeight - 4 : y;
          var clampedY = Math.max(minTop, Math.min(maxTop, y));
          box.style.top = clampedY + 'px';
          box.style.transform = 'translateY(-50%)';
          return;
        }
      } catch (e) {}
      box.style.top = '4px';
      box.style.transform = 'none';
    });
  }

  function getSessionInfoClient() {
    var now = new Date();
    var totalMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (totalMin >= 0 && totalMin < 8 * 60) {
      var elapsed = totalMin;
      var durationMin = 8 * 60;
      return { name: 'Asian', progress: elapsed / durationMin, time_remaining_sec: (durationMin - elapsed) * 60, active: true };
    }
    if (totalMin >= 8 * 60 && totalMin < 16 * 60) {
      var elapsedL = totalMin - 8 * 60;
      var durationL = 8 * 60;
      return { name: 'London', progress: elapsedL / durationL, time_remaining_sec: (durationL - elapsedL) * 60, active: true };
    }
    if (totalMin >= 13 * 60 + 30 && totalMin < 20 * 60) {
      var elapsedN = totalMin - (13 * 60 + 30);
      var durationN = 6.5 * 60;
      return { name: 'New York', progress: Math.min(1, elapsedN / durationN), time_remaining_sec: Math.max(0, (durationN - elapsedN) * 60), active: true };
    }
    return { name: 'Closed', progress: 0, time_remaining_sec: 0, active: false };
  }

  function updateSessionIndicator() {
    var info = getSessionInfoClient();
    var nameEl = document.getElementById('sessionName');
    var fillEl = document.getElementById('sessionProgressFill');
    var timeEl = document.getElementById('sessionTime');
    var container = document.getElementById('sessionIndicator');
    if (nameEl) nameEl.textContent = info.name;
    if (fillEl) fillEl.style.width = (info.progress * 100) + '%';
    if (timeEl) {
      if (info.active && info.time_remaining_sec > 0) {
        var m = Math.floor(info.time_remaining_sec / 60);
        var s = info.time_remaining_sec % 60;
        timeEl.textContent = m + 'm ' + s + 's left';
      } else {
        timeEl.textContent = info.active ? 'Active' : '—';
      }
    }
    if (container) {
      container.classList.remove('active', 'overlap');
      if (info.active) container.classList.add('active');
    }
  }

  function setStatus(running) {
    var badge = document.getElementById('statusBadge');
    if (badge) {
      badge.textContent = running ? 'Running' : 'Stopped';
      badge.className = 'badge ' + (running ? 'running' : 'stopped');
    }
  }

  function renderConnectionStatus(connected) {
    var el = document.getElementById('connectionStatus');
    var textEl = document.getElementById('connectionStatusText');
    if (!el) return;
    el.classList.remove('live', 'connecting');
    if (connected) {
      el.classList.add('live');
      if (textEl) textEl.textContent = 'Live';
    } else {
      el.classList.add('connecting');
      if (textEl) textEl.textContent = 'Connecting...';
    }
  }

  function animateValueChange(el, oldVal, newVal) {
    if (!el || oldVal === newVal) return;
    el.classList.remove('flash-up', 'flash-down');
    var numOld = parseFloat(String(oldVal).replace(/[$,%]/g, ''), 10);
    var numNew = parseFloat(String(newVal).replace(/[$,%]/g, ''), 10);
    if (isNaN(numOld) || isNaN(numNew)) return;
    el.offsetHeight;
    if (numNew > numOld) el.classList.add('flash-up');
    else if (numNew < numOld) el.classList.add('flash-down');
    setTimeout(function () { el.classList.remove('flash-up', 'flash-down'); }, 500);
  }

  function symbolsEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  var currentMode = 'paper';
  var connectionTested = false;

  function updateModeBadge(mode) {
    currentMode = mode || 'paper';
    var badge = document.getElementById('modeBadge');
    if (!badge) return;
    badge.classList.remove('mode-paper', 'mode-live', 'running', 'stopped');
    if (currentMode === 'live') {
      badge.textContent = 'LIVE TRADING';
      badge.classList.add('mode-live');
    } else {
      badge.textContent = 'PAPER';
      badge.classList.add('mode-paper');
    }
  }

  function loadMode() {
    fetch('/api/mode')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        updateModeBadge(data.mode || 'paper');
      })
      .catch(function () {});
  }

  function loadState() {
    fetch('/api/state')
      .then(function (r) { return r.json(); })
      .then(function (s) {
        var syms = (s.symbols && s.symbols.length) ? s.symbols : ['NQ', 'ES', 'EURUSD', 'GBPUSD'];
        if (!chartsBuilt) buildCharts(syms);
        else if (!symbolsEqual(ALL_SYMBOLS, syms)) syncCharts(syms);
        setStatus(s.running === true);
        if (s.mode) updateModeBadge(s.mode);
        if (s.bars && ALL_SYMBOLS.length) {
          ALL_SYMBOLS.forEach(function (sym) { if (s.bars[sym]) updateBars(sym, s.bars[sym]); });
        }
        if (s.prices) updatePriceLabels(s.prices);
        if (s.positions) renderPositions(s.positions);
        if (s.trades) renderTrades(s.trades);
        if (s.equity) {
          if (s.equity.equity_curve) updateEquity(s.equity.equity_curve);
          renderMetrics(s.equity);
          var badge = document.getElementById('equityBadge');
          if (badge && s.equity.equity != null) badge.textContent = '$' + fmtPrice(s.equity.equity);
        }
        if (s.activity_log) renderLog(s.activity_log);
        if (s.market_overview) renderMarketOverview(s.market_overview);
        if (s.chart_interval) {
          activeTimeframe = s.chart_interval;
          document.querySelectorAll('.tf-btn').forEach(function (b) { b.classList.remove('active'); });
          var tfBtn = document.querySelector('.tf-btn[data-tf="' + s.chart_interval + '"]');
          if (tfBtn) tfBtn.classList.add('active');
        }
        if (s.feed_provider) updateFeedButtonState(s.feed_provider);
        updateSessionIndicator();
      })
      .catch(function (e) { console.warn('loadState error', e); });
  }

  function setButtonsEnabled(enabled) {
    var btnStart = document.getElementById('btnStart');
    var btnStop = document.getElementById('btnStop');
    if (btnStart) btnStart.disabled = !enabled;
    if (btnStop) btnStop.disabled = !enabled;
  }

  function showButtonToast(message, isError) {
    var toast = document.getElementById('settingsToast');
    if (toast) {
      toast.textContent = message;
      toast.classList.toggle('error', !!isError);
      toast.style.display = 'block';
      setTimeout(function () { toast.style.display = 'none'; }, 3000);
    }
  }

  function startBot() {
    setButtonsEnabled(false);
    fetch('/api/bot/start', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) {
          setStatus(true);
        } else {
          showButtonToast(d && d.error ? d.error : 'Start failed', true);
        }
        setButtonsEnabled(true);
      })
      .catch(function () {
        showButtonToast('Start failed', true);
        setButtonsEnabled(true);
      });
  }

  function stopBot() {
    setButtonsEnabled(false);
    fetch('/api/bot/stop', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) {
          setStatus(false);
        } else {
          showButtonToast(d && d.error ? d.error : 'Stop failed', true);
        }
        setButtonsEnabled(true);
      })
      .catch(function () {
        showButtonToast('Stop failed', true);
        setButtonsEnabled(true);
      });
  }

  function connectSocket() {
    if (typeof io === 'undefined') { console.warn('socket.io not loaded'); return; }
    socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
    });
    socket.on('connect', function () {
      console.log('WS connected');
      reconnectAttempts = 0;
      reconnectDelayMs = 1000;
      renderConnectionStatus(true);
    });
    socket.on('disconnect', function () {
      console.log('WS disconnected');
      renderConnectionStatus(false);
    });
    socket.on('price_update', function (data) {
      if (data && data.bars && ALL_SYMBOLS.length) {
        ALL_SYMBOLS.forEach(function (sym) { if (data.bars[sym]) updateBars(sym, data.bars[sym]); });
      }
      if (data && data.prices) updatePriceLabels(data.prices);
    });
    socket.on('market_overview_update', function (data) {
      if (data) renderMarketOverview(data);
    });
    socket.on('position_update', function (positions) { renderPositions(positions || []); });
    socket.on('equity_update', function (payload) {
      if (payload && payload.equity_curve) updateEquity(payload.equity_curve);
      renderMetrics(payload);
      var badge = document.getElementById('equityBadge');
      if (badge && payload && payload.equity != null) badge.textContent = '$' + fmtPrice(payload.equity);
    });
    socket.on('trade_executed', function (data) {
      loadState();
    });
    socket.on('log_update', function (log) {
      if (log && Array.isArray(log)) {
        renderLog(log);
        var logEl = document.getElementById('activityLog');
        if (logEl) logEl.scrollTop = 0;
      }
    });
  }

  var statePollInterval = null;
  var POLL_INTERVAL_MS = 5000;
  var lastMetricValues = {};
  var reconnectAttempts = 0;
  var reconnectDelayMs = 1000;
  var maxReconnectDelayMs = 30000;

  var METRIC_SETTING_MAP = {
    metricSharpe: 'set_rsi_period',
    metricSortino: 'set_stop_atr_mult',
    metricCalmar: 'set_max_drawdown_pct',
    metricMaxDd: 'set_max_drawdown_pct',
    metricWinRate: 'set_rsi_oversold',
    metricExpectancy: 'set_profit_atr_mult',
    metricTotalTrades: 'set_max_concurrent_positions',
    metricProfitFactor: 'set_risk_pct_per_trade',
  };

  function openSettingsModal() {
    var overlay = document.getElementById('settingsOverlay');
    if (overlay) overlay.classList.add('open');
  }

  function closeSettingsModal() {
    var overlay = document.getElementById('settingsOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  function focusSetting(inputId) {
    if (!inputId) return;
    openSettingsModal();
    var input = document.getElementById(inputId);
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      input.classList.remove('highlight-flash');
      input.offsetHeight;
      input.classList.add('highlight-flash');
      setTimeout(function () { input.classList.remove('highlight-flash'); }, 600);
    }
  }

  function loadStrategies() {
    return fetch('/api/strategies')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var sel = document.getElementById('strategySelect');
        if (!sel) return;
        var options = data.options || [];
        var current = data.current || 'multi_asset';
        sel.innerHTML = '';
        options.forEach(function (opt) {
          var o = document.createElement('option');
          o.value = opt.id;
          o.textContent = opt.label || opt.id;
          if (opt.id === current) o.selected = true;
          sel.appendChild(o);
        });
      })
      .catch(function (e) { console.warn('loadStrategies error', e); });
  }

  function loadSettings() {
    fetch('/api/settings')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var strategy = data.strategy || {};
        var risk = data.risk || {};
        var circuit = data.circuit || {};
        function setInput(id, val) {
          var el = document.getElementById(id);
          if (el && val != null) el.value = String(val);
        }
        var stratSel = document.getElementById('strategySelect');
        if (stratSel && data.strategy_id != null) stratSel.value = data.strategy_id;
        setInput('set_rsi_period', strategy.rsi_period);
        setInput('set_bb_period', strategy.bb_period);
        setInput('set_bb_std', strategy.bb_std);
        setInput('set_atr_period', strategy.atr_period);
        setInput('set_supertrend_period', strategy.supertrend_period);
        setInput('set_supertrend_mult', strategy.supertrend_mult);
        setInput('set_trend_ema_fast', strategy.trend_ema_fast);
        setInput('set_trend_ema_slow', strategy.trend_ema_slow);
        setInput('set_rsi_oversold', strategy.rsi_oversold);
        setInput('set_rsi_overbought', strategy.rsi_overbought);
        setInput('set_profit_atr_mult', strategy.profit_atr_mult);
        setInput('set_stop_atr_mult', strategy.stop_atr_mult);
        setInput('set_max_hold_minutes', strategy.max_hold_minutes);
        setInput('set_risk_pct_per_trade', risk.risk_pct_per_trade);
        setInput('set_max_concurrent_positions', risk.max_concurrent_positions);
        setInput('set_max_daily_loss_pct', risk.max_daily_loss_pct);
        setInput('set_max_portfolio_pct_per_instrument', risk.max_portfolio_pct_per_instrument);
        setInput('set_max_vol_adjusted_exposure_pct', risk.max_vol_adjusted_exposure_pct);
        setInput('set_max_drawdown_pct', circuit.max_drawdown_pct);
      })
      .catch(function (e) { console.warn('loadSettings error', e); });
  }

  function saveSettings() {
    function num(id) {
      var el = document.getElementById(id);
      if (!el) return undefined;
      var v = parseFloat(el.value, 10);
      return isNaN(v) ? undefined : v;
    }
    function intVal(id) {
      var v = num(id);
      return v === undefined ? undefined : Math.floor(v);
    }
    var payload = {
      strategy: {
        rsi_period: intVal('set_rsi_period'),
        bb_period: intVal('set_bb_period'),
        bb_std: num('set_bb_std'),
        atr_period: intVal('set_atr_period'),
        supertrend_period: intVal('set_supertrend_period'),
        supertrend_mult: num('set_supertrend_mult'),
        trend_ema_fast: intVal('set_trend_ema_fast'),
        trend_ema_slow: intVal('set_trend_ema_slow'),
        rsi_oversold: num('set_rsi_oversold'),
        rsi_overbought: num('set_rsi_overbought'),
        profit_atr_mult: num('set_profit_atr_mult'),
        stop_atr_mult: num('set_stop_atr_mult'),
        max_hold_minutes: intVal('set_max_hold_minutes'),
      },
      risk: {
        risk_pct_per_trade: num('set_risk_pct_per_trade'),
        max_concurrent_positions: intVal('set_max_concurrent_positions'),
        max_daily_loss_pct: num('set_max_daily_loss_pct'),
        max_portfolio_pct_per_instrument: num('set_max_portfolio_pct_per_instrument'),
        max_vol_adjusted_exposure_pct: num('set_max_vol_adjusted_exposure_pct'),
      },
      circuit: {
        max_drawdown_pct: num('set_max_drawdown_pct'),
      },
    };
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var toast = document.getElementById('settingsToast');
        if (toast) {
          toast.textContent = d.ok ? 'Settings saved' : (d.error || 'Save failed');
          toast.classList.toggle('error', !d.ok);
          toast.style.display = 'block';
          setTimeout(function () { toast.style.display = 'none'; }, 3000);
        }
        if (d && d.ok) closeSettingsModal();
      })
      .catch(function () {
        var toast = document.getElementById('settingsToast');
        if (toast) {
          toast.textContent = 'Save failed';
          toast.classList.add('error');
          toast.style.display = 'block';
          setTimeout(function () { toast.style.display = 'none'; }, 3000);
        }
      });
  }

  function onStrategyChange() {
    var sel = document.getElementById('strategySelect');
    if (!sel || !sel.value) return;
    fetch('/api/strategy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy_id: sel.value }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        showButtonToast(d.ok ? 'Strategy set to ' + sel.value : (d.error || 'Failed'), !d.ok);
        if (d.ok) loadSettings();
      })
      .catch(function () { showButtonToast('Failed to set strategy', true); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initCharts();
    connectSocket();
    loadState();
    fetch('/api/prices').then(function (r) { return r.json(); }).then(function (p) { if (p) updatePriceLabels(p); }).catch(function () {});
    loadStrategies().then(function () { loadSettings(); });
    updateSessionIndicator();
    setInterval(updateSessionIndicator, 1000);
    if (statePollInterval) clearInterval(statePollInterval);
    statePollInterval = setInterval(loadState, POLL_INTERVAL_MS);
    var btnStart = document.getElementById('btnStart');
    var btnStop = document.getElementById('btnStop');
    var btnSaveSettings = document.getElementById('btnSaveSettings');
    if (btnStart) btnStart.addEventListener('click', startBot);
    if (btnStop) btnStop.addEventListener('click', stopBot);
    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', function (e) { e.stopPropagation(); saveSettings(); });
    }
    var strategySelect = document.getElementById('strategySelect');
    if (strategySelect) strategySelect.addEventListener('change', onStrategyChange);
    var btnOpenSettings = document.getElementById('btnOpenSettings');
    var btnCloseSettings = document.getElementById('btnCloseSettings');
    var settingsOverlay = document.getElementById('settingsOverlay');
    if (btnOpenSettings) btnOpenSettings.addEventListener('click', openSettingsModal);
    if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettingsModal);
    if (settingsOverlay) {
      settingsOverlay.addEventListener('click', function (e) {
        if (e.target === settingsOverlay) closeSettingsModal();
      });
    }
    var tabBtns = document.querySelectorAll('.tab-bar .tab-btn');
    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tabId = btn.getAttribute('data-tab');
        var bar = btn.parentElement;
        var content = bar ? bar.nextElementSibling : null;
        if (!content) return;
        bar.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        content.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
        var target = document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
        if (target) {
          target.classList.add('active');
          if (tabId === 'equity' && equityChart) {
            setTimeout(function () {
              equityChart.resize(0, 0);
              equityChart.applyOptions({ autoSize: true });
              equityChart.timeScale().fitContent();
            }, 50);
          }
        }
      });
    });
    var btnClearLog = document.getElementById('btnClearLog');
    if (btnClearLog) {
      btnClearLog.addEventListener('click', function () {
        var logEl = document.getElementById('activityLog');
        if (logEl) logEl.innerHTML = '<div class="le py-0.5 text-gray-400">Log cleared. Waiting for activity...</div>';
      });
    }
    var addSymbolInput = document.getElementById('addSymbolInput');
    var btnAddSymbol = document.getElementById('btnAddSymbol');
    var btnRemoveSymbol = document.getElementById('btnRemoveSymbol');
    function doAddSymbol() {
      var sym = (addSymbolInput && addSymbolInput.value || '').trim().toUpperCase();
      if (!sym) { showButtonToast('Enter a symbol', true); return; }
      fetch('/api/symbols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', symbol: sym }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          showButtonToast(d.ok ? 'Added ' + sym : (d.error || d.message || 'Add failed'), !d.ok);
          if (d.ok) { if (addSymbolInput) addSymbolInput.value = ''; loadState(); }
        })
        .catch(function () { showButtonToast('Add failed', true); });
    }
    function doRemoveSymbol() {
      var sym = (addSymbolInput && addSymbolInput.value || '').trim().toUpperCase();
      if (!sym) { showButtonToast('Enter symbol to remove', true); return; }
      fetch('/api/symbols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', symbol: sym }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          showButtonToast(d.ok ? 'Removed ' + sym : (d.error || d.message || 'Remove failed'), !d.ok);
          if (d.ok) { if (addSymbolInput) addSymbolInput.value = ''; loadState(); }
        })
        .catch(function () { showButtonToast('Remove failed', true); });
    }
    if (btnAddSymbol) btnAddSymbol.addEventListener('click', doAddSymbol);
    if (btnRemoveSymbol) btnRemoveSymbol.addEventListener('click', doRemoveSymbol);
    if (addSymbolInput) {
      addSymbolInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doAddSymbol();
      });
    }
    document.querySelectorAll('.tf-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTimeframe(btn.getAttribute('data-tf'));
      });
    });
    document.querySelectorAll('.feed-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchFeedProvider(btn.getAttribute('data-feed'));
      });
    });
    Object.keys(METRIC_SETTING_MAP).forEach(function (metricId) {
      var el = document.getElementById(metricId);
      if (el) {
        var card = el.closest ? el.closest('.mc') : el.parentElement;
        if (card) card.addEventListener('click', function () { focusSetting(METRIC_SETTING_MAP[metricId]); });
      }
    });

    var METRIC_SIZES = [
      { cols: 6, gap: '0.4rem', pad: '0.4rem 0.6rem', lbl: '0.6rem',  val: '0.9rem' },
      { cols: 4, gap: '0.5rem', pad: '0.55rem 0.75rem', lbl: '0.65rem', val: '1.05rem' },
      { cols: 3, gap: '0.6rem', pad: '0.7rem 0.9rem', lbl: '0.7rem',  val: '1.2rem' },
      { cols: 3, gap: '0.7rem', pad: '0.9rem 1.1rem', lbl: '0.8rem',  val: '1.4rem' },
      { cols: 2, gap: '0.8rem', pad: '1.1rem 1.4rem', lbl: '0.9rem',  val: '1.7rem' },
    ];
    var METRIC_SIZE_KEY = 'rocketbot_metric_size_v2';
    var metricSizeIndex = 2;
    try {
      var stored = localStorage.getItem(METRIC_SIZE_KEY);
      if (stored !== null) {
        var parsed = parseInt(stored, 10);
        if (parsed >= 0 && parsed < METRIC_SIZES.length) metricSizeIndex = parsed;
      }
    } catch (_) {}

    function applyMetricSize(idx) {
      var grid = document.getElementById('metricsGrid');
      if (!grid) return;
      var preset = METRIC_SIZES[idx];
      grid.style.setProperty('--mc-cols', preset.cols);
      grid.style.setProperty('--mc-gap', preset.gap);
      grid.style.setProperty('--mc-pad', preset.pad);
      grid.style.setProperty('--mc-lbl-size', preset.lbl);
      grid.style.setProperty('--mc-val-size', preset.val);
      try { localStorage.setItem(METRIC_SIZE_KEY, String(idx)); } catch (_) {}
    }

    applyMetricSize(metricSizeIndex);

    var btnSmaller = document.getElementById('btnMetricSmaller');
    var btnLarger = document.getElementById('btnMetricLarger');
    if (btnSmaller) {
      btnSmaller.addEventListener('click', function () {
        if (metricSizeIndex > 0) { metricSizeIndex--; applyMetricSize(metricSizeIndex); }
      });
    }
    if (btnLarger) {
      btnLarger.addEventListener('click', function () {
        if (metricSizeIndex < METRIC_SIZES.length - 1) { metricSizeIndex++; applyMetricSize(metricSizeIndex); }
      });
    }

    updateCandleCountdown();
    setInterval(updateCandleCountdown, 1000);

    loadMode();

    /* ──────────────────────────────────────────────────────────────
       Go Live Modal Logic
       ────────────────────────────────────────────────────────────── */
    var liveOverlay = document.getElementById('liveOverlay');
    var btnOpenLive = document.getElementById('btnOpenLiveModal');
    var btnCloseLive = document.getElementById('btnCloseLive');
    var liveModeSelect = document.getElementById('liveModeSelect');
    var ibFields = document.getElementById('ibConnectionFields');
    var btnTestConn = document.getElementById('btnTestConnection');
    var connResult = document.getElementById('connTestResult');
    var ackCheckbox = document.getElementById('ackCheckbox');
    var btnLiveBack = document.getElementById('btnLiveBack');
    var btnLiveCancel = document.getElementById('btnLiveCancel');
    var btnLiveNext = document.getElementById('btnLiveNext');
    var btnLiveConfirm = document.getElementById('btnLiveConfirm');
    var btnPaperConfirm = document.getElementById('btnPaperConfirm');

    var liveStep = 1;
    connectionTested = false;

    function liveStepDots() {
      for (var i = 1; i <= 3; i++) {
        var dot = document.getElementById('stepDot' + i);
        if (!dot) continue;
        dot.classList.remove('active', 'completed');
        if (i < liveStep) dot.classList.add('completed');
        else if (i === liveStep) dot.classList.add('active');
      }
      for (var j = 1; j <= 2; j++) {
        var line = document.getElementById('stepLine' + j);
        if (!line) continue;
        line.classList.toggle('completed', j < liveStep);
      }
    }

    function showLiveStep(step) {
      liveStep = step;
      for (var i = 1; i <= 3; i++) {
        var el = document.getElementById('liveStep' + i);
        if (el) el.classList.toggle('active', i === step);
      }
      liveStepDots();

      var isLive = liveModeSelect && liveModeSelect.value === 'live';
      var totalSteps = isLive ? 3 : 1;

      btnLiveBack.style.display = step > 1 ? '' : 'none';
      btnLiveNext.style.display = (step < totalSteps) ? '' : 'none';
      btnLiveConfirm.style.display = (step === totalSteps && isLive) ? '' : 'none';
      btnPaperConfirm.style.display = (step === totalSteps && !isLive) ? '' : 'none';

      if (step === 2 && isLive) {
        loadRiskSummary();
      }
      if (step === totalSteps) {
        populateConfirmSummary();
      }
      updateLiveNextEnabled();
    }

    function loadRiskSummary() {
      fetch('/api/settings')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var risk = data.risk || {};
          var circuit = data.circuit || {};
          var el;
          el = document.getElementById('riskMaxDailyLoss');
          if (el) el.textContent = (risk.max_daily_loss_pct || '--') + '%';
          el = document.getElementById('riskPerTrade');
          if (el) el.textContent = (risk.risk_pct_per_trade || '--') + '%';
          el = document.getElementById('riskMaxDrawdown');
          if (el) el.textContent = (circuit.max_drawdown_pct || '--') + '%';
          el = document.getElementById('riskMaxPositions');
          if (el) el.textContent = String(risk.max_concurrent_positions || '--');
        })
        .catch(function () {});
    }

    function populateConfirmSummary() {
      var isLive = liveModeSelect && liveModeSelect.value === 'live';
      var host = document.getElementById('liveIbHost');
      var port = document.getElementById('liveIbPort');
      var clientId = document.getElementById('liveClientId');
      var account = document.getElementById('liveAccount');
      var el;
      el = document.getElementById('confirmMode');
      if (el) el.textContent = isLive ? 'LIVE TRADING' : 'Paper Trading';
      if (el && isLive) el.style.color = 'var(--red)';
      else if (el) el.style.color = 'var(--green)';
      el = document.getElementById('confirmHost');
      if (el) el.textContent = host ? host.value : '--';
      el = document.getElementById('confirmPort');
      if (el) el.textContent = port ? port.value : '--';
      el = document.getElementById('confirmClientId');
      if (el) el.textContent = clientId ? clientId.value : '--';
      el = document.getElementById('confirmAccount');
      if (el) el.textContent = (account && account.value) ? account.value : '(auto-detect)';
      el = document.getElementById('confirmConn');
      if (el) el.textContent = connectionTested ? 'Verified' : 'Not tested';
      if (el) el.style.color = connectionTested ? 'var(--green)' : 'var(--amber)';
    }

    function updateLiveNextEnabled() {
      var isLive = liveModeSelect && liveModeSelect.value === 'live';
      if (liveStep === 1 && isLive) {
        btnLiveNext.disabled = !connectionTested;
      } else if (liveStep === 2 && isLive) {
        btnLiveNext.disabled = !(ackCheckbox && ackCheckbox.checked);
      } else {
        btnLiveNext.disabled = false;
      }
      if (isLive) {
        btnLiveConfirm.disabled = !connectionTested || !(ackCheckbox && ackCheckbox.checked);
      }
    }

    function openLiveModal() {
      if (!liveOverlay) return;
      connectionTested = false;
      if (ackCheckbox) ackCheckbox.checked = false;
      if (connResult) { connResult.className = 'conn-test-result'; connResult.textContent = ''; }
      if (liveModeSelect) liveModeSelect.value = currentMode || 'paper';
      toggleIbFields();
      showLiveStep(1);
      liveOverlay.classList.add('open');
    }

    function closeLiveModal() {
      if (liveOverlay) liveOverlay.classList.remove('open');
    }

    function toggleIbFields() {
      var isLive = liveModeSelect && liveModeSelect.value === 'live';
      if (ibFields) ibFields.style.display = isLive ? '' : 'none';
      var portInput = document.getElementById('liveIbPort');
      if (portInput && isLive) portInput.value = '7496';
      else if (portInput && !isLive) portInput.value = '7497';
      connectionTested = false;
      if (connResult) { connResult.className = 'conn-test-result'; connResult.textContent = ''; }
      updateLiveNextEnabled();
    }

    function getBrokerConfig() {
      return {
        ib_host: (document.getElementById('liveIbHost') || {}).value || '127.0.0.1',
        ib_port: parseInt((document.getElementById('liveIbPort') || {}).value, 10) || 7497,
        ib_client_id: parseInt((document.getElementById('liveClientId') || {}).value, 10) || 1,
        ib_account: (document.getElementById('liveAccount') || {}).value || '',
      };
    }

    function testConnection() {
      if (!connResult) return;
      connResult.className = 'conn-test-result testing';
      connResult.textContent = 'Testing connection...';
      connectionTested = false;
      updateLiveNextEnabled();

      var config = getBrokerConfig();
      fetch('/api/broker/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            connectionTested = true;
            var msg = data.message || 'Connected';
            if (data.account_id) msg += ' | Account: ' + data.account_id;
            if (data.net_liquidation) msg += ' | Net Liq: $' + data.net_liquidation;
            connResult.className = 'conn-test-result success';
            connResult.textContent = msg;
          } else {
            connectionTested = false;
            connResult.className = 'conn-test-result error';
            connResult.textContent = data.message || 'Connection failed';
          }
          updateLiveNextEnabled();
        })
        .catch(function (err) {
          connectionTested = false;
          connResult.className = 'conn-test-result error';
          connResult.textContent = 'Network error: ' + err.message;
          updateLiveNextEnabled();
        });
    }

    function setTradingMode() {
      var isLive = liveModeSelect && liveModeSelect.value === 'live';
      var mode = isLive ? 'live' : 'paper';
      var payload = { mode: mode };
      if (isLive) payload.broker = getBrokerConfig();

      fetch('/api/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            updateModeBadge(data.mode || mode);
            closeLiveModal();
            showButtonToast(data.message || ('Switched to ' + mode), false);
          } else {
            showButtonToast(data.message || 'Mode switch failed', true);
          }
        })
        .catch(function (err) {
          showButtonToast('Mode switch error: ' + err.message, true);
        });
    }

    if (btnOpenLive) btnOpenLive.addEventListener('click', openLiveModal);
    if (btnCloseLive) btnCloseLive.addEventListener('click', closeLiveModal);
    if (liveOverlay) {
      liveOverlay.addEventListener('click', function (e) {
        if (e.target === liveOverlay) closeLiveModal();
      });
    }
    if (liveModeSelect) liveModeSelect.addEventListener('change', function () {
      toggleIbFields();
      showLiveStep(1);
    });
    if (btnTestConn) btnTestConn.addEventListener('click', testConnection);
    if (ackCheckbox) ackCheckbox.addEventListener('change', updateLiveNextEnabled);
    if (btnLiveBack) btnLiveBack.addEventListener('click', function () {
      if (liveStep > 1) showLiveStep(liveStep - 1);
    });
    if (btnLiveCancel) btnLiveCancel.addEventListener('click', closeLiveModal);
    if (btnLiveNext) btnLiveNext.addEventListener('click', function () {
      var isLive = liveModeSelect && liveModeSelect.value === 'live';
      var maxStep = isLive ? 3 : 1;
      if (liveStep < maxStep) showLiveStep(liveStep + 1);
    });
    if (btnLiveConfirm) btnLiveConfirm.addEventListener('click', setTradingMode);
    if (btnPaperConfirm) btnPaperConfirm.addEventListener('click', setTradingMode);

    /* ──────────────────────────────────────────────────────────────
       Page Tab Switching (Dashboard / Backtest)
       ────────────────────────────────────────────────────────────── */
    var pageTabBtns = document.querySelectorAll('.page-tab-btn');
    pageTabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var page = btn.getAttribute('data-page');
        pageTabBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('.page-container').forEach(function (c) { c.classList.remove('active'); });
        var target = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
        if (target) target.classList.add('active');
        if (page === 'dashboard') {
          Object.keys(charts).forEach(function (sym) {
            var obj = charts[sym];
            if (obj && obj.chart) {
              setTimeout(function () {
                obj.chart.resize(0, 0);
                obj.chart.applyOptions({ autoSize: true });
                obj.chart.timeScale().fitContent();
              }, 50);
            }
          });
          if (equityChart) {
            setTimeout(function () {
              equityChart.resize(0, 0);
              equityChart.applyOptions({ autoSize: true });
              equityChart.timeScale().fitContent();
            }, 50);
          }
        }
        if (page === 'backtest' && btEquityChart) {
          setTimeout(function () {
            btEquityChart.resize(0, 0);
            btEquityChart.applyOptions({ autoSize: true });
            btEquityChart.timeScale().fitContent();
          }, 50);
        }
      });
    });

    /* ──────────────────────────────────────────────────────────────
       Backtest Tab Logic
       ────────────────────────────────────────────────────────────── */
    var btEquityChart = null;
    var btEquitySeries = null;
    var btRunning = false;

    function initBtEquityChart() {
      var el = document.getElementById('btEquityChart');
      if (!el) return;
      if (btEquityChart) { try { btEquityChart.remove(); } catch (_) {} }
      var opts = Object.assign({}, baseChartOpts, {
        localization: {
          priceFormatter: function (price) {
            return '$' + Number(price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
          },
        },
      });
      btEquityChart = LightweightCharts.createChart(el, opts);
      btEquitySeries = btEquityChart.addLineSeries({ color: '#3fb950', lineWidth: 2 });
    }

    function collectBtParams() {
      function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
      function num(id) { var v = parseFloat(val(id)); return isNaN(v) ? undefined : v; }
      function intVal(id) { var v = num(id); return v === undefined ? undefined : Math.floor(v); }
      return {
        symbol: val('btSymbol'),
        interval: val('btInterval'),
        period: val('btPeriod'),
        initial_equity: num('btEquity') || 100000,
        rsi_period: intVal('btRsiPeriod') || 14,
        rsi_oversold: num('btRsiOversold') || 30,
        rsi_overbought: num('btRsiOverbought') || 70,
        z_long_threshold: num('btZLong') || -2.0,
        z_short_threshold: num('btZShort') || 2.0,
        bb_period: intVal('btBbPeriod') || 20,
        bb_std: num('btBbStd') || 2.0,
        atr_period: intVal('btAtrPeriod') || 14,
        profit_atr_mult: num('btProfitMult') || 1.5,
        stop_atr_mult: num('btStopMult') || 1.0,
        max_hold_minutes: intVal('btMaxHold') || 30,
        volume_filter: document.getElementById('btVolumeFilter') ? document.getElementById('btVolumeFilter').checked : true,
      };
    }

    function setBtProgress(show, pct, text) {
      var prog = document.getElementById('btProgress');
      var bar = document.getElementById('btProgressBar');
      var txt = document.getElementById('btProgressText');
      if (prog) prog.classList.toggle('active', show);
      if (bar) bar.style.width = (pct || 0) + '%';
      if (txt) txt.textContent = text || '';
    }

    function runBacktest() {
      if (btRunning) return;
      btRunning = true;
      var btn = document.getElementById('btnRunBacktest');
      if (btn) btn.disabled = true;

      var emptyEl = document.getElementById('btEmpty');
      var resultsEl = document.getElementById('btResults');
      if (emptyEl) emptyEl.style.display = 'none';
      if (resultsEl) resultsEl.classList.remove('active');

      setBtProgress(true, 2, 'Starting backtest...');

      var params = collectBtParams();
      fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) {
            setBtProgress(false, 0, '');
            showButtonToast(d.error || 'Backtest failed to start', true);
            btRunning = false;
            if (btn) btn.disabled = false;
            if (emptyEl) emptyEl.style.display = '';
          }
        })
        .catch(function (err) {
          setBtProgress(false, 0, '');
          showButtonToast('Backtest request failed: ' + err.message, true);
          btRunning = false;
          if (btn) btn.disabled = false;
          if (emptyEl) emptyEl.style.display = '';
        });
    }

    function renderBtResults(data) {
      var emptyEl = document.getElementById('btEmpty');
      var resultsEl = document.getElementById('btResults');
      if (emptyEl) emptyEl.style.display = 'none';
      if (resultsEl) resultsEl.classList.add('active');

      // Data summary bar
      var ds = data.data_summary || {};
      var dataBar = document.getElementById('btDataBar');
      if (dataBar) {
        var barHtml = '';
        barHtml += '<div class="bt-data-item"><span class="bt-dl">Bars:</span><span class="bt-dv">' + (ds.bars || '--') + '</span></div>';
        barHtml += '<div class="bt-data-item"><span class="bt-dl">Range:</span><span class="bt-dv">' + (ds.date_start || '').substring(0, 10) + ' &rarr; ' + (ds.date_end || '').substring(0, 10) + '</span></div>';
        barHtml += '<div class="bt-data-item"><span class="bt-dl">Price:</span><span class="bt-dv">' + fmtPrice(ds.price_low) + ' - ' + fmtPrice(ds.price_high) + '</span></div>';
        barHtml += '<div class="bt-data-item"><span class="bt-dl">Buy&Hold:</span><span class="bt-dv" style="color:' + (ds.buy_hold_pct >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (ds.buy_hold_pct >= 0 ? '+' : '') + ds.buy_hold_pct + '%</span></div>';
        dataBar.innerHTML = barHtml;
      }

      // Performance metrics grid
      var perf = data.performance || {};
      var m = data.metrics || {};
      var ts = data.trade_stats || {};
      var perfGrid = document.getElementById('btPerfGrid');
      if (perfGrid) {
        var cards = [
          { label: 'Total P&L', value: '$' + fmt(perf.total_pnl), cls: perf.total_pnl >= 0 ? 'positive' : 'negative' },
          { label: 'Return', value: (perf.total_return_pct >= 0 ? '+' : '') + fmt(perf.total_return_pct) + '%', cls: perf.total_return_pct >= 0 ? 'positive' : 'negative' },
          { label: 'Sharpe', value: m.sharpe != null ? fmt(m.sharpe, 3) : '--' },
          { label: 'Sortino', value: m.sortino != null ? fmt(m.sortino, 3) : '--' },
          { label: 'Max DD', value: m.max_drawdown != null ? (m.max_drawdown * 100).toFixed(1) + '%' : '--', cls: 'negative' },
          { label: 'Win Rate', value: m.win_rate != null ? (m.win_rate * 100).toFixed(1) + '%' : '--' },
          { label: 'Profit Factor', value: m.profit_factor != null ? fmt(m.profit_factor) : '--' },
          { label: 'Total Trades', value: String(ts.total_trades || 0) },
          { label: 'Expectancy', value: m.expectancy != null ? '$' + fmt(m.expectancy) : '--', cls: m.expectancy != null && m.expectancy >= 0 ? 'positive' : 'negative' },
          { label: 'Avg Win', value: m.avg_win != null ? '$' + fmt(m.avg_win) : '--', cls: 'positive' },
          { label: 'Avg Loss', value: m.avg_loss != null ? '$' + fmt(m.avg_loss) : '--', cls: 'negative' },
          { label: 'Avg Hold', value: (ts.avg_hold_minutes || 0).toFixed(0) + ' min' },
          { label: 'Best Trade', value: ts.best_trade ? '$' + fmt(ts.best_trade) : '--', cls: 'positive' },
          { label: 'Worst Trade', value: ts.worst_trade ? '$' + fmt(ts.worst_trade) : '--', cls: 'negative' },
          { label: 'Final Equity', value: '$' + Number(perf.final_equity || 0).toLocaleString('en-US', { minimumFractionDigits: 0 }) },
          { label: 'Buy & Hold', value: (perf.buy_hold_pct >= 0 ? '+' : '') + fmt(perf.buy_hold_pct) + '%', cls: perf.buy_hold_pct >= 0 ? 'positive' : 'negative' },
        ];
        var gridHtml = '';
        for (var ci = 0; ci < cards.length; ci++) {
          var c = cards[ci];
          var valCls = c.cls === 'positive' ? ' text-green-400' : (c.cls === 'negative' ? ' text-red-400' : ' text-gray-100');
          gridHtml += '<div class="bt-perf-card rounded-lg border border-gray-600 bg-gray-800 p-2"><div class="bt-pc-label text-xs text-gray-400 uppercase">' + c.label + '</div><div class="bt-pc-value text-sm font-semibold tabular-nums' + valCls + '">' + c.value + '</div></div>';
        }
        perfGrid.innerHTML = gridHtml;
      }

      // Equity chart
      if (!btEquityChart) initBtEquityChart();
      var eqData = data.equity_chart || [];
      if (btEquitySeries && eqData.length > 0) {
        var chartData = [];
        var seen = {};
        for (var ei = 0; ei < eqData.length; ei++) {
          var pt = eqData[ei];
          if (pt && pt.time && !seen[pt.time]) {
            seen[pt.time] = true;
            chartData.push({ time: pt.time, value: pt.value });
          }
        }
        chartData.sort(function (a, b) { return a.time - b.time; });
        try {
          btEquitySeries.setData(chartData);
          btEquityChart.timeScale().fitContent();
          var startVal = data.performance ? data.performance.starting_equity : 100000;
          var endVal = chartData.length > 0 ? chartData[chartData.length - 1].value : startVal;
          btEquitySeries.applyOptions({ color: endVal >= startVal ? '#3fb950' : '#f85149' });
        } catch (_) {}
      }
      setTimeout(function () {
        if (btEquityChart) {
          btEquityChart.resize(0, 0);
          btEquityChart.applyOptions({ autoSize: true });
          btEquityChart.timeScale().fitContent();
        }
      }, 100);

      // Trade log table
      var trades = data.trade_details || [];
      var tbody = document.getElementById('btTradeBody');
      var tradeLogEl = document.getElementById('btTradeLog');
      if (tbody) {
        var cellCls = 'px-3 py-2';
        if (trades.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" class="px-3 py-2 text-gray-400 text-center">No trades generated</td></tr>';
        } else {
          var thtml = '';
          for (var ti = 0; ti < trades.length; ti++) {
            var tr = trades[ti];
            var pnlCls = tr.pnl >= 0 ? 'text-green-400' : 'text-red-400';
            var pnlPrefix = tr.pnl >= 0 ? '+' : '';
            var holdStr = (tr.hold_minutes || 0).toFixed(0) + 'm';
            var entryTimeStr = (tr.entry_time || '').substring(0, 19);
            thtml += '<tr class="hover:bg-gray-700/50">';
            thtml += '<td class="' + cellCls + ' text-center">' + (ti + 1) + '</td>';
            thtml += '<td class="' + cellCls + '">' + (tr.side || '') + '</td>';
            thtml += '<td class="' + cellCls + '">' + fmtPrice(tr.entry_price) + '</td>';
            thtml += '<td class="' + cellCls + '">' + fmtPrice(tr.exit_price) + '</td>';
            thtml += '<td class="' + cellCls + ' ' + pnlCls + '">' + pnlPrefix + fmt(tr.pnl) + '</td>';
            thtml += '<td class="' + cellCls + '">' + (tr.exit_reason || '') + '</td>';
            thtml += '<td class="' + cellCls + '">' + holdStr + '</td>';
            thtml += '<td class="' + cellCls + '">' + entryTimeStr + '</td>';
            thtml += '</tr>';
          }
          tbody.innerHTML = thtml;
        }
      }
      if (tradeLogEl) tradeLogEl.style.display = trades.length > 0 ? '' : 'none';

      // Diagnostics (shown when no trades)
      var diagEl = document.getElementById('btDiagnostics');
      var diagGrid = document.getElementById('btDiagGrid');
      var diag = data.diagnostics || {};
      if (diagEl && diagGrid) {
        if (trades.length === 0) {
          diagEl.style.display = '';
          var mc = diag.market_context || {};
          var items = [
            ['Bars Analyzed', diag.bars_analyzed || 0],
            ['RSI (last)', mc.rsi != null ? mc.rsi : '--'],
            ['Z-score (last)', mc.z_score != null ? mc.z_score : '--'],
            ['Last Close', mc.last_close != null ? fmtPrice(mc.last_close) : '--'],
            ['Volume Pass', diag.vol_pass_count || 0],
            ['Volume Block', diag.vol_block_count || 0],
            ['RSI Oversold Bars', diag.rsi_oversold_count || 0],
            ['RSI Overbought Bars', diag.rsi_overbought_count || 0],
            ['Z Long Bars', diag.z_long_count || 0],
            ['Z Short Bars', diag.z_short_count || 0],
            ['LONG Signals', diag.long_signal_count || 0],
            ['SHORT Signals', diag.short_signal_count || 0],
            ['RSI Min', diag.rsi_min != null ? diag.rsi_min : '--'],
            ['RSI Max', diag.rsi_max != null ? diag.rsi_max : '--'],
            ['Z Min', diag.z_min != null ? diag.z_min : '--'],
            ['Z Max', diag.z_max != null ? diag.z_max : '--'],
          ];
          var dhtml = '';
          for (var di = 0; di < items.length; di++) {
            dhtml += '<div class="bt-diag-item"><span class="bt-dg-label">' + items[di][0] + '</span><span class="bt-dg-value">' + items[di][1] + '</span></div>';
          }
          diagGrid.innerHTML = dhtml;
        } else {
          diagEl.style.display = 'none';
        }
      }

      // Timing
      var timingEl = document.getElementById('btTiming');
      var timing = data.timing || {};
      if (timingEl) {
        timingEl.textContent = 'Fetch: ' + (timing.fetch_sec || 0) + 's | Indicators: ' + (timing.indicator_sec || 0) + 's | Simulation: ' + (timing.simulation_sec || 0) + 's | Total: ' + (timing.total_sec || 0) + 's';
      }
    }

    // Wire up backtest button
    var btnRunBt = document.getElementById('btnRunBacktest');
    if (btnRunBt) btnRunBt.addEventListener('click', runBacktest);

    // SocketIO listeners for backtest events
    if (socket) {
      socket.on('backtest_progress', function (data) {
        if (data) {
          setBtProgress(true, data.pct || 0, data.stage || 'Processing...');
        }
      });
      socket.on('backtest_complete', function (data) {
        btRunning = false;
        var btn2 = document.getElementById('btnRunBacktest');
        if (btn2) btn2.disabled = false;
        setBtProgress(false, 100, 'Complete');
        if (data) renderBtResults(data);
      });
      socket.on('backtest_error', function (data) {
        btRunning = false;
        var btn2 = document.getElementById('btnRunBacktest');
        if (btn2) btn2.disabled = false;
        setBtProgress(false, 0, '');
        showButtonToast('Backtest error: ' + (data ? data.error : 'Unknown'), true);
        var emptyEl = document.getElementById('btEmpty');
        if (emptyEl) emptyEl.style.display = '';
      });
    }

  });
})();
