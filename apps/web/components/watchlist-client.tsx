"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/providers";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

export function WatchlistClient() {
  const { token, user } = useAuth();
  const [watchlists, setWatchlists] = useState<Array<{ id: string; name: string; items: Array<{ id: string; symbol: string }> }>>([]);
  const [name, setName] = useState("My Watchlist");
  const [symbol, setSymbol] = useState("AAPL");
  const [quotes, setQuotes] = useState<Array<Record<string, unknown>>>([]);
  const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWatchlists = useCallback(async () => {
    if (!token) return;
    try {
      const response = await api.listWatchlists(token);
      setWatchlists(response.items);
      setActiveWatchlistId((current) => current ?? response.items[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch watchlists");
    }
  }, [token]);

  useEffect(() => {
    loadWatchlists();
  }, [loadWatchlists]);

  useEffect(() => {
    if (!token || !activeWatchlistId) return;
    api
      .watchlistQuotes(activeWatchlistId, token)
      .then((response) => setQuotes(response.items))
      .catch(() => setQuotes([]));
  }, [token, activeWatchlistId, watchlists]);

  async function createWatchlist() {
    if (!token) return;
    await api.createWatchlist(name, token);
    await loadWatchlists();
  }

  async function addStock() {
    if (!token || !activeWatchlistId) return;
    await api.addWatchlistItem(activeWatchlistId, symbol, token);
    await loadWatchlists();
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-borderGlass bg-card p-6 text-sm text-textMuted">
        Login required to save watchlists.
      </div>
    );
  }

  return (
    <section className="space-y-5 animate-rise">
      <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <h1 className="font-display text-2xl">Watchlist</h1>
        <p className="mt-1 text-sm text-textMuted">Track stocks, monitor price changes, and manage alerts-ready symbols.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
            <label className="text-xs text-textMuted">Create watchlist</label>
            <div className="mt-2 flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm" />
              <button onClick={createWatchlist} className="rounded-lg bg-accent px-3 py-2 text-black">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
            <label className="text-xs text-textMuted">Add stock symbol</label>
            <div className="mt-2 flex gap-2">
              <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="w-full rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm" />
              <button onClick={addStock} className="rounded-lg bg-accent px-3 py-2 text-black">Add</button>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-card p-4 text-sm text-danger">{error}</div>}

      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <div className="rounded-2xl border border-borderGlass bg-card p-4">
          <h2 className="font-display text-lg">My Lists</h2>
          <div className="mt-3 space-y-2">
            {watchlists.map((watchlist) => (
              <button
                key={watchlist.id}
                onClick={() => setActiveWatchlistId(watchlist.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                  activeWatchlistId === watchlist.id ? "border-accent bg-accent/10 text-textMain" : "border-borderGlass bg-bgSoft text-textMuted"
                }`}
              >
                {watchlist.name} ({watchlist.items.length})
              </button>
            ))}
            {!watchlists.length && <p className="text-sm text-textMuted">No watchlists yet.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-borderGlass bg-card p-4">
          <h2 className="font-display text-lg">Live Tracking</h2>
          <div className="mt-3 space-y-2">
            {quotes.map((quote) => (
              <div key={String(quote.symbol)} className="rounded-lg border border-borderGlass bg-bgSoft p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-textMain">{String(quote.symbol)}</p>
                    <p className="text-xs text-textMuted">{String(quote.name)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-textMain">{formatCurrency(quote.price as number)}</p>
                    <p className={`${Number(quote.change_percent || 0) >= 0 ? "text-success" : "text-danger"}`}>{Number(quote.change_percent || 0).toFixed(2)}%</p>
                  </div>
                </div>
              </div>
            ))}
            {!quotes.length && <p className="text-sm text-textMuted">Select a watchlist with stocks to view quotes.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
