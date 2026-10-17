/**
 * A client at a glance.
 *
 * For an organisation: what it is (its entities, where they are, who leads
 * it), what is overdue or lapsing in its compliance, who holds it, what its
 * authority rests on, and what changed recently — beside the firm's work for
 * it. Every figure is a count of records or of work this person can open;
 * nothing is scored or estimated. For a person, only the work. A client kept
 * to the essentials has no licences or calendar, so nothing here asks about them.
 */
import { useState } from "react";
import { useOrgTasks } from "./registers/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import { areaOn, type Client, type ClientWork } from "@/lib/clients";
import type { ClientTab } from "@/clients/tabs";
import {
  attentionItems,
  currentRoles,
  entitiesIn,
  entityLabel,
  formatDay,
  holderLabel,
  holdingsIn,
  licenceStatus,
  liveEntities,
  livePeople,
  organogramFlags,
  overdueOccurrences,
  percentLabel,
  personName,
  structureFlags,
  type OrgArea,
  type Organisation,
} from "./model";
import { Empty, ErrorLine, Eyebrow, LinkButton, Panel, count, useOrgWrite } from "./ui";
import { documentGaps } from "./processes/documents";
import { taskForLicenceRenewal, taskForOccurrence } from "./work";
import "./documents.css";

type Props = {
  client: Client;
  org: Organisation | null;
  orgError: string | null;
  work: ClientWork | null;
  goArea: (area: OrgArea, item?: string | null) => void;
  openTab: (tab: ClientTab) => void;
};

export default function ClientOverview({ client, org, orgError, work, goArea, openTab }: Props) {
  if (client.kind === "individual")
    return (
      <div className="ov">
        <WorkPanel work={work} openTab={openTab} />
      </div>
    );
  return (
    <div className="ov">
      {orgError ? (
        <p className="org-error" role="alert">
          {orgError}
        </p>
      ) : !org ? (
        <p className="org-hint" role="status">
          Loading…
        </p>
      ) : isEmpty(org) ? (
        <div className="ov-cols">
          <div className="ov-main">
            <Onboarding client={client} goArea={goArea} />
          </div>
          <aside className="ov-side">
            <WorkPanel work={work} openTab={openTab} />
          </aside>
        </div>
      ) : (
        <Recorded client={client} org={org} work={work} goArea={goArea} openTab={openTab} />
      )}
    </div>
  );
}

const isEmpty = (org: Organisation) =>
  !org.entities.length &&
  !org.people.length &&
  !org.roles.length &&
  !org.licences.length &&
  !org.obligations.length &&
  !org.instruments.length &&
  !org.rules.length &&
  !org.documents.length &&
  !org.processes.length;

function Onboarding({ client, goArea }: { client: Client; goArea: Props["goArea"] }) {
  const starts: { area: OrgArea; title: string; body: string }[] = [
    {
      area: "entities",
      title: "Entities",
      body: "The companies in the group, with registration details and officers.",
    },
    { area: "structure", title: "Group structure", body: "Who holds the shares in each entity." },
    {
      area: "organogram",
      title: "Organogram",
      body: "Roles, who holds them and who reports to whom.",
    },
    {
      area: "authority",
      title: "Authority & approvals",
      body: "Who recommends, approves and signs, and on what instrument.",
    },
    {
      area: "licences",
      title: "Licences & registrations",
      body: "What each entity is licensed for and when it expires.",
    },
    {
      area: "documents",
      title: "Key documents",
      body: "Constitutions, certificates, registers and resolutions.",
    },
  ];
  return (
    <Panel title={`Nothing is recorded about ${client.name}’s organisation yet`}>
      <p className="ov-lede">
        Recording it lets Scripta answer who signs, which entity contracts, what is owned by whom
        and what is due. Start wherever you have the information.
      </p>
      <ul className="ov-starts">
        {starts
          .filter((s) => areaOn(client, s.area))
          .map((s) => (
            <li key={s.area}>
              <button type="button" onClick={() => goArea(s.area)}>
                <strong>{s.title}</strong>
                <span>{s.body}</span>
              </button>
            </li>
          ))}
      </ul>
    </Panel>
  );
}

