import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRIEFING_SOURCES,
  categorise,
  parseAtom,
  parseGoldBod,
  parseRss,
  plainText,
  readingMinutes,
  shorten,
  type BriefingSource,
} from "./briefing-sources";

/** Real documents, captured from the publishers, not written by hand. A
 *  parser tested against invented XML only proves the invention parses. */
const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");

const source = (over: Partial<BriefingSource> = {}): BriefingSource => ({
  id: "test",
  name: "Test source",
  url: "https://example.com/feed",
  kind: "rss",
  category: "Ghana Law",
  home: "https://example.com",
  ...over,
});

describe("reading a real RSS feed", () => {
  const items = parseRss(fixture("mincom.rss.txt"));

  it("finds the published items with their own titles and links", () => {
    expect(items.length).toBeGreaterThan(0);
    const first = items[0]!;
    expect(first.title.length).toBeGreaterThan(10);
    expect(first.url).toMatch(/^https:\/\/www\.mincom\.gov\.gh\//);
    // A real pubDate, kept as the publisher wrote it.
    expect(first.published).toBeTruthy();
    expect(Number.isNaN(Date.parse(first.published!))).toBe(false);
  });

  it("returns readable text rather than markup or entities", () => {
    for (const item of items) {
      expect(item.title).not.toMatch(/<[a-z]/i);
      expect(item.title).not.toMatch(/&(amp|lt|gt|#\d+);/);
      expect(item.summary).not.toMatch(/<[a-z]/i);
    }
  });
});

describe("reading a real Atom feed", () => {
  const items = parseAtom(fixture("legislation.atom.txt"));

  it("finds the entries", () => {
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.title.length).toBeGreaterThan(10);
  });

  it("links to the page a person can read, not the PDF", () => {
    // legislation.gov.uk lists the PDF as rel="alternate" and the readable
    // page with no rel at all. Preferring "alternate" would hand every reader
    // a download instead of a page.
    for (const item of items) {
      expect(item.url).not.toMatch(/\.pdf$/i);
      expect(item.url).not.toMatch(/data\.xml$/i);
    }
  });
});

describe("reading the Ghana Gold Board news page", () => {
  const items = parseGoldBod(fixture("goldbod.html.txt"));

  it("finds the articles, since the board publishes no feed", () => {
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.url).toMatch(/goldbod\.gov\.gh\/news\//);
    expect(items[0]!.title.length).toBeGreaterThan(10);
  });

  it("never lists the same article twice", () => {
    const urls = items.map((i) => i.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("admits it has no publication date rather than inventing one", () => {
    // The index does not carry dates. A guessed date on a legal development
    // is worse than none.
    for (const item of items) expect(item.published).toBeNull();
  });
});

describe("text handling", () => {
  it("strips markup and decodes what publishers actually send", () => {
    expect(plainText("<p>Ghana&#8217;s <b>gold</b> sector</p>")).toBe("Ghana’s gold sector");
    expect(plainText("<![CDATA[Fees &amp; levies]]>")).toBe("Fees & levies");
  });

  it("shortens on a word boundary and marks the cut", () => {
    const long = `${"word ".repeat(80)}end`;
    const out = shorten(long, 60);
    expect(out.length).toBeLessThanOrEqual(62);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });

  it("leaves a short summary alone", () => {
    expect(shorten("A short note.", 60)).toBe("A short note.");
  });

  it("always claims at least a minute", () => {
    expect(readingMinutes({ title: "Hi", summary: "", url: "u", published: null })).toBe(1);
  });
});

describe("filing an item under the right heading", () => {
  it("keeps a source's own subject by default", () => {
    const item = { title: "Board appoints new directors", summary: "", url: "u", published: null };
    expect(categorise(item, source({ category: "GoldBod & Mining" }))).toBe("GoldBod & Mining");
  });

  it("files an item where it belongs, not where it was published", () => {
    // Ghana's mining regulator writing about UK sanctions is UK news that
    // happens to have a Ghanaian publisher.
    const item = {
      title: "United Kingdom sanctions regime updated for gold exporters",
      summary: "",
      url: "u",
      published: null,
    };
    expect(categorise(item, source({ category: "Ghana Law" }))).toBe("UK Law");
  });
});

describe("the source list", () => {
  it("names every source and points somewhere a reader can go", () => {
    expect(BRIEFING_SOURCES.length).toBeGreaterThan(0);
    for (const s of BRIEFING_SOURCES) {
      expect(s.name.trim().length).toBeGreaterThan(0);
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.home).toMatch(/^https:\/\//);
    }
  });

  it("has no duplicate ids, since an id keys the status report", () => {
    const ids = BRIEFING_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
