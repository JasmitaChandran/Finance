"use client";

import Link from "next/link";
import { ArrowUpRight, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
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
import { formatCurrency, formatLarge, ratioToPercent } from "@/lib/format";
import type { NewsSummary, StockDashboard as StockDashboardType, StockSummary } from "@/lib/types";

type UniverseStock = {
  symbol: string;
  name: string;
  exchange: string;
};

function toNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

function formatSignedPercent(value: number | null, digits = 2): string {
  if (value === null) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function formatPercentValue(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const numeric = Math.abs(value) < 2 ? value * 100 : value;
  return `${numeric.toFixed(2)}%`;
}

function formatNumberValue(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function computeReturn(current: number | null, base: number | null): number | null {
  if (current === null || base === null || base === 0) return null;
  return ((current - base) / base) * 100;
}

function annualizedVolatility(history: Array<{ close: number }>): number | null {
  if (history.length < 20) return null;

  const returns: number[] = [];
  for (let i = 1; i < history.length; i += 1) {
    const prev = history[i - 1].close;
    const curr = history[i].close;
    if (prev > 0) returns.push((curr - prev) / prev);
  }

  if (!returns.length) return null;

  const mean = returns.reduce((sum, item) => sum + item, 0) / returns.length;
  const variance = returns.reduce((sum, item) => sum + (item - mean) ** 2, 0) / returns.length;
  const dailyStd = Math.sqrt(variance);

  return dailyStd * Math.sqrt(252) * 100;
}

function valuationSignal(pe: number | null) {
  if (pe === null) {
    return { label: "Unknown", toneClass: "text-textMuted", description: "Not enough valuation data yet." };
  }
  if (pe < 20) {
    return { label: "Reasonable", toneClass: "text-success", description: "Compared to earnings, this price is not stretched." };
  }
  if (pe <= 35) {
    return { label: "Balanced", toneClass: "text-warning", description: "Valuation is fair, but growth must stay strong." };
  }
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
  if (debtToEquity < 1) {
    return { label: "Comfortable", toneClass: "text-success", description: "Debt level looks manageable for most sectors." };
  }
  if (debtToEquity <= 2) {
    return { label: "Watch", toneClass: "text-warning", description: "Debt is moderate; cash flow quality matters more here." };
  }
  return { label: "High", toneClass: "text-danger", description: "Leverage is high and can increase downside during stress." };
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
  const [universeStocks, setUniverseStocks] = useState<UniverseStock[]>([]);
  const [universeTotal, setUniverseTotal] = useState(0);
  const [universeLoading, setUniverseLoading] = useState(false);
  const [universeError, setUniverseError] = useState<string | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ symbol: string; name: string }>>([]);
  const [searchInfo, setSearchInfo] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

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
            explore: "Explorar"
          }
        : {
            heading: "AI Stock Insight Hub",
            beginnerSub: "Beginner mode: fewer numbers, clearer decisions, practical guidance.",
            proSub: "Pro mode: denser analytics, richer context, faster evaluation workflow.",
            intro: "Think of this as an investing copilot: simple when you start, detailed when you level up.",
            explore: "Explore"
          },
    [language]
  );

  const load = useCallback(
    async (symbol: string) => {
      setLoading(true);
      setError(null);
      try {
        const [dash, summaryRes, newsRes] = await Promise.all([
          api.getDashboard(symbol),
          api.getSummary(symbol, mode),
          api.getNewsSummary(symbol)
        ]);
        setDashboard(dash);
        setSummary(summaryRes);
        setNews(newsRes);
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
        if (replace) return response.items;
        const merged = [...previous];
        for (const item of response.items) {
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
        .slice(0, 8)
        .map((item) => ({ symbol: item.symbol.toUpperCase(), name: item.name || item.symbol.toUpperCase() }));

      setSearchSuggestions(suggestions);

      if (suggestions.length) {
        const upper = term.toUpperCase();
        const exact = suggestions.find((item) => item.symbol === upper);
        const chosen = exact ?? suggestions[0];
        if (!exact) {
          setSearchInfo(`Showing ${chosen.symbol} (${chosen.name}). Choose another suggestion below if needed.`);
        }
        await selectSymbol(chosen.symbol);
      } else {
        const looksLikeTicker = /^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(term);
        if (looksLikeTicker) {
          await selectSymbol(term.toUpperCase());
        } else {
          setSearchInfo(`No symbol matches found for "${term}". Try another company name or ticker.`);
        }
      }
    } catch {
      setSearchInfo("Could not fetch recommendations right now. Try again or enter a ticker symbol.");
    } finally {
      setSearching(false);
    }
  }, [loadUniverse, query, selectSymbol]);

  function speakSummary() {
    if (!summary || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(summary.eli15_summary);
    utterance.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setVoiceMode(true);
  }

  const pe = toNumber(dashboard?.ratios.pe);
  const roe = toNumber(dashboard?.ratios.roe);
  const debtToEquity = toNumber(dashboard?.ratios.debt_to_equity);
  const revenueGrowth = toNumber(dashboard?.ratios.revenue_growth);
  const profitMargin = toNumber(dashboard?.ratios.profit_margin);

  const valuation = valuationSignal(pe);
  const quality = qualitySignal(roe, profitMargin);
  const leverage = debtSignal(debtToEquity);

  const history = dashboard?.history ?? [];
  const latestClose = history.length ? history[history.length - 1].close : null;
  const monthBase = history.length > 21 ? history[history.length - 22].close : history[0]?.close ?? null;
  const halfYearBase = history[0]?.close ?? null;
  const oneMonthReturn = computeReturn(latestClose, monthBase);
  const sixMonthReturn = computeReturn(latestClose, halfYearBase);
  const volatility = annualizedVolatility(history);
  const newsPageHref = `/news?symbol=${encodeURIComponent(dashboard?.quote.symbol || "AAPL")}`;
  const marketData = dashboard?.market_data;
  const ohlcData = dashboard?.ohlc;

  const basicMarketDataSection = (
    <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <h3 className="font-display text-lg">Basic Market Data</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Live Price</p>
          <p className="mt-1 font-semibold text-textMain">{formatCurrency(marketData?.live_price ?? dashboard?.quote.price, dashboard?.quote.currency)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">% Change (1D / 1W / 1M / 1Y / 5Y)</p>
          <p className="mt-1 text-textMain">
            {formatSignedPercent(toNumber(marketData?.changes_percent?.["1d"] ?? null))} / {formatSignedPercent(toNumber(marketData?.changes_percent?.["1w"] ?? null))} /{" "}
            {formatSignedPercent(toNumber(marketData?.changes_percent?.["1m"] ?? null))} / {formatSignedPercent(toNumber(marketData?.changes_percent?.["1y"] ?? null))} /{" "}
            {formatSignedPercent(toNumber(marketData?.changes_percent?.["5y"] ?? null))}
          </p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Volume</p>
          <p className="mt-1 font-semibold text-textMain">{formatLarge(marketData?.volume ?? dashboard?.quote.volume)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Market Cap</p>
          <p className="mt-1 font-semibold text-textMain">{formatLarge(marketData?.market_cap ?? dashboard?.quote.market_cap)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">52-Week High / Low</p>
          <p className="mt-1 text-textMain">
            {formatCurrency(marketData?.week_52_high ?? null, dashboard?.quote.currency)} / {formatCurrency(marketData?.week_52_low ?? null, dashboard?.quote.currency)}
          </p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Beta</p>
          <p className="mt-1 text-textMain">{formatNumberValue(marketData?.beta)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">PE / PB / PEG</p>
          <p className="mt-1 text-textMain">
            {formatNumberValue(marketData?.pe)} / {formatNumberValue(marketData?.pb)} / {formatNumberValue(marketData?.peg)}
          </p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Dividend Yield</p>
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
          <p className="text-textMuted">ROE</p>
          <p className="mt-1 text-textMain">{formatPercentValue(marketData?.roe)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">ROCE</p>
          <p className="mt-1 text-textMain">{formatPercentValue(marketData?.roce)}</p>
        </div>
      </div>
    </div>
  );

  const ohlcSection = (
    <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <h3 className="font-display text-lg">OHLC Data</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Open</p>
          <p className="mt-1 text-textMain">{formatCurrency(ohlcData?.open ?? null, dashboard?.quote.currency)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">High</p>
          <p className="mt-1 text-textMain">{formatCurrency(ohlcData?.high ?? null, dashboard?.quote.currency)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Low</p>
          <p className="mt-1 text-textMain">{formatCurrency(ohlcData?.low ?? null, dashboard?.quote.currency)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Close</p>
          <p className="mt-1 text-textMain">{formatCurrency(ohlcData?.close ?? null, dashboard?.quote.currency)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
          <p className="text-textMuted">Adjusted Close</p>
          <p className="mt-1 text-textMain">{formatCurrency(ohlcData?.adjusted_close ?? null, dashboard?.quote.currency)}</p>
        </div>
      </div>
    </div>
  );
  const financialStatementsSection = <FinancialStatementsPanel data={dashboard?.financial_statements} />;
  const ratioDashboardSection = <RatioDashboardPanel data={dashboard?.ratio_dashboard} />;
  const valuationEngineSection = <ValuationEnginePanel data={dashboard?.valuation_engine} />;
  const technicalAnalysisSection = (
    <TechnicalAnalysisPanel symbol={dashboard?.quote.symbol || "AAPL"} currency={dashboard?.quote.currency} initialHistory={dashboard?.history || []} />
  );
  const visualizationToolsSection = (
    <VisualizationToolsPanel
      symbol={dashboard?.quote.symbol || "AAPL"}
      currency={dashboard?.quote.currency}
      financials={dashboard?.financial_statements}
    />
  );
  const smartInsightsSection = <SmartInsightsPanel symbol={dashboard?.quote.symbol || "AAPL"} currency={dashboard?.quote.currency} />;

  if (error) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-card p-6 text-sm text-danger">
        Unable to load dashboard: {error}
      </div>
    );
  }

  return (
    <section className="space-y-6 animate-rise">
      <div className="rounded-3xl border border-borderGlass bg-card p-6 shadow-glow md:p-8">
        <div className="grid gap-5 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <p className="mb-2 inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs text-accent">
              <Sparkles className="mr-1 h-3.5 w-3.5" /> {isBeginner ? "Beginner View" : "Pro View"}
            </p>
            <h1 className="font-display text-3xl leading-tight md:text-4xl">{copy.heading}</h1>
            <p className="mt-3 max-w-2xl text-sm text-textMuted md:text-base">{isBeginner ? copy.beginnerSub : copy.proSub}</p>
            <p className="mt-2 max-w-2xl text-xs text-textMuted">{copy.intro}</p>
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
                placeholder="Explore Stocks (e.g. SAP)"
              />
              <button className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-black transition hover:opacity-90">
                {searching ? "Finding..." : copy.explore}
              </button>
            </div>

            {searchInfo && <p className="mt-2 text-xs text-textMuted">{searchInfo}</p>}

            {!!searchSuggestions.length && (
              <div className="mt-2 flex flex-wrap gap-2">
                {searchSuggestions.map((item) => (
                  <button
                    type="button"
                    key={`suggestion-${item.symbol}`}
                    onClick={() => {
                      selectSymbol(item.symbol);
                    }}
                    className="rounded-md border border-borderGlass bg-card px-2.5 py-1 text-xs text-textMuted transition hover:border-accent hover:text-textMain"
                  >
                    {item.symbol} • {item.name}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 rounded-xl border border-borderGlass bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadUniverse(query.trim().toUpperCase(), 0, true)}
                  className="rounded-lg border border-borderGlass bg-bgSoft px-3 py-2 text-xs text-textMain hover:bg-cardHover"
                >
                  Search All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    loadUniverse("", 0, true);
                  }}
                  className="rounded-lg border border-borderGlass bg-bgSoft px-3 py-2 text-xs text-textMuted hover:text-textMain"
                >
                  Reset
                </button>
              </div>

              <p className="mt-2 text-xs text-textMuted">
                {query.trim() ? `Matches: ${universeTotal.toLocaleString()}` : `All listed symbols: ${universeTotal.toLocaleString()}`}
              </p>

              {universeError && <p className="mt-1 text-xs text-danger">{universeError}</p>}

              <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-borderGlass bg-bgSoft p-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {universeStocks.map((stock) => (
                    <button
                      type="button"
                      key={`${stock.exchange}-${stock.symbol}`}
                      onClick={() => {
                        selectSymbol(stock.symbol);
                      }}
                      className="rounded-md border border-borderGlass bg-card px-2 py-2 text-left text-xs transition hover:border-accent hover:bg-cardHover"
                    >
                      <p className="font-semibold text-textMain">{stock.symbol}</p>
                      <p className="truncate text-[11px] text-textMuted">{stock.exchange}</p>
                    </button>
                  ))}
                </div>

                {!universeLoading && !universeStocks.length && (
                  <p className="py-4 text-center text-xs text-textMuted">No symbols found for this search.</p>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-textMuted">
                  Showing {universeStocks.length.toLocaleString()} of {universeTotal.toLocaleString()}
                </p>
                {universeStocks.length < universeTotal && (
                  <button
                    type="button"
                    onClick={() => loadUniverse(query.trim().toUpperCase(), universeStocks.length, false)}
                    disabled={universeLoading}
                    className="rounded-lg border border-borderGlass bg-bgSoft px-3 py-1.5 text-xs text-textMain hover:bg-cardHover disabled:opacity-50"
                  >
                    {universeLoading ? "Loading..." : "Load more"}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      {loading && <div className="rounded-2xl border border-borderGlass bg-card p-6 text-sm text-textMuted">Loading insights...</div>}

      {!loading && dashboard && summary && isBeginner && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
              <p className="text-xs uppercase tracking-wide text-textMuted">Is it expensive?</p>
              <p className="mt-2 text-2xl font-semibold text-textMain">{pe === null ? "-" : pe.toFixed(2)} P/E</p>
              <p className={`mt-2 text-sm font-medium ${valuation.toneClass}`}>{valuation.label}</p>
              <p className="mt-1 text-xs text-textMuted">{valuation.description}</p>
            </article>

            <article className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
              <p className="text-xs uppercase tracking-wide text-textMuted">Business quality</p>
              <p className="mt-2 text-2xl font-semibold text-textMain">{ratioToPercent(roe)} ROE</p>
              <p className={`mt-2 text-sm font-medium ${quality.toneClass}`}>{quality.label}</p>
              <p className="mt-1 text-xs text-textMuted">{quality.description}</p>
            </article>

            <article className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
              <p className="text-xs uppercase tracking-wide text-textMuted">Financial safety</p>
              <p className="mt-2 text-2xl font-semibold text-textMain">{debtToEquity === null ? "-" : `${debtToEquity.toFixed(2)}x`}</p>
              <p className={`mt-2 text-sm font-medium ${leverage.toneClass}`}>{leverage.label}</p>
              <p className="mt-1 text-xs text-textMuted">{leverage.description}</p>
            </article>
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <PriceChart data={dashboard.history} symbol={dashboard.quote.symbol} />

            <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
              <h3 className="font-display text-lg">Beginner Coach</h3>
              <p className="mt-2 text-sm text-textMuted">{summary.eli15_summary}</p>

              <div className="mt-4 space-y-3 rounded-xl border border-borderGlass bg-bgSoft p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-textMuted">Current Price</span>
                  <span className="font-semibold text-textMain">{formatCurrency(dashboard.quote.price, dashboard.quote.currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-textMuted">Monthly Momentum</span>
                  <span className={oneMonthReturn !== null && oneMonthReturn >= 0 ? "text-success" : "text-danger"}>{formatSignedPercent(oneMonthReturn)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-textMuted">Risk Level</span>
                  <span className="text-textMain">{summary.risk_level}</span>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <MetricChip
                  label="P/E Ratio"
                  metricKey="pe"
                  symbol={dashboard.quote.symbol}
                  rawValue={dashboard.ratios.pe ?? null}
                  value={dashboard.ratios.pe ? Number(dashboard.ratios.pe).toFixed(2) : "-"}
                />
                <MetricChip
                  label="ROE"
                  metricKey="roe"
                  symbol={dashboard.quote.symbol}
                  rawValue={dashboard.ratios.roe ?? null}
                  value={ratioToPercent(dashboard.ratios.roe)}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg">Simple Investment Snapshot</h3>
                <button onClick={speakSummary} className="rounded-lg border border-borderGlass px-2 py-1 text-xs text-textMuted hover:text-textMain">
                  Voice explain
                </button>
              </div>

              <p className="text-sm text-textMuted">Who is this better for?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {summary.suitable_for.map((group) => (
                  <span key={group} className="rounded-full border border-borderGlass bg-bgSoft px-3 py-1 text-xs text-textMain">
                    {group}
                  </span>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-borderGlass bg-bgSoft p-3">
                <p className="text-xs uppercase tracking-wide text-textMuted">Quick advice</p>
                <p className="mt-1 text-sm text-textMuted">{summary.bull_case}</p>
                <p className="mt-2 text-sm text-textMuted">Watchout: {summary.bear_case}</p>
              </div>

              {voiceMode && <p className="mt-2 text-xs text-textMuted">Voice explainer started via browser speech API.</p>}
            </div>

            <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg">AI News Summary</h3>
                <Link href={newsPageHref} className="rounded-lg border border-borderGlass px-2 py-1 text-xs text-textMuted hover:text-textMain">
                  Open News Page
                </Link>
              </div>
              {!news ? (
                <p className="mt-2 text-sm text-textMuted">No news data yet.</p>
              ) : (
                <>
                  <div className="mt-3 flex items-center gap-2">
                    {news.sentiment === "Positive" && <ShieldCheck className="h-4 w-4 text-success" />}
                    {news.sentiment === "Neutral" && <TriangleAlert className="h-4 w-4 text-warning" />}
                    {news.sentiment === "Negative" && <ShieldAlert className="h-4 w-4 text-danger" />}
                    <p className="text-sm text-textMuted">
                      Sentiment: <span className="text-textMain">{news.sentiment}</span> ({news.source_count} sources)
                    </p>
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
          {basicMarketDataSection}
          {ohlcSection}
          {financialStatementsSection}
          {ratioDashboardSection}
          {valuationEngineSection}
          {technicalAnalysisSection}
          {visualizationToolsSection}
          {smartInsightsSection}
        </>
      )}

      {!loading && dashboard && summary && !isBeginner && (
        <>
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricChip
              label="P/E Ratio"
              metricKey="pe"
              symbol={dashboard.quote.symbol}
              rawValue={dashboard.ratios.pe ?? null}
              value={dashboard.ratios.pe ? Number(dashboard.ratios.pe).toFixed(2) : "-"}
            />
            <MetricChip
              label="ROE"
              metricKey="roe"
              symbol={dashboard.quote.symbol}
              rawValue={dashboard.ratios.roe ?? null}
              value={ratioToPercent(dashboard.ratios.roe)}
            />
            <MetricChip
              label="Debt/Equity"
              metricKey="debt_to_equity"
              symbol={dashboard.quote.symbol}
              rawValue={dashboard.ratios.debt_to_equity ?? null}
              value={dashboard.ratios.debt_to_equity ? `${Number(dashboard.ratios.debt_to_equity).toFixed(2)}x` : "-"}
            />
            <MetricChip
              label="Revenue Growth"
              metricKey="revenue_growth"
              symbol={dashboard.quote.symbol}
              rawValue={dashboard.ratios.revenue_growth ?? null}
              value={ratioToPercent(dashboard.ratios.revenue_growth)}
            />
            <MetricChip
              label="Profit Margin"
              metricKey="profit_margin"
              symbol={dashboard.quote.symbol}
              rawValue={dashboard.ratios.profit_margin ?? null}
              value={ratioToPercent(dashboard.ratios.profit_margin)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <PriceChart data={dashboard.history} symbol={dashboard.quote.symbol} />

            <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
              <h3 className="font-display text-lg">Quant Snapshot</h3>
              <p className="text-xs text-textMuted">{dashboard.profile.sector} • {dashboard.profile.industry}</p>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between text-textMuted"><span>Price</span><span className="text-textMain">{formatCurrency(dashboard.quote.price, dashboard.quote.currency)}</span></div>
                <div className="flex items-center justify-between text-textMuted"><span>Market Cap</span><span className="text-textMain">{formatLarge(dashboard.quote.market_cap as number)}</span></div>
                <div className="flex items-center justify-between text-textMuted"><span>1M Return</span><span className={oneMonthReturn !== null && oneMonthReturn >= 0 ? "text-success" : "text-danger"}>{formatSignedPercent(oneMonthReturn)}</span></div>
                <div className="flex items-center justify-between text-textMuted"><span>6M Return</span><span className={sixMonthReturn !== null && sixMonthReturn >= 0 ? "text-success" : "text-danger"}>{formatSignedPercent(sixMonthReturn)}</span></div>
                <div className="flex items-center justify-between text-textMuted"><span>Ann. Volatility</span><span className="text-textMain">{volatility === null ? "-" : `${volatility.toFixed(2)}%`}</span></div>
              </div>

              <div className="mt-4 rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs text-textMuted">
                {dashboard.profile.description ? dashboard.profile.description.slice(0, 220) : "Company profile not available from provider."}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg">AI Stock Summary (Pro Lens)</h3>
                <button onClick={speakSummary} className="rounded-lg border border-borderGlass px-2 py-1 text-xs text-textMuted hover:text-textMain">
                  Voice explain
                </button>
              </div>

              <p className="text-sm text-textMuted">{summary.eli15_summary}</p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
                  <p className="font-semibold text-textMain">Bull case</p>
                  <p className="mt-1 text-textMuted">{summary.bull_case}</p>
                </div>
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
                  <p className="font-semibold text-textMain">Bear case</p>
                  <p className="mt-1 text-textMuted">{summary.bear_case}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-borderGlass bg-bgSoft px-3 py-1 text-xs">Risk: {summary.risk_level}</span>
                {summary.suitable_for.map((group) => (
                  <span key={group} className="rounded-full border border-borderGlass bg-bgSoft px-3 py-1 text-xs text-textMuted">
                    {group}
                  </span>
                ))}
              </div>

              {voiceMode && <p className="mt-2 text-xs text-textMuted">Voice explainer started via browser speech API.</p>}
            </div>

            <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg">AI News Summary</h3>
                <Link href={newsPageHref} className="rounded-lg border border-borderGlass px-2 py-1 text-xs text-textMuted hover:text-textMain">
                  Open News Page
                </Link>
              </div>
              {!news ? (
                <p className="mt-2 text-sm text-textMuted">No news data yet.</p>
              ) : (
                <>
                  <div className="mt-3 flex items-center gap-2">
                    {news.sentiment === "Positive" && <ShieldCheck className="h-4 w-4 text-success" />}
                    {news.sentiment === "Neutral" && <TriangleAlert className="h-4 w-4 text-warning" />}
                    {news.sentiment === "Negative" && <ShieldAlert className="h-4 w-4 text-danger" />}
                    <p className="text-sm text-textMuted">
                      Sentiment: <span className="text-textMain">{news.sentiment}</span> ({news.source_count} sources)
                    </p>
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
          {basicMarketDataSection}
          {ohlcSection}
          {financialStatementsSection}
          {ratioDashboardSection}
          {valuationEngineSection}
          {technicalAnalysisSection}
          {visualizationToolsSection}
          {smartInsightsSection}
        </>
      )}
    </section>
  );
}
