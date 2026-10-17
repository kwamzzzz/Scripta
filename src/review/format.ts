/**
 * Formatting the review screens share. Kept apart from the components so fast
 * refresh keeps working on the files that render.
 */
import { SEVERITY } from "./model";

export const SEVERITY_OPTIONS = SEVERITY.map((s) => ({ value: s.key, label: s.label }));

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

/** "12 Sept 2026" from a timestamp. Empty for nothing, and for nonsense. */
export function fmtWhen(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "3 issues" / "1 issue" — the count with the right word after it. */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A clause's heading, when it is one.
 *
 * Well-drafted agreements head each clause ("Limitation of liability"), and
 * that heading is the topic a precedent should be filed under. Definitions and
 * some operative clauses have no heading at all, and the parser falls back to
 * the opening words of the clause itself — which is text, not a topic. A
 * heading long enough to be a sentence is treated as the latter and left out,
 * so nobody ends up with a precedent filed under half a sentence.
 */
export const clauseTopic = (title: string): string => {
  const t = title.trim().replace(/[.…]+$/, "");
  return t.length > 0 && t.length <= 48 && t.split(/\s+/).length <= 6 ? t : "";
};
