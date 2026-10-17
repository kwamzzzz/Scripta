/**
 * The editorial report: what goes back to the author.
 *
 * Author queries first, because they are what the author has to answer;
 * then the corrections and suggestions, chapter by chapter, each with the
 * place it rests on. Only open and accepted findings go in: a dismissed
 * finding was decided not to be a problem, and a resolved one is done.
 */
import type { ExportClause } from "@/lib/export/docx";
import type { Chapter, Finding, StoredNode } from "./db";
import { ACTION_LABEL, CATEGORY_LABEL, SEVERITY_LABEL } from "./model";

const text = (t: string): ExportClause["segs"] => [{ t, k: "n" as const }];

function place(
  nodeKey: string,
  nodes: Map<string, StoredNode>,
  chapters: Map<string, Chapter>,
  refs: Map<string, string> | undefined,
) {
  const n = nodes.get(nodeKey);
  if (!n) return "";
  const c = n.chapterKey ? chapters.get(n.chapterKey) : chapters.get(n.key);
  const where = c ? [c.number, c.title].filter(Boolean).join(" ") : "Front matter";
  const ref = refs?.get(n.key);
  return [
    where,
    ref ?? "",
    n.kind === "heading" ? `§${n.number || n.label}` : "",
    n.page ? `p. ${n.page}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

function entry(
  f: Finding,
  nodes: Map<string, StoredNode>,
  chapters: Map<string, Chapter>,
  refs?: Map<string, string>,
) {
  const places = [
    ...new Set(f.evidence.map((e) => place(e.nodeKey, nodes, chapters, refs)).filter(Boolean)),
  ];
  return [
    `#${f.ref} ${f.title} (${SEVERITY_LABEL[f.severity]} ${CATEGORY_LABEL[f.category] ?? f.category}; ${ACTION_LABEL[f.action]})`,
    f.body,
    f.action === "correction" && f.original && f.replacement !== null
      ? `“${f.original}” should read “${f.replacement}”.`
      : "",
    places.length ? `Where: ${places.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildEditorialReport(args: {
  title: string;
  versionNo: number;
  findings: Finding[];
  nodes: Map<string, StoredNode>;
  chapters: Chapter[];
  /** "3 ¶2" references, as the reader shows them. */
  refs?: Map<string, string> | undefined;
}): { title: string; subtitle: string; clauses: ExportClause[] } {
  const byKey = new Map(args.chapters.map((c) => [c.chapterKey, c]));
  const live = args.findings
    .filter((f) => f.status === "open" || f.status === "accepted")
    .sort((a, b) => a.ref - b.ref);
  const clauses: ExportClause[] = [];
  let n = 0;

  const queries = live.filter((f) => f.action === "query");
  if (queries.length)
    clauses.push({
      num: String(++n),
      title: "Author queries",
      segs: text(queries.map((f) => entry(f, args.nodes, byKey, args.refs)).join("\n\n")),
    });

  const rest = live.filter((f) => f.action !== "query");
  const wide = rest.filter((f) => f.chapterKeys.length !== 1);
  if (wide.length)
    clauses.push({
      num: String(++n),
      title: "Across the manuscript",
      segs: text(wide.map((f) => entry(f, args.nodes, byKey, args.refs)).join("\n\n")),
    });
  for (const c of args.chapters) {
    const mine = rest.filter(
      (f) => f.chapterKeys.length === 1 && f.chapterKeys[0] === c.chapterKey,
    );
    if (!mine.length) continue;
    clauses.push({
      num: String(++n),
      title: [c.number, c.title].filter(Boolean).join(" ") || "Chapter",
      segs: text(mine.map((f) => entry(f, args.nodes, byKey, args.refs)).join("\n\n")),
    });
  }
  if (!clauses.length)
    clauses.push({
      num: "1",
      title: "No open findings",
      segs: text("Nothing is outstanding on this version."),
    });

  return {
    title: `Editorial report: ${args.title}`,
    subtitle: `Version ${args.versionNo} · ${live.length} open or accepted finding${live.length === 1 ? "" : "s"} · ${queries.length} author quer${queries.length === 1 ? "y" : "ies"}`,
    clauses,
  };
}
