/**
 * The two standalone exports, proved from synthetic rows so they run anywhere.
 */
import { describe, expect, it } from "vitest";
import { buildDeviationsXlsx, buildSheetXml } from "./export-xlsx";
import { buildDeviationsDocx, deviationsTable, proposedRuns } from "./export-docx";
import type { DeviationRow } from "./rows";

const ROWS: DeviationRow[] = [
  {
    reference: "Clause 5.3",
    original: "Payment shall be made within sixty (60) days.",
    proposed: [
      { text: "Payment shall be made within ", kind: "same" },
      { text: "sixty (60)", kind: "delete" },
      { text: "thirty (30)", kind: "insert" },
      { text: " days.", kind: "same" },
    ],
    paragraphs: [12],
    isNew: false,
    isDeleted: false,
  },
  {
    reference: "New clause (proposed as 5.4)",
    original: "[No equivalent provision in the Agreement]",
    proposed: [
      { text: "5.4 ", kind: "label" },
      { text: "The Vendor may suspend for non-payment.", kind: "insert" },
    ],
    paragraphs: [13],
    isNew: true,
    isDeleted: false,
  },
];
const REASONS = ["Aligns payment with the Vendor's standard terms.", "Introduces a payment remedy."];
const SHARED = { rows: ROWS, justifications: REASONS, bidder: "Acme Advisory", responseDate: "22 September 2026" };

/** Entry names, read out of the local file headers rather than guessed at. */
const zipNames = (bytes: Uint8Array): string[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names: string[] = [];
  for (let at = 0; at + 30 <= bytes.length; ) {
    if (view.getUint32(at, true) !== 0x04034b50) break;
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    const size = view.getUint32(at + 18, true);
    names.push(new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength)));
    at += 30 + nameLength + extraLength + size;
  }
  return names;
};

describe("the workbook Scripta lays out itself", () => {
  const sheet = buildSheetXml(SHARED);

  it("heads the columns and dates the justification column", () => {
    expect(sheet).toContain("Clause Ref.");
    expect(sheet).toContain("The Bidder&apos;s Proposed Clause".replace("&apos;", "'"));
    expect(sheet).toContain("Brief Justification / Comments for the Proposed Change (22 September 2026)");
  });

  it("marks an addition red and a deletion struck through, in one cell", () => {
    const d2 = /<c r="D2"[\s\S]*?<\/c>/.exec(sheet)![0];
    expect(d2).toContain("<strike/>");
    expect(d2).toContain('<color rgb="FFC00000"/>');
    expect(d2).toContain("thirty (30)");
    expect(d2).toContain("sixty (60)");
    // Untouched wording carries no colour of its own.
    expect(d2.indexOf("Payment shall be made within")).toBeLessThan(d2.indexOf("<strike/>"));
  });

  it("orders the run properties as CT_RPrElt requires, rFont first", () => {
    // Excel refuses a workbook whose rPr children are out of sequence — "we
    // found a problem with some content" — and the repair strips every cell
    // style with it, so the wrapping goes too. openpyxl reads it regardless,
    // which is why this is asserted here rather than left to a round trip.
    const props = /<rPr>([\s\S]*?)<\/rPr>/.exec(sheet)![1]!;
    expect(props.startsWith('<rFont val="Arial"/>')).toBe(true);
    const order = [...props.matchAll(/<(\w+)[ />]/g)].map((m) => m[1]!);
    const schema = ["rFont", "charset", "family", "b", "i", "strike", "color", "sz", "u"];
    const ranks = order.map((name) => schema.indexOf(name));
    expect(ranks.every((rank) => rank >= 0)).toBe(true);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("keeps a struck run's properties in sequence too", () => {
    const d2 = /<c r="D2"[\s\S]*?<\/c>/.exec(sheet)![0];
    const struck = [...d2.matchAll(/<rPr>([\s\S]*?)<\/rPr>/g)]
      .map((m) => m[1]!)
      .find((p) => p.includes("<strike/>"))!;
    expect(struck).toBe(
      '<rFont val="Arial"/><strike/><color rgb="FFC00000"/><sz val="10"/>',
    );
  });

  it("repeats the bidder down the rows and keeps the reasons alongside", () => {
    expect(sheet).toContain("Acme Advisory");
    expect(sheet).toContain("Introduces a payment remedy.");
  });

  it("freezes the headings, filters them, and sizes the columns", () => {
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2"');
    expect(sheet).toContain('<autoFilter ref="A1:E3"/>');
    expect(sheet).toContain('<col min="1" max="1" width="26"');
    expect(sheet).toContain('<dimension ref="A1:E3"/>');
  });

  it("packs the six parts a workbook needs", () => {
    const names = zipNames(buildDeviationsXlsx(SHARED));
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ])
      expect(names).toContain(part);
  });
});

describe("the Word table", () => {
  it("shows changes as formatting, never as tracked revisions", () => {
    const runs = proposedRuns(ROWS[0]!);
    expect(runs.map((r) => r.k)).toEqual(["n", "n", "n", "n"]);
    expect(runs[1]!.m).toEqual({ colour: "C00000", strike: true });
    expect(runs[2]!.m).toEqual({ colour: "C00000" });
  });

  it("gives the clause reference a narrow column and the prose the rest", () => {
    const table = deviationsTable(ROWS, REASONS);
    expect(table.widths).toHaveLength(4);
    expect(table.widths![0]).toBeLessThan(table.widths![1]!);
    expect(table.rows[0]!.header).toBe(true);
    expect(table.rows).toHaveLength(3);
  });

  it("builds a landscape document with no revisions in it", () => {
    const bytes = buildDeviationsDocx({ ...SHARED, agreement: "Services Agreement" });
    const xml = new TextDecoder().decode(bytes);
    expect(xml).toContain('w:orient="landscape"');
    expect(xml).toContain("<w:strike/>");
    expect(xml).toContain('<w:color w:val="C00000"/>');
    // The point of the whole exercise: Accept All must not touch a schedule.
    expect(xml).not.toContain("<w:ins ");
    expect(xml).not.toContain("<w:del ");
    expect(xml).toContain("<w:tblHeader/>");
  });
});
