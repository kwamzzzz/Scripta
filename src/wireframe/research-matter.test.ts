import { describe, expect, it } from "vitest";
import { WF } from "./data";
import { emptyRecords, readRecords, withRecordDefaults } from "./research-matter";
import type { StoredIssue } from "@/lib/research-rows";

/** The wireframe fixtures predate the analysis fields; the tests only care about identity. */
const asIssues = (rows: readonly unknown[]) => rows as unknown as StoredIssue[];

describe("emptyRecords", () => {
  it("starts a matter with no issues, facts, assumptions or risks", () => {
    const records = emptyRecords();
    expect(records.issueCards).toEqual([]);
    expect(records.factRows).toEqual([]);
    expect(records.assumptionRows).toEqual([]);
    expect(records.riskRows).toEqual([]);
  });

  it("keeps the deliverable sections a download offers", () => {
    expect(Object.keys(emptyRecords().deliv)).toEqual(WF.delivRows.map((r) => r.key));
  });
});

describe("withRecordDefaults", () => {
  it("returns empty records when nothing is stored", () => {
    expect(withRecordDefaults(undefined)).toEqual(emptyRecords());
  });

  it("keeps every row a matter holds — the database is not second-guessed", () => {
    const records = withRecordDefaults({
      issueCards: asIssues([...WF.issueCards]),
      factRows: [...WF.factRows],
    });
    expect(records.issueCards).toEqual(asIssues([...WF.issueCards]));
    expect(records.factRows).toEqual([...WF.factRows]);
  });

  it("fills in the deliverable sections a matter has never saved", () => {
    expect(withRecordDefaults({ deliv: {} }).deliv).toEqual(emptyRecords().deliv);
  });

  it("fills in fields written before they existed", () => {
    const records = withRecordDefaults({ report: { version: "v0.4" } as never });
    expect(records.report.locked).toBe(false);
    expect(records.report.version).toBe("v0.4");
    expect(records.format).toBe("IRAC");
  });
});

describe("readRecords", () => {
  it("returns empty records when nothing is stored", () => {
    expect(readRecords(undefined)).toEqual(emptyRecords());
  });

  it("drops rows left behind by the wireframe demo seed", () => {
    const records = readRecords({
      issueCards: asIssues([...WF.issueCards]),
      factRows: [...WF.factRows],
      assumptionRows: [...WF.assumptionRows],
    });
    expect(records.issueCards).toEqual([]);
    expect(records.factRows).toEqual([]);
    expect(records.assumptionRows).toEqual([]);
  });

  it("keeps a seeded row the user has since edited", () => {
    const edited = { ...WF.factRows[0]!, fact: "Employee engaged on 3-month probation" };
    const records = readRecords({ factRows: [edited, ...WF.factRows.slice(1)] });
    expect(records.factRows).toEqual([edited]);
  });

  it("keeps rows the user added", () => {
    const own = { ...WF.factRows[0]!, id: "F-09", fact: "Notice served by hand on 3 September" };
    expect(readRecords({ factRows: [own] }).factRows).toEqual([own]);
  });

  it("clamps the selected issue to the issues that remain", () => {
    expect(
      readRecords({ selectedIssue: 2, issueCards: asIssues([...WF.issueCards]) }).selectedIssue,
    ).toBe(0);
  });
});
