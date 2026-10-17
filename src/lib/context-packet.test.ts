import { describe, expect, it } from "vitest";
import {
  ancestorNums,
  buildContextPacket,
  definitionsUsedBy,
  isDirectChild,
  keywords,
  plausibleRules,
  renderForReview,
  resolveReferences,
  type PacketProvision,
  type PacketRule,
} from "./context-packet";

const provision = (num: string, title: string, kind = "provision"): PacketProvision => ({
  id: `id-${num}`,
  num,
  title,
  kind,
});

describe("the ancestor chain", () => {
  it("reads outermost first, so a section is named before its part", () => {
    expect(ancestorNums("8.3.1")).toEqual(["8", "8.3"]);
    expect(ancestorNums("8.3")).toEqual(["8"]);
  });

  it("gives a top-level clause no ancestors", () => {
    expect(ancestorNums("8")).toEqual([]);
  });
});

describe("siblings", () => {
  it("counts only direct children, not grandchildren", () => {
    expect(isDirectChild("8.3", "8")).toBe(true);
    expect(isDirectChild("8.3.1", "8")).toBe(false);
    expect(isDirectChild("81.1", "8")).toBe(false);
  });
});

describe("the definitions a provision actually uses", () => {
  const defs = [
    provision("1.1", "“Business Day”", "definition"),
    provision("1.2", "“Completion Date”", "definition"),
    provision("1.3", "“Affiliate”", "definition"),
    provision("1.4", "“Fees”", "definition"),
  ];

  it("retrieves the terms in the wording and leaves the rest behind", () => {
    // The whole point: not all thirty definitions, only the two used.
    const used = definitionsUsedBy(
      "Completion shall occur on the Completion Date, being a Business Day.",
      defs,
    );
    expect(used.map((d) => d.title)).toEqual(["“Business Day”", "“Completion Date”"]);
  });

  it("retrieves nothing where the provision uses no defined term", () => {
    expect(definitionsUsedBy("Each party shall bear its own costs.", defs)).toEqual([]);
  });

  it("does not match a term inside a longer word", () => {
    // "Affiliate" must not be found in "Affiliated", which is a different word.
    expect(definitionsUsedBy("The Affiliated entity shall comply.", defs)).toEqual([]);
  });

  it("matches a term that ends a sentence or is followed by punctuation", () => {
    expect(definitionsUsedBy("The Supplier shall pay the Fees.", defs).map((d) => d.num)).toEqual([
      "1.4",
    ]);
  });
});

describe("narrowing the playbook to what is plausibly in scope", () => {
  const rules: PacketRule[] = [
    {
      id: "r1",
      topic: "Limitation of liability",
      preferred: null,
      fallback: null,
      redflag: null,
      approvedText: null,
    },
    {
      id: "r2",
      topic: "Payment terms",
      preferred: null,
      fallback: null,
      redflag: null,
      approvedText: null,
    },
    {
      id: "r3",
      topic: "Confidentiality",
      preferred: null,
      fallback: null,
      redflag: null,
      approvedText: null,
    },
  ];

  it("offers the rules whose topic meets the provision, not the whole playbook", () => {
    const out = plausibleRules(["Limitation of Liability", "Exceptions to the cap"], rules);
    expect(out.rules.map((r) => r.id)).toEqual(["r1"]);
    expect(out.unfiltered).toBe(false);
  });

  it("falls back to the whole set when nothing matches, and says so", () => {
    // No signal is a reason to stay quiet, not a reason to claim no rule applies.
    const out = plausibleRules(["Miscellaneous"], rules);
    expect(out.rules).toHaveLength(3);
    expect(out.unfiltered).toBe(true);
  });

  it("ignores words that match everything", () => {
    // "Agreement" and "clause" appear in every contract and narrow nothing.
    expect(keywords("This Agreement and the clause")).toEqual([]);
  });
});

describe("resolving what a reference points at", () => {
  const byNum = new Map<string, PacketProvision>([
    ["8.1", provision("8.1", "The cap")],
    ["13", provision("13", "Confidentiality")],
  ]);

  it("resolves a clause reference to the provision itself", () => {
    const [ref] = resolveReferences([{ type: "clause", target: "8.1" }], byNum);
    expect(ref!.resolved?.id).toBe("id-8.1");
  });

  it("keeps a schedule reference unresolved rather than pointing it at a clause", () => {
    // Schedule 2 and clause 2 are different places, and Scripta holds only one
    // of them as clause rows.
    const [ref] = resolveReferences([{ type: "schedule", target: "2" }], byNum);
    expect(ref!.type).toBe("schedule");
    expect(ref!.target).toBe("2");
    expect(ref!.resolved).toBeNull();
  });

  it("keeps a reference whose target is missing, rather than dropping it", () => {
    // That a provision points somewhere Scripta cannot find is worth knowing.
    const [ref] = resolveReferences([{ type: "clause", target: "99" }], byNum);
    expect(ref!.target).toBe("99");
    expect(ref!.resolved).toBeNull();
  });
});

