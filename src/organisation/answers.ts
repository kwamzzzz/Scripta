/**
 * Answers to the questions a lawyer is asked about a client, read straight
 * from the organisation's records.
 *
 * These are deliberately not a model call. "Who signs a GHS 400,000 supply
 * contract?" has one right answer in the delegation of authority, and it must
 * not depend on how a paragraph happened to be retrieved. Every answer comes
 * back as labelled sections, the records it rests on, and the gaps: what the
 * records do not say. An answer that has to guess says it is a recommendation.
 */
import {
  bandLabel,
  byId,
  CAPACITY_LABEL,
  currentAppointments,
  currentRoles,
  daysBetween,
  entityLabel,
  entityStanding,
  formatDay,
  holderLabel,
  holdingsBy,
  licenceStatus,
  liveEntities,
  localDay,
  matchRule,
  occurrencesBetween,
  overdueOccurrences,
  ownedThrough,
  ownerLabel,
  partiesFor,
  percentLabel,
  personName,
  reportingChain,
  resolveParty,
  shareholdersOf,
  type AuthorityStep,
  type Capacity,
  type Day,
  type Organisation,
  type Role,
} from "./model";

export type CitationType =
  | "entity"
  | "person"
  | "role"
  | "licence"
  | "obligation"
  | "rule"
  | "instrument"
  | "holding"
  | "appointment"
  | "responsibility"
  | "process";

export type Citation = { recordType: CitationType; recordId: string; label: string };

export type AnswerSection = { label: string; text: string };

export type Answer = {
  question: string;
  sections: AnswerSection[];
  citations: Citation[];
  gaps: string[];
  /** Records: read from what is recorded. Inference: a ranked recommendation. */
  basis: "records" | "inference";
};

/** Collects citations once each, in the order they were first relied on. */
class Cite {
  private seen = new Map<string, Citation>();
  add(recordType: CitationType, recordId: string | null | undefined, label: string) {
    if (!recordId) return;
    const key = `${recordType}:${recordId}`;
    if (!this.seen.has(key)) this.seen.set(key, { recordType, recordId, label });
  }
  get list() {
    return [...this.seen.values()];
  }
}

const joinNames = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "our",
  "new",
  "who",
  "which",
  "what",
  "should",
  "contract",
  "agreement",
  "entity",
  "company",
  "sign",
  "signing",
  "enter",
  "are",
  "was",
  "will",
  "its",
  "their",
  "about",
  "under",
  "over",
  "between",
  "per",
  "any",
  "all",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "by",
  "we",
  "is",
  "be",
  "ltd",
  "limited",
  "llc",
  "plc",
  "group",
]);

/** Words worth matching: lower case, stripped, at least three letters, no filler. */
export const keywords = (text: string): string[] => {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)];
};

/** A word matches its stem: "exporting" and "export", "minerals" and "mineral". */
const stem = (w: string) => w.replace(/(ing|ers|er|es|s|ed)$/, "");

const overlap = (terms: string[], text: string): string[] => {
  const hay = new Set(keywords(text).map(stem));
  return terms.filter((t) => hay.has(stem(t)));
};

/* ------------------------------------------------------------- who signs */

const STEP_LABEL: Record<AuthorityStep, string> = {
  recommend: "RECOMMENDS",
  approve: "APPROVES",
  sign: "SIGNS",
};

