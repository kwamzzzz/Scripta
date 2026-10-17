/**
 * A matter, as Contract Review sees it.
 *
 * This is where `nextMoves()` belongs and where it now lives. Its whole
 * vocabulary — open the contract editor, generate the review, run the analysis,
 * continue with the open clauses — is about one tool, so it is drawn by that
 * tool rather than by the file. A matter opened to produce a board resolution
 * never sees any of it.
 *
 * Reviewing is also the one place where clause counts mean something, so they
 * are here too rather than on the file card.
 */
import { Button } from "@/components/primitives";
import { useOpenMatter } from "@/components/MatterCard";
import { counts, nextMoves, relTime, stageOf, type BoardMatter } from "@/lib/home-data";
import { riskColors } from "@/lib/tokens";

import "@/components/matter-card.css";

export default function ReviewMatterCard({
  m,
  compact = false,
}: {
  m: BoardMatter;
  compact?: boolean;
}) {
  const open = useOpenMatter();
  const c = counts(m);
  const moves = nextMoves(m);

  return (
    <article className={`review-matter${compact ? " is-compact" : ""}`}>
      <header>
        <h3>
          <button type="button" onClick={() => void open(m.id, { screen: "review" })}>
            {m.name}
          </button>
        </h3>
      </header>
      {[m.client, m.counterparty].some(Boolean) && (
        <p className="review-matter-parties">
          {[m.client, m.counterparty].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="review-matter-stage">{stageOf(m)}</div>
      {c.clauses > 0 && (
        <div className="review-matter-counts">
          <span>{c.clauses} clauses</span>
          {c.escalated > 0 && (
            <span>
              <i aria-hidden="true" style={{ background: riskColors.High }} />
              {c.escalated} escalated
            </span>
          )}
          {c.open > 0 && (
            <span>
              <i aria-hidden="true" style={{ background: riskColors.Medium }} />
              {c.open} open
            </span>
          )}
        </div>
      )}
      {m.lastEvent && (
        <p className="review-matter-updated">
          Updated {relTime(m.lastEvent.at)} by {m.lastEvent.by}
        </p>
      )}
      {moves.length > 0 && !compact && (
        <div className="review-matter-actions">
          {moves.slice(0, 2).map((move) => (
            <Button
              key={move.label}
              variant={move.primary ? "primary" : "secondary"}
              onClick={() => void open(m.id, move)}
            >
              {move.label}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}