function Recorded({
  client,
  org,
  work,
  goArea,
  openTab,
}: {
  client: Client;
  org: Organisation;
  work: ClientWork | null;
  goArea: Props["goArea"];
  openTab: Props["openTab"];
}) {
  const entities = liveEntities(org);
  const jurisdictions = [...new Set(entities.map((e) => e.jurisdiction.trim()).filter(Boolean))];
  const leadership = currentRoles(org).filter((r) => r.kind === "leadership");
  const people = livePeople(org);

  return (
    <>
      <p className="ov-identity">
        {[
          entities.length
            ? `${count(entities.length, "entity", "entities")}${jurisdictions.length ? ` in ${jurisdictions.join(", ")}` : ""}`
            : "",
          people.length ? count(people.length, "person", "people") : "",
          leadership.length
            ? `Led by ${leadership
                .map((r) => `${personName(org, r.holderPersonId) || "vacant"} (${r.title})`)
                .join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="ov-cols">
        <div className="ov-main">
          <Attention client={client} org={org} goArea={goArea} />
          <Structure org={org} goArea={goArea} />
          <Changes org={org} />
        </div>
        <aside className="ov-side">
          <WorkPanel work={work} openTab={openTab} />
          <AuthorityPanel org={org} goArea={goArea} />
          {areaOn(client, "licences") && <LicencePanel org={org} goArea={goArea} />}
        </aside>
      </div>
    </>
  );
}

function Attention({
  client,
  org,
  goArea,
}: {
  client: Client;
  org: Organisation;
  goArea: Props["goArea"];
}) {
  const qc = useQueryClient();
  const write = useOrgWrite(org.clientId);
  const [raised, setRaised] = useState<Record<string, string>>({});
  const compliance = areaOn(client, "licences") || areaOn(client, "calendar");
  const items = attentionItems(org).filter((it) => areaOn(client, it.area));
  const overdue = new Map(overdueOccurrences(org).map((o) => [`occ-${o.key}`, o]));
  const roleFlags = organogramFlags(org);
  const flags = structureFlags(org);
  const gaps = documentGaps(org);
  // Tasks already raised from these records, read through the task policy: each
  // lawyer sees the tasks they can open.
  const originOf = (key: string) =>
    key.startsWith("lic-") ? key.slice(4) : (overdue.get(key)?.record?.id ?? null);
  const originIds = items.map((it) => originOf(it.key)).filter((id): id is string => !!id);
  const existing = useOrgTasks(org, originIds);
  const openTask = (key: string) => {
    const id = originOf(key);
    return !!id && (existing.data ?? []).some((t) => t.originId === id && t.status !== "Done");
  };

  const raise = async (key: string) => {
    let created = false;
    const ok = await write.run(async () => {
      const occ = overdue.get(key);
      const licence = key.startsWith("lic-")
        ? org.licences.find((l) => `lic-${l.id}` === key)
        : undefined;
      const result = occ
        ? await taskForOccurrence(org, occ)
        : licence
          ? await taskForLicenceRenewal(org, licence)
          : null;
      created = !!result?.created;
    });
    if (ok) {
      setRaised((prev) => ({ ...prev, [key]: created ? "Task added" : "Already a task" }));
      void qc.invalidateQueries({ queryKey: ["client-work"] });
      void qc.invalidateQueries({ queryKey: ["org-tasks", org.clientId] });
    }
  };

  const extras = [
    roleFlags.length
      ? {
          key: "roles",
          text: `${count(roleFlags.length, "gap")} in the organogram`,
          area: "organogram" as const,
        }
      : null,
    flags.length
      ? {
          key: "structure",
          text: `${count(flags.length, "inconsistency", "inconsistencies")} in recorded shareholdings`,
          area: "structure" as const,
        }
      : null,
    gaps.length
      ? {
          key: "docs",
          text: `${count(gaps.length, "constitutional document")} not on file`,
          area: "documents" as const,
        }
      : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);

  if (!compliance && !extras.length) return null;
  return (
    <Panel
      title={compliance ? "Compliance" : "Needs attention"}
      right={
        areaOn(client, "calendar") ? (
          <LinkButton onClick={() => goArea("calendar")}>Calendar</LinkButton>
        ) : undefined
      }
    >
      {!compliance ? null : items.length === 0 ? (
        <p className="og-hint">
          Nothing recorded for {client.name} is overdue, lapsed or inside its renewal window.
        </p>
      ) : (
        <ul className="og-rows">
          {items.map((it) => (
            <li key={it.key}>
              <span className={`og-dot is-${it.tone}`} aria-hidden />
              <div className="og-row-main">
                <button type="button" className="ov-row-link" onClick={() => goArea(it.area)}>
                  {it.title}
                </button>
                <span className="og-row-meta">{it.detail}</span>
              </div>
              <div className="og-row-side">
                {!raised[it.key] && openTask(it.key) ? (
                  <span className="og-row-meta">Task in Tasks</span>
                ) : raised[it.key] ? (
                  <span className="og-row-meta" role="status">
                    {raised[it.key]}
                  </span>
                ) : (
                  <LinkButton onClick={() => void raise(it.key)} disabled={write.busy}>
                    Create task
                  </LinkButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ErrorLine error={write.error} />
      {extras.length > 0 && (
        <p className={`ov-extras${compliance ? "" : " is-alone"}`}>
          {extras.map((x, i) => (
            <span key={x.key}>
              {i > 0 && <span aria-hidden> · </span>}
              <LinkButton onClick={() => goArea(x.area)}>{x.text}</LinkButton>
            </span>
          ))}
        </p>
      )}
    </Panel>
  );
}

function Structure({ org, goArea }: { org: Organisation; goArea: Props["goArea"] }) {
  const holdings = holdingsIn(org, "current");
  const entities = entitiesIn(org, "current");
  const heldIds = new Set(holdings.filter((h) => h.ownerEntityId).map((h) => h.subsidiaryEntityId));
  // The top of the group: entities no group entity holds, with whoever does.
  const tops = entities
    .filter((e) => !heldIds.has(e.id))
    .map((e) => ({ entity: e, holders: holdings.filter((h) => h.subsidiaryEntityId === e.id) }));
  const leadership = currentRoles(org)
    .filter((r) => r.kind === "leadership")
    .sort((a, b) => a.position - b.position);

  return (
    <Panel title="The organisation">
      <div className="og-grid-2">
        <div>
          <Eyebrow>Ownership</Eyebrow>
          {tops.length === 0 ? (
            <p className="og-hint">No entities recorded.</p>
          ) : (
            <ul className="og-rows">
              {tops.slice(0, 5).map(({ entity, holders }) => (
                <li key={entity.id}>
                  <div className="og-row-main">
                    <button
                      type="button"
                      className="ov-row-link"
                      onClick={() => goArea("entities", entity.id)}
                    >
                      {entityLabel(entity)}
                    </button>
                    <span className="og-row-meta">
                      {holders.length
                        ? `Held by ${holders.map((h) => `${holderLabel(org, h)} ${percentLabel(h.percent)}`).join(", ")}`
                        : "No shareholders recorded"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <LinkButton onClick={() => goArea("structure")}>Group structure</LinkButton>
        </div>
        <div>
          <Eyebrow>Leadership</Eyebrow>
          {leadership.length === 0 ? (
            <p className="og-hint">No leadership roles recorded.</p>
          ) : (
            <ul className="og-rows">
              {leadership.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <div className="og-row-main">
                    <span className="og-row-title">{r.title}</span>
                    <span className="og-row-meta">
                      {personName(org, r.holderPersonId) || "Vacant"}
                      {r.acting ? " (acting)" : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <LinkButton onClick={() => goArea("organogram")}>Organogram</LinkButton>
        </div>
      </div>
    </Panel>
  );
}

function Changes({ org }: { org: Organisation }) {
  const recent = org.history.slice(0, 5);
  if (!recent.length) return null;
  return (
    <Panel title="Recent organisational changes">
      <ul className="og-rows">
        {recent.map((ev) => (
          <li key={ev.id}>
            <div className="og-row-main">
              <span>{ev.summary}</span>
              <span className="og-row-meta">
                {[
                  ev.effectiveOn ? `Effective ${formatDay(ev.effectiveOn)}` : "",
                  ev.reference ?? "",
                  ev.actor,
                  formatDay(ev.at.slice(0, 10)),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function AuthorityPanel({ org, goArea }: { org: Organisation; goArea: Props["goArea"] }) {
  const current = org.instruments.filter((i) => !i.supersededOn);
  const inferred = org.rules.filter((r) => r.basis === "inferred").length;
  return (
    <Panel
      title="Authority"
      right={<LinkButton onClick={() => goArea("authority")}>Open</LinkButton>}
    >
      {org.rules.length === 0 && current.length === 0 ? (
        <p className="og-hint">No approval or signing rules recorded.</p>
      ) : (
        <ul className="og-rows">
          {current.map((i) => (
            <li key={i.id}>
              <div className="og-row-main">
                <span className="og-row-title">{i.title}</span>
                <span className="og-row-meta">
                  {[
                    i.approvedOn ? `Approved ${formatDay(i.approvedOn)}` : "",
                    i.reviewDueOn ? `review due ${formatDay(i.reviewDueOn)}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            </li>
          ))}
          <li>
            <div className="og-row-main">
              <span>{count(org.rules.length, "rule")}</span>
              {inferred > 0 && (
                <span className="og-row-meta">
                  {count(inferred, "rule")} inferred, not written in an instrument
                </span>
              )}
            </div>
          </li>
        </ul>
      )}
    </Panel>
  );
}

