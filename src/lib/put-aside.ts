/**
 * Everything the workspace has put aside, in one place.
 *
 * Archive and Recently Deleted existed on every collection separately: the
 * views at the end of each library's view row. That is the right place to
 * archive something and the wrong place to find it again, because finding it
 * again means remembering which collection it was in. A lawyer who deleted
 * "the Atlas thing" knows what it was called and not whether Scripta filed it
 * under Contract Review, Contract Drafting or Corporate Drafting.
 *
 * So the same rows are gathered here by what happened to them rather than by
 * what kind of thing they are. Nothing new is stored: these read the same
 * `archived_at` and `deleted_at` columns the libraries read, and restoring
 * goes through the same `lib/archive` and `lib/trash` the libraries use, so a
 * row put back here is put back in exactly the sense it is put back there.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ArchivableTable } from "@/lib/archive";

export type PutAsideKind = {
  table: ArchivableTable;
  /** What a lawyer calls one of these. */
  label: string;
  /** Where its own collection lives, for the row that wants to go back to it. */
  to: string;
  /** The column carrying its name. Not every table agrees. */
  titleColumn: "name" | "title";
  /** Absent on `documents`, which is scoped through its matter instead. */
  scoped: boolean;
};

/**
 * Every collection with a bin. Deliberately the same set `ArchivableTable`
 * names, so a collection that gains an archive gains a place here by adding
 * one line rather than by being remembered.
 */
export const PUT_ASIDE_KINDS: PutAsideKind[] = [
  { table: "matters", label: "Matter", to: "/matters", titleColumn: "name", scoped: true },
  {
    table: "contract_drafts",
    label: "Contract draft",
    to: "/matters/contract-drafting",
    titleColumn: "title",
    scoped: true,
  },
  {
    table: "corporate_documents",
    label: "Corporate document",
    to: "/matters/corporate-drafting",
    titleColumn: "title",
    scoped: true,
  },
  {
    table: "research_matters",
    label: "Research",
    to: "/research",
    titleColumn: "title",
    scoped: true,
  },
  { table: "documents", label: "Document", to: "/documents", titleColumn: "name", scoped: false },
  { table: "playbooks", label: "Playbook", to: "/playbooks", titleColumn: "name", scoped: true },
  { table: "precedents", label: "Precedent", to: "/knowledge", titleColumn: "title", scoped: true },
  { table: "templates", label: "Template", to: "/templates", titleColumn: "name", scoped: true },
  {
    table: "flow_presets",
    label: "Preset",
    to: "/matters/flow/presets",
    titleColumn: "name",
    scoped: true,
  },
  {
    table: "flow_preset_families",
    label: "Preset family",
    to: "/matters/flow/presets",
    titleColumn: "name",
    scoped: true,
  },
  { table: "clients", label: "Client", to: "/clients", titleColumn: "name", scoped: true },
  // Only a flow filed to no matter is put aside as itself; a filed one goes
  // with its matter and is listed as that matter.
  { table: "matter_flows", label: "Flow", to: "/matters/flow", titleColumn: "name", scoped: true },
];

export type PutAsideRow = {
  /** Unique across collections: two tables can hold the same uuid. */
  id: string;
  rowId: string;
  table: ArchivableTable;
  kind: string;
  to: string;
  title: string;
  archivedAt: string | null;
  deletedAt: string | null;
  updatedAt: string;
};

export type PutAsideState = "archived" | "deleted";

/**
 * What is archived, or what is in the bin, across every collection.
 *
 * One query per collection. They are small — these are the things nobody is
 * working on — and asking each table separately keeps this honest about which
 * collection a row came from, which is the column the screen exists to show.
 */
export async function listPutAside(
  workspaceId: string,
  state: PutAsideState,
): Promise<PutAsideRow[]> {
  const column = state === "archived" ? "archived_at" : "deleted_at";

  const results = await Promise.all(
    PUT_ASIDE_KINDS.map(async (kind) => {
      // One query shape over ten tables that do not share a row type, so the
      // generated types cannot narrow it. The shape is checked by the mapping
      // below and by the tests, not by the client.
      let query: any = supabase
        .from(kind.table)
        .select(`id, ${kind.titleColumn}, archived_at, deleted_at, updated_at`)
        .not(column, "is", null);
      // Archived means archived and not also binned: a row in the bin is in the
      // bin, whatever was decided about it before.
      if (state === "archived") query = query.is("deleted_at", null);
      if (kind.scoped) query = query.eq("workspace_id", workspaceId);

      const { data, error } = await query;
      // One collection refusing must not empty the screen: the others are
      // still true, and a row you cannot see is the whole problem here.
      if (error) return [];
      return (data ?? []).map((row: any): PutAsideRow => ({
        id: `${kind.table}:${row.id}`,
        rowId: row.id as string,
        table: kind.table,
        kind: kind.label,
        to: kind.to,
        title: (row[kind.titleColumn] as string) || "Untitled",
        archivedAt: row.archived_at ?? null,
        deletedAt: row.deleted_at ?? null,
        updatedAt: (row.updated_at as string) ?? "",
      }));
    }),
  );

  return results
    .flat()
    .sort((a, b) =>
      (b.deletedAt ?? b.archivedAt ?? "").localeCompare(a.deletedAt ?? a.archivedAt ?? ""),
    );
}

/** Rows grouped by the collection they came from, so one call restores each. */
export const byTable = (rows: PutAsideRow[]) => {
  const out = new Map<ArchivableTable, string[]>();
  for (const row of rows) {
    const list = out.get(row.table);
    if (list) list.push(row.rowId);
    else out.set(row.table, [row.rowId]);
  }
  return out;
};
