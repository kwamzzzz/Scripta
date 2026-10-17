import { describe, expect, it } from "vitest";
import type { ResearchState } from "@/wireframe/research-store";
import {
  coerceIndexEntry,
  coerceRecords,
  coerceState,
  recordsFromRows,
  stateFromRows,
  toAnswerRows,
  toChildRows,
  toMatterFields,
  toRecordFields,
  toRecordRows,
  toStateFields,
  type StoredRecords,
} from "./research-rows";

const state = (patch: Partial<ResearchState> = {}): ResearchState => ({
  topic: "Interest rate ceilings — CH",
  question: "Is 11% per annum enforceable on a commercial convertible loan?",
  jurisdiction: "Switzerland",
  areaOfLaw: "Contract law",
  lawAsAt: "",
  outputKind: "Research memorandum",
  depth: "Standard",
  sources: "Statute + case law",
  since: "Since 2010",
  linkedClause: "3.5",
  answer: {
    shortAnswer: "Yes, on the current facts.",
    findings: [
      { text: "No statutory maximum applies.", cites: [1], issueNo: "" },
      { text: "Consumer ceilings do not bind here.", cites: [3, 1], issueNo: "" },
    ],
    authorities: [
      {
        n: 1,
        cite: "Art. 314 CO",
        kind: "STATUTE",
        source: "Swiss Code of Obligations · CH",
        date: "In force",
        held: "Interest on loans.",
        sections: [{ title: "Art. 314 — Interest", paragraphs: ["First.", "Second."] }],
        tier: "",
        status: "",
        weight: "",
        addedBy: "ai",
        url: "",
        note: "",
        issueNos: "",
      },
      {
        n: 3,
        cite: "Cantonal rate ordinances",
        kind: "SECONDARY",
        source: "Canton of Zurich · ZH",
        date: "Current",
        held: "Consumer credit only.",
        sections: [{ title: "Scope", paragraphs: ["Administrative limits."] }],
        tier: "",
        status: "",
        weight: "",
        addedBy: "ai",
        url: "",
        note: "",
        issueNos: "",
      },
    ],
  },
  pins: [
    {
      id: "pin-1",
      authority: 3,
      section: 0,
      paragraph: 0,
      text: "Administrative limits.",
      note: "check against the licence class",
    },
  ],
  memo: {
    title: "Enforceability of an 11% interest rate",
    intro: "Convertible loan to Laine Technologies AG.",
    style: "Bluebook",
    sections: [
      { id: "m1", no: "1", title: "Question", body: "Whether 11% is enforceable.", cites: [] },
      { id: "m2", no: "2", title: "Short answer", body: "It is.", cites: [1, 3] },
    ],
  },
  selectedAuthority: 3,
  ...patch,
});

const records = (patch: Partial<StoredRecords> = {}): StoredRecords => ({
  instructions: "",
  plan: { legislation: [], caseLaw: [], secondary: [], themes: [] },
  issueCards: [
    {
      no: "ISSUE 1",
      short: "Termination during probation",
      q: "May the employer terminate without notice?",
      juris: "Ghana",
      pri: "High",
      state: "Analysis drafted",
      answer: "Likely.",
      pos: "Likely",
      risk: "Medium",
      auth: "Act 651, s. 27",
      assignee: "A. Osei",
      inReport: true,
      done: false,
      rule: "",
      application: "",
      counterpoint: "",
      conclusion: "",
      confidence: "",
      researchStatus: "",
      reasoning: "",
    },
  ],
  factRows: [
    {
      id: "F-01",
      fact: "Six-month probation from 1 March 2026",
      src: "Employment contract cl. 4",
      cls: "Verified",
      issue: "1, 2",
      conf: "High",
    },
    {
      id: "F-05",
      fact: "Date notice was delivered",
      src: "—",
      cls: "Missing",
      issue: "—",
      conf: "—",
    },
  ],
  assumptionRows: [
    {
      a: "The contract in the HR file is the executed version",
      why: "Only an unsigned copy was supplied",
      risk: "Conclusion on notice changes",
      state: "Pending",
    },
  ],
  riskRows: [
    {
      title: "Unfair-procedure claim",
      issue: "Issue 1",
      like: "Possible",
      imp: "Moderate",
      rate: "Medium",
      mit: "Hold a documented review",
      who: "HR lead",
      by: "12 Sept",
      override: null,
      action: "Hold a documented review",
      pri: "Short term",
      status: "Open",
    },
    {
      title: "Export without accredited refinery",
      issue: "Issue 3",
      like: "Likely",
      imp: "Severe",
      rate: "High",
      mit: "Confirm accreditation",
      who: "Compliance",
      by: "Immediate",
      override: "High",
      action: "Confirm accreditation",
      pri: "Immediate",
      status: "In progress",
    },
  ],
  draftRejected: true,
  selectedIssue: 0,
  format: "ILAC",
  deliv: { title: true, exec: true, risk: false },
  report: {
    version: "v1.0",
    locked: true,
    draft: "accepted",
    track: true,
    approvalSent: true,
    approvedAt: "12 Sept",
  },
  ...patch,
});

