import React, { Component, useState } from "react";
import SentimentIndicator from "./components/SentimentIndicator";
import CompositeIndicesView from "./components/CompositeIndicesView";

class SentimentErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <section
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: 24,
            background: "#18181b",
            borderRadius: 12,
          }}
        >
          <p role="alert" style={{ color: "#f87171" }}>
            Something went wrong loading sentiment. Refresh the page or try another symbol.
          </p>
        </section>
      );
    }
    return this.props.children;
  }
}

const PROVIDER_OPTIONS = [
  { value: "massive", label: "Massive" },
  { value: "finnhub", label: "Finnhub" },
  { value: "alphavantage", label: "Alpha Vantage" },
  { value: "yfinance", label: "Yahoo Finance" },
];

const AGGREGATION_OPTIONS = [
  { value: "mean", label: "Mean" },
  { value: "trimmed_mean", label: "Trimmed mean" },
  { value: "median", label: "Median" },
];

const CONTAINER_MAX_WIDTH = 720;
const SPACING = 20;

const inputStyle = {
  padding: "8px 12px",
  background: "#27272a",
  color: "#e4e4e7",
  border: "1px solid #3f3f46",
  borderRadius: 6,
  minWidth: 120,
  fontSize: 14,
};

const labelStyle = { color: "#e4e4e7", fontWeight: 500, fontSize: 14 };

const sectionLabelStyle = {
  margin: 0,
  marginBottom: 10,
  fontSize: 12,
  color: "#a1a1aa",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const controlCardStyle = {
  maxWidth: CONTAINER_MAX_WIDTH,
  margin: "0 auto",
  marginBottom: SPACING,
  padding: SPACING,
  background: "#18181b",
  borderRadius: 12,
  boxSizing: "border-box",
};

const TAB_SENTIMENT = "sentiment";
const TAB_COMPOSITE = "composite";

export default function App() {
  const [activeTab, setActiveTab] = useState(TAB_SENTIMENT);
  const [searchInput, setSearchInput] = useState("AAPL");
  const [provider, setProvider] = useState("massive");
  const [submittedAsset, setSubmittedAsset] = useState(null);
  const [submittedProvider, setSubmittedProvider] = useState(null);
  const [useTimeDecay, setUseTimeDecay] = useState(false);
  const [aggregationMode, setAggregationMode] = useState("mean");
  const [includeUncertainty, setIncludeUncertainty] = useState(true);
  const [usePrimeModular, setUsePrimeModular] = useState(false);

  const handleGetSentiment = () => {
    const symbol = searchInput.trim().toUpperCase();
    if (symbol) {
      setSubmittedAsset(symbol);
      setSubmittedProvider(provider);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleGetSentiment();
  };

  const options = {
    useTimeDecay,
    aggregationMode,
    includeUncertainty,
    usePrimeModular,
  };

  return (
    <div
      style={{
        padding: 24,
        minHeight: "100vh",
        boxSizing: "border-box",
        maxWidth: CONTAINER_MAX_WIDTH + 48,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: SPACING }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#e4e4e7" }}>
          Market Sentiment Indicator
        </h1>
        <div
          role="tablist"
          aria-label="Main tabs"
          style={{
            display: "flex",
            gap: 0,
            marginTop: 12,
            borderBottom: "1px solid #27272a",
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === TAB_SENTIMENT}
            aria-controls="tabpanel-sentiment"
            id="tab-sentiment"
            onClick={() => setActiveTab(TAB_SENTIMENT)}
            style={{
              padding: "10px 16px",
              background: "none",
              border: "none",
              borderBottom: activeTab === TAB_SENTIMENT ? "2px solid #6366f1" : "2px solid transparent",
              color: activeTab === TAB_SENTIMENT ? "#e4e4e7" : "#71717a",
              fontWeight: activeTab === TAB_SENTIMENT ? 600 : 400,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Market Sentiment
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === TAB_COMPOSITE}
            aria-controls="tabpanel-composite"
            id="tab-composite"
            onClick={() => setActiveTab(TAB_COMPOSITE)}
            style={{
              padding: "10px 16px",
              background: "none",
              border: "none",
              borderBottom: activeTab === TAB_COMPOSITE ? "2px solid #6366f1" : "2px solid transparent",
              color: activeTab === TAB_COMPOSITE ? "#e4e4e7" : "#71717a",
              fontWeight: activeTab === TAB_COMPOSITE ? 600 : 400,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Composite & Indices
          </button>
        </div>
      </header>

      {activeTab === TAB_COMPOSITE ? (
        <div id="tabpanel-composite" role="tabpanel" aria-labelledby="tab-composite">
          <CompositeIndicesView />
        </div>
      ) : (
        <div id="tabpanel-sentiment" role="tabpanel" aria-labelledby="tab-sentiment">
      <section style={controlCardStyle} aria-label="Controls">
        <h2 style={sectionLabelStyle}>Lookup</h2>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            marginBottom: SPACING,
          }}
        >
          <label htmlFor="symbol-search" style={labelStyle}>
            Symbol
          </label>
          <input
            id="symbol-search"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. AAPL, BTC, TSLA"
            style={inputStyle}
          />
          <label htmlFor="provider-select" style={labelStyle}>
            API
          </label>
          <select
            id="provider-select"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            style={inputStyle}
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleGetSentiment}
            disabled={!searchInput.trim()}
            style={{
              padding: "8px 20px",
              background: searchInput.trim() ? "#6366f1" : "#3f3f46",
              color: "#e4e4e7",
              border: "none",
              borderRadius: 6,
              cursor: searchInput.trim() ? "pointer" : "not-allowed",
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            Get sentiment
          </button>
        </div>

        <h2 style={{ ...sectionLabelStyle, marginBottom: 10 }}>Options</h2>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label htmlFor="aggregation-mode" style={labelStyle}>
              Aggregation
            </label>
            <select
              id="aggregation-mode"
              value={aggregationMode}
              onChange={(e) => setAggregationMode(e.target.value)}
              style={{ ...inputStyle, minWidth: 130 }}
            >
              {AGGREGATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              id="use-time-decay"
              type="checkbox"
              checked={useTimeDecay}
              onChange={(e) => setUseTimeDecay(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#6366f1" }}
            />
            <label htmlFor="use-time-decay" style={labelStyle}>
              Time decay
            </label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              id="include-uncertainty"
              type="checkbox"
              checked={includeUncertainty}
              onChange={(e) => setIncludeUncertainty(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#6366f1" }}
            />
            <label htmlFor="include-uncertainty" style={labelStyle}>
              Uncertainty
            </label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              id="use-prime-modular"
              type="checkbox"
              checked={usePrimeModular}
              onChange={(e) => setUsePrimeModular(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#6366f1" }}
            />
            <label htmlFor="use-prime-modular" style={labelStyle}>
              Prime-modular
            </label>
          </div>
        </div>
      </section>

      {submittedAsset ? (
        <SentimentErrorBoundary key={submittedAsset}>
          <SentimentIndicator
            asset={submittedAsset}
            provider={submittedProvider ?? provider}
            options={options}
          />
        </SentimentErrorBoundary>
      ) : (
        <section
          aria-label="Sentiment placeholder"
          style={{
            maxWidth: CONTAINER_MAX_WIDTH,
            margin: "0 auto",
            padding: 28,
            background: "#18181b",
            borderRadius: 12,
            boxSizing: "border-box",
          }}
        >
          <p style={{ margin: 0, color: "#a1a1aa", fontSize: 14 }}>
            Enter a symbol, select an API, and click Get sentiment to load data.
          </p>
        </section>
      )}
        </div>
      )}
    </div>
  );
}
