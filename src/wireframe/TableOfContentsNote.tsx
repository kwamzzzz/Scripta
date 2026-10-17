import { useState } from "react";
import { ListOrdered, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import type { Clause } from "@/data/legal";
import { clauseLevel, isUnnamedSubclause, showsTitle } from "@/lib/export/structure";
import {
  applySubclauseHeadings,
  proposeSubclauseHeadings,
  type HeadingProposal,
} from "@/lib/subclause-headings.functions";

/**
 * What the table of contents will list, and the sub-clauses with no heading.
 *
 * The table lives in the exports, not here — the editor is for the words.
 * Every section and every sub-clause is listed; one with no heading is listed
 * by its opening words, which reads as a sentence cut short. So the editor
 * says how many are in that state and offers to fill the gaps: on
 * request Scripta proposes a heading for every unnamed sub-clause, and the
 * lawyer edits, keeps or drops each before any is applied. Nothing is written
 * until they apply, and every heading applied is a rename in the audit trail.
 */

type Row = HeadingProposal & { keep: boolean };

const clauseText = (c: Clause) =>
  c.segs
    .filter((s) => s.k !== "d")
    .map((s) => s.t)
    .join("");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function TableOfContentsNote({
  matterId,
  clauses,
  onChanged,
}: {
  matterId: string;
  clauses: Clause[];
  onChanged: () => void;
}) {
  const propose = useServerFn(proposeSubclauseHeadings);
  const apply = useServerFn(applySubclauseHeadings);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<"proposing" | "applying" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null);

  const listed = (level: number) =>
    clauses.filter(
      (c) =>
        c.num.trim() &&
        clauseLevel(c.num) === level &&
        showsTitle({ num: c.num, title: c.title, segs: c.segs }),
    ).length;
  const sections = listed(0);
  const named = listed(1);
  const unnamed = clauses.filter((c) => isUnnamedSubclause(c, clauseText(c))).length;

  const ask = async () => {
    setBusy("proposing");
    setError(null);
    setApplied(null);
    try {
      const proposals = await propose({ data: { matterId } });
      if (!proposals.length) {
        setError("Every sub-clause already has a heading.");
        return;
      }
      setRows(proposals.map((p) => ({ ...p, keep: p.title.trim() !== "" })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Headings could not be proposed.");
    } finally {
      setBusy(null);
    }
  };

  const kept = (rows ?? []).filter((r) => r.keep && r.title.trim());

  const applyKept = async () => {
    if (!kept.length) return;
    setBusy("applying");
    setError(null);
    try {
      const result = await apply({
        data: { matterId, headings: kept.map((r) => ({ clauseId: r.clauseId, title: r.title })) },
      });
      setApplied(result.applied);
      setRows(null);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The headings could not be applied.");
    } finally {
      setBusy(null);
    }
  };

  const edit = (clauseId: string, patch: Partial<Row>) =>
    setRows((current) =>
      current ? current.map((r) => (r.clauseId === clauseId ? { ...r, ...patch } : r)) : current,
    );

  return (
    <section className="ce-toc-note" aria-label="Table of contents">
      <div className="ce-toc-note-row">
        <ListOrdered className="ce-toc-note-icon" aria-hidden="true" />
        <div className="ce-toc-note-copy">
          <strong>Table of contents</strong>
          <span className="ce-toc-note-where"> · in the Word and PDF copies</span>
          <p>
            {plural(sections, "section")} and {plural(named + unnamed, "sub-clause")} will be
            listed.
            {unnamed > 0 &&
              ` ${plural(unnamed, "sub-clause")} ${unnamed === 1 ? "has" : "have"} no heading, and ${unnamed === 1 ? "is" : "are"} listed by ${unnamed === 1 ? "its" : "their"} opening words.`}
          </p>
        </div>
        {unnamed > 0 && !rows && (
          <button
            className="ce-front-edit"
            type="button"
            disabled={busy !== null}
            onClick={() => void ask()}
          >
            <Sparkles aria-hidden="true" />
            {busy === "proposing" ? "Proposing…" : "Name them with Scripta"}
          </button>
        )}
      </div>
      {applied !== null && (
        <p className="ce-toc-note-done" role="status">
          {plural(applied, "sub-clause")} headed. {applied === 1 ? "It" : "They"} will be listed by
          name from the next export.
        </p>
      )}
      {error && (
        <p className="ce-front-error" role="alert">
          {error}
        </p>
      )}
      {rows && (
        <div className="ce-toc-proposals">
          <p className="ce-toc-proposals-lead">
            Proposed headings. Edit any, untick any you do not want, then apply. Nothing is saved
            until you do.
          </p>
          <ul>
            {rows.map((r) => (
              <li key={r.clauseId} className={r.keep ? "" : "is-dropped"}>
                <input
                  type="checkbox"
                  checked={r.keep}
                  aria-label={`Keep the heading for sub-clause ${r.num}`}
                  onChange={(event) => edit(r.clauseId, { keep: event.target.checked })}
                />
                <span className="ce-toc-num">{r.num}</span>
                <div className="ce-toc-proposal">
                  <input
                    className="ce-toc-title"
                    value={r.title}
                    placeholder="Heading"
                    aria-label={`Heading for sub-clause ${r.num}`}
                    onChange={(event) => edit(r.clauseId, { title: event.target.value })}
                  />
                  <small>{r.opening}…</small>
                </div>
              </li>
            ))}
          </ul>
          <div className="ce-front-actions">
            <button
              className="ce-front-save"
              type="button"
              disabled={busy !== null || !kept.length}
              onClick={() => void applyKept()}
            >
              {busy === "applying" ? "Applying…" : `Apply ${plural(kept.length, "heading")}`}
            </button>
            <button
              className="ce-front-cancel"
              type="button"
              disabled={busy !== null}
              onClick={() => setRows(null)}
            >
              Cancel
            </button>
            <span className="ce-front-hint">Each is a rename you will see in the audit trail.</span>
          </div>
        </div>
      )}
    </section>
  );
}
