/**
 * How long things take, worked out from what is in them.
 *
 * Nothing here is stored. An item's time is read off its blocks every time it
 * is shown, so rewriting a paragraph or adding a recording changes the figure
 * without anybody remembering to update it. The rates are deliberately plain
 * and stated here, because a learner deciding whether they can fit a module
 * into a lunch hour should get the same answer an author would work out.
 */
import { readBlocks, type Block } from "./blocks";
import { countsTowardsProgress, isComplete, type Item, type ProgressIndex } from "./model";

/**
 * Study pace, not reading pace. Legal material read to be understood and
 * remembered, with statute numbers to hold on to, goes at about 130 words a
 * minute; the 200 to 250 of ordinary reading is skimming for this purpose.
 */
export const WORDS_PER_MINUTE = 130;

/**
 * A recording is not done in its running time. People pause to note a law
 * number, go back over a point they missed, and stop to think.
 */
export const MEDIA_FACTOR = 1.3;

/**
 * Time to sit with an item once it has been read, watched or listened to:
 * looking back over it, noting what matters, letting it settle. A share of
 * the item's own time, with a floor so a short item still gets a moment.
 * Practice is excluded: answering questions is already the sitting-with.
 */
export const REFLECT_SHARE = 0.2;
export const REFLECT_FLOOR = 60;

const SECONDS = {
  /** A diagram, slide image or infographic, studied beside its explanation. */
  image: 90,
  /** Per slide in a deck, read and thought about. */
  slide: 60,
  /** A deck whose length is not known. */
  deck: 12 * 60,
  /** A deck is revised, not read cover to cover: long reference decks are capped. */
  deckCap: 25 * 60,
  /** Read the scenario and the options, answer, read why. */
  question: 90,
  /** Per flashcard, trying to recall before turning it over. */
  card: 25,
  /** A "check your understanding" prompt: time to actually answer it. */
  check: 2 * 60,
  /** Per table row, read with the course in mind. */
  row: 8,
};

export type Estimate = {
  read: number;
  /** Time to sit with it afterwards. */
  reflect: number;
  listen: number;
  watch: number;
  /** Questions, flashcards and checks. */
  practice: number;
  /** Diagrams and slides. */
  look: number;
  total: number;
};

const EMPTY: Estimate = {
  read: 0,
  reflect: 0,
  listen: 0,
  watch: 0,
  practice: 0,
  look: 0,
  total: 0,
};

const words = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
const readSeconds = (text: string) => (words(text) / WORDS_PER_MINUTE) * 60;

export function estimateBlocks(blocks: Block[]): Estimate {
  const e = { ...EMPTY };
  for (const b of blocks) {
    switch (b.type) {
      case "media": {
        const m = b.media;
        if (!m) break;
        if (m.kind === "audio") e.listen += (m.seconds ?? 0) * MEDIA_FACTOR;
        else if (m.kind === "video") e.watch += (m.seconds ?? 0) * MEDIA_FACTOR;
        else if (m.kind === "image") e.look += SECONDS.image;
        else if (m.kind === "pdf")
          e.look += m.pages ? Math.min(m.pages * SECONDS.slide, SECONDS.deckCap) : SECONDS.deck;
        e.read += readSeconds(b.text);
        break;
      }
      case "quiz":
        e.practice += SECONDS.question;
        break;
      case "flashcards":
        e.practice += (b.cards?.length ?? 0) * SECONDS.card;
        break;
      case "table":
        e.read += Math.min(10 * 60, Math.max(60, ((b.rows?.length ?? 1) - 1) * SECONDS.row));
        break;
      case "credit":
      case "note":
        break;
      case "check":
        e.practice += SECONDS.check + readSeconds(b.text);
        break;
      default:
        e.read += readSeconds(`${b.cite ?? ""} ${b.text}`);
    }
  }
  const content = e.read + e.listen + e.watch + e.look;
  e.reflect = content > 0 ? Math.max(REFLECT_FLOOR, content * REFLECT_SHARE) : 0;
  e.total = content + e.reflect + e.practice;
  return e;
}

export function estimateItem(item: Item): Estimate {
  if (item.kind === "folder") return { ...EMPTY };
  return estimateBlocks(readBlocks(item.payload));
}

export function sumEstimates(list: Estimate[]): Estimate {
  return list.reduce(
    (a, e) => ({
      read: a.read + e.read,
      reflect: a.reflect + e.reflect,
      listen: a.listen + e.listen,
      watch: a.watch + e.watch,
      practice: a.practice + e.practice,
      look: a.look + e.look,
      total: a.total + e.total,
    }),
    { ...EMPTY },
  );
}

/** "6 min", "1 h 5 min", "2 h". Never "0 min" for something with content in it. */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * What an item asks of you, the way a learner would say it:
 * "35 min listen · 3 min read · 8 min to reflect".
 */
export function describeItem(e: Estimate): string {
  const parts: string[] = [];
  if (e.watch >= 30) parts.push(`${formatDuration(e.watch)} watch`);
  if (e.listen >= 30) parts.push(`${formatDuration(e.listen)} listen`);
  if (e.look >= 30) parts.push(`${formatDuration(e.look)} to study`);
  if (e.read >= 30) parts.push(`${formatDuration(e.read)} read`);
  if (e.practice >= 30) parts.push(`${formatDuration(e.practice)} practice`);
  if (e.reflect >= 30) parts.push(`${formatDuration(e.reflect)} to reflect`);
  return parts.join(" · ");
}

/** A sitting is about half an hour, and a little over still counts as one. */
export const SITTING = 30 * 60;
const STRETCH = 1.2;

/**
 * A plan a learner can believe: the modules in order, short ones sharing a
 * sitting of about half an hour, a long one taking as many as it needs. The
 * sittings then add up to roughly the course's length, which is the point.
 */
export function sittings(moduleSeconds: number[], sitting = SITTING): number {
  let count = 0;
  let open = 0;
  for (const s of moduleSeconds) {
    if (s <= 0) continue;
    if (s > sitting * STRETCH) {
      if (open > 0) count += 1;
      open = 0;
      count += Math.ceil(s / (sitting * STRETCH));
    } else if (open + s <= sitting * STRETCH) {
      open += s;
    } else {
      count += 1;
      open = s;
    }
  }
  return count + (open > 0 ? 1 : 0);
}

/** Whether a module can be done in one go. */
export const fitsOneSitting = (seconds: number) => seconds > 0 && seconds <= SITTING * STRETCH;

export type TimeCell = { total: number; left: number };

/**
 * Every module's time and time left, and the course's, in one pass. Only items
 * that count towards progress count here too, so a hidden draft never makes a
 * course look longer than what the learner will actually be asked to do.
 */
export function courseTimes(
  modules: { id: string }[],
  items: Item[],
  progress: ProgressIndex,
): { course: TimeCell; byModule: Map<string, TimeCell>; byItem: Map<string, Estimate> } {
  const byItem = new Map<string, Estimate>();
  const byModule = new Map<string, TimeCell>(modules.map((m) => [m.id, { total: 0, left: 0 }]));
  const course: TimeCell = { total: 0, left: 0 };
  for (const item of items) {
    const e = estimateItem(item);
    byItem.set(item.id, e);
    if (!countsTowardsProgress(item)) continue;
    const cell = byModule.get(item.moduleId);
    const left = isComplete(progress, item.id) ? 0 : e.total;
    course.total += e.total;
    course.left += left;
    if (cell) {
      cell.total += e.total;
      cell.left += left;
    }
  }
  return { course, byModule, byItem };
}