export function whoSigns(
  org: Organisation,
  q: { matterType: string; amount: number | null; entityId: string | null },
  today: Day = localDay(),
): Answer {
  const cite = new Cite();
  const entity = org.entities.find((e) => e.id === q.entityId) ?? null;
  const rule = matchRule(org, {
    matterType: q.matterType,
    amount: q.amount,
    entityId: q.entityId,
    on: today,
  });
  const question = `Who signs a ${q.matterType.toLowerCase()}${q.amount !== null ? ` of ${q.amount.toLocaleString("en-GB")}` : ""}${entity ? ` for ${entityLabel(entity)}` : ""}?`;
  if (entity) cite.add("entity", entity.id, entityLabel(entity));

  if (!rule) {
    const sameType = org.rules.filter(
      (r) => r.matterType.trim().toLowerCase() === q.matterType.trim().toLowerCase(),
    );
    return {
      question,
      basis: "records",
      sections: [
        {
          label: "SIGNING",
          text: sameType.length
            ? `No rule in force covers this. The recorded rules for ${q.matterType} cover: ${sameType
                .map(
                  (r) =>
                    `${bandLabel(r)}${r.entityId ? ` (${entityLabel(org.entities.find((e) => e.id === r.entityId))} only)` : ""}`,
                )
                .join("; ")}.`
            : `The records hold no authority rule for ${q.matterType}.`,
        },
      ],
      citations: cite.list,
      gaps: [
        q.amount === null && sameType.some((r) => r.minAmount !== null || r.maxAmount !== null)
          ? "Give the value: the rules for this matter type depend on it."
          : `Record who approves and signs ${q.matterType} in Authority & approvals.`,
      ],
    };
  }

  const instrument = org.instruments.find((i) => i.id === rule.instrumentId) ?? null;
  cite.add("rule", rule.id, `Authority · ${rule.matterType} ${bandLabel(rule)}`);
  if (instrument) cite.add("instrument", instrument.id, instrument.title);

  const sections: AnswerSection[] = [
    {
      label: "RULE",
      text: `${rule.matterType}, ${bandLabel(rule)}${rule.entityId ? `, ${entityLabel(org.entities.find((e) => e.id === rule.entityId))} only` : ", every entity covered"}.`,
    },
  ];
  const gaps: string[] = [];
  for (const step of ["recommend", "approve", "sign"] as AuthorityStep[]) {
    const parties = partiesFor(org, rule.id, step);
    if (!parties.length) continue;
    const resolved = parties.map((p) => resolveParty(org, p, q.entityId, today));
    for (const r of resolved) {
      if (r.party.roleId) {
        const role = org.roles.find((x) => x.id === r.party.roleId);
        if (role) cite.add("role", role.id, role.title);
      }
      if (r.gap) gaps.push(r.gap);
    }
    sections.push({
      label: STEP_LABEL[step],
      text: resolved
        .map((r) => (r.people.length ? `${r.label} — ${joinNames(r.people)}` : r.label))
        .join(" + "),
    });
  }
  sections.push({
    label: "BASIS",
    text:
      rule.basis === "inferred"
        ? "Inferred: this position is not written in an instrument. Confirm it before relying on it."
        : instrument
          ? `Recorded in ${instrument.title}${instrument.approvedOn ? `, approved ${formatDay(instrument.approvedOn)}` : ""}${instrument.reference ? ` (${instrument.reference})` : ""}.`
          : "Recorded, but the instrument it comes from is not on file.",
  });
  if (rule.basis === "recorded" && !instrument)
    gaps.push("Link this rule to the instrument that records it.");
  if (instrument?.reviewDueOn && instrument.reviewDueOn < today)
    gaps.push(`${instrument.title} was due for review on ${formatDay(instrument.reviewDueOn)}.`);
  return { question, basis: "records", sections, citations: cite.list, gaps };
}

/* ------------------------------------------------------ which entity */

