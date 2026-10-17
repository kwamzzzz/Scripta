import { describe, expect, it } from "vitest";
import {
  dayHasClosed,
  groupByMatter,
  localDay,
  reportSearchText,
  summarise,
  type WorkEntry,
} from "./model";
import { reportClauses, reportText } from "./export";

const entry = (patch: Partial<WorkEntry> = {}): WorkEntry => ({
  id: "e1",
  title: "Draft the engagement letter",
  at: "2026-09-14T09:00:00.000Z",
  matterId: "m1",
  matterName: "WAGAS — Gold Trade Advisory",
  ...patch,
});

describe("what the report refuses to be", () => {
  /**
   * The rule, stated as a test: a report is made of completed tasks and
   * nothing else. Deliverables, versions and audit events were all sources
   * once, and each of them was a trace of work happening rather than somebody
   * saying it was finished. Re-adding one is a decision, not a tidy-up.
   */
  it("counts nothing that resembles a score", () => {
    const line = summarise([entry(), entry({ id: "e2", matterId: "m2", matterName: "Atlas" })]);
    expect(line).toBe("2 items · 2 matters");
    expect(line).not.toMatch(/hour|minute|%|point|score/i);
  });

  it("says plainly when a day held nothing", () => {
    expect(summarise([])).toBe("Nothing recorded");
    expect(summarise([entry({ excluded: true })])).toBe("Nothing recorded");
  });
});

describe("a day gathered under its matters", () => {
  const entries = [
    entry({ id: "a", at: "2026-09-14T11:00:00.000Z" }),
    entry({ id: "b", at: "2026-09-14T09:30:00.000Z", title: "Send the reminder" }),
    entry({
      id: "c",
      at: "2026-09-14T10:00:00.000Z",
      matterId: null,
      matterName: "",
      title: "Read the GoldBod circular",
    }),
    entry({ id: "d", at: "2026-09-14T08:00:00.000Z", matterId: "m2", matterName: "Atlas" }),
  ];

  it("puts four things on one matter together, not four times down a feed", () => {
    const groups = groupByMatter(entries);
    expect(groups.map((g) => g.matterName)).toEqual([
      "Atlas",
      "WAGAS — Gold Trade Advisory",
      "Not filed to a matter",
    ]);
    expect(groups[1]!.entries.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("leaves unfiled work at the end, where it belongs", () => {
    expect(groupByMatter(entries).at(-1)!.matterId).toBeNull();
  });

  it("drops what the lawyer took out, and keeps the entry so the decision shows", () => {
    const groups = groupByMatter([...entries, entry({ id: "x", excluded: true })]);
    expect(groups.flatMap((g) => g.entries).map((e) => e.id)).not.toContain("x");
  });
});

describe("when a day is finished with", () => {
  const at = (h: number, m: number) =>
    new Date(`2026-09-14T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);

  it("is not closed before half past five", () => {
    expect(dayHasClosed(localDay(at(17, 29)), at(17, 29))).toBe(false);
  });

  it("closes at half past five", () => {
    expect(dayHasClosed(localDay(at(17, 30)), at(17, 30))).toBe(true);
  });

  it("treats yesterday as closed whatever the time", () => {
    expect(dayHasClosed("2026-09-13", at(9, 0))).toBe(true);
  });

  it("does not close a day that has not happened", () => {
    expect(dayHasClosed("2026-09-15", at(23, 0))).toBe(false);
  });
});

describe("finding a day again", () => {
  it("answers to the matter, the tool and the note", () => {
    const text = reportSearchText({
      day: "2026-09-14",
      note: "Prep for the Tuesday call",
      entries: [entry({ tool: "Corporate Drafting", output: "Board resolution" })],
    });
    expect(text).toContain("WAGAS");
    expect(text).toContain("Corporate Drafting");
    expect(text).toContain("Board resolution");
    expect(text).toContain("Tuesday call");
  });
});

describe("the day as a document", () => {
  const entries = [
    entry({
      id: "a",
      at: "2026-09-14T09:30:00.000Z",
      title: "Send the reminder",
      tool: "Legal Research",
    }),
    entry({
      id: "b",
      at: "2026-09-14T11:00:00.000Z",
      output: "Board resolution",
      note: "For the Tuesday call",
    }),
    entry({
      id: "c",
      at: "2026-09-14T10:00:00.000Z",
      matterId: null,
      matterName: "",
      title: "Read the circular",
    }),
  ];

  it("sets a section per matter, numbered so a reader can point at one", () => {
    const clauses = reportClauses(entries, "");
    expect(clauses.map((c) => c.title)).toEqual([
      "WAGAS — Gold Trade Advisory",
      "Not filed to a matter",
    ]);
    expect(clauses.map((c) => c.num)).toEqual(["1", "2"]);
  });

  it("keeps the context you added with the task it belongs to", () => {
    const body = reportClauses(entries, "")[0]!.segs[0]!.t;
    expect(body).toContain("Board resolution");
    expect(body).toContain("For the Tuesday call");
    expect(body).toContain("Legal Research");
  });

  it("closes with the note on the day, unnumbered — it is not another matter", () => {
    const clauses = reportClauses(entries, "Quiet morning, long afternoon.");
    expect(clauses.at(-1)).toMatchObject({ num: "", title: "Note on the day" });
  });

  it("leaves out what you took out", () => {
    const clauses = reportClauses(
      [...entries, entry({ id: "x", title: "Dropped", excluded: true })],
      "",
    );
    expect(JSON.stringify(clauses)).not.toContain("Dropped");
  });

  it("writes plain text for the commonest use, which is pasting it", () => {
    const text = reportText("2026-09-14", entries, "");
    expect(text.startsWith("Work report — Monday, 14 September 2026")).toBe(true);
    expect(text).toContain("  - ");
    expect(text).not.toMatch(/[<>*_#]/);
  });

  it("says so when a day held nothing", () => {
    expect(reportText("2026-09-14", [], "")).toContain("No tasks completed.");
  });
});