const roundTrip = (s: ResearchState, r: StoredRecords) => {
  const fields = toMatterFields({ kind: "comprehensive", title: "T", state: s, records: r });
  const children = toChildRows(s, r);
  return {
    state: stateFromRows(fields, children),
    records: recordsFromRows(fields, children),
  };
};

describe("research row mapping", () => {
  it("round-trips a fully populated research matter", () => {
    const s = state();
    const r = records();
    const back = roundTrip(s, r);
    // Pin and memo-section ids are client-generated and are replaced by row
    // ids on the way back; every other field must survive untouched.
    expect(back.state).toEqual({
      ...s,
      pins: s.pins.map((p, i) => ({ ...p, id: `pin-${i + 1}` })),
      memo: {
        ...s.memo,
        // An unformatted memo comes back with its documents explicitly absent.
        introDoc: s.memo.introDoc ?? null,
        sections: s.memo.sections.map((sec, i) => ({
          ...sec,
          id: `memo-${i + 1}`,
          doc: sec.doc ?? null,
        })),
      },
    });
    expect(back.records).toEqual(r);
  });

  it("round-trips an empty research matter", () => {
    const s = state({
      answer: null,
      pins: [],
      memo: { title: "", intro: "", style: "OSCOLA", sections: [] },
    });
    const r = coerceRecords(null);
    const back = roundTrip(s, r);
    expect(back.state).toEqual({ ...s, memo: { ...s.memo, introDoc: null } });
    expect(back.records).toEqual(r);
  });

  it("carries a memo section's formatting through the database and back", () => {
    // A memo is a document a lawyer signs their name to: the bold, the heading
    // and the alignment have to survive the round trip, not just the words.
    const doc = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "justify" },
          content: [
            { type: "text", text: "The rate is " },
            { type: "text", text: "enforceable", marks: [{ type: "bold" }] },
            { type: "text", text: "." },
          ],
        },
      ],
    };
    const s = state({
      memo: {
        title: "Interest",
        intro: "Intro.",
        introDoc: doc,
        style: "OSCOLA" as const,
        sections: [
          {
            id: "m1",
            no: "1",
            title: "Question",
            body: "The rate is enforceable.",
            cites: [],
            doc,
          },
        ],
      },
    });
    const back = roundTrip(s, records());
    expect(back.state.memo.introDoc).toEqual(doc);
    expect(back.state.memo.sections[0]!.doc).toEqual(doc);
    // The words stay exactly what they were, so everything reading the memo as
    // text is unaffected by the formatting living beside it.
    expect(back.state.memo.sections[0]!.body).toBe("The rate is enforceable.");
  });

  it("keeps 'not run yet' apart from 'ran and said nothing'", () => {
    const notRun = toMatterFields({
      kind: "simple",
      title: "T",
      state: state({ answer: null }),
      records: records(),
    });
    const ranEmpty = toMatterFields({
      kind: "simple",
      title: "T",
      state: state({ answer: { shortAnswer: "", findings: [], authorities: [] } }),
      records: records(),
    });
    expect(notRun.has_answer).toBe(false);
    expect(ranEmpty.has_answer).toBe(true);
    expect(
      stateFromRows(notRun, toChildRows(state({ answer: null }), records())).answer,
    ).toBeNull();
    expect(
      stateFromRows(
        ranEmpty,
        toChildRows(
          state({ answer: { shortAnswer: "", findings: [], authorities: [] } }),
          records(),
        ),
      ).answer,
    ).toEqual({ shortAnswer: "", findings: [], authorities: [] });
  });

  it("keeps a null risk override apart from an overridden rating", () => {
    const rows = toChildRows(state(), records());
    expect(rows.risks.map((r) => r.rating_override)).toEqual([null, "High"]);
    const back = recordsFromRows(
      toMatterFields({ kind: "simple", title: "T", state: state(), records: records() }),
      rows,
    );
    expect(back.riskRows.map((r) => r.override)).toEqual([null, "High"]);
  });

  it("keeps deliverable toggles that are off", () => {
    const fields = toMatterFields({
      kind: "simple",
      title: "T",
      state: state(),
      records: records(),
    });
    expect(fields.deliverable_sections).toEqual({ title: true, exec: true, risk: false });
    expect(recordsFromRows(fields, toChildRows(state(), records())).deliv).toEqual({
      title: true,
      exec: true,
      risk: false,
    });
  });

  it("carries the lawyer's instructions to the row and back", () => {
    const r = records({
      instructions: "Advise the board. UAE law as at today. Ignore transfer pricing.",
    });
    const fields = toMatterFields({ kind: "simple", title: "T", state: state(), records: r });
    expect(fields.instructions).toBe(
      "Advise the board. UAE law as at today. Ignore transfer pricing.",
    );
    expect(recordsFromRows(fields, toChildRows(state(), r)).instructions).toBe(
      "Advise the board. UAE law as at today. Ignore transfer pricing.",
    );
  });

  it("treats a matter written before instructions existed as having none", () => {
    const fields = toMatterFields({
      kind: "simple",
      title: "T",
      state: state(),
      records: records(),
    });
    const { instructions: _dropped, ...older } = fields;
    expect(recordsFromRows(older, toChildRows(state(), records())).instructions).toBe("");
  });

  it("keeps fact issue references verbatim, including the em dash", () => {
    const rows = toChildRows(state(), records());
    expect(rows.facts.map((f) => f.issue_refs)).toEqual(["1, 2", "—"]);
    expect(rows.facts.map((f) => f.ref)).toEqual(["F-01", "F-05"]);
  });

  it("restores children in ordinal order however the database returns them", () => {
    const s = state();
    const r = records();
    const fields = toMatterFields({ kind: "simple", title: "T", state: s, records: r });
    const rows = toChildRows(s, r);
    const shuffled = {
      ...rows,
      findings: [...rows.findings].reverse(),
      memoSections: [...rows.memoSections].reverse(),
      authorities: [...rows.authorities].reverse(),
      risks: [...rows.risks].reverse(),
      facts: [...rows.facts].reverse(),
    };
    expect(stateFromRows(fields, shuffled).answer?.findings).toEqual(s.answer?.findings);
    expect(stateFromRows(fields, shuffled).answer?.authorities.map((a) => a.n)).toEqual([1, 3]);
    expect(stateFromRows(fields, shuffled).memo.sections.map((x) => x.no)).toEqual(["1", "2"]);
    expect(recordsFromRows(fields, shuffled).riskRows.map((x) => x.title)).toEqual(
      r.riskRows.map((x) => x.title),
    );
    expect(recordsFromRows(fields, shuffled).factRows.map((x) => x.id)).toEqual(["F-01", "F-05"]);
  });
});

