/**
 * The mark-up history: what was done to this document, step by step, and what
 * the wording said before each step.
 *
 * ---------------------------------------------------------------------------
 * WHY A SCREEN FOR THIS
 * ---------------------------------------------------------------------------
 *
 * A tracked change is visible while it is outstanding and gone the moment it is
 * settled. Accept an insertion and the words become ordinary words. So the
 * question a lawyer asks a week later — "what did we change here, and what did
 * it say before?" — had no answer anywhere in the product, and the redline tab
 * can only ever show what is still unsettled.
 *
 * This reads the versions themselves, so a change that was accepted on Tuesday
 * is still legible on Friday: the words that went in, the words that came out,
 * who did it, and when.
 *
 * Nothing here can be edited. It is a record.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EmptyState } from "@/components/primitives";
import { Card } from "@/review/ui";
import LoadError from "@/components/LoadError";
import { loadMarkupHistory, type HistoryEntry } from "@/lib/history.functions";
import { intoSittings } from "@/lib/markup-step";
import type { Clause } from "@/data/legal";
import { C } from "@/lib/tokens";

const when = (at: string) =>
  new Date(at).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const time = (at: string) =>
  new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** What a step did, in the words of the document rather than in counts. */
function Step({ entry }: { entry: HistoryEntry }) {
  const { step } = entry;
  return (
    <div className="rv-hist-step">
      <div className="rv-hist-head">
        <span className="rv-hist-time">{time(entry.at)}</span>
        <b>
          {entry.clauseNum ? `${entry.clauseNum} ` : ""}
          {entry.clauseTitle}
        </b>
        {entry.kind !== "step" && (
          <span className={`rv-hist-kind is-${entry.kind}`}>
            {entry.kind === "baseline"
              ? "as received"
              : entry.kind === "restored"
                ? "went back"
                : entry.kind === "milestone"
                  ? "milestone"
                  : "kept"}
          </span>
        )}
        {!entry.clauseId && (
          <span
            className="rv-hist-kind is-gone"
            title="The clause this version belonged to is no longer in the register — the document was read again, or the clause was removed. The record stands."
          >
            not in the register now
          </span>
        )}
      </div>

      {entry.label && <p className="rv-hist-label">{entry.label}</p>}
      {entry.note && <p className="rv-hist-note">{entry.note}</p>}

      {step.first && step.text.trim() && (
        <p className="rv-hist-wording is-first">
          {step.text}
          <span className="rv-hist-since">the version this record starts from</span>
        </p>
      )}

      {!!step.wording.length && (
        <p className="rv-hist-wording">
          {step.wording.map((seg, at) =>
            seg.k === "i" ? (
              <ins key={at}>{seg.t}</ins>
            ) : seg.k === "d" ? (
              <del key={at}>{seg.t}</del>
            ) : (
              <span key={at}>{seg.t}</span>
            ),
          )}
        </p>
      )}

      {step.settled.map((settled) => (
        <p key={settled.changeId} className="rv-hist-settled">
          <span className={settled.fate === "accepted" ? "is-accepted" : "is-rejected"}>
            {settled.fate === "accepted" ? "Accepted" : "Rejected"}
          </span>{" "}
          the {settled.kind === "insertion" ? "insertion" : "deletion"} of{" "}
          <q>{settled.text.trim()}</q>
        </p>
      ))}

      {step.proposed.map((proposed) => (
        <p key={proposed.changeId} className="rv-hist-proposed">
          Proposed {proposed.kind === "deletion" ? "removing" : "adding"}{" "}
          <q>{proposed.text.trim()}</q>
        </p>
      ))}

      {!!step.highlighted.length && (
        <p className="rv-hist-marked">
          Highlighted{" "}
          {step.highlighted.map((phrase, at) => (
            <span key={at}>
              {at ? ", " : ""}
              <mark>{phrase}</mark>
            </span>
          ))}
        </p>
      )}
      {!!step.unhighlighted.length && (
        <p className="rv-hist-marked">
          Took the highlight off{" "}
          {step.unhighlighted.map((phrase, at) => (
            <q key={at}>
              {at ? ", " : ""}
              {phrase}
            </q>
          ))}
        </p>
      )}
    </div>
  );
}

export default function HistoryTab({
  matterId,
  clauses,
}: {
  matterId: string | null;
  clauses: Clause[];
}) {
  const load = useServerFn(loadMarkupHistory);
  /** Everything, or one clause. A long document is read one clause at a time. */
  const [clauseId, setClauseId] = useState("");

  const history = useQuery({
    queryKey: ["markup-history", matterId, clauseId],
    queryFn: () => load({ data: { matterId: matterId!, ...(clauseId ? { clauseId } : {}) } }),
    enabled: !!matterId,
    retry: false,
  });

  const sittings = useMemo(
    () => intoSittings(history.data?.entries ?? []),
    [history.data?.entries],
  );

  if (!matterId) return null;
  if (history.isError)
    return (
      <LoadError
        what="history"
        error={history.error as Error}
        onRetry={() => void history.refetch()}
      />
    );

  const entries = history.data?.entries ?? [];

  return (
    <div className="rv">
      <Card
        title="Mark-up history"
        hint="Every version of every clause, and what each step did. A change stays readable here after it has been settled."
        right={
          <select
            className="rv-input"
            style={{ maxWidth: 280 }}
            value={clauseId}
            onChange={(event) => setClauseId(event.target.value)}
            aria-label="Which clause"
          >
            <option value="">Every clause</option>
            {clauses.map((clause) => (
              <option key={clause.id} value={clause.id}>
                {[clause.num, clause.title].filter(Boolean).join(" ")}
              </option>
            ))}
          </select>
        }
      >
        {history.isPending ? (
          <p className="rv-hist-quiet">Reading the record…</p>
        ) : !entries.length ? (
          <EmptyState
            title="Nothing has been marked up yet"
            body="Every edit, acceptance, rejection and highlight is written down here as it happens, and stays readable afterwards."
          />
        ) : (
          <div className="rv-hist">
            {sittings.map((sitting) => (
              <section key={sitting[0]!.id} className="rv-hist-sitting">
                <header>
                  <b>{sitting[0]!.author}</b>
                  <span>{when(sitting[sitting.length - 1]!.at)}</span>
                  <span className="rv-hist-count">
                    {sitting.length} {sitting.length === 1 ? "step" : "steps"}
                  </span>
                </header>
                {sitting.map((entry) => (
                  <Step key={entry.id} entry={entry} />
                ))}
              </section>
            ))}
            {entries.length >= 2000 && (
              <p className="rv-hist-quiet" style={{ color: C.muted }}>
                The two thousand most recent steps. Choose a clause to read further back.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
