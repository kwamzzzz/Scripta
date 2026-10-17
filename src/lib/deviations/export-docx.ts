/**
 * The schedule as a Word table, when there is no workbook to fill.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL
 * ---------------------------------------------------------------------------
 *
 * The first version of this feature could only write into the buyer's own
 * appendix, which assumed the buyer had sent one. Often they have not: the
 * mark-up goes back with a covering letter and the deviations are set out in a
 * table the firm draws itself, or the lawyer simply wants to read what they
 * have proposed before anybody else does. Requiring a template we were never
 * given made the tool useless in exactly those cases.
 *
 * ---------------------------------------------------------------------------
 * RED AND STRUCK, NOT TRACKED
 * ---------------------------------------------------------------------------
 *
 * The proposed column shows additions in red and deletions struck through as
 * FORMATTING. It would have been less code to emit `w:ins` and `w:del` and let
 * Word draw them, and it would have been wrong: a schedule of deviations is a
 * record of what was proposed, so Accept All in Word must leave it alone. Turn
 * the marks into revisions and the schedule silently rewrites itself into the
 * document it was describing.
 */
import { buildDocx, type ExportSeg, type GridTable } from "@/lib/export/docx";
import type { DeviationRow } from "./rows";

/** Landscape A4 text width in twips: 16845 tall becomes wide, less 1440 each side. */
const LANDSCAPE_TEXT_WIDTH = 16845 - 1440 * 2;

/** Clause reference narrow; the three prose columns share what is left. */
const COLUMN_SHARE = [0.13, 0.29, 0.29, 0.29];

const WIDTHS = COLUMN_SHARE.map((share) => Math.floor(LANDSCAPE_TEXT_WIDTH * share));

const HEADINGS = [
  "Clause Ref.",
  "Original Clause in the Agreement",
  "The Bidder's Proposed Clause",
  "Brief Justification / Comments for the Proposed Change",
];

const RED = "C00000";

const plain = (text: string): ExportSeg[] => (text ? [{ t: text, k: "n" }] : []);

/** The proposed wording, marked the way the schedule is read. */
export function proposedRuns(row: DeviationRow): ExportSeg[] {
  return row.proposed
    .filter((segment) => segment.text)
    .map((segment) => {
      if (segment.kind === "insert") return { t: segment.text, k: "n", m: { colour: RED } };
      if (segment.kind === "delete")
        return { t: segment.text, k: "n", m: { colour: RED, strike: true } };
      // An injected clause number is ours, not the drafter's; set it apart so
      // nobody reads it as wording the reviewer added.
      if (segment.kind === "label") return { t: segment.text, k: "n", m: { b: true } };
      return { t: segment.text, k: "n" };
    }) as ExportSeg[];
}

export function deviationsTable(rows: DeviationRow[], justifications: string[]): GridTable {
  return {
    widths: WIDTHS,
    rows: [
      { header: true, cells: HEADINGS.map((heading) => plain(heading)) },
      ...rows.map((row, at) => ({
        cells: [
          plain(row.reference),
          plain(row.original),
          proposedRuns(row),
          plain(justifications[at] ?? ""),
        ],
      })),
    ],
  };
}

export type DeviationsDocxOptions = {
  rows: DeviationRow[];
  justifications: string[];
  bidder: string;
  /** The agreement the mark-up was made to, named on the page. */
  agreement?: string;
  responseDate?: string;
};

/** The whole document: a title, who and when, and the table. */
export function buildDeviationsDocx(options: DeviationsDocxOptions): Uint8Array {
  const { rows, justifications, bidder, agreement, responseDate } = options;
  const subtitle = [bidder, agreement, responseDate].filter(Boolean).join("  ·  ");
  return buildDocx({
    title: "Schedule of Deviations",
    ...(subtitle ? { subtitle } : {}),
    orientation: "landscape",
    furniture: true,
    clauses: [
      {
        num: "1",
        title: "",
        unnumbered: true,
        segs: [],
        paras: [{ runs: [], grid: deviationsTable(rows, justifications) }],
      },
    ],
  });
}
