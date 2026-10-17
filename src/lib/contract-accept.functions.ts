import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { acceptedDraftRows } from "@/lib/contract-accept";

const clause = z.object({
  num: z.string().trim().min(1).max(12),
  title: z.string().trim().min(1).max(200),
  purpose: z.string().trim().max(500),
});
const plan = z.object({
  agreementType: z.string().trim().min(1).max(200),
  governingLaw: z.string().trim().max(200),
  clauses: z.array(clause).min(1).max(80),
});
const outcome = z.discriminatedUnion("ok", [
  z.object({
    num: z.string().trim().min(1).max(12),
    title: z.string().trim().min(1).max(200),
    ok: z.literal(true),
    text: z.string().trim().min(1).max(12_000),
  }),
  z.object({
    num: z.string().trim().min(1).max(12),
    title: z.string().trim().min(1).max(200),
    ok: z.literal(false),
    reason: z.string().trim().min(1).max(2_000),
  }),
]);
const input = z.object({
  workspaceId: z.string().uuid(),
  matterId: z.string().uuid().nullable().optional(),
  matterTitle: z.string().trim().min(1).max(300),
  plan,
  outcomes: z.array(outcome).min(1).max(80),
});

type Accepted = { matterId: string; documentId: string; clauseCount: number };

/** The first write in fresh-contract drafting: one atomic, lawyer-triggered acceptance. */
export const acceptFreshContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) => input.parse(value))
  .handler(async ({ data, context }): Promise<Accepted> => {
    const { supabase } = context as any;
    const rows = acceptedDraftRows(data.plan, data.outcomes);
    const { data: accepted, error } = await supabase.rpc("accept_fresh_contract", {
      _workspace_id: data.workspaceId,
      _matter_id: data.matterId ?? null,
      _matter_name: data.matterTitle,
      _agreement_type: data.plan.agreementType,
      _governing_law: data.plan.governingLaw,
      _clauses: rows.map((row) => ({
        num: row.num,
        title: row.title,
        text: row.segments[0]!.text,
      })),
    });
    if (error) throw new Error(error.message);
    const result = accepted as Record<string, unknown> | null;
    if (
      !result ||
      typeof result["matterId"] !== "string" ||
      typeof result["documentId"] !== "string" ||
      typeof result["clauseCount"] !== "number"
    )
      throw new Error("The contract was accepted, but its destination could not be confirmed.");
    return {
      matterId: result["matterId"],
      documentId: result["documentId"],
      clauseCount: result["clauseCount"],
    };
  });
