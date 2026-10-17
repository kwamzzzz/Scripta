/**
 * Recording what each AI call spent. Server-only.
 *
 * Every provider reports token counts in its own shape and the gateway
 * used to throw the whole payload away once it had the tool arguments.
 * These helpers pull the counts out before that happens, so an agent loop
 * that resends the conversation at every step is visible as it happens
 * rather than at the end of the month.
 *
 * Recording never breaks a call: if the insert fails, the analysis the
 * lawyer asked for still returns.
 */

import { costUsd } from "./ai-pricing";
import type { Provider } from "./ai-gateway.server";

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
}

export interface UsageRow {
  feature: string;
  provider: Provider;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  ok: boolean;
}

/** Minimal shape of the request-scoped Supabase client the server functions
 *  hold. Deliberately loose, matching the project's own `Sb` type, so both
 *  the fully typed client and the cast ones satisfy it. */
export interface UsageActor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any };
  userId: string;
  workspaceId?: string | null;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Pull token counts from a raw provider response. Unknown shapes give zeros
 *  rather than throwing: a missing count must never lose the analysis. */
export function extractTokens(provider: Provider, payload: unknown): TokenCounts {
  const p = (payload ?? {}) as Record<string, any>;
  if (provider === "gemini") {
    const u = p["usageMetadata"] ?? {};
    // Gemini counts thinking tokens separately; they are billed as output.
    const output = num(u.candidatesTokenCount) + num(u.thoughtsTokenCount);
    return { inputTokens: num(u.promptTokenCount), outputTokens: output };
  }
  if (provider === "anthropic") {
    const u = p["usage"] ?? {};
    return {
      inputTokens:
        num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens),
      outputTokens: num(u.output_tokens),
    };
  }
  const u = p["usage"] ?? {};
  return { inputTokens: num(u.prompt_tokens), outputTokens: num(u.completion_tokens) };
}

/** Build the row for one call. Cost is null when the model has no rate or
 *  the provider bills in credits rather than dollars. */
export function usageRow(
  feature: string,
  provider: Provider,
  model: string,
  tokens: TokenCounts,
  ok = true,
): UsageRow {
  return {
    feature: feature || "unknown",
    provider,
    model,
    input_tokens: tokens.inputTokens,
    output_tokens: tokens.outputTokens,
    cost_usd: costUsd(model, tokens.inputTokens, tokens.outputTokens, provider),
    ok,
  };
}

/** Write the row. Swallows its own failures on purpose: usage accounting is
 *  never a reason for a lawyer's analysis to fail. */
export async function recordUsage(actor: UsageActor | undefined, row: UsageRow): Promise<void> {
  if (!actor) return;
  try {
    await actor.supabase.from("ai_usage_events").insert({
      ...row,
      user_id: actor.userId,
      workspace_id: actor.workspaceId ?? null,
    });
  } catch {
    /* usage is observability, not the job */
  }
}
