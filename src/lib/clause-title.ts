/**
 * A clause's title, when it was taken from the clause's own words.
 *
 * A provision with no heading is titled by its opening words when the document
 * is read ("The Client shall approve each Deliverable…"), or by the whole
 * sentence when it is short ("Late payment bears interest at 2% per month").
 * Once the wording changes, that title is out of date, and it is the title the
 * contents, the issues and the export all show. A heading the drafter gave
 * ("Liability", "Part C – Content Trial", a defined term) is never touched.
 */

/** The wording as a title reads it: no leading clause number, spaces tidied. */
const plain = (text: string) =>
  text
    .replace(/^\s*(?:\d+(?:\.\d+)+\.?|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

const bare = (s: string) => s.replace(/[.:;,]+$/, "").trim();
const words = (s: string) => s.split(" ").filter(Boolean);

/** The opening `n` words of the wording as a title, or all of it when that is all there is. */
export function titleFrom(text: string, n = 8): string {
  const all = words(plain(text));
  if (!all.length) return "";
  return all.length > n ? `${bare(all.slice(0, n).join(" "))}…` : bare(all.join(" "));
}

/**
 * The new title, where `title` was taken from `before` and the wording is now
 * `after`; null where the title is the drafter's own, or still reads true.
 */
export function retitle(title: string, before: string, after: string): string | null {
  const was = plain(before);
  const now = plain(after);
  if (!now || was === now) return null;
  const t = title.trim();
  const cut = t.endsWith("…");
  const head = bare(cut ? t.slice(0, -1) : t);
  if (!head) return null;
  // Taken from the wording: its opening words, or the whole of it.
  const taken = cut ? was.startsWith(head) : head === bare(was);
  if (!taken) return null;
  // Still true of the new wording: leave it.
  if (cut ? now.startsWith(head) : head === bare(now)) return null;
  const next = cut
    ? titleFrom(now, words(head).length)
    : titleFrom(now, Math.max(8, words(head).length));
  return next && next !== t ? next : null;
}
