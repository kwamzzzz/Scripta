import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** A note is kept for a reader; an instruction is handed to the redraft. */
export type NoteKind = "note" | "instruction";

export type Note = {
  id: string;
  entity_kind: "matter" | "clause";
  entity_id: string;
  body: string;
  author_id: string | null;
  resolved: boolean;
  created_at: string;
  kind: NoteKind;
};

const COLUMNS =
  "id, workspace_id, entity_kind, entity_id, body, author_id, resolved, created_at, kind";

const normalise = (rows: unknown[]): Note[] =>
  rows.map((row) => {
    const value = row as Record<string, unknown>;
    return {
      id: String(value["id"] ?? ""),
      entity_kind: value["entity_kind"] === "matter" ? "matter" : "clause",
      entity_id: String(value["entity_id"] ?? ""),
      body: String(value["body"] ?? ""),
      author_id: typeof value["author_id"] === "string" ? value["author_id"] : null,
      resolved: value["resolved"] === true,
      created_at: String(value["created_at"] ?? ""),
      kind: value["kind"] === "instruction" ? "instruction" : "note",
    };
  });

/** Matter-level notes plus every clause comment for a matter, newest first. */
export function useNotes(matterId: string | null, clauseIds: string[]) {
  return useQuery({
    queryKey: ["notes", matterId, clauseIds],
    enabled: !!matterId,
    queryFn: async () => {
      const matterRequest = supabase
        .from("comments")
        .select(COLUMNS)
        .eq("entity_kind", "matter")
        .eq("entity_id", matterId!);
      const clauseRequest = clauseIds.length
        ? supabase
            .from("comments")
            .select(COLUMNS)
            .eq("entity_kind", "clause")
            .in("entity_id", clauseIds)
        : null;
      const [matterResult, clauseResult] = await Promise.all([
        matterRequest,
        clauseRequest ?? Promise.resolve({ data: [], error: null }),
      ]);
      if (matterResult.error) throw new Error(matterResult.error.message);
      if (clauseResult.error) throw new Error(clauseResult.error.message);
      return normalise([...(matterResult.data ?? []), ...(clauseResult.data ?? [])]).sort(
        (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
      );
    },
  });
}
