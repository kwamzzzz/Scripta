/**
 * Structured (tool-calling) AI calls. Server-only — never import from client code.
 *
 * Every call returns JSON matching the tool schema. Prose parsing is never
 * used: a regex over model prose fails on real documents.
 *
 * Provider selection, in order:
 *   1. GEMINI_API_KEY     → Gemini Flash via the Google AI API (recommended:
 *                            cheapest by a wide margin for clause-level work,
 *                            structured output via forced function calling,
 *                            runs locally as well as in Lovable's runtime)
 *   2. ANTHROPIC_API_KEY  → Claude via the Anthropic Messages API
 *   3. LOVABLE_API_KEY    → the Lovable AI gateway (Lovable's own runtime only)
 * Set AI_PROVIDER=gemini|anthropic|lovable to force one when several keys exist.
 */

import { extractTokens, recordUsage, usageRow, type UsageActor } from "./ai-usage.server";

const LOVABLE_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Lovable gateway model. */
export const ANALYSIS_MODEL = "google/gemini-3.7-flash";
/** Claude model. Sonnet 5 balances quality and cost for clause-level work;
 *  set ANTHROPIC_MODEL=claude-opus-5 for the heaviest analysis. */
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5";
/** Gemini model. Flash is the cost choice; override with GEMINI_MODEL. */
export const GEMINI_DEFAULT_MODEL = "gemini-3.7-flash";
const MAX_TOKENS = 8192;

export type Provider = "gemini" | "anthropic" | "lovable";

export class GatewayError extends Error {
  status: number;
  retryable: boolean;
  constructor(status: number, message: string, retryable: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

/** Plain, lawyer-facing wording for the statuses a provider can return. */
export function describe(
  status: number,
  body: string,
  provider: Provider,
): { message: string; retryable: boolean } {
  let upstream = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    upstream = parsed.error?.message ?? parsed.message ?? "";
  } catch {
    upstream = body.slice(0, 200);
  }
  if (status === 429)
    return {
      message:
        "The AI service is rate limited right now. Wait a moment and run the remaining items again.",
      retryable: true,
    };
  if (status === 402)
    return {
      message:
        upstream ||
        (provider === "lovable"
          ? "AI credits are exhausted for this workspace. Top up credits in Lovable, then run the remaining items again."
          : "The AI account has no remaining credit. Add credit to the Anthropic account, then run the remaining items again."),
      retryable: false,
    };
  if (status === 403)
    return {
      message:
        upstream ||
        (provider === "gemini"
          ? "The Google AI key was rejected or lacks access. Check GEMINI_API_KEY."
          : "AI access is blocked by a workspace policy."),
      retryable: false,
    };
  if (status === 404 && provider === "gemini")
    return {
      message: upstream || "That Gemini model was not found. Check GEMINI_MODEL.",
      retryable: false,
    };
  if (status === 401)
    return {
      message:
        provider === "anthropic"
          ? "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY."
          : provider === "gemini"
            ? "The Google AI key was rejected. Check GEMINI_API_KEY."
            : "The AI service is not configured for this project.",
      retryable: false,
    };
  if (status >= 500)
    return {
      message: "The AI service is temporarily unavailable. Try the remaining items again.",
      retryable: true,
    };
  return {
    message: upstream || `The AI service rejected the request (${status}).`,
    retryable: false,
  };
}

export type JsonSchema = Record<string, unknown>;

export type StructuredCall = {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  parameters: JsonSchema;
  signal?: AbortSignal | undefined;
  /** Which part of the app is spending. Recorded against every call so the
   *  usage pill can say where the money went, not just how much. */
  feature: string;
  /** Supplies the request-scoped Supabase client. Omit and nothing is
   *  recorded; the call still runs. */
  actor?: UsageActor | undefined;
};

export function resolveProvider(
  env: NodeJS.ProcessEnv = process.env,
): { provider: Provider; key: string } | null {
  const forced = env["AI_PROVIDER"];
  const gemini = env["GEMINI_API_KEY"];
  const anthropic = env["ANTHROPIC_API_KEY"];
  const lovable = env["LOVABLE_API_KEY"];
  if (forced === "gemini" && gemini) return { provider: "gemini", key: gemini };
  if (forced === "anthropic" && anthropic) return { provider: "anthropic", key: anthropic };
  if (forced === "lovable" && lovable) return { provider: "lovable", key: lovable };
  if (gemini) return { provider: "gemini", key: gemini };
  if (anthropic) return { provider: "anthropic", key: anthropic };
  if (lovable) return { provider: "lovable", key: lovable };
  return null;
}

/** Which provider is active — surfaced in the UI so a lawyer knows what produced an analysis. */
export function activeProviderLabel(env: NodeJS.ProcessEnv = process.env): string | null {
  const r = resolveProvider(env);
  if (!r) return null;
  if (r.provider === "gemini") return `Gemini (${env["GEMINI_MODEL"] || GEMINI_DEFAULT_MODEL})`;
  if (r.provider === "anthropic")
    return `Claude (${env["ANTHROPIC_MODEL"] || ANTHROPIC_DEFAULT_MODEL})`;
  return `Lovable AI (${ANALYSIS_MODEL})`;
}

/* ------------------------------------------------------------------ */
/* Anthropic                                                           */
/* ------------------------------------------------------------------ */

/** Pure: the Messages API request for a forced tool call. */
export function anthropicRequest(opts: StructuredCall, model: string) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: opts.system,
    messages: [{ role: "user" as const, content: opts.user }],
    tools: [
      { name: opts.toolName, description: opts.toolDescription, input_schema: opts.parameters },
    ],
    tool_choice: { type: "tool" as const, name: opts.toolName },
  };
}

