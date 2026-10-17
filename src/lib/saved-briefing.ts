import type { BriefingArticle } from "./daily-briefing";

/**
 * Saving a briefing item.
 *
 * The briefing shows only what each publisher has out at the moment, so
 * storing the item's id — which is what this used to do — saved a pointer to
 * something that would be gone within days. The whole article is kept
 * instead: the title, the summary, the publisher, the date and the link,
 * exactly as it read when it was saved.
 *
 * Saved items are kept for fifteen days and then dropped. This is a reading
 * list, not a filing system: it holds what you have not got to yet. Anything
 * that matters to a matter should be attached to that matter, where it will
 * still be there in a year.
 */

export const RETENTION_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SavedArticle = BriefingArticle & {
  /** When it was saved. Retention runs from here, not from publication: a
   *  three-year-old statute saved today is still fresh to the reader. */
  savedAt: string;
};

export const isSaved = (saved: SavedArticle[], id: string) => saved.some((s) => s.id === id);

/** Whole days left before an item is dropped, never below zero. */
export function daysLeft(item: SavedArticle, now = new Date()): number {
  const expiry = Date.parse(item.savedAt) + RETENTION_DAYS * DAY_MS;
  if (Number.isNaN(expiry)) return 0;
  return Math.max(0, Math.ceil((expiry - now.getTime()) / DAY_MS));
}

/** Drop anything past its fifteen days. */
export function pruneSaved(saved: SavedArticle[], now = new Date()): SavedArticle[] {
  return saved.filter((item) => {
    const at = Date.parse(item.savedAt);
    // An item whose date cannot be read has nothing to expire against, so it
    // is dropped rather than kept forever.
    if (Number.isNaN(at)) return false;
    return now.getTime() - at < RETENTION_DAYS * DAY_MS;
  });
}

/** Save an item, or remove it if it is already saved. Newest first. */
export function toggleSaved(
  saved: SavedArticle[],
  article: BriefingArticle,
  now = new Date(),
): SavedArticle[] {
  if (isSaved(saved, article.id)) return saved.filter((s) => s.id !== article.id);
  return [{ ...article, savedAt: now.toISOString() }, ...saved];
}

/**
 * Read what was stored, tolerating what came before.
 *
 * Earlier versions kept a bare list of ids. Those cannot be shown — the
 * article they pointed at is not recorded anywhere — so they are discarded
 * rather than displayed as empty rows. Anything unreadable is discarded too;
 * a saved-items list that throws is worse than one that starts empty.
 */
export function readSaved(raw: unknown, now = new Date()): SavedArticle[] {
  if (!Array.isArray(raw)) return [];
  const items = raw.filter(
    (item): item is SavedArticle =>
      !!item &&
      typeof item === "object" &&
      typeof (item as SavedArticle).id === "string" &&
      typeof (item as SavedArticle).title === "string" &&
      typeof (item as SavedArticle).url === "string" &&
      typeof (item as SavedArticle).savedAt === "string",
  );
  return pruneSaved(items, now);
}

/** How the retention reads on the card. */
export function retentionLabel(item: SavedArticle, now = new Date()): string {
  const left = daysLeft(item, now);
  if (left <= 0) return "Dropping today";
  if (left === 1) return "Kept 1 more day";
  return `Kept ${left} more days`;
}
