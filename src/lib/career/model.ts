/**
 * What a role asks of you, what you can prove, and the distance between them.
 *
 * Everything here is a pure function of evidence. Nothing is stored, nothing
 * is scored by a model, and no assessment is reached that cannot say what it
 * rests on — because the only useful answer to "am I ready for this role" is
 * one a lawyer can check, argue with, and take to a supervisor.
 *
 * THE ARGUMENT THE RUBRIC MAKES
 *
 * A claim is not evidence. A lawyer writing "I know how to draft a share
 * purchase agreement" has told you something worth knowing — it may be
 * perfectly true — but it is not the same fact as having drafted one, and an
 * assessment that cannot tell the two apart is worth nothing to the person
 * relying on it. So a statement with nothing behind it is read as context: it
 * can lift a requirement off the floor, and it can never carry it home.
 *
 * What does carry it home is work: a matter, a document, a deliverable, a
 * task somebody else can look at. On top of that the reading asks the
 * questions a supervisor asks — how far in were you, how hard was it, how
 * recently, and how many times — because "assisted once, three years ago" and
 * "led it twice this year" are different answers to the same requirement.
 */

export type CareerRoleKind = "jd" | "role_profile" | "framework";

export const ROLE_KIND_LABEL: Record<CareerRoleKind, string> = {
  jd: "Job description",
  role_profile: "Role profile",
  framework: "Competency framework",
};

export type CriterionKind =
  "responsibility" | "skill" | "competency" | "qualification" | "experience";

export const CRITERION_KINDS: CriterionKind[] = [
  "responsibility",
  "skill",
  "competency",
  "qualification",
  "experience",
];

export const CRITERION_KIND_LABEL: Record<CriterionKind, string> = {
  responsibility: "Responsibility",
  skill: "Skill",
  competency: "Competency",
  qualification: "Qualification",
  experience: "Experience",
};

/**
 * How far into the work you were.
 *
 * The ladder the brief is built on, and the lawyer's own answer rather than
 * something inferred: nothing in a database knows whether you led a deal or
 * carried the bundle. "Repeated / demonstrated capability" is not a sixth rung
 * here, because repetition is a property of how often you did a thing, not of
 * how deeply you did it — it is carried by `repetition` and read together with
 * this.
 */
export type EvidenceLevel = "exposure" | "assisted" | "performed" | "independent" | "led";

export const LEVELS: EvidenceLevel[] = ["exposure", "assisted", "performed", "independent", "led"];

export const LEVEL_LABEL: Record<EvidenceLevel, string> = {
  exposure: "Exposure",
  assisted: "Assisted",
  performed: "Performed",
  independent: "Independently performed",
  led: "Led / owned",
};

export const LEVEL_MEANING: Record<EvidenceLevel, string> = {
  exposure: "You saw it done, or sat in on it.",
  assisted: "You did part of it, supervised.",
  performed: "You did it, with your work reviewed.",
  independent: "You did it on your own judgement.",
  led: "You owned it — the decisions and the outcome were yours.",
};

export const LEVEL_RANK: Record<EvidenceLevel, number> = {
  exposure: 1,
  assisted: 2,
  performed: 3,
  independent: 4,
  led: 5,
};

export type Repetition = "once" | "several" | "routine";

export const REPETITION_LABEL: Record<Repetition, string> = {
  once: "Once",
  several: "Several times",
  routine: "Routine part of my work",
};

export type Complexity = "routine" | "standard" | "complex";

export const COMPLEXITY_LABEL: Record<Complexity, string> = {
  routine: "Routine",
  standard: "Standard",
  complex: "Complex or novel",
};

export type EvidenceKind =
  | "work"
  | "matter"
  | "responsibility"
  | "research"
  | "advice"
  | "achievement"
  | "training"
  | "feedback"
  | "statement"
  | "other";

export const EVIDENCE_KINDS: EvidenceKind[] = [
  "work",
  "matter",
  "responsibility",
  "research",
  "advice",
  "achievement",
  "training",
  "feedback",
  "statement",
  "other",
];

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  work: "Document or work product",
  matter: "Matter or transaction",
  responsibility: "Responsibility undertaken",
  research: "Research or analysis",
  advice: "Advice or presentation delivered",
  achievement: "Achievement or outcome",
  training: "Training or qualification",
  feedback: "Feedback or recognition",
  statement: "Written statement",
  other: "Other",
};

