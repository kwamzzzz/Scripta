/** Feedback from everyone using Scripta, read and triaged in one place. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import FeedbackReview from "@/components/FeedbackReview";
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_STATUS_LABEL,
  nextStatuses,
  type FeedbackKind,
  type FeedbackStatus,
} from "@/lib/feedback";
import { listPlatformFeedback, setFeedbackStatus } from "@/lib/feedback.functions";
import { logAdminEvent } from "@/lib/platform";
import { ago } from "@/lib/admin-data";
import { useAdminActor } from "./actor";

export default function FeedbackTab() {
  const qc = useQueryClient();
  const actor = useAdminActor();
  const [status, setStatus] = useState<"open" | FeedbackStatus | "all">("open");
  const [kind, setKind] = useState<"all" | FeedbackKind>("all");
  const [query, setQuery] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const feedback = useQuery({
    queryKey: ["platform-feedback"],
    queryFn: async () => (await listPlatformFeedback()).items,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["platform-feedback"] });
    void qc.invalidateQueries({ queryKey: ["admin", "overview"] });
  };
  const move = useMutation({
    mutationFn: async (input: { id: string; status: FeedbackStatus; about: string }) => {
      await setFeedbackStatus({ data: { id: input.id, status: input.status } });
      await logAdminEvent(
        actor,
        "feedback.status",
        input.id,
        `Feedback marked ${FEEDBACK_STATUS_LABEL[input.status].toLowerCase()}: “${input.about}”`,
      );
    },
    onMutate: () => setFailure(null),
    onSuccess: refresh,
    onError: (cause: unknown) =>
      setFailure(cause instanceof Error ? cause.message : "That change did not save."),
  });

  const items = feedback.data ?? [];
  const count = (s: FeedbackStatus) => items.filter((i) => i.status === s).length;
  const q = query.trim().toLowerCase();
  const shown = items.filter(
    (i) =>
      (status === "all" || (status === "open" ? i.status !== "resolved" : i.status === status)) &&
      (kind === "all" || i.kind === kind) &&
      (!q ||
        `${i.message} ${i.author ?? ""} ${i.screen ?? ""} ${i.route ?? ""}`
          .toLowerCase()
          .includes(q)),
  );

  return (
    <>
      <div className="adm-toolbar">
        <input
          type="search"
          placeholder="Search feedback"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search feedback"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          aria-label="Status"
        >
          <option value="open">Open ({items.length - count("resolved")})</option>
          <option value="unread">Unread ({count("unread")})</option>
          <option value="read">Read ({count("read")})</option>
          <option value="resolved">Resolved ({count("resolved")})</option>
          <option value="all">All ({items.length})</option>
        </select>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          aria-label="Kind"
        >
          <option value="all">Every kind</option>
          {(Object.keys(FEEDBACK_KIND_LABEL) as FeedbackKind[]).map((k) => (
            <option key={k} value={k}>
              {FEEDBACK_KIND_LABEL[k]}s
            </option>
          ))}
        </select>
      </div>
      {failure && <p className="adm-error">{failure}</p>}
      {feedback.isLoading ? (
        <p className="adm-muted">Loading…</p>
      ) : feedback.isError ? (
        <p className="adm-error">
          Feedback could not be loaded: {(feedback.error as Error).message}
        </p>
      ) : shown.length === 0 ? (
        <p className="adm-muted">
          {items.length ? "Nothing matches." : "No feedback yet. Submissions will appear here."}
        </p>
      ) : (
        <div>
          {shown.map((item) => (
            <div key={item.id} className="adm-feedback-item">
              <div className="adm-feedback-meta">
                <span className="adm-badge">{FEEDBACK_KIND_LABEL[item.kind]}</span>
                <span className="adm-badge">{FEEDBACK_STATUS_LABEL[item.status]}</span>
                <span style={{ color: "var(--scripta-ink, #123247)" }}>
                  {item.author ?? "A former member"}
                </span>
                <span>· {ago(item.createdAt)}</span>
                <span>· {item.screen || item.route || ""}</span>
              </div>
              <p>{item.message}</p>
              <FeedbackReview item={item} onReplied={refresh} />
              <div className="adm-actions" style={{ marginTop: 8 }}>
                {nextStatuses(item.status).map((next) => (
                  <Button
                    key={next}
                    disabled={move.isPending}
                    onClick={() =>
                      move.mutate({ id: item.id, status: next, about: item.message.slice(0, 60) })
                    }
                  >
                    {next === "read" && item.status === "resolved"
                      ? "Reopen"
                      : `Mark ${FEEDBACK_STATUS_LABEL[next].toLowerCase()}`}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
