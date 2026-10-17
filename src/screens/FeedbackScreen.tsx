import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { C, mono, radius } from "@/lib/tokens";
import { SectionLabel } from "@/components/praxis";
import "./administration.css";
import { Button, EmptyState } from "@/components/primitives";
import AppShell, { Crumbs } from "@/components/AppShell";
import { useApp } from "@/store/app";
import { useWorkspaceRole } from "@/lib/workspace-role";
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_STATUS_LABEL,
  canReviewFeedback,
  nextStatuses,
  type FeedbackStatus,
} from "@/lib/feedback";
import { listFeedback, setFeedbackStatus, type FeedbackItem } from "@/lib/feedback.functions";
import FeedbackReview from "@/components/FeedbackReview";

/**
 * The feedback admins read.
 *
 * It lives under Settings because that is where the workspace is administered,
 * and it is deliberately absent from the icon rail: this is a housekeeping
 * screen for the two roles that run the workspace, not a place of work. The
 * role check below decides what to draw; the `feedback` table's policies decide
 * what a caller can actually read, so a lawyer who types the URL sees an
 * explanation rather than someone else's words.
 */

const STATUS_TONE: Record<FeedbackStatus, { fg: string; bg: string; edge: string }> = {
  unread: { fg: C.accent, bg: C.accentTint, edge: C.accentEdge },
  read: { fg: C.secondary, bg: C.sunken, edge: C.cardRule },
  resolved: { fg: C.green, bg: "#E9F1EC", edge: "#CBDFD3" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function Tag({
  children,
  tone,
}: {
  children: string;
  tone: { fg: string; bg: string; edge: string };
}) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: radius.sm,
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.edge}`,
      }}
    >
      {children}
    </span>
  );
}

export default function FeedbackScreen() {
  const { workspace } = useApp();
  const { role, loading: roleLoading } = useWorkspaceRole();
  const qc = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  const mayReview = canReviewFeedback(role);

  const feedback = useQuery({
    queryKey: ["feedback", workspace?.id],
    enabled: !!workspace && mayReview,
    queryFn: async () => (await listFeedback({ data: { workspaceId: workspace!.id } })).items,
  });

  const move = useMutation({
    mutationFn: (input: { id: string; status: FeedbackStatus }) =>
      setFeedbackStatus({ data: input }),
    onMutate: () => setFailure(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback", workspace?.id] }),
    onError: (cause: unknown) =>
      setFailure(
        cause instanceof Error ? cause.message : "That status change did not save. Try again.",
      ),
  });

  const items = feedback.data ?? [];
  const unread = items.filter((i) => i.status === "unread").length;

  return (
    <AppShell
      section="settings"
      scroll={false}
      trackLabel="Feedback"
      back={{ label: "Settings", href: "/settings" }}
      breadcrumb={
        <Crumbs items={[{ label: "Settings", to: "/settings" }, { label: "Feedback" }]} />
      }
    >
      <div className="scripta-page admin-page feedback-page">
        <header className="scripta-page-heading">
          <div>
            <h1 className="scripta-page-title">Workspace feedback</h1>
            <p className="scripta-page-description">
              Read and follow up on feedback from your colleagues.
            </p>
          </div>
          {!roleLoading && mayReview && !feedback.isLoading && !feedback.isError && (
            <span className="feedback-total">
              {items.length} received{unread > 0 ? ` · ${unread} unread` : ""}
            </span>
          )}
        </header>
        {roleLoading ? (
          <p role="status">Checking access…</p>
        ) : !mayReview ? (
          <p className="scripta-page-description">
            Only owners and administrators of {workspace?.name ?? "this workspace"} can review its
            feedback.
          </p>
        ) : feedback.isError ? (
          <div role="alert" className="admin-error">
            <p>
              Could not load feedback:{" "}
              {feedback.error instanceof Error ? feedback.error.message : "unknown error"}.
            </p>
            <Button onClick={() => void feedback.refetch()}>Try again</Button>
          </div>
        ) : feedback.isLoading ? (
          <p role="status">Loading feedback…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No feedback yet"
            body="Feedback submitted from the toolbar will appear here."
          />
        ) : (
          <div className="feedback-list">
            {failure && (
              <div role="alert" className="admin-error">
                {failure}
              </div>
            )}
            {items.map((item) => (
              <Row
                key={item.id}
                item={item}
                busy={move.isPending && move.variables?.id === item.id}
                onMove={(status) => move.mutate({ id: item.id, status })}
                onReplied={() =>
                  void qc.invalidateQueries({ queryKey: ["feedback", workspace?.id] })
                }
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Row({
  item,
  busy,
  onMove,
  onReplied,
}: {
  item: FeedbackItem;
  busy: boolean;
  onMove: (status: FeedbackStatus) => void;
  onReplied: () => void;
}) {
  const tone = STATUS_TONE[item.status];
  return (
    <article className="feedback-row">
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 7 }}
      >
        <Tag tone={{ fg: C.secondary, bg: C.sunken, edge: C.cardRule }}>
          {FEEDBACK_KIND_LABEL[item.kind]}
        </Tag>
        <Tag tone={tone}>{FEEDBACK_STATUS_LABEL[item.status]}</Tag>
        <span style={{ fontSize: 13, color: C.text }}>{item.author ?? "A former member"}</span>
        <span style={{ fontSize: 12, color: C.faint }}>· {when(item.createdAt)}</span>
      </div>

      <div style={{ fontSize: 13.5, color: C.body, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
        {item.message}
      </div>
      <FeedbackReview item={item} onReplied={onReplied} />

      <div
        style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <SectionLabel>Sent from</SectionLabel>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            {item.screen || "Unnamed screen"}{" "}
            <span style={{ fontFamily: mono, fontSize: 11.5, color: C.faint }}>
              {item.route || "route not recorded"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {nextStatuses(item.status).map((next) => (
            <Button key={next} disabled={busy} onClick={() => onMove(next)}>
              {next === "read" && item.status === "resolved"
                ? "Reopen"
                : `Mark ${FEEDBACK_STATUS_LABEL[next].toLowerCase()}`}
            </Button>
          ))}
        </div>
      </div>
    </article>
  );
}
