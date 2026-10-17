/**
 * What AI is costing, across every firm: by day, by feature, by person and by
 * model, with failures called out. The pause switch stops AI for members at
 * the server; administrators and early-access people carry on.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import { useFeatureSettings, useSaveFeature } from "@/lib/features";
import { logAdminEvent } from "@/lib/platform";
import { featureName, loadUsage, money, type UsageSlice } from "@/lib/admin-data";
import { useAdminActor } from "./actor";

const PERIODS = [
  { id: "month", label: "This month" },
  { id: "30", label: "Last 30 days" },
  { id: "7", label: "Last 7 days" },
  { id: "all", label: "All time" },
] as const;
type Period = (typeof PERIODS)[number]["id"];

const since = (p: Period) => {
  const now = new Date();
  if (p === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === "all") return new Date(2020, 0, 1);
  return new Date(now.getTime() - Number(p) * 86_400_000);
};

export default function UsageTab() {
  const [period, setPeriod] = useState<Period>("month");
  const usage = useQuery({
    queryKey: ["admin", "usage", period],
    queryFn: () => loadUsage(since(period)),
  });
  const { settings } = useFeatureSettings();
  const save = useSaveFeature();
  const actor = useAdminActor();
  const ai = settings["ai"]!;
  const paused = ai.state !== "on";
  const u = usage.data;
  // Every day in the range, quiet days included, so the chart is to scale.
  const days = (() => {
    if (!u?.byDay.length) return [];
    const byDay = new Map(u.byDay.map((d) => [d.day, d]));
    const out: { day: string; calls: number; cost: number }[] = [];
    const end = Date.parse(`${u.byDay[u.byDay.length - 1]!.day}T00:00:00Z`);
    for (let t = Date.parse(`${u.byDay[0]!.day}T00:00:00Z`); t <= end; t += 86_400_000) {
      const day = new Date(t).toISOString().slice(0, 10);
      out.push(byDay.get(day) ?? { day, calls: 0, cost: 0 });
    }
    return out;
  })();

  return (
    <>
      <section className="adm-panel">
        <div className="adm-switch-row">
          <div>
            <h2>AI for members</h2>
            <p style={{ margin: "4px 0 0" }}>
              {paused
                ? "Paused. Every AI action is refused at the server for members; administrators and early-access people carry on."
                : "Running. Pausing stops every AI action for members at once, in every tool, without touching anything else."}
            </p>
          </div>
          <Button
            variant={paused ? "primary" : "danger"}
            disabled={save.isPending}
            onClick={async () => {
              const state = paused ? "on" : "dim";
              await save.mutateAsync({
                key: "ai",
                state,
                note: ai.note,
                preview: ai.preview,
                userId: actor.id,
              });
              await logAdminEvent(
                actor,
                "feature.changed",
                "ai",
                paused ? "AI resumed for members" : "AI paused for members",
              );
            }}
          >
            {paused ? "Resume AI" : "Pause AI"}
          </Button>
        </div>
      </section>

      <div className="adm-toolbar">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          aria-label="Period"
        >
          {PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {usage.isLoading ? (
        <p className="adm-muted">Loading…</p>
      ) : usage.isError ? (
        <p className="adm-error">{(usage.error as Error).message}</p>
      ) : u ? (
        <>
          <div className="adm-stats">
            <div className="adm-stat">
              <strong>{money(u.total.cost)}</strong>
              <span>spent</span>
            </div>
            <div className="adm-stat">
              <strong>{u.total.calls.toLocaleString()}</strong>
              <span>calls</span>
            </div>
            <div className="adm-stat">
              <strong>{u.total.calls ? money(u.total.cost / u.total.calls) : "$0.00"}</strong>
              <span>average per call</span>
            </div>
            <div className="adm-stat">
              <strong>{((u.total.inputTokens + u.total.outputTokens) / 1000).toFixed(0)}k</strong>
              <span>
                tokens ({(u.total.inputTokens / 1000).toFixed(0)}k in,{" "}
                {(u.total.outputTokens / 1000).toFixed(0)}k out)
              </span>
            </div>
            <div className={`adm-stat${u.total.failures ? " is-alert" : ""}`}>
              <strong>{u.total.failures}</strong>
              <span>
                failed
                {u.total.calls
                  ? ` · ${((u.total.failures / u.total.calls) * 100).toFixed(1)}%`
                  : ""}
              </span>
            </div>
          </div>

          <section className="adm-panel">
            <h2>By day</h2>
            {u.byDay.length === 0 ? (
              <p className="adm-muted">No AI calls in this period.</p>
            ) : (
              <>
                <div className="adm-spark" aria-label="Spend by day">
                  {days.map((d) => {
                    const max = Math.max(...days.map((x) => x.cost), 0.0001);
                    return (
                      <i
                        key={d.day}
                        title={`${d.day}: ${money(d.cost)} · ${d.calls} calls`}
                        style={{ height: d.cost ? `${Math.max(3, (d.cost / max) * 100)}%` : "1px" }}
                      />
                    );
                  })}
                </div>
                <div
                  className="adm-actions adm-muted"
                  style={{ justifyContent: "space-between", fontSize: 12 }}
                >
                  <span>{u.byDay[0]!.day}</span>
                  <span>{u.byDay[u.byDay.length - 1]!.day}</span>
                </div>
              </>
            )}
          </section>

          <div className="adm-columns">
            <Breakdown title="By feature" rows={u.byFeature} name={featureName} />
            <Breakdown title="By person" rows={u.byPerson} />
            <Breakdown title="By model" rows={u.byModel} />
          </div>
          <p className="adm-muted" style={{ margin: 0 }}>
            Each firm's own spending cap is set in that firm's settings. Pausing here applies to
            every firm.
          </p>
        </>
      ) : null}
    </>
  );
}

function Breakdown({
  title,
  rows,
  name = (k: string) => k,
}: {
  title: string;
  rows: UsageSlice[];
  name?: (key: string) => string;
}) {
  const max = Math.max(...rows.map((r) => r.cost), 0.0001);
  return (
    <section className="adm-panel">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="adm-muted">Nothing yet.</p>
      ) : (
        <div className="adm-bars">
          {rows.slice(0, 12).map((r) => (
            <div
              key={r.key}
              className="adm-bar-row"
              title={`${r.calls} calls · ${r.tokens.toLocaleString()} tokens`}
            >
              <span>{name(r.key)}</span>
              <div className="adm-bar">
                <i style={{ width: `${(r.cost / max) * 100}%` }} />
              </div>
              <span className="num">
                {money(r.cost)} <span className="adm-muted">· {r.calls}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
