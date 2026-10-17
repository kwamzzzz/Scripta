import { describe, expect, it } from "vitest";
import {
  buildPreview,
  cleanRuns,
  outstandingCount,
  outstandingFacts,
  redlineRuns,
} from "./preview";
import type { ExportClause } from "./docx";

const clause = (num: string, title: string, segs: ExportClause["segs"]): ExportClause => ({
  num,
  title,
  segs,
});

const untouched = clause("1", "Definitions", [{ t: "In this agreement…", k: "n" }]);
const edited = clause("2", "Interest", [
  { t: "Interest accrues at ", k: "n" },
  { t: "5%", k: "d" },
  { t: "7%", k: "i" },
  { t: " per annum.", k: "n" },
]);
const deletedWhole = clause("3", "Indemnity", [{ t: "The Supplier indemnifies…", k: "d" }]);

describe("cleanRuns", () => {
  it("drops deletions and keeps insertions as ordinary text", () => {
    expect(cleanRuns(edited)).toEqual([
      { text: "Interest accrues at ", kind: "n" },
      { text: "7%", kind: "n" },
      { text: " per annum.", kind: "n" },
    ]);
  });

  it("leaves nothing behind for a clause deleted whole", () => {
    expect(cleanRuns(deletedWhole)).toEqual([]);
  });

  it("skips empty segments rather than printing blank runs", () => {
    expect(cleanRuns(clause("4", "Term", [{ t: "", k: "n" }]))).toEqual([]);
  });
});

describe("redlineRuns", () => {
  it("keeps every change with its kind", () => {
    expect(redlineRuns(edited).map((r) => r.kind)).toEqual(["n", "d", "i", "n"]);
  });
});

describe("buildPreview", () => {
  it("keeps the two columns in step, row for row", () => {
    const p = buildPreview([untouched, edited, deletedWhole]);
    expect(p.clean).toHaveLength(3);
    expect(p.redline).toHaveLength(3);
    expect(p.clean.map((c) => c.num)).toEqual(p.redline.map((c) => c.num));
  });

  it("marks a clause that survives nowhere in the clean copy", () => {
    const p = buildPreview([untouched, deletedWhole]);
    expect(p.clean[0]!.emptyWhenClean).toBe(false);
    expect(p.clean[1]!.emptyWhenClean).toBe(true);
  });

  it("counts changed and removed clauses", () => {
    const p = buildPreview([untouched, edited, deletedWhole]);
    expect(p.changed).toBe(2);
    expect(p.removed).toBe(1);
  });

  it("counts nothing on a document nobody has edited", () => {
    const p = buildPreview([untouched]);
    expect(p.changed).toBe(0);
    expect(p.removed).toBe(0);
  });

  it("handles a document with no clauses without inventing a row", () => {
    expect(buildPreview([])).toEqual({
      clean: [],
      redline: [],
      changed: 0,
      removed: 0,
      comparable: false,
    });
  });

  it("says there is nothing to compare on a document drafted from scratch", () => {
    // Every segment is ordinary text, so the two readings are the same words.
    expect(buildPreview([untouched]).comparable).toBe(false);
  });

  it("says there is something to compare as soon as one clause is edited", () => {
    expect(buildPreview([untouched, edited]).comparable).toBe(true);
  });

  it("counts a clause deleted whole as something to compare", () => {
    expect(buildPreview([untouched, deletedWhole]).comparable).toBe(true);
  });
});

describe("outstandingFacts", () => {
  const withGaps: ExportClause[] = [
    clause("1", "Parties", [{ t: "Between {{Client name}} and {{Consultant name}}.", k: "n" }]),
    clause("2", "Term", [{ t: "One year from {{Start date}}.", k: "n" }]),
    clause("3", "Fees", [{ t: "As agreed.", k: "n" }]),
  ];

  it("lists what is missing, per clause, and says where", () => {
    expect(outstandingFacts(withGaps)).toEqual([
      { where: "1 Parties", fields: ["Client name", "Consultant name"] },
      { where: "2 Term", fields: ["Start date"] },
    ]);
  });

  it("scans the cover and preamble too, where an address usually goes missing", () => {
    const front = {
      cover: [{ text: "EMPLOYMENT CONTRACT" }],
      preamble: [{ text: "(1) Acme, of {{First party address}};" }],
    };
    expect(outstandingFacts([], front)[0]).toEqual({
      where: "Cover and preamble",
      fields: ["First party address"],
    });
  });

  it("ignores a placeholder inside wording that is being deleted", () => {
    const struck = clause("4", "Salary", [
      { t: "Salary of {{Old salary}}.", k: "d" },
      { t: "Fees of {{Day rate}}.", k: "i" },
    ]);
    expect(outstandingFacts([struck])).toEqual([{ where: "4 Salary", fields: ["Day rate"] }]);
  });

  it("says nothing about a document that needs nothing", () => {
    expect(outstandingFacts([withGaps[2]!])).toEqual([]);
  });

  it("counts a fact asked for twice as one thing to find", () => {
    const twice: ExportClause[] = [
      clause("1", "A", [{ t: "{{Start date}}", k: "n" }]),
      clause("2", "B", [{ t: "{{start date}}", k: "n" }]),
    ];
    expect(outstandingCount(outstandingFacts(twice))).toBe(1);
  });
});

describe("the preview reads the clause's document, as the file does", () => {
  const table: ExportClause = {
    num: "Schedule 1",
    title: "Fees",
    // The stale shadow the exporters ignore when there are paragraphs.
    segs: [{ t: "| Monthly support | 4,500 |", k: "n" }],
    paras: [
      {
        runs: [],
        grid: {
          rows: [
            {
              cells: [
                [{ t: "Monthly support", k: "n" }],
                [
                  { t: "5,500", k: "d" },
                  { t: "6,000", k: "i" },
                ],
              ],
            },
          ],
        },
      },
    ],
  };

  it("shows the tracked change inside a table, not the stale segments", () => {
    const preview = buildPreview([table]);
    expect(preview.comparable).toBe(true);
    expect(preview.changed).toBe(1);
    expect(preview.clean[0]!.runs.map((r) => r.text).join("")).toBe("| Monthly support | 6,000 |");
    expect(preview.redline[0]!.runs.filter((r) => r.kind === "d").map((r) => r.text)).toEqual([
      "5,500",
    ]);
  });

  it("does not call a heading with no body deleted", () => {
    const heading: ExportClause = { num: "Schedule 2", title: "Services", segs: [] };
    expect(buildPreview([heading]).clean[0]!.emptyWhenClean).toBe(false);
  });
});
