/**
 * Researcher state (wireframe 4a–4c). Findings and authorities are linked
 * records; pins are (authority, section, paragraph, note); the memo cites by
 * authority number so a corrected citation propagates to every footnote.
 * Kept per research matter in browser storage until research tables exist.
 */
import type { ResearchAnswer } from "@/lib/research.functions";
import type { ClauseDoc } from "./clause-doc";
import { authorityWeight } from "@/lib/authority";

export type Pin = {
  id: string;
  authority: number;
  section: number;
  paragraph: number;
  text: string;
  note: string;
};
/**
 * One numbered section of the memo. `body` is the section's words and `doc` is
 * the same words with their formatting; `body` is always derived from `doc`, so
 * everything that reads the memo as text — the citation checker, the pinned
 * passage insert, the export — needs to know nothing about formatting.
 */
export type MemoSection = {
  id: string;
  no: string;
  title: string;
  body: string;
  cites: number[];
  doc?: ClauseDoc | null;
};
export type Memo = {
  title: string;
  intro: string;
  /** The introduction's formatting; `intro` stays its plain text. */
  introDoc?: ClauseDoc | null;
  sections: MemoSection[];
  style: "OSCOLA" | "Bluebook" | "Firm custom";
};
export type ResearchState = {
  topic: string;
  question: string;
  jurisdiction: string;
  /** Contract law, employment, mining regulation — steers the research. */
  areaOfLaw: string;
  /** The date the law is stated as at, as it will read in the memo. */
  lawAsAt: string;
  /** What the research is for: a memorandum, an opinion, a note. */
  outputKind: string;
  /** Quick, standard or deep. How far the research goes. */
  depth: string;
  sources: string;
  since: string;
  linkedClause: string;
  answer: ResearchAnswer | null;
  pins: Pin[];
  memo: Memo;
  selectedAuthority: number | null;
};

