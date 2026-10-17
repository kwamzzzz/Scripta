import type { ExportClause, ExportSeg, SegKind } from "./docx";
import { placeholdersIn } from "@/lib/templates";

/**
 * The document as it will read, both ways, before anyone downloads it.
 *
 * The exporters are correct and were reachable from nothing: a lawyer finished
 * a contract and had no way to see the finished thing, let alone hand it over.
 * The obvious fix is a pair of download buttons, but a download you cannot
 * check first is a poor way to find out that a clause is missing.
 *
 * So this builds both readings — clean and compared — from the same
 * `ExportClause[]` the exporters are handed. Not from a second query, and not
 * from the editor's own state: a preview drawn from different data than the
 * file is a preview that can lie, and the whole point of it is to be trusted.
 */

export type PreviewRun = { text: string; kind: SegKind };

export type PreviewClause = {
  num: string;
  title: string;
  runs: PreviewRun[];
  /** Nothing survives the clean copy: it is a clause that was deleted whole. */
  emptyWhenClean: boolean;
  /** Printed without its number, like the file this previews. */
  unnumbered?: boolean;
};

export const CLEAN_KINDS: SegKind[] = ["n", "i"];

/**
 * The clause's body as runs, from what the file itself is built from.
 *
 * Where the clause has a document, its paragraphs are the body and the
 * exporters ignore `segs`. This read `segs` alone, so every change made in the
 * editor, accepted or still tracked, was missing from the preview while the
 * download carried it: a fee changed to 5,500 still previewed as 4,500, under
 * "nothing tracked". A table row reads as `| cell | cell |`, as the segments do.
 */
export function bodySegs(clause: ExportClause): ExportSeg[] {
  if (!clause.paras?.length) return clause.segs;
  const out: ExportSeg[] = [];
  const line = () => {
    if (out.length) out.push({ t: "\n", k: "n" });
  };
  for (const para of clause.paras) {
    if (para.grid) {
      for (const row of para.grid.rows) {
        line();
        out.push({ t: "| ", k: "n" });
        row.cells.forEach((cell, i) => {
          if (i) out.push({ t: " | ", k: "n" });
          out.push(...cell.map((r) => ({ ...r, t: r.t.replace(/\n/g, " ") })));
        });
        out.push({ t: " |", k: "n" });
      }
      continue;
    }
    line();
    out.push(...para.runs);
  }
  return out;
}

/** Runs as the clean copy reads them: deletions gone, insertions ordinary text. */
export function cleanRuns(clause: ExportClause): PreviewRun[] {
  return bodySegs(clause)
    .filter((s) => s.k !== "d" && s.t)
    .map((s) => ({ text: s.t, kind: "n" as SegKind }));
}

/** Runs as the compared copy reads them: every insertion and deletion kept. */
export function redlineRuns(clause: ExportClause): PreviewRun[] {
  return bodySegs(clause)
    .filter((s) => s.t)
    .map((s) => ({ text: s.t, kind: s.k }));
}

export type DocumentPreview = {
  clean: PreviewClause[];
  redline: PreviewClause[];
  /** How many clauses the compared copy changes at all. */
  changed: number;
  /** How many clauses the clean copy drops entirely. */
  removed: number;
  /**
   * Whether a comparison means anything here.
   *
   * A contract drafted from scratch has no prior version, so nothing is
   * tracked and the two readings are the same words. Showing them side by
   * side would be showing the same document twice and calling one of them a
   * comparison. When there is nothing to compare, there is one document.
   */
  comparable: boolean;
};

const changedClause = (clause: ExportClause) => bodySegs(clause).some((s) => s.k !== "n" && s.t);

export function buildPreview(clauses: ExportClause[]): DocumentPreview {
  const clean: PreviewClause[] = [];
  const redline: PreviewClause[] = [];
  let changed = 0;
  let removed = 0;

  for (const clause of clauses) {
    const cleaned = cleanRuns(clause);
    const marked = redlineRuns(clause);
    // Deleted whole means it had words and every one is struck; a heading with
    // no body of its own ("Schedule 2 — Services") is not a deletion.
    const emptyWhenClean = cleaned.length === 0 && marked.length > 0;
    if (changedClause(clause)) changed += 1;
    if (emptyWhenClean) removed += 1;

    // A clause deleted whole still has a row in the clean column, saying it is
    // gone. Dropping it silently would put the two columns out of step, and
    // the point of reading them side by side is that the rows line up.
    clean.push({
      num: clause.num,
      title: clause.title,
      ...(clause.unnumbered ? { unnumbered: true } : {}),
      runs: cleaned,
      emptyWhenClean,
      ...(clause.unnumbered ? { unnumbered: true } : {}),
    });
    redline.push({
      num: clause.num,
      title: clause.title,
      runs: marked,
      emptyWhenClean,
    });
  }

  return { clean, redline, changed, removed, comparable: changed > 0 };
}

/** What the two columns are called, and what each one is for. */
export const PREVIEW_COLUMNS = {
  redline: {
    label: "Compared",
    hint: "Every change against the version you started from. Insertions underlined, deletions struck through.",
  },
  clean: {
    label: "Clean",
    hint: "The document with every change applied. This is the copy to send.",
  },
} as const;

/**
 * What the document still needs a human to supply.
 *
 * The drafter is told to mark anything it was not given as a {{placeholder}}
 * naming what is missing, rather than invent a party, a sum or a date. That
 * instruction is worth nothing on its own. It is worth something only when the
 * gaps are listed where the document is read — otherwise an unfinished draft
 * looks finished, and the counterparty finds the blank.
 *
 * Struck-out wording is ignored: nobody has to fill in a placeholder inside
 * text that is being deleted. The front matter is scanned too, because that is
 * where a party's address usually goes missing.
 */
export function outstandingFacts(
  clauses: ExportClause[],
  front?: { cover: { text: string }[]; preamble: { text: string }[] },
): { where: string; fields: string[] }[] {
  const out: { where: string; fields: string[] }[] = [];

  if (front) {
    const frontText = [...front.cover, ...front.preamble].map((l) => l.text).join("\n");
    const fields = [...new Set(placeholdersIn(frontText))];
    if (fields.length) out.push({ where: "Cover and preamble", fields });
  }

  for (const clause of clauses) {
    const text = bodySegs(clause)
      .filter((s) => s.k !== "d")
      .map((s) => s.t)
      .join("\n");
    const fields = [...new Set(placeholdersIn(text))];
    if (fields.length)
      out.push({ where: [clause.num, clause.title].filter(Boolean).join(" "), fields });
  }
  return out;
}

/** How many distinct facts are outstanding across the whole document. */
export const outstandingCount = (facts: { fields: string[] }[]): number =>
  new Set(facts.flatMap((f) => f.fields.map((x) => x.toLowerCase()))).size;
