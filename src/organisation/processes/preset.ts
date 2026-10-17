/**
 * A client's process, as something Scripta can run.
 *
 * Publishing turns the steps into a flow preset — the same phase and
 * deliverable shape every flow uses — so the next run of the process opens as
 * a flow with these steps as its phases rather than a blank page. Nothing in
 * this file writes; it builds and matches, and the screen decides.
 */
import type { ActionType } from "@/matter-flow/model";
import type { PresetBody, PresetDeliverable, PresetPhase } from "@/matter-flow/presets/model";
import { uid } from "@/matter-flow/model";
import {
  bandLabel,
  currentRoles,
  partiesFor,
  type AuthorityRule,
  type Organisation,
  type ProcessStep,
  type Role,
} from "../model";

/** When a step gives no duration, it still needs a place on the timeline. */
export const DEFAULT_STEP_DAYS = 1;

/**
 * The flow action a step most plausibly is. Flow's action types describe how
 * the work is done (a filing, a payment, a meeting…). A step that names none of
 * them is most often something people sit down and do together — agree a
 * price, review a draft — so "meeting" is the nearest honest default; it is
 * not a claim that a meeting was scheduled, and the flow lets it be changed.
 */
export function actionTypeFor(step: Pick<ProcessStep, "title" | "detail">): ActionType {
  const text = `${step.title} ${step.detail}`.toLowerCase();
  if (
    /\b(file|filing|lodge|lodgement|submit|declaration|return|register|registration)\b/.test(text)
  )
    return "filing";
  if (/\b(pay|payment|remit|invoice|fee|transfer)\b/.test(text)) return "payment";
  if (/\b(email|e-mail|send|notify|circulate)\b/.test(text)) return "email";
  if (/\b(call|phone|telephone)\b/.test(text)) return "call";
  if (/\b(visit|inspect|inspection|site|on-site)\b/.test(text)) return "visit";
  if (/\b(wait|await|awaiting)\b/.test(text)) return "waiting";
  return "meeting";
}

/**
 * The preset body for a process. Each step is a phase with one action owed by
 * the step's role; deadlines run on in working days, one step after another.
 */
