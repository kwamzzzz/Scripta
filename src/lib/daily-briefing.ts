import { z } from "zod";
import {
  isPraxisNewsInScope,
  PRAXIS_BRIEFING_CATEGORIES,
  type PraxisArticleCategory,
  type PraxisBriefingCategory,
} from "./briefing-scope";

export const BRIEFING_CATEGORIES = PRAXIS_BRIEFING_CATEGORIES;

export type BriefingCategory = PraxisBriefingCategory;
export type ArticleCategory = PraxisArticleCategory;

export type BriefingArticle = {
  id: string;
  title: string;
  summary: string;
  category: ArticleCategory;
  source: string;
  readingMinutes: number;
  url: string;
  lead?: boolean | undefined;
  /** When the publisher says it was published. Absent when they do not say —
   *  never guessed, because a wrong date on a legal development is worse than
   *  no date. */
  published?: string | undefined;
  image?: string | undefined;
};

/** How one source fared on the last fetch, so the reader can tell the
 *  difference between "nothing happened" and "we could not look". */
export type SourceStatus = {
  id: string;
  name: string;
  ok: boolean;
  count: number;
  note?: string | undefined;
};

export type DailyBriefingData = {
  generatedAt: string;
  viewAllUrl: string;
  isDemo: boolean;
  articles: BriefingArticle[];
  /** Present when the briefing was gathered from real sources. */
  sources?: SourceStatus[] | undefined;
};

const articleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  category: z.enum(["Dubai & UAE Law", "UK Law", "Ghana Law", "GoldBod & Mining"]),
  source: z.string().min(1),
  readingMinutes: z.number().int().positive().max(120),
  url: z.string().url(),
  lead: z.boolean().optional(),
});

const providerResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  viewAllUrl: z.string().url(),
  articles: z.array(articleSchema),
});

const DEMO_ARTICLES: BriefingArticle[] = [
  {
    id: "demo-goldbod-xrf",
    title: "GoldBod makes XRF testing mandatory for determining gold purity",
    summary:
      "The Ghana Gold Board's latest compliance notice focuses on the required method for assessing purity in regulated gold transactions.",
    category: "GoldBod & Mining",
    source: "Ghana Gold Board",
    readingMinutes: 4,
    url: "https://goldbod.sfo3.digitaloceanspaces.com/press-releases/6m0bE9hALZaDAr1XnEmRaCZIfWxRzlHSOaaubioa.pdf",
    lead: true,
  },
  {
    id: "demo-ghana-mining-oversight",
    title: "Ghana mining oversight: leases, local participation and regulatory certainty",
    summary:
      "Review the Minerals Commission's latest notices on mining leases, local content, responsible operations and investor obligations.",
    category: "GoldBod & Mining",
    source: "Minerals Commission of Ghana",
    readingMinutes: 5,
    url: "https://www.mincom.gov.gh/news-and-events/",
  },
  {
    id: "demo-dubai-legal-affairs",
    title: "Dubai Legal Affairs reports on government contracts and dispute resolution",
    summary:
      "The department's current releases cover Dubai government contracting, mediation and amicable settlement activity.",
    category: "Dubai & UAE Law",
    source: "Government of Dubai Legal Affairs Department",
    readingMinutes: 4,
    url: "https://legal.dubai.gov.ae/en/AboutDepartment/Pages/News.aspx",
  },
  {
    id: "demo-uk-law-reform",
    title: "UK Law Commission publishes its latest reform work and consultations",
    summary:
      "Track current England and Wales law-reform projects, reports and consultations before updating advice or precedent language.",
    category: "UK Law",
    source: "Law Commission of England and Wales",
    readingMinutes: 5,
    url: "https://lawcom.gov.uk/news/",
  },
  {
    id: "demo-ghana-judiciary",
    title: "Ghana's Judicial Service highlights court access and justice-sector reform",
    summary:
      "Follow official Ghanaian judiciary announcements, court administration updates and public legal-information initiatives.",
    category: "Ghana Law",
    source: "Judicial Service of Ghana",
    readingMinutes: 4,
    url: "https://judicial.gov.gh/",
  },
  {
    id: "demo-uae-legislation",
    title: "UAE legislation tracker: new federal laws and justice-sector updates",
    summary:
      "Monitor official UAE legislative announcements across civil transactions, capital markets, procedure and regulated industries.",
    category: "Dubai & UAE Law",
    source: "UAE Legislation",
    readingMinutes: 6,
    url: "https://uaelegislation.gov.ae/en/news",
  },
  {
    id: "demo-goldbod-market",
    title: "Ghana Gold Board updates licensing, pricing and offtaker requirements",
    summary:
      "A focused route into GoldBod's official notices for licensed buyers, aggregators, refiners and participants in Ghana's gold market.",
    category: "GoldBod & Mining",
    source: "Ghana Gold Board",
    readingMinutes: 5,
    url: "https://goldbod.gov.gh/news/",
  },
  {
    id: "demo-ghana-law-reports",
    title: "Recent Ghana judgments and legislation for legal research",
    summary:
      "Check the latest Ghanaian decisions, legislation and legal materials published through the national open-law collection.",
    category: "Ghana Law",
    source: "Ghana Legal Information Institute",
    readingMinutes: 6,
    url: "https://ghalii.org/",
  },
];

export function createDemoDailyBriefing(now = new Date()): DailyBriefingData {
  return {
    generatedAt: now.toISOString(),
    viewAllUrl: "https://goldbod.gov.gh/news/",
    isDemo: true,
    articles: DEMO_ARTICLES,
  };
}

export function parseDailyBriefingProviderResponse(input: unknown): DailyBriefingData {
  const parsed = providerResponseSchema.parse(input);
  return {
    ...parsed,
    isDemo: false,
    articles: parsed.articles.filter((article) => isPraxisNewsInScope(article, article.category)),
  };
}

/**
 * Provider boundary for Praxis Daily Briefing. Set VITE_DAILY_BRIEFING_API_URL
 * to an endpoint returning the documented response shape. Provider stories are
 * constrained to the Praxis Dubai/UAE, UK, Ghana and Ghana gold/mining beats;
 * until then the UI uses an explicitly labelled editorial demo.
 */
export async function fetchDailyBriefing({
  endpoint = import.meta.env["VITE_DAILY_BRIEFING_API_URL"] as string | undefined,
  signal,
}: {
  endpoint?: string | undefined;
  signal?: AbortSignal | undefined;
} = {}): Promise<DailyBriefingData> {
  // An explicit endpoint still wins, for anyone who later puts a curated
  // service in front of this.
  if (endpoint?.trim()) {
    const request: RequestInit = { headers: { Accept: "application/json" } };
    if (signal) request.signal = signal;
    const response = await fetch(endpoint, request);
    if (!response.ok) throw new Error(`Daily Briefing provider returned ${response.status}.`);
    return parseDailyBriefingProviderResponse(await response.json());
  }

  // Otherwise read the regulators and law-makers directly, on the server.
  const { loadDailyBriefing } = await import("./briefing.functions");
  return loadDailyBriefing();
}
