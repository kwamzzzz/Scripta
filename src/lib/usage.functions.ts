import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { costUsd, ratesConfigured } from "@/lib/ai-pricing";
import { activeProviderLabel } from "@/lib/ai-gateway.server";

/**
 * This month's AI spend, for the usage pill.
 *
 * The cap comes from the harness spec published for this workspace rather
 * than a setting of its own, so the number the pill counts against is the
 * same one that was agreed and versioned. Cost stays null until rates are
 * configured: the pill then reports tokens and says so, instead of showing
 * a total that looks like money but is not.
 */

export interface FeatureUsage {
  feature: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface UsageSummary {
  /** First day of the current month, ISO, so the UI can name the period. */
  since: string;
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  /** Null when any model seen this month has no rate configured. */
  costUsd: number | null;
  ratesKnown: boolean;
  capUsd: number | null;
  byFeature: FeatureUsage[];
}

type Row = {
  feature: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | string | null;
  ok: boolean;
};

const startOfMonth = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

/** Pure, so the arithmetic can be tested without a database. */
export function summarise(rows: Row[], since: string, capUsd: number | null): UsageSummary {
  const models = [...new Set(rows.map((r) => r.model))];
  const ratesKnown = ratesConfigured(models);
  const byFeature = new Map<string, FeatureUsage>();
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  let failures = 0;

  for (const r of rows) {
    const at = byFeature.get(r.feature) ?? {
      feature: r.feature,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: ratesKnown ? 0 : null,
    };
    at.calls += 1;
    at.inputTokens += r.input_tokens;
    at.outputTokens += r.output_tokens;
    // Postgres returns numeric as a string; Number handles both. A row
    // written before its model had a rate stored null, so recompute from the
    // tokens rather than letting old calls count as free forever. Provider is
    // included so Lovable-credit usage never gets a fabricated dollar cost.
    const rowCost =
      r.cost_usd === null
        ? costUsd(r.model, r.input_tokens, r.output_tokens, r.provider)
        : Number(r.cost_usd);
    if (at.costUsd !== null && rowCost !== null) at.costUsd += rowCost;
    byFeature.set(r.feature, at);

    inputTokens += r.input_tokens;
    outputTokens += r.output_tokens;
    if (rowCost !== null) cost += rowCost;
    if (!r.ok) failures += 1;
  }

  return {
    since,
    calls: rows.length,
    failures,
    inputTokens,
    outputTokens,
    costUsd: ratesKnown ? Math.round(cost * 1e6) / 1e6 : null,
    ratesKnown,
    capUsd,
    // Biggest spender first: the point of the breakdown is to show where it went.
    byFeature: [...byFeature.values()].sort(
      (a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
    ),
  };
}

export const usageThisMonth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId?: string | null } | undefined) => input ?? {})
  .handler(async ({ data: input, context }): Promise<UsageSummary> => {
    const { supabase } = context;
    const since = startOfMonth();

    // This is the signed-in lawyer's own usage for the month, not one
    // workspace's. Rows carry a workspace_id, but no AI caller passes one, so
    // every row is written untagged; filtering on it would report zero and
    // call it "No usage yet". RLS already limits the rows to this user. If
    // callers start tagging, this is where the predicate goes.
    const { data, error } = await supabase
      .from("ai_usage_events")
      .select("feature, provider, model, input_tokens, output_tokens, cost_usd, ok")
      .gte("created_at", since);
    if (error) throw new Error(error.message);

    // The most recently published spec for this workspace holds the cap.
    // Matched on recency rather than app name so renaming the app, which has
    // happened once already, cannot quietly detach the cap — and predicated on
    // the workspace, which it was not: it took the newest row the reader could
    // see, so a cap set in one workspace was applied in another.
    let capQuery = supabase
      .from("harness_versions")
      .select("spec")
      .order("published_at", { ascending: false })
      .limit(1);
    if (input.workspaceId) capQuery = capQuery.eq("workspace_id", input.workspaceId);
    const { data: harness } = await capQuery.maybeSingle();
    const raw = (harness?.spec as { controls?: { monthlyCapUsd?: number | null } } | null)?.controls
      ?.monthlyCapUsd;
    const capUsd = typeof raw === "number" && raw > 0 ? raw : null;

    return summarise((data ?? []) as Row[], since, capUsd);
  });

export const aiProviderLabel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<string | null> => activeProviderLabel());
