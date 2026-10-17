import { describe, expect, it } from "vitest";
import {
  acceptProposal,
  calendarMonths,
  entityNeeds,
  heldBySummary,
  matchEntity,
  proposalBadge,
  registerCsv,
  toCsv,
} from "./register";
import { group } from "./fixture";

const TODAY = "2026-09-16";

describe("what an entity still needs", () => {
  it("puts what is late first, then what is lapsing, then gaps in the record", () => {
    const org = group();
    const needs = entityNeeds(org, "gm", TODAY);
    expect(needs.map((n) => n.key)).toEqual(["over-ar|2026-06-30", "lic-pmmc", "constitution"]);
    expect(needs[0]?.detail).toContain("GHS 50/month");
  });

  it("names missing core facts and a board nobody has recorded", () => {
    const needs = entityNeeds(group(), "ngh", TODAY);
    expect(needs.find((n) => n.key === "facts")?.detail).toBe(
      "No incorporation date, registered office recorded.",
    );
    expect(needs.some((n) => n.key === "directors")).toBe(true);
  });

  it("stops asking for a constitution once one is linked", () => {
    const org = group();
    org.documents = [
      {
        id: "d1",
        name: "Constitution",
        category: "constitution",
        mimeType: null,
        storagePath: null,
        pageCount: 1,
        parseStatus: "parsed",
        createdAt: "",
        archivedAt: null,
      },
    ];
    org.recordDocuments = [
      { id: "l1", documentId: "d1", recordType: "entity", recordId: "gm", page: null, note: "" },
    ];
    expect(entityNeeds(org, "gm", TODAY).some((n) => n.key === "constitution")).toBe(false);
  });
});

describe("the register export", () => {
  it("quotes cells that need it and derives standing", () => {
    const org = group();
    const csv = registerCsv(org, org.entities, TODAY);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(
      "Entity,Jurisdiction,Registration no.,Tax no.,Incorporated,Type,Registered office,Directors,Held by,Status",
    );
    expect(lines[1]).toBe(
      "Goldenmark Ghana Ltd,Ghana,CS1,,2025-05-06,Private limited,Accra,1,Nexis GH 100%,Filing overdue",
    );
    expect(toCsv([["a,b", 'say "x"']])).toBe('"a,b","say ""x"""\r\n');
  });

  it("summarises who holds an entity", () => {
    expect(heldBySummary(group(), "gm", TODAY)).toBe("Nexis GH 100%");
  });
});

describe("facts read from a document", () => {
  const p = { key: "registrationNo", value: "CS105670525", confidence: 0.92, page: 1 };

  it("marks uncertain readings for checking", () => {
    expect(proposalBadge(p)).toBe("Read");
    expect(proposalBadge({ ...p, confidence: 0.5 })).toBe("Check");
    expect(proposalBadge({ ...p, confidence: null })).toBe("Check");
  });

  it("takes a value nobody recorded, keeping its source", () => {
    const r = acceptProposal("", {}, p, "cert");
    expect(r).toMatchObject({ value: "CS105670525", conflict: false });
    expect(r.sources["registrationNo"]).toMatchObject({
      documentId: "cert",
      page: 1,
      confidence: 0.92,
    });
  });

  it("does not overwrite a value another document gave; it records the disagreement", () => {
    const sources = {
      registrationNo: { value: "CS105670525", documentId: "cert", page: 1, confidence: 0.9 },
    };
    const r = acceptProposal(
      "CS105670525",
      sources,
      { ...p, value: "CS105670999", page: 3 },
      "form3",
    );
    expect(r.conflict).toBe(true);
    expect(r.value).toBe("CS105670525");
    expect(r.sources["registrationNo"]?.conflicts).toEqual([
      { value: "CS105670999", documentId: "form3", page: 3 },
    ]);
  });

  it("lets the same document correct itself, and agreeing documents are not a conflict", () => {
    const sources = {
      registrationNo: { value: "CS1", documentId: "cert", page: 1, confidence: 0.4 },
    };
    expect(acceptProposal("CS1", sources, p, "cert").conflict).toBe(false);
    expect(
      acceptProposal(
        "cs105670525 ",
        { registrationNo: { ...sources.registrationNo, value: "x" } },
        p,
        "form3",
      ).conflict,
    ).toBe(false);
  });

  it("matches a holder named on a licence to a group entity", () => {
    const org = group();
    expect(matchEntity(org, "GOLDENMARK GHANA LIMITED")?.id).toBe("gm");
    expect(matchEntity(org, "Nexis Africa (Ghana)")?.id).toBe("ngh");
    expect(matchEntity(org, "Someone Else Ltd")).toBeNull();
  });
});

describe("the calendar by month", () => {
  it("puts monthly occurrences in every month and licence expiries on their day", () => {
    const org = group();
    org.licences[0]!.expiresOn = "2026-10-17";
    const months = calendarMonths(org, TODAY, 3, () => true, TODAY);
    expect(months.map((m) => m.month)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
    expect(months[1]!.entries.map((e) => `${e.day} ${e.kind}`)).toEqual([
      "2026-10-15 occurrence",
      "2026-10-17 expiry",
    ]);
    expect(months[2]!.entries).toHaveLength(1);
  });

  it("crosses the year end", () => {
    const months = calendarMonths(group(), "2026-11-20", 3, () => true, TODAY);
    expect(months.map((m) => m.month)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
    expect(months[2]!.entries[0]?.day).toBe("2027-01-15");
  });
});