/** What a piece of evidence points at in Scripta. `source_kind` in the database. */
export type EvidenceLink = {
  id: string;
  kind: string;
  refId: string;
  label: string;
};

export type Evidence = {
  id: string;
  title: string;
  kind: EvidenceKind;
  statement: string;
  outcome: string;
  level: EvidenceLevel;
  repetition: Repetition;
  complexity: Complexity;
  /** The practice area it sits in, in the lawyer's own words. */
  area: string;
  happenedOn: string | null;
  throughTo: string | null;
  /** A person who saw the work and would say so. */
  corroboratedBy: string;
  fileRef: string | null;
  fileName: string | null;
  links: EvidenceLink[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type Criterion = {
  id: string;
  roleId: string;
  kind: CriterionKind;
  section: string;
  text: string;
  note: string;
  essential: boolean;
  sortOrder: number;
};

export type CareerRole = {
  id: string;
  title: string;
  organisation: string;
  kind: CareerRoleKind;
  sourceText: string;
  fileRef: string | null;
  fileName: string | null;
  note: string;
  targetOn: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

/**
 * Evidence claimed against a criterion, with the lawyer's note about why.
 *
 * `createdAt` is what makes the trajectory possible: the day a claim was made
 * is the day that requirement started being carried, so the record can be
 * replayed rather than having a history stored beside it.
 */
export type Claim = {
  id: string;
  criterionId: string;
  evidenceId: string;
  note: string;
  createdAt: string;
};

/* ------------------------------------------------------------ corroboration */

/**
 * Is there anything behind this but the writing?
 *
 * Work Scripta holds, a file, or a person who would vouch for it. A statement
 * with none of those is `claimed`: it still says something, and it is not
 * treated as if somebody else had confirmed it.
 */
export type Corroboration = "claimed" | "supported";

export const corroborationOf = (e: Evidence): Corroboration =>
  e.links.length > 0 || !!e.fileRef || e.corroboratedBy.trim().length > 0 ? "supported" : "claimed";

/* ------------------------------------------------------------------ recency */

export type Recency = "current" | "recent" | "historic" | "undated";

const MONTH = 30.44 * 24 * 60 * 60 * 1000;

/** When the work happened, read against today. Undated evidence is not punished, only noted. */
export function recencyOf(e: Evidence, today: Date = new Date()): Recency {
  const when = e.throughTo || e.happenedOn;
  if (!when) return "undated";
  const at = new Date(`${when}T00:00:00`);
  if (Number.isNaN(at.getTime())) return "undated";
  const months = (today.getTime() - at.getTime()) / MONTH;
  if (months <= 18) return "current";
  if (months <= 48) return "recent";
  return "historic";
}

/** A date the way it is written rather than the way it is stored. */
export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
};

export const RECENCY_LABEL: Record<Recency, string> = {
  current: "Current",
  recent: "Recent",
  historic: "Some years ago",
  undated: "Undated",
};

/* --------------------------------------------------------------- assessment */

export type ProgressionStatus = "none" | "developing" | "evidenced" | "strong";

export const STATUS_LABEL: Record<ProgressionStatus, string> = {
  none: "Not evidenced",
  developing: "Developing",
  evidenced: "Evidenced",
  strong: "Strongly evidenced",
};

export const STATUS_ORDER: ProgressionStatus[] = ["none", "developing", "evidenced", "strong"];

export type Assessment = {
  criterionId: string;
  status: ProgressionStatus;
  /** Every sentence the assessment rests on, in the order it was reasoned. */
  because: string[];
  /** The evidence that carried it, strongest first. */
  supporting: string[];
  /** Evidence that was read but did not carry weight, and why. */
  discounted: { evidenceId: string; why: string }[];
  /** What is missing, said plainly. Empty once the requirement is carried. */
  gap: string;
  /** The best level reached by supported evidence, if any. */
  bestLevel: EvidenceLevel | null;
};

const strongest = (list: Evidence[]) =>
  [...list].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0] ?? null;

const describe = (e: Evidence, today: Date) =>
  `${LEVEL_LABEL[e.level].toLowerCase()} · ${REPETITION_LABEL[e.repetition].toLowerCase()} · ${RECENCY_LABEL[
    recencyOf(e, today)
  ].toLowerCase()}`;

/**
 * Read one requirement against the evidence claimed for it.
 *
 * The order of the reasoning is the order a supervisor would use: is there
 * anything here at all; is any of it more than an assertion; how far in was
 * this person; did they do it more than once; and was it recent enough to
 * still say something about them.
 */
export function assess(
  criterion: Criterion,
  claimed: Evidence[],
  today: Date = new Date(),
): Assessment {
  const live = claimed.filter((e) => !e.archivedAt);
  const because: string[] = [];
  const discounted: { evidenceId: string; why: string }[] = [];

  if (live.length === 0)
    return {
      criterionId: criterion.id,
      status: "none",
      because: ["Nothing has been claimed against this requirement yet."],
      supporting: [],
      discounted: [],
      gap: "No evidence has been attached to this requirement.",
      bestLevel: null,
    };

  const supported = live.filter((e) => corroborationOf(e) === "supported");
  const claimsOnly = live.filter((e) => corroborationOf(e) === "claimed");

  for (const e of claimsOnly)
    discounted.push({
      evidenceId: e.id,
      why: "A written statement with no work, file or person behind it. It is read as context, not as proof.",
    });

  /* Nothing but assertions. It counts for something — the lawyer is telling
     you they have done this — and it cannot reach Evidenced on its own. */
  if (supported.length === 0) {
    const best = strongest(claimsOnly)!;
    const performed = LEVEL_RANK[best.level] >= LEVEL_RANK.performed;
    because.push(
      `${claimsOnly.length} written ${claimsOnly.length === 1 ? "statement" : "statements"}, with nothing attached to corroborate ${claimsOnly.length === 1 ? "it" : "them"}.`,
    );
    return {
      criterionId: criterion.id,
      status: performed ? "developing" : "none",
      because,
      supporting: [],
      discounted,
      gap: performed
        ? "This rests on your own account alone. Attach the matter, the document or the deliverable it refers to, or name somebody who saw the work."
        : "The statement describes exposure rather than doing the work, and nothing is attached to it.",
      bestLevel: null,
    };
  }

  const best = strongest(supported)!;
  const bestRank = LEVEL_RANK[best.level];
  const recency = recencyOf(best, today);
  const repeated =
    best.repetition !== "once" ||
    supported.filter((e) => LEVEL_RANK[e.level] >= LEVEL_RANK.performed).length >= 2;
  const complexSupport = supported.some((e) => e.complexity === "complex");

  because.push(
    `${supported.length} corroborated ${supported.length === 1 ? "piece" : "pieces"} of evidence; the strongest is “${best.title}” (${describe(best, today)}).`,
  );
  if (repeated)
    because.push(
      best.repetition !== "once"
        ? `Done ${REPETITION_LABEL[best.repetition].toLowerCase()}, so it reads as a capability rather than a single occasion.`
        : "More than one separate piece of evidence reaches this level.",
    );
  if (complexSupport) because.push("At least one piece was complex or novel work.");
  if (claimsOnly.length)
    because.push(
      `${claimsOnly.length} further ${claimsOnly.length === 1 ? "statement" : "statements"} ${claimsOnly.length === 1 ? "was" : "were"} read as context only.`,
    );

  let status: ProgressionStatus;
  let gap = "";

  if (bestRank <= LEVEL_RANK.assisted) {
    status = "developing";
    gap = `You have ${LEVEL_LABEL[best.level].toLowerCase()} on this. What is missing is doing it yourself: the same work with your name on the output.`;
  } else if (bestRank >= LEVEL_RANK.independent && repeated && recency !== "historic") {
    status = "strong";
  } else if (recency === "historic") {
    status = "evidenced";
    because.push("The strongest evidence is some years old, which holds it short of strong.");
    gap = "Recent work would carry this further; the strongest evidence here is some years old.";
  } else if (bestRank >= LEVEL_RANK.independent) {
    status = "evidenced";
    gap =
      "Done once at this level. Doing it again would make it a demonstrated capability rather than a single instance.";
  } else {
    status = "evidenced";
    gap = "Performed with review. Running one without supervision would take this further.";
  }

  return {
    criterionId: criterion.id,
    status,
    because,
    supporting: [...supported]
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])
      .map((e) => e.id),
    discounted,
    gap,
    bestLevel: best.level,
  };
}