function LicencePanel({ org, goArea }: { org: Organisation; goArea: Props["goArea"] }) {
  const live = org.licences.filter((l) => !l.archivedAt);
  const states = live.map((l) => ({ l, s: licenceStatus(l) }));
  const lapsed = states.filter(
    (x) => x.s.state === "expired" || x.s.state === "lapsed_lodged",
  ).length;
  const due = states.filter((x) => x.s.state === "renewal_due").length;
  const next = states
    .filter((x) => x.l.expiresOn && (x.s.daysLeft ?? -1) >= 0)
    .sort((a, b) => a.l.expiresOn!.localeCompare(b.l.expiresOn!))[0];
  return (
    <Panel
      title="Licences & registrations"
      right={<LinkButton onClick={() => goArea("licences")}>Open</LinkButton>}
    >
      {live.length === 0 ? (
        <p className="og-hint">None recorded.</p>
      ) : (
        <div className="ov-counts">
          <div>
            <strong>{live.length}</strong>
            <span>recorded</span>
          </div>
          <div className={lapsed ? "is-late" : undefined}>
            <strong>{lapsed}</strong>
            <span>expired</span>
          </div>
          <div>
            <strong>{due}</strong>
            <span>renewal due</span>
          </div>
        </div>
      )}
      {next && (
        <p className="og-row-meta">
          Next expiry: {next.l.name}, {formatDay(next.l.expiresOn)}
        </p>
      )}
    </Panel>
  );
}

