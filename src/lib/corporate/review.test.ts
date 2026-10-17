import { describe, expect, it } from "vitest";
import { emptyMeta, makePart } from "@/editor/model";
import type { CorporateContentV2 } from "../corporate-documents";
import { blocking, preflightSummary, reviewCorporateDocument } from "./review";
import type { CorporateGroup } from "./kinds";

const part = (group: CorporateGroup, text: string, title: string = group) =>
  Object.assign(makePart({ title, text }), { group });

const content = (over: Partial<CorporateContentV2> = {}): CorporateContentV2 => ({
  version: 2,
  particulars: {
    companyName: "Goldenmark Ghana Limited",
    registeredOffice: "12 Independence Avenue, Accra",
    date: "2026-09-20",
  },
  directors: ["Dominik Kleemann"],
  parts: [
    part("resolution", "The company open a US dollar account with Stanbic Bank."),
    part("execution", "These resolutions take effect on the date the last director signs."),
  ],
  meta: emptyMeta(),
  ...over,
});

const ids = (kind: Parameters<typeof reviewCorporateDocument>[0], c: CorporateContentV2) =>
  reviewCorporateDocument(kind, c)
    .filter((f) => f.level !== "clear")
    .map((f) => f.key);

describe("reviewCorporateDocument", () => {
  it("passes a resolution that is actually complete, and says what it checked", () => {
    const findings = reviewCorporateDocument("board_written_resolution", content());
    expect(findings.every((f) => f.level === "clear")).toBe(true);
    expect(findings.map((f) => f.key)).toEqual(["sections", "execution", "consistency"]);
    expect(preflightSummary(findings)).toBe("Nothing outstanding.");
  });

  it("will not let an unnamed or undated company through", () => {
    const found = ids(
      "board_written_resolution",
      content({ particulars: { companyName: "", registeredOffice: "", date: "" } }),
    );
    expect(found).toContain("company-name");
    expect(found).toContain("date");
    expect(found).toContain("registered-office");
  });

  it("treats a missing registered office as worth considering, not a blocker", () => {
    const findings = reviewCorporateDocument(
      "board_written_resolution",
      content({ particulars: { companyName: "A Ltd", date: "2026-09-20", registeredOffice: "" } }),
    );
    expect(findings.find((f) => f.key === "registered-office")?.level).toBe("warning");
    expect(blocking(findings)).toEqual([]);
  });

  it("catches a placeholder nobody filled in", () => {
    const findings = reviewCorporateDocument(
      "board_written_resolution",
      content({
        parts: [
          part("resolution", "The company open an account with [bank name]."),
          part("execution", "Signed."),
        ],
      }),
    );
    const placeholder = findings.find((f) => f.key.startsWith("placeholder-"))!;
    expect(placeholder.level).toBe("blocking");
    expect(placeholder.detail).toContain("[bank name]");
  });

  it("reports an empty section, and says what belongs there", () => {
    const findings = reviewCorporateDocument(
      "board_written_resolution",
      content({
        parts: [
          Object.assign(makePart({ title: "Resolution", text: "", hint: "State what is resolved." }), {
            group: "resolution" as const,
          }),
          part("execution", "Signed."),
        ],
      }),
    );
    const empty = findings.find((f) => f.key.startsWith("empty-"))!;
    expect(empty.level).toBe("blocking");
    expect(empty.detail).toBe("State what is resolved.");
  });

  it("notices a section the instrument cannot go out without", () => {
    expect(ids("board_written_resolution", content({ parts: [] }))).toContain("missing-resolution");
    expect(ids("board_minutes", content({ parts: [] }))).toContain("missing-attendance");
  });

  it("notices a different company named in the body", () => {
    const findings = reviewCorporateDocument(
      "board_written_resolution",
      content({
        parts: [
          part("resolution", "Kessler AG be appointed as offtaker."),
          part("execution", "Signed."),
        ],
      }),
    );
    expect(findings.map((f) => f.key)).toContain("company-consistency");
  });

  it("does not complain when the body names the company in another form", () => {
    const findings = reviewCorporateDocument(
      "board_written_resolution",
      content({
        parts: [
          part("resolution", "Goldenmark Ghana Ltd open an account."),
          part("execution", "Signed."),
        ],
      }),
    );
    expect(findings.map((f) => f.key)).not.toContain("company-consistency");
  });

  it("insists somebody is named to sign", () => {
    expect(ids("board_written_resolution", content({ directors: [""] }))).toContain("signatories");
  });

  it("asks for quorum on minutes, and only on minutes", () => {
    const minutes = content({
      parts: [
        part("attendance", "Present: Dominik Kleemann. He took the chair."),
        part("resolution", "It was resolved to open the account."),
      ],
    });
    expect(ids("board_minutes", minutes)).toContain("quorum");
    const withQuorum = content({
      parts: [
        part("attendance", "Present: Dominik Kleemann. A quorum being present, the meeting opened."),
        part("resolution", "It was resolved to open the account."),
      ],
    });
    expect(ids("board_minutes", withQuorum)).not.toContain("quorum");
  });

  it("asks a shareholders' resolution whether it is ordinary or special", () => {
    expect(ids("shareholder_written_resolution", content())).toContain("resolution-type");
  });

  it("catches authority that authorises nothing in particular", () => {
    const vague = content({
      parts: [
        part("resolution", "The account be opened."),
        part("authority", "Any one director be and is hereby authorised."),
        part("execution", "Signed."),
      ],
    });
    expect(
      reviewCorporateDocument("board_written_resolution", vague).some((f) =>
        f.key.startsWith("authority-scope-"),
      ),
    ).toBe(true);
    const scoped = content({
      parts: [
        part("resolution", "The account be opened."),
        part("authority", "Any one director is authorised to execute the account documentation."),
        part("execution", "Signed."),
      ],
    });
    expect(
      reviewCorporateDocument("board_written_resolution", scoped).some((f) =>
        f.key.startsWith("authority-scope-"),
      ),
    ).toBe(false);
  });

  it("checks a letter for what a letter needs, not for a company", () => {
    const letter = content({
      particulars: { addressee: "", subject: "", signatoryName: "" },
      directors: [],
      parts: [part("body", "We write to confirm the mandate.")],
    });
    const found = ids("letter", letter);
    expect(found).toContain("letter-addressee");
    expect(found).not.toContain("company-name");
    expect(found).not.toContain("signatories");
  });

  it("summarises what must be fixed apart from what might be", () => {
    const findings = reviewCorporateDocument(
      "board_written_resolution",
      content({ particulars: { companyName: "", registeredOffice: "", date: "2026-09-20" } }),
    );
    expect(preflightSummary(findings)).toBe("1 to fix · 1 to weigh");
  });
});

describe("house punctuation of a run of resolutions", () => {
  const withRun = (texts: string[]) =>
    content({
      parts: [
        ...texts.map((t, i) => part("resolution", t, `Resolution ${i + 1}`)),
        part("execution", "Signed."),
      ],
    });

  it("says nothing when the run is punctuated the way the standard is", () => {
    const findings = reviewCorporateDocument(
      "board_written_resolution",
      withRun(["the Company be authorised;", "management be authorised; and", "any director may act."]),
    );
    expect(findings.filter((f) => f.key.startsWith("punctuation-"))).toEqual([]);
  });

  it("names the mark a resolution is missing", () => {
    const findings = reviewCorporateDocument(
      "board_written_resolution",
      withRun(["the Company be authorised", "management be authorised.", "any director may act."]),
    );
    const marks = findings.filter((f) => f.key.startsWith("punctuation-"));
    expect(marks).toHaveLength(2);
    expect(marks[0]!.detail).toContain('";"');
    expect(marks[1]!.detail).toContain('"; and"');
    expect(marks[0]!.level).toBe("warning");
  });
});