export const JURISDICTIONS = [
  "Switzerland",
  "Ghana",
  "United Arab Emirates",
  "England & Wales",
  "Nigeria",
  "Kenya",
];
export const SOURCE_TYPES = [
  "Statute + case law",
  "Statute only",
  "Case law only",
  "Statute, case law + secondary",
];
export const SINCE_OPTIONS = ["Since 2010", "Since 2015", "Since 2020", "Any date"];

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** The worked example drawn in the wireframe, so a fresh research matter opens looking as designed. */
export function sampleResearch(): ResearchState {
  return {
    topic: "Interest rate ceilings — CH",
    areaOfLaw: "Contract law",
    lawAsAt: "",
    outputKind: "Research memorandum",
    depth: "Standard",
    question: "Is 11% per annum enforceable on a commercial convertible loan under Swiss law?",
    jurisdiction: "Switzerland",
    sources: "Statute + case law",
    since: "Since 2010",
    linkedClause: "3.5",
    answer: {
      shortAnswer:
        "Yes, on the current facts. The rate is a matter of contract for a commercial, non-consumer loan; the ceilings usually cited come from consumer credit rules that do not apply here.",
      findings: [
        { text: "No statutory maximum applies to a commercial, non-consumer loan.", cites: [1] },
        {
          text: "Consumer-credit ceilings are the usual source of the “usury” figure and do not bind here.",
          cites: [3],
        },
        {
          text: "Rates challenged successfully sit materially above 15% p.a., usually with compounding.",
          cites: [2],
        },
      ],
      authorities: [
        {
          n: 1,
          cite: "Art. 314 CO",
          kind: "STATUTE",
          source: "Swiss Code of Obligations · CH",
          date: "In force",
          held: "Interest on loans; contractual rate free absent a cap.",
          sections: [
            {
              title: "Art. 314 — Interest",
              paragraphs: [
                "Where interest is agreed but no rate is fixed, the customary rate for loans of that kind at the time and place of the loan applies.",
                "The parties are otherwise free to agree the rate, subject to the general limits on unfair advantage and abuse of rights.",
              ],
            },
          ],
        },
        {
          n: 2,
          cite: "BGE 4A_172/2019",
          kind: "COURT DECISION",
          source: "Federal Supreme Court · Civil",
          date: "14 May 2019",
          held: "Rate found excessive in a consumer context; commercial lending distinguished.",
          sections: [
            {
              title: "Facts",
              paragraphs: [
                "The dispute concerned a loan advanced to a private borrower at a rate materially above the cantonal ceiling for consumer credit. The lower court set the rate aside in full rather than reducing it.",
              ],
            },
            {
              title: "Procedural history",
              paragraphs: [
                "The lender appealed the lower court's decision to set the agreed rate aside in its entirety.",
              ],
            },
            {
              title: "Considerations 2 — rate",
              paragraphs: [
                "Where the borrower does not act as a consumer, the parties remain free to agree the rate, subject only to the general limits on unfair advantage and abuse of rights.",
              ],
            },
            {
              title: "Considerations 3 — consumer test",
              paragraphs: [
                "The court distinguished commercial lending, where the rate reflects risk allocation between informed parties, and declined to read the consumer ceiling across.",
              ],
            },
            {
              title: "Holding",
              paragraphs: [
                "The appeal was allowed in part: the consumer ceiling governs consumer credit only, and a commercial rate is reviewed against the general limits alone.",
              ],
            },
          ],
        },
        {
          n: 3,
          cite: "Cantonal rate ordinances",
          kind: "SECONDARY",
          source: "Canton of Zurich · ZH",
          date: "Current",
          held: "Administrative ceilings applying to consumer credit only.",
          sections: [
            {
              title: "Scope",
              paragraphs: [
                "The cantonal ceilings are administrative limits attached to consumer-credit licensing and do not reach commercial lending between businesses.",
              ],
            },
          ],
        },
        {
          n: 4,
          cite: "Art. 21 CO",
          kind: "STATUTE",
          source: "Swiss Code of Obligations · CH",
          date: "In force",
          held: "Unfair advantage; relief where a party exploits distress.",
          sections: [
            {
              title: "Art. 21 — Unfair advantage",
              paragraphs: [
                "Where there is a clear discrepancy between performance and consideration and the contract was concluded by exploiting the other party's distress, inexperience or improvidence, the injured party may declare within one year that it will not honour the contract.",
              ],
            },
          ],
        },
      ],
    },
    pins: [
      {
        id: "pin-1",
        authority: 2,
        section: 2,
        paragraph: 0,
        text: "Where the borrower does not act as a consumer, the parties remain free to agree the rate, subject only to the general limits on unfair advantage and abuse of rights.",
        note: "",
      },
      {
        id: "pin-2",
        authority: 1,
        section: 0,
        paragraph: 1,
        text: "The parties are otherwise free to agree the rate, subject to the general limits on unfair advantage and abuse of rights.",
        note: "",
      },
    ],
    memo: {
      title: "Enforceability of an 11% interest rate",
      intro:
        "Convertible loan to Laine Technologies AG. Question: whether the increased rate is enforceable against a commercial borrower under Swiss law.",
      style: "OSCOLA",
      sections: [
        {
          id: "m1",
          no: "1",
          title: "Question",
          body: "Whether an interest rate of 11% per annum is enforceable on a commercial convertible loan governed by Swiss law.",
          cites: [],
        },
        {
          id: "m2",
          no: "2",
          title: "Short answer",
          body: "The rate is enforceable. No statutory ceiling applies outside consumer credit, and the Federal Supreme Court has declined to read the consumer ceiling across to commercial lending.",
          cites: [1, 2],
        },
        {
          id: "m3",
          no: "3",
          title: "Statutory framework",
          body: "Art. 314 CO leaves the rate to the parties, subject to the general limits on unfair advantage.",
          cites: [1, 4],
        },
        { id: "m4", no: "4", title: "Case law", body: "", cites: [2] },
        { id: "m5", no: "5", title: "Application to clause 3.5", body: "", cites: [] },
        { id: "m6", no: "6", title: "Recommendation", body: "", cites: [] },
      ],
    },
    selectedAuthority: 2,
  };
}