function WorkPanel({ work, openTab }: { work: ClientWork | null; openTab: Props["openTab"] }) {
  if (!work)
    return (
      <Panel title="Work for this client">
        <p className="og-hint" role="status">
          Loading…
        </p>
      </Panel>
    );
  const matters = work.matters.filter((m) => !m.deletedAt && !m.archivedAt);
  const flows = work.flows.filter((f) => !f.deletedAt && !f.archivedAt);
  const tasks = work.tasks.filter((t) => t.status !== "Done");
  const section = (
    label: string,
    tab: ClientTab,
    rows: { id: string; title: string; meta: string }[],
    total: number,
  ) => (
    <div className="ov-work">
      <div className="ov-work-head">
        <button type="button" className="ov-row-link" onClick={() => openTab(tab)}>
          {label}
        </button>
        <span className="og-mono">{total}</span>
      </div>
      {rows.length > 0 && (
        <ul className="ov-work-rows">
          {rows.map((r) => (
            <li key={r.id}>
              <span>{r.title}</span>
              {r.meta && <span className="og-row-meta">{r.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <Panel title="Work for this client">
      {section(
        "Matters",
        "matters",
        matters.slice(0, 3).map((m) => ({ id: m.id, title: m.name, meta: m.reference })),
        matters.length,
      )}
      {section(
        "Flows",
        "flows",
        flows
          .slice(0, 3)
          .map((f) => ({ id: f.id, title: f.name || "Untitled flow", meta: f.matterName })),
        flows.length,
      )}
      {section(
        "Open tasks",
        "tasks",
        tasks.slice(0, 3).map((t) => ({
          id: t.id,
          title: t.title,
          meta: t.dueDate ? `Due ${formatDay(t.dueDate)}` : "",
        })),
        tasks.length,
      )}
      <p className="og-hint">Only work you can open is listed.</p>
      {matters.length + flows.length + tasks.length === 0 && (
        <Empty
          title="No work filed yet"
          body="Matters, flows and tasks filed under this client appear here."
        />
      )}
    </Panel>
  );
}
