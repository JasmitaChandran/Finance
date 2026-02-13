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

export interface SmartInsightsData {
  symbol: string;
  generated_at: string;
  ai_stock_summary: {
    eli15_summary: string;
    bull_case: string;
    bear_case: string;
    risk_level: string;
    suitable_for: string[];
  };
  eli15_summary?: string | null;
  earnings_call_transcript_summary: {
    available: boolean;
    source: string;
    quarter?: string | null;
    summary: string;
    highlights: string[];
    risk_flags: string[];
  };
  risk_analysis_plain_english: {
    risk_score: number;
    risk_level: "Low" | "Medium" | "High" | string;
    explanation: string;
    factors: Array<{
      factor: string;
      value?: string | number | null;
      level: "Low" | "Medium" | "High" | string;
      detail: string;
    }>;
  };
  fraud_detection_signals: {
    risk_score: number;
    risk_level: "Low" | "Medium" | "High" | string;
    summary: string;
    signals: Array<{
      name: string;
      value?: number | null;
      threshold: string;
      triggered: boolean;
      severity: "high" | "medium" | "low" | string;
      detail: string;
    }>;
  };
  earnings_surprise_probability: {
    beat_probability: number;
    miss_probability: number;
    confidence: number;
    sample_quarters: number;
    average_surprise_percent?: number | null;
    explanation: string;
  };
  forecast_revenue_ml: {
    model: string;
    history: Array<{ year: number; revenue: number }>;
    forecast: Array<{ year: number; revenue: number }>;
    r2_score?: number | null;
    estimated_cagr_percent?: number | null;
    explanation: string;
  };
  sentiment_analysis_from_news: {
    label: "Positive" | "Neutral" | "Negative" | string;
    score: number;
    positive_hits: number;
    negative_hits: number;
    highlights: string[];
    source_count: number;
    summary_sentiment?: string;
  };
  buy_sell_probability_score: {
    buy_probability: number;
    sell_probability: number;
    hold_probability: number;
    recommendation: string;
    confidence: number;
    rationale: string[];
  };
}

export interface MarketHeatmapData {
  as_of: string;
  items: Array<{
    symbol: string;
    name?: string;
    price?: number | null;
    change_percent?: number | null;
    market_cap?: number | null;
    volume?: number | null;
  }>;
  stats: {
    advancers: number;
    decliners: number;
    unchanged: number;
  };
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

export interface PortfolioPosition {
  id: string;
  symbol: string;
  quantity: number;
  average_buy_price: number;
  sector?: string | null;
}

export interface PortfolioTransaction {
  id: string;
  symbol: string;
  side: "buy" | "sell" | string;
  quantity: number;
  price: number;
  fee: number;
  trade_date: string;
  note?: string | null;
  created_at: string;
}

export interface PortfolioListItem {
  id: string;
  name: string;
  positions: PortfolioPosition[];
  transaction_count?: number;
}

export interface PortfolioInsights {
  portfolio_name: string;
  market_value: number;
  cost_basis: number;
  unrealized_pnl: number;
  holdings: Array<{
    symbol: string;
    sector?: string | null;
    quantity: number;
    average_buy_price: number;
    current_price: number;
    market_value: number;
    cost_basis: number;
    pnl: number;
    beta?: number | null;
  }>;
  transactions: PortfolioTransaction[];
  diversification_score: number;
  risk_level: string;
  suggestions: string[];
  auto_pnl_calculation: {
    market_value: number;
    cost_basis: number;
    unrealized_pnl: number;
    realized_pnl: number;
    total_pnl: number;
  };
  xirr_percent?: number | null;
  asset_allocation: Array<{ symbol: string; value: number; weight_percent: number }>;
  sector_allocation: Array<{ sector: string; value: number; weight_percent: number }>;
  beta_of_portfolio?: number | null;
  sharpe_ratio?: number | null;
  sortino_ratio?: number | null;
  calmar_ratio?: number | null;
  information_ratio?: number | null;
  max_drawdown?: number | null;
  upside_capture?: number | null;
  downside_capture?: number | null;
  risk_vs_benchmark_comparison: {
    benchmark_symbol: string;
    portfolio_annual_return_percent?: number | null;
    benchmark_annual_return_percent?: number | null;
    portfolio_annual_volatility_percent?: number | null;
    benchmark_annual_volatility_percent?: number | null;
    tracking_error_percent?: number | null;
    alpha_percent?: number | null;
  };
  tax_gain_calculation: {
    realized_short_term: number;
    realized_long_term: number;
    unrealized_short_term: number;
    unrealized_long_term: number;
    estimated_tax_payable: number;
  };
}

export interface ScreenerRow {
  symbol: string;
  name?: string;
  sector?: string | null;
  price?: number | null;
  market_cap?: number | null;
  pe?: number | null;
  roe?: number | null;
  revenue_growth?: number | null;
  debt_to_equity?: number | null;
  rsi_14?: number | null;
  breakout?: boolean;
  volume_spike?: boolean;
  annualized_volatility_percent?: number | null;
  volatility_percentile?: number | null;
  momentum_1m_percent?: number | null;
  momentum_6m_percent?: number | null;
  momentum_1y_percent?: number | null;
  beta?: number | null;
  rolling_beta_1y?: number | null;
  sharpe_ratio?: number | null;
  max_drawdown_5y_percent?: number | null;
  dividend_yield?: number | null;
  fcf_yield?: number | null;
  roic?: number | null;
  revenue_cagr_3y?: number | null;
  eps_cagr_5y?: number | null;
  net_debt?: number | null;
  ev_ebitda?: number | null;
  piotroski_score?: number | null;
  earnings_consistency_score?: number | null;
  insider_net_shares_6m?: number | null;
  quality_flags?: {
    fcf_positive_5y?: boolean | null;
    debt_decreasing_trend?: boolean | null;
    roic_gt_wacc?: boolean | null;
    operating_leverage_improving?: boolean | null;
  };
  advanced_flags?: {
    magic_formula?: boolean;
    low_volatility?: boolean;
    high_momentum?: boolean;
    dividend_aristocrat?: boolean;
    insider_buying?: boolean | null;
  };
  score?: number;
  score_breakdown?: {
    quality?: number;
    growth?: number;
    risk?: number;
    momentum?: number;
  };
  composite_rank?: number;
  percentile_rank?: number;
  sector_rank?: number;
}

export interface ScreenerRunMeta {
  timed_out?: boolean;
  partial?: boolean;
  evaluated_symbols?: number;
  requested_symbols?: number;
  duration_ms?: number;
  has_custom_symbols?: boolean;
  universe_trimmed?: boolean;
  trimmed_from?: number | null;
  total_matches?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc" | string;
  elimination_counts?: Record<string, number>;
  relaxation_suggestions?: Array<{
    filter: string;
    count: number;
    suggestion: string;
  }>;
}

export interface ScreenerRunResponse {
  items: ScreenerRow[];
  meta?: ScreenerRunMeta;
}

export interface ScreenerPreset {
  id: string;
  label: string;
  for?: string;
  filters: Record<string, unknown>;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
}
