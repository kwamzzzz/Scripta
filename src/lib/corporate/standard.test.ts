/**
 * The signed standard, reproduced.
 *
 * Board Resolution — GMG / Gold Coast Refinery, 8 September 2026 is the form
 * the firm actually issues. This walks its facts through setup, the blueprint
 * and the export, and checks the document that comes out is the document the
 * firm signed: the same paragraphs, in the same order, worded the same way.
 */
import { describe, expect, it } from "vitest";
import { emptyMeta } from "@/editor/model";
import { textToDoc } from "@/wireframe/clause-doc";
import { corporateExportSpec, renumberCorporateParts } from "../corporate-documents";
import { buildDocument, type Answers } from "./blueprint";
import { blueprintFor } from "./blueprints";
import { reviewCorporateDocument } from "./review";
import { HOUSE_SIGNATURE_RULE } from "./house";

/** The three recitals as signed. */
const BACKGROUND = [
  "The Company is licensed by the Ghana Gold Board (“GoldBod”) as a Self-Financing Aggregator under the Ghana Gold Board Act, 2025 (Act 1140), licence certificate number GGB/SFA/SF0096/874/25, and in that capacity purchases and aggregates gold using its own capital for delivery to GoldBod for assay, valuation and export.",
  "By compliance notice dated 24 August 2026, with effect from 1 September 2026, GoldBod directed that gold doré purchased by a Self-Financing Aggregator may not be exported unless it has first been refined at a refinery approved or designated by GoldBod.",
  "It was recommended that, to ensure compliance with that requirement, the Company engage GOLD COAST REFINERY LIMITED (“Gold Coast Refinery”), a licensed Ghanaian refinery, for the refining in Ghana of gold aggregated by the Company prior to export.",
];

/** What a lawyer would answer in setup to produce the signed document. */
const answers: Answers = {
  companyName: "Goldenmark Ghana Limited",
  registeredOffice: "Bissau Avenue, East Legon, Accra, Ghana",
  jurisdiction: "Ghana",
  subject:
    "Engaging Gold Coast Refinery Limited for the refining in Ghana of gold aggregated by the Company prior to export",
  background: BACKGROUND,
  grantsAuthority: "no",
  signatories: ["Dominik Kleemann", "Mahama Soale"],
};

/** The five resolutions as signed, which the lawyer writes into the section. */
const RESOLUTIONS = [
  "the Company be authorised to engage and transact with Gold Coast Refinery for the refining in Ghana of gold aggregated by the Company prior to export;",
  "management be authorised to explore, negotiate, agree, enter into and execute, for and on behalf of the Company, a refining agreement with Gold Coast Refinery and all ancillary documents, and to do all things necessary to perform it, including delivering gold, settling refining charges and receiving refined gold or its proceeds;",
  "the arrangement be conducted in compliance with the Ghana Gold Board Act, 2025 (Act 1140) and GoldBod’s directives, guidelines and licence conditions, all gold continuing to be delivered to and dealt with through GoldBod for assay, valuation and export, and management being authorised to make equivalent arrangements with any other refinery approved or designated by GoldBod;",
  "management be authorised to execute such amendments to the Company’s offtake and supply agreements as are required to give effect to the local refining requirement; and",
  "any director or the company secretary be authorised to do any such acts and deeds to give effect to the above resolutions.",
];

/** Setup, then the lawyer replaces the single seeded resolution with the five. */
function document() {
  const built = buildDocument(blueprintFor("board_written_resolution"), answers);
  const seeded = built.parts.find((p) => p.group === "resolution")!;
  const parts = built.parts.flatMap((part) =>
    part.id === seeded.id
      ? RESOLUTIONS.map((text, index) => ({
          ...part,
          id: `${part.id}-${index}`,
          doc: textToDoc(text),
        }))
      : [part],
  );
  return {
    version: 2 as const,
    particulars: built.particulars,
    directors: built.signatories,
    parts: renumberCorporateParts(parts),
    meta: emptyMeta(),
  };
}