/** Pure: pull the tool's structured input out of a Messages API response. */
export function anthropicResult<T>(payload: unknown, toolName: string): T {
  const content =
    (payload as { content?: { type?: string; name?: string; input?: unknown }[] })?.content ?? [];
  const block = content.find((b) => b.type === "tool_use" && (!b.name || b.name === toolName));
  if (!block || block.input === undefined)
    throw new GatewayError(502, "The AI service returned no structured result.", true);
  return block.input as T;
}

async function callAnthropic<T>(
  opts: StructuredCall,
  key: string,
): Promise<{ result: T; model: string; payload: unknown }> {
  const model = process.env["ANTHROPIC_MODEL"] || ANTHROPIC_DEFAULT_MODEL;
  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    ...(opts.signal ? { signal: opts.signal } : {}),
    body: JSON.stringify(anthropicRequest(opts, model)),
  });
  if (!res.ok) {
    const body = await res.text();
    const { message, retryable } = describe(res.status, body, "anthropic");
    throw new GatewayError(res.status, message, retryable);
  }
  const payload = await res.json();
  return { result: anthropicResult<T>(payload, opts.toolName), model, payload };
}

/* ------------------------------------------------------------------ */
/* Google Gemini                                                       */
/* ------------------------------------------------------------------ */

/** Pure: a generateContent request that forces the named function. */
/** Keys Gemini accepts in a function declaration's schema. It takes a subset
 *  of OpenAPI and rejects the whole request on any key it does not know,
 *  including `additionalProperties`, which Anthropic and the Lovable gateway
 *  both want. An allowlist rather than a blocklist, so a schema key added
 *  later cannot silently break every Gemini call. */
const GEMINI_SCHEMA_KEYS = new Set([
  "type",
  "format",
  "title",
  "description",
  "nullable",
  "enum",
  "items",
  "properties",
  "required",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "pattern",
  "example",
  "default",
  "anyOf",
  "propertyOrdering",
]);

/** Pure: the same schema with everything Gemini would reject removed. */
export function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (!GEMINI_SCHEMA_KEYS.has(key)) continue;
    // JSON Schema says "string or null" as `type: ["string", "null"]`; Gemini
    // takes one type and rejects the whole request over a list ("Proto field
    // is not repeating"). It says the same thing as `nullable: true`.
    if (key === "type" && Array.isArray(value)) {
      const types = value.filter((t) => t !== "null");
      out["type"] = types[0] ?? "string";
      if (types.length !== value.length) out["nullable"] = true;
      continue;
    }
    // An allowed value of null is what `nullable` already says.
    if (key === "enum" && Array.isArray(value)) {
      out["enum"] = value.filter((v) => v !== null);
      continue;
    }
    if (key === "properties" && value && typeof value === "object") {
      const props: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(value as Record<string, unknown>))
        props[name] = geminiSchema(sub);
      out[key] = props;
    } else if (key === "items" || key === "anyOf") {
      out[key] = geminiSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function geminiRequest(opts: StructuredCall) {
  return {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user" as const, parts: [{ text: opts.user }] }],
    tools: [
      {
        functionDeclarations: [
          {
            name: opts.toolName,
            description: opts.toolDescription,
            parameters: geminiSchema(opts.parameters),
          },
        ],
      },
    ],
    toolConfig: {
      functionCallingConfig: { mode: "ANY" as const, allowedFunctionNames: [opts.toolName] },
    },
    generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.2 },
  };
}

