import { describe, expect, it } from "vitest";
import { blockSummary, readBlocks, textToBlocks } from "./blocks";

const ids = () => {
  let n = 0;
  return () => `b${++n}`;
};

describe("textToBlocks", () => {
  it("makes one paragraph per blank-line-separated chunk and joins wrapped lines", () => {
    expect(textToBlocks("First line\nwraps here.\n\nSecond.", ids())).toEqual([
      { id: "b1", type: "paragraph", text: "First line wraps here." },
      { id: "b2", type: "paragraph", text: "Second." },
    ]);
  });

  it("reads the prefixes for headings, clauses, checks and authorities", () => {
    const blocks = textToBlocks(
      "## Sources\n\n> Islamic Sharia shall be a main source.\n\n? Name the sources.\n\nAuthority: Constitution, Art. 7 | Sharia as a main source",
      ids(),
    );
    expect(blocks.map((b) => b.type)).toEqual(["heading", "clause", "check", "authority"]);
    expect(blocks[0]?.text).toBe("Sources");
    expect(blocks[3]).toEqual({
      id: "b4",
      type: "authority",
      cite: "Constitution, Art. 7",
      text: "Sharia as a main source",
    });
  });

  it("ignores empty input and survives a round trip through readBlocks", () => {
    expect(textToBlocks("  \n\n ")).toEqual([]);
    const blocks = textToBlocks("Authority: Law No. 6 of 2018", ids());
    expect(readBlocks({ blocks })).toEqual([
      { id: "b1", type: "authority", cite: "Law No. 6 of 2018", text: "" },
    ]);
  });
});

describe("pasting practice material", () => {
  it("reads a practice question with its right answer and explanation", () => {
    const [q] = textToBlocks(
      "Q: Which article makes Sharia a main source?\n- Article 1\n* Article 7\n- Article 121\nWhy: Article 7 says so.",
      ids(),
    );
    expect(q).toEqual({
      id: "b1",
      type: "quiz",
      text: "Which article makes Sharia a main source?",
      options: ["Article 1", "Article 7", "Article 121"],
      answers: [1],
      explanation: "Article 7 says so.",
    });
  });

  it("reads lettered options with the answer given by letter", () => {
    const [q] = textToBlocks(
      "Q: Which applies?\nA) Article 1\nB) Article 7\nC) Article 121\nAnswer: B and C\nWhy: Both do.",
      ids(),
    );
    expect(q?.options).toEqual(["Article 1", "Article 7", "Article 121"]);
    expect(q?.answers).toEqual([1, 2]);
    expect(q?.explanation).toBe("Both do.");
  });

  it("makes a deck when every line is front :: back", () => {
    const [deck] = textToBlocks("Art. 7 :: Sharia a main source\nArt. 113 :: decree-laws", ids());
    expect(deck?.type).toBe("flashcards");
    expect(deck?.cards).toEqual([
      { front: "Art. 7", back: "Sharia a main source" },
      { front: "Art. 113", back: "decree-laws" },
    ]);
  });

  it("reads a Markdown table and skips its separator line", () => {
    const [table] = textToBlocks("| Law | Year |\n| --- | --- |\n| Arbitration | 2018 |", ids());
    expect(table?.rows).toEqual([
      ["Law", "Year"],
      ["Arbitration", "2018"],
    ]);
  });

  it("keeps a media block's file reference and drops one without a path", () => {
    const blocks = readBlocks({
      blocks: [
        {
          id: "m1",
          type: "media",
          text: "Overview",
          media: { kind: "audio", path: "w/x.m4a", name: "x.m4a", mime: "audio/mp4", bytes: 10 },
        },
        { id: "m2", type: "media", text: "broken" },
      ],
    });
    expect(blocks.map((b) => b.id)).toEqual(["m1"]);
    expect(blocks[0]?.media?.kind).toBe("audio");
  });
});

describe("blockSummary", () => {
  it("names what an item holds besides reading", () => {
    expect(
      blockSummary({
        blocks: [
          {
            id: "a",
            type: "media",
            text: "",
            media: { kind: "audio", path: "p", name: "a.m4a", mime: "", bytes: 1 },
          },
          { id: "q", type: "quiz", text: "?", options: ["a", "b"], answers: [0] },
          {
            id: "f",
            type: "flashcards",
            text: "",
            cards: [
              { front: "a", back: "b" },
              { front: "c", back: "d" },
            ],
          },
        ],
      }),
    ).toBe("audio · 1 question · 2 flashcards");
  });
});

describe("caveats and credits", () => {
  it("reads a caveat and a credit, with an empty name left as a space to fill", () => {
    const blocks = textToBlocks(
      "! Replaced by Federal Decree-Law No. 25 of 2025.\n\nCredit: Hassan Fadda | Director, Corporate Tax | KPMG Lower Gulf\n\nCredit:  | Course tutor | ",
      ids(),
    );
    expect(blocks.map((b) => b.type)).toEqual(["caveat", "credit", "credit"]);
    expect(blocks[1]).toMatchObject({
      text: "Hassan Fadda",
      cite: "Director, Corporate Tax",
      org: "KPMG Lower Gulf",
    });
    expect(blocks[2]).toMatchObject({ text: "", cite: "Course tutor" });
  });
});

describe("author notes", () => {
  it("keeps a note's example lines instead of reading them as content", () => {
    const [n] = textToBlocks("Note: Paste cards like this:\nfront :: back", ids());
    expect(n).toEqual({ id: "b1", type: "note", text: "Paste cards like this:\nfront :: back" });
  });

  it("reads a note for authors", () => {
    expect(textToBlocks("Note: Drop the audio lesson here.", ids())).toEqual([
      { id: "b1", type: "note", text: "Drop the audio lesson here." },
    ]);
  });
});