const lines = (spec: ReturnType<typeof corporateExportSpec>) =>
  spec.clauses.map((clause) =>
    [clause.num, clause.segs.map((s) => s.t).join("")].filter(Boolean).join(""),
  );

describe("the signed standard", () => {
  const content = document();
  const spec = corporateExportSpec({ kind: "board_written_resolution", content });

  it("heads the document as the standard heads it", () => {
    expect(spec.title).toBe("WRITTEN RESOLUTIONS OF THE DIRECTORS OF\nGOLDENMARK GHANA LIMITED");
  });

  it("dates it the way the standard is dated", () => {
    expect(spec.subtitle).toBe("Dated this [          ] day of [                   ] 2026");
  });

  it("opens with the operative sentence, word for word", () => {
    expect(lines(spec)[0]).toBe(
      "GOLDENMARK GHANA LIMITED, having its registered office at Bissau Avenue, East Legon, Accra, Ghana, acting by its directors, has adopted the following written resolutions:",
    );
  });

  it("letters the recitals (A) (B) (C) and the resolutions (a) to (e)", () => {
    const numbered = spec.clauses.filter((c) => c.num).map((c) => c.num);
    expect(numbered).toEqual(["(A)", "(B)", "(C)", "(a)", "(b)", "(c)", "(d)", "(e)"]);
  });

  it("puts every paragraph of the standard in the order the standard has them", () => {
    expect(lines(spec)).toEqual([
      "GOLDENMARK GHANA LIMITED, having its registered office at Bissau Avenue, East Legon, Accra, Ghana, acting by its directors, has adopted the following written resolutions:",
      "Considering that:",
      `(A)${BACKGROUND[0]}`,
      `(B)${BACKGROUND[1]}`,
      `(C)${BACKGROUND[2]}`,
      "It is resolved that:",
      ...RESOLUTIONS.map((text, index) => `(${"abcde"[index]})${text}`),
      "These resolutions may be signed in counterparts, and take effect on the date the last director signs.",
      `${HOUSE_SIGNATURE_RULE}\nDominik Kleemann\nDirector\n\n${HOUSE_SIGNATURE_RULE}\nMahama Soale\nDirector`,
    ]);
  });

  it("signs it with a rule per director, named, over the office", () => {
    const signature = lines(spec).at(-1)!;
    expect(signature).toContain(HOUSE_SIGNATURE_RULE);
    expect(signature).toContain("Dominik Kleemann");
    expect(signature).toContain("Mahama Soale");
    expect(signature.match(/Director/g)).toHaveLength(2);
  });

  it("passes its own review, because the standard is complete", () => {
    const findings = reviewCorporateDocument("board_written_resolution", content);
    // Undated on purpose: the firm dates it on execution. Everything else the
    // pre-flight checks, it clears.
    expect(findings.filter((f) => f.level !== "clear").map((f) => f.key)).toEqual(["date"]);
    expect(findings.some((f) => f.level === "clear")).toBe(true);
  });
});

describe("the exported file", () => {
  it("letters the recitals and resolutions on the page, not only in the spec", async () => {
    const JSZip = (await import("jszip")).default;
    const { buildCleanDocx } = await import("@/lib/export/docx");
    const spec = corporateExportSpec({ kind: "board_written_resolution", content: document() });
    const bytes = buildCleanDocx({ ...spec, author: "Scripta", date: new Date().toISOString() });
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    // A recital written as a real paragraph used to go out with no (A) against
    // it, because the builder rendered the paragraphs and skipped the label.
    for (const label of ["(A)", "(B)", "(C)", "(a)", "(b)", "(c)", "(d)", "(e)"])
      expect(xml).toContain(`>${label}</w:t>`);
  });

  it("keeps one number per clause rather than repeating it on every paragraph", async () => {
    const JSZip = (await import("jszip")).default;
    const { buildCleanDocx } = await import("@/lib/export/docx");
    const spec = corporateExportSpec({ kind: "board_written_resolution", content: document() });
    const bytes = buildCleanDocx({ ...spec, author: "Scripta", date: new Date().toISOString() });
    const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string");
    expect(xml.split(">(A)</w:t>").length - 1).toBe(1);
  });
});