/* ----------------------------------------------------------------------- */
/* Whole-packet fixtures: the cases the packet exists to answer.            */
/* ----------------------------------------------------------------------- */

type Seed = {
  id: string;
  num: string;
  title: string;
  kind: string | null;
  refs?: { type: string; target: string }[];
  text?: string;
};

/** A contract where reviewing a provision alone gives an incomplete picture. */
const CONTRACT: Seed[] = [
  { id: "c1", num: "1", title: "Definitions and Interpretation", kind: "section" },
  {
    id: "c1a",
    num: "1.1",
    title: "“Business Day”",
    kind: "definition",
    text: "“Business Day” means any day other than a Saturday, Sunday or public holiday in Ghana;",
  },
  {
    id: "c1b",
    num: "1.2",
    title: "“Completion Date”",
    kind: "definition",
    text: "“Completion Date” means the date on which Completion occurs;",
  },
  {
    id: "c1c",
    num: "1.3",
    title: "“Confidential Information”",
    kind: "definition",
    refs: [{ type: "clause", target: "13" }],
    text: "“Confidential Information” has the meaning given in clause 13;",
  },
  {
    id: "c1d",
    num: "1.4",
    title: "“Fees”",
    kind: "definition",
    text: "“Fees” means the fees payable;",
  },
  { id: "c8", num: "8", title: "Limitation of Liability", kind: "section" },
  {
    id: "c81",
    num: "8.1",
    title: "The aggregate liability of the Supplier…",
    kind: "provision",
    text: "8.1 The aggregate liability of the Supplier shall not exceed the Fees paid in the preceding twelve months.",
  },
  {
    id: "c83",
    num: "8.3",
    title: "Exceptions",
    kind: "section",
    text: "8.3 The cap does not apply to:",
  },
  {
    id: "c83a",
    num: "8.3.1",
    title: "fraud",
    kind: "provision",
    text: "8.3.1 fraud or fraudulent misrepresentation;",
  },
  {
    id: "c83b",
    num: "8.3.2",
    title: "wilful misconduct",
    kind: "provision",
    refs: [
      { type: "clause", target: "8.1" },
      { type: "schedule", target: "2" },
    ],
    text: "8.3.2 wilful misconduct, in which case the limitation in clause 8.1 does not apply and Schedule 2 governs.",
  },
  {
    id: "c83c",
    num: "8.3.3",
    title: "death or personal injury",
    kind: "provision",
    text: "8.3.3 death or personal injury;",
  },
  {
    id: "c13",
    num: "13",
    title: "Confidentiality",
    kind: "section",
    text: "13 Each party shall keep the other's information confidential.",
  },
];

/** The narrowest possible stand-in for the database: rows in, rows out. */
function fakeClient(seed: Seed[], rules: { id: string; topic: string }[] = []) {
  const matter = {
    id: "m1",
    name: "Supply Agreement",
    matter_type: "Supply",
    governing_law: "Ghana",
    review_for: "Goldenmark",
    review_role: "Customer",
    review_instructions: "Protect the cap.",
    playbook_id: rules.length ? "pb1" : null,
  };
  const build = (table: string) => {
    const q: any = {
      _ids: null as string[] | null,
      select: () => q,
      eq: () => q,
      in: (_c: string, ids: string[]) => ((q._ids = ids), q),
      order: () => {
        if (table === "clauses")
          return Promise.resolve({
            data: seed.map((s) => ({
              id: s.id,
              num: s.num,
              title: s.title,
              kind: s.kind,
              refs: s.refs ?? [],
              page_ref: "p.1",
            })),
          });
        if (table === "clause_segments")
          return Promise.resolve({
            data: seed
              .filter((s) => (q._ids ?? []).includes(s.id) && s.text)
              .map((s) => ({ clause_id: s.id, ordinal: 1, text: s.text, kind: "n" })),
          });
        if (table === "playbook_rules")
          return Promise.resolve({
            data: rules.map((r) => ({
              ...r,
              preferred: null,
              fallback: null,
              redflag: null,
              approved_clause_text: null,
            })),
          });
        return Promise.resolve({ data: [] });
      },
      maybeSingle: () => Promise.resolve({ data: table === "matters" ? matter : null }),
    };
    return q;
  };
  return { from: build };
}

