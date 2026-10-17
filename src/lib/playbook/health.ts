/**
 * Whether a playbook is complete enough to be worth applying.
 *
 * Not a score and not a percentage: a playbook with four positions can be
 * finished, and one with forty can be useless. What a lawyer wants to know is
 * where the institutional knowledge is still missing — which positions have no
 * fallback, which have no approved wording, which nobody has revisited — so
 * this counts those and says them plainly.
 */

export type PlaybookRuleLike = {
  id: string;
  topic: string | null;
  preferred: string | null;
  acceptable: string | null;
  fallback: string | null;
  escalate: string | null;
  redflag: string | null;
  approved_clause_text: string | null;
  approval_threshold: string | null;
};

export type PlaybookHealth = {
  positions: number;
  withPreferred: number;
  withFallback: number;
  withLanguage: number;
  withEscalation: number;
  /** Positions carrying nothing but a name. */
  empty: number;
  /** What is missing, in the lawyer's words. Most pressing first. */
  prompts: { key: string; text: string; ids: string[] }[];
};

const has = (value: string | null | undefined) => !!value && value.trim().length > 0;

export function playbookHealth(rules: PlaybookRuleLike[]): PlaybookHealth {
  const named = (rule: PlaybookRuleLike) => rule.topic?.trim() || "An untitled position";
  const withPreferred = rules.filter((r) => has(r.preferred));
  const withFallback = rules.filter((r) => has(r.fallback) || has(r.acceptable));
  const withLanguage = rules.filter((r) => has(r.approved_clause_text));
  const withEscalation = rules.filter((r) => has(r.escalate) || has(r.approval_threshold));
  const empty = rules.filter(
    (r) =>
      !has(r.preferred) &&
      !has(r.acceptable) &&
      !has(r.fallback) &&
      !has(r.redflag) &&
      !has(r.escalate) &&
      !has(r.approved_clause_text),
  );

  const prompts: PlaybookHealth["prompts"] = [];
  const say = (key: string, rows: PlaybookRuleLike[], text: (n: number) => string) => {
    if (!rows.length) return;
    prompts.push({ key, text: text(rows.length), ids: rows.map((r) => r.id) });
  };

  // A position with nothing in it is worse than no position: the review is told
  // there is guidance and finds none.
  say("empty", empty, (n) =>
    n === 1
      ? `${named(empty[0]!)} has a name and nothing else. Say where you stand, or remove it.`
      : `${n} positions have a name and nothing else. Say where you stand on them, or remove them.`,
  );
  say(
    "preferred",
    rules.filter((r) => !has(r.preferred) && !empty.includes(r)),
    (n) => `${n} position${n === 1 ? " has" : "s have"} no preferred position — the one you open with.`,
  );
  say(
    "fallback",
    rules.filter((r) => has(r.preferred) && !has(r.fallback) && !has(r.acceptable)),
    (n) =>
      `${n} position${n === 1 ? " has" : "s have"} no fallback guidance, so a negotiator has nowhere to go after the first refusal.`,
  );
  say(
    "escalation",
    rules.filter((r) => has(r.redflag) && !has(r.escalate) && !has(r.approval_threshold)),
    (n) =>
      `${n} position${n === 1 ? " treats" : "s treat"} something as unacceptable without saying who could approve it anyway.`,
  );
  say(
    "language",
    rules.filter((r) => has(r.preferred) && !has(r.approved_clause_text)),
    (n) =>
      `${n} position${n === 1 ? " has" : "s have"} no approved wording, so Scripta can state the position but cannot draft it.`,
  );

  return {
    positions: rules.length,
    withPreferred: withPreferred.length,
    withFallback: withFallback.length,
    withLanguage: withLanguage.length,
    withEscalation: withEscalation.length,
    empty: empty.length,
    prompts,
  };
}

/** "Not reviewed since 12 March", or nothing if it never was. */
export function reviewAge(lastReviewedAt: string | null, today = new Date()): string | null {
  if (!lastReviewedAt) return "This playbook has never been marked as reviewed.";
  const when = new Date(lastReviewedAt);
  if (Number.isNaN(when.getTime())) return null;
  const days = Math.floor((today.getTime() - when.getTime()) / 86_400_000);
  if (days < 90) return null;
  const months = Math.floor(days / 30);
  return months >= 12
    ? "This playbook has not been reviewed for over a year."
    : `This playbook has not been reviewed for ${months} months.`;
}
