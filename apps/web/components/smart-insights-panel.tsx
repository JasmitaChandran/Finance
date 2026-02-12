"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { SmartInsightsData } from "@/lib/types";

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function badgeTone(level: string): string {
  const normalized = level.toLowerCase();
  if (normalized.includes("high")) return "text-danger border-danger/40 bg-danger/10";
  if (normalized.includes("medium")) return "text-warning border-warning/40 bg-warning/10";
  if (normalized.includes("low")) return "text-success border-success/40 bg-success/10";
  if (normalized.includes("positive")) return "text-success border-success/40 bg-success/10";
  if (normalized.includes("negative")) return "text-danger border-danger/40 bg-danger/10";
  return "text-textMuted border-borderGlass bg-bgSoft";
}

function probabilityBar(label: string, value: number | null | undefined, colorClass: string) {
  const numeric = value === null || value === undefined || Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-textMuted">{label}</span>
        <span className="text-textMain">{numeric.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-borderGlass/40">
        <div className={`h-2 rounded-full ${colorClass}`} style={{ width: `${numeric}%` }} />
      </div>
    </div>
  );
}

export function SmartInsightsPanel({ symbol, currency }: { symbol: string; currency?: string }) {
  const [data, setData] = useState<SmartInsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEli15, setShowEli15] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setShowEli15(false);

    api
      .getSmartInsights(symbol)
      .then((response) => {
        if (!active) return;
        setData(response);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load smart insights.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [symbol]);

  const revenueChartData = useMemo(() => {
    const history = (data?.forecast_revenue_ml.history || []).map((item) => ({ year: String(item.year), history: item.revenue, forecast: null }));
    const forecast = (data?.forecast_revenue_ml.forecast || []).map((item) => ({ year: String(item.year), history: null, forecast: item.revenue }));
    return [...history, ...forecast];
  }, [data]);

  return (
    <section className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg">AI & Smart Features</h3>
          <p className="mt-1 text-xs text-textMuted">AI summary, transcript insights, risk and fraud signals, earnings probability, ML forecast, sentiment, and buy/sell score.</p>
        </div>
        <button
          onClick={() => setShowEli15((prev) => !prev)}
          className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-textMain hover:border-accent"
        >
          Explain this stock like I&apos;m 15
        </button>
      </div>

      {loading && <p className="mt-3 text-xs text-textMuted">Loading smart features...</p>}
      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      {!loading && data && (
        <>
          {showEli15 && (
            <div className="mt-4 rounded-xl border border-borderGlass bg-bgSoft p-4">
              <p className="text-sm text-textMain">{data.eli15_summary || data.ai_stock_summary.eli15_summary}</p>
            </div>
          )}

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-textMain">AI-generated Stock Summary</h4>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${badgeTone(data.ai_stock_summary.risk_level)}`}>{data.ai_stock_summary.risk_level} risk</span>
              </div>
              <p className="mt-2 text-sm text-textMuted">{data.ai_stock_summary.eli15_summary}</p>
              <div className="mt-3 grid gap-2">
                <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
                  <p className="font-semibold text-textMain">Bull case</p>
                  <p className="mt-1 text-textMuted">{data.ai_stock_summary.bull_case}</p>
                </div>
                <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
                  <p className="font-semibold text-textMain">Bear case</p>
                  <p className="mt-1 text-textMuted">{data.ai_stock_summary.bear_case}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-textMain">Earnings Call Transcript Summary</h4>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${data.earnings_call_transcript_summary.available ? "text-success border-success/40 bg-success/10" : "text-warning border-warning/40 bg-warning/10"}`}>
                  {data.earnings_call_transcript_summary.available ? "Transcript found" : "Fallback"}
                </span>
              </div>
              <p className="mt-2 text-xs text-textMuted">
                Source: {data.earnings_call_transcript_summary.source}
                {data.earnings_call_transcript_summary.quarter ? ` • ${data.earnings_call_transcript_summary.quarter}` : ""}
              </p>
              <p className="mt-2 text-sm text-textMuted">{data.earnings_call_transcript_summary.summary}</p>
              <div className="mt-3 space-y-1">
                {data.earnings_call_transcript_summary.highlights.slice(0, 5).map((item) => (
                  <p key={item} className="text-xs text-textMuted">
                    • {item}
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-textMain">Risk Analysis in Plain English</h4>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${badgeTone(data.risk_analysis_plain_english.risk_level)}`}>
                  {data.risk_analysis_plain_english.risk_level} ({data.risk_analysis_plain_english.risk_score})
                </span>
              </div>
              <p className="mt-2 text-sm text-textMuted">{data.risk_analysis_plain_english.explanation}</p>
              <div className="mt-3 grid gap-2">
                {data.risk_analysis_plain_english.factors.slice(0, 6).map((factor) => (
                  <div key={factor.factor} className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-textMain">{factor.factor}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${badgeTone(factor.level)}`}>{factor.level}</span>
                    </div>
                    <p className="mt-1 text-textMuted">
                      {factor.value !== null && factor.value !== undefined ? `Value: ${factor.value}. ` : ""}
                      {factor.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-textMain">Fraud Detection Signals</h4>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${badgeTone(data.fraud_detection_signals.risk_level)}`}>
                  {data.fraud_detection_signals.risk_level} ({data.fraud_detection_signals.risk_score})
                </span>
              </div>
              <p className="mt-2 text-sm text-textMuted">{data.fraud_detection_signals.summary}</p>
              <div className="mt-3 space-y-2">
                {data.fraud_detection_signals.signals.map((signal) => (
                  <div key={signal.name} className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-textMain">{signal.name}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] ${
                          signal.triggered ? (signal.severity === "high" ? "text-danger border-danger/40 bg-danger/10" : "text-warning border-warning/40 bg-warning/10") : "text-success border-success/40 bg-success/10"
                        }`}
                      >
                        {signal.triggered ? "Triggered" : "Clear"}
                      </span>
                    </div>
                    <p className="mt-1 text-textMuted">
                      {signal.value !== null && signal.value !== undefined ? `Value: ${signal.value}. ` : ""}
                      Threshold: {signal.threshold}. {signal.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
              <h4 className="font-semibold text-textMain">Earnings Surprise Probability</h4>
              <p className="mt-1 text-xs text-textMuted">{data.earnings_surprise_probability.explanation}</p>
              <div className="mt-3 space-y-2">
                {probabilityBar("Beat", data.earnings_surprise_probability.beat_probability, "bg-success")}
                {probabilityBar("Miss", data.earnings_surprise_probability.miss_probability, "bg-danger")}
              </div>
              <p className="mt-3 text-xs text-textMuted">
                Confidence: {formatPercent(data.earnings_surprise_probability.confidence)} • Quarters used: {data.earnings_surprise_probability.sample_quarters}
                {data.earnings_surprise_probability.average_surprise_percent !== null &&
                  data.earnings_surprise_probability.average_surprise_percent !== undefined &&
                  ` • Avg surprise: ${formatPercent(data.earnings_surprise_probability.average_surprise_percent)}`}
              </p>
            </div>

            <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
              <h4 className="font-semibold text-textMain">Sentiment Analysis from News</h4>
              <div className="mt-2 flex items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${badgeTone(data.sentiment_analysis_from_news.label)}`}>
                  {data.sentiment_analysis_from_news.label}
                </span>
                <span className="text-xs text-textMuted">Score: {data.sentiment_analysis_from_news.score}</span>
              </div>
              <p className="mt-2 text-xs text-textMuted">
                Sources: {data.sentiment_analysis_from_news.source_count} • Positive hits: {data.sentiment_analysis_from_news.positive_hits} • Negative hits: {data.sentiment_analysis_from_news.negative_hits}
              </p>
              <div className="mt-3 space-y-1">
                {data.sentiment_analysis_from_news.highlights.slice(0, 4).map((item) => (
                  <p key={item} className="text-xs text-textMuted">
                    • {item}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
              <h4 className="font-semibold text-textMain">Buy / Sell Probability Score</h4>
              <p className="mt-1 text-xs text-textMuted">
                Recommendation: <span className="text-textMain">{data.buy_sell_probability_score.recommendation}</span> • Confidence {formatPercent(data.buy_sell_probability_score.confidence)}
              </p>
              <div className="mt-3 space-y-2">
                {probabilityBar("Buy", data.buy_sell_probability_score.buy_probability, "bg-success")}
                {probabilityBar("Sell", data.buy_sell_probability_score.sell_probability, "bg-danger")}
                {probabilityBar("Hold", data.buy_sell_probability_score.hold_probability, "bg-warning")}
              </div>
              <div className="mt-3 space-y-1">
                {data.buy_sell_probability_score.rationale.slice(0, 5).map((item) => (
                  <p key={item} className="text-xs text-textMuted">
                    • {item}
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-borderGlass bg-bgSoft p-4">
            <h4 className="font-semibold text-textMain">Forecast Revenue Using ML</h4>
            <p className="mt-1 text-xs text-textMuted">
              {data.forecast_revenue_ml.model}
              {data.forecast_revenue_ml.r2_score !== null && data.forecast_revenue_ml.r2_score !== undefined
                ? ` • R²: ${data.forecast_revenue_ml.r2_score}`
                : ""}
              {data.forecast_revenue_ml.estimated_cagr_percent !== null && data.forecast_revenue_ml.estimated_cagr_percent !== undefined
                ? ` • Forecast CAGR: ${formatPercent(data.forecast_revenue_ml.estimated_cagr_percent)}`
                : ""}
            </p>
            <p className="mt-1 text-xs text-textMuted">{data.forecast_revenue_ml.explanation}</p>

            <div className="mt-3 h-64 w-full rounded-lg border border-borderGlass bg-card p-2">
              <ResponsiveContainer>
                <LineChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="year" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number | string) => {
                      if (typeof value !== "number") return value;
                      return formatCurrency(value, currency || "USD");
                    }}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--border-glass)",
                      background: "var(--card)",
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="history" stroke="#22d3ee" strokeWidth={2.2} dot={{ r: 3 }} name="Historical Revenue" />
                  <Line type="monotone" dataKey="forecast" stroke="#34d399" strokeDasharray="5 4" strokeWidth={2.2} dot={{ r: 3 }} name="ML Forecast" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
