import { describe, expect, it } from "vitest";
import {
  asDoc,
  docToText,
  hasFormatting,
  sameDoc,
  textToDoc,
  type ClauseDoc,
} from "./clause-doc";

const para = (...text: string[]): ClauseDoc => ({
  type: "doc",
  content: text.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })),
});

describe("textToDoc", () => {
  it("makes one paragraph per line", () => {
    expect(textToDoc("one\ntwo")).toEqual(para("one", "two"));
  });

  it("keeps a blank line as an empty paragraph", () => {
    expect(textToDoc("one\n\ntwo").content).toHaveLength(3);
  });
});

describe("docToText", () => {
  it("round-trips plain text", () => {
    const text = "The Supplier shall indemnify the Customer.\nThis clause survives termination.";
    expect(docToText(textToDoc(text))).toBe(text);
  });

  it("ignores formatting, because bolding a word does not amend the contract", () => {
    const plain = para("The Supplier shall indemnify the Customer.");
    const bold: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "The " },
            { type: "text", text: "Supplier", marks: [{ type: "bold" }] },
            { type: "text", text: " shall indemnify the Customer." },
          ],
        },
      ],
    };
    expect(docToText(bold)).toBe(docToText(plain));
  });

  it("puts each list item on its own line", () => {
    const doc: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "second" }] }] },
          ],
        },
      ],
    };
    expect(docToText(doc)).toBe("first\nsecond");
  });

  it("separates table cells with a tab and rows with a line", () => {
    const cell = (text: string): import("./clause-doc").DocNode => ({
      type: "tableCell",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
    const doc: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            { type: "tableRow", content: [cell("Band"), cell("Rate")] },
            { type: "tableRow", content: [cell("Senior"), cell("£450")] },
          ],
        },
      ],
    };
    expect(docToText(doc)).toBe("Band\tRate\nSenior\t£450");
  });

  it("breaks a line on a hard break", () => {
    const doc: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "one" },
            { type: "hardBreak" },
            { type: "text", text: "two" },
          ],
        },
      ],
    };
    expect(docToText(doc)).toBe("one\ntwo");
  });

  it("drops the editor's trailing empty paragraph", () => {
    const doc: ClauseDoc = { type: "doc", content: [...para("one").content, { type: "paragraph" }] };
    expect(docToText(doc)).toBe("one");
  });

  it("reads an empty document as an empty string", () => {
    expect(docToText(null)).toBe("");
    expect(docToText({ type: "doc", content: [] })).toBe("");
  });
});

describe("hasFormatting", () => {
  it("is false for plain paragraphs", () => {
    expect(hasFormatting(textToDoc("one\ntwo"))).toBe(false);
  });

  it("is true once a run is marked", () => {
    const doc: ClauseDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "italic" }] }] },
      ],
    };
    expect(hasFormatting(doc)).toBe(true);
  });

  it("is true for a block a string could not hold", () => {
    const doc: ClauseDoc = { type: "doc", content: [{ type: "bulletList", content: [] }] };
    expect(hasFormatting(doc)).toBe(true);
  });
});

describe("asDoc", () => {
  it("accepts a document and rejects anything else", () => {
    expect(asDoc(textToDoc("x"))).not.toBeNull();
    expect(asDoc(null)).toBeNull();
    expect(asDoc("text")).toBeNull();
    expect(asDoc({ type: "paragraph" })).toBeNull();
  });
});

/**
 * The comparison that decides whether a lawyer has unsaved work.
 *
 * `jsonb` sorts object keys, so a document that has been saved comes back
 * reordered and a string compare never calls it equal again. The tracked editor
 * used a string compare, and after anchoring a note — the one path that saves
 * and leaves the editor open — it offered "Leave without saving" over a note
 * already on the clause.
 */
describe("whether two documents say the same thing", () => {
  const editorOrder: ClauseDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Schedule",
            marks: [{ type: "commentRef", attrs: { threadId: "t1" } }],
          },
        ],
      },
    ],
  };

  /* The same document after a round trip through Postgres: keys sorted by
     length then bytewise, so "text" comes out ahead of "type". */
  const afterTheDatabase = JSON.parse(
    '{"type":"doc","content":[{"content":[{"marks":[{"attrs":{"threadId":"t1"},' +
      '"type":"commentRef"}],"text":"Schedule","type":"text"}],"type":"paragraph"}]}',
  ) as ClauseDoc;

  it("is not fooled by the key order the database hands back", () => {
    expect(JSON.stringify(editorOrder)).not.toBe(JSON.stringify(afterTheDatabase));
    expect(sameDoc(editorOrder, afterTheDatabase)).toBe(true);
  });

  it("still notices a document that actually changed", () => {
    const edited = JSON.parse(JSON.stringify(editorOrder)) as ClauseDoc;
    edited.content[0]!.content![0]!.text = "Schedule 3";
    expect(sameDoc(editorOrder, edited)).toBe(false);
  });

  it("notices a mark added, removed, or re-attributed", () => {
    const unanchored = JSON.parse(JSON.stringify(editorOrder)) as ClauseDoc;
    delete unanchored.content[0]!.content![0]!.marks;
    expect(sameDoc(editorOrder, unanchored)).toBe(false);

    const otherThread = JSON.parse(JSON.stringify(editorOrder)) as ClauseDoc;
    otherThread.content[0]!.content![0]!.marks![0]!.attrs = { threadId: "t2" };
    expect(sameDoc(editorOrder, otherThread)).toBe(false);
  });

  it("treats nothing and nothing as the same, and nothing and something as different", () => {
    expect(sameDoc(null, null)).toBe(true);
    expect(sameDoc(null, undefined)).toBe(true);
    expect(sameDoc(null, editorOrder)).toBe(false);
  });
});
