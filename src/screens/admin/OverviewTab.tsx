/** The admin portal's front page: the numbers, and what needs attention. */
import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { FEATURES, useFeatureSettings } from "@/lib/features";
import { useMaintenance, useLiveAnnouncements, listAdminEvents } from "@/lib/platform";
import { ago, money, type Overview } from "@/lib/admin-data";
import type { AdminTab } from "../AdminScreen";

export default function OverviewTab({
  overview,
  go,
}: {
  overview: UseQueryResult<Overview>;
  go: (tab: AdminTab) => void;
}) {
  const { settings } = useFeatureSettings();
  const maintenance = useMaintenance();
  const live = useLiveAnnouncements();
  const events = useQuery({ queryKey: ["admin", "events"], queryFn: () => listAdminEvents(8) });
  const o = overview.data;
  const off = FEATURES.filter((f) => settings[f.key]?.state !== "on");
  const early = FEATURES.filter((f) => (settings[f.key]?.preview.length ?? 0) > 0);

  if (overview.isError) return <p className="adm-error">{(overview.error as Error).message}</p>;
  if (!o) return <p className="adm-muted">Loading…</p>;

  const stat = (value: string | number, label: string, tab?: AdminTab, alert = false) =>
    tab ? (
      <button
        type="button"
        className={`adm-stat${alert ? " is-alert" : ""}`}
        onClick={() => go(tab)}
      >
        <strong>{value}</strong>
        <span>{label}</span>
      </button>
    ) : (
      <div className={`adm-stat${alert ? " is-alert" : ""}`}>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    );

  return (
    <>
      <div className="adm-stats">
        {stat(o.people, `people · ${o.newPeople30d} joined in 30 days`, "people")}
        {stat(o.active7d, "active in the last 7 days", "people")}
        {stat(o.workspaces, "firms and personal workspaces")}
        {stat(o.matters, "matters")}
        {stat(money(o.aiCostMonth), `AI this month · ${o.aiCallsMonth} calls`, "usage")}
        {stat(o.aiFailuresMonth, "AI calls failed this month", "usage", o.aiFailuresMonth > 0)}
        {stat(
          o.feedbackUnread,
          `unread feedback · ${o.feedbackOpen} open`,
          "feedback",
          o.feedbackUnread > 0,
        )}
        {stat(
          FEATURES.length - off.length,
          `of ${FEATURES.length} features fully on`,
          "features",
          off.length > 0,
        )}
      </div>

      <div className="adm-columns">
        <section className="adm-panel">
          <h2>Right now</h2>
          <ul
            style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}
          >
            <li>
              Maintenance mode is <strong>{maintenance.on ? "on" : "off"}</strong>
              {maintenance.on ? ": members see a “back soon” page." : "."}
            </li>
            <li>
              {live.length
                ? `${live.length} announcement${live.length === 1 ? "" : "s"} showing.`
                : "No announcement showing."}
            </li>
            <li>
              {off.length
                ? `Held back from members: ${off.map((f) => `${f.label} (${settings[f.key]!.state === "dim" ? "coming soon" : "hidden"})`).join(", ")}.`
                : "Every feature is on for everyone."}
            </li>
            {early.length > 0 && (
              <li>
                Early access open on{" "}
                {early.map((f) => `${f.label} (${settings[f.key]!.preview.length})`).join(", ")}.
              </li>
            )}
            <li>
              {o.admins} administrator{o.admins === 1 ? "" : "s"}.
            </li>
          </ul>
          <div className="adm-actions">
            <button type="button" className="adm-link" onClick={() => go("features")}>
              Manage features
            </button>
            <button type="button" className="adm-link" onClick={() => go("announcements")}>
              Post an announcement
            </button>
          </div>
        </section>

        <section className="adm-panel">
          <h2>Recent admin changes</h2>
          {events.isLoading ? (
            <p className="adm-muted">Loading…</p>
          ) : !events.data?.length ? (
            <p className="adm-muted">
              Nothing changed yet. Every change made in this portal is recorded here.
            </p>
          ) : (
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {events.data.map((e) => (
                <li key={e.id}>
                  {e.summary}{" "}
                  <span className="adm-muted">
                    · {e.actorName || "An administrator"} · {ago(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="adm-link" onClick={() => go("activity")}>
            Full activity log
          </button>
        </section>
      </div>
    </>
  );
}