export function whichEntity(
  org: Organisation,
  description: string,
  today: Day = localDay(),
): Answer {
  const cite = new Cite();
  const terms = keywords(description);
  const question = `Which entity should contract: ${description.trim()}`;
  const candidates = liveEntities(org).filter(
    (e) => e.status !== "dissolved" && e.status !== "in_liquidation",
  );

  const scored = candidates
    .map((e) => {
      const reasons: string[] = [];
      let score = 0;
      const activity = overlap(terms, e.activity);
      if (activity.length) {
        score += activity.length * 3;
        reasons.push(`its recorded activity covers ${activity.join(", ")} (“${e.activity}”)`);
      }
      const name = overlap(terms, `${e.name} ${e.shortName}`);
      if (name.length) {
        score += name.length;
        reasons.push(`its name suggests ${name.join(", ")}`);
      }
      const licences = org.licences.filter((l) => l.entityId === e.id && !l.archivedAt);
      for (const l of licences) {
        const state = licenceStatus(l, today).state;
        const hit = overlap(terms, `${l.name} ${l.authority} ${l.conditions}`);
        if (!hit.length) continue;
        if (state === "expired" || state === "lapsed_lodged") {
          reasons.push(`it holds the ${l.name}, which has lapsed`);
          score += hit.length;
        } else {
          reasons.push(`it holds the ${l.name}`);
          score += hit.length * 2;
        }
      }
      if (e.status === "dormant") score -= 2;
      return { entity: e, score, reasons };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name));

  if (!scored.length) {
    for (const e of candidates) cite.add("entity", e.id, entityLabel(e));
    return {
      question,
      basis: "inference",
      sections: [
        {
          label: "ENTITY",
          text: candidates.length
            ? `Nothing recorded for ${joinNames(candidates.map(entityLabel))} matches this: no activity or licence mentions it.`
            : "No active entity is recorded for this client.",
        },
      ],
      citations: cite.list,
      gaps: ["Record each entity's activity and licences so this can be answered."],
    };
  }

  const best = scored[0]!;
  cite.add("entity", best.entity.id, entityLabel(best.entity));
  for (const l of org.licences.filter((x) => x.entityId === best.entity.id && !x.archivedAt))
    cite.add("licence", l.id, l.name);

  const sections: AnswerSection[] = [
    {
      label: "ENTITY",
      text: `${best.entity.name} is the closest match on the records: ${joinNames(best.reasons)}. This is a recommendation — confirm against its constitution before relying on it.`,
    },
  ];
  const others = scored.slice(1, 3);
  if (others.length)
    sections.push({
      label: "ALSO",
      text: others.map((o) => `${o.entity.name}: ${joinNames(o.reasons)}`).join(". ") + ".",
    });
  const unmatched = candidates.filter((c) => !scored.some((s) => s.entity.id === c.id));
  if (unmatched.length)
    sections.push({
      label: "NOT INDICATED",
      text: `${joinNames(unmatched.map(entityLabel))}: nothing recorded matches this.`,
    });
  const standing = entityStanding(org, best.entity.id, today);
  if (standing.reasons.length) {
    sections.push({
      label: "WATCH",
      text: `${standing.reasons.join("; ")}. A counterparty may ask about ${standing.reasons.length === 1 ? "this" : "these"}.`,
    });
    for (const x of overdueOccurrences(org, today).filter(
      (o) => o.obligation.entityId === best.entity.id,
    ))
      cite.add("obligation", x.obligation.id, x.obligation.title);
  }
  const gaps: string[] = [];
  if (!best.entity.activity) gaps.push(`${best.entity.name} has no recorded activity or objects.`);
  return { question, basis: "inference", sections, citations: cite.list, gaps };
}

/* ------------------------------------------------------- who handles */

export function whoHandles(org: Organisation, topic: string, today: Day = localDay()): Answer {
  const cite = new Cite();
  const terms = keywords(topic);
  const roles = byId(currentRoles(org, today));
  const holder = (roleId: string | null) => {
    const role = roleId ? roles.get(roleId) : undefined;
    if (!role) return null;
    const name = personName(org, role.holderPersonId);
    return {
      role,
      text: `${role.title} — ${name ? `${name}${role.acting ? " (acting)" : ""}` : "vacant"}`,
    };
  };
  const hits = org.responsibilities.filter((r) => overlap(terms, `${r.area} ${r.detail}`).length);
  const sections: AnswerSection[] = [];
  const gaps: string[] = [];
  for (const r of hits) {
    const owner = holder(r.roleId);
    const deputy = holder(r.deputyRoleId);
    if (owner) {
      cite.add("role", owner.role.id, owner.role.title);
      if (owner.role.holderPersonId)
        cite.add("person", owner.role.holderPersonId, personName(org, owner.role.holderPersonId));
    }
    sections.push({
      label: r.area.toUpperCase().slice(0, 28),
      text: `${owner?.text ?? "Role removed"}${deputy ? `; deputy ${deputy.text}` : "; no deputy"}.`,
    });
    if (!deputy) gaps.push(`${r.area} has no deputy.`);
    if (owner && !owner.role.holderPersonId) gaps.push(`${owner.role.title} is vacant.`);
  }
  if (!hits.length) {
    const byFunction = currentRoles(org, today).filter(
      (r) => overlap(terms, `${r.title} ${r.functionName}`).length,
    );
    for (const role of byFunction) {
      cite.add("role", role.id, role.title);
      const name = personName(org, role.holderPersonId);
      sections.push({
        label: "FUNCTION",
        text: `${role.title}${role.functionName ? ` (${role.functionName})` : ""} — ${name || "vacant"}.`,
      });
    }
    if (!byFunction.length) gaps.push(`No responsibility or role mentions ${topic.trim()}.`);
    else gaps.push("No responsibility is recorded for this; the answer comes from role titles.");
  }
  return {
    question: `Who handles ${topic.trim()}?`,
    basis: hits.length ? "records" : "inference",
    sections,
    citations: cite.list,
    gaps,
  };
}

