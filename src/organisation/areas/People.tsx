/**
 * The people at the client whose positions matter, and who is responsible for
 * what.
 *
 * A person is never a floating contact card. Selecting one reads everything
 * the organisation records about them back onto them: the roles they hold and
 * whom they report to, their offices in each entity (past ones too), the
 * responsibilities those roles carry, the authority they exercise, the licences
 * they own and whom they cover for. None of it is stored on the person.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/primitives";
import { Avatar } from "@/components/Person";
import type { AreaProps } from "../area";
import PersonDialog from "../dialogs/PersonDialog";
import ResponsibilityDialog from "../dialogs/ResponsibilityDialog";
import {
  bandLabel,
  byId,
  CAPACITY_LABEL,
  currentRoles,
  entityLabel,
  formatDay,
  licenceStatus,
  localDay,
  percentLabel,
  personContext,
  personName,
  reportingChain,
  type Organisation,
  type Person,
  type Responsibility,
} from "../model";
import { count, Empty, Eyebrow, LinkButton, OrgPage, Panel, Pill } from "../ui";
import "../governance.css";

const STEP_VERB = { recommend: "Recommends", approve: "Approves", sign: "Signs" } as const;

export default function People({ org, item, go, on }: AreaProps) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [responsibility, setResponsibility] = useState<Responsibility | "new" | null>(null);
  const today = localDay();

  const roles = currentRoles(org, today);
  const soleByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of org.responsibilities)
      if (!r.deputyRoleId) m.set(r.roleId, (m.get(r.roleId) ?? 0) + 1);
    return m;
  }, [org.responsibilities]);

  const people = org.people
    .filter((p) => showArchived || !p.archivedAt)
    .filter(
      (p) =>
        !query.trim() ||
        `${p.fullName} ${p.email} ${p.location}`.toLowerCase().includes(query.trim().toLowerCase()),
    );
  const archivedCount = org.people.filter((p) => p.archivedAt).length;
  const selected = org.people.find((p) => p.id === item) ?? null;

  return (
    <OrgPage
      title="People & responsibilities"
      subtitle={
        org.people.length
          ? `${count(org.people.filter((p) => !p.archivedAt).length, "person", "people")} · ${count(org.responsibilities.length, "responsibility", "responsibilities")} recorded`
          : "The people at the client whose positions matter to the firm"
      }
      actions={
        <>
          <Button onClick={() => setResponsibility("new")} disabled={!roles.length}>
            Add responsibility
          </Button>
          <Button variant="primary" onClick={() => setEditing("new")}>
            Add person
          </Button>
        </>
      }
      aside={
        selected ? (
          <PersonContext
            org={org}
            person={selected}
            go={go}
            showLicences={on("licences")}
            onEdit={() => setEditing(selected)}
          />
        ) : undefined
      }
    >
      {org.people.length === 0 ? (
        <Empty
          title="No people recorded yet"
          body="Add the directors, officers and managers the firm deals with. Their roles, offices and authority are then recorded on the organogram, the entities and the authority matrix."
          action={
            <Button variant="primary" onClick={() => setEditing("new")}>
              Add person
            </Button>
          }
        />
      ) : (
        <Panel
          title="People"
          right={
            <>
              <input
                className="gv-search"
                type="search"
                aria-label="Search people"
                placeholder="Search people"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {archivedCount > 0 && (
                <label className="og-check">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  Archived ({archivedCount})
                </label>
              )}
            </>
          }
        >
          {people.length === 0 ? (
            <p className="og-muted">Nobody matches “{query}”.</p>
          ) : (
            <ul className="og-rows">
              {people.map((p) => {
                const held = roles.filter((r) => r.holderPersonId === p.id);
                const areas = org.responsibilities.filter((x) =>
                  held.some((r) => r.id === x.roleId),
                );
                const sole = held.reduce((n, r) => n + (soleByRole.get(r.id) ?? 0), 0);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`gv-person${p.id === item ? " is-selected" : ""}`}
                      aria-pressed={p.id === item}
                      onClick={() => go({ item: p.id === item ? null : p.id })}
                    >
                      <Avatar name={p.fullName} email={p.email} size={30} />
                      <span className="og-row-main">
                        <span className="og-row-title">{p.fullName}</span>
                        <span className="og-row-meta">
                          {[
                            held.map((r) => r.title).join(" · ") || "No role on the organogram",
                            ...areas.slice(0, 3).map((a) => a.area),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="og-row-side">
                        {p.archivedAt && <Pill tone="retired">Archived</Pill>}
                        {sole > 0 && <Pill tone="warning">{`${sole} sole`}</Pill>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      <Panel
        title="Who is responsible for what"
        right={
          roles.length ? (
            <LinkButton onClick={() => setResponsibility("new")}>Add responsibility</LinkButton>
          ) : undefined
        }
      >
        {org.responsibilities.length === 0 ? (
          <p className="og-muted">
            {roles.length
              ? "No responsibilities recorded. Record who owns each function and who deputises, and a responsibility with no deputy is flagged."
              : "Responsibilities are held by roles. Add roles to the organogram first."}
          </p>
        ) : (
          <>
            <table className="og-table gv-resp">
              <thead>
                <tr>
                  <th>Responsibility</th>
                  <th>Owner</th>
                  <th>Deputy</th>
                  <th aria-label="Flags" />
                </tr>
              </thead>
              <tbody>
                {org.responsibilities.map((x) => {
                  const owner = org.roles.find((r) => r.id === x.roleId);
                  const deputy = org.roles.find((r) => r.id === x.deputyRoleId);
                  return (
                    <tr key={x.id} className="is-selectable" onClick={() => setResponsibility(x)}>
                      <td>
                        <button
                          type="button"
                          className="gv-cell-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            setResponsibility(x);
                          }}
                        >
                          {x.area}
                        </button>
                        {x.detail && <div className="og-row-meta">{x.detail}</div>}
                      </td>
                      <td>
                        <RoleHolder org={org} roleId={owner?.id ?? null} />
                      </td>
                      <td>
                        {deputy ? (
                          <RoleHolder org={org} roleId={deputy.id} />
                        ) : (
                          <span className="og-muted">None</span>
                        )}
                      </td>
                      <td className="gv-flag-cell">
                        {!x.deputyRoleId && <Pill tone="warning">Sole</Pill>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {soleByRole.size > 0 && (
              <p className="og-hint gv-caption">
                A responsibility with one named owner and no deputy is flagged.
              </p>
            )}
          </>
        )}
      </Panel>

      {editing && (
        <PersonDialog
          key={editing === "new" ? "new" : editing.id}
          org={org}
          person={editing === "new" ? null : editing}
          open
          onClose={() => setEditing(null)}
          onSaved={(id) => go({ item: id })}
        />
      )}
      {responsibility && (
        <ResponsibilityDialog
          key={responsibility === "new" ? "new" : responsibility.id}
          org={org}
          responsibility={responsibility === "new" ? null : responsibility}
          open
          onClose={() => setResponsibility(null)}
        />
      )}
    </OrgPage>
  );
}

function RoleHolder({ org, roleId }: { org: Organisation; roleId: string | null }) {
  const role = org.roles.find((r) => r.id === roleId);
  if (!role) return <span className="og-muted">Role removed</span>;
  const holder = personName(org, role.holderPersonId);
  return (
    <div>
      <div>{role.title}</div>
      <div className={holder ? "og-row-meta" : "og-row-meta gv-vacant"}>
        {holder ? `${holder}${role.acting ? " (acting)" : ""}` : "Vacant"}
      </div>
    </div>
  );
}

function PersonContext({
  org,
  person,
  go,
  showLicences,
  onEdit,
}: {
  org: Organisation;
  person: Person;
  go: AreaProps["go"];
  showLicences: boolean;
  onEdit: () => void;
}) {
  const today = localDay();
  const ctx = personContext(org, person.id, today);
  const entities = byId(org.entities);
  const rules = byId(org.rules);
  const roles = byId(org.roles);
  const current = ctx.appointments.filter((a) => !a.ceasedOn || a.ceasedOn > today);
  const past = ctx.appointments.filter((a) => a.ceasedOn && a.ceasedOn <= today);
  const nothing =
    !ctx.roles.length &&
    !ctx.appointments.length &&
    !ctx.responsibilities.length &&
    !ctx.deputising.length &&
    !ctx.authority.length &&
    !ctx.licences.length &&
    !ctx.covers.length &&
    !ctx.holdings.length;

  return (
    <>
      <div className="og-aside-head gv-aside-head">
        <div>
          <h3>{person.fullName}</h3>
          <p>
            {[person.location, person.email, person.phone].filter(Boolean).join(" · ") ||
              "No contact details recorded"}
          </p>
        </div>
        <Button variant="quiet" onClick={onEdit}>
          Edit
        </Button>
      </div>
      {person.archivedAt && <Pill tone="retired">Archived</Pill>}
      {person.notes && <p className="gv-notes">{person.notes}</p>}

      {nothing && (
        <p className="og-muted">
          Nothing is recorded against {person.fullName} yet: no role, office, responsibility or
          authority.
        </p>
      )}

      {ctx.roles.length > 0 && (
        <Section title="Roles">
          {ctx.roles.map((r) => {
            const chain = reportingChain(org, r.id);
            return (
              <div key={r.id} className="gv-ctx-row">
                <div>
                  <LinkButton onClick={() => go({ area: "organogram", item: r.id, mode: null })}>
                    {r.title}
                  </LinkButton>
                  {r.acting && <span className="og-muted"> (acting)</span>}
                </div>
                <div className="og-row-meta">
                  {chain[0]
                    ? `Reports to ${chain[0].title}${chain[0].holderPersonId ? ` (${personName(org, chain[0].holderPersonId)})` : " (vacant)"}`
                    : "Top of the organogram"}
                  {r.entityId ? ` · ${entityLabel(entities.get(r.entityId))}` : ""}
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {ctx.appointments.length > 0 && (
        <Section title="Offices">
          {[...current, ...past].map((a) => {
            const ended = !!a.ceasedOn && a.ceasedOn <= today;
            return (
              <div key={a.id} className={`gv-ctx-row${ended ? " is-past" : ""}`}>
                <div>
                  {CAPACITY_LABEL[a.capacity]}
                  {a.title ? ` (${a.title})` : ""},{" "}
                  <LinkButton
                    onClick={() => go({ area: "entities", item: a.entityId, mode: null })}
                  >
                    {entityLabel(entities.get(a.entityId))}
                  </LinkButton>
                </div>
                <div className="og-row-meta">
                  {a.appointedOn ? `From ${formatDay(a.appointedOn)}` : "Start not recorded"}
                  {a.ceasedOn ? ` to ${formatDay(a.ceasedOn)}` : ""}
                  {ended ? " · ceased" : ""}
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {(ctx.responsibilities.length > 0 || ctx.deputising.length > 0) && (
        <Section title="Responsibilities">
          {ctx.responsibilities.map((x) => (
            <div key={x.id} className="gv-ctx-row">
              <div>
                {x.area} {!x.deputyRoleId && <Pill tone="warning">Sole</Pill>}
              </div>
              <div className="og-row-meta">
                Owner, as {roles.get(x.roleId)?.title}
                {x.deputyRoleId
                  ? ` · deputy ${roles.get(x.deputyRoleId)?.title ?? ""}`
                  : " · no deputy"}
              </div>
            </div>
          ))}
          {ctx.deputising.map((x) => (
            <div key={x.id} className="gv-ctx-row">
              <div>{x.area}</div>
              <div className="og-row-meta">Deputy, as {roles.get(x.deputyRoleId ?? "")?.title}</div>
            </div>
          ))}
        </Section>
      )}

      {ctx.authority.length > 0 && (
        <Section
          title="Authority"
          action={
            <LinkButton onClick={() => go({ area: "authority", item: null, mode: null })}>
              Matrix
            </LinkButton>
          }
        >
          {ctx.authority.map((p) => {
            const rule = rules.get(p.ruleId);
            if (!rule) return null;
            return (
              <div key={p.id} className="gv-ctx-row">
                <div>
                  {STEP_VERB[p.step]} {rule.matterType.toLowerCase()}{" "}
                  {bandLabel(rule) === "Any" ? "" : bandLabel(rule)}
                  {rule.basis === "inferred" && (
                    <span className="og-chip is-unverified gv-inline-chip">Inferred</span>
                  )}
                </div>
                <div className="og-row-meta">
                  As {roles.get(p.roleId ?? "")?.title}
                  {rule.entityId ? ` · ${entityLabel(entities.get(rule.entityId))} only` : ""}
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {showLicences && ctx.licences.length > 0 && (
        <Section title="Licences owned">
          {ctx.licences.map((l) => (
            <div key={l.id} className="gv-ctx-row">
              <LinkButton onClick={() => go({ area: "licences", item: l.id, mode: null })}>
                {l.name}
              </LinkButton>
              <div className="og-row-meta">
                {entityLabel(entities.get(l.entityId ?? ""))}
                {entities.get(l.entityId ?? "") ? " · " : ""}
                {licenceStatus(l, today).label}
              </div>
            </div>
          ))}
        </Section>
      )}

      {ctx.covers.length > 0 && (
        <Section title="Covers in absence for">
          {ctx.covers.map((r) => (
            <div key={r.id} className="gv-ctx-row">
              <div>{r.title}</div>
              {r.coverNote && <div className="og-row-meta">{r.coverNote}</div>}
            </div>
          ))}
        </Section>
      )}

      {ctx.holdings.length > 0 && (
        <Section title="Shareholdings">
          {ctx.holdings.map((h) => (
            <div
              key={h.id}
              className={`gv-ctx-row${h.effectiveTo && h.effectiveTo <= today ? " is-past" : ""}`}
            >
              <div>
                {percentLabel(h.percent)} of{" "}
                <LinkButton
                  onClick={() => go({ area: "structure", item: h.subsidiaryEntityId, mode: null })}
                >
                  {entityLabel(entities.get(h.subsidiaryEntityId))}
                </LinkButton>
              </div>
              <div className="og-row-meta">
                {[
                  h.instrument,
                  h.proposedChangeId ? "planned" : "",
                  h.effectiveTo ? `ended ${formatDay(h.effectiveTo)}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="gv-ctx">
      <div className="gv-ctx-head">
        <Eyebrow>{title}</Eyebrow>
        {action}
      </div>
      {children}
    </section>
  );
}
