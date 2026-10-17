import { describe, expect, it } from "vitest";
import type { ClauseDoc } from "./clause-doc";
import { countIn, replaceInDoc } from "./pinpoint";
import { changesIn, ifAccepted, operative, acceptSet } from "./tracked-change";
import { docToText } from "./clause-doc";

const stamp = { setId: "s_1", authorId: "u_1", at: "2026-09-19T00:00:00.000Z" };
const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const cell = (text: string) => ({ type: "tableCell", content: [para(text)] });
const table = (rows: string[][]): ClauseDoc => ({
  type: "doc",
  content: [
    {
      type: "table",
      content: rows.map((r) => ({ type: "tableRow", content: r.map(cell) })),
    },
  ],
});

const approval = table([
  [
    "Approval",
    "Drafts sent 3 Business Days before posting; Client responds within 2 3 Business Days.",
  ],
  ["Publishing", "By the Client."],
]);

const done = (out: ReturnType<typeof replaceInDoc>) => {
  if (!out.ok) throw new Error(out.problem);
  return out.doc;
};

describe("replaceInDoc", () => {
  it("strikes only the word that goes, inside a table cell", () => {
    const doc = done(
      replaceInDoc(
        approval,
        "responds within 2 3 Business Days",
        "responds within 3 Business Days",
        stamp,
      ),
    );
    const changes = changesIn(doc);
    expect(changes).toEqual([
      expect.objectContaining({ kind: "deletion", text: "2 ", authorId: "u_1", setId: "s_1" }),
    ]);
    // The table is still a table, and the other cells are untouched.
    expect(doc.content[0]!.type).toBe("table");
    expect(docToText(operative(doc))).toBe(docToText(approval));
    expect(docToText(ifAccepted(doc))).toContain("Client responds within 3 Business Days.");
    expect(docToText(ifAccepted(doc))).toContain("By the Client.");
  });

  it("puts the new words beside the old ones", () => {
    const doc = done(
      replaceInDoc(
        table([["Fee", "Payable within 30 days of invoice."]]),
        "within 30 days",
        "within 7 days",
        stamp,
      ),
    );
    const changes = changesIn(doc);
    expect(changes.map((c) => [c.kind, c.text])).toEqual([
      ["deletion", "30 "],
      ["insertion", "7 "],
    ]);
    expect(docToText(ifAccepted(doc))).toContain("Payable within 7 days of invoice.");
    // Accepting the sitting settles the replacement as one act.
    expect(changesIn(acceptSet(doc, "s_1"))).toEqual([]);
    expect(docToText(acceptSet(doc, "s_1"))).toContain("Payable within 7 days of invoice.");
  });

  it("matches however the quote's quotes, dashes and spaces were typed", () => {
    const doc: ClauseDoc = {
      type: "doc",
      content: [para("The “Fee” is due — in  full — on signing.")],
    };
    const out = done(
      replaceInDoc(
        doc,
        '"Fee" is due - in full - on signing',
        '"Fee" is due in full within 7 days',
        stamp,
      ),
    );
    expect(docToText(ifAccepted(out))).toBe("The “Fee” is due in  full within 7 days.");
  });

  it("adds words at the end with a space", () => {
    const doc: ClauseDoc = { type: "doc", content: [para("Payment is due on signing")] };
    const out = done(
      replaceInDoc(doc, "due on signing", "due on signing of this Agreement", stamp),
    );
    expect(docToText(ifAccepted(out))).toBe("Payment is due on signing of this Agreement");
  });

  it("keeps the formatting of the words it replaces", () => {
    const doc: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Fee: " },
            { type: "text", text: "USD 5,000", marks: [{ type: "bold" }] },
          ],
        },
      ],
    };
    const out = done(replaceInDoc(doc, "USD 5,000", "USD 6,000", stamp));
    const inserted = out.content[0]!.content!.find((n) =>
      n.marks?.some((m) => m.type === "insertion"),
    );
    expect(inserted?.marks?.map((m) => m.type)).toEqual(["bold", "insertion"]);
  });

  it("refuses words that are missing, repeated or already under a proposal", () => {
    expect(replaceInDoc(approval, "10 Business Days", "5 Business Days", stamp)).toMatchObject({
      ok: false,
    });
    expect(countIn(approval, "Business Days")).toBe(2);
    expect(replaceInDoc(approval, "Business Days", "days", stamp)).toMatchObject({
      ok: false,
      problem: expect.stringContaining("2 times"),
    });
    const once = done(replaceInDoc(approval, "within 2 3", "within 3", stamp));
    expect(replaceInDoc(once, "within 2 3", "within 4", stamp)).toMatchObject({
      ok: false,
      problem: expect.stringContaining("tracked change"),
    });
    expect(replaceInDoc(approval, "By the Client.", "By the Client.", stamp)).toMatchObject({
      ok: false,
    });
  });

  it("changes the case of a word when the new wording does", () => {
    const doc: ClauseDoc = {
      type: "doc",
      content: [para("The Supplier's total liability shall not exceed the Fees.")],
    };
    const out = done(
      replaceInDoc(
        doc,
        "The Supplier's total liability",
        "Except for fraud, the Supplier's total liability",
        stamp,
      ),
    );
    expect(docToText(ifAccepted(out))).toBe(
      "Except for fraud, the Supplier's total liability shall not exceed the Fees.",
    );
  });
});
