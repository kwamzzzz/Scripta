/**
 * One problem, said once. Book Review runs exact checks and several reading
 * passes over the same text, and each would happily restate what another has
 * already raised. These decide what counts as a repetition.
 */
import type { DraftFinding } from "./model";

/** A finding already on the version, as far as repetition is concerned. */
export type Raised = {
  title: string;
  category: string;
  source: string;
  chapterKeys: string[];
  quotes: { nodeKey: string; text: string }[];
};

export const raisedLines = (raised: Raised[]) =>
  raised.length
    ? raised
        .slice(0, 80)
        .map((r) => `- ${r.title}${r.quotes[0] ? ` ("${r.quotes[0].text.slice(0, 80)}")` : ""}`)
        .join("\n")
    : "(none)";

/**
 * The same words in the same paragraph as something already raised, by any
 * pass: a repetition, whatever the model called it. Compared case-blind, one
 * containing the other, so "The the delays" repeats "The the".
 */
export function repeats(draft: DraftFinding, raised: Raised[]): boolean {
  const mine = [
    ...draft.evidence.filter((e) => e.quote).map((e) => ({ nodeKey: e.nodeKey, text: e.quote! })),
    ...(draft.original && draft.evidence[0]
      ? [{ nodeKey: draft.evidence[0].nodeKey, text: draft.original }]
      : []),
  ];
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
  return mine.some((m) =>
    raised.some((r) =>
      r.quotes.some((q) => {
        if (q.nodeKey !== m.nodeKey) return false;
        const a = norm(q.text);
        const b = norm(m.text);
        return a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a));
      }),
    ),
  );
}

const STOP = new Set(
  "a an the of in on to and or for with between about regarding versus vs is are was were this that its their by from as at".split(
    " ",
  ),
);
const words = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );

/**
 * A manuscript-wide finding that says what one already raised says, about the
 * same chapters: titles sharing most of their words and at least one chapter.
 */
export function restates(title: string, chapterKeys: string[], raised: Raised[]): boolean {
  const mine = words(title);
  if (!mine.size) return false;
  return raised.some((r) => {
    if (!r.chapterKeys.some((k) => chapterKeys.includes(k))) return false;
    const theirs = words(r.title);
    const shared = [...mine].filter((w) => theirs.has(w)).length;
    return shared / Math.min(mine.size, theirs.size || 1) >= 0.6;
  });
}

/** Findings from this same call, in the shape `repeats` compares against. */
export const asRaised = (drafts: DraftFinding[]): Raised[] =>
  drafts.map((d) => ({
    title: d.title,
    category: d.category,
    source: d.source,
    chapterKeys: [],
    quotes: [
      ...d.evidence.filter((e) => e.quote).map((e) => ({ nodeKey: e.nodeKey, text: e.quote! })),
      ...(d.original && d.evidence[0]
        ? [{ nodeKey: d.evidence[0].nodeKey, text: d.original }]
        : []),
    ],
  }));

/**
 * The words a correction actually changes: the original and the replacement
 * with their shared words either side taken off. "The cocoa board accelerated"
 * → "The Cocoa Board accelerated" changes "cocoa board" to "Cocoa Board".
 */
export function changedSpan(original: string, replacement: string): { from: string; to: string } {
  const a = original.split(/(\s+)/);
  const b = replacement.split(/(\s+)/);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return {
    from: a
      .slice(i, a.length - j)
      .join("")
      .trim(),
    to: b
      .slice(i, b.length - j)
      .join("")
      .trim(),
  };
}

/**
 * The same correction made in many places is one finding, not many: a name
 * written in lower case throughout a chapter is one thing for the author to
 * fix. Corrections from the AI proofreading that change the same words the
 * same way are merged into one finding carrying every place (the first twelve
 * listed, the count stated). Everything else passes through untouched.
 */
export function groupCorrections(drafts: DraftFinding[], scopeKey: string): DraftFinding[] {
  const groups = new Map<string, DraftFinding[]>();
  const rest: DraftFinding[] = [];
  for (const d of drafts) {
    if (
      d.source !== "ai" ||
      d.action !== "correction" ||
      !d.original ||
      d.replacement === undefined
    ) {
      rest.push(d);
      continue;
    }
    const { from, to } = changedSpan(d.original, d.replacement);
    if (!from || !to) {
      rest.push(d);
      continue;
    }
    const key = `${d.category}\u0000${from.toLowerCase()}\u0000${to}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const merged: DraftFinding[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      merged.push(list[0]!);
      continue;
    }
    const first = list[0]!;
    const { from, to } = changedSpan(first.original!, first.replacement!);
    const evidence = list.flatMap((d) => d.evidence);
    merged.push({
      ...first,
      title: `${first.title}: ‘${from}’ should read ‘${to}’`,
      body: `${first.body} The same correction applies in ${list.length} places${
        evidence.length > 12 ? "; the first twelve are listed" : ""
      }.`,
      original: from,
      replacement: to,
      evidence: evidence.slice(0, 12),
      fingerprint: `grp-${scopeKey}-${first.category}-${from.toLowerCase()}-${to}`,
    });
  }
  return [...rest, ...merged];
}
