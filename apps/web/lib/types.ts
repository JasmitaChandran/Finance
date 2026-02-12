export type AppMode = "beginner" | "pro";

export interface StockQuote {
  symbol: string;
  name: string;
  currency?: string;
  price?: number;
  change_percent?: number;
  market_cap?: number;
  volume?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

export interface StockProfile {
  symbol: string;
  name: string;
  sector?: string;
  industry?: string;
  website?: string;
  description?: string;
  country?: string;
}

export interface FinancialStatementRow {
  metric: string;
  values: Record<string, number | null>;
  yoy_growth: Record<string, number | null>;
  cagr: number | null;
}

export interface FinancialStatementBlock {
  raw: FinancialStatementRow[];
  common_size: FinancialStatementRow[];
  base_metric?: string | null;
}

export interface FinancialStatementsData {
  years: string[];
  income_statement: FinancialStatementBlock;
  balance_sheet: FinancialStatementBlock;
  cash_flow: FinancialStatementBlock;
  meta?: {
    requested_years?: number;
    available_years?: number;
  };
}

export interface RatioDashboardGroup {
  [key: string]: number | null;
}

export interface RatioDashboardData {
  year?: string | null;
  prior_year?: string | null;
  liquidity: RatioDashboardGroup;
  solvency: RatioDashboardGroup;
  profitability: RatioDashboardGroup;
  efficiency: RatioDashboardGroup;
  dupont_analysis: RatioDashboardGroup;
  altman_z_score: {
    score?: number | null;
    zone?: string;
    components?: RatioDashboardGroup;
  };
  piotroski_f_score: {
    score?: number | null;
    max_score?: number;
    available_checks?: number;
    label?: string;
    signals?: Record<string, boolean | null>;
  };
}

export interface StockDashboard {
  quote: StockQuote;
  profile: StockProfile;
  ratios: Record<string, number | null>;
  financial_highlights: Record<string, string | number | null>;
  history: Array<{ date: string; open?: number; high?: number; low?: number; close: number; adj_close?: number; volume: number }>;
  market_data?: {
    live_price?: number | null;
    changes_percent?: { "1d"?: number | null; "1w"?: number | null; "1m"?: number | null; "1y"?: number | null; "5y"?: number | null };
    volume?: number | null;
    market_cap?: number | null;
    week_52_high?: number | null;
    week_52_low?: number | null;
    beta?: number | null;
    pe?: number | null;
    pb?: number | null;
    peg?: number | null;
    dividend_yield?: number | null;
    eps?: number | null;
    book_value?: number | null;
    roe?: number | null;
    roce?: number | null;
  };
  ohlc?: {
    open?: number | null;
    high?: number | null;
    low?: number | null;
    close?: number | null;
    adjusted_close?: number | null;
  };
  financial_statements?: FinancialStatementsData | null;
  ratio_dashboard?: RatioDashboardData | null;
}

export interface StockSummary {
  eli15_summary: string;
  bull_case: string;
  bear_case: string;
  risk_level: "Low" | "Medium" | "High" | string;
  suitable_for: string[];
}

export interface NewsSummary {
  symbol: string;
  bullets: string[];
  sentiment: "Positive" | "Neutral" | "Negative" | string;
  source_count: number;
}

export interface NewsArticle {
  title: string;
  publisher?: string;
  link?: string;
  published?: string;
  summary?: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
}
