"use client";

import { ArrowUpRight, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MetricChip } from "@/components/metric-chip";
import { PriceChart } from "@/components/price-chart";
import { useUI } from "@/components/providers";
import { api } from "@/lib/api";
import { formatCurrency, formatLarge, ratioToPercent } from "@/lib/format";
import type { NewsSummary, StockDashboard as StockDashboardType, StockSummary } from "@/lib/types";

const popularSymbols = ["AAPL", "MSFT", "NVDA", "GOOGL", "TSLA", "AMZN", "META", "JPM"];

export function StockDashboard() {
  const { mode, language } = useUI();
  const [query, setQuery] = useState("AAPL");
  const [dashboard, setDashboard] = useState<StockDashboardType | null>(null);
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [news, setNews] = useState<NewsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const newsBullets = (news?.bullets ?? []).map((bullet) => bullet.trim()).filter(Boolean);

  const copy = useMemo(
    () =>
      language === "es"
        ? {
            heading: "Centro de Analisis AI",
            sub: "Explicaciones simples, analisis claro y accion inteligente.",
            intro: "Piensa en esto como Google Maps para invertir: menos ruido, mejores decisiones.",
            explore: "Explorar"
          }
        : {
            heading: "AI Stock Insight Hub",
            sub: "Simple explanations, clear risk lens, and actionable context.",
            intro: "Think of this as Google Maps for investing: less noise, smarter direction.",
            explore: "Explore"
          },
    [language]
  );

  const load = useCallback(async (symbol: string) => {
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
  }, [mode]);

  useEffect(() => {
    load("AAPL");
  }, [load]);

  function speakSummary() {
    if (!summary || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(summary.eli15_summary);
    utterance.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setVoiceMode(true);
  }

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
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Beginner-Friendly + Pro-Ready
            </p>
            <h1 className="font-display text-3xl leading-tight md:text-4xl">{copy.heading}</h1>
            <p className="mt-3 max-w-2xl text-sm text-textMuted md:text-base">{copy.sub}</p>
            <p className="mt-2 max-w-2xl text-xs text-textMuted">{copy.intro}</p>
          </div>
          <form
            className="rounded-2xl border border-borderGlass bg-bgSoft p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!query.trim()) return;
              load(query.trim().toUpperCase());
            }}
          >
            <label className="text-xs uppercase tracking-wide text-textMuted">Stock symbol or company</label>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value.toUpperCase())}
                className="flex-1 rounded-xl border border-borderGlass bg-card px-4 py-2 text-sm outline-none transition focus:border-accent"
                placeholder="AAPL"
              />
              <button className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-black transition hover:opacity-90">{copy.explore}</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {popularSymbols.map((symbol) => (
                <button
                  type="button"
                  key={symbol}
                  onClick={() => {
                    setQuery(symbol);
                    load(symbol);
                  }}
                  className="rounded-lg border border-borderGlass bg-card px-2.5 py-1 text-xs text-textMuted transition hover:text-textMain"
                >
                  {symbol}
                </button>
              ))}
            </div>
          </form>
        </div>
      </div>

      {loading && <div className="rounded-2xl border border-borderGlass bg-card p-6 text-sm text-textMuted">Loading insights...</div>}

      {!loading && dashboard && summary && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              value={dashboard.ratios.debt_to_equity ? Number(dashboard.ratios.debt_to_equity).toFixed(2) : "-"}
            />
            <MetricChip
              label="Revenue Growth"
              metricKey="revenue_growth"
              symbol={dashboard.quote.symbol}
              rawValue={dashboard.ratios.revenue_growth ?? null}
              value={ratioToPercent(dashboard.ratios.revenue_growth)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <PriceChart data={dashboard.history} symbol={dashboard.quote.symbol} />

            <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
              <h3 className="font-display text-lg">{dashboard.quote.name}</h3>
              <p className="text-xs text-textMuted">{dashboard.profile.sector} • {dashboard.profile.industry}</p>
              <p className="mt-3 text-3xl font-semibold">{formatCurrency(dashboard.quote.price, dashboard.quote.currency)}</p>
              <p className={`mt-1 text-sm ${Number(dashboard.quote.change_percent || 0) >= 0 ? "text-success" : "text-danger"}`}>
                {Number(dashboard.quote.change_percent || 0).toFixed(2)}%
              </p>

              <div className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between text-textMuted"><span>Market Cap</span><span className="text-textMain">{formatLarge(dashboard.quote.market_cap as number)}</span></div>
                <div className="flex items-center justify-between text-textMuted"><span>Country</span><span className="text-textMain">{dashboard.profile.country || "-"}</span></div>
                <div className="flex items-center justify-between text-textMuted"><span>Mode</span><span className="text-textMain">{mode === "beginner" ? "Simplified" : "Detailed"}</span></div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg">AI Stock Summary</h3>
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
                <span className="rounded-full border border-borderGlass bg-bgSoft px-3 py-1 text-xs">
                  Risk: {summary.risk_level}
                </span>
                {summary.suitable_for.map((group) => (
                  <span key={group} className="rounded-full border border-borderGlass bg-bgSoft px-3 py-1 text-xs text-textMuted">
                    {group}
                  </span>
                ))}
              </div>

              {voiceMode && <p className="mt-2 text-xs text-textMuted">Voice explainer started via browser speech API.</p>}
            </div>

            <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
              <h3 className="font-display text-lg">AI News Summary</h3>
              {!news ? (
                <p className="mt-2 text-sm text-textMuted">No news data yet.</p>
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
                      <li key={bullet} className="rounded-lg border border-borderGlass bg-bgSoft p-3">
                        <ArrowUpRight className="mr-2 inline h-3.5 w-3.5 text-accent" />
                        {bullet}
                      </li>
                    ))}
                    {!newsBullets.length && (
                      <li className="rounded-lg border border-borderGlass bg-bgSoft p-3">No readable headlines found. Try refreshing.</li>
                    )}
                  </ul>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