/* ------------------------------------------------------ licence expiry */

export function licenceExpiry(
  org: Organisation,
  q: { entityId?: string | null; query?: string },
  today: Day = localDay(),
): Answer {
  const cite = new Cite();
  const terms = q.query ? keywords(q.query) : [];
  const entities = byId(org.entities);
  const rows = org.licences
    .filter((l) => !l.archivedAt)
    .filter((l) => !q.entityId || l.entityId === q.entityId)
    .filter(
      (l) => !terms.length || overlap(terms, `${l.name} ${l.authority} ${l.reference}`).length,
    )
    .sort((a, b) => (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999"));
  const entity = q.entityId ? entities.get(q.entityId) : undefined;
  if (entity) cite.add("entity", entity.id, entityLabel(entity));
  const gaps: string[] = [];
  const sections = rows.map((l) => {
    cite.add("licence", l.id, l.name);
    const s = licenceStatus(l, today);
    const holderName = entityLabel(entities.get(l.entityId ?? ""));
    const owner = ownerLabel(org, l);
    if (!l.verified) gaps.push(`${l.name} is unverified: no document backs it.`);
    const when =
      s.state === "no_expiry"
        ? "no expiry recorded"
        : s.state === "expired" || s.state === "lapsed_lodged"
          ? `expired ${formatDay(l.expiresOn)}${l.renewalState === "lodged" ? ", renewal lodged and not yet issued" : ""}`
          : `expires ${formatDay(l.expiresOn)} (${s.daysLeft} days)${s.state === "renewal_due" ? ", inside its renewal window" : ""}`;
    return {
      label: l.name.toUpperCase().slice(0, 28),
      text: `${holderName ? `${holderName}: ` : ""}${when}${owner ? `. Owner: ${owner}` : ""}.`,
    };
  });
  if (!rows.length) gaps.push("No licence on record matches.");
  return {
    question: `When does ${q.query?.trim() || (entity ? `${entityLabel(entity)}'s licence` : "each licence")} expire?`,
    basis: "records",
    sections,
    citations: cite.list,
    gaps,
  };
}

/* --------------------------------------------------------- due between */

export function dueBetween(org: Organisation, from: Day, to: Day, today: Day = localDay()): Answer {
  const cite = new Cite();
  const entities = byId(org.entities);
  const sections: AnswerSection[] = [];
  const overdue = overdueOccurrences(org, today);
  if (overdue.length) {
    for (const x of overdue) cite.add("obligation", x.obligation.id, x.obligation.title);
    sections.push({
      label: "OVERDUE",
      text: overdue
        .map(
          (x) =>
            `${x.obligation.title}${x.obligation.entityId ? ` (${entityLabel(entities.get(x.obligation.entityId))})` : ""}, due ${formatDay(x.dueOn)}`,
        )
        .join("; "),
    });
  }
  const due = occurrencesBetween(org, from, to, today).filter(
    (x) => x.state !== "done" && x.state !== "waived" && x.state !== "overdue",
  );
  for (const x of due) cite.add("obligation", x.obligation.id, x.obligation.title);
  if (due.length)
    sections.push({
      label: "DUE",
      text: due
        .map((x) => {
          const owner = ownerLabel(org, x.obligation);
          return `${formatDay(x.dueOn)} · ${x.obligation.title}${x.obligation.entityId ? ` (${entityLabel(entities.get(x.obligation.entityId))})` : ""}${owner ? ` — ${owner}` : ""}`;
        })
        .join("; "),
    });
  const expiring = org.licences.filter(
    (l) => !l.archivedAt && l.expiresOn && l.expiresOn >= from && l.expiresOn <= to,
  );
  for (const l of expiring) cite.add("licence", l.id, l.name);
  if (expiring.length)
    sections.push({
      label: "EXPIRES",
      text: expiring
        .map(
          (l) =>
            `${formatDay(l.expiresOn)} · ${l.name}${l.entityId ? ` (${entityLabel(entities.get(l.entityId))})` : ""}`,
        )
        .join("; "),
    });
  const done = occurrencesBetween(org, from, to, today).filter((x) => x.state === "done");
  if (done.length)
    sections.push({ label: "ALREADY DONE", text: done.map((x) => x.obligation.title).join("; ") });
  return {
    question: `What is due between ${formatDay(from)} and ${formatDay(to)}?`,
    basis: "records",
    sections,
    citations: cite.list,
    gaps: sections.length ? [] : ["Nothing is recorded as due in this period."],
  };
}

/* ---------------------------------------------------------- reports to */

const roleLine = (org: Organisation, r: Role) => {
  const name = personName(org, r.holderPersonId);
  return `${r.title} (${name || "vacant"})`;
};

export function reportsTo(
  org: Organisation,
  q: { roleId?: string | null; personId?: string | null },
): Answer {
  const cite = new Cite();
  const roles = q.roleId
    ? org.roles.filter((r) => r.id === q.roleId)
    : currentRoles(org).filter((r) => r.holderPersonId === q.personId);
  const subject = q.personId ? personName(org, q.personId) : (roles[0]?.title ?? "This role");
  if (q.personId) cite.add("person", q.personId, subject);
  const sections: AnswerSection[] = [];
  const gaps: string[] = [];
  for (const role of roles) {
    cite.add("role", role.id, role.title);
    const chain = reportingChain(org, role.id);
    for (const c of chain) cite.add("role", c.id, c.title);
    const lines = org.lines.filter((l) => l.roleId === role.id);
    const direct = chain[0];
    sections.push({
      label: role.title.toUpperCase().slice(0, 28),
      text: direct
        ? `Reports to ${roleLine(org, direct)}${chain.length > 1 ? `, who reports to ${roleLine(org, chain[1]!)}` : ""}.${
            lines.length
              ? ` Also a functional line to ${joinNames(
                  lines.map((l) => {
                    const t = org.roles.find((r) => r.id === l.toRoleId);
                    if (t) cite.add("role", t.id, t.title);
                    return t ? roleLine(org, t) : "a removed role";
                  }),
                )}.`
              : ""
          }`
        : "Reports to nobody on the organogram: it is at the top.",
    });
    if (chain.length)
      sections.push({
        label: "CHAIN",
        text: [...chain]
          .reverse()
          .map((r) => r.title)
          .concat(role.title)
          .join(" › "),
      });
  }
  if (!roles.length)
    gaps.push(
      q.personId
        ? `${subject || "This person"} holds no role on the organogram.`
        : "That role is not recorded.",
    );
  return {
    question: `Who does ${subject} report to?`,
    basis: "records",
    sections,
    citations: cite.list,
    gaps,
  };
}

/* ------------------------------------------------ ownership, both ways */

type UltimateHolder = {
  label: string;
  effective: number | null;
  kind: "person" | "outside" | "entity";
  id: string | null;
};

/** Walk up the holdings to whoever is at the top of each chain. */
export function ultimateHolders(
  org: Organisation,
  entityId: string,
  today: Day = localDay(),
): UltimateHolder[] {
  const out: UltimateHolder[] = [];
  const walk = (id: string, share: number | null, seen: Set<string>) => {
    const holders = shareholdersOf(org, id, today);
    for (const h of holders) {
      const effective = share === null || h.percent === null ? null : (share * h.percent) / 100;
      if (h.ownerEntityId && !seen.has(h.ownerEntityId)) {
        const above = shareholdersOf(org, h.ownerEntityId, today);
        if (above.length) walk(h.ownerEntityId, effective, new Set([...seen, h.ownerEntityId]));
        else
          out.push({ label: holderLabel(org, h), effective, kind: "entity", id: h.ownerEntityId });
      } else if (h.ownerPersonId) {
        out.push({ label: holderLabel(org, h), effective, kind: "person", id: h.ownerPersonId });
      } else if (h.ownerName) {
        out.push({ label: h.ownerName, effective, kind: "outside", id: null });
      }
    }
  };
  walk(entityId, 100, new Set([entityId]));
  // The same holder reached by two routes is one holder.
  const merged = new Map<string, UltimateHolder>();
  for (const u of out) {
    const key = `${u.kind}:${u.id ?? u.label}`;
    const prior = merged.get(key);
    if (!prior) merged.set(key, u);
    else
      merged.set(key, {
        ...prior,
        effective:
          prior.effective === null || u.effective === null ? null : prior.effective + u.effective,
      });
  }
  return [...merged.values()];
}

export function ownersOf(org: Organisation, entityId: string, today: Day = localDay()): Answer {
  const cite = new Cite();
  const entity = org.entities.find((e) => e.id === entityId);
  cite.add("entity", entityId, entityLabel(entity));
  const direct = shareholdersOf(org, entityId, today);
  const sections: AnswerSection[] = [];
  const gaps: string[] = [];
  for (const h of direct) {
    if (h.ownerEntityId) cite.add("entity", h.ownerEntityId, holderLabel(org, h));
    if (h.ownerPersonId) cite.add("person", h.ownerPersonId, holderLabel(org, h));
  }
  sections.push({
    label: "HELD BY",
    text: direct.length
      ? direct
          .map(
            (h) =>
              `${holderLabel(org, h)} ${percentLabel(h.percent)}${h.instrument ? ` (${h.instrument})` : ""}`,
          )
          .join("; ")
      : "No shareholding is recorded.",
  });
  const top = ultimateHolders(org, entityId, today);
  const indirect = top.filter(
    (u) =>
      !direct.some(
        (h) => (h.ownerPersonId ?? h.ownerEntityId ?? h.ownerName) === (u.id ?? u.label),
      ),
  );
  if (indirect.length) {
    for (const u of indirect) if (u.kind === "person" && u.id) cite.add("person", u.id, u.label);
    sections.push({
      label: "ULTIMATELY",
      text: top
        .map((u) => `${u.label}${u.effective !== null ? ` ${percentLabel(u.effective)}` : ""}`)
        .join("; "),
    });
  }
  if (!direct.length)
    gaps.push(`Record who holds ${entityLabel(entity) || "this entity"}'s shares.`);
  const total = direct.reduce((n, h) => n + (h.percent ?? 0), 0);
  if (direct.length && direct.every((h) => h.percent !== null) && Math.abs(total - 100) > 0.01)
    gaps.push(`The recorded holdings add to ${percentLabel(total)}.`);
  return {
    question: `Who owns ${entityLabel(entity) || "this entity"}?`,
    basis: "records",
    sections,
    citations: cite.list,
    gaps,
  };
}

export function holdingsOf(org: Organisation, entityId: string, today: Day = localDay()): Answer {
  const cite = new Cite();
  const entities = byId(org.entities);
  const entity = entities.get(entityId);
  cite.add("entity", entityId, entityLabel(entity));
  const direct = holdingsBy(org, entityId, today);
  const through = ownedThrough(org, entityId, today).filter(
    (x) => !direct.some((h) => h.subsidiaryEntityId === x.entityId),
  );
  for (const h of direct)
    cite.add("entity", h.subsidiaryEntityId, entityLabel(entities.get(h.subsidiaryEntityId)));
  for (const x of through) cite.add("entity", x.entityId, entityLabel(entities.get(x.entityId)));
  const sections: AnswerSection[] = [
    {
      label: "DIRECTLY",
      text: direct.length
        ? direct
            .map(
              (h) =>
                `${entityLabel(entities.get(h.subsidiaryEntityId))} ${percentLabel(h.percent)}`,
            )
            .join("; ")
        : "Nothing recorded.",
    },
  ];
  if (through.length)
    sections.push({
      label: "THROUGH OTHERS",
      text: through
        .map(
          (x) =>
            `${entityLabel(entities.get(x.entityId))} ${x.effective !== null ? percentLabel(x.effective) : "(share not recorded)"} via ${x.path
              .slice(0, -1)
              .map((id) => entityLabel(entities.get(id)))
              .join(" › ")}`,
        )
        .join("; "),
    });
  return {
    question: `What does ${entityLabel(entity) || "this entity"} own?`,
    basis: "records",
    sections,
    citations: cite.list,
    gaps: [],
  };
}

/* ------------------------------------------------------------ holder of */

const CAPACITY_WORDS: [Capacity, RegExp][] = [
  ["managing_director", /managing director|\bmd\b|chief executive|\bceo\b/],
  ["alternate_director", /alternate director/],
  ["secretary", /secretary/],
  ["chair", /\bchair/],
  ["signatory", /signator/],
  ["auditor", /auditor/],
  ["director", /director/],
];

export function holderOf(
  org: Organisation,
  title: string,
  entityId: string | null = null,
  today: Day = localDay(),
): Answer {
  const cite = new Cite();
  const wanted = title.trim().toLowerCase();
  const entities = byId(org.entities);
  const entity = entityId ? entities.get(entityId) : undefined;
  if (entity) cite.add("entity", entity.id, entityLabel(entity));
  const sections: AnswerSection[] = [];
  const gaps: string[] = [];

  const capacity = CAPACITY_WORDS.find(([, re]) => re.test(wanted))?.[0];
  if (capacity) {
    const appts = currentAppointments(org, today).filter(
      (a) =>
        (!entityId || a.entityId === entityId) &&
        (a.capacity === capacity ||
          (capacity === "director" && a.capacity === "managing_director")),
    );
    for (const a of appts) {
      cite.add(
        "appointment",
        a.id,
        `${personName(org, a.personId)} — ${CAPACITY_LABEL[a.capacity]}`,
      );
      cite.add("person", a.personId, personName(org, a.personId));
    }
    if (appts.length)
      sections.push({
        label: CAPACITY_LABEL[capacity].toUpperCase(),
        text: appts
          .map(
            (a) =>
              `${personName(org, a.personId)}${entityId ? "" : ` (${entityLabel(entities.get(a.entityId))})`}${a.appointedOn ? `, since ${formatDay(a.appointedOn)}` : ""}`,
          )
          .join("; "),
      });
  }
  const roles = currentRoles(org, today).filter(
    (r) =>
      r.title.toLowerCase().includes(wanted) &&
      (!entityId || !r.entityId || r.entityId === entityId),
  );
  for (const r of roles) {
    cite.add("role", r.id, r.title);
    const name = personName(org, r.holderPersonId);
    if (r.holderPersonId) cite.add("person", r.holderPersonId, name);
    sections.push({
      label: "ORGANOGRAM",
      text: `${r.title}${r.entityId && !entityId ? ` (${entityLabel(entities.get(r.entityId))})` : ""} — ${name ? `${name}${r.acting ? " (acting)" : ""}` : "vacant"}`,
    });
    if (!name) gaps.push(`${r.title} is vacant.`);
  }
  if (!sections.length)
    gaps.push(
      `No appointment or role matching “${title.trim()}” is recorded${entity ? ` for ${entityLabel(entity)}` : ""}.`,
    );
  return {
    question: `Who is the ${title.trim()}${entity ? ` of ${entityLabel(entity)}` : ""}?`,
    basis: "records",
    sections,
    citations: cite.list,
    gaps,
  };
}

/* -------------------------------------------------------------- windows */

/** The current calendar month as a window. */
export const thisMonth = (today: Day = localDay()): { from: Day; to: Day } => {
  const [y, m] = today.split("-").map(Number);
  const last = new Date(y!, m!, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
};

/** Days from today, for "due in the next N days" phrasing elsewhere. */
export const daysFromToday = (day: Day, today: Day = localDay()) => daysBetween(today, day);
