import { describe, expect, it } from "vitest";
import type { BriefingArticle } from "./daily-briefing";
import {
  daysLeft,
  isSaved,
  pruneSaved,
  readSaved,
  RETENTION_DAYS,
  retentionLabel,
  toggleSaved,
  type SavedArticle,
} from "./saved-briefing";

const NOW = new Date("2026-09-20T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

const article = (id: string): BriefingArticle => ({
  id,
  title: `Notice ${id}`,
  summary: "A licensing notice.",
  category: "GoldBod & Mining",
  source: "Ghana Gold Board",
  readingMinutes: 3,
  url: `https://goldbod.gov.gh/news/${id}`,
});

const saved = (id: string, ageDays: number): SavedArticle => ({
  ...article(id),
  savedAt: daysAgo(ageDays),
});

describe("saving a briefing item", () => {
  it("keeps the whole article, not a pointer to it", () => {
    // The briefing only shows what publishers have out now, so an id alone
    // would be a reference to something gone within days.
    const [item] = toggleSaved([], article("a"), NOW);
    expect(item!.title).toBe("Notice a");
    expect(item!.summary).toBe("A licensing notice.");
    expect(item!.source).toBe("Ghana Gold Board");
    expect(item!.url).toBe("https://goldbod.gov.gh/news/a");
    expect(item!.savedAt).toBe(NOW.toISOString());
  });

  it("saves newest first, and unsaves on a second press", () => {
    const one = toggleSaved([], article("a"), NOW);
    const two = toggleSaved(one, article("b"), NOW);
    expect(two.map((s) => s.id)).toEqual(["b", "a"]);
    expect(isSaved(two, "a")).toBe(true);
    expect(toggleSaved(two, article("a"), NOW).map((s) => s.id)).toEqual(["b"]);
    expect(isSaved(toggleSaved(two, article("a"), NOW), "a")).toBe(false);
  });
});

describe("the fifteen day retention", () => {
  it("keeps an item up to its fifteenth day and drops it after", () => {
    const list = [saved("fresh", 0), saved("middle", 7), saved("edge", 14), saved("stale", 16)];
    expect(pruneSaved(list, NOW).map((s) => s.id)).toEqual(["fresh", "middle", "edge"]);
  });

  it("counts down from when it was saved, not when it was published", () => {
    // A three-year-old statute saved today is still fresh to the reader.
    expect(daysLeft(saved("a", 0), NOW)).toBe(RETENTION_DAYS);
    expect(daysLeft(saved("b", 14), NOW)).toBe(1);
    expect(daysLeft(saved("c", 15), NOW)).toBe(0);
    expect(daysLeft(saved("d", 40), NOW)).toBe(0);
  });

  it("says how long is left in words a reader can act on", () => {
    expect(retentionLabel(saved("a", 0), NOW)).toBe(`Kept ${RETENTION_DAYS} more days`);
    expect(retentionLabel(saved("b", 14), NOW)).toBe("Kept 1 more day");
    expect(retentionLabel(saved("c", 15), NOW)).toBe("Dropping today");
  });
});

describe("reading what was stored", () => {
  it("discards the old id-only format rather than showing empty rows", () => {
    // Earlier versions saved a bare list of ids. The article they pointed at
    // was never recorded, so there is nothing to show.
    expect(readSaved(["some-id", "another-id"], NOW)).toEqual([]);
  });

  it("prunes on read, so nothing expired is ever displayed", () => {
    const stored = [saved("fresh", 1), saved("stale", 20)];
    expect(readSaved(stored, NOW).map((s) => s.id)).toEqual(["fresh"]);
  });

  it("starts empty rather than throwing on anything unreadable", () => {
    expect(readSaved(null, NOW)).toEqual([]);
    expect(readSaved("not a list", NOW)).toEqual([]);
    expect(readSaved([{ id: "x" }, null, 42], NOW)).toEqual([]);
    expect(readSaved([{ ...article("x"), savedAt: "not a date" }], NOW)).toEqual([]);
  });
});
