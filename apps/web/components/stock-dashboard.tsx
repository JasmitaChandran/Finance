"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BadgeIndianRupee,
  BarChart3,
  Clock3,
  Database,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinancialStatementsPanel } from "@/components/financial-statements-panel";
import { MetricChip } from "@/components/metric-chip";
import { PriceChart } from "@/components/price-chart";
import { RatioDashboardPanel } from "@/components/ratio-dashboard-panel";
import { SmartInsightsPanel } from "@/components/smart-insights-panel";
import { TechnicalAnalysisPanel } from "@/components/technical-analysis-panel";
import { useUI } from "@/components/providers";
import { ValuationEnginePanel } from "@/components/valuation-engine-panel";
import { VisualizationToolsPanel } from "@/components/visualization-tools-panel";
import { api } from "@/lib/api";
import { formatCurrency, formatLarge, formatLargeByCurrencyMode, ratioToPercent } from "@/lib/format";
import type { NewsSummary, StockDashboard as StockDashboardType, StockSummary } from "@/lib/types";

type UniverseStock = {
  symbol: string;
  name: string;
  exchange: string;
  country?: string;
  currency?: string;
};

type SearchSuggestion = { symbol: string; name: string; exchange?: string; country?: string; currency?: string };

type CompareRow = {
  symbol: string;
  name?: string | null;
  price?: number | null;
  market_cap?: number | null;
  pe?: number | null;
  roe?: number | null;
  revenue_growth?: number | null;
  profit_margin?: number | null;
  currency?: string | null;
  similarity_score?: number | null;
  benchmark_rank?: number | null;
  sector_match?: boolean | null;
  industry_match?: boolean | null;
  market_cap_distance_percent?: number | null;
};

type LoadWarning = { section: string; message: string };
type DataSourcePanelMeta = NonNullable<StockDashboardType["data_sources"]>["panels"] extends infer P
  ? P extends Record<string, infer V>
    ? V
    : never
  : never;

type ScoreBreakdown = {
  quality: number;
  growth: number;
  valuation: number;
  risk: number;
  momentum: number;
};

type ChartPresetId = "1d" | "1w" | "1m" | "6m" | "1y" | "5y" | "max";
type CurrencyDisplayMode = "intl" | "indian";

type CacheEntry<T> = { at: number; data: T };

const DASHBOARD_CACHE = new Map<string, CacheEntry<StockDashboardType>>();
const SUMMARY_CACHE = new Map<string, CacheEntry<StockSummary>>();
const NEWS_CACHE = new Map<string, CacheEntry<NewsSummary>>();
const HISTORY_CACHE = new Map<string, CacheEntry<Array<{ date: string; close: number; volume: number }>>>();
const PEER_CACHE = new Map<string, CacheEntry<CompareRow[]>>();

const DASHBOARD_TTL_MS = 30_000;
const SUMMARY_TTL_MS = 5 * 60_000;
const NEWS_TTL_MS = 2 * 60_000;
const HISTORY_TTL_MS = 2 * 60_000;
const PEER_TTL_MS = 5 * 60_000;

const CHART_PRESETS: Array<{ id: ChartPresetId; label: string; period: string; points?: number; periodLabel: string }> = [
  { id: "1d", label: "1D", period: "5d", points: 2, periodLabel: "1 day view" },
  { id: "1w", label: "1W", period: "1mo", points: 7, periodLabel: "1 week view" },
  { id: "1m", label: "1M", period: "1mo", periodLabel: "1 month view" },
  { id: "6m", label: "6M", period: "6mo", periodLabel: "6 months view" },
  { id: "1y", label: "1Y", period: "1y", periodLabel: "1 year view" },
  { id: "5y", label: "5Y", period: "5y", periodLabel: "5 years view" },
  { id: "max", label: "Max", period: "max", periodLabel: "Max available history" },
];

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string, ttlMs: number): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > ttlMs) return null;
  return entry.data;
}

function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, data: T) {
  map.set(key, { at: Date.now(), data });
}

function toNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function formatSignedPercent(value: number | null, digits = 2): string {
  if (value === null) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function formatPercentValue(value: number | null | undefined, suffix = "%"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const numeric = Math.abs(value) < 2 ? value * 100 : value;
  return `${numeric.toFixed(2)}${suffix}`;
}

function formatNumberValue(value: number | null | undefined, digits = 2, suffix = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(digits)}${suffix}`;
}

function computeReturn(current: number | null, base: number | null): number | null {
  if (current === null || base === null || base === 0) return null;
  return ((current - base) / base) * 100;
}

function annualizedVolatility(history: Array<{ close: number }>): number | null {
  if (history.length < 20) return null;
  const returns: number[] = [];
  for (let i = 1; i < history.length; i += 1) {
    const prev = history[i - 1]?.close;
    const curr = history[i]?.close;
    if (typeof prev === "number" && typeof curr === "number" && prev > 0) returns.push((curr - prev) / prev);
  }
  if (!returns.length) return null;
  const mean = returns.reduce((sum, item) => sum + item, 0) / returns.length;
  const variance = returns.reduce((sum, item) => sum + (item - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function valuationSignal(pe: number | null) {
  if (pe === null) return { label: "Unknown", toneClass: "text-textMuted", description: "Not enough valuation data yet." };
  if (pe < 20) return { label: "Reasonable", toneClass: "text-success", description: "Compared to earnings, this price is not stretched." };
  if (pe <= 35) return { label: "Balanced", toneClass: "text-warning", description: "Valuation is fair, but growth must stay strong." };
  return { label: "Expensive", toneClass: "text-danger", description: "Market expects high future growth; risk is higher if growth slows." };
}

function qualitySignal(roe: number | null, margin: number | null) {
  if (roe === null && margin === null) {
    return { label: "Unknown", toneClass: "text-textMuted", description: "Quality score needs ROE and margin data." };
  }
  const strongRoe = roe !== null && roe >= 0.15;
  const strongMargin = margin !== null && margin >= 0.12;
  if (strongRoe && strongMargin) {
    return { label: "Strong", toneClass: "text-success", description: "Business appears efficient and keeps healthy profits." };
  }
  if (strongRoe || strongMargin) {
    return { label: "Mixed", toneClass: "text-warning", description: "One quality metric is strong, but not both." };
  }
  return { label: "Weak", toneClass: "text-danger", description: "Profit quality appears low versus peers." };
}

function debtSignal(debtToEquity: number | null) {
  if (debtToEquity === null) {
    return { label: "Unknown", toneClass: "text-textMuted", description: "Debt data unavailable from provider." };
  }
  if (debtToEquity < 1) return { label: "Comfortable", toneClass: "text-success", description: "Debt level looks manageable for most sectors." };
  if (debtToEquity <= 2) return { label: "Watch", toneClass: "text-warning", description: "Debt is moderate; cash flow quality matters more here." };
  return { label: "High", toneClass: "text-danger", description: "Leverage is high and can increase downside during stress." };
}

function scoreBand(value: number, goodThreshold: number, okayThreshold: number) {
  if (value >= goodThreshold) return "text-success";
  if (value >= okayThreshold) return "text-warning";
  return "text-danger";
}

function formatTimeLabel(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatRelativeTime(date: Date | null) {
  if (!date) return "unknown";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 10_000) return "just now";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function getSessionInfo(symbol: string) {
  const upper = symbol.toUpperCase();
  const isNse = upper.endsWith(".NS");
  const isBse = upper.endsWith(".BO");
  const exchange = isNse ? "NSE" : isBse ? "BSE" : "US";
  const timeZone = isNse || isBse ? "Asia/Kolkata" : "America/New_York";
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const minutes = hour * 60 + minute;
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const open = isNse || isBse ? 9 * 60 + 15 : 9 * 60 + 30;
  const close = isNse || isBse ? 15 * 60 + 30 : 16 * 60;
  const isOpen = isWeekday && minutes >= open && minutes <= close;
  return {
    exchange,
    timeZoneLabel: isNse || isBse ? "IST" : "ET",
    status: isOpen ? "Open" : "Closed",
    note: isNse || isBse ? "India session 09:15–15:30 IST" : "US session 09:30–16:00 ET",
  };
}

function buildFallbackSummary(symbol: string, pe: number | null, roe: number | null, debtToEquity: number | null): StockSummary {
  const riskLevel = debtToEquity !== null && debtToEquity > 2 ? "High" : debtToEquity !== null && debtToEquity > 1 ? "Medium" : "Low";
  const valuationText = pe === null ? "valuation data is limited" : pe > 35 ? "valuation looks expensive" : pe < 20 ? "valuation looks reasonable" : "valuation looks balanced";
  const qualityText = roe === null ? "quality data is limited" : roe > 0.15 ? "profitability looks strong" : "profitability looks mixed";
  return {
    eli15_summary: `${symbol} snapshot loaded, but AI summary service is unavailable right now. Based on current metrics, ${valuationText} and ${qualityText}.`,
    bull_case: "Strong execution and improving earnings can support long-term upside if fundamentals remain stable.",
    bear_case: "Valuation, debt, or slowing growth can pressure returns if expectations are too high.",
    risk_level: riskLevel,
    suitable_for: ["Long-term", "Research-first"],
  };
}

function buildScoreBreakdown(args: {
  pe: number | null;
  roe: number | null;
  profitMargin: number | null;
  debtToEquity: number | null;
  revenueGrowth: number | null;
  oneMonthReturn: number | null;
  sixMonthReturn: number | null;
  volatility: number | null;
  beta: number | null;
}) {
  const { pe, roe, profitMargin, debtToEquity, revenueGrowth, oneMonthReturn, sixMonthReturn, volatility, beta } = args;

  const quality = clamp(
    50 + (roe ?? 0) * 180 + (profitMargin ?? 0) * 140 - Math.max(0, ((debtToEquity ?? 0) - 1.5) * 12)
  );
  const growth = clamp(
    45 + (revenueGrowth ?? 0) * 220 + ((sixMonthReturn ?? 0) * 0.35) + ((oneMonthReturn ?? 0) * 0.2)
  );
  const valuation = pe === null ? 50 : clamp(100 - pe * 2.1 + (pe < 0 ? -20 : 0));
  const risk = clamp(
    80 - Math.max(0, (debtToEquity ?? 0) - 1) * 18 - Math.max(0, (volatility ?? 0) - 20) * 1.4 - Math.max(0, Math.abs(beta ?? 1) - 1) * 12
  );
  const momentum = clamp(50 + (oneMonthReturn ?? 0) * 1.3 + (sixMonthReturn ?? 0) * 0.7);

  const breakdown: ScoreBreakdown = {
    quality: Math.round(quality),
    growth: Math.round(growth),
    valuation: Math.round(valuation),
    risk: Math.round(risk),
    momentum: Math.round(momentum),
  };

  const total = Math.round((breakdown.quality + breakdown.growth + breakdown.valuation + breakdown.risk + breakdown.momentum) / 5);
  return { breakdown, total };
}

function compactCap(value: number | null | undefined, currency: string | undefined, mode: CurrencyDisplayMode) {
  return formatLargeByCurrencyMode(value ?? null, currency, mode);
}

function SkeletonBlock({ className = "h-6" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-bgSoft ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="rounded-2xl border border-borderGlass bg-card p-4">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="mt-3 h-8 w-20" />
            <SkeletonBlock className="mt-3 h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-borderGlass bg-card p-4">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="mt-4 h-72 w-full" />
        </div>
        <div className="rounded-2xl border border-borderGlass bg-card p-4">
          <SkeletonBlock className="h-4 w-28" />
          <div className="mt-4 space-y-3">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreStrip({
  breakdown,
  total,
  expanded,
  onToggle,
}: {
  breakdown: ScoreBreakdown;
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const entries: Array<{ key: keyof ScoreBreakdown; label: string; help: string }> = [
    { key: "quality", label: "Quality", help: "ROE, margin, leverage quality" },
    { key: "growth", label: "Growth", help: "Revenue growth and trend strength" },
    { key: "valuation", label: "Valuation", help: "P/E-based affordability score" },
    { key: "risk", label: "Risk", help: "Debt, volatility, and beta" },
    { key: "momentum", label: "Momentum", help: "1M and 6M price behavior" },
  ];

  return (
    <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-display text-lg">At-a-glance Score Strip</h3>
          <p className="text-xs text-textMuted">Fast factor view for beginners and a transparent anchor for pro users.</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-2 rounded-lg border border-borderGlass bg-bgSoft px-3 py-2 text-xs text-textMain hover:bg-cardHover"
        >
          Why this score? <span className="rounded bg-card px-2 py-0.5 text-[11px]">Total {total}/100</span>
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {entries.map((entry) => {
          const value = breakdown[entry.key];
          return (
            <div key={entry.key} className="rounded-xl border border-borderGlass bg-bgSoft p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-wide text-textMuted">{entry.label}</p>
                <span className={`text-sm font-semibold ${scoreBand(value, 70, 45)}`}>{value}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-card">
                <div
                  className={`h-2 rounded-full ${value >= 70 ? "bg-success" : value >= 45 ? "bg-warning" : "bg-danger"}`}
                  style={{ width: `${Math.max(6, value)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-textMuted">{entry.help}</p>
            </div>
          );
        })}
      </div>

      {expanded && (
        <div className="mt-4 rounded-xl border border-borderGlass bg-bgSoft p-4 text-sm">
          <p className="font-semibold text-textMain">Score breakdown</p>
          <p className="mt-1 text-textMuted">
            Quality {breakdown.quality} + Growth {breakdown.growth} + Valuation {breakdown.valuation} + Risk {breakdown.risk} + Momentum {breakdown.momentum}
            , averaged into <span className="font-semibold text-textMain">{total}/100</span>.
          </p>
          <p className="mt-2 text-xs text-textMuted">
            These are explainable factor scores derived from available free-provider metrics (not a prediction or investment advice).
          </p>
        </div>
      )}
    </div>
  );
}

