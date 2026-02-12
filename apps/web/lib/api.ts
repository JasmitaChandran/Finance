import type { MarketHeatmapData, NewsArticle, NewsSummary, SmartInsightsData, StockDashboard, StockSummary, User } from "@/lib/types";

const FALLBACK_API_BASE = "/api/v1";
const RAW_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || FALLBACK_API_BASE;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function resolveApiBase(): string {
  let base = RAW_API_BASE;
  if (typeof window !== "undefined") {
    try {
      const parsed = new URL(base);
      const currentHost = window.location.hostname;
      const currentIsLoopback = LOOPBACK_HOSTS.has(currentHost);
      const baseIsLoopback = LOOPBACK_HOSTS.has(parsed.hostname);

      // If the app is opened via LAN hostname/IP, localhost points to the viewer's machine.
      // Rewrite loopback API hosts to the current browser host so frontend+backend stay aligned.
      if (baseIsLoopback && !currentIsLoopback) {
        parsed.hostname = currentHost;
        if (!parsed.port) parsed.port = "8000";
      }

      // Prefer IPv4 loopback to avoid local IPv6-only resolution edge cases.
      if (parsed.hostname === "localhost") parsed.hostname = "127.0.0.1";

      base = parsed.toString();
    } catch {
      // Keep custom base values as-is if they are not valid absolute URLs.
    }
  }
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

async function call<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const apiBase = resolveApiBase();
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {})
      },
      cache: "no-store"
    });
  } catch (error) {
    const origin = typeof window !== "undefined" ? window.location.origin : "unknown-origin";
    const reason = error instanceof Error && error.message ? ` (${error.message})` : "";
    throw new Error(`Cannot reach API at ${apiBase} from ${origin}. Ensure backend is running and CORS is configured for your frontend origin.${reason}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  searchStocks: (q: string) => call<{ items: Array<{ symbol: string; name: string }> }>(`/stocks/search?q=${encodeURIComponent(q)}`),
  getUniverse: (params?: { q?: string; offset?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set("q", params.q);
    if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));
    if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return call<{ total: number; items: Array<{ symbol: string; name: string; exchange: string }> }>(`/stocks/universe${qs ? `?${qs}` : ""}`);
  },
  getHistory: (symbol: string, period = "6mo") =>
    call<{ symbol: string; items: Array<{ date: string; open?: number; high?: number; low?: number; close: number; adj_close?: number; volume: number }> }>(
      `/stocks/${symbol}/history?period=${encodeURIComponent(period)}`
    ),
  getDashboard: (symbol: string) => call<StockDashboard>(`/stocks/${symbol}/dashboard`),
  getSmartInsights: (symbol: string) => call<SmartInsightsData>(`/stocks/${symbol}/smart-insights`),
  getMarketHeatmap: (limit = 60) => call<MarketHeatmapData>(`/stocks/market-heatmap?limit=${Math.max(20, Math.min(200, limit))}`),
  explainMetric: (metric: string, value?: number, symbol?: string) =>
    call<{ title: string; simple_explanation: string; analogy: string; what_good_looks_like: string; caution: string }>(
      "/stocks/explain-metric",
      {
        method: "POST",
        body: JSON.stringify({ metric, value, symbol })
      }
    ),
  getSummary: (symbol: string, mode: "beginner" | "pro") =>
    call<StockSummary>("/stocks/summary", {
      method: "POST",
      body: JSON.stringify({ symbol, mode })
    }),
  getNewsSummary: (symbol: string) => call<NewsSummary>(`/news/${symbol}/summary`),
  getNewsItems: (symbol: string) => call<{ symbol: string; items: NewsArticle[] }>(`/news/${symbol}/items`),
  runScreener: (payload: {
    symbols: string[];
    min_market_cap?: number;
    max_pe?: number;
    min_roe?: number;
    min_revenue_growth?: number;
  }) => call<{ items: Array<Record<string, unknown>> }>("/screener/run", { method: "POST", body: JSON.stringify(payload) }),
  compare: (symbols: string[]) => call<{ items: Array<Record<string, unknown>> }>(`/compare?symbols=${symbols.join(",")}`),
  lessons: () => call<{ items: Array<{ id: string; title: string; level: string; duration_minutes: number; summary: string }> }>("/learning/lessons"),
  tutor: (question: string) => call<{ answer: string }>("/learning/tutor", { method: "POST", body: JSON.stringify({ question }) }),

  register: (fullName: string, email: string, password: string) =>
    call<{ access_token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ full_name: fullName, email, password })
    }),
  login: (email: string, password: string) =>
    call<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  me: (token: string) => call<User>("/auth/me", undefined, token),
  googleLogin: (idToken: string) =>
    call<{ access_token: string }>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ id_token: idToken })
    }),

  listWatchlists: (token: string) => call<{ items: Array<{ id: string; name: string; items: Array<{ id: string; symbol: string }> }> }>("/watchlists", undefined, token),
  createWatchlist: (name: string, token: string) =>
    call<{ id: string; name: string }>("/watchlists", { method: "POST", body: JSON.stringify({ name }) }, token),
  addWatchlistItem: (watchlistId: string, symbol: string, token: string) =>
    call<{ id: string; symbol: string }>(`/watchlists/${watchlistId}/items`, { method: "POST", body: JSON.stringify({ symbol }) }, token),
  removeWatchlistItem: (watchlistId: string, itemId: string, token: string) =>
    call<{ ok: boolean }>(`/watchlists/${watchlistId}/items/${itemId}`, { method: "DELETE" }, token),
  watchlistQuotes: (watchlistId: string, token: string) =>
    call<{ watchlist: string; items: Array<Record<string, unknown>> }>(`/watchlists/${watchlistId}/quotes`, undefined, token),

  listPortfolios: (token: string) =>
    call<{ items: Array<{ id: string; name: string; positions: Array<Record<string, unknown>> }> }>("/portfolios", undefined, token),
  createPortfolio: (name: string, token: string) =>
    call<{ id: string; name: string }>("/portfolios", { method: "POST", body: JSON.stringify({ name }) }, token),
  upsertPosition: (
    portfolioId: string,
    payload: { symbol: string; quantity: number; average_buy_price: number; sector?: string },
    token: string
  ) => call(`/portfolios/${portfolioId}/positions`, { method: "POST", body: JSON.stringify(payload) }, token),
  portfolioInsights: (portfolioId: string, token: string) => call<Record<string, unknown>>(`/portfolios/${portfolioId}/insights`, undefined, token),

  listAlerts: (token: string) =>
    call<{ items: Array<{ id: string; symbol: string; target_price: number; above: boolean; is_active: boolean }> }>("/alerts", undefined, token),
  createAlert: (payload: { symbol: string; target_price: number; above: boolean }, token: string) =>
    call<{ id: string; symbol: string; target_price: number; above: boolean; is_active: boolean }>(
      "/alerts",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),
  deleteAlert: (alertId: string, token: string) => call<{ ok: boolean }>(`/alerts/${alertId}`, { method: "DELETE" }, token),
  checkAlerts: (token: string) => call<{ triggered: Array<Record<string, unknown>>; count: number }>("/alerts/check", { method: "POST" }, token)
};
