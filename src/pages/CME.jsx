import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useStorage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

const CME_SYMBOLS = [
  { id: 'NQ=F', label: 'NQ', name: 'E-mini Nasdaq-100' },
  { id: 'ES=F', label: 'ES', name: 'E-mini S&P 500' },
];

const PERIODS = [
  { value: '1d', label: '1D' },
  { value: '5d', label: '5D' },
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: 'ytd', label: 'YTD' },
];

const REFRESH_INTERVAL_MS = 60000;

const QUARTER_MONTHS = [
  { month: 2, code: 'H', label: 'MAR' },
  { month: 5, code: 'M', label: 'JUN' },
  { month: 8, code: 'U', label: 'SEP' },
  { month: 11, code: 'Z', label: 'DEC' },
];

function buildContracts(baseLabel, count = 8) {
  const now = new Date();
  const contracts = [];
  let year = now.getFullYear();
  let qi = 0;
  // Start from the first quarter month that is not fully expired
  while (contracts.length < count) {
    const q = QUARTER_MONTHS[qi % QUARTER_MONTHS.length];
    const y = year + Math.floor(qi / QUARTER_MONTHS.length);
    const expiryMonth = q.month;
    const contractMonthDate = new Date(y, expiryMonth, 1);
    if (contractMonthDate >= new Date(now.getFullYear() - 1, 0, 1)) {
      const yy = String(y).slice(-2);
      const displayCode = `${baseLabel}${q.code}${yy}`;
      const yahooCode = `${displayCode}.CME`;
      const label = `${q.label} ${y}`;
      const settlement = thirdFriday(y, expiryMonth);
      const firstTrade = new Date(y - 1, expiryMonth, 1);
      const lastTrade = settlement;
      contracts.push({
        code: displayCode,
        yahooCode,
        label,
        settlement,
        firstTrade,
        lastTrade,
      });
    }
    qi += 1;
  }
  return contracts;
}

