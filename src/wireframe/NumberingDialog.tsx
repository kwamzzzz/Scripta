/**
 * Numbering: put right a contract whose own numbering is wrong.
 *
 * Renumbering changes the number Scripta uses everywhere (the contents, the
 * review, the assistant, the export), so "clause 1" means the same clause to
 * the lawyer and to Scripta. Parts move with their clause, links between
 * clauses follow, and wording that still cites an old number is raised in
 * Issues rather than rewritten. The document's own numbering can be put back.
 */
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/primitives";
import { Modal } from "@/wireframe/screens";
import type { Clause } from "@/data/legal";
import { numberingGaps } from "@/lib/conformity";
import { cascade, renumberPlan, type Change } from "@/lib/renumber";
import { renumberClauses } from "@/review/renumber.functions";
import "@/components/organise.css";
import "./numbering.css";

type Mode = "home" | "order" | "edit";

export default function NumberingDialog({
  matterId,
  clauses,
  onClose,
  onDone,
}: {
  matterId: string;
  clauses: Clause[];
  onClose: () => void;
  onDone: () => void;
}) {
  const run = useServerFn(renumberClauses);
  const [mode, setMode] = useState<Mode>("home");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const rows = useMemo(() => clauses.map((c) => ({ id: c.id, num: c.num })), [clauses]);
  const gaps = useMemo(
    () =>
      numberingGaps(
        clauses.map((c) => ({ id: c.id, num: c.num, title: c.title, refs: [], text: "" })),
      ),
    [clauses],
  );
  const plan = useMemo(() => renumberPlan(rows), [rows]);
  const renumbered = clauses.filter((c) => c.documentNum);
  const byId = new Map(clauses.map((c) => [c.id, c]));

  // The edits as they will land, parts following their clause.
  const pending = useMemo((): { changes: Change[]; problem: string | null } => {
    const list = Object.entries(edits)
      .filter(([id, to]) => to.trim() && to.trim() !== byId.get(id)?.num)
      .map(([id, to]) => ({ id, to: to.trim() }));
    if (!list.length) return { changes: [], problem: null };
    try {
      return { changes: cascade(rows, list), problem: null };
    } catch (e) {
      return {
        changes: [],
        problem: e instanceof Error ? e.message : "Those numbers do not work.",
      };
    }
    // byId is derived from clauses, which rows already tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, rows]);

  const apply = async (input: {
    matterId: string;
    mode: "sequential" | "edits" | "reset";
    edits?: { id: string; to: string }[];
  }) => {
    setBusy(true);
    setError(null);
    try {
      const out = await run({ data: input });
      setResult(
        [
          !out.changed
            ? "Nothing needed renumbering."
            : input.mode === "reset"
              ? `${out.changed} clause${out.changed === 1 ? "" : "s"} back to the document's numbering.`
              : `${out.changed} clause${out.changed === 1 ? "" : "s"} renumbered.`,
          out.stale
            ? `${out.stale} place${out.stale === 1 ? "" : "s"} in the wording still cite${out.stale === 1 ? "s" : ""} an old number: raised in Issues.`
            : "",
          out.gaps
            ? `${out.gaps} gap${out.gaps === 1 ? "" : "s"} in the numbering remain.`
            : "The numbering now runs in order.",
        ]
          .filter(Boolean)
          .join(" "),
      );
      setMode("home");
      setEdits({});
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The numbering was not changed.");
    } finally {
      setBusy(false);
    }
  };

  const changeList = (changes: Change[]) => (
    <ul className="nb-changes">
      {changes.map((c) => (
        <li key={c.id}>
          <span className="nb-from">{c.from}</span>
          <span aria-hidden>→</span>
          <span className="nb-to">{c.to}</span>
          <span className="nb-title">{byId.get(c.id)?.title}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <Modal open onClose={onClose} label="Numbering">
      <div className="org-dialog nb">
        <h2>Numbering</h2>
        <p>
          Renumbering changes the number Scripta uses everywhere: the contents, the review, the
          assistant and the export. Parts move with their clause and links between clauses follow.
          Wording that still cites an old number is raised in Issues for you to correct; it is never
          rewritten behind you.
        </p>
        {result && (
          <p className="nb-result" role="status">
            {result}
          </p>
        )}
        {error && <p className="org-error">{error}</p>}

        {mode === "home" && (
          <>
            <section className="nb-section">
              <h3>What the numbering does now</h3>
              {gaps.length ? (
                <ul className="nb-gaps">
                  {gaps.map((g) => (
                    <li key={g.title}>{g.title}</li>
                  ))}
                </ul>
              ) : (
                <p className="nb-muted">It runs in order, with nothing skipped.</p>
              )}
            </section>
            <div className="org-actions" style={{ justifyContent: "flex-start" }}>
              <Button
                variant="primary"
                disabled={!plan.length || busy}
                onClick={() => setMode("order")}
              >
                Renumber in order{plan.length ? ` (${plan.length})` : ""}
              </Button>
              <Button disabled={busy} onClick={() => setMode("edit")}>
                Change numbers myself
              </Button>
              {renumbered.length > 0 && (
                <Button disabled={busy} onClick={() => void apply({ matterId, mode: "reset" })}>
                  Back to the document's numbering
                </Button>
              )}
              <div style={{ flex: 1 }} />
              <Button onClick={onClose}>Close</Button>
            </div>
          </>
        )}

        {mode === "order" && (
          <>
            <section className="nb-section">
              <h3>
                These {plan.length} clause{plan.length === 1 ? "" : "s"} will be renumbered
              </h3>
              {changeList(plan)}
            </section>
            <div className="org-actions">
              <Button onClick={() => setMode("home")}>Back</Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void apply({ matterId, mode: "sequential" })}
              >
                {busy ? "Renumbering…" : "Renumber"}
              </Button>
            </div>
          </>
        )}

        {mode === "edit" && (
          <>
            <section className="nb-section">
              <h3>Type the number each clause should have</h3>
              <p className="nb-muted">
                A clause's parts follow it: give clause 2 the number 1 and 2.4 becomes 1.4, unless
                you number it yourself.
              </p>
              <div className="nb-edit">
                {clauses.map((c) => (
                  <label
                    key={c.id}
                    className={`nb-row depth-${Math.min(c.num.split(".").length - 1, 3)}`}
                  >
                    <input
                      value={edits[c.id] ?? c.num}
                      aria-label={`Number for ${c.title}`}
                      onChange={(e) => setEdits({ ...edits, [c.id]: e.target.value })}
                    />
                    <span className="nb-title">{c.title}</span>
                    {c.documentNum && <span className="nb-muted">Document: {c.documentNum}</span>}
                  </label>
                ))}
              </div>
            </section>
            {pending.problem && <p className="org-error">{pending.problem}</p>}
            {pending.changes.length > 0 && (
              <section className="nb-section">
                <h3>This will change</h3>
                {changeList(pending.changes)}
              </section>
            )}
            <div className="org-actions">
              <Button
                onClick={() => {
                  setEdits({});
                  setMode("home");
                }}
              >
                Back
              </Button>
              <Button
                variant="primary"
                disabled={busy || !pending.changes.length || !!pending.problem}
                onClick={() =>
                  void apply({
                    matterId,
                    mode: "edits",
                    edits: Object.entries(edits)
                      .filter(([id, to]) => to.trim() && to.trim() !== byId.get(id)?.num)
                      .map(([id, to]) => ({ id, to: to.trim() })),
                  })
                }
              >
                {busy
                  ? "Saving…"
                  : `Save ${pending.changes.length || ""} change${pending.changes.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
