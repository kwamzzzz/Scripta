/**
 * One card, for every collection that has one.
 *
 * Contract Review is the reference screen, and its card — name, who it is
 * with, the state it is in, when it last moved — is the shape a person scans.
 * Before this, only four collections offered Cards at all and each would have
 * grown its own card the moment it did, which is how eight slightly different
 * cards happen.
 *
 * `MatterCard` stays as it is: it carries matter-specific content (clause
 * counts, next moves) that no other collection has, and it is the screen
 * everything else is being measured against. This is the card for the rest.
 *
 * The classes are the existing `.scripta-matter-*` ones in library.css. They
 * are already shared — it is only the name that says otherwise — and renaming
 * sixteen rules would change nothing a user can see.
 */
import type { ReactNode } from "react";

export type LibraryCardProps = {
  title: string;
  /** Opening the record. The title is the control, as on the reference card. */
  onOpen: () => void;
  /** Who or what it is with, read under the title. */
  subtitle?: string | undefined;
  /**
   * Where it has got to. A node, not a string, so a card can show the same
   * StatusPill its table row shows — otherwise one screen says a status two
   * ways depending on which view you are in.
   */
  state?: ReactNode | undefined;
  /** Short counts and labels. Dropped in the denser board card. */
  facts?: string[] | undefined;
  /** When it last moved, or anything else that belongs last. */
  footer?: ReactNode | undefined;
  /** The board's column card, which has less room than the Cards view. */
  compact?: boolean;
};

export default function LibraryCard({
  title,
  onOpen,
  subtitle,
  state,
  facts,
  footer,
  compact = false,
}: LibraryCardProps) {
  const shown = (facts ?? []).filter(Boolean);
  return (
    <article className={`scripta-matter-card${compact ? " is-compact" : ""}`}>
      <header>
        <h3>
          <button type="button" onClick={onOpen}>
            {title}
          </button>
        </h3>
      </header>
      {subtitle && <p>{subtitle}</p>}
      {state && <div className="scripta-matter-stage">{state}</div>}
      {shown.length > 0 && !compact && (
        <div className="scripta-matter-documents">
          {shown.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </div>
      )}
      {footer && <p className="scripta-matter-updated">{footer}</p>}
    </article>
  );
}
