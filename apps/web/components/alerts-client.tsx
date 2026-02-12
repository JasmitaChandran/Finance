"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/providers";
import { api } from "@/lib/api";

export function AlertsClient() {
  const { token, user } = useAuth();
  const [alerts, setAlerts] = useState<Array<{ id: string; symbol: string; target_price: number; above: boolean; is_active: boolean }>>([]);
  const [form, setForm] = useState({ symbol: "AAPL", target_price: 200, above: true });
  const [triggered, setTriggered] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await api.listAlerts(token);
      setAlerts(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function createAlert() {
    if (!token) return;
    await api.createAlert({ ...form, symbol: form.symbol.toUpperCase() }, token);
    await load();
  }

  async function removeAlert(alertId: string) {
    if (!token) return;
    await api.deleteAlert(alertId, token);
    await load();
  }

  async function checkNow() {
    if (!token) return;
    const response = await api.checkAlerts(token);
    setTriggered(response.triggered);
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-borderGlass bg-card p-6 text-sm text-textMuted">
        Login required to manage stock alerts.
      </div>
    );
  }

  return (
    <section className="space-y-5 animate-rise">
      <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <h1 className="font-display text-2xl">Price Alerts</h1>
        <p className="mt-2 text-sm text-textMuted">Create threshold alerts and trigger checks manually (production cron-ready).</p>

        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <input
            value={form.symbol}
            onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
            className="rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm"
            placeholder="Symbol"
          />
          <input
            value={form.target_price}
            onChange={(e) => setForm((prev) => ({ ...prev, target_price: Number(e.target.value) }))}
            type="number"
            className="rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm"
            placeholder="Target price"
          />
          <select
            value={form.above ? "above" : "below"}
            onChange={(e) => setForm((prev) => ({ ...prev, above: e.target.value === "above" }))}
            className="rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm"
          >
            <option value="above">Price above</option>
            <option value="below">Price below</option>
          </select>
          <button onClick={createAlert} className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-black">
            Create Alert
          </button>
        </div>

        <button onClick={checkNow} className="mt-3 rounded-xl border border-borderGlass px-3 py-2 text-sm text-textMain">
          Check Alerts Now
        </button>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-borderGlass bg-card p-4">
          <h2 className="font-display text-lg">Active Alerts</h2>
          <div className="mt-3 space-y-2">
            {alerts.map((alert) => (
              <div key={alert.id} className="rounded-lg border border-borderGlass bg-bgSoft p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-textMain">{alert.symbol}</p>
                    <p className="text-textMuted">
                      Trigger when {alert.above ? "above" : "below"} ${alert.target_price.toFixed(2)}
                    </p>
                  </div>
                  <button onClick={() => removeAlert(alert.id)} className="rounded-lg border border-borderGlass px-2 py-1 text-xs">
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!alerts.length && <p className="text-sm text-textMuted">No alerts created yet.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-borderGlass bg-card p-4">
          <h2 className="font-display text-lg">Triggered Results</h2>
          <div className="mt-3 space-y-2 text-sm text-textMuted">
            {triggered.map((item) => (
              <div key={String(item.alert_id)} className="rounded-lg border border-borderGlass bg-bgSoft p-3">
                <p className="text-textMain">{String(item.symbol)} hit condition</p>
                <p>
                  Target: ${Number(item.target_price || 0).toFixed(2)} | Current: ${Number(item.current_price || 0).toFixed(2)}
                </p>
                <p>{String((item.email as { message?: string })?.message || "")}</p>
              </div>
            ))}
            {!triggered.length && <p>No triggered alerts yet. Run a manual check after market movement.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
