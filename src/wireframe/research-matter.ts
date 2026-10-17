/**
 * The working records that hang off one research matter, as the screens hold
 * them. The shapes themselves live in `@/lib/research-rows` — the same
 * definitions the research tables are mapped through — so the browser and the
 * database can never drift apart.
 *
 * The wireframe fixtures in `data.ts` are still the drawing's data. They stay
 * imported here for one reason only: to recognise those rows in browser
 * storage and drop them on the way into the database.
 */
import { WF } from "./data";
import { priorityOf } from "./risk";
import type {
  ResearchKind,
  StoredAssumption,
  StoredFact,
  StoredIssue,
  StoredRecords,
  StoredRisk,
} from "@/lib/research-rows";

export type { ResearchKind };

/** The screens' names for the row shapes `research-rows` defines. */
export type IssueCard = StoredIssue;
export type FactRow = StoredFact;
export type AssumptionRow = StoredAssumption;
export type RiskRow = StoredRisk;
export type ResearchRecords = StoredRecords;

export const UNTITLED: Record<ResearchKind, string> = {
  simple: "Untitled research note",
  comprehensive: "Untitled research report",
};

/** A new matter holds no issues, facts, assumptions or risks — only the deliverable sections a download offers. */
export function emptyRecords(): ResearchRecords {
  return {
    instructions: "",
    plan: { legislation: [], caseLaw: [], secondary: [], themes: [] },
    issueCards: [],
    factRows: [],
    assumptionRows: [],
    draftRejected: false,
    riskRows: [],
    selectedIssue: 0,
    format: "IRAC",
    deliv: Object.fromEntries(WF.delivRows.map((r) => [r.key, r.on])),
    report: {
      version: "v0.1",
      locked: false,
      draft: "pending",
      track: false,
      approvalSent: false,
      approvedAt: "",
    },
  };
}

/** The drawing's risk rows carry the action plan's owner and priority. */
const ACTION_FOR_RISK = [1, 0, 2, 3];
/** Exactly what the demo seed wrote into storage, so those rows can be told apart from the user's own. */
const SEEDED = {
  issueCards: WF.issueCards as readonly unknown[],
  factRows: WF.factRows as readonly unknown[],
  assumptionRows: WF.assumptionRows as readonly unknown[],
  riskRows: WF.riskRows.map((r, i) => {
    const a = WF.actionRows[ACTION_FOR_RISK[i] ?? i];
    return { ...r, action: a?.act ?? r.mit, pri: a?.pri ?? priorityOf(r.rate) };
  }) as readonly unknown[],
};

/** Drop rows that are still the demo fixture, untouched. A row the user edited no longer matches, so it survives. */
function withoutSeeded<T>(rows: T[] | undefined, seeded: readonly unknown[]): T[] {
  if (!Array.isArray(rows)) return [];
  const marks = new Set(seeded.map((row) => JSON.stringify(row)));
  return rows.filter((row) => !marks.has(JSON.stringify(row)));
}

/** The selected issue can only point at an issue that is there. */
function clampSelection(records: ResearchRecords): ResearchRecords {
  return {
    ...records,
    selectedIssue: Math.min(
      Math.max(records.selectedIssue || 0, 0),
      Math.max(records.issueCards.length - 1, 0),
    ),
  };
}

/**
 * Records read back with defaults for fields added since they were written.
 * This is the read path for the database: nothing is dropped, because a row
 * that reached the research tables is a row the lawyer meant to keep.
 */
export function withRecordDefaults(stored: Partial<ResearchRecords> | undefined): ResearchRecords {
  const base = emptyRecords();
  const merged = { ...base, ...(stored ?? {}) };
  return clampSelection({
    ...merged,
    instructions: typeof merged.instructions === "string" ? merged.instructions : "",
    issueCards: Array.isArray(merged.issueCards) ? merged.issueCards : [],
    factRows: Array.isArray(merged.factRows) ? merged.factRows : [],
    assumptionRows: Array.isArray(merged.assumptionRows) ? merged.assumptionRows : [],
    riskRows: Array.isArray(merged.riskRows) ? merged.riskRows : [],
    plan: { ...base.plan, ...(stored?.plan ?? {}) },
    deliv: { ...base.deliv, ...(stored?.deliv ?? {}) },
    report: { ...base.report, ...(stored?.report ?? {}) },
  });
}

/**
 * Records on their way out of browser storage and into the database: defaults
 * filled in, and rows the wireframe demo once seeded into real matters left
 * behind rather than imported as if a lawyer had written them.
 */
export function readRecords(stored: Partial<ResearchRecords> | undefined): ResearchRecords {
  const records = withRecordDefaults(stored);
  return clampSelection({
    ...records,
    issueCards: withoutSeeded(records.issueCards, SEEDED.issueCards),
    factRows: withoutSeeded(records.factRows, SEEDED.factRows),
    assumptionRows: withoutSeeded(records.assumptionRows, SEEDED.assumptionRows),
    riskRows: withoutSeeded(records.riskRows, SEEDED.riskRows),
  });
}
