/**
 * What state a piece of knowledge is in, said quietly.
 *
 * ---------------------------------------------------------------------------
 * RESTRAINT IS THE SPECIFICATION
 * ---------------------------------------------------------------------------
 *
 * Approval is meaningful, so it is marked. It is not marked with a giant green
 * badge, because a library where every second row shouts is a library nobody
 * reads carefully — and the one thing this marker exists to do is make the
 * difference between "somebody put this here" and "the firm stands behind
 * this" legible at a glance.
 *
 * Firm-wide gets nothing at all. It is the ordinary case, and a pill on every
 * row is the permission-pill soup §9 asks this not to become. Private and
 * Shared are marked because they are facts about who else can see your work,
 * which a lawyer should never have to go and check.
 *
 * A stale approval is the interesting state and it is the one most likely to be
 * got wrong: it is NOT approved, and it is not the same as never having been
 * approved either. It says so in words rather than by removing the mark, so
 * somebody who remembers approving it can tell what happened.
 */
import { Check, Lock, Users } from "lucide-react";
import { approvalWentStale, stateOf, STATE_MEANING, type KnowledgeFacts } from "@/lib/knowledge";
import { C, mono, radius } from "@/lib/tokens";

export default function KnowledgeStatus({
  facts,
  sharedWith,
  showOrdinary = false,
}: {
  facts: KnowledgeFacts;
  /** How many people, when it is shared. */
  sharedWith?: number | undefined;
  /** Mark firm-wide too. Off in a list; on where the state is the subject. */
  showOrdinary?: boolean | undefined;
}) {
  const state = stateOf(facts);
  const stale = approvalWentStale(facts);

  if (state === "firm" && !stale && !showOrdinary) return null;

  const pill = (
    label: string,
    colour: string,
    tint: string,
    icon?: React.ReactNode,
    title?: string,
  ) => (
    <span
      title={title ?? STATE_MEANING[state]}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        border: `1px solid ${tint}`,
        borderRadius: radius.pill,
        color: colour,
        font: `500 10px ${mono}`,
        letterSpacing: ".06em",
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      {label}
    </span>
  );

  if (stale) {
    return pill(
      "APPROVAL LAPSED",
      C.amber,
      C.amber,
      undefined,
      "This was approved, and the wording has changed since. It needs approving again.",
    );
  }
  if (state === "approved") return pill("APPROVED", C.green, C.green, <Check size={10} />);
  if (state === "private") return pill("PRIVATE", C.secondary, C.border, <Lock size={10} />);
  if (state === "shared")
    return pill(
      sharedWith ? `SHARED · ${sharedWith}` : "SHARED",
      C.secondary,
      C.border,
      <Users size={10} />,
    );
  return pill("FIRM-WIDE", C.faint, C.border);
}
