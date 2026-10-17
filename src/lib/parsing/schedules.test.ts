import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { htmlToBlocks, type Block } from "./blocks";
import { splitClauses } from "./clauses";
import { scheduleHeading } from "./schedules";
import { bodyToDoc, hasTable } from "./table-doc";

const b = (text: string, heading = false): Block => ({ text, page: 1, heading });

async function fixtureClauses() {
  const mammoth = await import("mammoth");
  const buf = readFileSync(new URL("./__fixtures__/services-with-schedules.docx", import.meta.url));
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  return splitClauses(htmlToBlocks(html)).clauses;
}

describe("a contract with schedules and tables (real Word file)", () => {
  it("keeps the operative clauses clean of the schedules after them", async () => {
    const clauses = await fixtureClauses();
    const liability = clauses.find((c) => c.num === "4")!;
    expect(liability.title).toBe("Liability");
    expect(liability.body).not.toMatch(/SCHEDULE|Onboarding/);
  });

  it("never reads a table cell or a schedule paragraph as a main clause", async () => {
    const nums = (await fixtureClauses()).map((c) => c.num);
    expect(nums).not.toContain("180");
    expect(new Set(nums).size).toBe(nums.length);
    expect(nums.filter((n) => /^\d+$/.test(n))).toEqual(["1", "2", "3", "4"]);
  });

  it("files each schedule as its own section, with its paragraphs under it", async () => {
    const clauses = await fixtureClauses();
    const s1 = clauses.find((c) => c.num === "Schedule 1")!;
    expect(s1.title).toBe("Fees");
    expect(s1.kind).toBe("section");
    expect(s1.body.split("\n")).toEqual([
      "| Service | Fee (USD) | Payable |",
      "| Onboarding | 25,000 | On signing |",
      "| Monthly support | 4,500 | Monthly in arrears |",
      "| Change requests | 180 per hour | On invoice |",
    ]);
    expect(clauses.find((c) => c.num === "Schedule 1.1")).toMatchObject({
      parent: "Schedule 1",
      body: "Fees are exclusive of VAT.",
    });
    expect(clauses.find((c) => c.num === "Schedule 1.2")?.body).toMatch(/2% per month/);
    const s21 = clauses.find((c) => c.num === "Schedule 2.1")!;
    expect(s21.title).toBe("Service levels");
    expect(s21.body).toContain("| P1 | 1 hour |");
  });

  it("keeps the references that tie the agreement to its schedules", async () => {
    const clauses = await fixtureClauses();
    expect(clauses.find((c) => c.num === "1")?.refs).toContainEqual({
      type: "schedule",
      target: "1",
    });
    expect(clauses.find((c) => c.num === "2")?.refs).toContainEqual({
      type: "schedule",
      target: "2",
    });
  });

  it("builds a real table for the editor from a schedule's text", async () => {
    const s1 = (await fixtureClauses()).find((c) => c.num === "Schedule 1")!;
    const doc = bodyToDoc(s1.body)!;
    const table = doc.content[0]!;
    expect(table.type).toBe("table");
    expect(table.content).toHaveLength(4);
    expect(table.content![0]!.content![0]!.type).toBe("tableHeader");
    expect(table.content![1]!.content).toHaveLength(3);
    expect(bodyToDoc("No table here.")).toBeNull();
    expect(hasTable("text\n| a | b |")).toBe(true);
  });
});

describe("schedules in a Word-numbered contract", () => {
  it("reads them instead of stopping at the first one", () => {
    const { clauses } = splitClauses([
      b("NOW IT IS HEREBY AGREED as follows:"),
      b("DEFINITIONS", true),
      b("“Deliverables” means the items listed in Annex A."),
      b("PAYMENT", true),
      b("The Customer shall pay within 30 days of invoice."),
      b("TERM", true),
      b("This Agreement lasts two years."),
      b("ANNEX A", true),
      b("DELIVERABLES", true),
      {
        text: "| Item | Due |\n| Report | Week 4 |",
        page: 1,
        heading: false,
        table: [
          ["Item", "Due"],
          ["Report", "Week 4"],
        ],
      },
    ]);
    expect(clauses.map((c) => c.num)).toEqual(["1", "2", "3", "Annex A"]);
    expect(clauses[3]!.title).toBe("Deliverables");
    expect(clauses[3]!.body).toContain("| Report | Week 4 |");
  });
});

