/**
 * Every outstanding change on a matter, in one place.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, AND THE THING IT MUST NOT BECOME
 * ---------------------------------------------------------------------------
 *
 * It is a reading of the document: here is what is proposed, by whom, where.
 * It is not a work queue. There is no status on a change, nothing is assigned,
 * nothing is due, and no change can be "in progress". A change has exactly two
 * ends — it is outstanding, or somebody settled it — and any third state would
 * be the workflow product Kwame asked this not to become.
 *
 * ---------------------------------------------------------------------------
 * THE CHANGES ARE COMPUTED HERE, THE RIGHTS ARE NOT
 * ---------------------------------------------------------------------------
 *
 * `changesIn()` is the one implementation of what a change is, so the pane runs
 * it over the clause documents rather than asking a server function to walk the
 * same marks in plpgsql. Who may settle which of them is the opposite case:
 * that is a permission, it is decided by `can_settle_change()`, and the pane is
 * not allowed to have an opinion about it.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { asDoc, type ClauseDoc } from "@/wireframe/clause-doc";
import { changesIn, type TrackedChange } from "@/wireframe/tracked-change";

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type MatterChange = TrackedChange & {
  clauseId: string;
  clauseNum: string | null;
  clauseTitle: string | null;
  /** The clause as it stands, so a settlement can be computed against it. */
  doc: ClauseDoc;
};

export type MatterStanding = {
  /** Whether this caller may settle a change by this author on this clause. */
  maySettle: (clauseId: string, authorId: string) => boolean;
};

export function useMatterChanges(matterId: string | null | undefined) {
  return useQuery({
    queryKey: ["matter-changes", matterId],
    enabled: !!matterId,
    queryFn: async (): Promise<MatterChange[]> => {
      const { data, error } = await db
        .from("clauses")
        .select("id, num, title, doc, ordinal")
        .eq("matter_id", matterId)
        .order("ordinal");
      if (error) throw new Error(error.message);

      const out: MatterChange[] = [];
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const doc = asDoc(row["doc"]);
        if (!doc) continue;
        for (const change of changesIn(doc)) {
          out.push({
            ...change,
            clauseId: String(row["id"]),
            clauseNum: (row["num"] as string | null) ?? null,
            clauseTitle: (row["title"] as string | null) ?? null,
            doc,
          });
        }
      }
      return out;
    },
  });
}

/** Who may settle what, across the matter. One call, not one per clause. */
export function useMatterStanding(matterId: string | null | undefined, authors: string[]) {
  const key = [...new Set(authors)].sort().join(",");
  return useQuery({
    queryKey: ["matter-standing", matterId, key],
    enabled: !!matterId,
    queryFn: async (): Promise<MatterStanding> => {
      const { data, error } = await db.rpc("matter_clause_context", {
        _matter: matterId,
        _authors: [...new Set(authors)],
      });
      if (error) throw new Error(error.message);
      const grid = new Map<string, Set<string>>();
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        grid.set(String(row["clause_id"]), new Set((row["settleable"] as string[] | null) ?? []));
      }
      return {
        maySettle: (clauseId, authorId) => grid.get(clauseId)?.has(authorId) === true,
      };
    },
  });
}

/**
 * The changes grouped the way a lawyer asks for them.
 *
 * "What has Podrick proposed" and "what is outstanding on clause 7" are the two
 * questions; there is no third, and no saved view, and no preference to
 * remember which one you asked last.
 */
export type Grouping = "person" | "clause";

export type ChangeGroup = {
  key: string;
  label: string;
  changes: MatterChange[];
};

export function group(
  changes: MatterChange[],
  by: Grouping,
  nameOf: (authorId: string) => string,
): ChangeGroup[] {
  const groups = new Map<string, ChangeGroup>();
  for (const change of changes) {
    const key = by === "person" ? change.authorId : change.clauseId;
    const label =
      by === "person"
        ? nameOf(change.authorId)
        : [change.clauseNum, change.clauseTitle].filter(Boolean).join(" · ") || "Untitled clause";
    const existing = groups.get(key);
    if (existing) existing.changes.push(change);
    else groups.set(key, { key, label, changes: [change] });
  }
  return [...groups.values()];
}

/**
 * The sittings inside one group, so "accept all of these" can mean one act.
 *
 * A set is one person's work in one session on one clause. Accepting across
 * clauses in a single click would be a bulk operation on a contract, which is
 * the kind of button that ends up in a negligence claim.
 */
export function sittings(
  changes: MatterChange[],
): { clauseId: string; setId: string; count: number }[] {
  const seen = new Map<string, { clauseId: string; setId: string; count: number }>();
  for (const change of changes) {
    if (!change.setId) continue;
    const key = `${change.clauseId}:${change.setId}`;
    const existing = seen.get(key);
    if (existing) existing.count += 1;
    else seen.set(key, { clauseId: change.clauseId, setId: change.setId, count: 1 });
  }
  return [...seen.values()];
}
