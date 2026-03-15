import React, { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const API_BASE = "/api/sentiment";

class ChartErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#71717a" }}>
          Chart unavailable
        </div>
      );
    }
    return this.props.children;
  }
}

function Gauge({ score, stale }) {
  const numScore = Number(score);
  const safeScore = Number.isFinite(numScore) ? numScore : 0;
  const clamped = Math.max(-1, Math.min(1, safeScore));
  const pct = ((clamped + 1) / 2) * 100;
  const label =
    safeScore > 0.3 ? "Bullish" : safeScore < -0.3 ? "Bearish" : "Neutral";
  const color = safeScore > 0.3 ? "#22c55e" : safeScore < -0.3 ? "#ef4444" : "#a1a1aa";

  return (
    <figure style={{ margin: 0, textAlign: "center" }}>
      <svg
        viewBox="0 -12 120 72"
        width="100%"
        height={96}
        style={{ display: "block" }}
      >
        <path
          d="M 10 50 A 50 50 0 0 1 110 50"
          fill="none"
          stroke="#27272a"
          strokeWidth="8"
        />
        <path
          d="M 10 50 A 50 50 0 0 1 110 50"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${pct * 1.57} 157`}
          strokeLinecap="round"
        />
        <text
          x="60"
          y="42"
          textAnchor="middle"
          fill="#e4e4e7"
          fontSize="14"
          fontWeight="600"
        >
          {safeScore.toFixed(2)}
        </text>
      </svg>
      <figcaption style={{ color, fontWeight: 600, marginTop: 4 }}>
        {label}
        {stale ? " (stale)" : ""}
      </figcaption>
    </figure>
  );
}

const defaultOptions = {
  useTimeDecay: false,
  aggregationMode: "mean",
  includeUncertainty: true,
  usePrimeModular: false,
};

export default function SentimentIndicator({
  asset = "AAPL",
  provider = "massive",
  options: optionsProp,
}) {
  const safeAsset = typeof asset === "string" && asset.trim() ? asset.trim().toUpperCase() : "AAPL";
  const safeProvider = typeof provider === "string" && provider.trim() ? provider.trim().toLowerCase() : "massive";
  const options = optionsProp && typeof optionsProp === "object" ? { ...defaultOptions, ...optionsProp } : defaultOptions;

  const [current, setCurrent] = useState(null);
  const [historical, setHistorical] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const currentUrl = (() => {
    const path = `${API_BASE}/${encodeURIComponent(safeAsset)}`;
    if (!safeProvider) return path;
    const params = new URLSearchParams();
    params.set("provider", safeProvider);
    params.set("use_time_decay", options.useTimeDecay ? "true" : "false");
    params.set("decay_half_life_hours", options.useTimeDecay ? "12" : "12");
    params.set("aggregation_mode", options.aggregationMode || "mean");
    params.set("include_uncertainty", options.includeUncertainty !== false ? "true" : "false");
    params.set("use_prime_modular", options.usePrimeModular ? "true" : "false");
    return `${path}?${params.toString()}`;
  })();

  const historicalUrl = `${API_BASE}/historical/${encodeURIComponent(safeAsset)}?limit=200`;

  async function getErrorFromResponse(res) {
    const text = await res.text();
    let msg = res.statusText || "Request failed";
    try {
      const body = JSON.parse(text);
      if (body.detail) msg = typeof body.detail === "string" ? body.detail : body.detail.join?.(" ") || msg;
    } catch (_) {}
    if (res.status >= 500) {
      msg = msg || "Backend unavailable. Check that the database is set up and the server is running.";
    }
    return msg;
  }

  const fetchCurrent = async () => {
    try {
      const res = await fetch(currentUrl);
      if (!res.ok) {
        if (res.status === 404) {
          setCurrent(null);
          setError(null);
          return;
        }
        const msg = await getErrorFromResponse(res);
        throw new Error(msg);
      }
      const data = await res.json();
      setCurrent(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const fetchHistorical = async () => {
    try {
      const res = await fetch(historicalUrl);
      if (!res.ok) {
        if (res.status === 404) {
          setHistorical([]);
          return;
        }
        const msg = await getErrorFromResponse(res);
        throw new Error(msg);
      }
      const data = await res.json();
      setHistorical(
        (data || []).map((d) => ({
          ...d,
          time: d.window_end,
          score: d.aggregated_score,
        }))
      );
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const optionsKey = `${options.useTimeDecay}-${options.aggregationMode}-${options.includeUncertainty}-${options.usePrimeModular}`;
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchCurrent(), fetchHistorical()]).finally(() =>
      setLoading(false)
    );
  }, [safeAsset, safeProvider, optionsKey]);

  const cardStyle = {
    maxWidth: 720,
    margin: "0 auto",
    padding: 28,
    background: "#18181b",
    borderRadius: 12,
    boxSizing: "border-box",
  };

  if (error) {
    return (
      <section aria-label="Sentiment indicator error" style={cardStyle}>
        <h2 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 600 }}>
          {safeAsset} Sentiment
        </h2>
        <p role="alert" style={{ color: "#f87171", margin: 0, fontSize: 14 }}>
          Error: {error}
        </p>
      </section>
    );
  }

  const showLoadingHint = loading && !current && historical.length === 0;

  const hasUncertainty =
    current &&
    (Number.isFinite(current.score_std) ||
      (Number.isFinite(current.confidence_lower) && Number.isFinite(current.confidence_upper)));
  const uncertaintyLine = hasUncertainty && (
    <p
      style={{
        color: "#71717a",
        fontSize: 12,
        margin: 0,
        marginTop: 8,
      }}
    >
      {Number.isFinite(current.score_std) && `Std: ${Number(current.score_std).toFixed(3)}`}
      {Number.isFinite(current.score_std) &&
        Number.isFinite(current.confidence_lower) &&
        Number.isFinite(current.confidence_upper) &&
        " · "}
      {Number.isFinite(current.confidence_lower) && Number.isFinite(current.confidence_upper) && (
        <>
          95% CI: [{Number(current.confidence_lower).toFixed(3)}, {Number(current.confidence_upper).toFixed(3)}]
        </>
      )}
    </p>
  );

  const metaLine = current && (
    <div
      style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop: "1px solid #27272a",
      }}
    >
      {uncertaintyLine}
      <p
        style={{
          color: "#71717a",
          fontSize: 12,
          margin: 0,
          marginTop: uncertaintyLine ? 8 : 0,
        }}
      >
        {current.signal_count} signal{current.signal_count !== 1 ? "s" : ""}
        {" · "}
        Window end:{" "}
        {current.window_end != null
          ? new Date(current.window_end).toLocaleString()
          : "—"}
      </p>
    </div>
  );

  return (
    <section
      aria-label={showLoadingHint ? "Sentiment indicator loading" : `Sentiment for ${safeAsset}`}
      style={cardStyle}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 20,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
          {safeAsset} Sentiment
        </h2>
        {loading && (current || historical.length > 0) && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: "#a1a1aa",
            }}
          >
            Updating…
          </span>
        )}
      </div>
      {showLoadingHint ? (
        <p style={{ margin: 0, color: "#a1a1aa", fontSize: 14 }}>
          Loading sentiment for {safeAsset}…
        </p>
      ) : current ? (
        <Gauge score={current.aggregated_score} stale={current.stale} />
      ) : (
        <p style={{ margin: 0, color: "#a1a1aa", fontSize: 14 }}>
          No sentiment data yet. The job runs every 15 minutes.
        </p>
      )}
      {historical.length > 0 && (
        <div style={{ height: 220, marginTop: 28, minWidth: 0 }}>
          <h3 style={{ fontSize: 13, marginBottom: 12, color: "#a1a1aa", fontWeight: 500 }}>
            Score over time
          </h3>
          <ChartErrorBoundary>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={historical.map((d) => ({
                  ...d,
                  time: d.time ?? d.window_end,
                  score: Number.isFinite(Number(d.score)) ? Number(d.score) : 0,
                }))}
                margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="time"
                  tickFormatter={(v) =>
                    v != null ? new Date(v).toLocaleDateString() : ""
                  }
                  stroke="#71717a"
                  fontSize={11}
                />
                <YAxis
                  domain={[-1, 1]}
                  stroke="#71717a"
                  fontSize={11}
                  tickFormatter={(v) =>
                    Number.isFinite(Number(v)) ? Number(v).toFixed(1) : ""
                  }
                />
                <Tooltip
                  labelFormatter={(v) =>
                    v != null ? new Date(v).toLocaleString() : ""
                  }
                  formatter={(value) => {
                    const score = Array.isArray(value) ? value[0] : value;
                    const num = Number(score);
                    return [
                      Number.isFinite(num) ? num.toFixed(3) : "—",
                      "Score",
                    ];
                  }}
                  contentStyle={{ background: "#27272a", border: "1px solid #3f3f46" }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartErrorBoundary>
        </div>
      )}
      {metaLine}
    </section>
  );
}
