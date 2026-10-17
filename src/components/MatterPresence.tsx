/**
 * Who is in the document, on the matter you are reading.
 *
 * Read from the lease rows, which is the whole reason this exists without a
 * presence channel: a lease is a row in a table with a policy on it, so showing
 * it authorises nothing new.
 *
 * It therefore cannot show somebody who merely has the matter open, and that is
 * the right limitation rather than a gap to close later. "Who has this open" is
 * ambient surveillance of a colleague; "who is in clause 7.2" is a fact you
 * need in order not to collide with them.
 */
import { useMatterPresence } from "@/lib/clause-lease";
import { C, radius } from "@/lib/tokens";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

export default function MatterPresence({
  matterId,
  onOpenClause,
}: {
  matterId: string | null | undefined;
  onOpenClause?: (clauseId: string) => void;
}) {
  const present = useMatterPresence(matterId);
  const people = present.data ?? [];
  if (people.length === 0) return null;

  return (
    <div
      aria-label="In the document now"
      style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}
    >
      {people.map((person) => {
        const label = person.clauseNum ? `clause ${person.clauseNum}` : "a clause";
        const body = (
          <>
            <span
              aria-hidden="true"
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                background: C.accentTint,
                color: C.accent,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 600,
              }}
            >
              {initials(person.name)}
            </span>
            <span>
              {person.name.split(" ")[0]} · {label}
            </span>
          </>
        );
        const style = {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: `1px solid ${C.border}`,
          borderRadius: radius.pill,
          background: C.panel,
          color: C.secondary,
          font: "inherit",
          fontSize: 11.5,
          padding: "3px 9px 3px 4px",
        } as const;

        return onOpenClause ? (
          <button
            key={person.userId + person.clauseId}
            type="button"
            title={`${person.name} is in ${label}`}
            onClick={() => onOpenClause(person.clauseId)}
            style={{ ...style, cursor: "pointer" }}
          >
            {body}
          </button>
        ) : (
          <span
            key={person.userId + person.clauseId}
            title={`${person.name} is in ${label}`}
            style={style}
          >
            {body}
          </span>
        );
      })}
    </div>
  );
}
