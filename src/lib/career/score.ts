/**
 * Readiness: a number that has to earn itself.
 *
 * A single score for "am I ready for this role" is the thing every career tool
 * ships and the thing every honest person distrusts, because a number with no
 * account of itself is just a mood. So this one is built from four named parts,
 * each of which is a share of something countable, each of which can say what
 * would move it, and none of which can be moved by writing more words about
 * yourself:
 *
 *   BREADTH    how many of the essential requirements are carried at all
 *   DEPTH      how far past the line the carried ones go
 *   CURRENCY   whether the evidence behind them is recent enough to speak
 *   PROOF      how much of it is corroborated rather than asserted
 *
 * Breadth and depth are the substance and carry most of the weight. Currency
 * and proof are the honesty of it: a role can look carried on ten-year-old
 * work nobody can vouch for, and this is what stops it looking carried.
 *
 * The other two readings here are the ones that make the number useful rather
 * than decorative. `trajectory` replays the score month by month from the
 * dates on the claims, so a lawyer can see that they are moving rather than
 * being told they are. `whatWouldMove` takes each unmet requirement in turn,
 * asks what the score would be if it were carried, and ranks by the answer —
 * which turns "here are your gaps" into "do this one first".
 */
import {
  LEVEL_RANK,
  STATUS_LABEL,
  corroborationOf,
  recencyOf,
  type Assessment,
  type Claim,
  type Criterion,
  type Evidence,
  type ProgressionStatus,
} from "./model";

export type ComponentKey = "breadth" | "depth" | "currency" | "proof";

export const COMPONENT_LABEL: Record<ComponentKey, string> = {
  breadth: "Breadth",
  depth: "Depth",
  currency: "Currency",
  proof: "Proof",
};

export const COMPONENT_MEANING: Record<ComponentKey, string> = {
  breadth: "How many of the essential requirements have something that carries them.",
  depth: "How far past the line the carried ones go.",
  currency: "Whether the evidence behind them is recent enough to still speak for you.",
  proof: "How much of it is corroborated rather than asserted.",
};

export const WEIGHTS: Record<ComponentKey, number> = {
  breadth: 0.35,
  depth: 0.35,
  currency: 0.15,
  proof: 0.15,
};

/** What each status is worth to depth. Carried is 70: the line, not the ceiling. */
const DEPTH_OF: Record<ProgressionStatus, number> = {
  none: 0,
  developing: 35,
  evidenced: 70,
  strong: 100,
};

/** What recency is worth. Undated evidence is doubted, not discarded. */
const CURRENCY_OF = { current: 1, recent: 0.6, undated: 0.4, historic: 0.2 } as const;

export type ScoreComponent = {
  key: ComponentKey;
  value: number;
  /** The count behind it, said as a fraction — "4 of 7" — never as a bare number. */
  detail: string;
};

export type Readiness = {
  score: number;
  components: ScoreComponent[];
  /** The plain sentence that goes beside the number. */
  summary: string;
};

const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Read a role as one number, with its working shown.
 *
 * Essential requirements only. A desirable one a firm called "advantageous"
 * should not be able to drag a lawyer's readiness down, and it should not be
 * able to prop it up either.
 */
