import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BRIEFING_SOURCES,
  categorise,
  PARSERS,
  readingMinutes,
  shorten,
  type BriefingSource,
  type RawItem,
} from "@/lib/briefing-sources";
import type { BriefingArticle, DailyBriefingData, SourceStatus } from "@/lib/daily-briefing";

/**
 * Fetching the Daily Briefing.
 *
 * This runs on the server for two reasons: a browser cannot read another
 * origin's feed, and these are public bodies who should see one polite
 * request per refresh rather than one per reader.
 *
 * Every source is fetched independently and a failure is contained. A
 * regulator that is down, slow, or has changed its markup costs its own items
 * and nothing else, and it is reported by name rather than quietly omitted —
 * a briefing that silently drops a source is worse than one that admits it
 * could not reach it, because the reader cannot tell the difference between
 * "nothing happened" and "we did not look".
 */

const TIMEOUT_MS = 8000;
const PER_SOURCE_MAX = 8;
const TOTAL_MAX = 24;

/** Kept between requests so a reader refreshing the dashboard does not send
 *  four more requests to four public bodies. */
let cache: { at: number; data: DailyBriefingData } | null = null;
const CACHE_MS = 15 * 60 * 1000;

async function fetchSource(
  source: BriefingSource,
): Promise<{ status: SourceStatus; items: RawItem[] }> {
  const started = Date.now();
  try {
    const response = await fetch(source.url, {
      headers: {
        // Named honestly. A public body is entitled to know who is asking.
        "User-Agent": "Scripta Daily Briefing (legal research workspace)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/html;q=0.8",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        status: {
          id: source.id,
          name: source.name,
          ok: false,
          count: 0,
          note: `HTTP ${response.status}`,
        },
        items: [],
      };
    }
    const items = PARSERS[source.kind](await response.text()).slice(0, PER_SOURCE_MAX);
    return {
      status: {
        id: source.id,
        name: source.name,
        ok: true,
        count: items.length,
        ...(items.length ? {} : { note: "Reached, but nothing published" }),
      },
      items,
    };
  } catch (error) {
    const note =
      error instanceof Error && error.name === "TimeoutError"
        ? `No answer in ${Math.round((Date.now() - started) / 1000)}s`
        : error instanceof Error
          ? error.message
          : "Could not be reached";
    return { status: { id: source.id, name: source.name, ok: false, count: 0, note }, items: [] };
  }
}

const toArticle = (item: RawItem, source: BriefingSource): BriefingArticle => ({
  id: `${source.id}:${item.url}`,
  title: item.title,
  summary: item.summary || `Published by ${source.name}.`,
  category: categorise(item, source),
  source: source.name,
  readingMinutes: readingMinutes(item),
  url: item.url,
  ...(item.published ? { published: item.published } : {}),
  ...(item.image ? { image: item.image } : {}),
});

/** Newest first. An item with no date sorts after dated ones rather than
 *  being given a date it does not have. */
const byNewest = (a: BriefingArticle, b: BriefingArticle) => {
  const at = a.published ? Date.parse(a.published) : NaN;
  const bt = b.published ? Date.parse(b.published) : NaN;
  if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
  if (Number.isNaN(at)) return 1;
  if (Number.isNaN(bt)) return -1;
  return bt - at;
};

export async function collectBriefing(): Promise<DailyBriefingData> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const results = await Promise.all(BRIEFING_SOURCES.map(fetchSource));

  // Newest first within each source, then one from each in turn.
  //
  // Straight newest-first does not work here. legislation.gov.uk publishes
  // dozens of statutory instruments a day, so it would fill the whole
  // briefing and a Ghana mining practice would never see its own regulator.
  // Taking turns means every source that published gets read.
  const perSource: BriefingArticle[][] = results.map(({ items }, i) => {
    const source = BRIEFING_SOURCES[i]!;
    return items.map((item) => toArticle(item, source)).sort(byNewest);
  });

  const articles: BriefingArticle[] = [];
  const seen = new Set<string>();
  const deepest = Math.max(0, ...perSource.map((s) => s.length));
  for (let rank = 0; rank < deepest && articles.length < TOTAL_MAX; rank++) {
    for (const source of perSource) {
      const article = source[rank];
      if (!article || articles.length >= TOTAL_MAX) continue;
      const key = article.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      articles.push(article);
    }
  }

  const top = articles;
  // The lead is the newest thing across every source, not an editorial
  // judgement the app is in no position to make.
  const newest = [...top].sort(byNewest)[0];
  if (newest) {
    const at = top.indexOf(newest);
    top[at] = { ...newest, lead: true };
  }

  const data: DailyBriefingData = {
    generatedAt: new Date().toISOString(),
    viewAllUrl: "https://goldbod.gov.gh/news",
    isDemo: false,
    articles: top,
    sources: results.map((r) => r.status),
  };
  cache = { at: Date.now(), data };
  return data;
}

/**
 * Both of these are behind sign-in, and the POST is the reason.
 *
 * The briefing carries no client data, so leaving it open looked harmless.
 * But `refreshDailyBriefing` clears a process-wide cache and sends a fresh
 * request to four public bodies, and an unauthenticated caller could hold it
 * down — turning our own endpoint into a way to hammer a regulator from our
 * address. The cache exists so those bodies see one polite request per
 * refresh; an open endpoint that empties it defeats the only thing protecting
 * them.
 *
 * Every caller already runs inside the signed-in app, so this costs nothing.
 */
export const loadDailyBriefing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return collectBriefing();
  });

/** Drop the cache so a reader asking for fresh news gets it. */
export const refreshDailyBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    cache = null;
    return collectBriefing();
  });

export function summarise(text: string, max?: number) {
  return shorten(text, max);
}
