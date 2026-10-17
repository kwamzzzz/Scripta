/**
 * Time spent on a piece of work.
 *
 * ---------------------------------------------------------------------------
 * ONE CLOCK, FOR EVERY TOOL
 * ---------------------------------------------------------------------------
 *
 * The clock knows nothing about contracts. It times a SUBJECT — a kind and an
 * id — so the same three pieces (this model, `time.functions.ts`, and the
 * `TimeSpent` pill) serve a matter under review, a research question, a flow
 * deliverable, a task or anything a later tool wants to time. Adding a tool to
 * it is one line at the screen that wants it:
 *
 *     <TimeSpent subject={{ kind: "matter", id: matter.id, label: matter.name }} />
 *
 * Nothing else is needed: no column, no migration, no second timer. That is
 * the whole reason `subject_kind` is loose text in the database and this list
 * lives in TypeScript.
 *
 * ---------------------------------------------------------------------------
 * A SITTING, AND WHY THE APP CLOSING ENDS ONE
 * ---------------------------------------------------------------------------
 *
 * Each run of the clock is a sitting. It counts while it runs, stops when it
 * is paused, and is closed when it is stopped. Total time on a subject is the
 * sum of its sittings, computed on every read — never a stored total, because
 * a stored total that goes wrong once stays wrong.
 *
 * While the clock runs the app says so every `BEAT_EVERY` seconds. A sitting
 * whose heartbeat stopped is settled at the last beat and closed: a tab shut
 * at six o'clock counts until six o'clock, not until the laptop is opened
 * again. A lawyer has to be able to put their name to this number, so the rule
 * is to count only what somebody was demonstrably there for — at the cost of
 * losing up to one beat of real work, which is the right way round to be
 * wrong.
 */

/** What can be timed. Loose by design: see the note above. */
export const TIME_SUBJECTS = [
  "matter",
  "document",
  "research",
  "deliverable",
  "flow",
  "task",
  "learning",
] as const;

export type TimeSubjectKind = (typeof TIME_SUBJECTS)[number];

export type TimeSubject = {
  kind: TimeSubjectKind;
  id: string;
  /** What it is called, kept with the sitting so an old row still reads. */
  label: string;
};

/** How often a running clock says it is still there. */
export const BEAT_EVERY = 20;

/**
 * How long a silence means the app has gone. Three beats: one missed beat is a
 * slow network or a tab the browser throttled in the background, and ending a
 * lawyer's sitting over that would be worse than counting a minute too many.
 */
export const GONE_AFTER = BEAT_EVERY * 3;

/** A sitting, as the database holds it. */
export type Sitting = {
  id: string;
  seconds: number;
  /** When the current run began; null while paused. */
  runningSince: string | null;
  /** Last time the app said it was watching. */
  beatAt: string;
  endedAt: string | null;
};

const secs = (from: string, to: number) =>
  Math.max(0, Math.floor((to - new Date(from).getTime()) / 1000));

/**
 * What a sitting has counted, as at `now`.
 *
 * A running sitting is counted up to the moment asked for, so the pill can
 * tick between beats without writing anything. A running sitting whose
 * heartbeat has stopped is counted only up to that heartbeat — the app was not
 * there for the rest.
 */
export function countedIn(sitting: Sitting, now: number): number {
  if (!sitting.runningSince) return sitting.seconds;
  const beat = new Date(sitting.beatAt).getTime();
  const gone = now - beat > GONE_AFTER * 1000;
  return sitting.seconds + secs(sitting.runningSince, gone ? beat : now);
}

/** Total time on the subject: every sitting, settled the same way. */
export function totalOf(sittings: Sitting[], now: number): number {
  return sittings.reduce((sum, s) => sum + countedIn(s, now), 0);
}

/**
 * Whether the clock is genuinely running, as opposed to a sitting left open by
 * an app that went away. This is what decides which button the pill shows.
 */
export function isRunning(sitting: Sitting | null | undefined, now: number): boolean {
  if (!sitting?.runningSince || sitting.endedAt) return false;
  return now - new Date(sitting.beatAt).getTime() <= GONE_AFTER * 1000;
}

/**
 * A duration a lawyer can read at a glance: 0:42, 12:05, 1:04:17.
 *
 * Minutes and seconds always, hours only once there are any, because a clock
 * that reads 00:00:42 makes the reader count the zeros to find the number that
 * changed.
 */
