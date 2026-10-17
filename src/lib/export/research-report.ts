import type { ExportClause } from "./docx";
import type { StoredAssumption, StoredFact, StoredIssue, StoredRisk } from "@/lib/research-rows";

/**
 * The comprehensive research report, as a document.
 *
 * The export dialog offered "PDF + DOCX (client-branded)" behind a selector
 * that was a styled div, and its Approve & export button locked the report at
 * v1.0 and closed. Nothing was ever written to a file. A lawyer could approve
 * a report, be told it was exported, and have nothing to send.
 *
 * This builds the document both formats share. It is deliberately plain: what
 * the lawyer recorded, in the order the report builder shows it, and nothing
 * the app inferred on their behalf. A section with nothing in it is left out
 * rather than printed as a heading over white space.
 */

export type ReportSource = {
  title: string;
  version: string;
  approvedAt: string;
  issues: StoredIssue[];
  facts: StoredFact[];
  assumptions: StoredAssumption[];
  risks: StoredRisk[];
  /** Deliverable sections the lawyer chose to include, by name. */
  included: string[];
};

const text = (t: string): ExportClause["segs"] => [{ t, k: "n" as const }];

const lines = (parts: (string | null | undefined)[]) =>
  parts.filter((p): p is string => Boolean(p && p.trim())).join("\n");

/** "ISSUE 2" → "2", so the export numbers read as clause numbers. */
const issueNumber = (no: string, fallback: number) => no.replace(/\D+/g, "") || String(fallback);

/**
 * Which issues go in.
 *
 * The report builder lets a lawyer mark an issue as inserted into the report.
 * If any issue has been marked, that choice is the report; if none has, the
 * export carries every answered issue rather than producing an empty file and
 * calling it a report.
 */
export function reportIssues(issues: StoredIssue[]): StoredIssue[] {
  const chosen = issues.filter((i) => i.inReport);
  if (chosen.length) return chosen;
  return issues.filter((i) => i.answer.trim());
}

export function buildResearchReport(source: ReportSource): {
  title: string;
  subtitle: string;
  clauses: ExportClause[];
} {
  const clauses: ExportClause[] = [];
  const issues = reportIssues(source.issues);

  issues.forEach((issue, i) => {
    const meta = lines([
      issue.juris ? `Jurisdiction: ${issue.juris}` : null,
      issue.auth && issue.auth !== "To be identified" ? `Authority: ${issue.auth}` : null,
      issue.pos ? `Position: ${issue.pos}` : null,
      issue.risk ? `Risk: ${issue.risk}` : null,
    ]);
    clauses.push({
      num: issueNumber(issue.no, i + 1),
      title: issue.short || issue.q || "Issue",
      segs: text(
        lines([
          issue.q && issue.q !== issue.short ? issue.q : null,
          // An unanswered issue says so. It used to be indistinguishable from
          // one whose answer happened to be short.
          issue.answer.trim() || "No answer has been recorded for this issue.",
          meta,
        ]),
      ),
    });
  });

  if (source.facts.length)
    clauses.push({
      num: "",
      title: "Facts",
      segs: text(
        source.facts
          .map((f) =>
            lines([
              `${f.id} — ${f.fact}`,
              f.src ? `Source: ${f.src}` : "Source: not recorded",
              f.cls ? `Status: ${f.cls}` : null,
            ]),
          )
          .join("\n\n"),
      ),
    });

  if (source.assumptions.length)
    clauses.push({
      num: "",
      title: "Assumptions",
      segs: text(
        source.assumptions
          .map((a) =>
            lines([
              a.a,
              a.why ? `Why: ${a.why}` : null,
              // An assumption with no stated consequence is the dangerous kind,
              // so the export says so rather than omitting the line.
              a.risk && a.risk !== "—" ? `If wrong: ${a.risk}` : "If wrong: not recorded",
            ]),
          )
          .join("\n\n"),
      ),
    });

  if (source.risks.length)
    clauses.push({
      num: "",
      title: "Risks and actions",
      segs: text(
        source.risks
          .map((r) =>
            lines([
              r.title,
              `Rating: ${r.override || r.rate || "not rated"}`,
              r.mit ? `Mitigation: ${r.mit}` : null,
              r.action ? `Action: ${r.action}` : null,
              `Owner: ${r.who || "unassigned"} · By: ${r.by || "no date"}`,
            ]),
          )
          .join("\n\n"),
      ),
    });

  const stamp = source.approvedAt
    ? `Approved ${source.approvedAt} · ${source.version}`
    : `Draft · ${source.version}`;

  return {
    title: source.title || "Research report",
    subtitle: lines([
      // No citation style is claimed. The export dialog used to show an OSCOLA
      // selector, but the report applies no citation style at all — naming one
      // on the front page of a document that leaves the building would be a
      // claim about the work that nothing performed.
      "Research report · Privileged",
      stamp,
      source.included.length ? `Includes: ${source.included.join(" · ")}` : null,
    ]).replace(/\n/g, " · "),
    clauses,
  };
}

/** A filename that survives a download folder. */
export const reportFilename = (title: string, ext: string) =>
  `${
    (title || "research-report")
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "research-report"
  }.${ext}`;