export function readiness(
  criteria: Criterion[],
  assessments: Assessment[],
  claimed: Map<string, Evidence[]>,
  today: Date = new Date(),
): Readiness {
  const essential = criteria.filter((c) => c.essential);
  const forCriterion = new Map(assessments.map((a) => [a.criterionId, a]));

  if (!essential.length)
    return {
      score: 0,
      components: (Object.keys(WEIGHTS) as ComponentKey[]).map((key) => ({
        key,
        value: 0,
        detail: "No essential requirements recorded",
      })),
      summary: "This role has no essential requirements recorded yet.",
    };

  const statuses = essential.map(
    (c) => forCriterion.get(c.id)?.status ?? ("none" as ProgressionStatus),
  );
  const carried = statuses.filter((s) => s === "evidenced" || s === "strong").length;
  const breadth = (carried / essential.length) * 100;
  const depth = statuses.reduce((sum, s) => sum + DEPTH_OF[s], 0) / essential.length;

  /* Currency and proof are read off the evidence actually doing the carrying,
     not off the portfolio: evidence claimed against nothing says nothing about
     readiness for this role. */
  const supporting = new Map<string, Evidence>();
  for (const c of essential)
    for (const id of forCriterion.get(c.id)?.supporting ?? []) {
      const found = (claimed.get(c.id) ?? []).find((e) => e.id === id);
      if (found) supporting.set(found.id, found);
    }
  const used = [...supporting.values()];
  const currency = used.length
    ? (used.reduce((sum, e) => sum + CURRENCY_OF[recencyOf(e, today)], 0) / used.length) * 100
    : 0;

  const allClaimed = new Map<string, Evidence>();
  for (const c of essential)
    for (const e of claimed.get(c.id) ?? []) if (!e.archivedAt) allClaimed.set(e.id, e);
  const claimedList = [...allClaimed.values()];
  const corroborated = claimedList.filter((e) => corroborationOf(e) === "supported").length;
  const proof = claimedList.length ? (corroborated / claimedList.length) * 100 : 0;

  const components: ScoreComponent[] = [
    {
      key: "breadth",
      value: pct(breadth),
      detail: `${carried} of ${essential.length} essential requirements carried`,
    },
    {
      key: "depth",
      value: pct(depth),
      detail: `${statuses.filter((s) => s === "strong").length} of ${essential.length} strongly evidenced`,
    },
    {
      key: "currency",
      value: pct(currency),
      detail: used.length
        ? `${used.filter((e) => recencyOf(e, today) === "current").length} of ${used.length} pieces are current`
        : "Nothing is carrying a requirement yet",
    },
    {
      key: "proof",
      value: pct(proof),
      detail: claimedList.length
        ? `${corroborated} of ${claimedList.length} claimed pieces are corroborated`
        : "Nothing claimed yet",
    },
  ];

  const score = pct(components.reduce((sum, c) => sum + c.value * WEIGHTS[c.key], 0));

  const weakest = [...components].sort((a, b) => a.value - b.value)[0]!;
  return {
    score,
    components,
    summary:
      carried === essential.length
        ? "Every essential requirement is carried. What is left is depth and keeping it current."
        : `${carried} of ${essential.length} essential requirements are carried. ${COMPONENT_LABEL[weakest.key]} is what is holding this back.`,
  };
}

/* ------------------------------------------------------------- trajectory */

export type TrajectoryPoint = {
  /** "2026-03", the month this point ends. */
  month: string;
  label: string;
  score: number;
  carried: number;
};

/**
 * The score as it would have read at the end of each of the last N months.
 *
 * Replayed from the dates: a claim counts from the day it was made, a piece of
 * evidence from the day it was recorded. Nothing is stored for this — the
 * record already knows when everything happened, and a stored history would
 * only be another thing to keep true.
 *
 * It is the answer to the question the portal exists to answer and cannot be
 * answered by a status: am I actually moving.
 */
