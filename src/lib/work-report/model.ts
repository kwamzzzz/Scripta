/**
 * What you actually got done today.
 *
 * The report answers one question and refuses the neighbouring ones. It is not
 * a timesheet: nothing here counts hours. It is not a productivity score:
 * nothing here is totalled, ranked or compared. It is not an activity feed:
 * opening a page, editing a field, running a search and changing a setting do
 * not appear, however many of them there were.
 *
 * ONE SOURCE: tasks you completed.
 *
 * It read four sources at first — ticked deliverables, final versions and a
 * short list of audit events alongside the tasks — and that was wrong. Those
 * are traces of work happening, and a report assembled from traces is the
 * activity feed this is not. A task is the one place in Scripta where a person
 * has said, deliberately, "that is finished". Everything the report needs hangs
 * off it: the matter it was filed to, the tool it was work for, and what it
 * produced.
 *
 * Adding a second source is therefore not a small change. It would mean
 * deciding that something other than a person's own judgement counts as
 * finishing, and that decision belongs to whoever is reading this, not to a
 * convenient query.
 */

/**
 * One piece of completed work.
 *
 * Every field that points at something in Scripta is kept, so an entry can
 * always be traced back to the work itself rather than being a sentence about
 * it. That is also what makes this the seam a Career Ledger reads later: it can
 * select entries and promote them into evidence of experience without this
 * module knowing anything about CVs, competencies, reviews or interviews. None
 * of that vocabulary belongs here, and adding it would be the duplication.
 */
export type WorkEntry = {
  /** Stable within a day's report, so an edit can find its entry again. */
  id: string;
  /** What was completed, in the words the task itself carries. */
  title: string;
  /** When it completed. ISO, used for ordering within a matter. */
  at: string;
  matterId: string | null;
  matterName: string;
  /** The Workflow Tool this was work for, where the work says so. */
  tool?: string | undefined;
  /** What the work produced, where it produced something nameable. */
  output?: string | undefined;
  /** Where to go to see the work itself. */
  href?: string | undefined;
  /** Context the lawyer added afterwards. Never generated. */
  note?: string | undefined;
  /** Dropped from the report by hand. Kept, so the decision stays visible. */
  excluded?: boolean | undefined;
};

/** A day's entries, gathered under the matter they belong to. */
export type WorkGroup = {
  matterId: string | null;
  matterName: string;
  entries: WorkEntry[];
};

export type WorkReport = {
  day: string;
  entries: WorkEntry[];
  note: string;
  /** Null until the day has been frozen into a stored record. */
  savedAt: string | null;
};

/** Midnight to midnight where the person is sitting, as an ISO day. */
export const localDay = (at: Date = new Date()): string => {
  const offset = at.getTimezoneOffset() * 60_000;
  return new Date(at.getTime() - offset).toISOString().slice(0, 10);
};

/** The instant a local day begins and ends, for querying a UTC column. */
export function dayBounds(day: string): { from: string; to: string } {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** The day is done, so the report is worth freezing. */
export const CLOSE_HOUR = 17;
export const CLOSE_MINUTE = 30;

export function dayHasClosed(day: string, now: Date = new Date()): boolean {
  const today = localDay(now);
  if (day < today) return true;
  if (day > today) return false;
  return (
    now.getHours() > CLOSE_HOUR ||
    (now.getHours() === CLOSE_HOUR && now.getMinutes() >= CLOSE_MINUTE)
  );
}

/**
 * Entries under the matter they belong to, rather than a flat list in the order
 * things happened. Four things done on one matter is one piece of work seen
 * four times; reading them apart is what makes an activity log feel like noise.
 */
export function groupByMatter(entries: WorkEntry[]): WorkGroup[] {
  const groups = new Map<string, WorkGroup>();
  for (const entry of entries) {
    if (entry.excluded) continue;
    const key = entry.matterId ?? "";
    const group = groups.get(key);
    if (group) group.entries.push(entry);
    else
      groups.set(key, {
        matterId: entry.matterId,
        matterName: entry.matterName || "Not filed to a matter",
        entries: [entry],
      });
  }
  // Matters first, in the order their earliest work finished; unfiled last,
  // because it is the part of the day with no home rather than its opening.
  return [...groups.values()]
    .map((g) => ({ ...g, entries: [...g.entries].sort((a, b) => a.at.localeCompare(b.at)) }))
    .sort((a, b) => {
      if (!a.matterId !== !b.matterId) return a.matterId ? -1 : 1;
      return (a.entries[0]?.at ?? "").localeCompare(b.entries[0]?.at ?? "");
    });
}

/** What a report answers to in a search across the history. */
export const reportSearchText = (report: { day: string; note: string; entries: WorkEntry[] }) =>
  [
    report.day,
    report.note,
    ...report.entries.flatMap((e) => [
      e.title,
      e.matterName,
      e.tool ?? "",
      e.output ?? "",
      e.note ?? "",
    ]),
  ].join(" ");

/** "3 items · 2 matters" — the one line a day gets in a list. */
export function summarise(entries: WorkEntry[]): string {
  const live = entries.filter((e) => !e.excluded);
  if (!live.length) return "Nothing recorded";
  const matters = new Set(live.filter((e) => e.matterId).map((e) => e.matterId)).size;
  const items = `${live.length} ${live.length === 1 ? "item" : "items"}`;
  if (!matters) return items;
  return `${items} · ${matters} ${matters === 1 ? "matter" : "matters"}`;
}