function CollapsiblePanel({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-2xl border border-borderGlass bg-card p-0 shadow-glow">
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-textMain">
        {title}
      </summary>
      <div className="px-0 pb-0">{children}</div>
    </details>
  );
}

function InlineWarningBanners({ warnings }: { warnings: LoadWarning[] }) {
  if (!warnings.length) return null;
  return (
    <div className="space-y-2">
      {warnings.map((warning, idx) => (
        <div key={`${warning.section}-${idx}`} className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
          <span className="font-semibold">{warning.section}:</span> {warning.message}
        </div>
      ))}
    </div>
  );
}

function DataSourceStrip({
  lastUpdated,
  symbol,
  newsCount,
  dataSources,
}: {
  lastUpdated: Date | null;
  symbol: string;
  newsCount: number;
  dataSources?: StockDashboardType["data_sources"];
}) {
  const session = getSessionInfo(symbol);
  const panels = dataSources?.panels || {};
  const quoteMeta = (panels.quote || {}) as DataSourcePanelMeta;
  const financialsMeta = (panels.financials || {}) as DataSourcePanelMeta;
  const eventsMeta = (panels.events || {}) as DataSourcePanelMeta;
  return (
    <div className="rounded-2xl border border-borderGlass bg-card p-4 shadow-glow">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <div className="flex items-center gap-2 text-textMain"><Clock3 className="h-4 w-4 text-accent" /> Data freshness</div>
          <p className="mt-2 text-textMuted">Last updated: <span className="text-textMain">{formatTimeLabel(lastUpdated)}</span></p>
          <p className="mt-1 text-textMuted">Relative: <span className="text-textMain">{formatRelativeTime(lastUpdated)}</span></p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <div className="flex items-center gap-2 text-textMain"><Database className="h-4 w-4 text-accent" /> Source labels</div>
          <p className="mt-2 text-textMuted">Price & charts: <span className="text-textMain">{String(quoteMeta.source || "unknown")}</span></p>
          <p className="mt-1 text-textMuted">Financials: <span className="text-textMain">{String(financialsMeta.source || "fallback")}</span></p>
          <p className="mt-1 text-textMuted">Events: <span className="text-textMain">{String(eventsMeta.source || "unavailable")}</span></p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <div className="flex items-center gap-2 text-textMain"><Activity className="h-4 w-4 text-accent" /> Market session</div>
          <p className="mt-2 text-textMuted">Exchange: <span className="text-textMain">{session.exchange}</span></p>
          <p className="mt-1 text-textMuted">Status: <span className={session.status === "Open" ? "text-success" : "text-warning"}>{session.status}</span> ({session.timeZoneLabel})</p>
          <p className="mt-1 text-textMuted">{session.note}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <div className="flex items-center gap-2 text-textMain"><BarChart3 className="h-4 w-4 text-accent" /> News & AI</div>
          <p className="mt-2 text-textMuted">News summary feed: <span className="text-textMain">{newsCount} sources</span></p>
          <p className="mt-1 text-textMuted">AI explanations: <span className="text-textMain">On-demand metric explainer</span></p>
          <p className="mt-1 text-textMuted">
            Cache status: <span className="text-textMain">{String(quoteMeta.cache_status || "n/a")}</span>
            {quoteMeta.fallback_used ? <span className="text-warning"> • fallback used</span> : null}
          </p>
        </div>
      </div>
    </div>
  );
}

function WhatChangedTodayPanel({
  change1d,
  volume,
  avgVolume,
  news,
  valuation,
  quality,
  leverage,
  revenueGrowth,
  profitMargin,
}: {
  change1d: number | null;
  volume: number | null;
  avgVolume: number | null;
  news: NewsSummary | null;
  valuation: ReturnType<typeof valuationSignal>;
  quality: ReturnType<typeof qualitySignal>;
  leverage: ReturnType<typeof debtSignal>;
  revenueGrowth: number | null;
  profitMargin: number | null;
}) {
  const volumeRatio = volume && avgVolume && avgVolume > 0 ? volume / avgVolume : null;
  const volumeMessage =
    volumeRatio === null
      ? "Volume context unavailable for today."
      : volumeRatio >= 1.8
        ? `Unusual volume spike (${volumeRatio.toFixed(1)}x vs recent average).`
        : volumeRatio >= 1.2
          ? `Volume is elevated (${volumeRatio.toFixed(1)}x vs recent average).`
          : `Volume is near normal (${volumeRatio.toFixed(1)}x recent average).`;

  const priceDriver =
    change1d === null
      ? "Price move data unavailable right now."
      : change1d >= 2
        ? `Strong upside move (${formatSignedPercent(change1d)}) - momentum buyers may be active.`
        : change1d <= -2
          ? `Sharp downside move (${formatSignedPercent(change1d)}) - watch news and support levels.`
          : `Contained move (${formatSignedPercent(change1d)}) - price action is relatively stable today.`;

  const sentimentMsg = news
    ? `News sentiment is ${news.sentiment.toLowerCase()} from ${news.source_count} summarized sources.`
    : "News sentiment feed unavailable, showing dashboard with market and fundamental data only.";

  return (
    <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <h3 className="font-display text-lg">What changed today?</h3>
      <p className="text-xs text-textMuted">Live context panel for price move drivers, news tone, volume behavior, and latest metric cues.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm text-textMuted">
          <p className="font-semibold text-textMain">Price move drivers</p>
          <p className="mt-2">{priceDriver}</p>
          <p className="mt-2">{volumeMessage}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm text-textMuted">
          <p className="font-semibold text-textMain">News sentiment change</p>
          <p className="mt-2">{sentimentMsg}</p>
          <p className="mt-2">Valuation: <span className={valuation.toneClass}>{valuation.label}</span> • Quality: <span className={quality.toneClass}>{quality.label}</span> • Debt: <span className={leverage.toneClass}>{leverage.label}</span></p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs text-textMuted">
        Key metric snapshot (latest available): Revenue Growth <span className="text-textMain">{formatPercentValue(revenueGrowth)}</span> YoY • Profit Margin <span className="text-textMain">{formatPercentValue(profitMargin)}</span>. Quarter-over-quarter deltas depend on provider coverage and are shown when available.
      </div>
    </div>
  );
}

