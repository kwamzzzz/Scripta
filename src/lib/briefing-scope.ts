export const PRAXIS_BRIEFING_CATEGORIES = [
  "All",
  "Dubai & UAE Law",
  "UK Law",
  "Ghana Law",
  "GoldBod & Mining",
] as const;

export type PraxisBriefingCategory = (typeof PRAXIS_BRIEFING_CATEGORIES)[number];
export type PraxisArticleCategory = Exclude<PraxisBriefingCategory, "All">;

type ScopedNewsText = {
  title: string;
  summary?: string | undefined;
  source?: string | undefined;
};

const CATEGORY_PATTERNS: Record<PraxisArticleCategory, RegExp[]> = {
  "Dubai & UAE Law": [
    /\bdubai\b/i,
    /\bunited arab emirates\b/i,
    /\buae\b/i,
    /\bemirati\b/i,
    /\babu dhabi\b/i,
    /\bdifc\b/i,
    /\badgm\b/i,
  ],
  "UK Law": [
    /\bunited kingdom\b/i,
    /\bu\.?k\.?\b/i,
    /\bbritish\b/i,
    /\bengland(?: and wales)?\b/i,
    /\bwales\b/i,
    /\bscotland\b/i,
    /\bnorthern ireland\b/i,
    /\buk supreme court\b/i,
  ],
  "Ghana Law": [/\bghana(?:ian|'s)?\b/i, /\baccra\b/i, /\bghalii\b/i],
  "GoldBod & Mining": [
    /\bgoldbod\b/i,
    /\bghana gold board\b/i,
    /\bghana(?:ian|'s)?\b[^.]{0,100}\b(?:gold|mining|mineral|galamsey|offtaker|assay)\b/i,
    /\b(?:gold|mining|mineral|galamsey|offtaker|assay)\b[^.]{0,100}\bghana(?:ian|'s)?\b/i,
  ],
};

function searchableText({ title, summary, source }: ScopedNewsText) {
  return [title, summary, source].filter(Boolean).join(" ");
}

export function isPraxisNewsInScope(content: ScopedNewsText, category?: PraxisArticleCategory) {
  const text = searchableText(content);
  const categories = category
    ? [category]
    : (PRAXIS_BRIEFING_CATEGORIES.filter(
        (item): item is PraxisArticleCategory => item !== "All",
      ) as PraxisArticleCategory[]);
  return categories.some((item) => CATEGORY_PATTERNS[item].some((pattern) => pattern.test(text)));
}
