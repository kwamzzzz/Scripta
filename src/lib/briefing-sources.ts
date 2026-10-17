import { isPraxisNewsInScope, type PraxisArticleCategory } from "./briefing-scope";

/**
 * Where the Daily Briefing actually comes from.
 *
 * Each source is fetched, parsed and classified independently, so one
 * publisher going down or changing its markup costs that publisher's items
 * and nothing else. What is connected and what failed is reported back with
 * the articles, because a briefing that quietly drops a regulator is worse
 * than one that says it could not reach it.
 *
 * Parsing is done with narrow regular expressions rather than a parser
 * dependency. That is a deliberate trade: these are four known documents, the
 * shapes are stable, and the alternative is shipping an XML parser to read
 * four feeds. Every parser here is pure and tested against a captured sample
 * of the real document.
 */

export type SourceKind = "rss" | "atom" | "goldbod";

export type BriefingSource = {
  id: string;
  /** Shown to the reader as the publisher of the item. */
  name: string;
  url: string;
  kind: SourceKind;
  /** The category items from this source belong to when the text alone does
   *  not say. A regulator publishes about itself. */
  category: PraxisArticleCategory;
  /** Where a reader goes to see everything this source has published. */
  home: string;
};

export type RawItem = {
  title: string;
  summary: string;
  url: string;
  published: string | null;
  image?: string | undefined;
};

/**
 * The sources currently connected. Ghana's mining regulator and gold board,
 * and the two bodies that publish new law for England and Wales.
 *
 * Not connected, and deliberately absent rather than faked: Dubai and UAE
 * legislation, and GhaLII, both of which refuse automated requests. The
 * category for them exists and the filter will simply hold nothing until a
 * lawful route to their content is arranged.
 */
export const BRIEFING_SOURCES: BriefingSource[] = [
  {
    id: "goldbod",
    name: "Ghana Gold Board",
    url: "https://goldbod.gov.gh/news",
    kind: "goldbod",
    category: "GoldBod & Mining",
    home: "https://goldbod.gov.gh/news",
  },
  {
    id: "mincom",
    name: "Minerals Commission of Ghana",
    url: "https://www.mincom.gov.gh/feed/",
    kind: "rss",
    category: "GoldBod & Mining",
    home: "https://www.mincom.gov.gh/",
  },
  {
    // The Commission's own WordPress feed answers but carries no items, so the
    // GOV.UK feed for the same body is used instead.
    id: "lawcom",
    name: "Law Commission of England and Wales",
    url: "https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=law-commission",
    kind: "atom",
    category: "UK Law",
    home: "https://www.gov.uk/government/organisations/law-commission",
  },
  {
    id: "legislation-uk",
    name: "legislation.gov.uk",
    url: "https://www.legislation.gov.uk/new/data.feed",
    kind: "atom",
    category: "UK Law",
    home: "https://www.legislation.gov.uk/new",
  },
];

const decodeEntities = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/**
 * Tags out, entities decoded, whitespace collapsed.
 *
 * CDATA is unwrapped before tags are stripped. It opens with "<![CDATA[",
 * which a tag-stripping pass reads as a tag and deletes along with everything
 * inside it — so a publisher who wraps their titles in CDATA, as WordPress
 * does, would otherwise come back blank.
 */
export function plainText(html: string): string {
  const unwrapped = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decodeEntities(unwrapped.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (block: string, name: string): string | null => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]!).trim() : null;
};