function thirdFriday(year, monthIndex) {
  const d = new Date(year, monthIndex, 1);
  let fridayCount = 0;
  while (d.getMonth() === monthIndex) {
    if (d.getDay() === 5) {
      fridayCount += 1;
      if (fridayCount === 3) {
        return new Date(d);
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return new Date(year, monthIndex + 1, 0);
}

function CME({ embedded = false }) {
  const { getItem, setItem } = useStorage();
  const [symbol, setSymbol] = useState('NQ=F');
  const [period, setPeriod] = useState('1d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [contracts, setContracts] = useState(() => buildContracts('NQ'));
  const [quotes, setQuotes] = useState([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState(null);

  const loadStoredSymbol = useCallback(() => {
    getItem(STORAGE_KEYS.CME_LAST_SYMBOL).then((saved) => {
      if (saved && typeof saved === 'string' && CME_SYMBOLS.some((s) => s.id === saved)) {
        setSymbol(saved);
      }
    }).catch(() => {});
  }, [getItem]);

  useEffect(() => {
    loadStoredSymbol();
  }, [loadStoredSymbol]);

  useEffect(() => {
    const base = symbol.startsWith('ES') ? 'ES' : symbol.startsWith('NQ') ? 'NQ' : symbol.split('=')[0];
    setContracts(buildContracts(base));
  }, [symbol]);

  const fetchQuote = useCallback(async (sym, per) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/quote/${encodeURIComponent(sym)}?period=${encodeURIComponent(per)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) throw new Error('Invalid chart response');
      const meta = result.meta || {};
      const quote = result.indicators?.quote?.[0];
      const timestamps = result.timestamp || [];
      const opens = quote?.open || [];
      const highs = quote?.high || [];
      const lows = quote?.low || [];
      const closes = quote?.close || [];
      const volumes = quote?.volume || [];
      const lastClose = closes.length ? closes[closes.length - 1] : meta.regularMarketPrice ?? meta.previousClose;
      const prevClose = meta.previousClose ?? (closes.length > 1 ? closes[closes.length - 2] : lastClose);
      const change = lastClose != null && prevClose != null ? lastClose - prevClose : null;
      const changePercent = prevClose && change != null ? (change / prevClose) * 100 : null;
      const chartData = timestamps.map((ts, i) => ({
        time: ts,
        date: new Date(ts * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        open: opens[i],
        high: highs[i],
        low: lows[i],
        close: closes[i],
        volume: volumes[i],
      })).filter((d) => d.close != null);
      setData({
        symbol: meta.symbol || sym,
        lastPrice: lastClose,
        previousClose: prevClose,
        change,
        changePercent,
        open: opens.length ? opens[0] : null,
        high: highs.length ? Math.max(...highs.filter(Boolean)) : null,
        low: lows.length ? Math.min(...lows.filter(Boolean)) : null,
        volume: volumes.length ? volumes.reduce((a, b) => a + (b || 0), 0) : null,
        chartData,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      });
    } catch (e) {
      setError(e?.message || 'Failed to load quote');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuote(symbol, period);
  }, [symbol, period, fetchQuote]);

  useEffect(() => {
    const t = setInterval(() => fetchQuote(symbol, period), REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [symbol, period, fetchQuote]);

  const selectSymbol = (sym) => {
    setSymbol(sym);
    setItem(STORAGE_KEYS.CME_LAST_SYMBOL, sym).catch(() => {});
  };

  const currentLabel = CME_SYMBOLS.find((s) => s.id === symbol)?.label || symbol;
  const containerCls = embedded
    ? 'w-full max-w-[1800px] mx-auto px-0 flex flex-col h-full min-h-0 overflow-hidden'
    : 'w-full max-w-[1800px] mx-auto px-4 flex flex-col h-full min-h-0 overflow-hidden';

  useEffect(() => {
    if (tab !== 'quotes') return;
    let cancelled = false;
    const loadQuotes = async () => {
      try {
        setQuotesLoading(true);
        setQuotesError(null);
        const rows = await Promise.all(
          contracts.map(async (c) => {
            try {
              const url = `/api/quote/${encodeURIComponent(c.yahooCode)}?period=1d`;
              const res = await fetch(url);
              if (!res.ok) return { contract: c, hasData: false };
              const json = await res.json();
              const result = json?.chart?.result?.[0];
              if (!result) return { contract: c, hasData: false };
              const meta = result.meta || {};
              const quote = result.indicators?.quote?.[0] || {};
              const opens = quote.open || [];
              const highs = quote.high || [];
              const lows = quote.low || [];
              const closes = quote.close || [];
              const volumes = quote.volume || [];
              const last = meta.regularMarketPrice ?? (closes.length ? closes[closes.length - 1] : null);
              const prior = meta.previousClose ?? (closes.length > 1 ? closes[closes.length - 2] : null);
              const change = last != null && prior != null ? last - prior : null;
              const changePct = prior && change != null ? (change / prior) * 100 : null;
              const high = highs.length ? Math.max(...highs.filter((v) => v != null)) : null;
              const low = lows.length ? Math.min(...lows.filter((v) => v != null)) : null;
              const open = opens.length ? opens[0] : null;
              const volume = volumes.length ? volumes.reduce((a, b) => a + (b || 0), 0) : null;
              const updated = meta.regularMarketTime
                ? new Date(meta.regularMarketTime * 1000).toLocaleString()
                : null;
              return {
                contract: c,
                hasData: last != null || prior != null,
                last,
                change,
                changePct,
                prior,
                open,
                high,
                low,
                volume,
                updated,
              };
            } catch {
              return { contract: c, hasData: false };
            }
          })
        );
        if (!cancelled) setQuotes(rows);
      } catch (e) {
        if (!cancelled) setQuotesError(e?.message || 'Failed to load quotes');
      } finally {
        if (!cancelled) setQuotesLoading(false);
      }
    };
    loadQuotes();
    const id = setInterval(loadQuotes, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tab, contracts]);

  return (
    <div className={containerCls}>
      {!embedded && (
        <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4 flex-shrink-0">
          <Link to="/" className="hover:text-sky-400 dark:hover:text-sky-300 transition-colors">Dashboard</Link>
          <span>/</span>
          <span className="font-medium text-gray-900 dark:text-white">CME</span>
        </nav>
      )}
      {!embedded && (
        <div className="text-center mb-6 flex-shrink-0">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">CME E-mini Futures</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            NQ (Nasdaq-100) and ES (S&P 500) metrics
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center mb-4 flex-shrink-0">
        {CME_SYMBOLS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => selectSymbol(s.id)}
            className={`py-2 px-4 text-sm font-semibold rounded-lg transition-colors ${
              symbol === s.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className="text-gray-500 dark:text-gray-400 text-sm mx-2">|</span>
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={`min-h-[44px] py-2.5 px-3 text-xs font-medium rounded ${
              period === p.value
                ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <button
          type="button"
          onClick={() => setTab('overview')}
          className={tab === 'overview' ? 'text-sky-400' : 'text-black dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}
        >
          Overview
        </button>
        <span className="text-gray-800 dark:text-gray-500">|</span>
        <button
          type="button"
          onClick={() => setTab('quotes')}
          className={tab === 'quotes' ? 'text-sky-400' : 'text-black dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}
        >
          Quotes
        </button>
        <span className="text-gray-800 dark:text-gray-500">|</span>
        <button
          type="button"
          onClick={() => setTab('calendar')}
          className={tab === 'calendar' ? 'text-sky-400' : 'text-black dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}
        >
          Calendar
        </button>
      </div>

      {tab === 'overview' && loading && !data && (
        <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">Loading…</div>
      )}
      {tab === 'overview' && error && !data && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {tab === 'overview' && data && (
        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Last Price</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {data.lastPrice != null ? data.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Change</p>
              <p className={`text-lg font-bold ${data.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data.change != null
                  ? `${data.change >= 0 ? '+' : ''}${data.change.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Change %</p>
              <p className={`text-lg font-bold ${data.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data.changePercent != null
                  ? `${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%`
                  : '—'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Open</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {data.open != null ? data.open.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">High</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {data.high != null ? data.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Low</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {data.low != null ? data.low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Previous Close</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {data.previousClose != null ? data.previousClose.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Volume</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {data.volume != null ? data.volume.toLocaleString() : '—'}
              </p>
            </div>
            {data.fiftyTwoWeekHigh != null && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">52W High</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{data.fiftyTwoWeekHigh.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            )}
            {data.fiftyTwoWeekLow != null && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">52W Low</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{data.fiftyTwoWeekLow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            )}
          </div>

          {data.chartData && data.chartData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex-1 min-h-[280px]">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                {currentLabel} Price
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v != null ? v.toFixed(0) : '')} domain={['auto', 'auto']} />
                    <Tooltip
                      formatter={(v) => (v != null ? Number(v).toFixed(2) : '')}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.date}
                    />
                    <Area type="monotone" dataKey="close" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'quotes' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {quotesLoading && (
            <div className="flex items-center justify-center py-6 text-gray-500 dark:text-gray-400">
              Loading quotes…
            </div>
          )}
          {quotesError && (
            <div className="mb-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300 text-xs">
              {quotesError}
            </div>
          )}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="px-3 py-2 whitespace-nowrap">Month</th>
                  <th className="px-3 py-2 whitespace-nowrap">Last</th>
                  <th className="px-3 py-2 whitespace-nowrap">Change</th>
                  <th className="px-3 py-2 whitespace-nowrap">Prior Settle</th>
                  <th className="px-3 py-2 whitespace-nowrap">Open</th>
                  <th className="px-3 py-2 whitespace-nowrap">High</th>
                  <th className="px-3 py-2 whitespace-nowrap">Low</th>
                  <th className="px-3 py-2 whitespace-nowrap">Volume</th>
                  <th className="px-3 py-2 whitespace-nowrap">Updated</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const row = quotes.find((q) => q.contract.code === c.code) || { hasData: false };
                  const fmt = (v, digits = 2) =>
                    v != null ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
                  const fmtInt = (v) => (v != null ? v.toLocaleString() : '—');
                  const changeCls =
                    row.change == null
                      ? 'text-gray-900 dark:text-white'
                      : row.change >= 0
                      ? 'text-green-600'
                      : 'text-red-600';
                  return (
                    <tr key={c.code} className="border-t border-gray-100 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                      <td className="px-3 py-2 whitespace-nowrap text-[11px]">
                        <div className="font-medium">{c.label}</div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400">{c.code}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmt(row.last)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap ${changeCls}`}>
                        {row.change != null
                          ? `${row.change >= 0 ? '+' : ''}${fmt(row.change)} ${
                              row.changePct != null ? `(${row.changePct.toFixed(2)}%)` : ''
                            }`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmt(row.prior)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmt(row.open)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmt(row.high)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmt(row.low)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtInt(row.volume)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-[10px] text-gray-500 dark:text-gray-400">
                        {row.updated || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="px-3 py-2 whitespace-nowrap">Contract Month</th>
                  <th className="px-3 py-2 whitespace-nowrap">Product Code</th>
                  <th className="px-3 py-2 whitespace-nowrap">First Trade</th>
                  <th className="px-3 py-2 whitespace-nowrap">Last Trade</th>
                  <th className="px-3 py-2 whitespace-nowrap">Settlement</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const fmtDate = (d) => (d ? d.toLocaleDateString() : '—');
                  return (
                    <tr key={c.code} className="border-t border-gray-100 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                      <td className="px-3 py-2 whitespace-nowrap">{c.label}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.code}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(c.firstTrade)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(c.lastTrade)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(c.settlement)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default CME;
