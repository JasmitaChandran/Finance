import type {
  MarketHeatmapData,
  NewsArticle,
  NewsSummary,
  PortfolioInsights,
  PortfolioListItem,
  PortfolioPosition,
  PortfolioTransaction,
  ScreenerPreset,
  ScreenerRunResponse,
  SmartInsightsData,
  StockDashboard,
  StockSummary,
  User,
} from "@/lib/types";

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
  searchStocks: (q: string) =>
    call<{ items: Array<{ symbol: string; name: string; exchange?: string; country?: string; currency?: string }> }>(
      `/stocks/search?q=${encodeURIComponent(q)}`
    ),
  getUniverse: (params?: { q?: string; market?: string; offset?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set("q", params.q);
    if (params?.market) searchParams.set("market", params.market);
    if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));
    if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return call<{ total: number; items: Array<{ symbol: string; name: string; exchange: string; country?: string; currency?: string; base_symbol?: string }> }>(
      `/stocks/universe${qs ? `?${qs}` : ""}`
    );
  },
  getHistory: (symbol: string, period = "6mo") =>
    call<{ symbol: string; items: Array<{ date: string; open?: number; high?: number; low?: number; close: number; adj_close?: number; volume: number }> }>(
      `/stocks/${symbol}/history?period=${encodeURIComponent(period)}`
    ),
  getDashboard: (symbol: string, mode?: "beginner" | "pro") =>
    call<StockDashboard>(`/stocks/${symbol}/dashboard${mode ? `?mode=${encodeURIComponent(mode)}` : ""}`),
  getDashboardPanel: (symbol: string, panel: "price" | "summary" | "news" | "financials" | "ratios" | "peers" | "events", params?: { mode?: "beginner" | "pro"; period?: string; years?: number }) => {
    const qs = new URLSearchParams();
    if (params?.mode) qs.set("mode", params.mode);
    if (params?.period) qs.set("period", params.period);
    if (params?.years !== undefined) qs.set("years", String(params.years));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return call<{ symbol: string; panel: string; data: Record<string, unknown>; meta: Record<string, unknown> }>(`/stocks/${symbol}/panels/${panel}${suffix}`);
  },
  getBenchmarkContext: (symbol: string) =>
    call<{ symbol: string; panel: string; data: Record<string, unknown>; meta: Record<string, unknown> }>(`/stocks/${symbol}/benchmark-context`),
  getRelevanceContext: (symbol: string, params?: { mode?: "beginner" | "pro"; view?: "long_term" | "swing" | "dividend" }) => {
    const qs = new URLSearchParams();
    if (params?.mode) qs.set("mode", params.mode);
    if (params?.view) qs.set("view", params.view);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return call<{ symbol: string; panel: string; data: Record<string, unknown>; meta: Record<string, unknown> }>(`/stocks/${symbol}/relevance${suffix}`);
  },
  getSmartInsights: (symbol: string) => call<SmartInsightsData>(`/stocks/${symbol}/smart-insights`),
  getMarketHeatmap: (limit = 60) => call<MarketHeatmapData>(`/stocks/market-heatmap?limit=${Math.max(20, Math.min(200, limit))}`),
  explainMetric: (metric: string, value?: number, symbol?: string) =>
    call<{ title: string; simple_explanation: string; analogy: string; what_good_looks_like: string; caution: string; formula?: string; unit?: string }>(
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
    symbols?: string[];
    market_scope?: string;
    min_market_cap?: number;
    max_market_cap?: number;
    min_pe?: number;
    max_pe?: number;
    min_roe?: number;
    min_revenue_growth?: number;
    max_debt_to_equity?: number;
    min_rsi?: number;
    max_rsi?: number;
    min_beta?: number;
    max_beta?: number;
    min_sharpe_ratio?: number;
    max_drawdown_5y_max?: number;
    max_volatility_percentile?: number;
    min_rolling_beta?: number;
    max_rolling_beta?: number;
    fcf_positive_5y?: boolean;
    debt_decreasing_trend?: boolean;
    roic_gt_wacc?: boolean;
    min_earnings_consistency?: number;
    min_revenue_cagr_3y?: number;
    min_eps_cagr_5y?: number;
    operating_leverage_improving?: boolean;
    breakout_only?: boolean;
    volume_spike_only?: boolean;
    magic_formula_only?: boolean;
    low_volatility_only?: boolean;
    high_momentum_only?: boolean;
    dividend_aristocrats_only?: boolean;
    insider_buying_only?: boolean;
    sort_by?: string;
    sort_order?: "asc" | "desc";
    universe_limit?: number;
    limit?: number;
  }) => call<ScreenerRunResponse>("/screener/run", { method: "POST", body: JSON.stringify(payload) }),
  screenerPresets: () => call<{ items: ScreenerPreset[] }>("/screener/presets"),
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
    call<{ items: PortfolioListItem[] }>("/portfolios", undefined, token),
  createPortfolio: (name: string, token: string) =>
    call<{ id: string; name: string }>("/portfolios", { method: "POST", body: JSON.stringify({ name }) }, token),
  upsertPosition: (
    portfolioId: string,
    payload: { symbol: string; quantity: number; average_buy_price: number; sector?: string },
    token: string
  ) => call<PortfolioPosition>(`/portfolios/${portfolioId}/positions`, { method: "POST", body: JSON.stringify(payload) }, token),
  addPortfolioTransaction: (
    portfolioId: string,
    payload: { symbol: string; side: "buy" | "sell"; quantity: number; price: number; fee?: number; trade_date?: string; sector?: string; note?: string },
    token: string
  ) => call<PortfolioTransaction>(`/portfolios/${portfolioId}/transactions`, { method: "POST", body: JSON.stringify(payload) }, token),
  listPortfolioTransactions: (portfolioId: string, token: string, limit = 200) =>
    call<{ items: PortfolioTransaction[] }>(`/portfolios/${portfolioId}/transactions?limit=${Math.max(1, Math.min(1000, limit))}`, undefined, token),
  portfolioInsights: (portfolioId: string, token: string) => call<PortfolioInsights>(`/portfolios/${portfolioId}/insights`, undefined, token),

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
