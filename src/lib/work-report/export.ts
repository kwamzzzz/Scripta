/**
 * A day, set as a document.
 *
 * The report exists to be read in Scripta, but a lawyer's day travels: into a
 * supervision note, an appraisal form, an email to a partner asking where a
 * matter stands. So it comes out as the firm's own letter — on the workspace
 * paper where there is one, in the same typeface as everything else Scripta
 * produces, rather than as a text dump that looks like it came from a tool.
 *
 * Structurally it is the screen: a section per matter, the tasks under it, the
 * context you added kept with the task it belongs to. Nothing is added in the
 * translation and nothing is summarised away.
 */
import type { ExportClause } from "@/lib/export/docx";
import { groupByMatter, type WorkEntry } from "./model";

/** "Monday, 14 September 2026" — how the firm writes a date in prose. */
export function longDay(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const timeOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

/** One line under a task: what it was work for, and what it produced. */
function facts(entry: WorkEntry): string {
  return [entry.tool, entry.output].filter(Boolean).join(" · ");
}

/**
 * The day as sections a document can set.
 *
 * Matters are numbered because the export is read on paper, where a reader
 * refers to "the second matter" and needs something to point at. Tasks beneath
 * them are not numbered: they are a list of what was finished, not a structure
 * anybody cites.
 */
export function reportClauses(entries: WorkEntry[], note: string): ExportClause[] {
  const groups = groupByMatter(entries);
  const clauses: ExportClause[] = [];

  groups.forEach((group, index) => {
    const lines: string[] = [];
    for (const entry of group.entries) {
      const time = timeOf(entry.at);
      lines.push(`${time ? `${time}  ` : ""}${entry.title}`);
      const detail = facts(entry);
      if (detail) lines.push(`    ${detail}`);
      if (entry.note?.trim()) lines.push(`    ${entry.note.trim()}`);
    }
    clauses.push({
      num: String(index + 1),
      title: group.matterName,
      segs: [{ t: lines.join("\n"), k: "n" }],
    });
  });

  if (note.trim())
    clauses.push({
      // Unnumbered: it is a closing note on the day, not another matter.
      num: "",
      title: "Note on the day",
      segs: [{ t: note.trim(), k: "n" }],
    });

  return clauses;
}

/** What the document is called, on the page and in the file name. */
export const reportTitle = (day: string) => `Work report — ${longDay(day)}`;

/** "work-report-2026-09-14" — sorts by date wherever it is saved. */
export const reportFilename = (day: string) => `work-report-${day}`;

/**
 * The plain-text version, for the far commoner thing: pasting the day into an
 * email or a message. No markup, because the place it lands usually strips it.
 */
export function reportText(day: string, entries: WorkEntry[], note: string): string {
  const groups = groupByMatter(entries);
  const out: string[] = [reportTitle(day), ""];

  if (!groups.length) out.push("No tasks completed.");

  for (const group of groups) {
    out.push(group.matterName);
    for (const entry of group.entries) {
      const time = timeOf(entry.at);
      out.push(`  - ${time ? `${time}  ` : ""}${entry.title}`);
      const detail = facts(entry);
      if (detail) out.push(`      ${detail}`);
      if (entry.note?.trim()) out.push(`      ${entry.note.trim()}`);
    }
    out.push("");
  }

  if (note.trim()) {
    out.push("Note on the day");
    out.push(note.trim());
  }

  return out.join("\n").trimEnd();
}
