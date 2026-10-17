/**
 * Recently Deleted.
 *
 * Scripta keeps two different promises about getting something back, and they
 * are not the same promise:
 *
 *   Archive — "I am done with this, keep it." Reversible for ever, at a
 *   moment's notice, and it never asks. A precedent you archive in March is
 *   still there in December.
 *
 *   Delete — "get rid of this." It goes to Recently Deleted, stays for fifteen
 *   days, and is then gone for good. It asks first, because the grace period
 *   runs out and archiving does not.
 *
 * That distinction is the reason Delete is still worth having. If deleting
 * were merely another reversible state there would be no reason to archive
 * anything, and the two would collapse into one confusing thing.
 *
 * The sentence a lawyer reads comes from `deleteQuestion` in ConfirmDelete and
 * is built from `RECENTLY_DELETED_DAYS`, so the promise on screen and the
 * purge in the database cannot drift apart.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ArchivableTable } from "@/lib/archive";

/** Mirrors `public.recently_deleted_days()`. Both are read by the tests. */
export const RECENTLY_DELETED_DAYS = 15;

/**
 * Tables with a bin. Deliberately the same set that can be archived: these are
 * records that live in a collection, and Recently Deleted is a collection.
 *
 * The parts of a record — a position in a playbook, a section in a template —
 * are not in here. A bin full of fragments with no record to return them to
 * would be worse than deleting them outright, so those still go at once, and
 * still ask.
 */
export type BinnableTable = ArchivableTable;

/** Move records to Recently Deleted. They leave every other view at once. */
export async function moveToBin(table: BinnableTable, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(error.message);
}

/**
 * Put records back where they were.
 *
 * Only `deleted_at` is cleared: something archived before it was deleted is
 * still archived when it comes back. Restoring undoes the delete, not every
 * decision taken before it.
 */
export async function restoreFromBin(table: BinnableTable, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from(table).update({ deleted_at: null }).in("id", ids);
  if (error) throw new Error(error.message);
}

/** Remove for good, before the grace period is up. The only true delete. */
export async function deleteForever(table: BinnableTable, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from(table).delete().in("id", ids);
  if (error) throw new Error(error.message);
}

/**
 * Clear out whatever has run out of time.
 *
 * Called when Recently Deleted is opened, so the fifteen days are honoured
 * whether or not anything is scheduled on the database. Running it twice is
 * harmless, and it only ever removes rows already past the cut-off.
 */
export async function purgeExpired(): Promise<number> {
  const { data, error } = await supabase.rpc("purge_recently_deleted");
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

/** How long something has left, for the row that says so. */
export function daysLeft(deletedAt: string, now = new Date()): number {
  const gone = new Date(deletedAt).getTime() + RECENTLY_DELETED_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((gone - now.getTime()) / 86_400_000));
}

/** "Removed for good tomorrow" reads better than "1 day left". */
export function binCountdown(deletedAt: string, now = new Date()): string {
  const left = daysLeft(deletedAt, now);
  if (left === 0) return "Removed for good today";
  if (left === 1) return "Removed for good tomorrow";
  return `Removed for good in ${left} days`;
}
