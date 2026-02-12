"use client";

import { useState } from "react";

import { api } from "@/lib/api";
import { formatCurrency, formatLarge } from "@/lib/format";

export function CompareClient() {
  const [symbols, setSymbols] = useState("AAPL,MSFT,NVDA");
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.compare(
        symbols
          .split(",")
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean)
      );
      setItems(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compare failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-5 animate-rise">
      <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <h1 className="font-display text-2xl">Compare Companies</h1>
        <p className="mt-2 text-sm text-textMuted">Side-by-side scorecard for up to 4 stocks.</p>

        <div className="mt-4 flex flex-col gap-2 md:flex-row">
          <input
            value={symbols}
            onChange={(e) => setSymbols(e.target.value)}
            className="w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm"
            placeholder="AAPL,MSFT,NVDA"
          />
          <button onClick={run} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90">
            {loading ? "Comparing..." : "Compare"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <article key={String(item.symbol)} className="rounded-2xl border border-borderGlass bg-card p-4 shadow-glow">
            <h3 className="font-display text-lg">{String(item.symbol)}</h3>
            <p className="text-xs text-textMuted">{String(item.name || "-")}</p>
            <div className="mt-4 space-y-2 text-sm text-textMuted">
              <div className="flex justify-between"><span>Price</span><span className="text-textMain">{formatCurrency(item.price as number)}</span></div>
              <div className="flex justify-between"><span>Market Cap</span><span className="text-textMain">{formatLarge(item.market_cap as number)}</span></div>
              <div className="flex justify-between"><span>P/E</span><span className="text-textMain">{item.pe ? Number(item.pe).toFixed(2) : "-"}</span></div>
              <div className="flex justify-between"><span>ROE</span><span className="text-textMain">{item.roe ? `${(Number(item.roe) * 100).toFixed(2)}%` : "-"}</span></div>
              <div className="flex justify-between"><span>Growth</span><span className="text-textMain">{item.revenue_growth ? `${(Number(item.revenue_growth) * 100).toFixed(2)}%` : "-"}</span></div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
