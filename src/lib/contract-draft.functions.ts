/* eslint-disable @typescript-eslint/no-explicit-any -- the request-scoped Supabase client follows the existing server-function boundary. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callStructured } from "@/lib/ai-gateway.server";
import { loadMatterContext } from "@/lib/matter-context.server";
import {
  CLAUSE_DRAFT_SYSTEM,
  clauseDraftPrompt,
  cleanClauseText,
  clausesToDraft,
  type ClauseDraftOutcome,
} from "@/lib/contract-draft";
import type { ClausePlan, ContractPlan } from "@/lib/contract-plan";

/**
 * Drafting a contract from its approved plan.
 *
 * One call per clause, run a few at a time. A failure is contained to the
 * clause it happened on: that clause reports why and keeps its place in the
 * list, and the run carries on. A run that abandoned everything because clause
 * 19 timed out would waste eighteen good clauses; one that quietly dropped
 * clause 19 would hand back a contract with a hole in it and no sign of where.
 *
 * Nothing is written here. The result is returned for the lawyer to read and
 * accept — assembling it into `clauses` and `clause_segments` is a separate,
 * deliberate step.
 */

const CLAUSE_TOOL = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: {
      type: "string",
      minLength: 1,
      maxLength: 12_000,
      description: "The clause wording only. No number, no heading, no commentary.",
    },
  },
  required: ["text"],
};

/** How many clauses are in flight at once. Enough to be quick, few enough to
 *  stay a polite caller of someone else's rate limit. */
const CONCURRENCY = 4;

async function inBatches<T, R>(
  items: T[],
  size: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(...(await Promise.all(items.slice(i, i + size).map((item, j) => run(item, i + j)))));
  return out;
}

/** The firm's position on a clause type, when the matter's playbook has one. */
async function playbookPositions(
  supabase: any,
  matterId: string | null,
): Promise<Map<string, string>> {
  const positions = new Map<string, string>();
  if (!matterId) return positions;
  const { data: matter } = await supabase
    .from("matters")
    .select("playbook_id")
    .eq("id", matterId)
    .maybeSingle();
  const playbookId = matter?.playbook_id as string | undefined;
  if (!playbookId) return positions;
  const { data: rules } = await supabase
    .from("playbook_rules")
    .select("topic, preferred, fallback, redflag")
    .eq("playbook_id", playbookId);
  for (const rule of (rules ?? []) as Record<string, string | null>[]) {
    const topic = (rule["topic"] ?? "").trim().toLowerCase();
    if (!topic) continue;
    const lines = [
      rule["preferred"] ? `Preferred: ${rule["preferred"]}` : null,
      rule["fallback"] ? `Acceptable fallback: ${rule["fallback"]}` : null,
      rule["redflag"] ? `Never accept: ${rule["redflag"]}` : null,
    ].filter(Boolean);
    if (lines.length) positions.set(topic, lines.join("\n"));
  }
  return positions;
}

/** A clause matches a playbook rule when the rule's topic appears in its title. */
const positionFor = (positions: Map<string, string>, clause: ClausePlan): string | undefined => {
  const title = clause.title.toLowerCase();
  for (const [topic, text] of positions) if (title.includes(topic)) return text;
  return undefined;
};

export const draftContractFromPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      workspaceId: string;
      matterId?: string | null;
      plan: ContractPlan;
      /**
       * Redraft only these clauses, by number.
       *
       * Codex found the hole: retrying one clause by sending a one-clause plan
       * also strips every neighbour out of the outline, so the model loses the
       * cross-references it was told to honour and can no longer check them.
       * Sending the whole plan instead redrafts and re-bills the clauses that
       * were already fine. Neither is a retry.
       *
       * So the full plan is still what the drafter reads; this only narrows
       * the work. Omit it and the whole plan is drafted, as before.
       */
      onlyClauseNums?: string[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    if (!data.plan?.clauses?.length) throw new Error("There is no plan to draft from yet.");

    // Which clauses to write. The plan itself is untouched: it is what every
    // call reads to cross-refer correctly.
    const work = clausesToDraft(data.plan, data.onlyClauseNums);

    // The matter is proved to belong to the workspace before its context is
    // read. RLS authorises each row on its own, which is not the same as the
    // two belonging together.
    let matterContext = "";
    if (data.matterId) {
      const { data: matter, error } = await supabase
        .from("matters")
        .select("id")
        .eq("workspace_id", data.workspaceId)
        .eq("id", data.matterId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!matter) throw new Error("This matter is unavailable in the current workspace.");
      const loaded = await loadMatterContext(supabase, data.matterId);
      matterContext = loaded.text;
    }

    const positions = await playbookPositions(supabase, data.matterId ?? null);

    const outcomes = await inBatches<ClausePlan, ClauseDraftOutcome>(
      work,
      CONCURRENCY,
      async (clause) => {
        try {
          const out = await callStructured<{ text: string }>({
            feature: "contract-draft",
            actor: { supabase, userId },
            system: CLAUSE_DRAFT_SYSTEM,
            user: clauseDraftPrompt({
              plan: data.plan,
              clause,
              matterContext,
              ...(positionFor(positions, clause)
                ? { playbookPosition: positionFor(positions, clause) }
                : {}),
            }),
            toolName: "record_clause",
            toolDescription: "Record the wording of one clause.",
            parameters: CLAUSE_TOOL,
          });
          const text = cleanClauseText(out?.text ?? "", clause);
          if (!text)
            return {
              num: clause.num,
              title: clause.title,
              ok: false,
              reason: "The model returned nothing for this clause.",
            };
          return { num: clause.num, title: clause.title, ok: true, text };
        } catch (cause) {
          return {
            num: clause.num,
            title: clause.title,
            ok: false,
            reason: cause instanceof Error ? cause.message : "This clause could not be drafted.",
          };
        }
      },
    );

    return { outcomes };
  });
