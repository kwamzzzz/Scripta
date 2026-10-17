import { describe, expect, it } from "vitest";
import { scanPunctuation, summarise, type BlockKind } from "./punctuation";

const gaps = (text: string, kind: BlockKind = "prose") => scanPunctuation(text, kind).gaps;
const levels = (text: string, kind: BlockKind = "prose") => gaps(text, kind).map((g) => g.level);

describe("marks", () => {
  it("lists every punctuation mark in the text", () => {
    const text = "The Seller (as defined) shall—on demand—pay: “all sums”; don’t delay!";
    const { marks } = scanPunctuation(text);
    expect(marks.map((i) => text[i]).join("")).toBe("()——:“”;’!");
  });

  it("does not count a separator inside a number", () => {
    const { marks } = scanPunctuation("It cost 1,000.50 at 10:30 under clause 3.5.");
    expect(marks.length).toBe(1);
  });
});

describe("the end of a block (certain)", () => {
  it("flags a paragraph with no closing mark", () => {
    const g = gaps(
      "The Seller shall deliver the goods to the Buyer within thirty days of the order date",
    );
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ level: "missing", at: 84 });
  });

  it("accepts every closing mark, before or after a quotation mark or bracket", () => {
    for (const text of [
      "The parties agreed to the terms set out below.",
      "Did the parties agree to the terms set out below?",
      "The following terms apply to this agreement:",
      "The Seller shall deliver the goods to the Buyer;",
      "The parties call this “the Agreement”.",
      "The parties call this document “the Agreement.”",
      "The parties agreed (subject to contract.)",
      "The parties agreed to the terms set out below.12",
      "The parties agreed to the terms set out below.[3]",
      "the Seller shall deliver the goods to the Buyer; and",
      "each of the parties to this agreement; or",
    ])
      expect(levels(text), text).toEqual([]);
  });

  it("still flags a number that ends a sentence, since it is not a note marker", () => {
    expect(
      levels(
        "The parties signed the agreement on 3 March 2020 in the presence of witnesses in 2020",
      ),
    ).toEqual(["missing"]);
  });

  it("claims a short sentence with no full stop, rather than taking it for a heading", () => {
    expect(levels("The Seller shall pay the Buyer on demand")).toEqual(["missing"]);
  });

  it("asks rather than claims for a label, a field or a table entry", () => {
    expect(levels("Build and included revisions")).toEqual(["check"]);
    expect(levels("Concept selection and any remaining concepts")).toEqual(["check"]);
    expect(levels("Client notice email: someone@example.com")).toEqual(["check"]);
    expect(levels("Bank: The National Bank of Ras Al Khaimah (P.S.C) Account Number: 033304748001")).toEqual([
      "check",
    ]);
    // …but a sentence cut off mid-reference is certain.
    expect(
      levels("Payment falls due once the output is accessible and a release notice has been received under clause"),
    ).toEqual(["missing"]);
  });

  it("asks rather than claims when the block may be a heading", () => {
    expect(levels("Introduction")).toEqual(["check"]);
    expect(levels("Governing Law and Jurisdiction")).toEqual(["check"]);
    expect(levels("SCHEDULE ONE PART A")).toEqual(["check"]);
    expect(levels("Prepared for: NEXIS AFRICA MEA FZCO")).toEqual(["check"]);
    expect(levels("Monday, September 21, 2026")).toEqual(["check"]);
  });

  it("asks about a list item, and a block ending in a comma or a dash", () => {
    expect(levels("the delivery of the goods to the Buyer", "item")).toEqual(["check"]);
    expect(levels("The Seller shall deliver the goods to the Buyer within thirty days,")).toEqual([
      "check",
    ]);
    expect(levels("The Seller shall deliver the goods to the Buyer within thirty days —")).toEqual([
      "check",
    ]);
  });

  it("does not ask a heading, a table cell or a blank for filling in", () => {
    expect(gaps("Governing law", "heading")).toEqual([]);
    expect(gaps("Total due to the seller", "cell")).toEqual([]);
    expect(gaps("Signed by the director of the company in the presence of: ________")).toEqual([]);
    expect(gaps("")).toEqual([]);
    expect(gaps("3.1")).toEqual([]);
  });
});

describe("brackets and quotation marks (certain)", () => {
  it("flags a bracket opened and never closed, pointing at the opener", () => {
    const text = "The Seller (acting through its agent shall deliver the goods.";
    const g = gaps(text);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ level: "missing", mark: 11 });
    expect(g[0]!.reason).toMatch(/bracket.*never closed/);
  });

  it("flags a closing bracket or quotation mark with no opener", () => {
    const g = gaps("The Seller acting through its agent) shall deliver “the goods”” today.");
    expect(g.map((x) => x.level)).toEqual(["missing", "missing"]);
    expect(g.every((x) => x.mark !== undefined)).toBe(true);
  });

  it("flags a curly quotation left open", () => {
    expect(levels("The Buyer called it “the Goods and nothing more.")).toEqual(["missing"]);
  });

  it("leaves enumerators such as a) and iv) alone", () => {
    expect(gaps("a) the Seller shall deliver the goods; and b) the Buyer shall pay.")).toEqual([]);
    expect(gaps("The duties are: iv) to deliver the goods on time.")).toEqual([]);
  });

  it("asks about an odd number of straight quotation marks", () => {
    expect(levels('The Buyer called it "the Goods and nothing more.')).toEqual(["check"]);
    expect(gaps('The Buyer called it "the Goods" and nothing more.')).toEqual([]);
  });

  it("treats the curly apostrophe as closing an opened single quote only when one follows", () => {
    expect(gaps("The so-called ‘firm offer’ lapsed.")).toEqual([]);
    expect(levels("The so-called ‘firm offer lapsed.")).toEqual(["check"]);
  });
});

describe("likely misses inside a sentence (check)", () => {
  it("asks about a sentence that starts with no full stop before it", () => {
    const text = "The parties agreed the price The Seller shall deliver the goods.";
    const g = gaps(text);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ level: "check", at: text.indexOf(" The Seller") });
  });

  it("does not ask when the capital word is the object of the one before", () => {
    expect(gaps("This agreement is made with The Company and its successors.")).toEqual([]);
  });

  it("asks for the comma after an opening connective", () => {
    expect(levels("However the Seller did not deliver.")).toEqual(["check"]);
    expect(levels("The goods arrived late. For example the crates were damaged.")).toEqual([
      "check",
    ]);
    expect(gaps("However, the Seller did not deliver.")).toEqual([]);
    expect(gaps("However much the Seller tried, the goods arrived late.")).toEqual([]);
  });

  it("does not look inside headings or cells for sentences", () => {
    expect(gaps("Scope However Limited", "heading")).toEqual([]);
  });
});

describe("summarise", () => {
  it("adds up marks and gaps across blocks", () => {
    expect(
      summarise([
        { text: "The parties agreed.", kind: "prose" },
        { text: "The parties never finished this sentence at any point today", kind: "prose" },
        { text: "Introduction", kind: "prose" },
      ]),
    ).toEqual({ marks: 1, missing: 1, check: 1 });
  });
});
