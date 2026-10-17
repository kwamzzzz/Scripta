/**
 * What this clause said before, what changed, and going back.
 *
 * ---------------------------------------------------------------------------
 * A COMPARISON IS NOT A REDLINE, AND THE SCREEN SAYS SO
 * ---------------------------------------------------------------------------
 *
 * The marked-up reading shows proposals, attributed, that somebody may accept
 * or reject. This shows how two saved versions differ, with nobody's name on
 * it and nothing here to settle. They look alike and mean different things, so
 * the panel labels the difference rather than trusting the colours to carry it.
 *
 * ---------------------------------------------------------------------------
 * GOING BACK IS NOT AN UNDO, AND THE BUTTON SAYS SO
 * ---------------------------------------------------------------------------
 *
 * Restoring throws away every proposal made since. The control says how many
 * and whose before it is pressed, and the server refuses it outright unless
 * this lawyer could have rejected each of them one at a time.
 */
import { useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/primitives";
import { compareDocs, differs } from "@/lib/clause-compare";
import {
  REVISION_MEANING,
  useClauseVersions,
  useRevisionDoc,
  useVersionActions,
  type Revision,
} from "@/lib/clause-versions";
import { useTrackedClause } from "@/lib/tracked-clause";
import { C, mono, radius } from "@/lib/tokens";

const when = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? ""
    : date.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const nameOf = (revision: Revision) =>
  revision.label?.trim() ||
  (revision.kind === "baseline" ? "As received" : `Kept ${when(revision.at)}`);

export default function ClauseVersions({ clauseId }: { clauseId: string }) {
  const versions = useClauseVersions(clauseId);
  const clause = useTrackedClause(clauseId);
  const actions = useVersionActions(clauseId);
  const [against, setAgainst] = useState<string | null>(null);
  const [keeping, setKeeping] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const earlier = useRevisionDoc(against);

  const list = versions.data ?? [];
  const outstanding = clause.data?.changes.length ?? 0;
  const parts = against ? compareDocs(earlier.data ?? null, clause.data?.doc ?? null) : [];

  const run = (promise: Promise<unknown>, fallback: string) => {
    setProblem(null);
    void promise.catch((cause: unknown) =>
      setProblem(cause instanceof Error ? cause.message : fallback),
    );
  };

  return (
    <section aria-label="Versions" style={{ display: "grid", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{ color: C.secondary, font: `500 10px ${mono}`, letterSpacing: ".08em" }}>
          VERSIONS
        </span>
        <div style={{ flex: 1 }} />
        {keeping === null ? (
          <Button variant="quiet" onClick={() => setKeeping("")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <History size={13} /> Keep this version
            </span>
          </Button>
        ) : null}
      </div>

      {keeping !== null && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <input
            autoFocus
            aria-label="What to call this version"
            placeholder="What we sent on Tuesday"
            value={keeping}
            onChange={(event) => setKeeping(event.target.value)}
            style={{
              flex: 1,
              minWidth: 180,
              border: `1px solid ${C.border}`,
              borderRadius: radius.md,
              background: C.panel,
              color: C.text,
              font: "inherit",
              fontSize: 13,
              padding: "6px 9px",
            }}
          />
          <Button
            variant="primary"
            disabled={!keeping.trim() || actions.keep.isPending}
            onClick={() => {
              const label = keeping.trim();
              setKeeping(null);
              run(
                actions.keep.mutateAsync({ label, milestone: false }),
                "That version could not be kept.",
              );
            }}
          >
            Keep it
          </Button>
          <Button variant="quiet" onClick={() => setKeeping(null)}>
            Cancel
          </Button>
        </div>
      )}

      {problem && (
        <p role="alert" style={{ margin: 0, color: C.red, fontSize: 12.5, lineHeight: 1.5 }}>
          {problem}
        </p>
      )}

      {list.length === 0 && (
        <p style={{ margin: 0, color: C.muted, fontSize: 12.5 }}>
          Nothing has been kept yet. The clause as received is kept automatically when it arrives.
        </p>
      )}

      {list.map((revision) => {
        const open = against === revision.id;
        return (
          <article
            key={revision.id}
            style={{
              border: `1px solid ${open ? C.accentEdge : C.cardRule}`,
              borderRadius: radius.md,
              background: C.panel,
              padding: "9px 11px",
              display: "grid",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ color: C.text, fontSize: 12.5 }}>{nameOf(revision)}</strong>
              <span style={{ color: C.faint, fontSize: 11.5 }}>
                {revision.by} · {when(revision.at)}
              </span>
            </div>
            <p style={{ margin: 0, color: C.muted, fontSize: 11.5 }}>
              {REVISION_MEANING[revision.kind]}
            </p>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button variant="quiet" onClick={() => setAgainst(open ? null : revision.id)}>
                {open ? "Hide the comparison" : "Compare with now"}
              </Button>
              {confirming === revision.id ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={actions.restore.isPending}
                    onClick={() => {
                      setConfirming(null);
                      run(
                        actions.restore.mutateAsync(revision.id),
                        "That version could not be restored.",
                      );
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <RotateCcw size={13} /> Yes, go back
                    </span>
                  </Button>
                  <Button variant="quiet" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="quiet" onClick={() => setConfirming(revision.id)}>
                  Go back to this
                </Button>
              )}
            </div>

            {/* Said before it is pressed, in the number that matters. */}
            {confirming === revision.id && (
              <p
                style={{
                  margin: 0,
                  borderLeft: `2px solid ${C.amber}`,
                  paddingLeft: 9,
                  color: C.body,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                }}
              >
                {outstanding === 0
                  ? "Nothing is outstanding, so nothing will be discarded. The version you are on now is kept first, so this can be undone."
                  : `This discards ${outstanding} outstanding proposal${outstanding === 1 ? "" : "s"}, including anyone else's. The version you are on now is kept first, so this can be undone.`}
              </p>
            )}

            {open && (
              <div style={{ display: "grid", gap: 6 }}>
                <p style={{ margin: 0, color: C.faint, fontSize: 11.5, lineHeight: 1.5 }}>
                  How this version differs from the clause as it stands. This is a comparison, not
                  the redline — nothing here is attributed and nothing here can be accepted.
                </p>
                {earlier.isLoading ? (
                  <p style={{ margin: 0, color: C.muted, fontSize: 12.5 }}>Reading it…</p>
                ) : !differs(parts) ? (
                  <p style={{ margin: 0, color: C.muted, fontSize: 12.5 }}>
                    Identical to the clause as it stands.
                  </p>
                ) : (
                  <p
                    style={{
                      margin: 0,
                      border: `1px solid ${C.cardRule}`,
                      borderRadius: radius.md,
                      padding: "9px 11px",
                      color: C.text,
                      fontSize: 13,
                      lineHeight: 1.7,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {parts.map((part, index) =>
                      part.kind === "same" ? (
                        <span key={index}>{part.text}</span>
                      ) : part.kind === "added" ? (
                        <span key={index} style={{ color: C.green, textDecoration: "underline" }}>
                          {part.text}
                        </span>
                      ) : (
                        <span key={index} style={{ color: C.red, textDecoration: "line-through" }}>
                          {part.text}
                        </span>
                      ),
                    )}
                  </p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
