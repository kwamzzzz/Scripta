/**
 * Publishing a reviewed import: the only moment an import touches the records.
 *
 * Matched candidates update the record they matched (a reporting line, a
 * shareholding); new ones are created; ignored ones are left out. A change
 * that would put a role under its own report is skipped and reported rather
 * than written, and an identical holding is not recorded twice.
 */
import { insertRecord, updateRecord } from "../db";
import { canReportTo, holdingsIn, type ChangeContext, type Organisation } from "../model";
import { normalise, type Decision, type ImportJob } from "./import";

export type PublishResult = { created: number; updated: number; skipped: string[] };

export async function publishImport(
  org: Organisation,
  job: ImportJob,
  decisions: Record<string, Decision>,
  change: ChangeContext,
): Promise<PublishResult> {
  return job.kind === "reporting"
    ? publishReporting(org, job, decisions, change)
    : publishOwnership(org, job, decisions, change);
}

async function publishReporting(
  org: Organisation,
  job: ImportJob,
  decisions: Record<string, Decision>,
  change: ChangeContext,
): Promise<PublishResult> {
  const result: PublishResult = { created: 0, updated: 0, skipped: [] };
  const roleOf = new Map<string, string>();
  const people = new Map(
    org.people.filter((p) => !p.archivedAt).map((p) => [normalise(p.fullName), p.id]),
  );

  const personFor = async (name: string) => {
    const key = normalise(name);
    if (!key) return null;
    const found = people.get(key);
    if (found) return found;
    const id = await insertRecord(org, "org_people", { full_name: name.trim() }, change);
    people.set(key, id);
    result.created++;
    return id;
  };

  // Track roles and parent changes made in this publish, so the loop check sees them.
  const working: Organisation = { ...org, roles: org.roles.map((r) => ({ ...r })) };
  for (const n of job.nodes) {
    const d = decisions[n.key];
    if (!d || d.kind === "ignore") continue;
    if (d.kind === "match") {
      roleOf.set(n.key, d.id);
      const role = org.roles.find((r) => r.id === d.id);
      if (role && n.subtitle && !role.holderPersonId) {
        await updateRecord(
          "org_roles",
          role.id,
          { holder_person_id: await personFor(n.subtitle) },
          change,
        );
        result.updated++;
      }
      continue;
    }
    const holder = n.subtitle && !/^vacant$/i.test(n.subtitle) ? await personFor(n.subtitle) : null;
    const id = await insertRecord(
      org,
      "org_roles",
      { title: n.title, holder_person_id: holder },
      change,
    );
    roleOf.set(n.key, id);
    working.roles.push({ ...emptyRole(id), title: n.title });
    result.created++;
  }

  // Parents: the first line into a role is its reporting line; any further
  // line is recorded as a functional (dotted) line.
  const parents = new Map<string, string[]>();
  for (const e of job.edges) {
    if (!roleOf.has(e.from) || !roleOf.has(e.to)) continue;
    parents.set(e.to, [...(parents.get(e.to) ?? []), e.from]);
  }
  for (const [childKey, parentKeys] of parents) {
    const roleId = roleOf.get(childKey)!;
    const [first, ...rest] = parentKeys.map((k) => roleOf.get(k)!);
    const existing = working.roles.find((r) => r.id === roleId);
    if (first && existing && existing.parentRoleId !== first) {
      if (!canReportTo(working, roleId, first)) {
        const child = job.nodes.find((n) => n.key === childKey)?.title ?? "A role";
        result.skipped.push(`${child} was not placed: it would report to one of its own reports.`);
      } else {
        await updateRecord("org_roles", roleId, { parent_role_id: first }, change);
        existing.parentRoleId = first;
        result.updated++;
      }
    }
    for (const to of rest) {
      if (org.lines.some((l) => l.roleId === roleId && l.toRoleId === to)) continue;
      await insertRecord(org, "org_role_lines", { role_id: roleId, to_role_id: to });
      result.created++;
    }
  }
  return result;
}

const emptyRole = (id: string) => ({
  id,
  title: "",
  functionName: "",
  kind: "role" as const,
  kindLabel: "",
  entityId: null,
  parentRoleId: null,
  holderPersonId: null,
  acting: false,
  coverRoleId: null,
  coverNote: "",
  position: 0,
  effectiveFrom: null,
  effectiveTo: null,
  lastChangeOn: null,
  lastChangeRef: null,
  updatedAt: "",
});

async function publishOwnership(
  org: Organisation,
  job: ImportJob,
  decisions: Record<string, Decision>,
  change: ChangeContext,
): Promise<PublishResult> {
  const result: PublishResult = { created: 0, updated: 0, skipped: [] };
  type Holder = { entity: string } | { person: string } | { outside: string };
  const holderOf = new Map<string, Holder>();
  const entityOf = new Map<string, string>();

  for (const n of job.nodes) {
    const d = decisions[n.key];
    if (!d || d.kind === "ignore") continue;
    if (d.kind === "match") {
      if (d.as === "person") holderOf.set(n.key, { person: d.id });
      else {
        holderOf.set(n.key, { entity: d.id });
        entityOf.set(n.key, d.id);
      }
      continue;
    }
    if (d.as === "outside") {
      holderOf.set(n.key, { outside: n.title });
      continue;
    }
    const id = await insertRecord(
      org,
      "org_entities",
      { name: n.title, jurisdiction: n.subtitle },
      change,
    );
    holderOf.set(n.key, { entity: id });
    entityOf.set(n.key, id);
    result.created++;
  }

  const current = holdingsIn(org, "current");
  for (const e of job.edges) {
    const holder = holderOf.get(e.from);
    const subsidiary = entityOf.get(e.to);
    if (!holder || !subsidiary) {
      const to = job.nodes.find((n) => n.key === e.to)?.title ?? "an entity";
      if (decisions[e.from]?.kind !== "ignore" && decisions[e.to]?.kind !== "ignore")
        result.skipped.push(`A holding into ${to} was left out: only an entity can be held.`);
      continue;
    }
    const same = current.find(
      (h) =>
        h.subsidiaryEntityId === subsidiary &&
        ("entity" in holder
          ? h.ownerEntityId === holder.entity
          : "person" in holder
            ? h.ownerPersonId === holder.person
            : normalise(h.ownerName ?? "") === normalise(holder.outside)),
    );
    if (same) {
      if (e.percent !== null && same.percent !== e.percent) {
        await updateRecord("org_holdings", same.id, { percent: e.percent }, change);
        result.updated++;
      }
      continue;
    }
    if ("entity" in holder && holder.entity === subsidiary) continue;
    await insertRecord(
      org,
      "org_holdings",
      {
        owner_entity_id: "entity" in holder ? holder.entity : null,
        owner_person_id: "person" in holder ? holder.person : null,
        owner_name: "outside" in holder ? holder.outside : null,
        subsidiary_entity_id: subsidiary,
        percent: e.percent,
        effective_from: change.on || null,
      },
      change,
    );
    result.created++;
  }
  return result;
}
