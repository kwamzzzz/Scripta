/**
 * Scripta's pinpointed edits, shown before they touch the contract.
 *
 * Each edit is the exact words Scripta would strike and what it would put in
 * their place. The lawyer keeps or drops each one, can change the new wording,
 * and then puts the ones kept into the contract as tracked changes in their
 * own name. Nothing here settles anything: accepting is done on the mark-up,
 * like any other change.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import { C } from "@/lib/tokens";
import { refreshAfterClauseWrite } from "@/lib/tracked-clause";
import { applyEdits, type DraftedEdit } from "./edits.functions";
import { Eyebrow, Growing } from "./ui";
import "./review.css";

export default function EditsReview({
  matterId,
  issueId,
  edits: drafted,
  note,
  onApplied,
  onDiscard,
  onOpenRedline,
}: {
  matterId: string;
  issueId?: string | undefined;
  edits: DraftedEdit[];
  note: string;
  onApplied?: (() => void) | undefined;
  onDiscard: () => void;
  onOpenRedline?: (() => void) | undefined;
}) {
  const apply = useServerFn(applyEdits);
  const qc = useQueryClient();
  const [edits, setEdits] = useState(drafted);
  const [kept, setKept] = useState(() => drafted.map((e) => !e.problem));
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ applied: number; problems: string[] } | null>(null);

  const chosen = edits.map((e, i) => ({ e, i })).filter(({ e, i }) => kept[i] && e.clauseId);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await apply({
        data: {
          matterId,
          ...(issueId ? { issueId } : {}),
          edits: chosen.map(({ e }) => ({
            clauseId: e.clauseId!,
            find: e.find,
            replace: e.replace,
          })),
        },
      });
      refreshAfterClauseWrite(qc);
      setDone({
        applied: out.applied,
        problems: out.results
          .filter((r) => !r.ok)
          .map((r) => {
            const e = chosen[r.index]?.e;
            return `${e ? `${e.clauseNum}: ` : ""}${r.problem ?? "Not applied."}`;
          }),
      });
      if (out.applied) onApplied?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The edits could not be put in.");
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="rv-edits">
        <p className="rv-edits-done" role="status">
          {done.applied
            ? `${done.applied} edit${done.applied === 1 ? "" : "s"} put into the contract as tracked changes in your name. They are proposals until accepted: accept or reject them in Redline, or in the Changes pane on the Review tab.`
            : "Nothing was put in."}
        </p>
        {done.problems.map((p) => (
          <p key={p} className="rv-edits-problem">
            {p}
          </p>
        ))}
        <div className="rv-issue-actions">
          {done.applied > 0 && onOpenRedline && (
            <Button variant="primary" onClick={onOpenRedline}>
              Review and accept in Redline
            </Button>
          )}
          <Button variant="quiet" onClick={onDiscard}>
            Close
          </Button>
        </div>
      </div>
    );

  return (
    <div className="rv-edits">
      <Eyebrow color={C.accent}>SCRIPTA&apos;S EDITS · NOT YET IN THE CONTRACT</Eyebrow>
      {note && <p className="rv-edits-note">{note}</p>}
      {edits.length === 0 && (
        <p className="rv-edits-note">Scripta found nothing in the contract to change.</p>
      )}
      {edits.map((e, i) => (
        <div key={i} className={`rv-edit${e.problem ? " has-problem" : ""}`}>
          <label className="rv-edit-head">
            <input
              type="checkbox"
              checked={kept[i] ?? false}
              disabled={!!e.problem || busy}
              onChange={(ev) => setKept(kept.map((k, j) => (j === i ? ev.target.checked : k)))}
            />
            <strong>{e.clauseNum}</strong>
            {e.clauseTitle && <span className="rv-edit-title">{e.clauseTitle}</span>}
          </label>
          <div className="rv-amend-text rv-diff">
            <del>{e.find}</del> <ins>{e.replace || "(deleted)"}</ins>
          </div>
          {editing === i && (
            <Growing
              value={e.replace}
              rows={2}
              onChange={(v) => setEdits(edits.map((x, j) => (j === i ? { ...x, replace: v } : x)))}
            />
          )}
          {e.why && <p className="rv-edit-why">{e.why}</p>}
          {e.problem ? (
            <p className="rv-edits-problem">{e.problem}</p>
          ) : (
            <button
              type="button"
              className="rv-edit-change"
              onClick={() => setEditing(editing === i ? null : i)}
            >
              {editing === i ? "Done" : "Change the new wording"}
            </button>
          )}
        </div>
      ))}
      {error && <p className="rv-edits-problem">{error}</p>}
      <div className="rv-issue-actions">
        <Button variant="primary" disabled={busy || !chosen.length} onClick={() => void run()}>
          {busy
            ? "Putting them in…"
            : `Put ${chosen.length} into the contract as tracked change${chosen.length === 1 ? "" : "s"}`}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}