export function presetBodyFromSteps(org: Organisation, steps: ProcessStep[]): PresetBody {
  const roles = new Map(org.roles.map((r) => [r.id, r]));
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const phases: PresetPhase[] = [];
  const deliverables: PresetDeliverable[] = [];
  let elapsed = 0;
  ordered.forEach((step, index) => {
    const start = elapsed;
    elapsed += Math.max(0, step.durationDays ?? DEFAULT_STEP_DAYS);
    const phaseId = uid("pp");
    const source = [step.sourceSection, step.sourcePage ? `page ${step.sourcePage}` : ""]
      .filter(Boolean)
      .join(", ");
    phases.push({
      id: phaseId,
      name: step.title,
      description: step.detail,
      steps: [],
      note: source ? `From ${source} of the source document.` : "",
      dueOffset: elapsed,
      order: index + 1,
    });
    deliverables.push({
      id: uid("pd"),
      phaseId,
      kind: "action",
      name: step.title,
      type: actionTypeFor(step),
      description: step.detail,
      note: "",
      ownerRole: (step.ownerRoleId && roles.get(step.ownerRoleId)?.title) || "",
      startOffset: start,
      dueOffset: elapsed,
      mandatory: true,
      expected: [],
    });
  });
  return { version: 1, kind: "action", phases, deliverables, parties: [] };
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

const STOP = new Set([
  "the",
  "and",
  "for",
  "head",
  "lead",
  "team",
  "officer",
  "manager",
  "department",
  "of",
]);

/**
 * The role a document's owner hint names, if one plainly does. An exact title
 * wins; otherwise every significant word of the hint must appear in the role's
 * title or function ("Compliance" → the Compliance head). Ambiguity is not
 * resolved by guessing: two equally good roles return null.
 */
export function matchOwnerRole(org: Organisation, hint: string): Role | null {
  const h = hint.trim().toLowerCase();
  if (!h) return null;
  const roles = currentRoles(org);
  const exact = roles.filter((r) => r.title.trim().toLowerCase() === h);
  if (exact.length === 1) return exact[0]!;
  const wanted = words(hint);
  if (!wanted.length) return null;
  const scored = roles
    .map((r) => {
      const have = new Set(words(`${r.title} ${r.functionName}`));
      const hits = wanted.filter((w) => have.has(w)).length;
      return { r, hits, all: hits === wanted.length };
    })
    .filter((x) => x.all)
    // Prefer the head of a function over a role inside it.
    .sort((a, b) => kindRank(a.r) - kindRank(b.r));
  if (!scored.length) return null;
  if (scored.length > 1 && kindRank(scored[0]!.r) === kindRank(scored[1]!.r)) return null;
  return scored[0]!.r;
}

const kindRank = (r: Role) => (r.kind === "leadership" ? 1 : r.kind === "head" ? 0 : 2);

/** Steps that decide money or commitments, where the authority matrix is the answer. */
export const needsAuthority = (step: Pick<ProcessStep, "title" | "detail">) =>
  /\b(approv\w*|authoris\w*|authoriz\w*|sign\w*|payment|pay|sanction)\b/i.test(
    `${step.title} ${step.detail}`,
  );

/**
 * The authority rules a step's words point at: a rule matches when every word
 * of its matter type appears in the step ("Bank payment" in "Payment approval
 * for the bank transfer"). Returned with a readable band.
 */
export function rulesForStep(org: Organisation, step: Pick<ProcessStep, "title" | "detail">) {
  const have = new Set(words(`${step.title} ${step.detail}`).map(stem));
  return org.rules
    .filter((rule) => {
      const want = words(rule.matterType).map(stem);
      return want.length > 0 && want.every((w) => have.has(w));
    })
    .map((rule) => ({ rule, summary: ruleSummary(org, rule) }));
}

const stem = (w: string) => w.replace(/(ments?|ing|als?|s)$/, "");

function ruleSummary(org: Organisation, rule: AuthorityRule) {
  const roleTitle = (id: string | null) => org.roles.find((r) => r.id === id)?.title ?? "";
  const who = (step: "approve" | "sign") =>
    partiesFor(org, rule.id, step)
      .map((p) =>
        p.roleId
          ? roleTitle(p.roleId)
          : p.capacity
            ? `${p.count} ${p.capacity}${p.count > 1 ? "s" : ""}`
            : p.body === "board"
              ? "Board resolution"
              : (p.body ?? ""),
      )
      .filter(Boolean)
      .join(" + ");
  return [
    `${rule.matterType} ${bandLabel(rule)}`,
    who("approve") ? `approves: ${who("approve")}` : "",
    who("sign") ? `signs: ${who("sign")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** What still stands between a draft and a runnable process. */
export function publishChecklist(
  org: Organisation,
  processSourceId: string | null,
  steps: ProcessStep[],
) {
  const unowned = steps.filter((s) => !s.ownerRoleId);
  return [
    {
      key: "steps",
      done: steps.length > 0,
      title: "Steps set out",
      detail: steps.length ? `${steps.length} steps in order` : "Add the first step",
    },
    {
      key: "owners",
      done: steps.length > 0 && unowned.length === 0,
      title: unowned.length
        ? `Name an owner for ${unowned.length} step${unowned.length === 1 ? "" : "s"}`
        : "Every step has an owner",
      detail: "Roles, not people, so a leaver doesn't break it",
    },
    {
      key: "source",
      done: !!processSourceId && org.documents.some((d) => d.id === processSourceId),
      title: "Source document attached",
      detail: "The procedure the steps were read from",
    },
    {
      key: "runnable",
      done: steps.length > 0,
      title: "Make it runnable",
      detail: "Publishes as a flow preset; each run opens as a flow with these steps as phases",
    },
  ];
}
