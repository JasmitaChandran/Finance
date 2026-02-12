export type AppMode = "beginner" | "pro";

export interface OHLCVPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close?: number;
  volume: number;
}

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

export interface ValuationProjectionPoint {
  year_index: number;
  cash_flow?: number | null;
  present_value?: number | null;
}

export interface DCFResult {
  projection: ValuationProjectionPoint[];
  present_value_of_cash_flows?: number | null;
  terminal_value?: number | null;
  present_value_terminal?: number | null;
  enterprise_value?: number | null;
  equity_value?: number | null;
  intrinsic_value_per_share?: number | null;
  upside_percent?: number | null;
}

export interface ValuationSensitivityRow {
  growth: number;
  values: Array<{
    wacc: number;
    intrinsic_value_per_share?: number | null;
    upside_percent?: number | null;
  }>;
}

export interface ValuationSensitivityGrid {
  wacc_values: number[];
  growth_values: number[];
  rows: ValuationSensitivityRow[];
}

export interface RelativeValuationData {
  peers: Array<{
    symbol: string;
    name: string;
    sector?: string | null;
    industry?: string | null;
    price?: number | null;
    market_cap?: number | null;
    pe?: number | null;
    pb?: number | null;
    peg?: number | null;
  }>;
  peer_medians: {
    pe?: number | null;
    pb?: number | null;
    peg?: number | null;
  };
  company_multiples: {
    pe?: number | null;
    pb?: number | null;
    peg?: number | null;
  };
  implied_prices: {
    pe_based_price?: number | null;
    pb_based_price?: number | null;
    peg_based_price?: number | null;
    composite_fair_price?: number | null;
    composite_upside_percent?: number | null;
  };
  industry_multiple_comparison: {
    company: {
      pe?: number | null;
      pb?: number | null;
      peg?: number | null;
    };
    industry_median: {
      pe?: number | null;
      pb?: number | null;
      peg?: number | null;
    };
    premium_discount_percent: {
      pe?: number | null;
      pb?: number | null;
      peg?: number | null;
    };
  };
}

export interface ValuationEngineData {
  inputs: {
    symbol: string;
    base_year?: string | null;
    currency?: string | null;
    market_price?: number | null;
    market_cap?: number | null;
    shares_outstanding?: number | null;
    net_debt?: number | null;
    fcff_base?: number | null;
    fcfe_base?: number | null;
    growth_rate: number;
    terminal_growth_rate: number;
    wacc: number;
    cost_of_equity: number;
    cost_of_debt: number;
    tax_rate: number;
    projection_years: number;
  };
  dcf: {
    fcff: DCFResult;
    fcfe: DCFResult;
  };
  reverse_dcf: {
    fcff_required_growth_rate?: number | null;
    fcfe_required_growth_rate?: number | null;
  };
  sensitivity: {
    fcff: ValuationSensitivityGrid;
    fcfe: ValuationSensitivityGrid;
  };
  relative_valuation: RelativeValuationData;
}

export interface StockDashboard {
  quote: StockQuote;
  profile: StockProfile;
  ratios: Record<string, number | null>;
  financial_highlights: Record<string, string | number | null>;
  history: OHLCVPoint[];
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
  valuation_engine?: ValuationEngineData | null;
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
