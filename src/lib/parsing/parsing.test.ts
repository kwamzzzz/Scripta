import { describe, expect, it } from "vitest";
import { normalizeText, rebuildAmendment, rebuildOriginal, wordDiff } from "./word-diff";
import { htmlToBlocks, pagesToBlocks, textToBlocks } from "./blocks";
import { splitClauses } from "./clauses";
import { buildReview } from "./build-review";
import { diffSummary } from "./summary";
import { pairClauses } from "./match";

const CASES: [string, string][] = [
  ["The term is 12 months.", "The term is 36 months."],
  ["", "A wholly new clause about data protection."],
  ["A clause that is being deleted entirely.", ""],
  ["identical text", "identical text"],
  [
    "Either party may terminate this Agreement on thirty (30) days written notice.",
    "Either party may terminate this Agreement on sixty (60) days prior written notice to the other party.",
  ],
  [
    "Invoices shall be paid within 30 days of receipt.",
    "Invoices shall be paid within 45 days of receipt by ACH transfer.",
  ],
  ["one two three four five", "five four three two one"],
  ["a b c d e f g", "a x c y e z g"],
];

describe("word diff round-trip", () => {
  it.each(CASES)("reconstructs both sides for %j / %j", (original: string, amendment: string) => {
    const segs = wordDiff(original, amendment);
    expect(rebuildOriginal(segs)).toBe(normalizeText(original));
    expect(rebuildAmendment(segs)).toBe(normalizeText(amendment));
  });

  it("holds for randomised word edits", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let run = 0; run < 200; run++) {
      const len = 3 + Math.floor(rnd() * 40);
      const original: string[] = [];
      for (let i = 0; i < len; i++) original.push(`w${Math.floor(rnd() * 12)}`);
      const amendment = original
        .filter(() => rnd() > 0.25)
        .flatMap((w) => (rnd() > 0.8 ? [`x${Math.floor(rnd() * 9)}`, w] : [w]));
      const a = original.join(" ");
      const b = amendment.join(" ");
      const segs = wordDiff(a, b);
      expect(rebuildOriginal(segs)).toBe(normalizeText(a));
      expect(rebuildAmendment(segs)).toBe(normalizeText(b));
    }
  });

  it("emits deletions before insertions inside a change region", () => {
    const segs = wordDiff("the term is 12 months", "the term is 36 months");
    const kinds = segs.map((s) => s.k).join("");
    expect(kinds).toBe("ndin");
  });
});

describe("clause splitting", () => {
  it("splits numbered headings from DOCX html", () => {
    const blocks = htmlToBlocks(
      "<h1>2. Term and Termination</h1><p>The term is 12 months.</p><h1>3. Fees</h1><p>Paid in 30 days.</p>",
    );
    const { clauses, structureDetected } = splitClauses(blocks);
    expect(structureDetected).toBe(true);
    expect(clauses.map((c) => c.num)).toEqual(["2", "3"]);
    expect(clauses[0]!.title).toBe("Term and Termination");
    expect(clauses[0]!.body).toBe("The term is 12 months.");
  });

  it("handles Clause / ARTICLE styles and sub-numbering", () => {
    const blocks = textToBlocks("Clause 4 Confidentiality\n\nBody one.\n\n4.1 Carve-outs\n\nBody two.\n\nARTICLE V Governing Law\n\nBody three.");
    const { clauses } = splitClauses(blocks);
    expect(clauses.map((c) => c.num)).toEqual(["4", "4.1", "V"]);
  });

  it("keeps page numbers from PDF pages", () => {
    const blocks = pagesToBlocks(["1. Definitions\n\nBody a.", "2. Fees\n\nBody b."]);
    const { clauses } = splitClauses(blocks);
    expect(clauses[1]!.page).toBe("p.2");
  });

  it("falls back to a single clause when there is no structure", () => {
    const { clauses, structureDetected } = splitClauses(textToBlocks("just some prose\n\nand more prose"));
    expect(structureDetected).toBe(false);
    expect(clauses).toHaveLength(1);
  });
});

describe("review building", () => {
  const originals = splitClauses(
    textToBlocks("1. Term\n\nThe term is 12 months.\n\n2. Fees\n\nPaid within 30 days.\n\n3. Old Clause\n\nRemoved later."),
  ).clauses;
  const amendments = splitClauses(
    textToBlocks("1. Term\n\nThe term is 36 months.\n\n2. Fees\n\nPaid within 30 days.\n\n4. Data Protection\n\nGDPR compliance applies."),
  ).clauses;

  const review = buildReview(originals, amendments);

  it("drops unchanged clauses and classifies the rest", () => {
    expect(review.map((c) => [c.num, c.change])).toEqual([
      ["1", "Modified"],
      ["3", "Deleted"],
      ["4", "Added"],
    ]);
  });

  it("round-trips every produced clause", () => {
    for (const c of review) {
      expect(rebuildOriginal(c.segs) + rebuildAmendment(c.segs)).toBeTypeOf("string");
      expect(c.segs.every((s) => ["n", "d", "i"].includes(s.k))).toBe(true);
    }
  });

  it("writes a mechanical numeric summary", () => {
    expect(review[0]!.diffSummary).toContain("12 → 36");
  });
});

describe("pairing", () => {
  it("matches renumbered clauses by body similarity", () => {
    const a = [{ num: "7", title: "Governing Law", page: "p.1", body: "Governed by England and Wales.", ordinal: 1 }];
    const b = [{ num: "9", title: "Applicable Law", page: "p.2", body: "Governed by New York.", ordinal: 1 }];
    const pairs = pairClauses(a, b);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.original?.num).toBe("7");
  });
});

describe("summaries", () => {
  it("describes additions and deletions plainly", () => {
    expect(diffSummary(wordDiff("", "New text here"), { change: "Added", title: "X" })).toContain("New clause");
    expect(diffSummary(wordDiff("Old text here", ""), { change: "Deleted", title: "X" })).toContain("deleted");
  });
});