/* ------------------------------------------------------- what to do about it */

/**
 * The next piece of experience worth seeking.
 *
 * Written as the next step from where the evidence actually stands rather than
 * as a restatement of the requirement, because "get more experience in X" is
 * advice nobody needed to be given.
 */
export function nextExperience(criterion: Criterion, a: Assessment): string {
  const subject = criterion.text.replace(/\.$/, "");
  if (criterion.kind === "qualification" && a.status !== "strong")
    return a.status === "none"
      ? `Record the qualification itself, or the step you are at towards it, and attach the certificate or enrolment.`
      : `Attach the certificate or a letter confirming it, so this stops resting on your own account.`;

  switch (a.status) {
    case "none":
      return `Look for one piece of work that touches ${subject.toLowerCase()} — even assisting on it — and record it here with what you did and what came of it.`;
    case "developing":
      return a.bestLevel === null
        ? `Attach the work behind what you have written: the matter, the document or the deliverable, or the name of somebody who saw it.`
        : `Ask to take the next step: do the work yourself with review rather than assisting on it, and keep what you produce.`;
    case "evidenced":
      return a.bestLevel && LEVEL_RANK[a.bestLevel] >= LEVEL_RANK.independent
        ? `Seek a second, ideally more complex, instance so this reads as a capability rather than one occasion.`
        : `Ask to run one of these without supervision, and record the outcome and who reviewed it.`;
    case "strong":
      return `Well covered. Supervising somebody else through it, or a more complex instance, is what would add to this now.`;
  }
}

