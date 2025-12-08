import { useEffect, useState } from "react";

const fallbackStates = [
  { label: "Ohio (OH)", value: "OH" },
  { label: "Florida (FL)", value: "FL" },
  { label: "Texas (TX)", value: "TX" },
  { label: "California (CA)", value: "CA" },
];

const federalRates = [
  { label: "12%", value: 0.12 },
  { label: "22%", value: 0.22 },
  { label: "24%", value: 0.24 },
];

const sources = [
  { label: "Brand", value: "brand" },
  { label: "Collective", value: "collective" },
  { label: "Other", value: "other" },
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const API_BASE = (
  import.meta.env?.VITE_API_BASE_URL ??
  (import.meta.env?.DEV ? "http://127.0.0.1:8000" : "")
).replace(/\/$/, "");
const API_ENDPOINT = `${API_BASE}/api/tax/calculate`;
const STATE_RATES_ENDPOINT = `${API_BASE}/api/tax/state-rates`;

const STORAGE_KEY = "nil-income-tracker";

// Simple localStorage helpers so we can persist without auth or backend.
function loadFromStorage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    return {
      incomeEvents: Array.isArray(parsed.incomeEvents)
        ? parsed.incomeEvents
        : [],
      selectedState:
        typeof parsed.selectedState === "string" ? parsed.selectedState : "OH",
      federalRate:
        typeof parsed.federalRate === "number" ? parsed.federalRate : 0.22,
    };
  } catch (err) {
    console.warn("Bad localStorage value, ignoring.", err);
    return null;
  }
}

function saveToStorage(data) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("Unable to persist data", err);
  }
}

function clearStorage() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("Unable to clear data", err);
  }
}