describe("the two saves partition the row", () => {
  // Each save writes one half of research_matters and one half of the child
  // tables. A column owned by both, or by neither, is how a save would
  // silently undo the other one.
  it("splits every column between the state save and the records save", () => {
    const stateKeys = Object.keys(toStateFields(state()));
    const recordKeys = Object.keys(toRecordFields(records()));
    const allKeys = Object.keys(
      toMatterFields({ kind: "simple", title: "T", state: state(), records: records() }),
    );
    expect(stateKeys.filter((k) => recordKeys.includes(k))).toEqual([]);
    expect([...stateKeys, ...recordKeys, "kind", "title"].sort()).toEqual([...allKeys].sort());
  });

  it("splits every child table between the two saves", () => {
    const answerKeys = Object.keys(toAnswerRows(state()));
    const recordKeys = Object.keys(toRecordRows(records()));
    expect(answerKeys.filter((k) => recordKeys.includes(k))).toEqual([]);
    expect([...answerKeys, ...recordKeys].sort()).toEqual(
      Object.keys(toChildRows(state(), records())).sort(),
    );
  });
});

describe("reading what the browser actually stored", () => {
  it("survives junk without losing what it can read", () => {
    const read = coerceState({
      topic: "Kept",
      question: 42,
      answer: { shortAnswer: "Kept too", findings: "nope", authorities: [{ cite: "Art. 1" }] },
      pins: [{ authority: "3" }],
      memo: { style: "Klingon", sections: [{ title: "One" }] },
      selectedAuthority: "3",
    });
    expect(read.topic).toBe("Kept");
    expect(read.question).toBe("");
    expect(read.answer?.shortAnswer).toBe("Kept too");
    expect(read.answer?.findings).toEqual([]);
    // A missing authority number falls back to its position, never to zero.
    expect(read.answer?.authorities[0]).toMatchObject({ n: 1, cite: "Art. 1", kind: "UNVERIFIED" });
    expect(read.pins[0]).toMatchObject({ id: "pin-1", authority: 0, section: 0, paragraph: 0 });
    expect(read.memo.style).toBe("OSCOLA");
    expect(read.memo.sections[0]).toMatchObject({ id: "memo-1", no: "1", title: "One" });
    expect(read.selectedAuthority).toBeNull();
  });

  it("reads an absent blob as an empty research matter, not a crash", () => {
    expect(coerceState(null).answer).toBeNull();
    expect(coerceState(undefined).pins).toEqual([]);
    expect(coerceRecords(null).report).toEqual({
      version: "v0.4",
      locked: false,
      draft: "pending",
      track: false,
      approvalSent: false,
      approvedAt: "",
    });
    expect(coerceRecords("not json at all").riskRows).toEqual([]);
  });

  it("fills in records written before a field existed", () => {
    const read = coerceRecords({
      issueCards: [{ short: "Old card" }],
      riskRows: [{ title: "Old risk" }],
      report: { locked: true },
    });
    expect(read.issueCards[0]).toMatchObject({
      no: "ISSUE 1",
      short: "Old card",
      assignee: "Unassigned",
      inReport: false,
      done: false,
    });
    expect(read.riskRows[0]).toMatchObject({ title: "Old risk", override: null, status: "Open" });
    expect(read.report).toMatchObject({ locked: true, draft: "pending", version: "v0.4" });
    expect(read.format).toBe("IRAC");
  });

  it("recovers the kind of an index entry from its id when the field is missing", () => {
    expect(coerceIndexEntry({ id: "comprehensive-abc", title: "R" })?.kind).toBe("comprehensive");
    expect(coerceIndexEntry({ id: "simple-abc" })?.kind).toBe("simple");
    expect(coerceIndexEntry({ id: "simple-abc" })?.title).toBe("Untitled research");
    expect(coerceIndexEntry({ title: "no id" })).toBeNull();
  });
});
