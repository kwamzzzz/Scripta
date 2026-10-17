/**
 * The mark-up history of a matter: every version of every clause, and what the
 * step between two of them did.
 *
 * The documents come off `clause_revisions`, which is written on every save and
 * cannot be altered or deleted. This function turns them into steps and sends
 * the descriptions — not the documents. A matter with 83 clauses and a week of
 * editing would otherwise put several megabytes of clause JSON on the wire to
 * draw one list.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { asDoc, type ClauseDoc } from "@/wireframe/clause-doc";
import { describeStep, type MarkupStep } from "@/lib/markup-step";

export type HistoryEntry = {
  /** The revision this step produced. */
  id: string;
  clauseId: string | null;
  clauseNum: string;
  clauseTitle: string;
  at: string;
  author: string;
  authorId: string | null;
  /** `baseline` as read, `step` a save, `kept`/`milestone` a bookmark, `restored` a going-back. */
  kind: string;
  label: string;
  note: string;
  step: MarkupStep;
};

type Row = {
  id: string;
  clause_id: string | null;
  clause_num: string;
  clause_title: string;
  kind: string;
  label: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  doc: unknown;
};

/**
 * Every step in the history, newest first.
 *
 * Steps are read per clause — a step is the difference between one version of
 * a clause and the version before it — and then merged into one timeline,
 * because what a lawyer wants back is the afternoon's work, not one clause's
 * life story. `clauseId` narrows it to a single clause.
 */
export const loadMarkupHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; clauseId?: string | undefined }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let read = supabase
      .from("clause_revisions")
      .select(
        "id, clause_id, clause_num, clause_title, kind, label, note, created_by, created_at, doc",
      )
      .eq("matter_id", data.matterId)
      .order("created_at", { ascending: true })
      .limit(2000);
    if (data.clauseId) read = read.eq("clause_id", data.clauseId);
    const { data: rows, error } = await read;
    if (error) throw new Error(error.message);

    const revisions = (rows ?? []) as unknown as Row[];
    if (!revisions.length)
      return { entries: [] as HistoryEntry[], authors: {} as Record<string, string> };

    /* Who they were. One read for the names, so a timeline of forty steps is
       not forty profile lookups. */
    const ids = [...new Set(revisions.map((r) => r.created_by).filter((id): id is string => !!id))];
    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const names = new Map<string, string>(
      ((people ?? []) as { id: string; full_name: string | null; email: string | null }[]).map(
        (p) => [p.id, p.full_name || p.email || "Unknown"],
      ),
    );

    /* The step is against the previous version OF THE SAME CLAUSE, which is
       why the timeline is built per clause and merged afterwards. A revision
       whose clause has since been deleted keeps its own chain, under the
       number the clause had at the time. */
    const chains = new Map<string, Row[]>();
    for (const row of revisions) {
      const key = row.clause_id ?? `gone:${row.clause_num}:${row.clause_title}`;
      const chain = chains.get(key) ?? [];
      chain.push(row);
      chains.set(key, chain);
    }

    const entries: HistoryEntry[] = [];
    for (const chain of chains.values()) {
      let previous: ClauseDoc | null = null;
      for (const row of chain) {
        const after = asDoc(row.doc);
        if (!after) continue;
        /* A baseline is where a record starts, not a step in the mark-up: it
           is how the clause arrived, or how it read when the document was read
           again. Diffed against whatever came before, a re-read would show up
           as somebody striking out their own accepted wording, which is not
           what happened. It reads as itself; the steps before it stay in the
           timeline and say what was done. */
        const step = describeStep(row.kind === "baseline" ? null : previous, after);
        previous = after;
        // A save that moved nothing is not a step in anybody's history.
        if (step.nothing && row.kind === "step") continue;
        entries.push({
          id: row.id,
          clauseId: row.clause_id,
          clauseNum: row.clause_num,
          clauseTitle: row.clause_title,
          at: row.created_at,
          author: (row.created_by && names.get(row.created_by)) || "Unknown",
          authorId: row.created_by,
          kind: row.kind,
          label: row.label ?? "",
          note: row.note ?? "",
          step,
        });
      }
    }

    entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return { entries, authors: Object.fromEntries(names) };
  });
