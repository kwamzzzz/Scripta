/**
 * Who else is in this clause, and what that does and does not mean.
 *
 * ---------------------------------------------------------------------------
 * THE SENTENCE IS THE FEATURE
 * ---------------------------------------------------------------------------
 *
 * A lock icon and a greyed-out button teach a lawyer nothing except that the
 * software is in their way. What they need to know is three things, in order:
 *
 *   somebody is in here            so you do not both retype the same clause
 *   your work is not lost          because that is the fear
 *   it frees itself shortly        so the answer is usually to wait
 *
 * Only the Lead gets a fourth option, and it is written as what it is — taking
 * a colleague's work out of their hands — rather than as "Force unlock", which
 * makes an interruption sound like a setting.
 */
import { useEffect, useState } from "react";
import { Hand, UserRound } from "lucide-react";
import { Button } from "@/components/primitives";
import { useBreakLease, type Holding } from "@/lib/clause-lease";
import { C, radius } from "@/lib/tokens";

/**
 * "in a few seconds", "in about a minute" — never a ticking countdown.
 *
 * Exported because it is the sentence a lawyer reads to decide whether to wait
 * or to go and do something else, and a wrong one sends them away from a clause
 * that was about to free itself.
 */
export const freesIn = (until: string) => {
  const left = new Date(until).getTime() - Date.now();
  if (!Number.isFinite(left) || left <= 0) return "any moment now";
  const seconds = Math.round(left / 1000);
  if (seconds < 30) return "in a few seconds";
  if (seconds < 90) return "in about a minute";
  return `in about ${Math.round(seconds / 60)} minutes`;
};

export default function ClausePresence({
  clauseId,
  holding,
  mayBreak,
  onRetake,
}: {
  clauseId: string;
  holding: Holding;
  /** The Lead. From the database; this component never works it out. */
  mayBreak: boolean;
  onRetake: () => void;
}) {
  const breakLease = useBreakLease(clauseId);
  const [problem, setProblem] = useState<string | null>(null);

  // The wording depends on how long is left, so it has to re-render as that
  // changes. Once every ten seconds is enough for a sentence with no digits.
  const [, tick] = useState(0);
  useEffect(() => {
    if (holding.state !== "occupied") return;
    const timer = window.setInterval(() => tick((n) => n + 1), 10_000);
    return () => window.clearInterval(timer);
  }, [holding.state]);

  if (holding.state === "idle" || holding.state === "held") return null;

  const shell = {
    display: "grid",
    gap: 7,
    border: `1px solid ${C.cardRule}`,
    borderLeft: `3px solid ${C.amber}`,
    borderRadius: radius.md,
    background: C.panel,
    padding: "9px 11px",
  } as const;

  if (holding.state === "lost") {
    return (
      <div role="status" style={shell}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Hand size={14} color={C.amber} />
          <strong style={{ color: C.text, fontSize: 12.5 }}>You no longer have this clause</strong>
        </div>
        <p style={{ margin: 0, color: C.body, fontSize: 12.5, lineHeight: 1.55 }}>
          It lapsed, or the Lead took it. Nothing you have not saved has gone anywhere — it is still
          on this screen.
        </p>
        <div>
          <Button variant="secondary" onClick={onRetake}>
            Take it back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div role="status" style={shell}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <UserRound size={14} color={C.amber} />
        <strong style={{ color: C.text, fontSize: 12.5 }}>
          {holding.byName} is in this clause
        </strong>
      </div>
      <p style={{ margin: 0, color: C.body, fontSize: 12.5, lineHeight: 1.55 }}>
        You can read it and comment on it. Accepting, rejecting and editing wait until they are out
        — which happens by itself {freesIn(holding.until)} if they have stepped away.
      </p>
      {problem && (
        <p role="alert" style={{ margin: 0, color: C.red, fontSize: 12.5 }}>
          {problem}
        </p>
      )}
      {mayBreak && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <Button
            variant="quiet"
            disabled={breakLease.isPending}
            onClick={() => {
              setProblem(null);
              breakLease.mutate(undefined, {
                onSuccess: onRetake,
                onError: (cause) =>
                  setProblem(cause instanceof Error ? cause.message : "That did not work."),
              });
            }}
          >
            Take it from {holding.byName}
          </Button>
          {/* Said plainly, because it is a real thing to do to a colleague. */}
          <span style={{ color: C.faint, fontSize: 11.5 }}>
            They will be told, and it goes on the file.
          </span>
        </div>
      )}
    </div>
  );
}
