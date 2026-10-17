/**
 * Capitalisation drift of a multiword term: "Central Bank" and "central
 * bank" in the middle of sentences. Sentence openings and headings do not
 * count (their capitals are not a choice), a full name ("Central Bank of
 * Ghana") is left alone, and a plainly generic use ("a central bank") is
 * not held against the capitalised form.
 */
import type { DraftFinding } from "../model";
import { corpusOf, type Prose } from "./corpus";
import { detected, draft, ev, finish, ruleCovering } from "./finding";
import { q, times } from "./text";
import type { CheckInput, CheckResult, DetectedRule } from "./types";

type Hit = { p: Prose; s: number; e: number; text: string };

const TITLE = /^\p{Lu}\p{Ll}+$/u;
const LOWER = /^\p{Ll}+$/u;
const STOP = new Set(
  "the this that these those a an and or but in on at of for to by with from as it its their his her our we they he she there here when where which while if".split(
    " ",
  ),
);
const GENERIC = new Set("a an any each every no other some many most all such several".split(" "));

export function checkCapitalisation(input: CheckInput): CheckResult {
  const corpus = corpusOf(input.nodes);
  const prose = corpus.prose.filter((p) => p.english && p.node.kind !== "caption");
  const capital = new Map<string, Hit[]>();

  for (const p of prose) {
    const toks = p.toks;
    let i = 0;
    while (i < toks.length) {
      const t = toks[i]!;
      if (!TITLE.test(t.w)) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < toks.length && toks[j + 1]!.sep === " " && TITLE.test(toks[j + 1]!.w)) j++;
      const len = j - i + 1;
      const before = toks[i - 1];
      const after = toks[j + 1];
      const hyphen = (x: string | undefined) => !!x && /[-‐‑]/.test(x);
      const ok =
        len >= 2 &&
        !hyphen(t.sep) &&
        !hyphen(after?.sep) &&
        len <= 3 &&
        t.init === 0 &&
        !(before && /^\s+$/.test(t.sep) && /^\p{Lu}/u.test(before.w)) &&
        !(after && after.lw === "of" && /^\s+$/.test(after.sep)) &&
        toks.slice(i, j + 1).every((x) => x.lw.length >= 3 && !STOP.has(x.lw));
      if (ok) {
        const key = toks
          .slice(i, j + 1)
          .map((x) => x.lw)
          .join(" ");
        const list = capital.get(key) ?? [];
        list.push({ p, s: t.s, e: toks[j]!.e, text: p.raw.slice(t.s, toks[j]!.e) });
        capital.set(key, list);
      }
      i = j + 1;
    }
  }
  if (!capital.size) return { findings: [], detectedRules: [] };

  const lower = new Map<string, Hit[]>();
  for (const p of prose) {
    const toks = p.toks;
    for (let i = 0; i < toks.length; i++) {
      for (const len of [2, 3]) {
        if (i + len > toks.length) break;
        const run = toks.slice(i, i + len);
        if (!run.every((x, k) => LOWER.test(x.w) && (k === 0 || x.sep === " "))) break;
        if (/[-‐‑]/.test(run[0]!.sep) || /[-‐‑]/.test(toks[i + len]?.sep ?? "")) continue;
        const key = run.map((x) => x.lw).join(" ");
        if (!capital.has(key)) continue;
        const before = toks[i - 1];
        if (before && GENERIC.has(before.lw)) continue;
        const list = lower.get(key) ?? [];
        list.push({ p, s: run[0]!.s, e: run[len - 1]!.e, text: p.raw.slice(run[0]!.s, run[len - 1]!.e) });
        lower.set(key, list);
      }
    }
  }

  const drafts: DraftFinding[] = [];
  const detectedRules: DetectedRule[] = [];
  for (const [key, caps] of capital) {
    const lows = lower.get(key);
    if (!lows?.length || caps.length + lows.length < 3) continue;
    const capForm = caps[0]!.text;
    if (ruleCovering(input.rules, ["capitalisation", "terminology"], [key, capForm])) continue;
    const capsMajor = caps.length > lows.length;
    const tie = caps.length === lows.length;
    const [minor, major] = capsMajor ? [lows, caps] : [caps, lows];
    drafts.push(
      draft({
        pass: "consistency",
        category: "consistency",
        severity: "minor",
        action: "query",
        title: `${q(capForm)} and ${q(key)} are both used`,
        body: `${q(capForm)} appears ${times(caps.length)} and ${q(key)} ${times(lows.length)} in the middle of sentences. If they name the same thing, please confirm which capitalisation you want; if one is a particular body and the other generic, no change is needed.`,
        evidence: [
          ...minor.map((h) => ev(h.p.node.key, h.text, tie ? undefined : "less common form")),
          ...(tie ? major : major.slice(0, 2)).map((h) => ev(h.p.node.key, h.text, tie ? undefined : "usual form")),
        ],
        fp: ["consistency.capitalisation", key],
      }),
    );
    if (!tie)
      detectedRules.push(
        detected(
          "capitalisation",
          capsMajor ? capForm : key,
          [capsMajor ? key : capForm],
          `Write ${q(capsMajor ? capForm : key)} (the manuscript's usual form).`,
        ),
      );
  }
  return { findings: finish(input, drafts), detectedRules };
}
