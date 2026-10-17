import { z } from "zod";
import type { NewsVisual, NewsVisualsResult } from "./news-visuals";
import { isPraxisNewsInScope } from "./briefing-scope";

const NEWS_VISUALS_TTL_MS = 5 * 60 * 1000;
const MAX_VISUALS = 3;
const GUARDIAN_API_URL = "https://content.guardianapis.com/search";
const GUARDIAN_ARTICLE_HOSTS = ["theguardian.com"];
const GUARDIAN_IMAGE_HOSTS = ["media.guim.co.uk", "i.guim.co.uk"];
export const GUARDIAN_EDITORIAL_QUERY =
  '(Dubai OR "United Arab Emirates" OR UAE OR Britain OR British OR "United Kingdom" OR UK OR Ghana OR Ghanaian OR GoldBod OR "Ghana Gold Board") AND (law OR legal OR court OR regulation OR legislation OR gold OR mining OR mineral)';

const guardianResponseSchema = z.object({
  response: z.object({
    status: z.literal("ok"),
    results: z.array(z.unknown()),
  }),
});

const guardianItemSchema = z.object({
  id: z.string().min(1),
  webTitle: z.string().min(1),
  webUrl: z.string(),
  webPublicationDate: z.string().datetime(),
  fields: z
    .object({
      headline: z.string().optional(),
      thumbnail: z.string().optional(),
    })
    .optional(),
});

export interface NewsVisualProvider {
  readonly id: string;
  readonly sourceName: string;
  fetchVisuals(): Promise<NewsVisual[]>;
}

type CacheEntry = {
  providerId: string;
  expiresAt: number;
  result: NewsVisualsResult;
};

let cache: CacheEntry | null = null;

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    }
    return named[lower] ?? match;
  });
}

/** Plain-text only; React also escapes the returned value at render time. */
export function sanitizeNewsText(value: string, maxLength = 180) {
  return decodeEntities(value)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .split("")
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function hostMatches(hostname: string, allowedDomains: string[]) {
  return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function safeHttpsUrl(value: string, allowedDomains: string[]) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !hostMatches(url.hostname.toLowerCase(), allowedDomains)
    )
      return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeGuardianVisuals(input: unknown): NewsVisual[] {
  const parsed = guardianResponseSchema.parse(input);
  const visuals: NewsVisual[] = [];
  for (const rawItem of parsed.response.results) {
    const parsedItem = guardianItemSchema.safeParse(rawItem);
    if (!parsedItem.success) continue;
    const item = parsedItem.data;
    const articleUrl = safeHttpsUrl(item.webUrl, GUARDIAN_ARTICLE_HOSTS);
    const imageUrl = item.fields?.thumbnail
      ? safeHttpsUrl(item.fields.thumbnail, GUARDIAN_IMAGE_HOSTS)
      : null;
    const headline = sanitizeNewsText(item.fields?.headline || item.webTitle);
    const id = sanitizeNewsText(item.id, 220);
    if (!articleUrl || !imageUrl || !headline || !id || !isPraxisNewsInScope({ title: headline }))
      continue;
    visuals.push({
      id,
      source: "The Guardian",
      headline,
      articleUrl,
      imageUrl,
      imageAlt: `${headline} — news image from The Guardian`,
      publishedAt: item.webPublicationDate,
    });
    if (visuals.length === MAX_VISUALS) break;
  }
  return visuals;
}

export class GuardianNewsVisualProvider implements NewsVisualProvider {
  readonly id = "guardian";
  readonly sourceName = "The Guardian";

  constructor(private readonly apiKey: string) {}

  async fetchVisuals() {
    const url = new URL(GUARDIAN_API_URL);
    url.searchParams.set("api-key", this.apiKey);
    url.searchParams.set("show-fields", "headline,thumbnail");
    url.searchParams.set("rights", "syndicatable");
    url.searchParams.set("order-by", "newest");
    url.searchParams.set("page-size", "15");
    url.searchParams.set("q", GUARDIAN_EDITORIAL_QUERY);

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error(`News visuals provider returned ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json"))
      throw new Error("News visuals provider returned an unsupported response.");
    return normalizeGuardianVisuals(await response.json());
  }
}

function result(
  status: NewsVisualsResult["status"],
  provider: string | null,
  items: NewsVisual[] = [],
  now = Date.now(),
): NewsVisualsResult {
  return { status, provider, items, fetchedAt: new Date(now).toISOString() };
}

export function resolveNewsVisualProvider(
  env: NodeJS.ProcessEnv = process.env,
): NewsVisualProvider | null {
  const selected = (env["NEWS_VISUALS_PROVIDER"] || "guardian").trim().toLowerCase();
  if (selected === "none" || selected === "disabled") return null;
  if (selected !== "guardian") return null;
  const key = env["GUARDIAN_API_KEY"]?.trim();
  const licensed = env["GUARDIAN_IMAGE_USAGE_LICENSED"]?.trim().toLowerCase() === "true";
  return key && licensed ? new GuardianNewsVisualProvider(key) : null;
}

/** Server-only fetch with a best-effort five-minute in-memory metadata cache. */
export async function fetchNewsVisuals(
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): Promise<NewsVisualsResult> {
  const selected = (env["NEWS_VISUALS_PROVIDER"] || "guardian").trim().toLowerCase();
  if (selected === "none" || selected === "disabled") return result("disabled", null, [], now);
  if (selected !== "guardian") return result("unconfigured", null, [], now);

  const provider = resolveNewsVisualProvider(env);
  if (!provider) return result("unconfigured", "The Guardian", [], now);
  if (cache?.providerId === provider.id && cache.expiresAt > now) return cache.result;

  try {
    const items = await provider.fetchVisuals();
    const value = result(items.length ? "ready" : "empty", provider.sourceName, items, now);
    cache = { providerId: provider.id, expiresAt: now + NEWS_VISUALS_TTL_MS, result: value };
    return value;
  } catch {
    return result("error", provider.sourceName, [], now);
  }
}
