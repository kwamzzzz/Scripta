import { describe, expect, it } from "vitest";
import {
  createDemoDailyBriefing,
  fetchDailyBriefing,
  parseDailyBriefingProviderResponse,
} from "./daily-briefing";
import { isPraxisNewsInScope } from "./briefing-scope";

describe("Daily Briefing provider boundary", () => {
  it("prefers a configured provider over reading the sources directly", async () => {
    // An explicit endpoint still wins, for anyone who later puts a curated
    // service in front of this. Without one the briefing now reads the
    // regulators itself, which is a network call and not a unit test's job.
    const payload = {
      generatedAt: "2026-09-07T05:00:00.000Z",
      viewAllUrl: "https://example.com/news",
      articles: [
        {
          id: "from-provider",
          title: "Ghana Gold Board issues a licensing notice",
          summary: "GoldBod guidance for Ghana's regulated gold market.",
          category: "GoldBod & Mining",
          source: "Ghana Gold Board",
          readingMinutes: 3,
          url: "https://example.com/news/from-provider",
        },
      ],
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    try {
      const briefing = await fetchDailyBriefing({ endpoint: "https://example.com/briefing" });
      expect(briefing.isDemo).toBe(false);
      expect(briefing.articles.map((a) => a.id)).toEqual(["from-provider"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps the demo edition available, and labelled as such", () => {
    // It is no longer the default, but it is still what a reader sees if the
    // real sources are ever swapped out, and it must never pass for real.
    const demo = createDemoDailyBriefing();
    expect(demo.isDemo).toBe(true);
    expect(demo.articles.length).toBeGreaterThan(3);
    expect(demo.articles.every((a) => isPraxisNewsInScope(a, a.category))).toBe(true);
  });

  it("creates a deterministic demo timestamp for rendering and tests", () => {
    const now = new Date("2026-09-07T05:00:00.000Z");
    expect(createDemoDailyBriefing(now).generatedAt).toBe(now.toISOString());
  });

  it("validates live provider data and does not mark it as demo", () => {
    const result = parseDailyBriefingProviderResponse({
      generatedAt: "2026-09-07T05:00:00.000Z",
      viewAllUrl: "https://example.com/news",
      articles: [
        {
          id: "article-1",
          title: "UK Law Commission publishes a reform update",
          summary: "A short provider-supplied summary for England and Wales.",
          category: "UK Law",
          source: "Law Commission",
          readingMinutes: 3,
          url: "https://example.com/news/article-1",
          lead: true,
        },
      ],
    });
    expect(result.isDemo).toBe(false);
    expect(result.articles[0]?.title).toBe("UK Law Commission publishes a reform update");
  });

  it("drops provider stories outside the configured jurisdiction and sector beats", () => {
    const result = parseDailyBriefingProviderResponse({
      generatedAt: "2026-09-07T05:00:00.000Z",
      viewAllUrl: "https://example.com/news",
      articles: [
        {
          id: "in-scope",
          title: "Ghana Gold Board issues a licensing notice",
          summary: "GoldBod guidance for Ghana's regulated gold market.",
          category: "GoldBod & Mining",
          source: "Ghana Gold Board",
          readingMinutes: 3,
          url: "https://example.com/news/in-scope",
        },
        {
          id: "out-of-scope",
          title: "European competition authority publishes annual report",
          summary: "A general update from outside the selected jurisdictions.",
          category: "UK Law",
          source: "Example source",
          readingMinutes: 3,
          url: "https://example.com/news/out-of-scope",
        },
      ],
    });

    expect(result.articles.map((article) => article.id)).toEqual(["in-scope"]);
  });

  it("rejects malformed provider payloads", () => {
    expect(() => parseDailyBriefingProviderResponse({ articles: [] })).toThrow();
  });
});
