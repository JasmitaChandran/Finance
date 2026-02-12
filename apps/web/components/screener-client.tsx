"use client";

import { Filter } from "lucide-react";
import { useState } from "react";

import { api } from "@/lib/api";
import { formatLarge } from "@/lib/format";

const defaultUniverse = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "JPM", "V", "WMT"];

export function ScreenerClient() {
  const [symbols, setSymbols] = useState(defaultUniverse.join(","));
  const [minMarketCap, setMinMarketCap] = useState(10000000000);
  const [maxPe, setMaxPe] = useState(40);
  const [minRoe, setMinRoe] = useState(0.1);
  const [minGrowth, setMinGrowth] = useState(0.05);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.runScreener({
        symbols: symbols
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
        min_market_cap: minMarketCap,
        max_pe: maxPe,
        min_roe: minRoe,
        min_revenue_growth: minGrowth
      });
      setItems(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screener failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-5 animate-rise">
      <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <h1 className="font-display text-2xl">Smart Screener</h1>
        <p className="mt-2 text-sm text-textMuted">Filter on valuation, profitability, growth, and market cap with beginner-safe defaults.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-textMuted">
            Universe symbols (comma separated)
            <input value={symbols} onChange={(e) => setSymbols(e.target.value)} className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-textMuted">
            Min market cap
            <input
              type="number"
              value={minMarketCap}
              onChange={(e) => setMinMarketCap(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-textMuted">
            Max P/E
            <input type="number" value={maxPe} onChange={(e) => setMaxPe(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-textMuted">
            Min ROE (decimal)
            <input type="number" value={minRoe} onChange={(e) => setMinRoe(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" step="0.01" />
          </label>
          <label className="text-xs text-textMuted">
            Min revenue growth (decimal)
            <input type="number" value={minGrowth} onChange={(e) => setMinGrowth(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" step="0.01" />
          </label>
        </div>

        <button onClick={run} className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90">
          <Filter className="mr-1 inline h-4 w-4" />
          {loading ? "Running..." : "Run Screener"}
        </button>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-card p-4 text-sm text-danger">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-borderGlass bg-card shadow-glow">
        <table className="min-w-full text-sm">
          <thead className="bg-bgSoft text-left text-xs uppercase text-textMuted">
            <tr>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Market Cap</th>
              <th className="px-4 py-3">P/E</th>
              <th className="px-4 py-3">ROE</th>
              <th className="px-4 py-3">Growth</th>
              <th className="px-4 py-3">AI Score</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={String(row.symbol)} className="border-t border-borderGlass text-textMuted">
                <td className="px-4 py-3 font-medium text-textMain">{String(row.symbol)}</td>
                <td className="px-4 py-3">{typeof row.price === "number" ? `$${row.price.toFixed(2)}` : "-"}</td>
                <td className="px-4 py-3">{typeof row.market_cap === "number" ? formatLarge(row.market_cap) : "-"}</td>
                <td className="px-4 py-3">{typeof row.pe === "number" ? row.pe.toFixed(2) : "-"}</td>
                <td className="px-4 py-3">{typeof row.roe === "number" ? `${(row.roe * 100).toFixed(1)}%` : "-"}</td>
                <td className="px-4 py-3">{typeof row.revenue_growth === "number" ? `${(row.revenue_growth * 100).toFixed(1)}%` : "-"}</td>
                <td className="px-4 py-3"><span className="rounded-md bg-accent/15 px-2 py-1 text-accent">{String(row.score)}</span></td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td className="px-4 py-8 text-center text-textMuted" colSpan={7}>
                  Run screener to see results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
