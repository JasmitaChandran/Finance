"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useAuth } from "@/components/providers";
import { api } from "@/lib/api";
import { formatCurrency, formatLarge } from "@/lib/format";
import type { PortfolioInsights, PortfolioListItem } from "@/lib/types";

const ALLOCATION_COLORS = ["#22d3ee", "#34d399", "#60a5fa", "#f59e0b", "#fb7185", "#a78bfa", "#4ade80", "#f97316"];

const tooltipContentStyle = {
  borderRadius: 10,
  border: "1px solid var(--border-glass)",
  background: "var(--card)",
};
const tooltipLabelStyle = { color: "var(--text-main)", fontWeight: 600 };
const tooltipItemStyle = { color: "var(--text-main)" };

function ratio(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(3);
}

function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}%`;
}

export function PortfolioClient() {
  const { token, user } = useAuth();
  const [portfolios, setPortfolios] = useState<PortfolioListItem[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [insights, setInsights] = useState<PortfolioInsights | null>(null);
  const [name, setName] = useState("Core Portfolio");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [txForm, setTxForm] = useState({
    symbol: "AAPL",
    side: "buy" as "buy" | "sell",
    quantity: 1,
    price: 100,
    fee: 0,
    trade_date: new Date().toISOString().slice(0, 10),
    sector: "Technology",
    note: "",
  });

  const loadPortfolios = useCallback(async () => {
    if (!token) return;
    const response = await api.listPortfolios(token);
    setPortfolios(response.items || []);
    setActivePortfolioId((current) => current ?? response.items?.[0]?.id ?? null);
  }, [token]);

  const loadInsights = useCallback(async () => {
    if (!token || !activePortfolioId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.portfolioInsights(activePortfolioId, token);
      setInsights(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio analytics.");
      setInsights(null);
    } finally {
      setLoading(false);
    }
  }, [activePortfolioId, token]);

  useEffect(() => {
    loadPortfolios().catch(() => undefined);
  }, [loadPortfolios]);

  useEffect(() => {
    loadInsights().catch(() => undefined);
  }, [loadInsights]);

  async function createPortfolio() {
    if (!token || !name.trim()) return;
    await api.createPortfolio(name.trim(), token);
    await loadPortfolios();
  }

  async function addTransaction() {
    if (!token || !activePortfolioId) return;
    await api.addPortfolioTransaction(
      activePortfolioId,
      {
        symbol: txForm.symbol.toUpperCase().trim(),
        side: txForm.side,
        quantity: Number(txForm.quantity),
        price: Number(txForm.price),
        fee: Number(txForm.fee || 0),
        trade_date: txForm.trade_date,
        sector: txForm.sector || undefined,
        note: txForm.note || undefined,
      },
      token
    );
    await loadPortfolios();
    await loadInsights();
  }

  const riskComparison = useMemo(() => {
    if (!insights?.risk_vs_benchmark_comparison) return [];
    const row = insights.risk_vs_benchmark_comparison;
    return [
      {
        metric: "Annual Return",
        portfolio: row.portfolio_annual_return_percent ?? 0,
        benchmark: row.benchmark_annual_return_percent ?? 0,
      },
      {
        metric: "Annual Volatility",
        portfolio: row.portfolio_annual_volatility_percent ?? 0,
        benchmark: row.benchmark_annual_volatility_percent ?? 0,
      },
    ];
  }, [insights]);

  const activePortfolioName = portfolios.find((item) => item.id === activePortfolioId)?.name ?? "Portfolio";

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
        <h1 className="font-display text-2xl">Portfolio Management & Risk Analytics</h1>
        <p className="mt-2 text-sm text-textMuted">
          Create portfolios, add buy/sell transactions, auto-calculate P&L/XIRR, track allocation, and monitor advanced risk metrics.
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
            <label className="text-xs text-textMuted">Create Portfolio</label>
            <div className="mt-2 flex gap-2">
              <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm" />
              <button onClick={createPortfolio} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black">
                Create
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
            <label className="text-xs text-textMuted">Add Buy/Sell Transaction</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                value={txForm.symbol}
                onChange={(event) => setTxForm((prev) => ({ ...prev, symbol: event.target.value.toUpperCase() }))}
                placeholder="Symbol"
                className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm"
              />
              <select
                value={txForm.side}
                onChange={(event) => setTxForm((prev) => ({ ...prev, side: event.target.value as "buy" | "sell" }))}
                className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
              <input
                type="number"
                value={txForm.quantity}
                onChange={(event) => setTxForm((prev) => ({ ...prev, quantity: Number(event.target.value) }))}
                placeholder="Quantity"
                className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={txForm.price}
                onChange={(event) => setTxForm((prev) => ({ ...prev, price: Number(event.target.value) }))}
                placeholder="Price"
                className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={txForm.fee}
                onChange={(event) => setTxForm((prev) => ({ ...prev, fee: Number(event.target.value) }))}
                placeholder="Fee"
                className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={txForm.trade_date}
                onChange={(event) => setTxForm((prev) => ({ ...prev, trade_date: event.target.value }))}
                className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm"
              />
              <input
                value={txForm.sector}
                onChange={(event) => setTxForm((prev) => ({ ...prev, sector: event.target.value }))}
                placeholder="Sector"
                className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm"
              />
              <input
                value={txForm.note}
                onChange={(event) => setTxForm((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="Optional note"
                className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm"
              />
            </div>
            <button onClick={addTransaction} className="mt-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black">
              Save Transaction
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_3fr]">
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
                {portfolio.name} ({portfolio.positions.length} holdings • {portfolio.transaction_count ?? 0} txns)
              </button>
            ))}
            {!portfolios.length && <p className="text-sm text-textMuted">No portfolios yet.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-borderGlass bg-card p-4">
          <h2 className="font-display text-lg">{activePortfolioName} Analytics</h2>
          {loading && <p className="mt-3 text-sm text-textMuted">Loading portfolio metrics...</p>}
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}

          {!loading && insights && (
            <>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
                  <p className="text-textMuted">Market Value</p>
                  <p className="mt-1 text-xl font-semibold text-textMain">{formatCurrency(insights.auto_pnl_calculation.market_value)}</p>
                </div>
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
                  <p className="text-textMuted">Total P&L</p>
                  <p className="mt-1 text-xl font-semibold text-textMain">{formatCurrency(insights.auto_pnl_calculation.total_pnl)}</p>
                </div>
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
                  <p className="text-textMuted">XIRR</p>
                  <p className="mt-1 text-xl font-semibold text-textMain">{percent(insights.xirr_percent)}</p>
                </div>
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm">
                  <p className="text-textMuted">Risk Level</p>
                  <p className="mt-1 text-xl font-semibold text-textMain">{insights.risk_level}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="text-textMuted">Beta</p><p className="mt-1 text-textMain">{ratio(insights.beta_of_portfolio)}</p></div>
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="text-textMuted">Sharpe</p><p className="mt-1 text-textMain">{ratio(insights.sharpe_ratio)}</p></div>
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="text-textMuted">Sortino</p><p className="mt-1 text-textMain">{ratio(insights.sortino_ratio)}</p></div>
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="text-textMuted">Calmar</p><p className="mt-1 text-textMain">{ratio(insights.calmar_ratio)}</p></div>
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="text-textMuted">Information Ratio</p><p className="mt-1 text-textMain">{ratio(insights.information_ratio)}</p></div>
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="text-textMuted">Max Drawdown</p><p className="mt-1 text-textMain">{percent(insights.max_drawdown)}</p></div>
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="text-textMuted">Upside Capture</p><p className="mt-1 text-textMain">{percent(insights.upside_capture)}</p></div>
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-sm"><p className="text-textMuted">Downside Capture</p><p className="mt-1 text-textMain">{percent(insights.downside_capture)}</p></div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
                  <h3 className="text-sm font-semibold text-textMain">Asset Allocation</h3>
                  <div className="mt-2 h-64">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={insights.asset_allocation} dataKey="value" nameKey="symbol" outerRadius={85}>
                          {insights.asset_allocation.map((row, idx) => (
                            <Cell key={`asset-${row.symbol}`} fill={ALLOCATION_COLORS[idx % ALLOCATION_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(value: number) => formatCurrency(value)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
                  <h3 className="text-sm font-semibold text-textMain">Sector Allocation</h3>
                  <div className="mt-2 h-64">
                    <ResponsiveContainer>
                      <BarChart data={insights.sector_allocation}>
                        <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="sector" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={tooltipContentStyle}
                          labelStyle={tooltipLabelStyle}
                          itemStyle={tooltipItemStyle}
                          formatter={(value: number, key: string) => (key === "value" ? formatCurrency(value) : `${value.toFixed(2)}%`)}
                        />
                        <Legend />
                        <Bar dataKey="value" fill="#22d3ee" name="Market Value" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-borderGlass bg-bgSoft p-3">
                <h3 className="text-sm font-semibold text-textMain">Risk vs Benchmark ({insights.risk_vs_benchmark_comparison.benchmark_symbol})</h3>
                <div className="mt-2 h-64">
                  <ResponsiveContainer>
                    <BarChart data={riskComparison}>
                      <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="metric" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(value: number) => `${value.toFixed(2)}%`} />
                      <Legend />
                      <Bar dataKey="portfolio" fill="#34d399" name="Portfolio" />
                      <Bar dataKey="benchmark" fill="#60a5fa" name="Benchmark" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-textMuted">
                  Tracking error: {percent(insights.risk_vs_benchmark_comparison.tracking_error_percent)} • Alpha: {percent(insights.risk_vs_benchmark_comparison.alpha_percent)}
                </p>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
                  <h3 className="text-sm font-semibold text-textMain">Tax Gain Calculation</h3>
                  <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                    <p className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-textMuted">Realized Short-Term: <span className="text-textMain">{formatCurrency(insights.tax_gain_calculation.realized_short_term)}</span></p>
                    <p className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-textMuted">Realized Long-Term: <span className="text-textMain">{formatCurrency(insights.tax_gain_calculation.realized_long_term)}</span></p>
                    <p className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-textMuted">Unrealized Short-Term: <span className="text-textMain">{formatCurrency(insights.tax_gain_calculation.unrealized_short_term)}</span></p>
                    <p className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-textMuted">Unrealized Long-Term: <span className="text-textMain">{formatCurrency(insights.tax_gain_calculation.unrealized_long_term)}</span></p>
                  </div>
                  <p className="mt-2 text-sm text-textMuted">
                    Estimated tax payable: <span className="text-textMain">{formatCurrency(insights.tax_gain_calculation.estimated_tax_payable)}</span>
                  </p>
                </div>

                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
                  <h3 className="text-sm font-semibold text-textMain">AI Rebalance Suggestions</h3>
                  <ul className="mt-2 space-y-1 text-sm text-textMuted">
                    {(insights.suggestions || []).map((text) => (
                      <li key={text}>• {text}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
                  <h3 className="text-sm font-semibold text-textMain">Holdings</h3>
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="text-textMuted">
                        <tr>
                          <th className="py-2 text-left">Symbol</th>
                          <th className="py-2 text-right">Qty</th>
                          <th className="py-2 text-right">Avg Buy</th>
                          <th className="py-2 text-right">Current</th>
                          <th className="py-2 text-right">Value</th>
                          <th className="py-2 text-right">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insights.holdings.map((holding) => (
                          <tr key={`holding-${holding.symbol}`} className="border-t border-borderGlass text-textMuted">
                            <td className="py-2 text-textMain">{holding.symbol}</td>
                            <td className="py-2 text-right">{holding.quantity.toFixed(2)}</td>
                            <td className="py-2 text-right">{formatCurrency(holding.average_buy_price)}</td>
                            <td className="py-2 text-right">{formatCurrency(holding.current_price)}</td>
                            <td className="py-2 text-right">{formatCurrency(holding.market_value)}</td>
                            <td className={`py-2 text-right ${holding.pnl >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(holding.pnl)}</td>
                          </tr>
                        ))}
                        {!insights.holdings.length && (
                          <tr>
                            <td className="py-4 text-center text-textMuted" colSpan={6}>
                              No holdings yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
                  <h3 className="text-sm font-semibold text-textMain">Recent Transactions</h3>
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="text-textMuted">
                        <tr>
                          <th className="py-2 text-left">Date</th>
                          <th className="py-2 text-left">Symbol</th>
                          <th className="py-2 text-left">Side</th>
                          <th className="py-2 text-right">Qty</th>
                          <th className="py-2 text-right">Price</th>
                          <th className="py-2 text-right">Fee</th>
                          <th className="py-2 text-right">Notional</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(insights.transactions || []).slice().reverse().slice(0, 14).map((tx) => (
                          <tr key={`tx-${tx.id}`} className="border-t border-borderGlass text-textMuted">
                            <td className="py-2">{tx.trade_date}</td>
                            <td className="py-2 text-textMain">{tx.symbol}</td>
                            <td className={`py-2 ${tx.side === "buy" ? "text-success" : "text-warning"}`}>{tx.side.toUpperCase()}</td>
                            <td className="py-2 text-right">{tx.quantity.toFixed(2)}</td>
                            <td className="py-2 text-right">{formatCurrency(tx.price)}</td>
                            <td className="py-2 text-right">{formatCurrency(tx.fee)}</td>
                            <td className="py-2 text-right">{formatLarge(tx.quantity * tx.price)}</td>
                          </tr>
                        ))}
                        {!insights.transactions?.length && (
                          <tr>
                            <td className="py-4 text-center text-textMuted" colSpan={7}>
                              No transactions yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {!loading && !insights && !error && <p className="mt-3 text-sm text-textMuted">Add a portfolio and transactions to generate analytics.</p>}
        </div>
      </div>
    </section>
  );
}
