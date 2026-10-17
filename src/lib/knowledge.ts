/**
 * Knowledge: what it is, who may use it, and whether the firm stands behind it.
 *
 * ---------------------------------------------------------------------------
 * MATTER ACCESS AND KNOWLEDGE ACCESS ARE DIFFERENT THINGS
 * ---------------------------------------------------------------------------
 *
 * Nothing in this file consults matter membership, and nothing in the matter
 * code consults this. A lawyer on a file does not thereby get the firm's
 * library, and a lawyer using a precedent does not thereby get the matter it
 * came from. That separation is the whole premise of Phase 6.
 *
 * ---------------------------------------------------------------------------
 * FOUR STATES, TWO FACTS
 * ---------------------------------------------------------------------------
 *
 * The lawyer sees four. The database keeps two, because they answer different
 * questions and would drift apart if they shared a column:
 *
 *   visibility   who may use this        private | shared | firm
 *   approval     does the firm stand behind this wording
 *
 * MAKING SOMETHING AVAILABLE TO THE FIRM DOES NOT MAKE IT APPROVED. The whole
 * reason for keeping them apart is that one overloaded status column is exactly
 * how that distinction gets lost.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type KnowledgeKind = "playbook" | "precedent" | "template";
export type Visibility = "private" | "shared" | "firm";

/** What a lawyer calls it. Never the column name. */
export type KnowledgeState = "private" | "shared" | "firm" | "approved";

export type KnowledgeFacts = {
  visibility: Visibility;
  approvedAt: string | null;
  contentChangedAt: string | null;
};

/**
 * The four states, from the two facts.
 *
 * An approval counts only while it still applies to the wording it was given
 * for. A precedent approved on Tuesday and rewritten on Wednesday is firm-wide
 * and unapproved, not approved — and it says so without anybody having to
 * remember to clear a flag.
 */
export function stateOf(facts: KnowledgeFacts): KnowledgeState {
  if (facts.visibility !== "firm") return facts.visibility;
  const approved =
    !!facts.approvedAt && (!facts.contentChangedAt || facts.approvedAt >= facts.contentChangedAt);
  return approved ? "approved" : "firm";
}

/** Whether an approval was given and has since been overtaken by an amendment. */
export function approvalWentStale(facts: KnowledgeFacts): boolean {
  return (
    !!facts.approvedAt && !!facts.contentChangedAt && facts.approvedAt < facts.contentChangedAt
  );
}

export const STATE_LABEL: Record<KnowledgeState, string> = {
  private: "Private",
  shared: "Shared",
  firm: "Firm-wide",
  approved: "Approved",
};

export const STATE_MEANING: Record<KnowledgeState, string> = {
  private: "Yours. Nobody else in the firm can see it.",
  shared: "Available to the people you have named.",
  firm: "Available to everyone in the firm. Not approved as firm knowledge.",
  approved: "Approved firm knowledge. The firm stands behind this wording.",
};

export type KnowledgeContext = {
  mayWrite: boolean;
  mayApprove: boolean;
  isOwner: boolean;
  visibility: Visibility;
  approved: boolean;
  sharedWith: number;
};

/**
 * What this lawyer may do with one object.
 *
 * Decided by `can_write_knowledge` and `can_approve_knowledge` — the same
 * functions the write path consults — so a control that is drawn is a control
 * that works. The rule Phase 4 arrived at after `task_actions()` was found
 * answering with more authority than its caller.
 */
export function useKnowledgeContext(kind: KnowledgeKind, id: string | null | undefined) {
  return useQuery({
    queryKey: ["knowledge-context", kind, id],
    enabled: !!id,
    queryFn: async (): Promise<KnowledgeContext | null> => {
      const { data, error } = await db.rpc("knowledge_context", { _kind: kind, _id: id });
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        mayWrite: row["may_write"] === true,
        mayApprove: row["may_approve"] === true,
        isOwner: row["is_owner"] === true,
        visibility: (row["visibility"] as Visibility) ?? "private",
        approved: row["approved"] === true,
        sharedWith: Number(row["shared_with"] ?? 0),
      };
    },
  });
}

