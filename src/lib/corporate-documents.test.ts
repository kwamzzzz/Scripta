import { describe, expect, it } from "vitest";
import {
  alphaMarker,
  corporateExportSpec,
  emptyCorporateContent,
  readCorporateContent,
  type LetterContent,
  type ResolutionContent,
} from "./corporate-documents";
import {
  LETTERHEAD_MAX_WIDTH_EMU,
  extensionForLetterhead,
  letterheadExtent,
  letterheadFileProblem,
} from "./letterheads";
import { HOUSE_SIGNATURE_RULE } from "./corporate/house";
import { emptyMeta } from "@/editor/model";
import { textToDoc } from "@/wireframe/clause-doc";

describe("corporate document structure", () => {
  it("keeps resolution recitals capital-lettered and resolutions lower-case", () => {
    const content: ResolutionContent = {
      companyName: "Example Holdings Ltd",
      registeredOffice: "1 Example Street",
      date: "9th September 2026",
      recitals: ["First recital", "Second recital"],
      resolutions: ["First resolution", "Second resolution"],
      directors: ["Director One"],
    };
    const spec = corporateExportSpec({ kind: "board_written_resolution", content });
    const numbered = spec.clauses.filter((clause) => clause.num);

    expect(spec.kind).toBe("resolution");
    expect(spec.numbering).toBe("literal");
    expect(numbered.map((clause) => clause.num)).toEqual(["(A)", "(B)", "(a)", "(b)"]);
    expect(numbered.map((clause) => clause.segs[0]?.t)).toEqual([
      "First recital",
      "Second recital",
      "First resolution",
      "Second resolution",
    ]);
    expect(spec.clauses.map((clause) => clause.segs[0]?.t)).toContain("Considering that:");
    expect(spec.clauses.map((clause) => clause.segs[0]?.t)).toContain("It is resolved that:");
  });

  it("carries the resolution title, date, company, office and execution in house order", () => {
    const content: ResolutionContent = {
      companyName: "Example Holdings Ltd",
      registeredOffice: "1 Example Street",
      date: "9th September 2026",
      recitals: ["A recital"],
      resolutions: ["A resolution"],
      directors: ["Director One", "Director Two"],
    };
    const spec = corporateExportSpec({ kind: "board_written_resolution", content });

    expect(spec.title).toBe("WRITTEN RESOLUTIONS OF THE DIRECTORS OF\nEXAMPLE HOLDINGS LTD");
    // A date the legacy form held as prose keeps a blank to be dated on
    // execution; an ISO date is written out in the house form.
    expect(spec.subtitle).toBe("Dated this [          ] day of [                   ] 2026");
    expect(spec.clauses[0]?.segs[0]?.t).toContain("1 Example Street");
    expect(spec.clauses.at(-1)?.segs[0]?.t).toContain("Director One\nDirector");
    expect(spec.clauses.at(-1)?.segs[0]?.t).toContain("Director Two\nDirector");
  });

  it("places a letter's furniture in date, sender, addressee, greeting, subject, body, purpose, execution order", () => {
    const content: LetterContent = {
      date: "9th September 2026",
      sender: "Sender address",
      addressee: "Recipient",
      subject: "confirmation",
      body: "First point.\n\nSecond point.",
      purpose: "This letter is issued for filing.",
      signatoryName: "Lawyer Name",
      signatoryTitle: "Partner",
    };
    const spec = corporateExportSpec({ kind: "letter", content });
    const text = spec.clauses.map((clause) => clause.segs[0]?.t);

    expect(spec.title).toBe("");
    expect(text).toEqual([
      "9th September 2026",
      "Sender address",
      "Recipient",
      "Dear Sir/Madam,",
      "RE: CONFIRMATION",
      "First point.",
      "Second point.",
      "This letter is issued for filing.",
      "Yours faithfully,",
      `${HOUSE_SIGNATURE_RULE}\nLawyer Name\nPartner`,
    ]);
    expect(spec.clauses[0]?.paras?.[0]?.align).toBe("right");
    expect(spec.clauses[4]?.paras?.[0]?.align).toBe("center");
    expect(spec.clauses[5]?.paras?.[0]?.align).toBe("justify");
  });

  it("uses named blanks instead of inventing missing facts", () => {
    const resolution = corporateExportSpec({
      kind: "board_written_resolution",
      content: emptyCorporateContent("board_written_resolution"),
    });
    const letter = corporateExportSpec({
      kind: "letter",
      content: emptyCorporateContent("letter"),
    });

    expect(resolution.title).toContain("[COMPANY NAME]");
    expect(resolution.subtitle).toContain("Dated this [");
    expect(resolution.clauses.some((clause) => clause.segs[0]?.t === "[recital 1]")).toBe(true);
    expect(resolution.clauses.some((clause) => clause.segs[0]?.t === "[resolution 1]")).toBe(true);
    expect(letter.clauses.some((clause) => clause.segs[0]?.t === "[letter body]")).toBe(true);
  });

  it("normalizes malformed saved JSON to an editable form", () => {
    expect(readCorporateContent("board_written_resolution", { recitals: "not-an-array" })).toEqual({
      companyName: "",
      registeredOffice: "",
      date: "",
      recitals: [""],
      resolutions: [""],
      directors: [""],
    });
    expect(readCorporateContent("letter", null)).toEqual(emptyCorporateContent("letter"));
  });
});

describe("alphabetic markers", () => {
  it.each([
    [0, true, "(A)"],
    [25, true, "(Z)"],
    [26, true, "(AA)"],
    [27, false, "(ab)"],
  ])("marks index %i", (index, capitals, expected) => {
    expect(alphaMarker(index, capitals)).toBe(expected);
  });

  it.each([-1, 1.5, Number.NaN])("rejects invalid index %s", (index) => {
    expect(() => alphaMarker(index, true)).toThrow(RangeError);
  });
});