describe("a packet for a carve-out buried three levels down", () => {
  it("gives the provision its place, what it points at, and nothing else", async () => {
    const packet = await buildContextPacket(fakeClient(CONTRACT) as any, "m1", "c83b");
    expect(packet).not.toBeNull();

    // The provision itself.
    expect(packet!.target.num).toBe("8.3.2");
    expect(packet!.target.text).toContain("wilful misconduct");

    // What it is doing: "Exceptions", under "Limitation of Liability".
    expect(packet!.ancestors.map((a) => `${a.num} ${a.title}`)).toEqual([
      "8 Limitation of Liability",
      "8.3 Exceptions",
    ]);
    // The section's lead-in is worth its words — it governs what follows.
    expect(packet!.ancestors[1]!.text).toContain("The cap does not apply to:");

    // Its siblings are named, not quoted: their wording is a different review.
    expect(packet!.siblings.map((s) => s.num)).toEqual(["8.3.1", "8.3.3"]);
    expect(packet!.siblings.every((s) => s.text === undefined)).toBe(true);
  });

  it("resolves the clause it points at and keeps the schedule it cannot", async () => {
    const packet = await buildContextPacket(fakeClient(CONTRACT) as any, "m1", "c83b");
    const clause = packet!.references.find((r) => r.type === "clause")!;
    const schedule = packet!.references.find((r) => r.type === "schedule")!;

    // The cap itself arrives, in full: it is what the carve-out cuts into.
    expect(clause.target).toBe("8.1");
    expect(clause.resolved?.text).toContain("aggregate liability");

    // Schedule 2 is a different document. Kept, unresolved, and still
    // distinguishable from clause 2.
    expect(schedule.target).toBe("2");
    expect(schedule.resolved).toBeNull();
  });

  it("does not drag in all four definitions when the provision uses none", async () => {
    const packet = await buildContextPacket(fakeClient(CONTRACT) as any, "m1", "c83b");
    expect(packet!.definitions).toEqual([]);
  });
});

describe("a packet for a definition that defines by reference", () => {
  it("retrieves the clause the definition points at", async () => {
    // '"Confidential Information" has the meaning given in clause 13' is
    // meaningless on its own, which is the whole reason for this work.
    const packet = await buildContextPacket(fakeClient(CONTRACT) as any, "m1", "c1c");
    const ref = packet!.references[0]!;
    expect(ref.target).toBe("13");
    expect(ref.resolved?.text).toContain("keep the other's information confidential");
  });

  it("places it under Definitions, and names its neighbours without quoting them", async () => {
    const packet = await buildContextPacket(fakeClient(CONTRACT) as any, "m1", "c1c");
    expect(packet!.ancestors.map((a) => a.num)).toEqual(["1"]);
    expect(packet!.siblings.map((s) => s.num)).toEqual(["1.1", "1.2", "1.4"]);
  });
});

describe("a packet for a provision that uses defined terms", () => {
  it("retrieves the terms it uses and leaves the others behind", async () => {
    const packet = await buildContextPacket(fakeClient(CONTRACT) as any, "m1", "c81");
    // 8.1 uses "Fees". It does not use Business Day, Completion Date or
    // Confidential Information, and none of them should arrive.
    expect(packet!.definitions.map((d) => d.title)).toEqual(["“Fees”"]);
    expect(packet!.definitions[0]!.text).toContain("means the fees payable");
  });
});

describe("narrowing the playbook for a real provision", () => {
  const rules = [
    { id: "r1", topic: "Limitation of liability" },
    { id: "r2", topic: "Payment terms" },
    { id: "r3", topic: "Confidentiality" },
  ];

  it("offers the liability rule for a liability carve-out, not the whole playbook", async () => {
    const packet = await buildContextPacket(fakeClient(CONTRACT, rules) as any, "m1", "c83b");
    expect(packet!.guidance.rules.map((r) => r.id)).toEqual(["r1"]);
    expect(packet!.guidance.rulesUnfiltered).toBe(false);
  });
});

describe("what the review engine is actually handed", () => {
  it("states structure without drawing legal conclusions from it", async () => {
    const packet = await buildContextPacket(fakeClient(CONTRACT) as any, "m1", "c83b");
    const rendered = renderForReview(packet!);

    expect(rendered).toContain("THE PROVISION BEING REVIEWED:");
    expect(rendered).toContain("8 Limitation of Liability");
    expect(rendered).toContain("IT REFERS TO THESE PROVISIONS");
    expect(rendered).toContain("aggregate liability of the Supplier");

    // Siblings are named; their wording is absent.
    expect(rendered).toContain("8.3.1 fraud");
    expect(rendered).not.toContain("fraudulent misrepresentation");

    // The line the packet must never cross: it reports the reference, it does
    // not decide that the provision is an exception to the cap.
    expect(rendered).not.toMatch(/exception to the (liability )?cap/i);
    expect(rendered).not.toContain("carve-out");
  });

  it("does not flood the prompt with the rest of the contract", async () => {
    const packet = await buildContextPacket(fakeClient(CONTRACT) as any, "m1", "c83b");
    const rendered = renderForReview(packet!);
    // Definitions the provision does not use stay out of it.
    expect(rendered).not.toContain("Business Day");
    expect(rendered).not.toContain("Completion Date");
  });
});