export function trajectory(
  criteria: Criterion[],
  claims: Claim[],
  evidence: Evidence[],
  assess: (criteria: Criterion[], claimed: Map<string, Evidence[]>) => Assessment[],
  months = 12,
  today: Date = new Date(),
): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [];
  const byId = new Map(evidence.map((e) => [e.id, e]));

  for (let back = months - 1; back >= 0; back--) {
    const end = new Date(today.getFullYear(), today.getMonth() - back + 1, 0, 23, 59, 59);
    const cutoff = end.toISOString();
    const claimed = new Map<string, Evidence[]>();
    for (const c of criteria)
      claimed.set(
        c.id,
        claims
          .filter((x) => x.criterionId === c.id && (x.createdAt ?? "") <= cutoff)
          .map((x) => byId.get(x.evidenceId))
          .filter((e): e is Evidence => !!e && e.createdAt <= cutoff),
      );
    const assessments = assess(criteria, claimed);
    const r = readiness(criteria, assessments, claimed, end);
    const carried = assessments.filter(
      (a) => a.status === "evidenced" || a.status === "strong",
    ).length;
    points.push({
      month: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`,
      label: end.toLocaleDateString(undefined, { month: "short" }),
      score: r.score,
      carried,
    });
  }
  return points;
}

/** What the trajectory says, in a sentence, or nothing when it says nothing. */
export function movementSummary(points: TrajectoryPoint[]): string {
  if (points.length < 2) return "";
  const now = points[points.length - 1]!;
  const then = points[0]!;
  const gain = now.score - then.score;
  const carried = now.carried - then.carried;
  if (gain <= 0 && carried <= 0)
    return "Nothing has moved in the last twelve months. One piece of recorded work would change that.";
  return [
    carried > 0
      ? `${carried} more requirement${carried === 1 ? "" : "s"} carried than a year ago`
      : "",
    gain > 0 ? `readiness up ${gain} point${gain === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(", ")
    .replace(/^./, (s) => s.toUpperCase())
    .concat(".");
}

/* ------------------------------------------------- what would move you most */

export type Lever = {
  criterion: Criterion;
  status: ProgressionStatus;
  /** Points the score would gain if this requirement were carried one step further. */
  gain: number;
  /** The step being priced: what it would become. */
  to: ProgressionStatus;
};

/**
 * Every unfinished requirement, priced by what carrying it would be worth.
 *
 * The honest version of a to-do list: a gap on a role with forty requirements
 * is worth less than a gap on a role with six, and a lawyer with an afternoon
 * should spend it where it counts. The prices are computed by asking the same
 * scoring function what it would say — not estimated.
 */
export function whatWouldMove(
  criteria: Criterion[],
  assessments: Assessment[],
  claimed: Map<string, Evidence[]>,
  today: Date = new Date(),
): Lever[] {
  const base = readiness(criteria, assessments, claimed, today).score;
  const next: Record<ProgressionStatus, ProgressionStatus> = {
    none: "evidenced",
    developing: "evidenced",
    evidenced: "strong",
    strong: "strong",
  };

  return (
    assessments
      .filter((a) => a.status !== "strong")
      .map((a) => {
        const criterion = criteria.find((c) => c.id === a.criterionId)!;
        const to = next[a.status];
        /* Swap this one assessment for the better one and re-ask. Everything
         else is held still, so the number is this requirement's own worth. */
        const lifted = assessments.map((x) =>
          x.criterionId === a.criterionId ? { ...x, status: to } : x,
        );
        return {
          criterion,
          status: a.status,
          to,
          gain: Math.max(0, readiness(criteria, lifted, claimed, today).score - base),
        };
      })
      .filter((l) => !!l.criterion)
      /* Ties are common — on a long framework most gaps are worth the same — so
       they break on effort: a requirement already part-way there is nearer
       than one with nothing against it, and nearer is where an afternoon
       goes furthest. */
      .sort(
        /* Ties are the normal case on a long framework: everything with
           nothing against it is worth the same. They break on the order the
           framework itself puts them in, so a tied list reads the way the
           document reads rather than alphabetically, which is an order
           nobody chose. */
        (a, b) =>
          b.gain - a.gain ||
          Number(b.criterion.essential) - Number(a.criterion.essential) ||
          a.criterion.sortOrder - b.criterion.sortOrder,
      )
  );
}

/* --------------------------------------------------------- where you have been */

export type AreaSlice = {
  area: string;
  count: number;
  /** How the work in this area breaks down by how far in you were. */
  levels: Record<string, number>;
  /** The strongest level reached in this area. */
  best: string | null;
};

/**
 * Where a lawyer's experience actually sits.
 *
 * Read off the portfolio rather than from what they say they do, which is the
 * point: a practice can drift for two years before anybody notices that the
 * work stopped matching the title on the door.
 */
export function areaMix(evidence: Evidence[]): AreaSlice[] {
  const live = evidence.filter((e) => !e.archivedAt);
  const byArea = new Map<string, AreaSlice>();
  for (const e of live) {
    const area = e.area?.trim() || "Not said";
    const slice = byArea.get(area.toLowerCase()) ?? { area, count: 0, levels: {}, best: null };
    slice.count += 1;
    slice.levels[e.level] = (slice.levels[e.level] ?? 0) + 1;
    if (!slice.best || LEVEL_RANK[e.level] > LEVEL_RANK[slice.best as never]) slice.best = e.level;
    byArea.set(area.toLowerCase(), slice);
  }
  return [...byArea.values()].sort((a, b) => b.count - a.count || a.area.localeCompare(b.area));
}

/**
 * Does the shape of your experience match the shape of the role?
 *
 * Both sides are counted in requirements and evidence rather than in areas,
 * because a job description does not come tagged. What it can say, and what is
 * worth saying, is where the weight of a portfolio sits when a role's weight
 * sits elsewhere.
 */
export function areaAdvice(mix: AreaSlice[]): string {
  const total = mix.reduce((n, s) => n + s.count, 0);
  if (!total) return "";
  const named = mix.filter((s) => s.area !== "Not said");
  const untagged = mix.find((s) => s.area === "Not said");
  if (untagged && untagged.count / total > 0.5)
    return "Most of your evidence has no practice area on it. Adding one makes this readable.";
  const top = named[0];
  if (!top) return "";
  const share = Math.round((top.count / total) * 100);
  if (share >= 60)
    return `${share}% of your evidence is ${top.area.toLowerCase()}. That is a specialism — worth saying so in the roles you keep.`;
  return `Your evidence spreads across ${named.length} areas, widest in ${top.area.toLowerCase()}.`;
}

/** The statuses, in the order a reader should meet them. */
export const STATUS_SEQUENCE: ProgressionStatus[] = ["strong", "evidenced", "developing", "none"];

export const statusLabel = (s: ProgressionStatus) => STATUS_LABEL[s];
