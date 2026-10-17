/**
 * The day's report, where you would actually come across it.
 *
 * The report screen was reachable only from the sidebar, which meant the
 * promise — you should not have to reconstruct your day — was half kept: you
 * did not have to write it, but you did have to remember it existed and go and
 * look. A record nobody is told about is a record nobody reads.
 *
 * So it sits on the dashboard, which is the screen you open anyway. Before half
 * past five it shows the day so far, quietly. After, it says the day is ready.
 *
 * It also does the keeping. The report screen freezes a closed day when it is
 * opened; this freezes it when you open Scripta at all, which is far more
 * likely to happen. Either way the derivation is the same and nothing is lost
 * if neither runs — the day can always be read again later.
 */
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useApp } from "@/store/app";
import { useAuth } from "@/lib/auth";
import { readDay, saveDay } from "@/lib/work-report/data";
import { dayHasClosed, localDay, summarise } from "@/lib/work-report/model";

import "./work-report-card.css";

export default function WorkReportCard() {
  const { workspaceId } = useApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const day = localDay();
  const closed = dayHasClosed(day);

  const report = useQuery({
    queryKey: ["work-report", workspaceId, userId, day],
    enabled: !!workspaceId && !!userId,
    retry: false,
    queryFn: () => readDay(workspaceId!, userId!, day),
  });

  // Keep a closed day on the way past. Once only: a day that has been kept has
  // a `savedAt`, and the lawyer's own edits must never be overwritten by a
  // fresh derivation.
  useEffect(() => {
    const data = report.data;
    if (!workspaceId || !userId || !data || data.savedAt || !closed || !data.entries.length) return;
    void saveDay(workspaceId, userId, day, { entries: data.entries, note: data.note })
      .then(() =>
        queryClient.invalidateQueries({ queryKey: ["work-reports", workspaceId, userId] }),
      )
      .catch(() => {
        // A failed keep is not worth interrupting the dashboard for: the day
        // can still be read and kept from the report screen.
      });
  }, [report.data, closed, workspaceId, userId, day, queryClient]);

  const entries = report.data?.entries.filter((e) => !e.excluded) ?? [];
  if (report.isLoading || report.isError) return null;

  return (
    <Link to="/reports" className={`wrc${closed ? " is-ready" : ""}`}>
      <div className="wrc-head">
        <ClipboardCheck size={14} aria-hidden="true" />
        <strong>{closed ? "Your day is ready" : "Today so far"}</strong>
      </div>
      {entries.length ? (
        <>
          <p className="wrc-count">{summarise(entries)}</p>
          <ul>
            {entries.slice(0, 3).map((entry) => (
              <li key={entry.id}>
                <span>{entry.title}</span>
                {entry.matterName && <em>{entry.matterName}</em>}
              </li>
            ))}
          </ul>
          {entries.length > 3 && <p className="wrc-more">and {entries.length - 3} more</p>}
        </>
      ) : (
        <p className="wrc-count">
          {closed
            ? "No tasks completed today."
            : "No tasks completed yet. They appear here as you finish them."}
        </p>
      )}
    </Link>
  );
}