function ActionableInsightsPanel({
  symbol,
  summary,
  valuation,
  leverage,
  oneMonthReturn,
  news,
}: {
  symbol: string;
  summary: StockSummary;
  valuation: ReturnType<typeof valuationSignal>;
  leverage: ReturnType<typeof debtSignal>;
  oneMonthReturn: number | null;
  news: NewsSummary | null;
}) {
  const actions: string[] = [];
  const risks: string[] = [];

  actions.push("Add to watchlist and set an alert near recent support/resistance.");
  actions.push(`Compare ${symbol} with 3 peers before making a decision.`);
  if (summary.risk_level.toLowerCase() === "high") actions.push("Use smaller position sizing and review debt + volatility before entry.");
  if (summary.risk_level.toLowerCase() !== "high") actions.push("Track next earnings and management commentary for guidance changes.");

  if (valuation.label === "Expensive") risks.push("High valuation: expectations are elevated, so misses can re-rate the stock down.");
  if (leverage.label === "High") risks.push("Debt risk: leverage is high and can amplify downside in weak cycles.");
  if (oneMonthReturn !== null && oneMonthReturn < -8) risks.push("Momentum weakness: recent price trend is under pressure.");
  if (news?.sentiment === "Negative") risks.push("Negative news tone may impact sentiment and short-term volatility.");
  if (!risks.length) risks.push("No major red flags from the current free-data snapshot. Continue with deeper due diligence.");

  return (
    <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <h3 className="font-display text-lg">Actionable Insights</h3>
      <p className="text-xs text-textMuted">Beginner-friendly next steps and risk flags generated from the current dashboard state.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="font-semibold text-textMain">What to do next</p>
          <ul className="mt-2 space-y-2 text-textMuted">
            {actions.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/watchlist" className="rounded-lg border border-borderGlass bg-card px-3 py-1.5 text-xs text-textMain hover:border-accent">Add to Watchlist</Link>
            <Link href={`/compare?symbols=${encodeURIComponent(symbol)}`} className="rounded-lg border border-borderGlass bg-card px-3 py-1.5 text-xs text-textMain hover:border-accent">Compare with Peers</Link>
            <Link href={`/news?symbol=${encodeURIComponent(symbol)}`} className="rounded-lg border border-borderGlass bg-card px-3 py-1.5 text-xs text-textMain hover:border-accent">Read News</Link>
          </div>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="font-semibold text-textMain">Risk flags</p>
          <ul className="mt-2 space-y-2 text-textMuted">
            {risks.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function PeerSnapshotPanel({
  items,
  loading,
  error,
  currency,
  currencyMode,
  benchmark,
}: {
  items: CompareRow[];
  loading: boolean;
  error: string | null;
  currency?: string;
  currencyMode: CurrencyDisplayMode;
  benchmark?: {
    peer_count?: number;
    sector_median_pe?: number | null;
    sector_median_roe?: number | null;
    sector_median_revenue_growth?: number | null;
    sector_median_market_cap?: number | null;
    company_pe?: number | null;
    company_roe?: number | null;
    company_revenue_growth?: number | null;
  };
}) {
  return (
    <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg">Peer Snapshot (Auto-suggested)</h3>
          <p className="text-xs text-textMuted">3–5 related symbols for quick context without opening the compare page.</p>
        </div>
        {loading && <span className="text-xs text-textMuted">Loading peers...</span>}
      </div>

      {error && <p className="mt-3 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">{error}</p>}

      {!error && !items.length && !loading && (
        <p className="mt-3 rounded-lg border border-borderGlass bg-bgSoft px-3 py-2 text-sm text-textMuted">Peer suggestions are unavailable for this symbol right now.</p>
      )}

      {!!items.length && (
        <>
          {benchmark && (
            <div className="mt-3 grid gap-2 rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs md:grid-cols-4">
              <p className="text-textMuted">Peer count: <span className="text-textMain">{benchmark.peer_count ?? items.length}</span></p>
              <p className="text-textMuted">Sector median P/E: <span className="text-textMain">{typeof benchmark.sector_median_pe === "number" ? `${benchmark.sector_median_pe.toFixed(2)}x` : "-"}</span></p>
              <p className="text-textMuted">Sector median ROE: <span className="text-textMain">{typeof benchmark.sector_median_roe === "number" ? ratioToPercent(benchmark.sector_median_roe) : "-"}</span></p>
              <p className="text-textMuted">Sector median Growth: <span className="text-textMain">{typeof benchmark.sector_median_revenue_growth === "number" ? `${(benchmark.sector_median_revenue_growth * 100).toFixed(2)}%` : "-"}</span></p>
            </div>
          )}
          <div className="mt-3 overflow-x-auto rounded-xl border border-borderGlass">
          <table className="min-w-full text-sm">
            <thead className="bg-bgSoft text-xs uppercase tracking-wide text-textMuted">
              <tr>
                <th className="px-3 py-2 text-left">Rank</th>
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-left">Price</th>
                <th className="px-3 py-2 text-left">Market Cap</th>
                <th className="px-3 py-2 text-left">P/E</th>
                <th className="px-3 py-2 text-left">ROE</th>
                <th className="px-3 py-2 text-left">Growth</th>
                <th className="px-3 py-2 text-left">Why matched</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.symbol} className="border-t border-borderGlass text-textMuted">
                  <td className="px-3 py-2">{item.benchmark_rank ?? "-"}</td>
                  <td className="px-3 py-2 font-semibold text-textMain">{item.symbol}</td>
                  <td className="px-3 py-2">{typeof item.price === "number" ? formatCurrency(item.price, item.currency || currency || "USD") : "-"}</td>
                  <td className="px-3 py-2">{compactCap(item.market_cap, item.currency || currency, currencyMode)}</td>
                  <td className="px-3 py-2">{typeof item.pe === "number" ? `${item.pe.toFixed(2)}x` : "-"}</td>
                  <td className="px-3 py-2">{typeof item.roe === "number" ? ratioToPercent(item.roe) : "-"}</td>
                  <td className="px-3 py-2">{typeof item.revenue_growth === "number" ? `${(item.revenue_growth * 100).toFixed(2)}% YoY` : "-"}</td>
                  <td className="px-3 py-2 text-xs">
                    {item.industry_match ? "Industry match" : item.sector_match ? "Sector match" : "Size/metric match"}
                    {typeof item.market_cap_distance_percent === "number" ? ` • cap Δ ${item.market_cap_distance_percent.toFixed(0)}%` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

function StickySummaryBar({
  symbol,
  price,
  changePercent,
  currency,
  marketCap,
  currencyMode,
}: {
  symbol: string;
  price?: number | null;
  changePercent?: number | null;
  currency?: string;
  marketCap?: number | null;
  currencyMode: CurrencyDisplayMode;
}) {
  const session = getSessionInfo(symbol);
  return (
    <div className="sticky top-20 z-20 rounded-2xl border border-borderGlass bg-card/90 p-3 shadow-glow backdrop-blur">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-borderGlass bg-bgSoft px-2.5 py-1 text-xs font-semibold text-textMain">{symbol}</span>
          <span className="text-lg font-semibold text-textMain">{formatCurrency(price, currency || "USD")}</span>
          <span className={`text-sm font-medium ${typeof changePercent === "number" && changePercent >= 0 ? "text-success" : "text-danger"}`}>
            {formatSignedPercent(typeof changePercent === "number" ? changePercent * 100 : null)}
          </span>
          <span className="rounded-lg border border-borderGlass bg-bgSoft px-2 py-1 text-xs text-textMuted">
            {session.exchange} • <span className={session.status === "Open" ? "text-success" : "text-warning"}>{session.status}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-textMuted">
          <span className="rounded-lg border border-borderGlass bg-bgSoft px-2 py-1">Market Cap: <span className="text-textMain">{compactCap(marketCap, currency, currencyMode)}</span></span>
          <Link href="/watchlist" className="rounded-lg border border-borderGlass bg-bgSoft px-2 py-1 text-textMain hover:border-accent">Watchlist</Link>
        </div>
      </div>
    </div>
  );
}

function IndiaSpecificPanels({ dashboard, summary }: { dashboard: StockDashboardType; summary: StockSummary }) {
  const isIndia = dashboard.quote.symbol.toUpperCase().endsWith(".NS") || dashboard.quote.symbol.toUpperCase().endsWith(".BO");
  if (!isIndia) return null;
  const india = dashboard.india_context;
  const ownership = india?.ownership_proxies;
  const upcoming = india?.upcoming_events;
  const actions = india?.corporate_actions || dashboard.event_feed?.corporate_actions || [];
  const highlights = india?.quarterly_results_highlights || [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <div className="flex items-center gap-2">
          <BadgeIndianRupee className="h-4 w-4 text-accent" />
          <h3 className="font-display text-lg">India-specific Fundamentals</h3>
        </div>
        <p className="mt-1 text-xs text-textMuted">
          Live where available (Yahoo-compatible proxies + corporate actions). Dedicated NSE/BSE shareholding feeds can improve promoter/FII/DII accuracy further.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
            <p className="text-textMuted">Promoter / Insider Holding % (proxy)</p>
            <p className="mt-1 text-textMain">
              {typeof ownership?.promoter_or_insider_holding_percent === "number" ? `${ownership.promoter_or_insider_holding_percent.toFixed(2)}%` : "Unavailable"}
            </p>
          </div>
          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
            <p className="text-textMuted">Institutional Holding % (proxy)</p>
            <p className="mt-1 text-textMain">
              {typeof ownership?.institutional_holding_percent === "number" ? `${ownership.institutional_holding_percent.toFixed(2)}%` : "Unavailable"}
            </p>
          </div>
          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
            <p className="text-textMuted">FII / DII Trend</p>
            <p className="mt-1 text-textMain">{india?.fii_dii_trend?.available ? "Live feed connected" : "Not available (needs India ownership flow feed)"}</p>
          </div>
          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
            <p className="text-textMuted">Pledged Shares %</p>
            <p className="mt-1 text-textMain">
              {india?.pledged_shares_percent?.available && typeof india.pledged_shares_percent.value === "number"
                ? `${india.pledged_shares_percent.value.toFixed(2)}%`
                : "Not available (needs registry dataset)"}
            </p>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs text-textMuted">
          <p className="font-semibold text-textMain">Quarterly results highlights</p>
          <ul className="mt-2 space-y-1">
            {(highlights.length ? highlights : [summary.bull_case]).map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <h3 className="font-display text-lg">Corporate Actions</h3>
        <p className="mt-1 text-xs text-textMuted">Backed by Yahoo corporate actions + calendar events. Rights issues/buybacks need a dedicated India corporate-actions feed.</p>
        <div className="mt-4 space-y-2 text-sm text-textMuted">
          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">Dividend Yield: <span className="text-textMain">{formatPercentValue(dashboard.market_data?.dividend_yield)}</span></div>
          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
            Upcoming Earnings: <span className="text-textMain">{upcoming?.earnings_date || dashboard.event_feed?.calendar?.earnings_date || "Unavailable"}</span>
          </div>
          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
            Ex-Dividend Date: <span className="text-textMain">{upcoming?.ex_dividend_date || dashboard.event_feed?.calendar?.ex_dividend_date || "Unavailable"}</span>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-borderGlass bg-bgSoft p-3">
          <p className="text-xs font-semibold text-textMain">Recent Actions</p>
          {!actions.length ? (
            <p className="mt-2 text-xs text-textMuted">No recent corporate actions available from provider.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-textMuted">
              {actions.slice(0, 6).map((action) => (
                <li key={`${action.type}-${action.date}-${action.label}`} className="rounded-md border border-borderGlass bg-card px-2 py-2">
                  <span className="text-textMain">{action.date}</span> • {action.label}
                  {typeof action.amount === "number" ? ` • ${action.amount}` : ""}
                  {typeof action.ratio === "number" ? ` • ${action.ratio}:1` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function StockDashboard() {
  const { mode, language } = useUI();

  const [query, setQuery] = useState("AAPL");
  const [dashboard, setDashboard] = useState<StockDashboardType | null>(null);
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [news, setNews] = useState<NewsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [loadWarnings, setLoadWarnings] = useState<LoadWarning[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [currencyDisplayMode, setCurrencyDisplayMode] = useState<CurrencyDisplayMode>("intl");
  const [scoreExplainOpen, setScoreExplainOpen] = useState(false);

  const [universeStocks, setUniverseStocks] = useState<UniverseStock[]>([]);
  const [universeTotal, setUniverseTotal] = useState(0);
  const [universeLoading, setUniverseLoading] = useState(false);
  const [universeError, setUniverseError] = useState<string | null>(null);

  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [searchInfo, setSearchInfo] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const [chartPreset, setChartPreset] = useState<ChartPresetId>("6m");
  const [chartData, setChartData] = useState<Array<{ date: string; close: number; volume: number }>>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const [peerRows, setPeerRows] = useState<CompareRow[]>([]);
  const [peerLoading, setPeerLoading] = useState(false);
  const [peerError, setPeerError] = useState<string | null>(null);

  const isBeginner = mode === "beginner";
  const newsBullets = (news?.bullets ?? []).map((bullet) => bullet.trim()).filter(Boolean);

  const copy = useMemo(
    () =>
      language === "es"
        ? {
            heading: "Centro de Analisis AI",
            beginnerSub: "Modo principiante: menos datos, mas claridad y guias concretas.",
            proSub: "Modo pro: senales cuantitativas, mas contexto y lectura avanzada.",
            intro: "Piensa en esto como un copiloto de inversion: simple cuando empiezas, detallado cuando avanzas.",
            explore: "Explorar",
          }
        : {
            heading: "AI Stock Insight Hub",
            beginnerSub: "Beginner mode: 5-7 core signals, one-line guidance, and action-oriented insights.",
            proSub: "Pro mode: full metrics, financial statements, ratios, valuation, technicals, and visual tools.",
            intro: "Use the top score strip first, then drill into the 'why' and what changed today.",
            explore: "Explore",
          },
    [language]
  );

  const load = useCallback(
    async (symbol: string) => {
      const upper = symbol.trim().toUpperCase();
      if (!upper) return;

      setLoading(true);
      setError(null);
      setLoadWarnings([]);
      setVoiceMode(false);

      const cachedDash = cacheGet(DASHBOARD_CACHE, upper, DASHBOARD_TTL_MS);
      const cachedSummary = cacheGet(SUMMARY_CACHE, `${upper}:${mode}`, SUMMARY_TTL_MS);
      const cachedNews = cacheGet(NEWS_CACHE, upper, NEWS_TTL_MS);

      if (cachedDash) setDashboard(cachedDash);
      if (cachedSummary) setSummary(cachedSummary);
      if (cachedNews) setNews(cachedNews);

      try {
        const [dashResult, summaryResult, newsResult] = await Promise.allSettled([
          api.getDashboard(upper),
          api.getSummary(upper, mode),
          api.getNewsSummary(upper),
        ]);

        const warnings: LoadWarning[] = [];
        let nextDashboard = cachedDash;
        let nextSummary = cachedSummary;
        let nextNews = cachedNews ?? null;

        if (dashResult.status === "fulfilled") {
          nextDashboard = dashResult.value;
          setDashboard(nextDashboard);
          cacheSet(DASHBOARD_CACHE, upper, nextDashboard);
        } else if (!nextDashboard) {
          throw dashResult.reason;
        } else {
          warnings.push({ section: "Dashboard data", message: "Provider fallback triggered. Showing cached dashboard snapshot." });
        }

        if (summaryResult.status === "fulfilled") {
          nextSummary = summaryResult.value;
          setSummary(nextSummary);
          cacheSet(SUMMARY_CACHE, `${upper}:${mode}`, nextSummary);
        } else {
          warnings.push({ section: "AI summary", message: "AI summary service unavailable. Showing fallback summary derived from metrics." });
          if (nextDashboard) {
            const pe = toNumber(nextDashboard.ratios?.pe);
            const roe = toNumber(nextDashboard.ratios?.roe);
            const debt = toNumber(nextDashboard.ratios?.debt_to_equity);
            nextSummary = buildFallbackSummary(upper, pe, roe, debt);
            setSummary(nextSummary);
          }
        }

        if (newsResult.status === "fulfilled") {
          nextNews = newsResult.value;
          setNews(nextNews);
          cacheSet(NEWS_CACHE, upper, nextNews);
        } else {
          warnings.push({ section: "News summary", message: "News feed unavailable. Dashboard continues with market and financial data." });
          setNews(nextNews ?? null);
        }

        setLoadWarnings(warnings);
        setLastUpdatedAt(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stock data.");
      } finally {
        setLoading(false);
      }
    },
    [mode]
  );

  const loadUniverse = useCallback(async (q: string, offset: number, replace: boolean) => {
    setUniverseLoading(true);
    if (replace) setUniverseError(null);
    try {
      const response = await api.getUniverse({ q, offset, limit: 80 });
      setUniverseTotal(response.total);
      setUniverseStocks((previous) => {
        if (replace) return response.items as UniverseStock[];
        const merged = [...previous];
        for (const item of response.items as UniverseStock[]) {
          if (!merged.some((existing) => existing.symbol === item.symbol)) merged.push(item);
        }
        return merged;
      });
    } catch (err) {
      setUniverseError(err instanceof Error ? err.message : "Failed to load stock universe.");
    } finally {
      setUniverseLoading(false);
    }
  }, []);

  useEffect(() => {
    load("AAPL");
  }, [load]);

  useEffect(() => {
    loadUniverse("", 0, true);
  }, [loadUniverse]);

  const selectSymbol = useCallback(
    async (symbol: string) => {
      const upper = symbol.trim().toUpperCase();
      if (!upper) return;
      setQuery(upper);
      setSearchInfo(null);
      setSearchSuggestions([]);
      setChartPreset("6m");
      await load(upper);
    },
    [load]
  );

  const handleExplore = useCallback(async () => {
    const term = query.trim();
    if (!term) return;

    setSearchInfo(null);
    setSearching(true);
    try {
      await loadUniverse(term, 0, true);
      const response = await api.searchStocks(term);
      const suggestions = (response.items || [])
        .filter((item) => item.symbol)
        .slice(0, 10)
        .map((item) => ({
          symbol: item.symbol.toUpperCase(),
          name: item.name || item.symbol.toUpperCase(),
          exchange: item.exchange,
          country: item.country,
          currency: item.currency,
        }));

      setSearchSuggestions(suggestions);

      if (suggestions.length) {
        const normalized = term.toUpperCase();
        const exact = suggestions.find((item) => item.symbol === normalized);
        const chosen = exact ?? suggestions[0];
        if (!exact) {
          setSearchInfo(`Did you mean ${chosen.symbol} (${chosen.name})? Showing recommendations related to “${term}”.`);
        }
        await selectSymbol(chosen.symbol);
      } else {
        setSearchInfo(`No exact symbol found for “${term}”. Try a company name (e.g. Apple, Reliance, Infosys) or a ticker (AAPL, RELIANCE.NS).`);
      }
    } catch {
      setSearchInfo("Could not fetch recommendations right now. Try again or enter a ticker symbol.");
    } finally {
      setSearching(false);
    }
  }, [loadUniverse, query, selectSymbol]);

  useEffect(() => {
    const symbol = dashboard?.quote?.symbol;
    if (!symbol) return;
    const preset = CHART_PRESETS.find((item) => item.id === chartPreset) ?? CHART_PRESETS[3];
    const cacheKey = `${symbol}:${preset.period}`;
    const cached = cacheGet(HISTORY_CACHE, cacheKey, HISTORY_TTL_MS);
    if (cached) {
      setChartData(preset.points ? cached.slice(-preset.points) : cached);
      return;
    }

    let active = true;
    setChartLoading(true);
    api
      .getHistory(symbol, preset.period)
      .then((response) => {
        if (!active) return;
        const mapped = (response.items || []).map((item) => ({
          date: String(item.date).slice(0, 10),
          close: typeof item.close === "number" ? item.close : Number(item.close ?? 0),
          volume: typeof item.volume === "number" ? item.volume : Number(item.volume ?? 0),
        }));
        cacheSet(HISTORY_CACHE, cacheKey, mapped);
        setChartData(preset.points ? mapped.slice(-preset.points) : mapped);
      })
      .catch(() => {
        if (!active) return;
        const fallback = (dashboard.history || []).map((item) => ({ date: String(item.date).slice(0, 10), close: item.close, volume: item.volume }));
        setChartData(preset.points ? fallback.slice(-preset.points) : fallback);
      })
      .finally(() => {
        if (active) setChartLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dashboard?.history, dashboard?.quote?.symbol, chartPreset]);

  useEffect(() => {
    const symbol = dashboard?.quote?.symbol;
    const companyName = dashboard?.quote?.name || dashboard?.profile?.name;
    if (!symbol || !companyName) {
      setPeerRows([]);
      return;
    }

    if (dashboard?.peer_snapshot?.items?.length) {
      const backendRows = dashboard.peer_snapshot.items.map((item) => ({
        symbol: item.symbol,
        name: item.name ?? null,
        price: typeof item.price === "number" ? item.price : null,
        market_cap: typeof item.market_cap === "number" ? item.market_cap : null,
        pe: typeof item.pe === "number" ? item.pe : null,
        roe: typeof item.roe === "number" ? item.roe : null,
        revenue_growth: typeof item.revenue_growth === "number" ? item.revenue_growth : null,
        profit_margin: typeof item.profit_margin === "number" ? item.profit_margin : null,
        currency: item.currency ?? dashboard.quote.currency ?? undefined,
        similarity_score: typeof item.similarity_score === "number" ? item.similarity_score : null,
        benchmark_rank: typeof item.benchmark_rank === "number" ? item.benchmark_rank : null,
        sector_match: typeof item.sector_match === "boolean" ? item.sector_match : null,
        industry_match: typeof item.industry_match === "boolean" ? item.industry_match : null,
        market_cap_distance_percent: typeof item.market_cap_distance_percent === "number" ? item.market_cap_distance_percent : null,
      }));
      setPeerRows(backendRows);
      setPeerLoading(false);
      setPeerError(null);
      return;
    }

    const marketSuffix = symbol.includes(".") ? symbol.slice(symbol.lastIndexOf(".")) : "";
    const nameToken = companyName
      .split(/\s+/)
      .map((part) => part.replace(/[^A-Za-z]/g, ""))
      .find((part) => part.length >= 3 && !["limited", "corporation", "inc", "ltd", "company"].includes(part.toLowerCase()));
    const queryToken = nameToken || symbol.replace(/\..+$/, "");
    const cacheKey = `${symbol}:peers`;
    const cached = cacheGet(PEER_CACHE, cacheKey, PEER_TTL_MS);
    if (cached) {
      setPeerRows(cached);
      return;
    }

    let active = true;
    setPeerLoading(true);
    setPeerError(null);

    (async () => {
      try {
        const search = await api.searchStocks(queryToken);
        const candidateSymbols = (search.items || [])
          .map((item) => String(item.symbol || "").toUpperCase())
          .filter(Boolean)
          .filter((item) => item !== symbol)
          .filter((item) => (marketSuffix ? item.endsWith(marketSuffix) : !item.includes(".")));

        const peerSymbols = [symbol, ...candidateSymbols].slice(0, 4);
        if (peerSymbols.length < 2) {
          if (!active) return;
          setPeerRows([]);
          return;
        }

        const compare = await api.compare(peerSymbols);
        const rows = (compare.items || []).map((item) => ({
          symbol: String(item.symbol || ""),
          name: typeof item.name === "string" ? item.name : null,
          price: toNumber(item.price),
          market_cap: toNumber(item.market_cap),
          pe: toNumber(item.pe),
          roe: toNumber(item.roe),
          revenue_growth: toNumber(item.revenue_growth),
          profit_margin: toNumber(item.profit_margin),
          currency: dashboard?.quote?.currency || undefined,
        }));

        if (!active) return;
        setPeerRows(rows);
        cacheSet(PEER_CACHE, cacheKey, rows);
      } catch (err) {
        if (!active) return;
        setPeerError(err instanceof Error ? err.message : "Unable to load peer snapshot.");
      } finally {
        if (active) setPeerLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [dashboard?.peer_snapshot?.items, dashboard?.profile?.name, dashboard?.quote?.currency, dashboard?.quote?.name, dashboard?.quote?.symbol]);

  function speakSummary() {
    if (!summary || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(summary.eli15_summary);
    utterance.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setVoiceMode(true);
  }

  const pe = toNumber(dashboard?.ratios?.pe);
  const roe = toNumber(dashboard?.ratios?.roe);
  const debtToEquity = toNumber(dashboard?.ratios?.debt_to_equity);
  const revenueGrowth = toNumber(dashboard?.ratios?.revenue_growth);
  const profitMargin = toNumber(dashboard?.ratios?.profit_margin);

  const effectiveSummary = useMemo(() => {
    if (summary) return summary;
    const symbol = dashboard?.quote?.symbol || "-";
    return buildFallbackSummary(symbol, pe, roe, debtToEquity);
  }, [summary, dashboard?.quote?.symbol, pe, roe, debtToEquity]);

  const valuation = valuationSignal(pe);
  const quality = qualitySignal(roe, profitMargin);
  const leverage = debtSignal(debtToEquity);

  const history = useMemo(() => dashboard?.history ?? [], [dashboard?.history]);
  const latestClose = history.length ? history[history.length - 1].close : null;
  const monthBase = history.length > 21 ? history[history.length - 22]?.close : history[0]?.close ?? null;
  const halfYearBase = history[0]?.close ?? null;
  const oneMonthReturn = computeReturn(latestClose, monthBase);
  const sixMonthReturn = computeReturn(latestClose, halfYearBase);
  const volatility = annualizedVolatility(history);
  const marketData = dashboard?.market_data;
  const ohlcData = dashboard?.ohlc;
  const newsPageHref = `/news?symbol=${encodeURIComponent(dashboard?.quote.symbol || "AAPL")}`;

  const scoreModel = useMemo(
    () =>
      buildScoreBreakdown({
        pe,
        roe,
        profitMargin,
        debtToEquity,
        revenueGrowth,
        oneMonthReturn,
        sixMonthReturn,
        volatility,
        beta: toNumber(marketData?.beta),
      }),
    [pe, roe, profitMargin, debtToEquity, revenueGrowth, oneMonthReturn, sixMonthReturn, volatility, marketData?.beta]
  );

  const chartPresetConfig = CHART_PRESETS.find((item) => item.id === chartPreset) ?? CHART_PRESETS[3];
  const chartReturnChips = [
    { label: "1D", value: toNumber(marketData?.changes_percent?.["1d"] ?? null) },
    { label: "1W", value: toNumber(marketData?.changes_percent?.["1w"] ?? null) },
    { label: "1M", value: toNumber(marketData?.changes_percent?.["1m"] ?? null) },
    { label: "1Y", value: toNumber(marketData?.changes_percent?.["1y"] ?? null) },
    { label: "5Y", value: toNumber(marketData?.changes_percent?.["5y"] ?? null) },
  ];

  const chartEvents = useMemo(() => {
    const events: Array<{ date: string; label: string; type: "news" | "signal" | "earnings" | "dividend" }> = [];
    const latestChartDate = chartData.length ? chartData[chartData.length - 1].date : undefined;
    const backendEvents = (dashboard?.event_feed?.items || [])
      .filter((item) => item?.date && item?.label)
      .slice(0, 12)
      .map((item) => {
        const kind = String(item.type || "").toLowerCase();
        const mappedType: "news" | "signal" | "earnings" | "dividend" =
          kind === "earnings"
            ? "earnings"
            : kind === "dividend" || kind === "split" || kind === "ex_dividend"
              ? "dividend"
              : "signal";
        return {
          date: String(item.date).slice(0, 10),
          label: String(item.label),
          type: mappedType,
        };
      });
    events.push(...backendEvents);
    if (!backendEvents.length && latestChartDate && newsBullets.length) {
      events.push({ date: latestChartDate, label: newsBullets[0].slice(0, 32), type: "news" });
    }
    if (chartData.length >= 20) {
      const recent = chartData.slice(-10);
      const avgVol = chartData.slice(-30, -1).reduce((sum, item) => sum + (item.volume || 0), 0) / Math.max(1, chartData.slice(-30, -1).length);
      const latestVol = recent[recent.length - 1]?.volume ?? 0;
      if (avgVol > 0 && latestVol / avgVol >= 1.8 && latestChartDate) {
        events.push({ date: latestChartDate, label: "Volume spike", type: "signal" });
      }
    }
    const dedup = new Map<string, { date: string; label: string; type: "news" | "signal" | "earnings" | "dividend" }>();
    for (const event of events) {
      const key = `${event.date}:${event.type}:${event.label}`;
      if (!dedup.has(key)) dedup.set(key, event);
    }
    return Array.from(dedup.values()).slice(0, 6);
  }, [chartData, dashboard?.event_feed?.items, newsBullets]);

  const averageRecentVolume = useMemo(() => {
    if (!history.length) return null;
    const slice = history.slice(-31, -1);
    if (!slice.length) return null;
    return slice.reduce((sum, item) => sum + (item.volume || 0), 0) / slice.length;
  }, [history]);

  const basicMarketDataSection = dashboard ? (
    <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg">Basic Market Data</h3>
        <span className="text-xs text-textMuted">Source: Yahoo-compatible provider • Updated {formatRelativeTime(lastUpdatedAt)}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Live Price</p>
          <p className="mt-1 font-semibold text-textMain">{formatCurrency(marketData?.live_price ?? dashboard.quote.price, dashboard.quote.currency)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">% Change (1D / 1W / 1M / 1Y / 5Y)</p>
          <p className="mt-1 text-textMain">
            {formatSignedPercent(toNumber(marketData?.changes_percent?.["1d"] ?? null))} / {formatSignedPercent(toNumber(marketData?.changes_percent?.["1w"] ?? null))} / {" "}
            {formatSignedPercent(toNumber(marketData?.changes_percent?.["1m"] ?? null))} / {formatSignedPercent(toNumber(marketData?.changes_percent?.["1y"] ?? null))} / {" "}
            {formatSignedPercent(toNumber(marketData?.changes_percent?.["5y"] ?? null))}
          </p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Volume</p>
          <p className="mt-1 font-semibold text-textMain">{formatLarge(marketData?.volume ?? dashboard.quote.volume)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Market Cap</p>
          <p className="mt-1 font-semibold text-textMain">{compactCap(marketData?.market_cap ?? dashboard.quote.market_cap, dashboard.quote.currency, currencyDisplayMode)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">52-Week High / Low</p>
          <p className="mt-1 text-textMain">
            {formatCurrency(marketData?.week_52_high ?? null, dashboard.quote.currency)} / {formatCurrency(marketData?.week_52_low ?? null, dashboard.quote.currency)}
          </p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Beta</p>
          <p className="mt-1 text-textMain">{formatNumberValue(marketData?.beta)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">PE / PB / PEG (x)</p>
          <p className="mt-1 text-textMain">{formatNumberValue(marketData?.pe)} / {formatNumberValue(marketData?.pb)} / {formatNumberValue(marketData?.peg)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Dividend Yield (%)</p>
          <p className="mt-1 text-textMain">{formatPercentValue(marketData?.dividend_yield)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">EPS</p>
          <p className="mt-1 text-textMain">{formatNumberValue(marketData?.eps)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Book Value</p>
          <p className="mt-1 text-textMain">{formatNumberValue(marketData?.book_value)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">ROE (%)</p>
          <p className="mt-1 text-textMain">{formatPercentValue(marketData?.roe)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">ROCE (%)</p>
          <p className="mt-1 text-textMain">{formatPercentValue(marketData?.roce)}</p>
        </div>
      </div>
    </div>
  ) : null;

  const ohlcSection = dashboard ? (
    <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg">OHLC Data</h3>
        <span className="text-xs text-textMuted">Price source snapshot • {getSessionInfo(dashboard.quote.symbol).exchange}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="text-textMuted">Open</p><p className="mt-1 text-textMain">{formatCurrency(ohlcData?.open ?? null, dashboard.quote.currency)}</p></div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="text-textMuted">High</p><p className="mt-1 text-textMain">{formatCurrency(ohlcData?.high ?? null, dashboard.quote.currency)}</p></div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="text-textMuted">Low</p><p className="mt-1 text-textMain">{formatCurrency(ohlcData?.low ?? null, dashboard.quote.currency)}</p></div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="text-textMuted">Close</p><p className="mt-1 text-textMain">{formatCurrency(ohlcData?.close ?? null, dashboard.quote.currency)}</p></div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="text-textMuted">Adjusted Close</p><p className="mt-1 text-textMain">{formatCurrency(ohlcData?.adjusted_close ?? null, dashboard.quote.currency)}</p></div>
      </div>
    </div>
  ) : null;

  const financialStatementsSection = <FinancialStatementsPanel data={dashboard?.financial_statements} />;
  const ratioDashboardSection = <RatioDashboardPanel data={dashboard?.ratio_dashboard} />;
  const valuationEngineSection = <ValuationEnginePanel data={dashboard?.valuation_engine} />;
  const technicalAnalysisSection = (
    <TechnicalAnalysisPanel symbol={dashboard?.quote.symbol || "AAPL"} currency={dashboard?.quote.currency} initialHistory={dashboard?.history || []} />
  );
  const visualizationToolsSection = (
    <VisualizationToolsPanel symbol={dashboard?.quote.symbol || "AAPL"} currency={dashboard?.quote.currency} financials={dashboard?.financial_statements} />
  );
  const smartInsightsSection = <SmartInsightsPanel symbol={dashboard?.quote.symbol || "AAPL"} currency={dashboard?.quote.currency} />;

  if (error && !dashboard) {
    return <div className="rounded-2xl border border-danger/40 bg-card p-6 text-sm text-danger">Unable to load dashboard: {error}</div>;
  }

  const currentSymbol = dashboard?.quote.symbol || "AAPL";
  const currentCurrency = dashboard?.quote.currency || "USD";
  const isINR = currentCurrency === "INR";
  const combinedWarnings = [
    ...(dashboard?.data_sources?.warnings || []),
    ...loadWarnings,
  ];

  return (
    <section className="space-y-6 animate-rise">
      <div className="rounded-3xl border border-borderGlass bg-card p-6 shadow-glow md:p-8">
        <div className="grid gap-5 md:grid-cols-[1.2fr_1fr] md:items-start">
          <div>
            <p className="mb-2 inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs text-accent">
              <Sparkles className="mr-1 h-3.5 w-3.5" /> {isBeginner ? "Beginner View" : "Pro View"}
            </p>
            <h1 className="font-display text-3xl leading-tight md:text-4xl">{copy.heading}</h1>
            <p className="mt-3 max-w-2xl text-sm text-textMuted md:text-base">{isBeginner ? copy.beginnerSub : copy.proSub}</p>
            <p className="mt-2 max-w-2xl text-xs text-textMuted">{copy.intro}</p>
            {dashboard && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-borderGlass bg-bgSoft px-3 py-1.5 text-xs text-textMain">{dashboard.quote.symbol}</span>
                <span className="rounded-lg border border-borderGlass bg-bgSoft px-3 py-1.5 text-xs text-textMuted">{getSessionInfo(dashboard.quote.symbol).exchange}</span>
                <span className="rounded-lg border border-borderGlass bg-bgSoft px-3 py-1.5 text-xs text-textMuted">{dashboard.profile.sector || "Sector N/A"}</span>
                {isINR && (
                  <div className="inline-flex items-center rounded-lg border border-borderGlass bg-bgSoft p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setCurrencyDisplayMode("intl")}
                      className={`rounded px-2 py-1 ${currencyDisplayMode === "intl" ? "bg-card text-textMain" : "text-textMuted"}`}
                    >
                      ₹ Compact
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrencyDisplayMode("indian")}
                      className={`rounded px-2 py-1 ${currencyDisplayMode === "indian" ? "bg-card text-textMain" : "text-textMuted"}`}
                    >
                      ₹ Lakh/Cr
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <form
            className="rounded-2xl border border-borderGlass bg-bgSoft p-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleExplore();
            }}
          >
            <label className="text-xs uppercase tracking-wide text-textMuted">Stock symbol or company</label>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="flex-1 rounded-xl border border-borderGlass bg-card px-4 py-2 text-sm outline-none transition focus:border-accent"
                placeholder="Explore Stocks (e.g. AAPL or Apple)"
              />
              <button className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-black transition hover:opacity-90">{searching ? "Finding..." : copy.explore}</button>
            </div>
            {searchInfo && <p className="mt-2 text-xs text-textMuted">{searchInfo}</p>}

            {!!searchSuggestions.length && (
              <div className="mt-3 rounded-xl border border-borderGlass bg-card p-3">
                <p className="text-xs text-textMuted">Recommendations</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {searchSuggestions.map((item) => (
                    <button
                      type="button"
                      key={`suggestion-${item.symbol}`}
                      onClick={() => selectSymbol(item.symbol)}
                      className="rounded-md border border-borderGlass bg-bgSoft px-2.5 py-1.5 text-xs text-textMuted transition hover:border-accent hover:text-textMain"
                    >
                      {item.symbol} • {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 rounded-xl border border-borderGlass bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-textMuted">
                  {query.trim() ? `Matches: ${universeTotal.toLocaleString()}` : `All listed symbols: ${universeTotal.toLocaleString()}`}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => loadUniverse(query.trim().toUpperCase(), 0, true)} className="rounded-lg border border-borderGlass bg-bgSoft px-3 py-1.5 text-xs text-textMain hover:bg-cardHover">Search All</button>
                  <button type="button" onClick={() => { setQuery(""); loadUniverse("", 0, true); }} className="rounded-lg border border-borderGlass bg-bgSoft px-3 py-1.5 text-xs text-textMuted hover:text-textMain">Reset</button>
                </div>
              </div>
              {universeError && <p className="mt-2 text-xs text-danger">{universeError}</p>}
              <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-borderGlass bg-bgSoft p-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {universeStocks.map((stock) => (
                    <button
                      type="button"
                      key={`${stock.exchange}-${stock.symbol}`}
                      onClick={() => selectSymbol(stock.symbol)}
                      className="rounded-md border border-borderGlass bg-card px-2 py-2 text-left text-xs transition hover:border-accent hover:bg-cardHover"
                    >
                      <p className="font-semibold text-textMain">{stock.symbol}</p>
                      <p className="truncate text-[11px] text-textMuted">{stock.exchange}</p>
                    </button>
                  ))}
                </div>
                {!universeLoading && !universeStocks.length && <p className="py-4 text-center text-xs text-textMuted">No symbols found for this search.</p>}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-textMuted">Showing {universeStocks.length.toLocaleString()} of {universeTotal.toLocaleString()}</p>
                {universeStocks.length < universeTotal && (
                  <button type="button" onClick={() => loadUniverse(query.trim().toUpperCase(), universeStocks.length, false)} disabled={universeLoading} className="rounded-lg border border-borderGlass bg-bgSoft px-3 py-1.5 text-xs text-textMain hover:bg-cardHover disabled:opacity-50">
                    {universeLoading ? "Loading..." : "Load more"}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      {dashboard && (
        <StickySummaryBar
          symbol={dashboard.quote.symbol}
          price={dashboard.quote.price}
          changePercent={toNumber(dashboard.quote.change_percent)}
          currency={dashboard.quote.currency}
          marketCap={dashboard.quote.market_cap}
          currencyMode={currencyDisplayMode}
        />
      )}

      <InlineWarningBanners warnings={combinedWarnings} />

      {loading && !dashboard && <DashboardSkeleton />}

      {!loading && dashboard && (
        <>
          <ScoreStrip breakdown={scoreModel.breakdown} total={scoreModel.total} expanded={scoreExplainOpen} onToggle={() => setScoreExplainOpen((prev) => !prev)} />

          <DataSourceStrip lastUpdated={lastUpdatedAt} symbol={dashboard.quote.symbol} newsCount={news?.source_count ?? 0} dataSources={dashboard.data_sources} />

          <WhatChangedTodayPanel
            change1d={toNumber(marketData?.changes_percent?.["1d"] ?? null)}
            volume={toNumber(marketData?.volume ?? dashboard.quote.volume ?? null)}
            avgVolume={toNumber(averageRecentVolume)}
            news={news}
            valuation={valuation}
            quality={quality}
            leverage={leverage}
            revenueGrowth={revenueGrowth}
            profitMargin={profitMargin}
          />

          <PeerSnapshotPanel
            items={peerRows}
            loading={peerLoading}
            error={peerError}
            currency={dashboard.quote.currency}
            currencyMode={currencyDisplayMode}
            benchmark={dashboard.peer_snapshot?.benchmark}
          />

          {isBeginner ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <article className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
                  <p className="text-xs uppercase tracking-wide text-textMuted">Price</p>
                  <p className="mt-2 text-2xl font-semibold text-textMain">{formatCurrency(dashboard.quote.price, dashboard.quote.currency)}</p>
                  <p className={`mt-2 text-sm ${toNumber(dashboard.quote.change_percent) && (dashboard.quote.change_percent as number) >= 0 ? "text-success" : "text-danger"}`}>
                    {formatSignedPercent(typeof dashboard.quote.change_percent === "number" ? dashboard.quote.change_percent * 100 : null)} today
                  </p>
                  <p className="mt-1 text-xs text-textMuted">{getSessionInfo(dashboard.quote.symbol).status} • {getSessionInfo(dashboard.quote.symbol).timeZoneLabel}</p>
                </article>

                <article className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
                  <p className="text-xs uppercase tracking-wide text-textMuted">Trend</p>
                  <p className="mt-2 text-2xl font-semibold text-textMain">{formatSignedPercent(oneMonthReturn)} (1M)</p>
                  <p className="mt-2 text-sm text-textMuted">6M: <span className={sixMonthReturn !== null && sixMonthReturn >= 0 ? "text-success" : "text-danger"}>{formatSignedPercent(sixMonthReturn)}</span></p>
                  <p className="mt-1 text-xs text-textMuted">Use this with news and risk, not alone.</p>
                </article>

                <article className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
                  <p className="text-xs uppercase tracking-wide text-textMuted">Risk</p>
                  <p className="mt-2 text-2xl font-semibold text-textMain">{effectiveSummary.risk_level}</p>
                  <p className={`mt-2 text-sm font-medium ${leverage.toneClass}`}>Debt/Equity: {debtToEquity === null ? "-" : `${debtToEquity.toFixed(2)}x`}</p>
                  <p className="mt-1 text-xs text-textMuted">Volatility: {volatility === null ? "-" : `${volatility.toFixed(1)}% annualized`}</p>
                </article>

                <article className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
                  <p className="text-xs uppercase tracking-wide text-textMuted">Valuation</p>
                  <p className="mt-2 text-2xl font-semibold text-textMain">{pe === null ? "-" : `${pe.toFixed(2)}x P/E`}</p>
                  <p className={`mt-2 text-sm font-medium ${valuation.toneClass}`}>{valuation.label}</p>
                  <p className="mt-1 text-xs text-textMuted">{valuation.description}</p>
                </article>

                <article className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
                  <p className="text-xs uppercase tracking-wide text-textMuted">Profitability</p>
                  <p className="mt-2 text-2xl font-semibold text-textMain">ROE {ratioToPercent(roe)}</p>
                  <p className={`mt-2 text-sm font-medium ${quality.toneClass}`}>{quality.label}</p>
                  <p className="mt-1 text-xs text-textMuted">Profit Margin: {formatPercentValue(profitMargin)} • Revenue Growth: {formatPercentValue(revenueGrowth)} YoY</p>
                </article>

                <article className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
                  <p className="text-xs uppercase tracking-wide text-textMuted">News Sentiment</p>
                  <p className="mt-2 text-2xl font-semibold text-textMain">{news?.sentiment || "Unknown"}</p>
                  <p className="mt-2 text-sm text-textMuted">{news ? `${news.source_count} summarized sources` : "News feed unavailable"}</p>
                  <Link href={newsPageHref} className="mt-3 inline-flex items-center text-xs text-accent hover:underline">Open news page <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
                </article>
              </div>

              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <PriceChart
                  data={chartData.length ? chartData : history.map((item) => ({ date: String(item.date).slice(0, 10), close: item.close, volume: item.volume }))}
                  symbol={dashboard.quote.symbol}
                  currency={dashboard.quote.currency}
                  periodLabel={chartPresetConfig.periodLabel}
                  presets={CHART_PRESETS.map((item) => ({ id: item.id, label: item.label }))}
                  selectedPreset={chartPreset}
                  onSelectPreset={(id) => setChartPreset(id as ChartPresetId)}
                  returnChips={chartReturnChips}
                  events={chartEvents}
                  loading={chartLoading}
                />

                <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-display text-lg">What to Watch</h3>
                    <button onClick={speakSummary} className="rounded-lg border border-borderGlass px-2 py-1 text-xs text-textMuted hover:text-textMain">Voice explain</button>
                  </div>

                  <p className="text-sm text-textMuted">{effectiveSummary.eli15_summary}</p>

                  <div className="mt-4 space-y-3 rounded-xl border border-borderGlass bg-bgSoft p-3">
                    <div className="flex items-center justify-between text-sm"><span className="text-textMuted">Current Price</span><span className="font-semibold text-textMain">{formatCurrency(dashboard.quote.price, dashboard.quote.currency)}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-textMuted">Market Cap</span><span className="font-semibold text-textMain">{compactCap(dashboard.quote.market_cap, dashboard.quote.currency, currencyDisplayMode)}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-textMuted">Who is this for?</span><span className="text-textMain">{effectiveSummary.suitable_for[0] || "Research-first"}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-textMuted">Debt/Equity</span><span className="text-textMain">{debtToEquity === null ? "-" : `${debtToEquity.toFixed(2)}x`}</span></div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <MetricChip label="P/E Ratio (x)" metricKey="pe" symbol={dashboard.quote.symbol} rawValue={dashboard.ratios.pe ?? null} value={dashboard.ratios.pe ? `${Number(dashboard.ratios.pe).toFixed(2)}x` : "-"} />
                    <MetricChip label="ROE (%)" metricKey="roe" symbol={dashboard.quote.symbol} rawValue={dashboard.ratios.roe ?? null} value={ratioToPercent(dashboard.ratios.roe)} />
                  </div>

                  {voiceMode && <p className="mt-2 text-xs text-textMuted">Voice explainer started via browser speech API.</p>}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-display text-lg">AI News Summary</h3>
                    <Link href={newsPageHref} className="rounded-lg border border-borderGlass px-2 py-1 text-xs text-textMuted hover:text-textMain">Open News Page</Link>
                  </div>
                  {!news ? (
                    <p className="mt-2 text-sm text-textMuted">News feed unavailable right now. Market and fundamentals are still available.</p>
                  ) : (
                    <>
                      <div className="mt-3 flex items-center gap-2">
                        {news.sentiment === "Positive" && <ShieldCheck className="h-4 w-4 text-success" />}
                        {news.sentiment === "Neutral" && <TriangleAlert className="h-4 w-4 text-warning" />}
                        {news.sentiment === "Negative" && <ShieldAlert className="h-4 w-4 text-danger" />}
                        <p className="text-sm text-textMuted">Sentiment: <span className="text-textMain">{news.sentiment}</span> ({news.source_count} sources)</p>
                      </div>
                      <ul className="mt-4 space-y-2 text-sm text-textMuted">
                        {newsBullets.slice(0, 5).map((bullet) => (
                          <li key={bullet}>
                            <Link href={newsPageHref} className="block rounded-lg border border-borderGlass bg-bgSoft p-3 hover:border-accent">
                              <ArrowUpRight className="mr-2 inline h-3.5 w-3.5 text-accent" />
                              {bullet}
                            </Link>
                          </li>
                        ))}
                        {!newsBullets.length && <li className="rounded-lg border border-borderGlass bg-bgSoft p-3">No readable headlines found. Try refreshing.</li>}
                      </ul>
                    </>
                  )}
                </div>

                <ActionableInsightsPanel symbol={dashboard.quote.symbol} summary={effectiveSummary} valuation={valuation} leverage={leverage} oneMonthReturn={oneMonthReturn} news={news} />
              </div>

              {basicMarketDataSection}
              {ohlcSection}
              <IndiaSpecificPanels dashboard={dashboard} summary={effectiveSummary} />
            </>
          ) : (
            <>
              <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricChip label="P/E Ratio (x)" metricKey="pe" symbol={dashboard.quote.symbol} rawValue={dashboard.ratios.pe ?? null} value={dashboard.ratios.pe ? `${Number(dashboard.ratios.pe).toFixed(2)}x` : "-"} />
                <MetricChip label="ROE (%)" metricKey="roe" symbol={dashboard.quote.symbol} rawValue={dashboard.ratios.roe ?? null} value={ratioToPercent(dashboard.ratios.roe)} />
                <MetricChip label="Debt/Equity (x)" metricKey="debt_to_equity" symbol={dashboard.quote.symbol} rawValue={dashboard.ratios.debt_to_equity ?? null} value={dashboard.ratios.debt_to_equity ? `${Number(dashboard.ratios.debt_to_equity).toFixed(2)}x` : "-"} />
                <MetricChip label="Revenue Growth (YoY %)" metricKey="revenue_growth" symbol={dashboard.quote.symbol} rawValue={dashboard.ratios.revenue_growth ?? null} value={ratioToPercent(dashboard.ratios.revenue_growth)} />
                <MetricChip label="Profit Margin (%)" metricKey="profit_margin" symbol={dashboard.quote.symbol} rawValue={dashboard.ratios.profit_margin ?? null} value={ratioToPercent(dashboard.ratios.profit_margin)} />
              </div>

              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <PriceChart
                  data={chartData.length ? chartData : history.map((item) => ({ date: String(item.date).slice(0, 10), close: item.close, volume: item.volume }))}
                  symbol={dashboard.quote.symbol}
                  currency={dashboard.quote.currency}
                  periodLabel={chartPresetConfig.periodLabel}
                  presets={CHART_PRESETS.map((item) => ({ id: item.id, label: item.label }))}
                  selectedPreset={chartPreset}
                  onSelectPreset={(id) => setChartPreset(id as ChartPresetId)}
                  returnChips={chartReturnChips}
                  events={chartEvents}
                  loading={chartLoading}
                />

                <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
                  <h3 className="font-display text-lg">Quant Snapshot</h3>
                  <p className="text-xs text-textMuted">{dashboard.profile.sector} • {dashboard.profile.industry}</p>

                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between text-textMuted"><span>Price</span><span className="text-textMain">{formatCurrency(dashboard.quote.price, dashboard.quote.currency)}</span></div>
                    <div className="flex items-center justify-between text-textMuted"><span>Market Cap</span><span className="text-textMain">{compactCap(dashboard.quote.market_cap, dashboard.quote.currency, currencyDisplayMode)}</span></div>
                    <div className="flex items-center justify-between text-textMuted"><span>1M Return</span><span className={oneMonthReturn !== null && oneMonthReturn >= 0 ? "text-success" : "text-danger"}>{formatSignedPercent(oneMonthReturn)}</span></div>
                    <div className="flex items-center justify-between text-textMuted"><span>6M Return</span><span className={sixMonthReturn !== null && sixMonthReturn >= 0 ? "text-success" : "text-danger"}>{formatSignedPercent(sixMonthReturn)}</span></div>
                    <div className="flex items-center justify-between text-textMuted"><span>Ann. Volatility</span><span className="text-textMain">{volatility === null ? "-" : `${volatility.toFixed(2)}%`}</span></div>
                    <div className="flex items-center justify-between text-textMuted"><span>ROE</span><span className="text-textMain">{ratioToPercent(roe)}</span></div>
                    <div className="flex items-center justify-between text-textMuted"><span>Debt/Equity</span><span className="text-textMain">{debtToEquity === null ? "-" : `${debtToEquity.toFixed(2)}x`}</span></div>
                    <div className="flex items-center justify-between text-textMuted"><span>Revenue Growth</span><span className="text-textMain">{formatPercentValue(revenueGrowth)} YoY</span></div>
                  </div>

                  <div className="mt-4 rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs text-textMuted">
                    {dashboard.profile.description ? dashboard.profile.description.slice(0, 260) : "Company profile not available from provider."}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-display text-lg">AI Stock Summary (Pro Lens)</h3>
                    <button onClick={speakSummary} className="rounded-lg border border-borderGlass px-2 py-1 text-xs text-textMuted hover:text-textMain">Voice explain</button>
                  </div>
                  <p className="text-sm text-textMuted">{effectiveSummary.eli15_summary}</p>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="font-semibold text-textMain">Bull case</p><p className="mt-1 text-textMuted">{effectiveSummary.bull_case}</p></div>
                    <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="font-semibold text-textMain">Bear case</p><p className="mt-1 text-textMuted">{effectiveSummary.bear_case}</p></div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-borderGlass bg-bgSoft px-3 py-1 text-xs">Risk: {effectiveSummary.risk_level}</span>
                    {effectiveSummary.suitable_for.map((group) => (
                      <span key={group} className="rounded-full border border-borderGlass bg-bgSoft px-3 py-1 text-xs text-textMuted">{group}</span>
                    ))}
                  </div>
                  {voiceMode && <p className="mt-2 text-xs text-textMuted">Voice explainer started via browser speech API.</p>}
                </div>

                <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg">AI News Summary</h3>
                    <Link href={newsPageHref} className="rounded-lg border border-borderGlass px-2 py-1 text-xs text-textMuted hover:text-textMain">Open News Page</Link>
                  </div>
                  {!news ? (
                    <p className="mt-2 text-sm text-textMuted">No news data yet (provider temporarily unavailable or no coverage).</p>
                  ) : (
                    <>
                      <div className="mt-3 flex items-center gap-2">
                        {news.sentiment === "Positive" && <ShieldCheck className="h-4 w-4 text-success" />}
                        {news.sentiment === "Neutral" && <TriangleAlert className="h-4 w-4 text-warning" />}
                        {news.sentiment === "Negative" && <ShieldAlert className="h-4 w-4 text-danger" />}
                        <p className="text-sm text-textMuted">Sentiment: <span className="text-textMain">{news.sentiment}</span> ({news.source_count} sources)</p>
                      </div>
                      <ul className="mt-4 space-y-2 text-sm text-textMuted">
                        {newsBullets.slice(0, 5).map((bullet) => (
                          <li key={bullet}>
                            <Link href={newsPageHref} className="block rounded-lg border border-borderGlass bg-bgSoft p-3 hover:border-accent">
                              <ArrowUpRight className="mr-2 inline h-3.5 w-3.5 text-accent" />
                              {bullet}
                            </Link>
                          </li>
                        ))}
                        {!newsBullets.length && <li className="rounded-lg border border-borderGlass bg-bgSoft p-3">No readable headlines found. Try refreshing.</li>}
                      </ul>
                    </>
                  )}
                </div>
              </div>

              <ActionableInsightsPanel symbol={dashboard.quote.symbol} summary={effectiveSummary} valuation={valuation} leverage={leverage} oneMonthReturn={oneMonthReturn} news={news} />

              {basicMarketDataSection}
              {ohlcSection}
              <IndiaSpecificPanels dashboard={dashboard} summary={effectiveSummary} />

              <CollapsiblePanel title="Financial Statements (10-year data)" defaultOpen>
                {financialStatementsSection}
              </CollapsiblePanel>
              <CollapsiblePanel title="Ratio Dashboard" defaultOpen>
                {ratioDashboardSection}
              </CollapsiblePanel>
              <CollapsiblePanel title="Valuation Engine" defaultOpen>
                {valuationEngineSection}
              </CollapsiblePanel>
              <CollapsiblePanel title="Technical Analysis" defaultOpen>
                {technicalAnalysisSection}
              </CollapsiblePanel>
              <CollapsiblePanel title="Visualization Tools" defaultOpen={false}>
                {visualizationToolsSection}
              </CollapsiblePanel>
              <CollapsiblePanel title="Smart Insights" defaultOpen={false}>
                {smartInsightsSection}
              </CollapsiblePanel>
            </>
          )}
        </>
      )}
    </section>
  );
}