/** Trim a summary to something readable without cutting a word in half. */
export function shorten(text: string, max = 220): string {
  const clean = plainText(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : max).trimEnd()}…`;
}

export function parseRss(xml: string): RawItem[] {
  const items: RawItem[] = [];
  for (const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const block = m[1]!;
    const title = tag(block, "title");
    const link = tag(block, "link");
    if (!title || !link) continue;
    const description = tag(block, "description") ?? tag(block, "content:encoded") ?? "";
    const published = tag(block, "pubDate") ?? tag(block, "dc:date");
    const image = block.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i)?.[1];
    items.push({
      title: plainText(title),
      summary: shorten(description),
      url: link.trim(),
      published,
      ...(image ? { image } : {}),
    });
  }
  return items;
}

export function parseAtom(xml: string): RawItem[] {
  const items: RawItem[] = [];
  for (const m of xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)) {
    const block = m[1]!;
    const title = tag(block, "title");
    // Atom puts the address in an attribute, and may list several; the
    // alternate link is the human-readable page.
    // Prefer the page a person can read. legislation.gov.uk lists the PDF as
    // rel="alternate" and the HTML page with no rel at all, so preferring
    // "alternate" would hand every reader a download instead of a page.
    const links = [...block.matchAll(/<link\b[^>]*>/gi)].map((l) => l[0]);
    const readable = links.filter((l) => {
      if (/rel=["']?self/i.test(l)) return false;
      const type = l.match(/type=["']([^"']+)["']/i)?.[1];
      return !type || /html/i.test(type);
    });
    const href = (readable[0] ?? links.find((l) => !/rel=["']?self/i.test(l)))?.match(
      /href=["']([^"']+)["']/i,
    )?.[1];
    if (!title || !href) continue;
    items.push({
      title: plainText(title),
      summary: shorten(tag(block, "summary") ?? tag(block, "content") ?? ""),
      url: href.trim(),
      published: tag(block, "updated") ?? tag(block, "published"),
    });
  }
  return items;
}

/**
 * The Ghana Gold Board publishes no feed, so its news index is read directly.
 * Its cards carry the title in the anchor and the picture beside it, which is
 * enough; anything more fragile than that is not worth depending on.
 */
export function parseGoldBod(html: string): RawItem[] {
  const items: RawItem[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(
    /<a\s+href="([^"]+\/news\/[^"]+)"[^>]*class="[^"]*news-card-title-link[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const url = m[1]!.trim();
    const title = plainText(m[2]!);
    if (!title || seen.has(url)) continue;
    seen.add(url);
    const slug = url.split("/news/")[1] ?? "";
    const image = html.match(
      new RegExp(
        `${slug.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}[\\s\\S]{0,400}?<img[^>]+src="([^"]+)"`,
        "i",
      ),
    )?.[1];
    items.push({
      title,
      summary: "",
      url,
      published: null,
      ...(image ? { image } : {}),
    });
  }
  return items;
}

export const PARSERS: Record<SourceKind, (raw: string) => RawItem[]> = {
  rss: parseRss,
  atom: parseAtom,
  goldbod: parseGoldBod,
};

/** Roughly how long an item takes to read, from what we actually have. */
export const readingMinutes = (item: RawItem): number =>
  Math.max(1, Math.min(20, Math.round((item.title.length + item.summary.length) / 900) || 1));

/**
 * Which category an item belongs to. The source's own category is the
 * fallback, but an item that plainly speaks about somewhere else is filed
 * where it belongs — Ghana's mining regulator writing about UK sanctions is
 * UK news that happens to have a Ghanaian publisher.
 */
export function categorise(item: RawItem, source: BriefingSource): PraxisArticleCategory {
  const content = { title: item.title, summary: item.summary, source: source.name };
  // A source's own subject wins whenever the item is about it. Without this a
  // Gold Board notice mentioning Ghana is filed under Ghana Law, because
  // "Ghana" matches — and the mining filter, the one a mining lawyer opens,
  // sits empty while its own regulator's notices are somewhere else.
  if (isPraxisNewsInScope(content, source.category)) return source.category;
  const specific: PraxisArticleCategory[] = [
    "GoldBod & Mining",
    "Dubai & UAE Law",
    "UK Law",
    "Ghana Law",
  ];
  for (const category of specific) {
    if (category !== source.category && isPraxisNewsInScope(content, category)) return category;
  }
  return source.category;
}
