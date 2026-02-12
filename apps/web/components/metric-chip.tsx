"use client";

import { Info } from "lucide-react";
import { useState } from "react";

import { api } from "@/lib/api";

interface MetricChipProps {
  label: string;
  metricKey: string;
  value: string;
  symbol: string;
  rawValue?: number | null;
}

export function MetricChip({ label, metricKey, value, symbol, rawValue }: MetricChipProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<null | {
    title: string;
    simple_explanation: string;
    analogy: string;
    what_good_looks_like: string;
    caution: string;
  }>(null);

  async function loadInsight() {
    setOpen(true);
    if (insight || loading) return;
    setLoading(true);
    try {
      const response = await api.explainMetric(metricKey, rawValue ?? undefined, symbol);
      setInsight(response);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative rounded-xl border border-borderGlass bg-card p-3 hover:bg-cardHover">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-textMuted">{label}</p>
          <p className="mt-1 text-lg font-semibold">{value}</p>
        </div>
        <button onClick={loadInsight} className="rounded-md p-2 text-textMuted transition hover:bg-bgSoft hover:text-textMain" aria-label={`Explain ${label}`}>
          <Info className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-lg border border-borderGlass bg-bgSoft p-3 text-xs leading-relaxed text-textMuted">
          {loading && <p>Explaining this metric...</p>}
          {!loading && insight && (
            <>
              <p className="font-semibold text-textMain">{insight.title}</p>
              <p className="mt-1">{insight.simple_explanation}</p>
              <p className="mt-2 text-textMain">Analogy: <span className="text-textMuted">{insight.analogy}</span></p>
              <p className="mt-2">Good signal: {insight.what_good_looks_like}</p>
              <p className="mt-1">Watchout: {insight.caution}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
