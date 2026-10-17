/**
 * One way of showing where something has got to.
 *
 * Every section of Scripta has a status and, until now, every section drew its
 * own: a coloured `<span>` on Precedents, a plain grey word on Templates, an
 * uppercase mono chip on Research. Same idea, three looks, so knowing how to
 * read one told you nothing about the next.
 *
 * The awkward part is that no two sections share a vocabulary — a precedent is
 * `executed`, a template is `Retired`, a report is locked — and a component
 * that knew all of them would have to be edited every time a section gained a
 * state. So this takes a TONE: what the state means, not what it is called and
 * not what colour to paint it. Each screen keeps its own words and decides
 * which of six meanings they carry.
 *
 * Colours are the ones already in `tokens.ts`. The tinted pairs come from
 * `statusColors`, which is the table that has always held them — borrowed here
 * by tone rather than by clause status, so there is still one place a status
 * colour is decided.
 */
import { C, statusColors } from "@/lib/tokens";
import "./library.css";

/**
 * Six meanings, which between them cover every status the app has:
 * - `neutral` nothing has happened to it yet (Draft)
 * - `progress` under way (Negotiated, an open report)
 * - `good` it reached the end it was meant to (Approved, Executed, Active)
 * - `warning` it needs someone to look at it
 * - `danger` something is wrong with it
 * - `retired` it was live once and is not any more (Superseded, Retired)
 *
 * `retired` is not the same as `neutral`: a superseded precedent and an
 * unstarted one are opposite ends of a life, and a lawyer choosing wording
 * needs to tell them apart at a glance.
 */
export type StatusTone = "neutral" | "progress" | "good" | "warning" | "danger" | "retired";

/** The ink and tint a tone is drawn in. Exported so a test can hold it to the tokens. */
export function toneStyle(tone: StatusTone): { color: string; background: string } {
  const tinted = (key: keyof typeof statusColors) => {
    const [background, color] = statusColors[key];
    return { color, background };
  };
  switch (tone) {
    case "good":
      return tinted("Accepted");
    case "progress":
      return tinted("Draft");
    case "warning":
      return tinted("Open");
    case "danger":
      return tinted("Escalated");
    case "retired":
      return { color: C.faint, background: C.sunken };
    case "neutral":
      return { color: C.muted, background: C.sunken };
  }
}

export type StatusPillProps = {
  /** The state in the screen's own words. Never rewritten here. */
  label: string;
  /** What that state means. The caller maps its domain value to one of six. */
  tone: StatusTone;
};

export default function StatusPill({ label, tone }: StatusPillProps) {
  return (
    <span className="scripta-status-pill" style={toneStyle(tone)}>
      {label}
    </span>
  );
}