export function formatSpan(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The same duration in the words a time record uses: "1h 04m", "42m", "under a minute". */
export function formatWorked(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  if (whole < 60) return "under a minute";
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  if (!h) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/* --------------------------------------------------------- recording it -- */

/**
 * The unit a firm bills in: six minutes, a tenth of an hour.
 *
 * Every time-recording system a lawyer has used works in these, and a figure
 * that does not land on one has to be converted by whoever reads it next. The
 * clock counts seconds; what leaves the clock is units.
 */
export const UNIT_MINUTES = 6;

/**
 * Seconds at the clock → units on the record, rounded UP.
 *
 * Up, not to the nearest, because that is the profession's convention and the
 * alternative is a system that quietly writes off the first three minutes of
 * every piece of work. Anything at all counts as one unit: a lawyer who opened
 * the file and read a clause did some work on it.
 */
export function unitsFor(seconds: number): number {
  const minutes = Math.max(0, seconds) / 60;
  if (minutes <= 0) return 0;
  return Math.max(1, Math.ceil(minutes / UNIT_MINUTES));
}

/** Units as a firm writes them on a bill: 0.1, 1.5, 12.0. */
export const formatUnits = (units: number): string => ((units * UNIT_MINUTES) / 60).toFixed(1);

/** Units as a duration a person reads: 1h 30m, 24m. */
export function formatUnitSpan(units: number): string {
  const minutes = units * UNIT_MINUTES;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
}

/**
 * The activity codes a bill is coded with (UTBMS).
 *
 * The same eleven every panel firm and every e-billing system understands, so
 * an entry made here can be exported to one without being re-coded by hand.
 * The default is the one this app's work almost always is.
 */
export const ACTIVITY_CODES = [
  { code: "A104", label: "Review / analyse" },
  { code: "A103", label: "Draft / revise" },
  { code: "A101", label: "Plan and prepare" },
  { code: "A102", label: "Research" },
  { code: "A105", label: "Communicate — in firm" },
  { code: "A106", label: "Communicate — with client" },
  { code: "A107", label: "Communicate — other counsel" },
  { code: "A108", label: "Communicate — other external" },
  { code: "A109", label: "Appear for / attend" },
  { code: "A110", label: "Manage data / files" },
  { code: "A111", label: "Other" },
] as const;

/** Clause numbers as a lawyer writes them in a narrative: 4, 5.1–5.3 and 7. */
export function clauseList(nums: string[]): string {
  const seen = [...new Set(nums.map((n) => n.trim()).filter(Boolean))];
  if (!seen.length) return "";
  // Decimal numbers sort as numbers, anything else (a schedule) after them.
  const parts = (n: string) => n.split(".").map((p) => Number(p));
  const numeric = seen.filter((n) => /^\d+(\.\d+)*[A-Za-z]?$/.test(n));
  const named = seen.filter((n) => !numeric.includes(n));
  numeric.sort((a, b) => {
    const x = parts(a);
    const y = parts(b);
    for (let at = 0; at < Math.max(x.length, y.length); at++) {
      const left = x[at] ?? -1;
      const right = y[at] ?? -1;
      if (left !== right) return left - right;
    }
    return a.localeCompare(b);
  });
  const all = [...numeric, ...named];
  if (all.length === 1) return all[0]!;
  if (all.length === 2) return `${all[0]} and ${all[1]}`;
  return `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`;
}

/**
 * What the work was, in the words a time record uses.
 *
 * Built from what the mark-up history says actually happened in the sitting,
 * because a narrative a lawyer has to write from memory at six o'clock is the
 * part of time recording everyone does badly. It is a first draft and the
 * field is editable: nothing here is written to a bill without being read.
 *
 * Deliberately not a count of anything. "Reviewing and marking up the Vendor
 * Agreement; amendments to clauses 4 and 5.1" is what a lawyer writes; "2
 * insertions, 1 deletion across 3 clauses" is what a machine writes, and a
 * client reading the second one asks what they are paying for.
 */
export function proposeNarrative(input: {
  document: string;
  /** Clause numbers touched by a proposal or a settled change. */
  amended: string[];
  /** Clause numbers that were drafted here rather than read. */
  drafted: string[];
  /** Clause numbers that were only read, highlighted or annotated. */
  considered: string[];
}): string {
  const about = input.document.trim() || "the document";
  const bits: string[] = [];

  if (input.amended.length)
    bits.push(
      `amendments to clause${input.amended.length > 1 ? "s" : ""} ${clauseList(input.amended)}`,
    );
  if (input.drafted.length)
    bits.push(`drafting clause${input.drafted.length > 1 ? "s" : ""} ${clauseList(input.drafted)}`);
  if (input.considered.length)
    bits.push(
      `consideration of clause${input.considered.length > 1 ? "s" : ""} ${clauseList(input.considered)}`,
    );

  const opening =
    input.amended.length || input.drafted.length
      ? `Reviewing and marking up ${about}`
      : `Reviewing ${about}`;

  return bits.length ? `${opening}; ${bits.join("; ")}.` : `${opening}.`;
}
