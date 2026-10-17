import { describe, expect, it } from "vitest";
import { textToBlocks } from "./blocks";
import { chunk, readingSegments, speakable } from "./reader";

let n = 0;
const blocks = (text: string) => textToBlocks(text, () => `b${++n}`);

describe("speakable", () => {
  it("reads a citation's name, not its web address", () => {
    expect(
      speakable(
        "[Federal Tax Authority / Corporate Tax Guide / section 4 / https://tax.gov.ae/guide.pdf]",
      ),
    ).toBe("Federal Tax Authority, Corporate Tax Guide, section 4");
  });

  it("turns arrows into words", () => {
    expect(speakable("Parent → 100% → OpCo")).toBe("Parent to 100% to OpCo");
  });
});

describe("chunk", () => {
  it("cuts long passages at sentence ends", () => {
    const s = "One short sentence here. ".repeat(20).trim();
    const parts = chunk(s, 100);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 100)).toBe(true);
    expect(parts.join(" ")).toBe(s);
  });

  it("keeps a sentence whole even when it is longer than the limit", () => {
    const long = "x".repeat(300) + ".";
    expect(chunk(long, 100)).toEqual([long]);
  });
});

describe("readingSegments", () => {
  it("reads headings, paragraphs, clauses, caveats and questions, and skips notes", () => {
    const segs = readingSegments(
      blocks(
        [
          "## The idea",
          "A plain paragraph.",
          "> The quoted rule.",
          "! Check this at the source.",
          "? What would change the answer?",
          "Note: for authors only.",
        ].join("\n\n"),
      ),
    ).map((s) => s.text);
    expect(segs).toEqual([
      "The idea.",
      "A plain paragraph.",
      "Quoted: The quoted rule.",
      "Check the current position. Check this at the source.",
      "A question to think about. What would change the answer?",
    ]);
  });

  it("reads an authority as its citation and rule, without the link", () => {
    const [seg] = readingSegments(
      blocks(
        "Authority: [MoF / Cabinet Decision 100 of 2023 / Article 3 / https://mof.gov.ae/x.pdf] | Qualifying income is limited. (Status: Confirmed Law)",
      ),
    );
    expect(seg?.text).toBe(
      "MoF, Cabinet Decision 100 of 2023, Article 3. Qualifying income is limited. (Status: Confirmed Law)",
    );
  });

  it("reads a table row by row with its column names", () => {
    const segs = readingSegments(
      blocks("| Role | Entity |\n|---|---|\n| Sales | Mainland LLC |\n| HQ | Free zone |"),
    ).map((s) => s.text);
    expect(segs).toEqual(["Role: Sales. Entity: Mainland LLC.", "Role: HQ. Entity: Free zone."]);
  });

  it("reads a practice question and its options but never the answer", () => {
    const text = readingSegments(
      blocks("Q: Which rate?\nA) 0%\nB) 9%\nAnswer: B\nWhy: Because it is taxable."),
    )
      .map((s) => s.text)
      .join(" ");
    expect(text).toContain("Practice question. Which rate?");
    expect(text).toContain("A: 0%. B: 9%.");
    expect(text).not.toMatch(/Because it is taxable|Answer/);
  });

  it("reads flashcard fronts only", () => {
    const text = readingSegments(blocks("QFZP :: Qualifying Free Zone Person\nCT :: Corporate Tax"))
      .map((s) => s.text)
      .join(" ");
    expect(text).toBe("Flashcards. Card 1: QFZP. Card 2: CT.");
  });

  it("keeps every piece of a long paragraph tied to its block", () => {
    const [block] = blocks("A sentence of some length that goes on. ".repeat(12).trim());
    const segs = readingSegments([block!]);
    expect(segs.length).toBeGreaterThan(1);
    expect(new Set(segs.map((s) => s.blockId))).toEqual(new Set([block!.id]));
  });
});