/* ----------------------------------------------------------------- roll-ups */

export type RoleReading = {
  assessments: Assessment[];
  byStatus: Record<ProgressionStatus, Assessment[]>;
  /**
   * A secondary indicator only, and deliberately conservative: the share of
   * essential requirements carried. It is never the headline, because a role
   * is not a percentage and a lawyer reading one number learns nothing about
   * which requirement to work on next.
   */
  essentialCarried: number;
  essentialTotal: number;
};

export function readRole(
  criteria: Criterion[],
  claimsByCriterion: Map<string, Evidence[]>,
  today: Date = new Date(),
): RoleReading {
  const assessments = criteria.map((c) => assess(c, claimsByCriterion.get(c.id) ?? [], today));
  const byStatus: Record<ProgressionStatus, Assessment[]> = {
    none: [],
    developing: [],
    evidenced: [],
    strong: [],
  };
  for (const a of assessments) byStatus[a.status].push(a);
  const essential = criteria.filter((c) => c.essential);
  const carried = essential.filter((c) => {
    const a = assessments.find((x) => x.criterionId === c.id);
    return a?.status === "evidenced" || a?.status === "strong";
  });
  return {
    assessments,
    byStatus,
    essentialCarried: carried.length,
    essentialTotal: essential.length,
  };
}

/** One sentence on where a role stands, in words rather than a score. */
export function roleSummary(reading: RoleReading): string {
  const { byStatus, essentialCarried, essentialTotal } = reading;
  const total = reading.assessments.length;
  if (!total) return "No requirements have been recorded for this role yet.";
  if (!essentialTotal)
    return `${byStatus.strong.length + byStatus.evidenced.length} of ${total} requirements are evidenced.`;
  return `${essentialCarried} of ${essentialTotal} essential requirements are evidenced${
    byStatus.strong.length ? `, ${byStatus.strong.length} strongly` : ""
  }. ${byStatus.none.length} ${byStatus.none.length === 1 ? "has" : "have"} nothing against ${byStatus.none.length === 1 ? "it" : "them"} yet.`;
}

/** Where one piece of evidence is doing work: which criteria, across which roles. */
export function evidenceReach(
  evidenceId: string,
  claims: Claim[],
  criteria: Criterion[],
): { criterionIds: string[]; roleIds: string[] } {
  const criterionIds = claims.filter((c) => c.evidenceId === evidenceId).map((c) => c.criterionId);
  const roleIds = [
    ...new Set(
      criterionIds
        .map((id) => criteria.find((c) => c.id === id)?.roleId)
        .filter((v): v is string => !!v),
    ),
  ];
  return { criterionIds, roleIds };
}