/** Pure: pull the function call's args out of a generateContent response. */
export function geminiResult<T>(payload: unknown, toolName: string): T {
  const parts =
    (
      payload as {
        candidates?: {
          content?: { parts?: { functionCall?: { name?: string; args?: unknown } }[] };
        }[];
      }
    )?.candidates?.[0]?.content?.parts ?? [];
  const call = parts.find(
    (p) => p.functionCall && (!p.functionCall.name || p.functionCall.name === toolName),
  )?.functionCall;
  if (!call || call.args === undefined)
    throw new GatewayError(502, "The AI service returned no structured result.", true);
  return call.args as T;
}

async function callGemini<T>(
  opts: StructuredCall,
  key: string,
): Promise<{ result: T; model: string; payload: unknown }> {
  const model = process.env["GEMINI_MODEL"] || GEMINI_DEFAULT_MODEL;
  const res = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    ...(opts.signal ? { signal: opts.signal } : {}),
    body: JSON.stringify(geminiRequest(opts)),
  });
  if (!res.ok) {
    const body = await res.text();
    const { message, retryable } = describe(res.status, body, "gemini");
    throw new GatewayError(res.status, message, retryable);
  }
  const payload = await res.json();
  return { result: geminiResult<T>(payload, opts.toolName), model, payload };
}

/* ------------------------------------------------------------------ */
/* Lovable gateway                                                     */
/* ------------------------------------------------------------------ */

async function callLovable<T>(
  opts: StructuredCall,
  key: string,
): Promise<{ result: T; model: string; payload: unknown }> {
  const res = await fetch(LOVABLE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    ...(opts.signal ? { signal: opts.signal } : {}),
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: opts.toolName,
            description: opts.toolDescription,
            parameters: opts.parameters,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: opts.toolName } },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    const { message, retryable } = describe(res.status, body, "lovable");
    throw new GatewayError(res.status, message, retryable);
  }
  const payload = (await res.json()) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
  };
  const args = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new GatewayError(502, "The AI service returned no structured result.", true);
  try {
    return { result: JSON.parse(args) as T, model: ANALYSIS_MODEL, payload };
  } catch {
    throw new GatewayError(502, "The AI service returned a malformed result.", true);
  }
}

/* ------------------------------------------------------------------ */

/**
 * The administrators' pause switch for AI ("All AI" in the admin portal).
 * Checked here, where every call passes, so no screen can go around it.
 * Administrators, and anyone given early access, are not paused.
 */
export async function assertAiAllowed(actor: UsageActor | undefined) {
  if (!actor) return;
  const { data: flag } = await actor.supabase
    .from("feature_flags")
    .select("enabled, preview_users")
    .eq("key", "ai")
    .maybeSingle();
  if (!flag || flag.enabled) return;
  if ((flag.preview_users ?? []).includes(actor.userId)) return;
  const { data: admin } = await actor.supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", actor.userId)
    .maybeSingle();
  if (admin) return;
  throw new GatewayError(
    403,
    "AI is paused by your administrator for the moment. Everything else keeps working.",
    false,
  );
}

export async function callStructured<T>(opts: StructuredCall): Promise<T> {
  await assertAiAllowed(opts.actor);
  const r = resolveProvider();
  if (!r)
    throw new GatewayError(
      401,
      "No AI provider is configured. Set GEMINI_API_KEY (recommended) or ANTHROPIC_API_KEY, or run inside Lovable.",
      false,
    );
  const call =
    r.provider === "gemini"
      ? callGemini<T>(opts, r.key)
      : r.provider === "anthropic"
        ? callAnthropic<T>(opts, r.key)
        : callLovable<T>(opts, r.key);
  const { result, model, payload } = await call;
  await recordUsage(
    opts.actor,
    usageRow(opts.feature, r.provider, model, extractTokens(r.provider, payload)),
  );
  return result;
}
