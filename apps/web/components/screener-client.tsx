"use client";

import { Filter, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/lib/api";
import { formatLarge } from "@/lib/format";
import type { ScreenerPreset, ScreenerRow, ScreenerRunMeta } from "@/lib/types";

type ScreenerForm = {
  min_market_cap_b: number;
  max_market_cap_b: number;
  min_pe: number;
  max_pe: number;
  min_roe_pct: number;
  min_revenue_growth_pct: number;
  max_debt_to_equity: number;
  min_rsi: number;
  max_rsi: number;
  min_beta: number;
  max_beta: number;
  min_sharpe_ratio: number;
  max_drawdown_5y_max: number;
  max_volatility_percentile: number;
  min_rolling_beta: number;
  max_rolling_beta: number;
  min_earnings_consistency: number;
  min_revenue_cagr_3y_pct: number;
  min_eps_cagr_5y_pct: number;
  breakout_only: boolean;
  volume_spike_only: boolean;
  magic_formula_only: boolean;
  low_volatility_only: boolean;
  high_momentum_only: boolean;
  dividend_aristocrats_only: boolean;
  insider_buying_only: boolean;
  fcf_positive_5y: boolean;
  debt_decreasing_trend: boolean;
  roic_gt_wacc: boolean;
  operating_leverage_improving: boolean;
  sort_by: string;
  sort_order: "asc" | "desc";
  universe_limit: number;
  limit: number;
};

const defaultForm: ScreenerForm = {
  min_market_cap_b: 5,
  max_market_cap_b: 5000,
  min_pe: 0,
  max_pe: 40,
  min_roe_pct: 10,
  min_revenue_growth_pct: 5,
  max_debt_to_equity: 1.5,
  min_rsi: 0,
  max_rsi: 100,
  min_beta: 0,
  max_beta: 3,
  min_sharpe_ratio: 0,
  max_drawdown_5y_max: 100,
  max_volatility_percentile: 100,
  min_rolling_beta: 0,
  max_rolling_beta: 3,
  min_earnings_consistency: 0,
  min_revenue_cagr_3y_pct: 0,
  min_eps_cagr_5y_pct: 0,
  breakout_only: false,
  volume_spike_only: false,
  magic_formula_only: false,
  low_volatility_only: false,
  high_momentum_only: false,
  dividend_aristocrats_only: false,
  insider_buying_only: false,
  fcf_positive_5y: false,
  debt_decreasing_trend: false,
  roic_gt_wacc: false,
  operating_leverage_improving: false,
  sort_by: "score",
  sort_order: "desc",
  universe_limit: 220,
  limit: 120,
};

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "rgba(2, 8, 23, 0.92)",
  border: "1px solid rgba(148, 163, 184, 0.25)",
  borderRadius: "0.65rem",
  color: "#e5e7eb",
};

const CHART_LABEL_STYLE = { color: "#94a3b8", fontSize: 12 };

function safeNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

function histogramBucket(value: number): string {
  const start = Math.floor(value / 5) * 5;
  const end = start + 5;
  return `${start}%-${end}%`;
}

function sectorHeatColor(score: number): string {
  if (score >= 80) return "rgba(16, 185, 129, 0.32)";
  if (score >= 65) return "rgba(34, 197, 94, 0.24)";
  if (score >= 50) return "rgba(234, 179, 8, 0.22)";
  return "rgba(239, 68, 68, 0.24)";
}

function asNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function asPercentFromDecimal(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(digits)}%`;
}

function asSignedPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function toneClass(value: number | null | undefined, good: number, warn: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "text-textMuted";
  if (value >= good) return "text-success";
  if (value >= warn) return "text-warning";
  return "text-danger";
}

function inverseToneClass(value: number | null | undefined, goodMax: number, warnMax: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "text-textMuted";
  if (value <= goodMax) return "text-success";
  if (value <= warnMax) return "text-warning";
  return "text-danger";
}

function tagsForRow(row: ScreenerRow): string[] {
  const tags: string[] = [];
  if (row.breakout) tags.push("Breakout");
  if (row.volume_spike) tags.push("Volume Spike");
  if (row.advanced_flags?.magic_formula) tags.push("Magic Formula");
  if (row.advanced_flags?.low_volatility) tags.push("Low Volatility");
  if (row.advanced_flags?.high_momentum) tags.push("High Momentum");
  if (row.advanced_flags?.dividend_aristocrat) tags.push("Dividend Aristocrat");
  if (row.advanced_flags?.insider_buying === true) tags.push("Insider Buying");
  if (row.quality_flags?.fcf_positive_5y) tags.push("FCF+ 5Y");
  if (row.quality_flags?.debt_decreasing_trend) tags.push("Debt Downtrend");
  if (row.quality_flags?.roic_gt_wacc) tags.push("ROIC > WACC");
  return tags;
}

function toInputPercent(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  const decimal = Math.abs(num) > 2 ? num / 100 : num;
  return Math.round(decimal * 10000) / 100;
}

function toDebtRatio(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return defaultForm.max_debt_to_equity;
  return Math.abs(num) > 10 ? num / 100 : num;
}

function payloadFromForm(form: ScreenerForm, symbols: string[], mode: "basic" | "pro") {
  const payload: Record<string, unknown> = {
    symbols,
    min_market_cap: Math.max(0, form.min_market_cap_b) * 1_000_000_000,
    max_market_cap: Math.max(form.min_market_cap_b, form.max_market_cap_b) * 1_000_000_000,
    min_pe: Math.max(0, form.min_pe),
    max_pe: Math.max(form.min_pe, form.max_pe),
    min_roe: Math.max(0, form.min_roe_pct) / 100,
    min_revenue_growth: Math.max(0, form.min_revenue_growth_pct) / 100,
    max_debt_to_equity: Math.max(0, form.max_debt_to_equity),
    min_rsi: Math.max(0, form.min_rsi),
    max_rsi: Math.max(form.min_rsi, form.max_rsi),
    breakout_only: form.breakout_only,
    volume_spike_only: form.volume_spike_only,
    magic_formula_only: form.magic_formula_only,
    low_volatility_only: form.low_volatility_only,
    high_momentum_only: form.high_momentum_only,
    dividend_aristocrats_only: form.dividend_aristocrats_only,
    insider_buying_only: form.insider_buying_only,
    fcf_positive_5y: form.fcf_positive_5y,
    debt_decreasing_trend: form.debt_decreasing_trend,
    roic_gt_wacc: form.roic_gt_wacc,
    operating_leverage_improving: form.operating_leverage_improving,
    sort_by: form.sort_by,
    sort_order: form.sort_order,
    universe_limit: Math.max(80, Math.min(1200, form.universe_limit)),
    limit: Math.max(10, Math.min(500, form.limit)),
  };

  if (mode === "pro") {
    if (form.min_beta > 0 || form.max_beta < defaultForm.max_beta) {
      payload.min_beta = Math.max(0, form.min_beta);
      payload.max_beta = Math.max(form.min_beta, form.max_beta);
    }
    if (form.min_sharpe_ratio > 0) {
      payload.min_sharpe_ratio = form.min_sharpe_ratio;
    }
    if (form.max_drawdown_5y_max < 100) {
      payload.max_drawdown_5y_max = form.max_drawdown_5y_max;
    }
    if (form.max_volatility_percentile < 100) {
      payload.max_volatility_percentile = form.max_volatility_percentile;
    }
    if (form.min_rolling_beta > 0 || form.max_rolling_beta < defaultForm.max_rolling_beta) {
      payload.min_rolling_beta = form.min_rolling_beta;
      payload.max_rolling_beta = form.max_rolling_beta;
    }
    if (form.min_earnings_consistency > 0) {
      payload.min_earnings_consistency = form.min_earnings_consistency;
    }
    if (form.min_revenue_cagr_3y_pct > 0) {
      payload.min_revenue_cagr_3y = Math.max(0, form.min_revenue_cagr_3y_pct) / 100;
    }
    if (form.min_eps_cagr_5y_pct > 0) {
      payload.min_eps_cagr_5y = Math.max(0, form.min_eps_cagr_5y_pct) / 100;
    }
  }

  return payload;
}

function guaranteedPayload(symbols: string[], universeLimit: number, resultLimit: number) {
  return {
    symbols,
    breakout_only: false,
    volume_spike_only: false,
    magic_formula_only: false,
    low_volatility_only: false,
    high_momentum_only: false,
    dividend_aristocrats_only: false,
    insider_buying_only: false,
    fcf_positive_5y: false,
    debt_decreasing_trend: false,
    roic_gt_wacc: false,
    operating_leverage_improving: false,
    sort_by: "score",
    sort_order: "desc" as const,
    universe_limit: Math.max(80, Math.min(400, universeLimit)),
    limit: Math.max(30, Math.min(120, resultLimit)),
  };
}

export function ScreenerClient() {
  const [mode, setMode] = useState<"basic" | "pro">("basic");
  const [symbols, setSymbols] = useState("");
  const [form, setForm] = useState<ScreenerForm>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ScreenerRow[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [runInfo, setRunInfo] = useState<string | null>(null);
  const [runMeta, setRunMeta] = useState<ScreenerRunMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<ScreenerPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [backtestSeries, setBacktestSeries] = useState<Array<{ date: string; portfolio: number; benchmark: number }> | null>(null);

  useEffect(() => {
    api
      .screenerPresets()
      .then((response) => setPresets(response.items || []))
      .catch(() => setPresets([]));
  }, []);

  const usingUniverse = !symbols.trim().length;

  const advancedToggleEnabled =
    form.breakout_only ||
    form.volume_spike_only ||
    form.magic_formula_only ||
    form.low_volatility_only ||
    form.high_momentum_only ||
    form.dividend_aristocrats_only ||
    form.insider_buying_only ||
    form.fcf_positive_5y ||
    form.debt_decreasing_trend ||
    form.roic_gt_wacc ||
    form.operating_leverage_improving;

  const activeTags = useMemo(() => {
    const tags: Array<{ key: string; label: string }> = [];

    if (Math.abs(form.min_roe_pct - defaultForm.min_roe_pct) > 0.001) tags.push({ key: "min_roe_pct", label: `Min ROE > ${form.min_roe_pct}%` });
    if (Math.abs(form.min_revenue_growth_pct - defaultForm.min_revenue_growth_pct) > 0.001) {
      tags.push({ key: "min_revenue_growth_pct", label: `Revenue Growth > ${form.min_revenue_growth_pct}%` });
    }
    if (Math.abs(form.min_pe - defaultForm.min_pe) > 0.001 || Math.abs(form.max_pe - defaultForm.max_pe) > 0.001) {
      tags.push({ key: "pe_range", label: `P/E ${form.min_pe} - ${form.max_pe}` });
    }
    if (Math.abs(form.min_market_cap_b - defaultForm.min_market_cap_b) > 0.001 || Math.abs(form.max_market_cap_b - defaultForm.max_market_cap_b) > 0.001) {
      tags.push({ key: "market_cap_range", label: `Market Cap ${form.min_market_cap_b}B - ${form.max_market_cap_b}B` });
    }
    if (Math.abs(form.max_debt_to_equity - defaultForm.max_debt_to_equity) > 0.001) tags.push({ key: "max_debt_to_equity", label: `D/E < ${form.max_debt_to_equity.toFixed(2)}x` });
    if (Math.abs(form.min_rsi - defaultForm.min_rsi) > 0.001 || Math.abs(form.max_rsi - defaultForm.max_rsi) > 0.001) tags.push({ key: "rsi_range", label: `RSI ${form.min_rsi} - ${form.max_rsi}` });
    if (form.breakout_only) tags.push({ key: "breakout_only", label: "Breakout Only" });
    if (form.volume_spike_only) tags.push({ key: "volume_spike_only", label: "Volume Spike Only" });
    if (form.magic_formula_only) tags.push({ key: "magic_formula_only", label: "Magic Formula" });
    if (form.low_volatility_only) tags.push({ key: "low_volatility_only", label: "Low Volatility" });
    if (form.high_momentum_only) tags.push({ key: "high_momentum_only", label: "High Momentum" });
    if (form.dividend_aristocrats_only) tags.push({ key: "dividend_aristocrats_only", label: "Dividend Aristocrats" });
    if (form.insider_buying_only) tags.push({ key: "insider_buying_only", label: "Insider Buying" });
    if (form.fcf_positive_5y) tags.push({ key: "fcf_positive_5y", label: "FCF Positive (5Y)" });
    if (form.debt_decreasing_trend) tags.push({ key: "debt_decreasing_trend", label: "Debt Decreasing" });
    if (form.roic_gt_wacc) tags.push({ key: "roic_gt_wacc", label: "ROIC > WACC" });
    if (form.operating_leverage_improving) tags.push({ key: "operating_leverage_improving", label: "Operating Leverage Improving" });
    if (Math.abs(form.min_revenue_cagr_3y_pct - defaultForm.min_revenue_cagr_3y_pct) > 0.001) tags.push({ key: "min_revenue_cagr_3y_pct", label: `Rev CAGR (3Y) > ${form.min_revenue_cagr_3y_pct}%` });
    if (Math.abs(form.min_eps_cagr_5y_pct - defaultForm.min_eps_cagr_5y_pct) > 0.001) tags.push({ key: "min_eps_cagr_5y_pct", label: `EPS CAGR (5Y) > ${form.min_eps_cagr_5y_pct}%` });
    if (Math.abs(form.min_beta - defaultForm.min_beta) > 0.001 || Math.abs(form.max_beta - defaultForm.max_beta) > 0.001) tags.push({ key: "beta_range", label: `Beta ${form.min_beta.toFixed(2)} - ${form.max_beta.toFixed(2)}` });
    if (Math.abs(form.min_sharpe_ratio - defaultForm.min_sharpe_ratio) > 0.001) tags.push({ key: "min_sharpe_ratio", label: `Sharpe > ${form.min_sharpe_ratio.toFixed(2)}` });
    if (Math.abs(form.max_drawdown_5y_max - defaultForm.max_drawdown_5y_max) > 0.001) tags.push({ key: "max_drawdown_5y_max", label: `Max DD (5Y) < ${form.max_drawdown_5y_max.toFixed(1)}%` });
    if (Math.abs(form.max_volatility_percentile - defaultForm.max_volatility_percentile) > 0.001) tags.push({ key: "max_volatility_percentile", label: `Volatility Pctl < ${form.max_volatility_percentile.toFixed(1)}` });

    return tags;
  }, [form]);

  const activePreset = useMemo(() => presets.find((preset) => preset.id === activePresetId) ?? null, [activePresetId, presets]);

  const scoreDistribution = useMemo(() => {
    const buckets = new Map<string, number>();
    items.forEach((row) => {
      const score = safeNumber(row.score);
      if (score === null) return;
      const start = Math.floor(score / 10) * 10;
      const end = Math.min(start + 10, 100);
      const key = `${start}-${end}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    });
    return Array.from(buckets.entries())
      .map(([bucket, count]) => ({ bucket, count }))
      .sort((a, b) => Number(a.bucket.split("-")[0]) - Number(b.bucket.split("-")[0]));
  }, [items]);

  const roeHistogram = useMemo(() => {
    const buckets = new Map<string, number>();
    items.forEach((row) => {
      const roe = safeNumber(row.roe);
      if (roe === null) return;
      const label = histogramBucket(roe * 100);
      buckets.set(label, (buckets.get(label) ?? 0) + 1);
    });
    return Array.from(buckets.entries())
      .map(([bucket, count]) => ({ bucket, count }))
      .sort((a, b) => Number(a.bucket.split("%-")[0]) - Number(b.bucket.split("%-")[0]));
  }, [items]);

  const growthVsRoeData = useMemo(
    () =>
      items
        .map((row) => ({
          symbol: row.symbol,
          growth: row.revenue_growth != null ? row.revenue_growth * 100 : null,
          roe: row.roe != null ? row.roe * 100 : null,
          score: row.score ?? 0,
        }))
        .filter((row) => row.growth !== null && row.roe !== null),
    [items],
  );

  const sectorHeatmap = useMemo(() => {
    const bySector = new Map<string, { totalScore: number; count: number; avgRoe: number; avgGrowth: number }>();
    items.forEach((row) => {
      const sector = (row.sector || "Unknown").trim() || "Unknown";
      const entry = bySector.get(sector) ?? { totalScore: 0, count: 0, avgRoe: 0, avgGrowth: 0 };
      entry.totalScore += row.score ?? 0;
      entry.avgRoe += row.roe ?? 0;
      entry.avgGrowth += row.revenue_growth ?? 0;
      entry.count += 1;
      bySector.set(sector, entry);
    });
    return Array.from(bySector.entries())
      .map(([sector, value]) => ({
        sector,
        count: value.count,
        avgScore: value.count ? value.totalScore / value.count : 0,
        avgRoe: value.count ? (value.avgRoe / value.count) * 100 : 0,
        avgGrowth: value.count ? (value.avgGrowth / value.count) * 100 : 0,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
  }, [items]);

  function clearTag(key: string) {
    setForm((previous) => {
      switch (key) {
        case "min_roe_pct":
          return { ...previous, min_roe_pct: defaultForm.min_roe_pct };
        case "min_revenue_growth_pct":
          return { ...previous, min_revenue_growth_pct: defaultForm.min_revenue_growth_pct };
        case "pe_range":
          return { ...previous, min_pe: defaultForm.min_pe, max_pe: defaultForm.max_pe };
        case "market_cap_range":
          return { ...previous, min_market_cap_b: defaultForm.min_market_cap_b, max_market_cap_b: defaultForm.max_market_cap_b };
        case "max_debt_to_equity":
          return { ...previous, max_debt_to_equity: defaultForm.max_debt_to_equity };
        case "rsi_range":
          return { ...previous, min_rsi: defaultForm.min_rsi, max_rsi: defaultForm.max_rsi };
        case "beta_range":
          return { ...previous, min_beta: defaultForm.min_beta, max_beta: defaultForm.max_beta };
        case "min_revenue_cagr_3y_pct":
          return { ...previous, min_revenue_cagr_3y_pct: defaultForm.min_revenue_cagr_3y_pct };
        case "min_eps_cagr_5y_pct":
          return { ...previous, min_eps_cagr_5y_pct: defaultForm.min_eps_cagr_5y_pct };
        case "min_sharpe_ratio":
          return { ...previous, min_sharpe_ratio: defaultForm.min_sharpe_ratio };
        case "max_drawdown_5y_max":
          return { ...previous, max_drawdown_5y_max: defaultForm.max_drawdown_5y_max };
        case "max_volatility_percentile":
          return { ...previous, max_volatility_percentile: defaultForm.max_volatility_percentile };
        default:
          return { ...previous, [key]: false } as ScreenerForm;
      }
    });
  }

  function applyPreset(preset: ScreenerPreset) {
    const filters = preset.filters || {};
    setActivePresetId(preset.id);
    setForm((previous) => {
      const next: ScreenerForm = {
        ...defaultForm,
        universe_limit: previous.universe_limit,
        limit: previous.limit,
      };

      if (typeof filters.min_market_cap === "number") next.min_market_cap_b = filters.min_market_cap / 1_000_000_000;
      if (typeof filters.max_market_cap === "number") next.max_market_cap_b = filters.max_market_cap / 1_000_000_000;
      if (typeof filters.min_pe === "number") next.min_pe = filters.min_pe;
      if (typeof filters.max_pe === "number") next.max_pe = filters.max_pe;
      if (typeof filters.min_roe === "number") next.min_roe_pct = toInputPercent(filters.min_roe);
      if (typeof filters.min_revenue_growth === "number") next.min_revenue_growth_pct = toInputPercent(filters.min_revenue_growth);
      if (typeof filters.max_debt_to_equity === "number") next.max_debt_to_equity = toDebtRatio(filters.max_debt_to_equity);
      if (typeof filters.min_rsi === "number") next.min_rsi = filters.min_rsi;
      if (typeof filters.max_rsi === "number") next.max_rsi = filters.max_rsi;
      if (typeof filters.min_beta === "number") next.min_beta = filters.min_beta;
      if (typeof filters.max_beta === "number") next.max_beta = filters.max_beta;
      if (typeof filters.min_sharpe_ratio === "number") next.min_sharpe_ratio = filters.min_sharpe_ratio;
      if (typeof filters.max_drawdown_5y_max === "number") next.max_drawdown_5y_max = filters.max_drawdown_5y_max;
      if (typeof filters.max_volatility_percentile === "number") next.max_volatility_percentile = filters.max_volatility_percentile;
      if (typeof filters.min_revenue_cagr_3y === "number") next.min_revenue_cagr_3y_pct = toInputPercent(filters.min_revenue_cagr_3y);
      if (typeof filters.min_eps_cagr_5y === "number") next.min_eps_cagr_5y_pct = toInputPercent(filters.min_eps_cagr_5y);
      if (typeof filters.min_earnings_consistency === "number") next.min_earnings_consistency = filters.min_earnings_consistency;

      next.breakout_only = Boolean(filters.breakout_only);
      next.volume_spike_only = Boolean(filters.volume_spike_only);
      next.magic_formula_only = Boolean(filters.magic_formula_only);
      next.low_volatility_only = Boolean(filters.low_volatility_only);
      next.high_momentum_only = Boolean(filters.high_momentum_only);
      next.dividend_aristocrats_only = Boolean(filters.dividend_aristocrats_only);
      next.insider_buying_only = Boolean(filters.insider_buying_only);
      next.fcf_positive_5y = Boolean(filters.fcf_positive_5y);
      next.debt_decreasing_trend = Boolean(filters.debt_decreasing_trend);
      next.roic_gt_wacc = Boolean(filters.roic_gt_wacc);
      next.operating_leverage_improving = Boolean(filters.operating_leverage_improving);
      return next;
    });
  }

  async function run() {
    setLoading(true);
    setError(null);
    setRunInfo(null);
    setRunMeta(null);
    setHasRun(true);
    setBacktestError(null);
    setBacktestSeries(null);

    const parsedSymbols = symbols
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);

    try {
      const payload = payloadFromForm(form, parsedSymbols, mode);
      const response = await api.runScreener(payload);
      const strictItems = response.items || [];
      const strictMeta = response.meta || null;
      const strictTimedOutWithoutMatches = Boolean(strictMeta?.timed_out && strictItems.length === 0);

      if (strictItems.length) {
        setItems(strictItems);
        setRunMeta(strictMeta);

        if (strictMeta?.timed_out) {
          setRunInfo("Scan reached time limit and returned partial results. Narrow the universe or disable heavy filters for full coverage.");
        } else if (strictMeta?.universe_trimmed && typeof strictMeta.requested_symbols === "number") {
          setRunInfo(`Heavy scan detected. Universe was auto-trimmed to ${strictMeta.requested_symbols} symbols for stability.`);
        }
        return;
      }

      if (strictTimedOutWithoutMatches) {
        setRunInfo("Scan timed out before finding matches. Relax strict filters or reduce universe size.");
      }

      if (advancedToggleEnabled) {
        const relaxedResponse = await api.runScreener({
          ...payload,
          breakout_only: false,
          volume_spike_only: false,
          magic_formula_only: false,
          low_volatility_only: false,
          high_momentum_only: false,
          dividend_aristocrats_only: false,
          insider_buying_only: false,
          fcf_positive_5y: false,
          debt_decreasing_trend: false,
          roic_gt_wacc: false,
          operating_leverage_improving: false,
          universe_limit: usingUniverse ? Math.min(form.universe_limit, 120) : form.universe_limit,
          limit: Math.min(form.limit, 80),
        });

        const relaxedItems = relaxedResponse.items || [];
        if (relaxedItems.length) {
          setItems(relaxedItems);
          setRunMeta(relaxedResponse.meta || null);
          setRunInfo("No exact matches with all advanced filters. Showing closest recommendations with strict toggles relaxed.");
          return;
        }
      }

      const guaranteedResponse = await api.runScreener(
        guaranteedPayload(
          parsedSymbols,
          parsedSymbols.length ? form.universe_limit : Math.min(form.universe_limit, 80),
          Math.min(form.limit, 80),
        ),
      );
      const guaranteedItems = guaranteedResponse.items || [];
      if (guaranteedItems.length) {
        setItems(guaranteedItems);
        setRunMeta(guaranteedResponse.meta || null);
        setRunInfo(
          strictTimedOutWithoutMatches
            ? "Strict preset scan timed out. Showing broader fallback recommendations."
            : "No exact matches for current filters. Showing broad recommendations so you always get comparable ideas.",
        );
        return;
      }

      setItems([]);
      setRunMeta(strictMeta);
      setRunInfo(
        strictTimedOutWithoutMatches
          ? "Strict preset scan timed out and fallback found no matches. Reduce universe size to 100 and try again."
          : "No stocks matched current filters.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Screener failed";
      const looksLikeReset =
        /socket hang up|ECONNRESET|Internal Server Error|proxy/i.test(message);

      if (looksLikeReset) {
        try {
          const rescue = await api.runScreener(
            guaranteedPayload(
              parsedSymbols,
              parsedSymbols.length ? form.universe_limit : Math.min(80, form.universe_limit),
              Math.min(80, form.limit),
            ),
          );
          const rescueItems = rescue.items || [];
          if (rescueItems.length) {
            setItems(rescueItems);
            setRunMeta(rescue.meta || null);
            setRunInfo("Heavy scan timed out. Showing fast fallback results.");
            setError(null);
            return;
          }
        } catch {
          // keep original error below
        }
      }

      setError(message);
      setItems([]);
      setRunMeta(null);
    } finally {
      setLoading(false);
    }
  }

  async function runBacktest() {
    if (!items.length) return;
    setBacktestLoading(true);
    setBacktestError(null);
    setBacktestSeries(null);

    try {
      const symbolsToBacktest = items
        .slice(0, 10)
        .map((row) => row.symbol)
        .filter(Boolean);

      const historyResponses = await Promise.all(
        symbolsToBacktest.map(async (symbol) => {
          try {
            const history = await api.getHistory(symbol, "5y");
            return { symbol, items: history.items || [] };
          } catch {
            return { symbol, items: [] as Array<{ date: string; close: number }> };
          }
        }),
      );

      const benchmark = await api.getHistory("SPY", "5y");
      const benchmarkSeries = (benchmark.items || [])
        .map((point) => ({ date: point.date, close: Number(point.close) }))
        .filter((point) => Number.isFinite(point.close) && point.close > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (!benchmarkSeries.length) {
        throw new Error("Benchmark history unavailable.");
      }

      const benchmarkBase = benchmarkSeries[0]?.close;
      if (!benchmarkBase) throw new Error("Invalid benchmark base value.");

      const normalizedBySymbol = historyResponses
        .map((series) => {
          const rows = (series.items || [])
            .map((point) => ({ date: point.date, close: Number(point.close) }))
            .filter((point) => Number.isFinite(point.close) && point.close > 0)
            .sort((a, b) => a.date.localeCompare(b.date));
          const base = rows[0]?.close;
          return {
            symbol: series.symbol,
            base: base ?? null,
            values: new Map(rows.map((point) => [point.date, point.close] as const)),
          };
        })
        .filter((series) => series.base !== null && series.values.size > 0);

      if (!normalizedBySymbol.length) {
        throw new Error("Not enough symbol history to backtest current selection.");
      }

      const data = benchmarkSeries
        .map((point) => {
          let sum = 0;
          let count = 0;
          normalizedBySymbol.forEach((series) => {
            const close = series.values.get(point.date);
            if (!close || !series.base) return;
            sum += (close / series.base) * 100;
            count += 1;
          });
          if (!count) return null;
          return {
            date: point.date,
            benchmark: (point.close / benchmarkBase) * 100,
            portfolio: sum / count,
          };
        })
        .filter((point): point is { date: string; benchmark: number; portfolio: number } => point !== null);

      if (data.length < 20) {
        throw new Error("Backtest needs more history points. Try running screener again.");
      }

      setBacktestSeries(data);
    } catch (err) {
      setBacktestError(err instanceof Error ? err.message : "Backtest failed");
    } finally {
      setBacktestLoading(false);
    }
  }

  return (
    <section className="space-y-5 animate-rise">
      <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl">Stock Screener</h1>
            <p className="mt-2 text-sm text-textMuted">Factor-based + explainable scoring with beginner and pro workflows.</p>
          </div>
          <div className="inline-flex rounded-xl border border-borderGlass bg-bgSoft p-1 text-xs">
            <button
              onClick={() => setMode("basic")}
              className={`rounded-lg px-3 py-1.5 ${mode === "basic" ? "bg-accent text-black" : "text-textMain"}`}
            >
              Basic Mode
            </button>
            <button
              onClick={() => setMode("pro")}
              className={`rounded-lg px-3 py-1.5 ${mode === "pro" ? "bg-accent text-black" : "text-textMain"}`}
            >
              Pro Mode
            </button>
          </div>
        </div>

        {!!presets.length && (
          <div className="mt-4">
            <p className="text-xs text-textMuted">Framework Presets</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  title={preset.for || ""}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${activePresetId === preset.id ? "border-accent bg-accent/10 text-accent" : "border-borderGlass bg-bgSoft text-textMain hover:border-accent"}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {activePreset && <p className="mt-2 text-xs text-textMuted">{activePreset.for}</p>}
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs text-textMuted xl:col-span-2">
            Universe symbols (comma separated). Leave blank to scan market universe.
            <input value={symbols} onChange={(event) => setSymbols(event.target.value)} className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-textMuted">
            Universe size
            <input
              type="number"
              value={form.universe_limit}
              onChange={(event) => setForm((previous) => ({ ...previous, universe_limit: Math.max(80, Math.min(1200, Number(event.target.value) || 220)) }))}
              className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-textMuted">
            Result limit
            <input
              type="number"
              value={form.limit}
              onChange={(event) => setForm((previous) => ({ ...previous, limit: Math.max(10, Math.min(500, Number(event.target.value) || 120)) }))}
              className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-borderGlass bg-bgSoft p-3">
          <div className="mb-2 inline-flex items-center gap-2 text-xs uppercase tracking-wide text-textMuted">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Core Filters
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-2 text-xs text-textMuted">
              <p>Market Cap Range ({form.min_market_cap_b}B - {form.max_market_cap_b}B)</p>
              <input type="range" min={0} max={5000} step={10} value={form.min_market_cap_b} onChange={(event) => setForm((p) => ({ ...p, min_market_cap_b: Math.min(Number(event.target.value), p.max_market_cap_b) }))} className="w-full" />
              <input type="range" min={0} max={5000} step={10} value={form.max_market_cap_b} onChange={(event) => setForm((p) => ({ ...p, max_market_cap_b: Math.max(Number(event.target.value), p.min_market_cap_b) }))} className="w-full" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={form.min_market_cap_b} onChange={(event) => setForm((p) => ({ ...p, min_market_cap_b: Math.max(0, Math.min(Number(event.target.value) || 0, p.max_market_cap_b)) }))} className="rounded-lg border border-borderGlass bg-card px-2 py-1.5 text-xs" />
                <input type="number" value={form.max_market_cap_b} onChange={(event) => setForm((p) => ({ ...p, max_market_cap_b: Math.max(p.min_market_cap_b, Number(event.target.value) || p.max_market_cap_b) }))} className="rounded-lg border border-borderGlass bg-card px-2 py-1.5 text-xs" />
              </div>
            </div>

            <div className="space-y-2 text-xs text-textMuted">
              <p>P/E Range ({form.min_pe} - {form.max_pe})</p>
              <input type="range" min={0} max={120} step={1} value={form.min_pe} onChange={(event) => setForm((p) => ({ ...p, min_pe: Math.min(Number(event.target.value), p.max_pe) }))} className="w-full" />
              <input type="range" min={0} max={120} step={1} value={form.max_pe} onChange={(event) => setForm((p) => ({ ...p, max_pe: Math.max(Number(event.target.value), p.min_pe) }))} className="w-full" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={form.min_pe} onChange={(event) => setForm((p) => ({ ...p, min_pe: Math.max(0, Math.min(Number(event.target.value) || 0, p.max_pe)) }))} className="rounded-lg border border-borderGlass bg-card px-2 py-1.5 text-xs" />
                <input type="number" value={form.max_pe} onChange={(event) => setForm((p) => ({ ...p, max_pe: Math.max(p.min_pe, Number(event.target.value) || p.max_pe) }))} className="rounded-lg border border-borderGlass bg-card px-2 py-1.5 text-xs" />
              </div>
            </div>

            <div className="space-y-2 text-xs text-textMuted">
              <p>RSI Range ({form.min_rsi} - {form.max_rsi})</p>
              <input type="range" min={0} max={100} step={1} value={form.min_rsi} onChange={(event) => setForm((p) => ({ ...p, min_rsi: Math.min(Number(event.target.value), p.max_rsi) }))} className="w-full" />
              <input type="range" min={0} max={100} step={1} value={form.max_rsi} onChange={(event) => setForm((p) => ({ ...p, max_rsi: Math.max(Number(event.target.value), p.min_rsi) }))} className="w-full" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={form.min_rsi} onChange={(event) => setForm((p) => ({ ...p, min_rsi: Math.max(0, Math.min(Number(event.target.value) || 0, p.max_rsi)) }))} className="rounded-lg border border-borderGlass bg-card px-2 py-1.5 text-xs" />
                <input type="number" value={form.max_rsi} onChange={(event) => setForm((p) => ({ ...p, max_rsi: Math.min(100, Math.max(p.min_rsi, Number(event.target.value) || p.max_rsi)) }))} className="rounded-lg border border-borderGlass bg-card px-2 py-1.5 text-xs" />
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs text-textMuted">
              Min ROE (%)
              <input type="number" step="0.1" value={form.min_roe_pct} onChange={(event) => setForm((p) => ({ ...p, min_roe_pct: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1 w-full rounded-xl border border-borderGlass bg-card px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-textMuted">
              Min Revenue Growth (%)
              <input type="number" step="0.1" value={form.min_revenue_growth_pct} onChange={(event) => setForm((p) => ({ ...p, min_revenue_growth_pct: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1 w-full rounded-xl border border-borderGlass bg-card px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-textMuted">
              Max Debt/Equity (x)
              <input type="number" step="0.01" value={form.max_debt_to_equity} onChange={(event) => setForm((p) => ({ ...p, max_debt_to_equity: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1 w-full rounded-xl border border-borderGlass bg-card px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-textMuted">
              Sort
              <div className="mt-1 grid grid-cols-2 gap-2">
                <select value={form.sort_by} onChange={(event) => setForm((p) => ({ ...p, sort_by: event.target.value }))} className="rounded-xl border border-borderGlass bg-card px-2 py-2 text-xs">
                  <option value="score">AI Score</option>
                  <option value="growth">Growth</option>
                  <option value="roe">ROE</option>
                  <option value="momentum">Momentum</option>
                  <option value="volatility">Volatility</option>
                  <option value="composite_rank">Composite Rank</option>
                  <option value="revenue_cagr_3y">Revenue CAGR 3Y</option>
                  <option value="eps_cagr_5y">EPS CAGR 5Y</option>
                  <option value="sharpe_ratio">Sharpe</option>
                </select>
                <select value={form.sort_order} onChange={(event) => setForm((p) => ({ ...p, sort_order: event.target.value as "asc" | "desc" }))} className="rounded-xl border border-borderGlass bg-card px-2 py-2 text-xs">
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>
            </label>
          </div>
        </div>

        {mode === "pro" && (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="inline-flex items-center gap-2 text-xs text-textMuted"><input type="checkbox" checked={form.breakout_only} onChange={(event) => setForm((p) => ({ ...p, breakout_only: event.target.checked }))} /> Breakout stocks only</label>
              <label className="inline-flex items-center gap-2 text-xs text-textMuted"><input type="checkbox" checked={form.volume_spike_only} onChange={(event) => setForm((p) => ({ ...p, volume_spike_only: event.target.checked }))} /> Volume spike only</label>
              <label className="inline-flex items-center gap-2 text-xs text-textMuted"><input type="checkbox" checked={form.magic_formula_only} onChange={(event) => setForm((p) => ({ ...p, magic_formula_only: event.target.checked }))} /> Magic formula</label>
              <label className="inline-flex items-center gap-2 text-xs text-textMuted"><input type="checkbox" checked={form.low_volatility_only} onChange={(event) => setForm((p) => ({ ...p, low_volatility_only: event.target.checked }))} /> Low volatility</label>
              <label className="inline-flex items-center gap-2 text-xs text-textMuted"><input type="checkbox" checked={form.high_momentum_only} onChange={(event) => setForm((p) => ({ ...p, high_momentum_only: event.target.checked }))} /> High momentum</label>
              <label className="inline-flex items-center gap-2 text-xs text-textMuted"><input type="checkbox" checked={form.dividend_aristocrats_only} onChange={(event) => setForm((p) => ({ ...p, dividend_aristocrats_only: event.target.checked }))} /> Dividend aristocrats</label>
              <label className="inline-flex items-center gap-2 text-xs text-textMuted"><input type="checkbox" checked={form.insider_buying_only} onChange={(event) => setForm((p) => ({ ...p, insider_buying_only: event.target.checked }))} /> Insider buying</label>
              <label className="inline-flex items-center gap-2 text-xs text-textMuted"><input type="checkbox" checked={form.fcf_positive_5y} onChange={(event) => setForm((p) => ({ ...p, fcf_positive_5y: event.target.checked }))} /> FCF positive (5Y)</label>
              <label className="inline-flex items-center gap-2 text-xs text-textMuted"><input type="checkbox" checked={form.debt_decreasing_trend} onChange={(event) => setForm((p) => ({ ...p, debt_decreasing_trend: event.target.checked }))} /> Debt decreasing trend</label>
              <label className="inline-flex items-center gap-2 text-xs text-textMuted"><input type="checkbox" checked={form.roic_gt_wacc} onChange={(event) => setForm((p) => ({ ...p, roic_gt_wacc: event.target.checked }))} /> ROIC &gt; WACC</label>
              <label className="inline-flex items-center gap-2 text-xs text-textMuted"><input type="checkbox" checked={form.operating_leverage_improving} onChange={(event) => setForm((p) => ({ ...p, operating_leverage_improving: event.target.checked }))} /> Operating leverage improving</label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs text-textMuted">Min Revenue CAGR (3Y, %)<input type="number" step="0.1" value={form.min_revenue_cagr_3y_pct} onChange={(event) => setForm((p) => ({ ...p, min_revenue_cagr_3y_pct: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" /></label>
              <label className="text-xs text-textMuted">Min EPS CAGR (5Y, %)<input type="number" step="0.1" value={form.min_eps_cagr_5y_pct} onChange={(event) => setForm((p) => ({ ...p, min_eps_cagr_5y_pct: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" /></label>
              <label className="text-xs text-textMuted">Min Earnings Consistency<input type="number" step="1" value={form.min_earnings_consistency} onChange={(event) => setForm((p) => ({ ...p, min_earnings_consistency: Math.max(0, Math.min(100, Number(event.target.value) || 0)) }))} className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" /></label>
              <label className="text-xs text-textMuted">Min Sharpe Ratio<input type="number" step="0.05" value={form.min_sharpe_ratio} onChange={(event) => setForm((p) => ({ ...p, min_sharpe_ratio: Number(event.target.value) || 0 }))} className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" /></label>
              <label className="text-xs text-textMuted">Beta Min<input type="number" step="0.05" value={form.min_beta} onChange={(event) => setForm((p) => ({ ...p, min_beta: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" /></label>
              <label className="text-xs text-textMuted">Beta Max<input type="number" step="0.05" value={form.max_beta} onChange={(event) => setForm((p) => ({ ...p, max_beta: Math.max(p.min_beta, Number(event.target.value) || p.max_beta) }))} className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" /></label>
              <label className="text-xs text-textMuted">Max Drawdown (5Y, %)<input type="number" step="1" value={form.max_drawdown_5y_max} onChange={(event) => setForm((p) => ({ ...p, max_drawdown_5y_max: Math.max(0, Math.min(100, Number(event.target.value) || 100)) }))} className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" /></label>
              <label className="text-xs text-textMuted">Max Volatility Percentile<input type="number" step="1" value={form.max_volatility_percentile} onChange={(event) => setForm((p) => ({ ...p, max_volatility_percentile: Math.max(0, Math.min(100, Number(event.target.value) || 100)) }))} className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" /></label>
            </div>
          </>
        )}

        {!!activeTags.length && (
          <div className="mt-4 flex flex-wrap gap-2">
            {activeTags.map((tag) => (
              <button key={tag.key} onClick={() => clearTag(tag.key)} className="inline-flex items-center gap-1 rounded-full border border-borderGlass bg-bgSoft px-2 py-1 text-[11px] text-textMain hover:border-accent">
                {tag.label}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}

        <button onClick={run} className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90">
          <Filter className="mr-1 inline h-4 w-4" />
          {loading ? "Running..." : "Run Screener"}
        </button>

        <p className="mt-2 text-xs text-textMuted">
          {usingUniverse
            ? `Using market universe scan (${form.universe_limit} symbols max).`
            : "Using custom symbol universe from your input list."}
        </p>

        {runInfo && <p className="mt-2 text-xs text-warning">{runInfo}</p>}

        {!!runMeta?.relaxation_suggestions?.length && (
          <div className="mt-3 rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs text-textMuted">
            <p className="mb-2 inline-flex items-center gap-1 text-textMain"><Sparkles className="h-3.5 w-3.5 text-accent" /> Smart relaxation suggestions</p>
            <ul className="space-y-1.5">
              {runMeta.relaxation_suggestions.slice(0, 4).map((item) => (
                <li key={`${item.filter}-${item.count}`}>{item.suggestion}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-card p-4 text-sm text-danger">{error}</div>}

      {!!items.length && (
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-borderGlass bg-card p-4 shadow-glow xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-xl">Backtest (Top 10 Picks vs SPY)</h3>
                <p className="text-xs text-textMuted">Equal-weight portfolio from current screener ranking over 5 years.</p>
              </div>
              <button
                onClick={runBacktest}
                disabled={backtestLoading}
                className="rounded-lg border border-borderGlass bg-bgSoft px-3 py-1.5 text-xs font-medium text-textMain hover:border-accent disabled:opacity-60"
              >
                {backtestLoading ? "Running backtest..." : "Run 5Y Backtest"}
              </button>
            </div>
            {backtestError && <p className="mt-3 text-xs text-danger">{backtestError}</p>}
            {backtestSeries && (
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={backtestSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="date" tick={CHART_LABEL_STYLE} minTickGap={35} />
                    <YAxis tick={CHART_LABEL_STYLE} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => `${value.toFixed(2)}`} />
                    <Line type="monotone" dataKey="portfolio" stroke="#2dd4bf" strokeWidth={2.5} dot={false} name="Portfolio" />
                    <Line type="monotone" dataKey="benchmark" stroke="#94a3b8" strokeWidth={2} dot={false} name="SPY" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-borderGlass bg-card p-4 shadow-glow xl:col-span-2">
            <h3 className="font-display text-xl">Sector Heatmap</h3>
            <p className="text-xs text-textMuted">Average AI score and quality trend across current screener results.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sectorHeatmap.slice(0, 16).map((sector) => (
                <div
                  key={sector.sector}
                  className="rounded-xl border border-borderGlass p-3"
                  style={{ backgroundColor: sectorHeatColor(sector.avgScore) }}
                >
                  <p className="truncate text-sm font-semibold text-textMain">{sector.sector}</p>
                  <p className="text-xs text-textMuted">Score {sector.avgScore.toFixed(1)}</p>
                  <p className="text-xs text-textMuted">ROE {sector.avgRoe.toFixed(1)}%</p>
                  <p className="text-xs text-textMuted">Growth {sector.avgGrowth.toFixed(1)}%</p>
                  <p className="text-[11px] text-textMuted">{sector.count} stocks</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-borderGlass bg-card p-4 shadow-glow">
            <h3 className="font-display text-xl">AI Score Distribution</h3>
            <p className="text-xs text-textMuted">Result count by AI score buckets.</p>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="bucket" tick={CHART_LABEL_STYLE} />
                  <YAxis tick={CHART_LABEL_STYLE} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {scoreDistribution.map((entry) => {
                      const start = Number(entry.bucket.split("-")[0]);
                      return <Cell key={entry.bucket} fill={start >= 70 ? "#22c55e" : start >= 50 ? "#eab308" : "#ef4444"} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-borderGlass bg-card p-4 shadow-glow">
            <h3 className="font-display text-xl">ROE Histogram</h3>
            <p className="text-xs text-textMuted">Distribution of return on equity in filtered results.</p>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roeHistogram}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="bucket" tick={CHART_LABEL_STYLE} />
                  <YAxis tick={CHART_LABEL_STYLE} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-borderGlass bg-card p-4 shadow-glow xl:col-span-2">
            <h3 className="font-display text-xl">Growth vs ROE Scatter</h3>
            <p className="text-xs text-textMuted">Spot quality compounders and momentum traps quickly.</p>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis type="number" dataKey="growth" name="Growth %" tick={CHART_LABEL_STYLE} domain={["auto", "auto"]} />
                  <YAxis type="number" dataKey="roe" name="ROE %" tick={CHART_LABEL_STYLE} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    cursor={{ strokeDasharray: "3 3" }}
                    formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.symbol || ""}
                  />
                  <Scatter data={growthVsRoeData} fill="#2dd4bf" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-borderGlass bg-card shadow-glow">
        <table className="min-w-[1800px] text-sm">
          <thead className="bg-bgSoft text-left text-xs uppercase text-textMuted">
            <tr>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Market Cap</th>
              <th className="px-4 py-3">P/E</th>
              <th className="px-4 py-3">ROE</th>
              <th className="px-4 py-3">Growth</th>
              <th className="px-4 py-3">D/E</th>
              <th className="px-4 py-3">FCF Yield</th>
              <th className="px-4 py-3">ROIC</th>
              <th className="px-4 py-3">Rev CAGR 3Y</th>
              <th className="px-4 py-3">EPS CAGR 5Y</th>
              <th className="px-4 py-3">Net Debt</th>
              <th className="px-4 py-3">EV/EBITDA</th>
              <th className="px-4 py-3">Piotroski</th>
              <th className="px-4 py-3">Sharpe</th>
              <th className="px-4 py-3">Max DD 5Y</th>
              <th className="px-4 py-3">Vol Pctl</th>
              <th className="px-4 py-3">6M Mom</th>
              <th className="px-4 py-3">Composite</th>
              <th className="px-4 py-3">Percentile</th>
              <th className="px-4 py-3">Sector Rank</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3">AI Score</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const tags = tagsForRow(row);
              const scoreBreakdown = row.score_breakdown;
              return (
                <tr key={row.symbol} className="border-t border-borderGlass text-textMuted">
                  <td className="px-4 py-3 font-medium text-textMain">{row.symbol}</td>
                  <td className="px-4 py-3">{typeof row.price === "number" ? `$${row.price.toFixed(2)}` : "-"}</td>
                  <td className="px-4 py-3">{typeof row.market_cap === "number" ? formatLarge(row.market_cap) : "-"}</td>
                  <td className="px-4 py-3">{asNumber(row.pe)}</td>
                  <td className={`px-4 py-3 ${toneClass(row.roe ?? null, 0.15, 0.08)}`}>{asPercentFromDecimal(row.roe)}</td>
                  <td className={`px-4 py-3 ${toneClass(row.revenue_growth ?? null, 0.1, 0.03)}`}>{asPercentFromDecimal(row.revenue_growth)}</td>
                  <td className={`px-4 py-3 ${inverseToneClass(row.debt_to_equity ?? null, 1, 2)}`}>{row.debt_to_equity != null ? `${row.debt_to_equity.toFixed(2)}x` : "-"}</td>
                  <td className={`px-4 py-3 ${toneClass(row.fcf_yield ?? null, 0.04, 0.01)}`}>{asPercentFromDecimal(row.fcf_yield)}</td>
                  <td className={`px-4 py-3 ${toneClass(row.roic ?? null, 0.12, 0.08)}`}>{asPercentFromDecimal(row.roic)}</td>
                  <td className={`px-4 py-3 ${toneClass(row.revenue_cagr_3y ?? null, 0.1, 0.03)}`}>{asPercentFromDecimal(row.revenue_cagr_3y)}</td>
                  <td className={`px-4 py-3 ${toneClass(row.eps_cagr_5y ?? null, 0.1, 0.03)}`}>{asPercentFromDecimal(row.eps_cagr_5y)}</td>
                  <td className="px-4 py-3">{typeof row.net_debt === "number" ? formatLarge(row.net_debt) : "-"}</td>
                  <td className="px-4 py-3">{asNumber(row.ev_ebitda)}</td>
                  <td className={`px-4 py-3 ${toneClass(row.piotroski_score ?? null, 7, 4)}`}>{asNumber(row.piotroski_score, 0)}</td>
                  <td className={`px-4 py-3 ${toneClass(row.sharpe_ratio ?? null, 1, 0.5)}`}>{asNumber(row.sharpe_ratio)}</td>
                  <td className={`px-4 py-3 ${inverseToneClass(row.max_drawdown_5y_percent ?? null, 30, 45)}`}>{asPercentFromDecimal((row.max_drawdown_5y_percent ?? null) != null ? (row.max_drawdown_5y_percent as number) / 100 : null)}</td>
                  <td className={`px-4 py-3 ${inverseToneClass(row.volatility_percentile ?? null, 35, 65)}`}>{asNumber(row.volatility_percentile, 1)}</td>
                  <td className={`px-4 py-3 ${toneClass(row.momentum_6m_percent ?? null, 15, 3)}`}>{asSignedPercent(row.momentum_6m_percent)}</td>
                  <td className="px-4 py-3">#{row.composite_rank ?? "-"}</td>
                  <td className="px-4 py-3">{row.percentile_rank != null ? `${row.percentile_rank.toFixed(1)}%` : "-"}</td>
                  <td className="px-4 py-3">{row.sector_rank ?? "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-[15rem] flex-wrap gap-1">
                      {tags.slice(0, 4).map((tag) => (
                        <span key={`${row.symbol}-${tag}`} className="rounded-full border border-borderGlass bg-bgSoft px-2 py-0.5 text-[10px] text-textMain">{tag}</span>
                      ))}
                      {!tags.length && <span>-</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-accent/15 px-2 py-1 text-accent">{row.score ?? "-"}</span>
                    {!!scoreBreakdown && (
                      <p className="mt-1 text-[10px] text-textMuted">
                        Q {scoreBreakdown.quality ?? 0} | G {scoreBreakdown.growth ?? 0} | R {scoreBreakdown.risk ?? 0} | M {scoreBreakdown.momentum ?? 0}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}

            {!items.length && (
              <tr>
                <td className="px-4 py-8 text-center text-textMuted" colSpan={23}>
                  {hasRun ? "No results for current filters." : "Run screener to see results."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
