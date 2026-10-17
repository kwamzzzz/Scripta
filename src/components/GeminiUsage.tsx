import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import GeminiMark from "@/components/GeminiMark";
import { aiProviderLabel, usageThisMonth } from "@/lib/usage.functions";
import { useApp } from "@/store/app";
import { C } from "@/lib/tokens";

/**
 * The AI usage pill.
 *
 * It lived inside AppShell, so the frames that draw their own topbar — the
 * dashboard and both transcript screens — could not use it and carried a
 * drawing of it instead: a meter permanently reading READY and "No usage yet",
 * with a refresh icon that was an SVG and nothing else. It said the same thing
 * with no provider configured as it did after a hundred calls.
 *
 * Here it is a component anything can mount, and every screen shows the same
 * numbers because there is only one place they come from.
 */

const money = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`);
const monthName = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long" });

/** AI usage for the current month, read from the calls the gateway recorded.
 *  Reports tokens rather than money while rates are unset, because a total
 *  that looks like money but is guessed is worse than no total. */
export default function GeminiUsage() {
  const [open, setOpen] = useState(false);
  const { workspaceId } = useApp();
  const usage = useQuery({
    queryKey: ["ai-usage-this-month", workspaceId],
    queryFn: () => usageThisMonth({ data: { workspaceId } }),
    staleTime: 60_000,
    retry: false,
  });
  const provider = useQuery({
    queryKey: ["ai-provider-label"],
    queryFn: () => aiProviderLabel(),
    staleTime: 60_000,
    retry: false,
  });
  const u = usage.data;
  const tokens = u ? u.inputTokens + u.outputTokens : 0;
  const spent = u?.costUsd ?? null;
  const cap = u?.capUsd ?? null;
  const hasCap = spent !== null && cap !== null;
  const percent = hasCap && cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
  const overCap = hasCap && spent >= cap;
  const remaining = hasCap ? Math.max(0, cap - spent) : null;
  const spentValue = spent ?? 0;
  const capValue = cap ?? 0;
  const remainingValue = remaining ?? 0;

  const providerName = provider.data ?? "AI";
  const shortName = providerName.split(" ")[0] ?? "AI";

  const readout = usage.isError
    ? "Unavailable"
    : !u
      ? "Loading…"
      : u.calls === 0
        ? u.capUsd
          ? `${money(u.capUsd)} left`
          : "No usage yet"
        : remaining !== null
          ? overCap
            ? `${money(spent - cap)} over`
            : `${money(remaining)} left`
          : `${compact(tokens)} tokens`;

  const status = usage.isError
    ? "Error"
    : overCap
      ? "Over cap"
      : u && u.calls > 0 && spent === null
        ? "No rates"
        : "Ready";

  const title = !u
    ? `${providerName} usage`
    : `Your ${shortName} usage · ${u.calls} call${u.calls === 1 ? "" : "s"} in ${monthName(u.since)}` +
      (spent === null && u.calls > 0 ? " · rates not configured for this provider" : "") +
      (u.failures > 0 ? ` · ${u.failures} failed` : "");

  const lovableProvider = providerName.toLowerCase().startsWith("lovable");

  const tone = usage.isError || overCap ? "is-alert" : status === "No rates" ? "is-warn" : "";
  const fetching = usage.isFetching || provider.isFetching;

  return (
    <div style={{ position: "relative" }}>
      <div className={`wf-gemini${overCap ? " is-over-cap" : ""}`} title={title}>
        <span className="wf-gemini-icon">
          <GeminiMark size={18} />
        </span>
        <span className="wf-gemini-label">
          <strong>{shortName}</strong>
          <small className={tone}>{status}</small>
        </span>
        <button
          type="button"
          className="wf-gemini-meter"
          onClick={() => u && u.calls > 0 && setOpen((v) => !v)}
          disabled={!u || u.calls === 0}
          aria-label={`${providerName} usage: ${readout}`}
          aria-expanded={open}
        >
          <span className="wf-gemini-readout">
            <b>{readout}</b>
            {hasCap && <small>{percent}% used</small>}
          </span>
          {hasCap && (
            <span className="wf-gemini-track" aria-hidden="true">
              <i className="wf-gemini-meter-fill" style={{ width: `${percent}%` }} />
            </span>
          )}
        </button>
        <button
          type="button"
          className={`wf-gemini-refresh${fetching ? " is-spinning" : ""}`}
          onClick={() => {
            void usage.refetch();
            void provider.refetch();
          }}
          disabled={fetching}
          aria-label="Refresh AI usage"
          title="Refresh AI usage"
        >
          <RotateCw size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      {open && u && (
        <div
          role="dialog"
          aria-label="AI usage by feature"
          style={{
            position: "absolute",
            top: 44,
            right: 0,
            zIndex: 60,
            minWidth: 292,
            background: "#fff",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
            padding: 10,
          }}
        >
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
            {monthName(u.since)} · {u.calls} call{u.calls === 1 ? "" : "s"}
            {u.failures > 0 ? ` · ${u.failures} failed` : ""}
          </div>
          {hasCap && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                padding: "3px 0 6px",
                marginBottom: 6,
                borderBottom: `1px solid ${C.border}`,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span>
                {money(spentValue)} of {money(capValue)} used
              </span>
              <span
                style={{
                  font: '500 11px "Geist", sans-serif',
                  color: overCap ? C.red : C.secondary,
                }}
              >
                {overCap ? `${money(spentValue - capValue)} over` : `${money(remainingValue)} left`}
              </span>
            </div>
          )}
          {u.byFeature.map((f) => (
            <div
              key={f.feature}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                fontSize: 12,
                padding: "3px 0",
              }}
            >
              <span>{f.feature}</span>
              <span style={{ font: '500 11px "Geist", sans-serif', color: C.secondary }}>
                {f.costUsd !== null
                  ? money(f.costUsd)
                  : `${compact(f.inputTokens + f.outputTokens)} tok`}
                {" · "}
                {f.calls}
              </span>
            </div>
          ))}
          {!u.ratesKnown && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.45 }}>
              {lovableProvider
                ? "Costs are shown in tokens because the Lovable AI gateway bills workspace credits, not dollars."
                : "Costs are blank because no price is set for " +
                  (u.byFeature.length ? "these models" : "this model") +
                  ". Add them in src/lib/ai-pricing.ts and the cap starts working."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
