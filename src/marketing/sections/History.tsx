/** Everything that changed in this client's marketing, seen only by the people who can see it. */
import { useQuery } from "@tanstack/react-query";
import { relTime } from "@/lib/home-data";
import { Empty, ErrorLine, OrgPage, Panel } from "@/organisation/ui";
import { loadMarketingHistory } from "../db";
import type { SectionProps } from "../ui";

/** The database writes table words; say them as a person would. */
const readable = (summary: string) =>
  summary
    .replace("director_approval", "approval")
    .replace("legal_review", "legal review")
    .replace("Check overridden added:", "Check overridden:")
    .replace(/: tone$/, ": words the brand kit avoids")
    .replace(/: licence$/, ": licence claim")
    .replace(/: consent:(.+)$/, ": consent from $1")
    .replace(/: asset$/, ": image");

export default function History({ m }: SectionProps) {
  const rows = useQuery({
    queryKey: [
      "marketing-history",
      m.clientId,
      m.posts.length,
      m.approvals.length,
      m.overrides.length,
    ],
    retry: false,
    queryFn: () => loadMarketingHistory(m.clientId),
  });
  return (
    <OrgPage title="History" subtitle="Kept by Scripta as each change is made. Nobody can edit it.">
      {rows.isError && <ErrorLine error={(rows.error as Error).message} />}
      {!rows.data ? (
        <p className="og-muted">Loading…</p>
      ) : rows.data.length === 0 ? (
        <Empty title="Nothing recorded yet" />
      ) : (
        <Panel>
          <ul className="og-rows">
            {rows.data.map((r) => (
              <li key={r.id}>
                <div className="og-row-main">
                  <span className="og-row-title">{readable(r.summary)}</span>
                  <span className="og-row-meta">{r.actor}</span>
                </div>
                <span className="og-row-meta">{relTime(r.at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </OrgPage>
  );
}
