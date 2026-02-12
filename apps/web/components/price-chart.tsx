"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function PriceChart({
  data,
  symbol
}: {
  data: Array<{ date: string; close: number; volume: number }>;
  symbol: string;
}) {
  return (
    <div className="rounded-2xl border border-borderGlass bg-card p-4 shadow-glow">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg">{symbol} Price Trend</h3>
        <span className="text-xs text-textMuted">Last 6 months</span>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} minTickGap={30} />
            <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid var(--border-glass)",
                background: "var(--card)"
              }}
            />
            <Area type="monotone" dataKey="close" stroke="var(--accent)" strokeWidth={2.5} fill="url(#priceFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