describe("recognising a schedule heading", () => {
  it("accepts headings and capitals, in the forms drafters use", () => {
    expect(scheduleHeading(b("SCHEDULE 1 – FEES"))).toEqual({
      label: "Schedule",
      id: "1",
      title: "FEES",
    });
    expect(scheduleHeading(b("Annexure B: Form of Guarantee", true))).toMatchObject({
      label: "Annex",
      id: "B",
    });
    expect(scheduleHeading(b("APPENDIX II"))).toMatchObject({ label: "Appendix", id: "II" });
    expect(scheduleHeading(b("SCHEDULE"))).toMatchObject({ label: "Schedule", id: "" });
  });
  it("refuses a sentence about a schedule, and a contents line", () => {
    expect(
      scheduleHeading(b("Schedule 1 sets out the Fees payable under this Agreement.")),
    ).toBeNull();
    expect(scheduleHeading(b("Schedule 1 Fees ........ 14"))).toBeNull();
    expect(scheduleHeading(b("Schedule of condition"))).toBeNull();
  });
  it("files an execution block after a schedule as the execution, not a clause", () => {
    const { clauses } = splitClauses([
      b("1. Term"),
      b("One year."),
      b("2. Fees"),
      b("As in Schedule 1."),
      b("SCHEDULE 1 – FEES"),
      b("1. The fee is USD 10,000."),
      b("SIGNED by the parties on the date above."),
    ]);
    const s = clauses.find((c) => c.num === "Schedule 1.1")!;
    expect(s.body).toBe("The fee is USD 10,000.");
    expect(clauses.find((c) => c.num === "2")!.body).toBe("As in Schedule 1.");
    expect(clauses.find((c) => c.num === "Execution")!.body).toMatch(/SIGNED/);
  });
});

describe("schedules divided into Parts", () => {
  it("numbers each Part's paragraphs within the Part, so they never collide", () => {
    const { clauses } = splitClauses([
      b("1. Services"),
      b("As set out in Schedule 1."),
      b("2. Fees"),
      b("As set out in Schedule 1."),
      b("SCHEDULE 1", true),
      b("SCOPE OF SERVICES", true),
      b("Part A — Website", true),
      b("1. Premium redesign of the website."),
      b("2. Three initial concepts."),
      b("Part B — Brand Collateral", true),
      b("1. Review of existing brand assets."),
    ]);
    const nums = clauses.map((c) => c.num);
    expect(new Set(nums).size).toBe(nums.length);
    expect(clauses.find((c) => c.num === "Schedule 1")!.title).toBe("Scope of Services");
    expect(clauses.find((c) => c.num === "Schedule 1.A")!.title).toBe("Part A – Website");
    expect(clauses.find((c) => c.num === "Schedule 1.A.1")).toMatchObject({
      parent: "Schedule 1.A",
      body: "Premium redesign of the website.",
    });
    expect(clauses.find((c) => c.num === "Schedule 1.B.1")!.body).toMatch(/brand assets/);
  });
  it("keeps signing lines off the last clause before a schedule", () => {
    const { clauses } = splitClauses([
      b("1. Law"),
      b("Dubai law governs."),
      b("2. Notices"),
      b("By email."),
      b("Signed by the Parties on the date stated above."),
      {
        text: "| For the Client | For the Provider |",
        page: 1,
        heading: false,
        table: [["For the Client", "For the Provider"]],
      },
      b("SCHEDULE 1", true),
      b("FEES", true),
    ]);
    expect(clauses.find((c) => c.num === "2")!.body).toBe("By email.");
    expect(clauses.find((c) => c.num === "Execution")!.body).toContain(
      "| For the Client | For the Provider |",
    );
  });
});
