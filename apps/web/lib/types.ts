export type AppMode = "beginner" | "pro";

export interface StockQuote {
  symbol: string;
  name: string;
  currency?: string;
  price?: number;
  change_percent?: number;
  market_cap?: number;
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

export interface StockDashboard {
  quote: StockQuote;
  profile: StockProfile;
  ratios: Record<string, number | null>;
  financial_highlights: Record<string, string | number | null>;
  history: Array<{ date: string; close: number; volume: number }>;
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

export interface User {
  id: string;
  email: string;
  full_name: string;
}
