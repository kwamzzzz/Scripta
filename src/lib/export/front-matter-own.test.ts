import { describe, expect, it } from "vitest";
import {
  buildFrontMatter,
  frontMatterSource,
  readFrontMatterEdits,
} from "./front-matter";

const MATTER = {
  agreementType: "Services Agreement",
  client: "Nexis Africa MEA FZCO",
  counterparty: "Alexander Dzogbenuku",
  date: "",
};

const OWN = [
  "This Services Agreement is made between the following Parties and takes effect on the date of the last signature below.",
  "BETWEEN",
  "Nexis Africa MEA FZCO, licensed by the Dubai World Trade Center Authority under license number L-3434 (the Client); and",
  "Alexander Dzogbenuku, an individual providing services under the brand MDRN Designs (the Service Provider).",
].join("\n");

describe("the lines that used to be fixed", () => {
  it("takes the drafter's wording for BETWEEN, the collective line and the operative words", () => {
    const front = buildFrontMatter(
      frontMatterSource(MATTER, {
        betweenText: "BETWEEN",
        partiesText:
          "(the Client and the Service Provider are together referred to as the “Parties” and each individually as a “Party”).",
        agreedText: "IT IS AGREED as follows:",
      }),
    );
    const text = front.preamble.map((l) => l.text);
    expect(text).toContain("BETWEEN");
    expect(text).not.toContain("BETWEEN:");
    expect(text).toContain("IT IS AGREED as follows:");
    expect(text.some((t) => t.startsWith("(the Client and the Service Provider"))).toBe(true);
    // Typed wording is one plain run; the bold belonged to the composed sentence.
    expect(front.preamble.find((l) => l.part === "parties")!.runs).toBeUndefined();
  });

  it("keeps the house wording when nothing was typed", () => {
    const front = buildFrontMatter(frontMatterSource(MATTER, {}));
    const text = front.preamble.map((l) => l.text);
    expect(text).toContain("BETWEEN:");
    expect(text).toContain("NOW IT IS HEREBY AGREED as follows:");
    expect(front.preamble.find((l) => l.part === "parties")!.runs).toBeTruthy();
  });

  it("treats whitespace as nothing typed", () => {
    const front = buildFrontMatter(frontMatterSource(MATTER, { betweenText: "  " }));
    expect(front.preamble.map((l) => l.text)).toContain("BETWEEN:");
  });

  it("survives a round trip through storage", () => {
    const stored = readFrontMatterEdits({ betweenText: "BETWEEN", agreedText: "IT IS AGREED:" });
    expect(stored.betweenText).toBe("BETWEEN");
    expect(stored.agreedText).toBe("IT IS AGREED:");
  });
});

describe("a contract that already has a preamble", () => {
  it("uses the document's own words, not the house template", () => {
    const front = buildFrontMatter(frontMatterSource(MATTER, { preamble: OWN }));
    const text = front.preamble.map((l) => l.text).join("\n");
    expect(text).toContain("licensed by the Dubai World Trade Center Authority");
    // None of the form's scaffolding, and none of its placeholders.
    expect(text).not.toContain("NOW IT IS HEREBY AGREED");
    expect(text).not.toContain("First party address");
    expect(text).not.toContain("Why the parties are contracting");
    expect(text).not.toMatch(/\[Date\]/);
  });

  it("marks every line of it as one editable part", () => {
    const front = buildFrontMatter(frontMatterSource(MATTER, { preamble: OWN }));
    expect(new Set(front.preamble.map((l) => l.part))).toEqual(new Set(["own"]));
    expect(front.preamble).toHaveLength(4);
  });

  it("sets a short all-capitals line bold, as the firm sets one", () => {
    const front = buildFrontMatter(frontMatterSource(MATTER, { preamble: OWN }));
    const between = front.preamble.find((l) => l.text === "BETWEEN")!;
    expect(between.strong).toBe(true);
    expect(front.preamble.find((l) => l.text.startsWith("This Services"))!.strong).toBeUndefined();
  });

  it("still builds the template when the document has no preamble", () => {
    const front = buildFrontMatter(frontMatterSource(MATTER, {}));
    const text = front.preamble.map((l) => l.text).join("\n");
    expect(text).toContain("NOW IT IS HEREBY AGREED as follows:");
    expect(front.preamble.some((l) => l.part === "own")).toBe(false);
  });

  it("keeps the cover and the execution pages either way", () => {
    const own = buildFrontMatter(frontMatterSource(MATTER, { preamble: OWN }));
    expect(own.cover).toHaveLength(1);
    expect(own.execution).toHaveLength(2);
  });

  it("survives a round trip through storage", () => {
    const stored = readFrontMatterEdits({ preamble: OWN, client: "Someone" });
    expect(stored.preamble).toBe(OWN);
    // Whitespace-only is not a preamble; the template should come back.
    expect(frontMatterSource(MATTER, { preamble: "   " }).ownPreamble).toBeUndefined();
  });
});
