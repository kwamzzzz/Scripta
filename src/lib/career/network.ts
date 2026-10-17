/**
 * Reading the register of people.
 *
 * Two questions, and they are the only two a lawyer actually asks of their
 * network. "Who do I know who can help with this?" — asked at speed, with a
 * problem already in hand. And "who have I not spoken to in a year?" — asked
 * rarely, usually with a guilty conscience.
 *
 * Neither is answered by nagging. Nothing here produces a task, a reminder or
 * a badge: a register that chases you is a register you stop opening, and the
 * cost of a stale contact is borne once, when you go looking. So these are
 * readings, computed when the lawyer asks for them.
 */
import type { Contact, Milestone, Position, Credential, Skill } from "./profile";

/* ------------------------------------------------- who can I call about X */

/** Fold text the way the rest of Scripta does, so "Data Protection" finds "data protection". */
const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim();

export type ContactMatch = {
  contact: Contact;
  /** Which expertise tags matched, for showing why this person came back. */
  on: string[];
  /** A name or firm match rather than a subject one. */
  byName: boolean;
};

/**
 * Find the people who know about something.
 *
 * Matches expertise first, because that is the question being asked; a name or
 * a firm matches too, since half the time the lawyer is looking for a person
 * they can half-remember. Ordered by how well they are known, because being
 * able to ask is the difference between a contact and a name.
 */
export function whoCanHelp(contacts: Contact[], term: string): ContactMatch[] {
  const q = fold(term);
  if (!q) return [];
  const rank = { close: 0, known: 1, met: 2 };
  return contacts
    .filter((c) => !c.archivedAt)
    .map((c) => {
      const on = c.expertise.filter((e) => fold(e).includes(q) || q.includes(fold(e)));
      const byName =
        fold(c.name).includes(q) ||
        fold(c.organisation).includes(q) ||
        fold(c.callOn).includes(q) ||
        fold(c.role).includes(q);
      return { contact: c, on, byName };
    })
    .filter((m) => m.on.length > 0 || m.byName)
    .sort(
      (a, b) =>
        b.on.length - a.on.length ||
        rank[a.contact.closeness] - rank[b.contact.closeness] ||
        a.contact.name.localeCompare(b.contact.name),
    );
}

/* --------------------------------------------------------- the whole register */

/** Every subject anybody in the register knows about, with who knows it. */
export function expertiseIndex(contacts: Contact[]): { subject: string; people: Contact[] }[] {
  const bySubject = new Map<string, { subject: string; people: Contact[] }>();
  for (const c of contacts.filter((x) => !x.archivedAt))
    for (const raw of c.expertise) {
      const key = fold(raw);
      if (!key) continue;
      const found = bySubject.get(key);
      if (found) found.people.push(c);
      else bySubject.set(key, { subject: raw.trim(), people: [c] });
    }
  return [...bySubject.values()].sort(
    (a, b) => b.people.length - a.people.length || a.subject.localeCompare(b.subject),
  );
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * People you have not spoken to in a while.
 *
 * Only the ones worth the guilt: somebody you would call today, gone quiet for
 * a year, is worth knowing about. Somebody you once met at a conference is
 * not, and a register that said so every time you opened it would be telling
 * you off for having met people.
 */
export function goneQuiet(contacts: Contact[], today: Date = new Date(), months = 12): Contact[] {
  const cutoff = today.getTime() - months * 30.44 * DAY;
  return contacts
    .filter((c) => !c.archivedAt && c.closeness !== "met")
    .filter((c) => {
      if (!c.lastContactOn) return false;
      const at = new Date(`${c.lastContactOn}T00:00:00`).getTime();
      return !Number.isNaN(at) && at < cutoff;
    })
    .sort((a, b) => (a.lastContactOn ?? "").localeCompare(b.lastContactOn ?? ""));
}

/** The milestones of everybody in the register, newest first, with the person attached. */
export function recentMilestones(
  contacts: Contact[],
  milestones: Milestone[],
  limit = 8,
): { milestone: Milestone; contact: Contact | null }[] {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  return milestones
    .slice()
    .sort((a, b) => (b.happenedOn ?? "").localeCompare(a.happenedOn ?? ""))
    .slice(0, limit)
    .map((m) => ({ milestone: m, contact: m.contactId ? (byId.get(m.contactId) ?? null) : null }));
}

/* -------------------------------------------------------------- the skills */

export type SkillReading = {
  name: string;
  /** Positions and credentials that name this skill. */
  from: string[];
  /** Named on its own and nowhere else: asserted rather than shown. */
  assertedOnly: boolean;
};

/**
 * Every skill claimed anywhere in the profile, and where it came from.
 *
 * A skill that appears only in the skills list is an assertion; one that a
 * position or a certificate also names has something behind it. The profile
 * says which is which rather than counting endorsements, because an
 * endorsement from somebody who has never seen your work is worth nothing and
 * pretending otherwise is how these lists became noise elsewhere.
 */
export function readSkills(
  skills: Skill[],
  positions: Position[],
  credentials: Credential[],
): SkillReading[] {
  const out = new Map<string, SkillReading>();
  const add = (raw: string, source: string | null) => {
    const name = raw.trim();
    if (!name) return;
    const key = fold(name);
    const found = out.get(key) ?? { name, from: [], assertedOnly: true };
    if (source && !found.from.includes(source)) {
      found.from.push(source);
      found.assertedOnly = false;
    }
    out.set(key, found);
  };
  for (const s of skills) add(s.name, null);
  for (const p of positions)
    for (const s of p.skills) add(s, `${p.title}${p.organisation ? `, ${p.organisation}` : ""}`);
  for (const c of credentials) for (const s of c.skills) add(s, c.name);
  return [...out.values()].sort(
    (a, b) => b.from.length - a.from.length || a.name.localeCompare(b.name),
  );
}

/* ------------------------------------------------------------ completeness */

/**
 * What is still blank, so the profile can say so once rather than nag.
 *
 * Returned as sentences a person would write, not a percentage: "83% complete"
 * is a number invented to make somebody feel behind.
 */
export function profileGaps(record: {
  profile: { headline: string; about: string; location: string; admissions: string };
  positions: Position[];
  education: unknown[];
  credentials: unknown[];
}): string[] {
  const gaps: string[] = [];
  if (!record.profile.headline.trim()) gaps.push("a headline");
  if (!record.profile.about.trim()) gaps.push("the paragraph about you");
  if (!record.positions.length) gaps.push("the positions you have held");
  if (!record.education.length) gaps.push("where you studied");
  if (!record.credentials.length) gaps.push("your practising certificate or other credentials");
  if (!record.profile.admissions.trim()) gaps.push("where you are admitted");
  return gaps;
}