export type Share = {
  id: string;
  subjectId: string;
  /** 'user' or 'team'. A team share follows the team; a user share does not. */
  subjectType: "user" | "team";
  createdAt: string;
};

export function useShares(kind: KnowledgeKind, id: string | null | undefined) {
  return useQuery({
    queryKey: ["knowledge-shares", kind, id],
    enabled: !!id,
    queryFn: async (): Promise<Share[]> => {
      const { data, error } = await db
        .from("knowledge_shares")
        .select("id, subject_id, subject_type, created_at")
        .eq("kind", kind)
        .eq("object_id", id);
      if (error) return [];
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row["id"]),
        subjectId: String(row["subject_id"]),
        subjectType: (row["subject_type"] as "user" | "team") ?? "user",
        createdAt: String(row["created_at"] ?? ""),
      }));
    },
  });
}

const forget = (qc: ReturnType<typeof useQueryClient>, kind: KnowledgeKind, id: string) => {
  for (const key of [
    ["knowledge-context", kind, id],
    ["knowledge-shares", kind, id],
    ["precedents"],
    ["templates"],
    ["playbooks"],
    ["knowledge"],
    ["awareness"],
  ]) {
    void qc.invalidateQueries({ queryKey: key });
  }
};

export function useKnowledgeActions(kind: KnowledgeKind, id: string) {
  const qc = useQueryClient();
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await db.rpc(fn, { _kind: kind, _id: id, ...args });
    if (error) throw new Error(error.message);
  };
  const done = () => forget(qc, kind, id);

  return {
    setVisibility: useMutation({
      mutationFn: (visibility: Visibility) =>
        call("set_knowledge_visibility", { _visibility: visibility }),
      onSuccess: done,
    }),
    share: useMutation({
      mutationFn: (userId: string) => call("share_knowledge", { _with: userId }),
      onSuccess: done,
    }),
    unshare: useMutation({
      mutationFn: (userId: string) => call("unshare_knowledge", { _with: userId }),
      onSuccess: done,
    }),
    /* Approving is a professional act, not a checkbox. The server stamps who
       and when; the client sends neither, and could not if it tried — both
       columns are off the update grant. */
    approve: useMutation({ mutationFn: () => call("approve_knowledge", {}), onSuccess: done }),
    withdrawApproval: useMutation({
      mutationFn: () => call("withdraw_knowledge_approval", {}),
      onSuccess: done,
    }),
  };
}

export type Provenance = {
  derived: boolean;
  maySeeSource: boolean;
  matterId: string | null;
  matterName: string | null;
  matterReference: string | null;
  sourceNote: string | null;
  usedAt: string | null;
};

/**
 * Where a precedent came from, to the extent this lawyer may hear it.
 *
 * The resolver decides, not this hook and not the screen. Somebody on the
 * source matter gets the matter; everybody else gets `derived` and nulls, and
 * the interface says "Derived from prior work".
 *
 * PROVENANCE VISIBILITY <= SOURCE VISIBILITY. Knowledge sharing is not a side
 * channel through the matter boundary.
 */
export function usePrecedentProvenance(precedentId: string | null | undefined) {
  return useQuery({
    queryKey: ["precedent-provenance", precedentId],
    enabled: !!precedentId,
    queryFn: async (): Promise<Provenance | null> => {
      const { data, error } = await db.rpc("precedent_provenance", { _precedent: precedentId });
      if (error) return null;
      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        derived: row["derived"] === true,
        maySeeSource: row["may_see_source"] === true,
        matterId: (row["matter_id"] as string | null) ?? null,
        matterName: (row["matter_name"] as string | null) ?? null,
        matterReference: (row["matter_reference"] as string | null) ?? null,
        sourceNote: (row["source_note"] as string | null) ?? null,
        usedAt: (row["used_at"] as string | null) ?? null,
      };
    },
  });
}

/** The sentence shown under a precedent that came from somewhere. */
export function describeProvenance(p: Provenance | null): string | null {
  if (!p || !p.derived) return null;
  if (!p.maySeeSource) return "Derived from prior work.";
  const bits = [p.matterName, p.matterReference].filter(Boolean).join(" · ");
  return bits ? `From ${bits}.` : "Derived from prior work.";
}