export default function App() {
  const today = new Date().toISOString().slice(0, 10);
  const persisted = loadFromStorage();
  const [events, setEvents] = useState(persisted?.incomeEvents ?? []);
  const [stateOptions, setStateOptions] = useState(() => {
    if (
      persisted?.selectedState &&
      !fallbackStates.some((option) => option.value === persisted.selectedState)
    ) {
      return [
        { label: `${persisted.selectedState}`, value: persisted.selectedState },
        ...fallbackStates,
      ];
    }
    return fallbackStates;
  });
  const [form, setForm] = useState({
    amount: "",
    date: today,
    source: "brand",
    state: persisted?.selectedState ?? "OH",
    federalRate: persisted?.federalRate ?? 0.22,
  });
  const [spentEstimate, setSpentEstimate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const hydrateStateRates = async () => {
      try {
        const response = await fetch(STATE_RATES_ENDPOINT, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load state rates.");

        const payload = await response.json();
        const states = Array.isArray(payload?.states) ? payload.states : [];
        if (!states.length) return;

        const options = states
          .map((state) => ({
            value: state.code,
            label: `${state.name} (${state.code}) — ${(state.rate * 100).toFixed(
              state.rate === 0 ? 0 : 2
            )}%`,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

        setStateOptions(options);
        setForm((prev) =>
          options.some((option) => option.value === prev.state)
            ? prev
            : { ...prev, state: options[0]?.value ?? prev.state }
        );
      } catch (err) {
        console.warn(
          "Using bundled fallback states; unable to fetch latest rates.",
          err
        );
      }
    };

    hydrateStateRates();

    return () => controller.abort();
  }, [STATE_RATES_ENDPOINT]);

  useEffect(() => {
    saveToStorage({
      incomeEvents: events,
      selectedState: form.state,
      federalRate: form.federalRate,
    });
  }, [events, form.state, form.federalRate]);

  const totals = events.reduce(
    (acc, entry) => {
      acc.gross += entry.grossIncome;
      acc.reserve += entry.recommendedReserve;
      acc.usable += entry.usableCash;
      return acc;
    },
    { gross: 0, reserve: 0, usable: 0 }
  );

  const latestEvent = events[0];
  const spent = parseFloat(spentEstimate) || 0;
  const atRisk = spent > totals.usable;
  const coverage = totals.gross
    ? Math.min(Math.max(totals.usable / totals.gross, 0), 1)
    : 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const numericAmount = parseFloat(form.amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid income amount (greater than 0).");
      return;
    }

    if (!form.date) {
      setError("Add the date this hit your account.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numericAmount,
          state: form.state,
          federal_rate: form.federalRate,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to calculate right now. Please try again.");
      }

      const data = await response.json();
      const usableCash =
        typeof data.usable_cash === "number" ? data.usable_cash : 0;
      const recommendedReserve =
        typeof data.recommended_reserve === "number"
          ? data.recommended_reserve
          : 0;

      const id =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

      const newEvent = {
        id,
        date: form.date,
        amount: numericAmount,
        source: form.source,
        state: form.state,
        federalRate: form.federalRate,
        grossIncome:
          typeof data.gross_income === "number"
            ? data.gross_income
            : numericAmount,
        recommendedReserve,
        usableCash: usableCash || numericAmount - recommendedReserve,
        breakdown: {
          selfEmploymentTax: data.self_employment_tax,
          federalTax: data.federal_tax,
          stateTax: data.state_tax,
        },
      };

      setEvents((prev) => [newEvent, ...prev]);
      setForm((prev) => ({ ...prev, amount: "" }));
    } catch (err) {
      const friendly =
        err.message === "Failed to fetch"
          ? "Could not reach the calculator service. If deployed, try again shortly. For local dev, start the FastAPI backend and set VITE_API_BASE_URL."
          : err.message || "Something went wrong.";
      setError(friendly);
    } finally {
      setLoading(false);
    }
  };

  const performReset = () => {
    const resetDate = new Date().toISOString().slice(0, 10);
    clearStorage();
    setEvents([]);
    setForm({
      amount: "",
      date: resetDate,
      source: "brand",
      state: "OH",
      federalRate: 0.22,
    });
    setSpentEstimate("");
    setError("");
    setShowResetModal(false);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050912] text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="absolute right-[-8rem] top-24 h-96 w-96 rounded-full bg-cyan-400/20 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.03),transparent_25%),radial-gradient(circle_at_80%_0,rgba(255,255,255,0.04),transparent_25%)]" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
        <header className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 shadow-xl ring-1 ring-white/10">
                <img
                  src="/icon.svg"
                  alt="Reserve logo"
                  className="h-9 w-9 drop-shadow-[0_0_20px_rgba(109,214,246,0.45)]"
                />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-2xl font-semibold tracking-tight text-white">
                    Reserve
                  </p>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200 ring-1 ring-white/10">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Beta
                  </div>
                </div>
                <p className="text-sm text-slate-300">
                  NIL income guardrails, right where you track cash.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="text-xs font-semibold text-slate-200 underline underline-offset-4 hover:text-white"
            >
              Reset data
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-2 md:items-start">
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
                Keep NIL cash <span className="text-amber-300">safe to spend.</span>
              </h1>
              <p className="max-w-2xl text-lg text-slate-300">
                Drop in every NIL payment, see what you can spend immediately, and
                watch risk signals before tax season hits.
              </p>
              <div className="flex flex-wrap gap-3 text-sm text-slate-200">
                <span className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Browser-only storage
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
                  <span className="h-2 w-2 rounded-full bg-amber-300" />
                  FastAPI calculator ready
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
                  <span className="h-2 w-2 rounded-full bg-cyan-300" />
                  Built for quick pilots
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 p-5 shadow-xl ring-1 ring-white/10 backdrop-blur">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <p>Total NIL recorded</p>
                <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                  Live
                </span>
              </div>
              <p className="mt-3 text-4xl font-semibold text-white">
                {currency.format(totals.gross)}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-slate-300">Tax reserve needed</p>
                  <p className="text-lg font-semibold text-amber-200">
                    {currency.format(totals.reserve)}
                  </p>
                </div>
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-slate-300">Usable cash</p>
                  <p className="text-lg font-semibold text-emerald-200">
                    {currency.format(totals.usable)}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <p>Protection coverage</p>
                  <span className="font-semibold text-white">
                    {totals.gross ? `${Math.round(coverage * 100)}%` : "—"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${atRisk ? "bg-amber-300" : "bg-emerald-300"
                      }`}
                    style={{ width: `${Math.round(coverage * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200/70">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Add income event
                  </h2>
                  <p className="text-sm text-slate-600">
                    We’ll calculate reserve on the fly and keep it saved locally.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Date received
                    </label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, date: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Amount
                    </label>
                    <input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      placeholder="e.g. 7500"
                      value={form.amount}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, amount: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 placeholder:text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Source
                    </label>
                    <select
                      value={form.source}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, source: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 transition"
                    >
                      {sources.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      State
                    </label>
                    <select
                      value={form.state}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, state: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 transition"
                    >
                      {stateOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Federal tax bracket
                    </label>
                    <select
                      value={form.federalRate}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          federalRate: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 transition"
                    >
                      {federalRates.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
                >
                  {loading ? "Calculating..." : "Add income event"}
                </button>
              </form>
            </div>

            <div className="rounded-2xl bg-slate-900/60 p-6 shadow-xl ring-1 ring-white/10">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Spending check
                  </h2>
                  <p className="text-sm text-slate-300">
                    Compare what you’ve spent to what is truly yours.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    placeholder="Spent so far"
                    value={spentEstimate}
                    onChange={(e) => setSpentEstimate(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/20 sm:w-44"
                  />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {atRisk && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200/70 bg-amber-50/10 px-3 py-2 text-amber-100">
                    <span className="text-lg">⚠️</span>
                    <div>
                      <p className="font-semibold text-amber-100">
                        You may owe more than you’ve saved.
                      </p>
                      <p className="text-sm text-amber-100/90">
                        Spending is above usable cash. Slow down or move funds to
                        your reserve.
                      </p>
                    </div>
                  </div>
                )}

                {!atRisk && totals.usable > 0 && (
                  <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/10 px-3 py-2 text-sm text-emerald-100">
                    You’re under your usable cash threshold. Keep it up.
                  </div>
                )}

                <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <p>Usable cash</p>
                    <span className="font-semibold text-emerald-200">
                      {currency.format(totals.usable)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-300"
                      style={{
                        width: `${Math.min(
                          100,
                          totals.gross
                            ? Math.round((totals.usable / totals.gross) * 100)
                            : 0
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-300">
                    We assume 1099 income, single filer, and simplified brackets.
                    Not tax advice.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200/70">
              <h3 className="text-lg font-semibold text-slate-900">
                Latest event breakdown
              </h3>
              {latestEvent ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span className="capitalize">{latestEvent.source}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {latestEvent.date}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-slate-500">Gross</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {currency.format(latestEvent.grossIncome)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-slate-500">Usable</p>
                      <p className="text-lg font-semibold text-emerald-700">
                        {currency.format(latestEvent.usableCash)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
                      <p className="font-semibold">Reserve</p>
                      <p>{currency.format(latestEvent.recommendedReserve)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3 text-slate-800">
                      <p className="font-semibold">Federal</p>
                      <p>{currency.format(latestEvent.breakdown.federalTax)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3 text-slate-800">
                      <p className="font-semibold">State</p>
                      <p>{currency.format(latestEvent.breakdown.stateTax)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Federal effective rate used: {(latestEvent.federalRate * 100).toFixed(0)}%.
                    State: {latestEvent.state}.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  After your first entry you’ll see a ready-to-share summary here.
                </p>
              )}
            </div>

          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200/70">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Income events
              </h2>
              <p className="text-sm text-slate-600">
                Stored locally in this browser. No database or auth required.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {events.length} recorded
            </span>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-slate-600">
              Add your first NIL payment to see totals and risk.
            </p>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 pr-4 font-medium">State</th>
                    <th className="py-2 pr-4 font-medium">Gross</th>
                    <th className="py-2 pr-4 font-medium">Reserve</th>
                    <th className="py-2 pr-4 font-medium">Usable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events.map((entry) => (
                    <tr key={entry.id} className="text-slate-800">
                      <td className="py-2 pr-4">{entry.date}</td>
                      <td className="py-2 pr-4 capitalize">{entry.source}</td>
                      <td className="py-2 pr-4">{entry.state}</td>
                      <td className="py-2 pr-4">
                        {currency.format(entry.grossIncome)}
                      </td>
                      <td className="py-2 pr-4">
                        {currency.format(entry.recommendedReserve)}
                      </td>
                      <td className="py-2 pr-4">
                        {currency.format(entry.usableCash)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-500 text-center">
            Not tax advice. Calculations are saved locally and reset if you clear
            browser storage.
          </p>
        </div>
      </div>

      {showResetModal && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm">
          <div className="max-w-sm w-full rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                  Reset data
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Clear all income events and spending checks stored in this browser.
                  Your API settings remain unchanged.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close reset dialog"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-100">
                <span className="text-base">⚠️</span>
                <p>This only clears local data on this device.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={performReset}
                  className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Yes, reset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
