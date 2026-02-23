"use client";

import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCurrency } from "@/lib/format";

type PricePoint = { date: string; close: number; volume: number };
type ChartPreset = { id: string; label: string };
type ChartEvent = { date: string; label: string; type?: "news" | "earnings" | "dividend" | "signal" };

export function PriceChart({
  data,
  symbol,
  currency = "USD",
  periodLabel = "Last 6 months",
  presets = [],
  selectedPreset,
  onSelectPreset,
  returnChips = [],
  events = [],
  loading = false,
}: {
  data: PricePoint[];
  symbol: string;
  currency?: string;
  periodLabel?: string;
  presets?: ChartPreset[];
  selectedPreset?: string;
  onSelectPreset?: (presetId: string) => void;
  returnChips?: Array<{ label: string; value: number | null }>;
  events?: ChartEvent[];
  loading?: boolean;
}) {
  const eventByDate = new Map<string, ChartEvent>();
  for (const item of events) {
    if (!item?.date) continue;
    if (!eventByDate.has(item.date)) eventByDate.set(item.date, item);
  }

  const plottedEvents = data
    .map((point) => {
      const event = eventByDate.get(point.date);
      if (!event) return null;
      return { ...event, close: point.close };
    })
    .filter(Boolean) as Array<ChartEvent & { close: number }>;

  return (
    <div className="rounded-2xl border border-borderGlass bg-card p-4 shadow-glow">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-display text-lg">{symbol} Price Trend</h3>
          <span className="text-xs text-textMuted">{periodLabel}</span>
        </div>
        {!!presets.length && (
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset?.(preset.id)}
                className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                  selectedPreset === preset.id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-borderGlass bg-bgSoft text-textMuted hover:text-textMain"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!!returnChips.length && (
        <div className="mb-3 flex flex-wrap gap-2">
          {returnChips.map((chip) => (
            <div key={chip.label} className="rounded-lg border border-borderGlass bg-bgSoft px-3 py-1.5 text-xs">
              <span className="text-textMuted">{chip.label}: </span>
              <span className={chip.value === null ? "text-textMuted" : chip.value >= 0 ? "text-success" : "text-danger"}>
                {chip.value === null ? "-" : `${chip.value >= 0 ? "+" : ""}${chip.value.toFixed(2)}%`}
              </span>
            </div>
          ))}
        </div>
      )}

      {!!events.length && (
        <div className="mb-3 flex flex-wrap gap-2">
          {events.slice(0, 4).map((event, index) => (
            <span
              key={`${event.label}-${event.date}-${index}`}
              className="rounded-full border border-borderGlass bg-bgSoft px-2.5 py-1 text-[11px] text-textMuted"
              title={event.date}
            >
              {event.type === "earnings" ? "Earnings" : event.type === "dividend" ? "Dividend" : event.type === "news" ? "News" : "Signal"} • {event.label}
            </span>
          ))}
        </div>
      )}

      {loading && (
        <div className="mb-3 rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-xs text-textMuted">
          Updating chart history...
        </div>
      )}

      {data.length ? (
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
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={72} />
              <Tooltip
                formatter={(value) => formatCurrency(typeof value === "number" ? value : Number(value), currency)}
                labelStyle={{ color: "var(--text-main)" }}
                itemStyle={{ color: "var(--text-main)" }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border-glass)",
                  background: "rgba(10, 16, 28, 0.96)",
                  color: "var(--text-main)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.35)"
                }}
              />
              {plottedEvents.map((event) => (
                <ReferenceDot
                  key={`${event.date}-${event.label}`}
                  x={event.date}
                  y={event.close}
                  r={4}
                  fill={
                    event.type === "earnings"
                      ? "#f59e0b"
                      : event.type === "dividend"
                        ? "#10b981"
                        : event.type === "news"
                          ? "#22d3ee"
                          : "#a78bfa"
                  }
                  stroke="rgba(255,255,255,0.8)"
                />
              ))}
              <Area type="monotone" dataKey="close" stroke="var(--accent)" strokeWidth={2.5} fill="url(#priceFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-72 items-center justify-center rounded-xl border border-borderGlass bg-bgSoft text-sm text-textMuted">
          No price history available for this period.
        </div>
      )}
    </div>
  );
}