describe("letterhead files", () => {
  it("accepts the firm's Word template, a PDF of it, or a PNG or JPEG image, and nothing else", () => {
    expect(letterheadFileProblem({ type: "image/png", size: 100 })).toBeNull();
    expect(letterheadFileProblem({ type: "image/jpeg", size: 100 })).toBeNull();
    expect(letterheadFileProblem({ type: "application/pdf", size: 100 })).toBeNull();
    expect(
      letterheadFileProblem({
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 100,
      }),
    ).toBeNull();
    // A browser that does not know the type still names the file.
    expect(letterheadFileProblem({ type: "", size: 100, name: "Letterhead.docx" })).toBeNull();
    expect(letterheadFileProblem({ type: "image/svg+xml", size: 100 })).toBe(
      "Choose your letterhead as a Word template, a PDF, or a PNG or JPEG image.",
    );
    expect(letterheadFileProblem({ type: "image/png", size: 0 })).toBe("That file is empty.");
    expect(letterheadFileProblem({ type: "image/png", size: 10 * 1024 * 1024 + 1 })).toBe(
      "Choose a file no larger than 10 MB.",
    );
  });

  it("maps image MIME types to stable package extensions", () => {
    expect(extensionForLetterhead("image/png")).toBe(".png");
    expect(extensionForLetterhead("image/jpeg")).toBe(".jpg");
  });

  it("preserves aspect ratio and does not enlarge a small image", () => {
    expect(letterheadExtent(400, 100)).toEqual({ widthEmu: 3_810_000, heightEmu: 952_500 });
  });

  it("caps wide artwork at the A4 text width", () => {
    expect(letterheadExtent(1_600, 400)).toEqual({
      widthEmu: LETTERHEAD_MAX_WIDTH_EMU,
      heightEmu: Math.round(LETTERHEAD_MAX_WIDTH_EMU / 4),
    });
  });

  it.each([
    [0, 100],
    [100, 0],
    [-1, 100],
    [Number.NaN, 100],
  ])("rejects invalid dimensions %s x %s", (width, height) => {
    expect(() => letterheadExtent(width, height)).toThrow(RangeError);
  });
});

describe("numbering across structural groups", () => {
  it("letters resolutions and the authorities that follow them in one run", async () => {
    const { renumberCorporateParts } = await import("./corporate-documents");
    const { makePart } = await import("@/editor/model");
    const part = (group: "recital" | "resolution" | "authority" | "company", title: string) =>
      Object.assign(makePart({ title, text: title }), { group });
    const numbered = renumberCorporateParts([
      part("company", "The company"),
      part("recital", "Background 1"),
      part("recital", "Background 2"),
      part("resolution", "Resolution"),
      part("authority", "Authority"),
    ]);
    expect(numbered.map((p) => p.num)).toEqual(["", "(A)", "(B)", "(a)", "(b)"]);
  });
});

describe("a letter's parts, in the firm's order", () => {
  const letter = (particulars: Record<string, string>) =>
    corporateExportSpec({
      kind: "letter",
      content: {
        version: 2,
        particulars,
        directors: [],
        parts: [
          { id: "b", num: "", title: "Body", doc: textToDoc("The point."), group: "body" },
          {
            id: "p",
            num: "",
            title: "Purpose",
            doc: textToDoc("Issued for filing."),
            group: "purpose",
          },
        ],
        meta: emptyMeta(),
      },
    });

  it("reads reference, date, addressee, greeting, subject, body, purpose, closing, signature", () => {
    const spec = letter({
      reference: "GMG/GB/EXP/01/2026",
      date: "2026-09-16",
      addressee: "The Chief Executive Officer\nGhana Gold Board",
      salutation: "Dear Sir,",
      subject: "Request for export",
      closing: "Yours sincerely,",
      signatoryName: "Dominik Kleemann",
      signatoryTitle: "Chief Executive Officer",
      signatoryEntity: "For and on behalf of Goldenmark Ghana Ltd",
    });
    expect(spec.clauses.map((clause) => clause.segs[0]?.t)).toEqual([
      "Our Ref: GMG/GB/EXP/01/2026",
      "16th September 2026",
      "The Chief Executive Officer\nGhana Gold Board",
      "Dear Sir,",
      "RE: REQUEST FOR EXPORT",
      "The point.",
      "Issued for filing.",
      "Yours sincerely,",
      `${HOUSE_SIGNATURE_RULE}\nDominik Kleemann\nChief Executive Officer\nFor and on behalf of Goldenmark Ghana Ltd`,
    ]);
    // The name is set in bold, the rest of the block is not, and the whole
    // block is left-aligned so Word does not stretch its lines.
    const block = spec.clauses.at(-1)!.paras![0]!;
    expect(block.align).toBe("left");
    expect(block.runs.find((r) => r.m?.b)?.t).toBe("Dominik Kleemann");
    // Room to sign beneath the closing.
    expect(spec.clauses.at(-2)?.layout?.after).toBeGreaterThan(0);
    expect(spec.furniture).toBe(false);
  });

  it("leaves out what a letter does not have, and marks what it must", () => {
    const unaddressed = letter({ salutation: "To Whom It May Concern", subject: "Confirmation" });
    const text = unaddressed.clauses.map((clause) => clause.segs[0]?.t);
    expect(text).not.toContain("[addressee]");
    expect(text).not.toContain("[sender address]");
    expect(text[0]).toBe("[date]");
    expect(text).toContain("To Whom It May Concern");
    expect(text).toContain("Yours faithfully,");
  });
});
