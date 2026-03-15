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

const API_BASE = "/api/composite";

const CONTAINER_MAX_WIDTH = 720;
const SPACING = 20;

const cardStyle = {
  maxWidth: CONTAINER_MAX_WIDTH,
  margin: "0 auto",
  marginBottom: SPACING,
  padding: 28,
  background: "#18181b",
  borderRadius: 12,
  boxSizing: "border-box",
};

const cardTitleStyle = {
  margin: 0,
  marginBottom: 20,
  fontSize: 20,
  fontWeight: 600,
  color: "#e4e4e7",
};

const subsectionTitleStyle = {
  fontSize: 13,
  marginBottom: 12,
  color: "#a1a1aa",
  fontWeight: 500,
};

function Gauge({ score }) {
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
      </figcaption>
    </figure>
  );
}

function IndexCard({ label, value, rawLabel }) {
  const hasValue = value != null && Number.isFinite(Number(value));
  return (
    <div
      style={{
        padding: 12,
        background: "#27272a",
        borderRadius: 8,
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "#e4e4e7" }}>
        {hasValue ? Number(value).toFixed(3) : "— No data"}
      </div>
      {rawLabel && hasValue && (
        <div style={{ fontSize: 10, color: "#71717a", marginTop: 2 }}>
          {rawLabel}
        </div>
      )}
    </div>
  );
}

const INDEX_CARDS = [
  { key: "cnn_fear_greed", label: "CNN Fear & Greed" },
  { key: "crypto_fear_greed", label: "Crypto Fear & Greed" },
  { key: "aaii_sentiment", label: "AAII Sentiment" },
  { key: "funding_rate_btc", label: "Funding rate (BTC)", rawLabel: "Positive = long bias" },
  { key: "vix", label: "VIX", rawLabel: "High = fear" },
  { key: "put_call_ratio", label: "Put/Call ratio" },
  { key: "news_polarity", label: "News polarity", rawLabel: "From text sentiment" },
];

const REFETCH_INTERVAL_MS = 60 * 1000;

function useCompositeData() {
  const [current, setCurrent] = useState(null);
  const currentRef = React.useRef(null);
  currentRef.current = current;
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const refetch = React.useCallback(() => {
    setError(null);
    const hasData = currentRef.current !== null;
    if (!hasData) setLoading(true);
    else setRefreshing(true);
    Promise.all([
      fetch(`${API_BASE}/current`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${API_BASE}/history?limit=200`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([cur, hist]) => {
        setCurrent(cur || null);
        setHistory(Array.isArray(hist) ? hist : []);
      })
      .catch((e) => setError(e.message || "Request failed"))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const id = setInterval(refetch, REFETCH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  useEffect(() => {
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  return { current, history, loading, refreshing, error, refetch };
}

export default function CompositeIndicesView() {
  const { current, history, loading, refreshing, error } = useCompositeData();

  if (error) {
    return (
      <section aria-label="Composite error" style={cardStyle}>
        <h2 style={cardTitleStyle}>Composite & Indices</h2>
        <p role="alert" style={{ color: "#f87171", margin: 0, fontSize: 14 }}>
          Error: {error}
        </p>
      </section>
    );
  }

  const compositeScore = current?.composite ?? null;
  const compositeTs = current?.timestamp ?? null;
  const indices = current?.indices ?? {};
  const components = current?.composite_components ?? null;

  return (
    <>
      <section style={cardStyle} aria-label="Composite score and history">
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
          <h2 style={{ ...cardTitleStyle, marginBottom: 0 }}>Composite Score</h2>
          {(loading || refreshing) && current && (
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
        {loading && !current ? (
          <p style={{ margin: 0, color: "#a1a1aa", fontSize: 14 }}>
            Loading…
          </p>
        ) : compositeScore != null && Number.isFinite(compositeScore) ? (
          <>
            <Gauge score={compositeScore} />
            <div
              style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: "1px solid #27272a",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "#71717a",
                }}
              >
                Last updated:{" "}
                {compositeTs
                  ? new Date(compositeTs).toLocaleString()
                  : "—"}
              </p>
            </div>
            {!loading && history?.length > 0 && (
              <>
                <h3 style={{ ...subsectionTitleStyle, marginTop: 28 }}>Score over time</h3>
                <div style={{ height: 220, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={history.map((d) => ({
                        ...d,
                        time: d.timestamp,
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
                          const num = Number(value);
                          return [
                            Number.isFinite(num) ? num.toFixed(3) : "—",
                            "Score",
                          ];
                        }}
                        contentStyle={{
                          background: "#27272a",
                          border: "1px solid #3f3f46",
                        }}
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
                </div>
              </>
            )}
          </>
        ) : (
          <p style={{ margin: 0, color: "#a1a1aa", fontSize: 14 }}>
            No composite data yet. Data is updated periodically.
          </p>
        )}
      </section>

      <section style={cardStyle} aria-label="Indices and breakdown">
        <h3 style={subsectionTitleStyle}>Indices & breakdown</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          {INDEX_CARDS.map(({ key, label, rawLabel }) => (
            <IndexCard
              key={key}
              label={label}
              value={indices[key]}
              rawLabel={rawLabel}
            />
          ))}
          <div
            style={{
              gridColumn: "span 2",
              padding: 12,
              background: "#27272a",
              borderRadius: 8,
              fontSize: 12,
              color: "#a1a1aa",
              minHeight: 0,
            }}
          >
            <div style={{ marginBottom: 6, fontWeight: 600 }}>Composite components</div>
            {["text", "funding", "on_chain", "fear_greed", "google_trends"].map((k) => {
              const v = components && typeof components === "object" ? components[k] : undefined;
              return (
                <div key={k} style={{ marginBottom: 2 }}>
                  {k}: {Number.isFinite(Number(v)) ? Number(v).toFixed(3) : "—"}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
