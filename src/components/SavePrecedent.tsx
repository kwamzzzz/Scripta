/**
 * Keeping a piece of drafting that worked.
 *
 * A precedent is drafting that has actually been used, so it is almost always
 * captured from work rather than invented in a library. Wherever Scripta holds
 * drafting worth keeping — a negotiated clause, a resolution's authority
 * wording, a finished agreement — this is the same dialog, and it arrives
 * already knowing the matter, the document, the side acted for and the type of
 * agreement, because Scripta knew all of that a moment ago.
 *
 * What it still asks is the part only the lawyer knows: how far the drafting
 * got, and why it is worth keeping.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import { useApp } from "@/store/app";
import { C } from "@/lib/tokens";
import {
  KIND_LABEL,
  PRECEDENT_STATUSES,
  STATUS_LABEL,
  capturePrecedent,
  similarPrecedents,
  type PrecedentCapture,
  type PrecedentStatus,
} from "@/lib/precedents";
import "./save-precedent.css";

/** What the calling screen already knows. Everything optional is pre-filled. */
export type PrecedentDraft = Omit<PrecedentCapture, "workspaceId" | "status">;

export function SavePrecedentDialog({
  draft,
  onClose,
  onSaved,
}: {
  draft: PrecedentDraft;
  onClose: () => void;
  onSaved?: ((id: string) => void) | undefined;
}) {
  const { workspaceId } = useApp();
  const [title, setTitle] = useState(draft.title);
  const [status, setStatus] = useState<PrecedentStatus>("negotiated");
  const [why, setWhy] = useState(draft.whyUseful ?? "");
  const [ourRole, setOurRole] = useState(draft.ourRole ?? "");
  const [clauseType, setClauseType] = useState(draft.clauseType ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setTitle(draft.title), [draft.title]);

  // Drafting already kept that looks like this. Shown, never enforced: the
  // same clause negotiated twice is two precedents worth having.
  const similar = useQuery({
    queryKey: ["precedent-similar", workspaceId, clauseType, title],
    queryFn: () => similarPrecedents(workspaceId!, { title, clauseType }),
    enabled: !!workspaceId && (title.trim().length > 3 || clauseType.trim().length > 0),
  });

  const save = useMutation({
    mutationFn: () =>
      capturePrecedent({
        ...draft,
        workspaceId: workspaceId!,
        title,
        status,
        whyUseful: why,
        ourRole,
        clauseType,
      }),
    onSuccess: (id) => {
      onSaved?.(id);
      onClose();
    },
    onError: (cause) => setError((cause as Error).message),
  });

  const words = draft.body.trim().split(/\s+/).filter(Boolean).length;

  return (
    <Modal open onClose={onClose} label="Save as precedent">
      <form
        className="sp-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) save.mutate();
        }}
      >
        <div className="sp-head">
          <strong>Save as precedent</strong>
          <span>
            {KIND_LABEL[draft.kind]} · {words} word{words === 1 ? "" : "s"}
          </span>
        </div>
        <p className="sp-intro">
          A precedent is drafting you would reach for again. Scripta keeps where it came from, so
          you can always ask why this wording was used.
        </p>

        <label className="sp-field">
          What to call it
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        </label>

        <div className="sp-row">
          <label className="sp-field">
            Clause or topic
            <input
              value={clauseType}
              onChange={(e) => setClauseType(e.target.value)}
              placeholder="Limitation of liability"
            />
          </label>
          <label className="sp-field">
            We acted for
            <input
              value={ourRole}
              onChange={(e) => setOurRole(e.target.value)}
              placeholder="Customer"
            />
          </label>
        </div>

        <div className="sp-field">
          How far did it get?
          <div className="sp-statuses" role="radiogroup" aria-label="Status">
            {PRECEDENT_STATUSES.filter((s) => s !== "superseded").map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={status === value}
                className={`sp-status${status === value ? " is-on" : ""}`}
                onClick={() => setStatus(value)}
              >
                {STATUS_LABEL[value]}
              </button>
            ))}
          </div>
          <span className="sp-help">
            Executed wording carries more weight than wording somebody once typed.
          </span>
        </div>

        <label className="sp-field">
          Why it is worth keeping
          <textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            rows={2}
            placeholder="Negotiated a 12-month fee cap with carve-outs for fraud and wilful misconduct."
          />
        </label>

        {(draft.matterId || draft.agreementType || draft.jurisdiction) && (
          <div className="sp-known">
            Scripta will keep:{" "}
            {[
              draft.agreementType,
              draft.jurisdiction,
              draft.matterId ? "a link back to the matter it came from" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}

        {(similar.data?.length ?? 0) > 0 && (
          <div className="sp-similar">
            <strong>You have kept drafting like this before</strong>
            <ul>
              {(similar.data ?? []).slice(0, 3).map((p) => (
                <li key={p.id}>
                  {p.title}
                  <span> · {STATUS_LABEL[p.status]}</span>
                </li>
              ))}
            </ul>
            <span>Keeping this one as well is often right. Nothing is replaced.</span>
          </div>
        )}

        {error && (
          <div role="alert" className="sp-error">
            {error}
          </div>
        )}

        <div className="sp-actions">
          <div style={{ flex: 1, color: C.muted, fontSize: 11.5 }}>
            {save.isPending ? "Saving…" : ""}
          </div>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!title.trim() || save.isPending}>
            Save precedent
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * `const { save, dialog } = useSavePrecedent();` — call `save(draft)` from a
 * menu or a button, render `dialog` once.
 */
export function useSavePrecedent(onSaved?: (id: string) => void) {
  const [draft, setDraft] = useState<PrecedentDraft | null>(null);
  return {
    save: (next: PrecedentDraft) => setDraft(next),
    dialog: draft ? (
      <SavePrecedentDialog
        draft={draft}
        onClose={() => setDraft(null)}
        {...(onSaved ? { onSaved } : {})}
      />
    ) : null,
  };
}