/** A blank research matter: the drawing's structure with nothing filled in. */
export function emptyResearch(topic: string): ResearchState {
  return {
    topic,
    question: "",
    jurisdiction: "Ghana",
    areaOfLaw: "",
    lawAsAt: "",
    outputKind: "Research memorandum",
    depth: "Standard",
    sources: "Statute + case law",
    since: "Since 2010",
    linkedClause: "",
    answer: null,
    pins: [],
    memo: {
      title: topic,
      intro: "",
      style: "OSCOLA",
      sections: [
        { id: uid(), no: "1", title: "Question", body: "", cites: [] },
        { id: uid(), no: "2", title: "Short answer", body: "", cites: [] },
        { id: uid(), no: "3", title: "Statutory framework", body: "", cites: [] },
        { id: uid(), no: "4", title: "Case law", body: "", cites: [] },
        { id: uid(), no: "5", title: "Application", body: "", cites: [] },
        { id: uid(), no: "6", title: "Recommendation", body: "", cites: [] },
      ],
    },
    selectedAuthority: null,
  };
}

/** Footnotes in order of first citation across the memo; pins add their pinpoint. */
export function footnotesOf(state: ResearchState) {
  const order: number[] = [];
  for (const s of state.memo.sections)
    for (const n of s.cites) if (!order.includes(n)) order.push(n);
  return order.map((n, i) => {
    const a = state.answer?.authorities.find((x) => x.n === n);
    const pin = state.pins.find((p) => p.authority === n);
    const rawPinpoint = pin && a ? a.sections[pin.section]?.title : null;
    // A pinpoint only helps when it adds to the citation (cons. 2, §3), not when it repeats it.
    const pinpoint =
      rawPinpoint &&
      a &&
      !a.cite.includes(rawPinpoint.split(" — ")[0]!) &&
      !rawPinpoint.includes(a.cite)
        ? rawPinpoint
        : null;
    return {
      number: i + 1,
      authority: n,
      text: a
        ? `${a.cite}${pinpoint ? `, ${pinpoint.replace(/^Considerations? /i, "cons. ").replace(/ —.*$/, "")}` : ""}.`
        : `[${n}] — authority not in this research.`,
      missing: !a,
    };
  });
}

/** The citation checker: mismatches between what the memo cites and what was read. */
export function checkCitations(state: ResearchState): string[] {
  const issues: string[] = [];
  const known = new Set(state.answer?.authorities.map((a) => a.n) ?? []);
  for (const s of state.memo.sections)
    for (const n of s.cites)
      if (!known.has(n))
        issues.push(
          `Section ${s.no} cites [${n}], which is not among the authorities in this research.`,
        );
  for (const p of state.pins) {
    const a = state.answer?.authorities.find((x) => x.n === p.authority);
    if (!a)
      issues.push(
        `A pinned passage refers to authority [${p.authority}], which is no longer in the research.`,
      );
    else if (!a.sections[p.section]?.paragraphs[p.paragraph])
      issues.push(
        `The pin on ${a.cite} points at a passage that is no longer in the reading view.`,
      );
  }
  for (const s of state.memo.sections)
    if (
      s.body.trim() &&
      !s.cites.length &&
      /\b(held|provides|requires|court|act|article|section)\b/i.test(s.body)
    )
      issues.push(`Section ${s.no} makes a legal proposition without a citation.`);
  /**
   * An unverified citation inside the memo is worse than one in the answer.
   * The answer is a working note; the memo is the document that leaves the
   * building with the writer's name on it. Reported once per authority,
   * however many sections lean on it.
   */
  const citedOnce = new Set(state.memo.sections.flatMap((s) => s.cites));
  for (const n of citedOnce) {
    const a = state.answer?.authorities.find((x) => x.n === n);
    if (a && authorityWeight(a.kind) === "unverified")
      issues.push(
        `The memo cites ${a.cite}, which Scripta could not verify. Check it exists, and in that form, before this memo goes out.`,
      );
  }
  return issues;
}
