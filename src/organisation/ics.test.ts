import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, icsText, organisationIcs } from "./ics";
import { group } from "./registers/fixture";

describe("the calendar file", () => {
  it("escapes text as RFC 5545 requires", () => {
    expect(icsText("a, b; c\\d\nnext")).toBe("a\\, b\\; c\\\\d\\nnext");
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const line = `SUMMARY:${"é".repeat(60)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n ");
    expect(parts.length).toBeGreaterThan(1);
    expect(new TextEncoder().encode(parts[0]).length).toBeLessThanOrEqual(75);
    for (const p of parts.slice(1))
      expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(74);
    expect(parts.join("")).toBe(line);
  });

  it("writes all-day events with stable ids and CRLF line ends", () => {
    const ics = buildIcs(
      "Test",
      [{ uid: "x@scripta", day: "2026-12-31", summary: "Year end", description: "" }],
      new Date("2026-09-16T10:00:00Z"),
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\n");
    expect(ics).toContain("DTSTAMP:20260916T100000Z\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("covers upcoming occurrences and expiries, not what is done or past", () => {
    const org = group();
    org.licences[0]!.expiresOn = "2026-10-17";
    org.occurrences = [
      {
        id: "o",
        obligationId: "vat",
        dueOn: "2026-10-15",
        state: "done",
        completedOn: "2026-10-10",
        note: "",
      },
    ];
    const ics = organisationIcs(org, "Nexis Africa", "2026-09-16");
    expect(ics).toContain("UID:licence-pmmc-20261017@scripta");
    expect(ics).toContain("UID:obligation-vat-20261115@scripta");
    expect(ics).not.toContain("obligation-vat-20261015");
    expect(ics).not.toContain("obligation-ar-");
    expect(ics).toContain("SUMMARY:VAT return\\, with commas\\; and semicolons — Nexis GH");
  });
});
