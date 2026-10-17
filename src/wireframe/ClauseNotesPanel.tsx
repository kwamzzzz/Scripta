/**
 * The discussion on the selected clause.
 *
 * This used to be a notes list with its own composer and its own idea of who
 * could delete what — a fourth comment box, next to the matter's, the task
 * panel's and the research finding's. It is now the same <Thread> as everywhere
 * else, which is what gives a clause replies, resolve, an edit that says it was
 * edited, and a Viewer who reads without a composer.
 *
 * The panel keeps the chrome and nothing else: a clause rail is a place, and
 * the conversation inside it is not this component's business.
 *
 * Instructions are still the panel next door. A note is a record for whoever
 * reads the matter later; an instruction is handed to the redraft. They share
 * the comments table and are told apart by `kind`, which is why Thread renders
 * an INSTRUCTION marker rather than hiding them.
 */
import { useState } from "react";
import { X } from "lucide-react";
import Thread from "@/components/Thread";
import ClauseReadings from "@/components/ClauseReadings";
import ClauseVersions from "@/components/ClauseVersions";
import { useTrackedClause } from "@/lib/tracked-clause";
import { anchorText } from "@/wireframe/tracked-change";

export default function ClauseNotesPanel({
  clauseId,
  clauseLabel,
  workspaceId,
  onClose,
}: {
  clauseId: string | null;
  clauseLabel: string | null;
  workspaceId: string | null | undefined;
  onClose: () => void;
}) {
  /* Already in the cache — the readings above render from the same query — so
     this costs nothing and gives each note the words it is about. */
  const clause = useTrackedClause(clauseId);
  const doc = clause.data?.doc ?? null;
  /* Folded away by default. History is what a lawyer goes looking for, not
     what they need in front of them while reading the clause. */
  const [history, setHistory] = useState(false);

  return (
    <aside className="ce-instructions-panel ce-notes-panel" aria-label="Notes">
      <header>
        <div>
          <strong>Notes</strong>
          <span>
            {clauseLabel
              ? `${clauseLabel} · kept on the matter, off the document`
              : "Select a clause to read or add its notes"}
          </span>
        </div>
        <button type="button" aria-label="Close notes" onClick={onClose}>
          <X />
        </button>
      </header>
      <div className="ce-instructions-list">
        {clauseId && (
          <div style={{ marginBottom: 16 }}>
            <ClauseReadings
              clauseId={clauseId}
              clauseLabel={clauseLabel ?? undefined}
              workspaceId={workspaceId}
            />
            <div style={{ marginTop: 11 }}>
              <button
                type="button"
                onClick={() => setHistory((was) => !was)}
                style={{
                  border: 0,
                  background: "transparent",
                  color: "var(--wf-accent, #7a5cff)",
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 12,
                  padding: 0,
                }}
              >
                {history ? "Hide earlier versions" : "Earlier versions"}
              </button>
            </div>
            {history && (
              <div style={{ marginTop: 11 }}>
                <ClauseVersions clauseId={clauseId} />
              </div>
            )}
          </div>
        )}
        {clauseId ? (
          <Thread
            kind="clause"
            entityId={clauseId}
            workspaceId={workspaceId}
            anchorFor={doc ? (commentId) => anchorText(doc, commentId) : undefined}
            title="Notes on this clause"
            blurb="A question for the client, a reason you left wording alone. Nothing here is sent to the redraft."
            reviewLabel={clauseLabel ? `Review: ${clauseLabel}` : "Review this clause"}
          />
        ) : (
          <p className="ce-instructions-empty">Select a clause to read or add its notes.</p>
        )}
      </div>
    </aside>
  );
}
