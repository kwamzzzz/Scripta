/**
 * Pointing a matter at a playbook, after the matter exists.
 *
 * ---------------------------------------------------------------------------
 * A PLAYBOOK YOU COULD NEVER APPLY
 * ---------------------------------------------------------------------------
 *
 * `matters.playbook_id` was written in exactly one statement in the product:
 * the INSERT that creates a matter at intake. Nothing updated it, anywhere. So
 * a playbook could only ever be attached in the minute the matter was opened,
 * and every matter already on the file — every matter a firm had before it
 * wrote its first playbook — was permanently unable to use one.
 *
 * The Contract card said "Set on intake, and editable there", which was the
 * closest thing to a warning, and it was wrong twice: intake cannot open an
 * existing matter, so there was no "there" to edit it in.
 *
 * Found by building a playbook and trying to use it, in the clause-workflow
 * acceptance review. Nothing was broken — the feature to attach it had simply
 * never been built, and reading the code would not have told you, because the
 * INSERT looks exactly like a write that works.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlaybookChoice = {
  id: string;
  name: string;
  status: string;
  /** How many positions actually say something. An empty playbook helps nobody. */
  written: number;
  total: number;
};

/**
 * The playbooks this workspace could put on a matter.
 *
 * Archived and deleted ones are left out: offering a lawyer a playbook the firm
 * has retired is offering them last year's positions.
 */
export function usePlaybookChoices(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ["playbook-choices", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<PlaybookChoice[]> => {
      const { data, error } = await supabase
        .from("playbooks")
        .select("id, name, status, archived_at, deleted_at, playbook_rules(id, preferred)")
        .eq("workspace_id", workspaceId!)
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return offerable(data ?? []);
    },
  });
}

/**
 * The rows a lawyer should be offered, and what each is worth.
 *
 * Two rules, both of which matter more than they look:
 *
 * A retired playbook is not offered. Handing somebody last year's positions
 * because the row is still in the table is worse than showing them nothing.
 *
 * A position counts as WRITTEN only when it says where the firm stands. A
 * playbook of eighteen headings and two positions will review a contract
 * against two, and the number on screen has to be the second one — otherwise
 * "18 positions" reads as thoroughness when it means the opposite.
 */
export function offerable(rows: unknown[]): PlaybookChoice[] {
  return (rows as any[])
    .filter((row) => !row.archived_at && !row.deleted_at)
    .map((row) => {
      const rules = (row.playbook_rules ?? []) as { preferred: string | null }[];
      return {
        id: row.id as string,
        name: ((row.name as string) || "").trim() || "Untitled playbook",
        status: (row.status as string) ?? "",
        written: rules.filter((rule) => (rule.preferred ?? "").trim()).length,
        total: rules.length,
      };
    });
}

/**
 * Which playbook this matter is on, by id.
 *
 * Asked directly rather than matched against the name on screen. The matter's
 * display value is `"<name> <version>"` — "Logistics services v1" — so matching
 * it against a playbook's name finds nothing, and the control sat there saying
 * "None linked" over a matter that was linked. Found by clicking it.
 *
 * An id is what the link actually is; a label is what it looks like this week.
 */
export function useMatterPlaybookId(matterId: string) {
  return useQuery({
    queryKey: ["matter-playbook-id", matterId],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("matters")
        .select("playbook_id")
        .eq("id", matterId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return ((data as { playbook_id: string | null } | null)?.playbook_id ?? null) as string | null;
    },
  });
}

/** Attach a playbook to this matter, or take the current one off. */
export function useLinkPlaybook(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (playbookId: string | null) => {
      const { error } = await supabase
        .from("matters")
        .update({ playbook_id: playbookId } as never)
        .eq("id", matterId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      /* The playbook decides what the review reads and what it measures a
         clause against, so everything that quotes it has to ask again. */
      void qc.invalidateQueries({ queryKey: ["matter-playbook-id", matterId] });
      void qc.invalidateQueries({ queryKey: ["matter-data"] });
      void qc.invalidateQueries({ queryKey: ["review"] });
    },
  });
}
