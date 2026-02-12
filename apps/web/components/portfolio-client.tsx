"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/providers";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

export function PortfolioClient() {
  const { token, user } = useAuth();
  const [portfolios, setPortfolios] = useState<Array<{ id: string; name: string; positions: Array<Record<string, unknown>> }>>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [insights, setInsights] = useState<Record<string, unknown> | null>(null);
  const [name, setName] = useState("Core Portfolio");
  const [form, setForm] = useState({ symbol: "AAPL", quantity: 5, average_buy_price: 150, sector: "Technology" });

  const loadPortfolios = useCallback(async () => {
    if (!token) return;
    const response = await api.listPortfolios(token);
    setPortfolios(response.items);
    setActivePortfolioId((current) => current ?? response.items[0]?.id ?? null);
  }, [token]);

  useEffect(() => {
    loadPortfolios().catch(() => undefined);
  }, [loadPortfolios]);

  useEffect(() => {
    if (!token || !activePortfolioId) return;
    api
      .portfolioInsights(activePortfolioId, token)
      .then((response) => setInsights(response))
      .catch(() => setInsights(null));
  }, [token, activePortfolioId, portfolios.length]);

  async function createPortfolio() {
    if (!token) return;
    await api.createPortfolio(name, token);
    await loadPortfolios();
  }

  async function addPosition() {
    if (!token || !activePortfolioId) return;
    await api.upsertPosition(activePortfolioId, form, token);
    await loadPortfolios();
    const refreshed = await api.portfolioInsights(activePortfolioId, token);
    setInsights(refreshed);
  }

  const summary = useMemo(() => {
    if (!insights) return null;
    return {
      diversification: Number(insights.diversification_score || 0),
      risk: String(insights.risk_level || "-")
    };
  }, [insights]);

  if (!user) {
    return (
      <div className="rounded-2xl border border-borderGlass bg-card p-6 text-sm text-textMuted">
        Login required to manage portfolios.
      </div>
    );
  }

  return (
    <section className="space-y-5 animate-rise">
      <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <h1 className="font-display text-2xl">AI Portfolio Insights</h1>
        <p className="mt-2 text-sm text-textMuted">Understand concentration risk, diversification score, and rebalance suggestions instantly.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
            <label className="text-xs text-textMuted">Create portfolio</label>
            <div className="mt-2 flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm" />
              <button onClick={createPortfolio} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black">Create</button>
            </div>
          </div>

          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
            <label className="text-xs text-textMuted">Add / update position</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                value={form.symbol}
                onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                placeholder="Symbol"
                className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => setForm((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
                placeholder="Qty"
                className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={form.average_buy_price}
                onChange={(e) => setForm((prev) => ({ ...prev, average_buy_price: Number(e.target.value) }))}
                placeholder="Avg Buy"
                className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm"
              />
              <input
                value={form.sector}
                onChange={(e) => setForm((prev) => ({ ...prev, sector: e.target.value }))}
                placeholder="Sector"
                className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm"
              />
            </div>
            <button onClick={addPosition} className="mt-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black">Save Position</button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-2xl border border-borderGlass bg-card p-4">
          <h2 className="font-display text-lg">Portfolios</h2>
          <div className="mt-3 space-y-2">
            {portfolios.map((portfolio) => (
              <button
                key={portfolio.id}
                onClick={() => setActivePortfolioId(portfolio.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  activePortfolioId === portfolio.id ? "border-accent bg-accent/10 text-textMain" : "border-borderGlass bg-bgSoft text-textMuted"
                }`}
              >
                {portfolio.name} ({portfolio.positions.length})
              </button>
            ))}
            {!portfolios.length && <p className="text-sm text-textMuted">No portfolios yet.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-borderGlass bg-card p-4">
          <h2 className="font-display text-lg">Insights</h2>
          {summary ? (
            <>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
                  <p className="text-textMuted">Diversification</p>
                  <p className="mt-1 text-2xl font-semibold text-textMain">{summary.diversification}/100</p>
                </div>
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
                  <p className="text-textMuted">Risk</p>
                  <p className="mt-1 text-2xl font-semibold text-textMain">{summary.risk}</p>
                </div>
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
                  <p className="text-textMuted">Unrealized P/L</p>
                  <p className="mt-1 text-2xl font-semibold text-textMain">{formatCurrency(Number(insights?.unrealized_pnl || 0))}</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-borderGlass bg-bgSoft p-4">
                <h3 className="text-sm font-semibold text-textMain">AI Rebalance Suggestions</h3>
                <ul className="mt-2 space-y-1 text-sm text-textMuted">
                  {Array.isArray(insights?.suggestions) && insights?.suggestions.map((text) => <li key={String(text)}>• {String(text)}</li>)}
                </ul>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-textMuted">Add a portfolio and positions to generate insights.</p>
          )}
        </div>
      </div>
    </section>
  );
}
