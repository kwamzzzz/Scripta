/** Everything administrators have changed in this portal: what, who and when. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAdminEvents } from "@/lib/platform";
import { ago } from "@/lib/admin-data";

const AREA: Record<string, string> = {
  feature: "Features",
  admin: "Access",
  announcement: "Announcements",
  maintenance: "Maintenance",
  feedback: "Feedback",
};
const areaOf = (action: string) => AREA[action.split(".")[0] ?? ""] ?? "Other";

export default function ActivityTab() {
  const events = useQuery({
    queryKey: ["admin", "events", "all"],
    queryFn: () => listAdminEvents(500),
  });
  const [area, setArea] = useState("all");
  const [query, setQuery] = useState("");
  const all = events.data ?? [];
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (e) =>
      (area === "all" || areaOf(e.action) === area) &&
      (!q || `${e.summary} ${e.actorName}`.toLowerCase().includes(q)),
  );

  return (
    <>
      <p className="adm-lede">
        Every change made in this portal is recorded here, with who made it. The record cannot be
        edited or deleted, by anyone.
      </p>
      <div className="adm-toolbar">
        <input
          type="search"
          placeholder="Search the log"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the log"
        />
        <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
          <option value="all">Every area</option>
          {[...new Set(Object.values(AREA)), "Other"].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      {events.isLoading ? (
        <p className="adm-muted">Loading…</p>
      ) : events.isError ? (
        <p className="adm-error">{(events.error as Error).message}</p>
      ) : shown.length === 0 ? (
        <p className="adm-muted">{all.length ? "Nothing matches." : "Nothing recorded yet."}</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Area</th>
                <th>What changed</th>
                <th>Who</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td
                    style={{ whiteSpace: "nowrap" }}
                    title={new Date(e.createdAt).toLocaleString("en-GB")}
                  >
                    {ago(e.createdAt)}
                  </td>
                  <td>
                    <span className="adm-badge">{areaOf(e.action)}</span>
                  </td>
                  <td>{e.summary}</td>
                  <td>{e.actorName || "An administrator"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
