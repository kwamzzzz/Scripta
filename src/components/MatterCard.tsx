/**
 * A matter, as a file.
 *
 * This used to be the review card: it called `nextMoves()`, whose every
 * suggestion is Contract Review vocabulary — open the contract editor, run the
 * analysis, continue the review — and it counted clauses. So a matter opened to
 * produce a board resolution was described, on its own card, in the language of
 * a tool it was not using.
 *
 * A matter is neutral as to which Workflow Tools are at work in it. What
 * belongs on the card is what a lawyer needs to identify a file and decide to
 * enter it: whose it is, who it is against, where it stands, who is leading it,
 * what happens next, and roughly how much is inside. Which tools are in use is
 * a fact about the file, and it is shown once the file is open.
 *
 * There is no button. A file has exactly one thing you do with it, so the whole
 * card opens the matter.
 */
import { useNavigate } from "@tanstack/react-router";
import { longDate, relTime, stageOf, type BoardMatter, type NextMove } from "@/lib/home-data";
import { useUnseenMentions } from "@/lib/unseen-mentions";

import "./matter-card.css";

export type MatterCounts = {
  tasks: number;
  deliverables: number;
  documents: number;
};

export type MatterNext = {
  label: string;
  /** ISO date. The card says when, not how long ago. */
  on: string | null;
};

export function useOpenMatter() {
  const navigate = useNavigate();
  return (matterId: string, move?: NextMove | { screen?: string }) =>
    navigate({
      to: "/matters/$matterId",
      params: { matterId },
      search: {
        // A file opens at its cover page. A tool asks for its own screen.
        screen: (move?.screen ?? "matter") as never,
        clause: "clause" in (move ?? {}) ? (move as NextMove).clause : undefined,
        res: "res" in (move ?? {}) ? (move as NextMove).res : undefined,
        rule: undefined,
      },
    });
}

export default function MatterCard({
  m,
  counts,
  next,
  compact = false,
}: {
  m: BoardMatter;
  /** What is inside. Absent while the counts are still being read. */
  counts?: MatterCounts | undefined;
  /** The nearest thing owed, from a task or a flow deadline — whichever is sooner. */
  next?: MatterNext | undefined;
  compact?: boolean;
}) {
  const open = useOpenMatter();
  const unseen = useUnseenMentions();
  const mentioned = unseen.data?.has(m.id) ?? false;
  const parts = [
    counts?.tasks ? `${counts.tasks} ${counts.tasks === 1 ? "task" : "tasks"}` : "",
    counts?.deliverables
      ? `${counts.deliverables} ${counts.deliverables === 1 ? "deliverable" : "deliverables"}`
      : "",
    m.docs.length ? `${m.docs.length} ${m.docs.length === 1 ? "document" : "documents"}` : "",
  ].filter(Boolean);

  return (
    <article className={`matter-file${compact ? " is-compact" : ""}`}>
      {/* The whole card is the control. The heading carries the accessible name
          so a screen reader announces the matter, not "button". */}
      <button type="button" className="matter-file-open" onClick={() => void open(m.id)}>
        <span className="sr-only">Open {m.name}</span>
      </button>

      {/* The reference is the one piece of typography a legal file genuinely
          has: quiet metadata above the name, with tabular figures so a column
          of references lines up. */}
      <div className="matter-file-ref">
        {m.reference || "No reference"}
        {m.matterType ? <span> · {m.matterType}</span> : null}
        {/* A quiet marker, not a count. Somebody named you in this file after
            you last opened it; opening it clears the dot. There is no number
            here on purpose — a number is the first step towards an inbox, and
            the inbox is the thing Phase 4 refused to build. */}
        {mentioned && (
          <span className="matter-file-mentioned" aria-hidden="false">
            <span className="sr-only">You were mentioned in this matter</span>
          </span>
        )}
      </div>

      <h3>{m.name}</h3>

      <dl className="matter-file-parties">
        <dt>Client</dt>
        <dd>{m.client || "Not recorded"}</dd>
        {m.counterparty && (
          <>
            <dt>Counterparty</dt>
            <dd>{m.counterparty}</dd>
          </>
        )}
      </dl>

      <div className="matter-file-state">
        <span className="matter-file-stage">{stageOf(m)}</span>
        {m.isSample && <span className="matter-file-sample">Sample</span>}
      </div>

      {next?.label && (
        <div className="matter-file-next">
          <span>Next</span>
          <strong>{next.label}</strong>
          {next.on && <em>{longDate(next.on)}</em>}
        </div>
      )}

      <footer>
        <span className="matter-file-lead">{m.ownerName || "Unassigned"}</span>
        <span className="matter-file-updated">
          Updated {relTime(m.lastEvent?.at ?? m.updatedAt)}
        </span>
      </footer>

      {parts.length > 0 && <div className="matter-file-counts">{parts.join(" · ")}</div>}
    </article>
  );
}
