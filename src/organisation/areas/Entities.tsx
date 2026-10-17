/**
 * The entity register: one row per company in the client's group, with the
 * facts a lawyer is asked for on the phone.
 *
 * Standing is derived, never typed: an overdue filing on the calendar or a
 * lapsed licence turns the entity's status here. "What this entity still
 * needs" is the same obligations and gaps filtered to one entity, each with the
 * action that deals with it — a task in Tasks, a matter, a document — rather
 * than a to-do list that lives only on this screen.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/primitives";
import NewMatterDialog from "@/components/NewMatterDialog";
import { downloadBytes } from "@/lib/export/download";
import { relTime } from "@/lib/home-data";
import type { AreaProps } from "../area";
import { mattersForEntity, setMatterEntity, updateRecord } from "../db";
import {
  CAPACITY_LABEL,
  ENTITY_STATUS_LABEL,
  RECURRENCE_LABEL,
  addDays,
  dueDates,
  entityLabel,
  entityStanding,
  formatDay,
  holderLabel,
  holdingsBy,
  licenceStatus,
  liveEntities,
  localDay,
  ownerLabel,
  percentLabel,
  personName,
  shareholdersOf,
  type Appointment,
  type Entity,
  type FieldSource,
  type Organisation,
} from "../model";
import {
  Empty,
  ErrorLine,
  Eyebrow,
  Facts,
  OrgPage,
  Panel,
  Pill,
  Select,
  count,
  useOrgWrite,
} from "../ui";
import { taskForLicenceRenewal, taskForOccurrence } from "../work";
import EntityDialog from "../dialogs/EntityDialog";
import { ENTITY_FIELDS } from "../registers/labels";
import AppointmentDialog from "../dialogs/AppointmentDialog";
import ObligationDialog from "../dialogs/ObligationDialog";
import UploadDocumentDialog from "../dialogs/UploadDocumentDialog";
import RecordDocuments from "../components/RecordDocuments";
import {
  directorCount,
  entityNeeds,
  heldBySummary,
  registerCsv,
  type EntityNeed,
} from "../registers/register";
import "../registers.css";

const TONE = { good: "good", warning: "warning", danger: "danger", neutral: "neutral" } as const;

type Dialog =
  | { kind: "entity"; entity: Entity | null }
  | { kind: "appointment"; appointment: Appointment | null; entityId: string }
  | { kind: "obligation"; entityId: string }
  | { kind: "document"; entity: Entity }
  | { kind: "matter"; entity: Entity };

export default function Entities(props: AreaProps) {
  const { org, item, mode } = props;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const entity = org.entities.find((e) => e.id === item) ?? null;

  const dialogs = (
    <EntityDialogs
      org={org}
      dialog={dialog}
      close={() => setDialog(null)}
      clientName={props.client.name}
      clientId={props.client.id}
    />
  );

  if (mode === "record" && entity)
    return (
      <>
        <EntityRecord {...props} entity={entity} open={setDialog} />
        {dialogs}
      </>
    );
  return (
    <>
      <Register {...props} selected={entity} open={setDialog} />
      {dialogs}
    </>
  );
}

function EntityDialogs({
  org,
  dialog,
  close,
  clientName,
  clientId,
}: {
  org: Organisation;
  dialog: Dialog | null;
  close: () => void;
  clientName: string;
  clientId: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  if (!dialog) return null;
  switch (dialog.kind) {
    case "entity":
      return <EntityDialog org={org} entity={dialog.entity} open onClose={close} />;
    case "appointment":
      return (
        <AppointmentDialog
          org={org}
          appointment={dialog.appointment}
          open
          onClose={close}
          defaults={{ entityId: dialog.entityId }}
        />
      );
    case "obligation":
      return (
        <ObligationDialog
          org={org}
          obligation={null}
          open
          onClose={close}
          defaults={{ entityId: dialog.entityId }}
        />
      );
    case "document":
      return (
        <UploadDocumentDialog
          org={org}
          open
          onClose={close}
          defaultCategory="constitution"
          link={{ recordType: "entity", recordId: dialog.entity.id, label: dialog.entity.name }}
        />
      );
    case "matter":
      return (
        <NewMatterDialog
          open
          onClose={close}
          client={{ kind: "existing", id: clientId, name: clientName }}
          initialName={`${entityLabel(dialog.entity)} — corporate housekeeping`}
          onCreated={async (matterId) => {
            // The matter concerns this entity; the matter's own access rules decide who sees it.
            await setMatterEntity(matterId, dialog.entity.id);
            await qc.invalidateQueries({ queryKey: ["entity-matters", dialog.entity.id] });
            close();
            void navigate({
              to: "/matters/$matterId",
              params: { matterId },
              search: { screen: "matter" } as never,
            });
          }}
        />
      );
  }
}

/* ---------------------------------------------------------------- register */

function Register({
  org,
  client,
  go,
  selected,
  open,
}: AreaProps & { selected: Entity | null; open: (d: Dialog) => void }) {
  const [jurisdiction, setJurisdiction] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const today = localDay();

  const all = org.entities.filter((e) => !e.proposedChangeId);
  const jurisdictions = [...new Set(all.map((e) => e.jurisdiction).filter(Boolean))].sort();
  const rows = all
    .filter((e) => (showArchived ? !!e.archivedAt : !e.archivedAt))
    .filter((e) => !jurisdiction || e.jurisdiction === jurisdiction);
  const live = liveEntities(org);
  const overdue = live.filter((e) =>
    entityStanding(org, e.id, today).label.includes("overdue"),
  ).length;
  const liveJurisdictions = new Set(live.map((e) => e.jurisdiction).filter(Boolean)).size;

  return (
    <OrgPage
      title="Entities"
      subtitle={
        live.length
          ? `${count(live.length, "company", "companies")} · ${count(liveJurisdictions, "jurisdiction")}${overdue ? ` · ${count(overdue, "entity", "entities")} with an overdue filing` : ""}`
          : undefined
      }
      wide
      actions={
        <>
          {jurisdictions.length > 1 && (
            <div className="rg-filter">
              <Select
                value={jurisdiction}
                onChange={(v) => setJurisdiction(v)}
                options={jurisdictions.map((j) => ({ value: j, label: j }))}
                empty="All jurisdictions"
              />
            </div>
          )}
          <Button variant="quiet" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Show current" : "Show archived"}
          </Button>
          <Button
            disabled={!rows.length}
            onClick={() =>
              downloadBytes(
                new TextEncoder().encode(registerCsv(org, rows, today)),
                `${client.name.replace(/[^\w.-]+/g, "-")}-entity-register.csv`,
                "text/csv",
              )
            }
          >
            Export register
          </Button>
          <Button variant="primary" onClick={() => open({ kind: "entity", entity: null })}>
            Add entity
          </Button>
        </>
      }
    >
      {all.length === 0 ? (
        <Empty
          title="No entities recorded"
          body="Add each company in the group: the facts on its certificate, its directors and who holds its shares. A single company client has one entity."
          action={
            <Button variant="primary" onClick={() => open({ kind: "entity", entity: null })}>
              Add entity
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <p className="og-muted rg-note">
          {showArchived ? "No archived entities." : "No entity in that jurisdiction."}
        </p>
      ) : (
        <div className="og-panel rg-table-wrap">
          <table className="og-table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Jurisdiction</th>
                <th>Reg. no.</th>
                <th>Incorp.</th>
                <th>Directors</th>
                <th>Held by</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const standing = entityStanding(org, e.id, today);
                return (
                  <tr
                    key={e.id}
                    className={`is-selectable${selected?.id === e.id ? " is-selected" : ""}`}
                    onClick={() => go({ item: selected?.id === e.id ? null : e.id })}
                  >
                    <td>
                      <button
                        type="button"
                        className="rg-row-link"
                        aria-pressed={selected?.id === e.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          go({ item: selected?.id === e.id ? null : e.id });
                        }}
                      >
                        {e.name}
                      </button>
                    </td>
                    <td>{e.jurisdiction || <span className="og-muted">—</span>}</td>
                    <td className="og-mono">
                      {e.registrationNo || <span className="og-muted">—</span>}
                    </td>
                    <td>{e.incorporatedOn?.slice(0, 4) ?? <span className="og-muted">—</span>}</td>
                    <td>{directorCount(org, e.id, today)}</td>
                    <td>
                      {heldBySummary(org, e.id, today) || <span className="og-muted">—</span>}
                    </td>
                    <td>
                      <Pill tone={e.archivedAt ? "retired" : TONE[standing.tone]}>
                        {e.archivedAt ? "Archived" : standing.label}
                      </Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selected && !selected.proposedChangeId && (
        <Selected org={org} entity={selected} go={go} open={open} />
      )}
    </OrgPage>
  );
}

function Selected({
  org,
  entity,
  go,
  open,
}: {
  org: Organisation;
  entity: Entity;
  go: AreaProps["go"];
  open: (d: Dialog) => void;
}) {
  const [former, setFormer] = useState(false);
  const today = localDay();
  const officers = org.appointments.filter((a) => a.entityId === entity.id);
  const current = officers.filter(
    (a) => (!a.appointedOn || a.appointedOn <= today) && (!a.ceasedOn || a.ceasedOn > today),
  );
  const past = officers.filter((a) => a.ceasedOn && a.ceasedOn <= today);
  const holders = shareholdersOf(org, entity.id, today);

  return (
    <div className="og-grid-2 rg-selected">
      <Panel
        title={
          <>
            {entity.name} <span className="og-eyebrow rg-inline-eyebrow">Selected</span>
          </>
        }
        right={
          <>
            <button
              type="button"
              className="org-link"
              onClick={() => open({ kind: "entity", entity })}
            >
              Edit
            </button>
            <button type="button" className="org-link" onClick={() => go({ mode: "record" })}>
              Open full record
            </button>
          </>
        }
      >
        <div className="rg-detail">
          <div>
            <Eyebrow>Registered office</Eyebrow>
            <p>{entity.registeredOffice || <span className="og-muted">Not recorded</span>}</p>
          </div>
          <div>
            <Eyebrow>Objects & activity</Eyebrow>
            <p>{entity.activity || <span className="og-muted">Not recorded</span>}</p>
          </div>
          <div>
            <Eyebrow>Directors & secretary</Eyebrow>
            <OfficerList
              org={org}
              rows={current}
              onEdit={(a) => open({ kind: "appointment", appointment: a, entityId: entity.id })}
            />
            {past.length > 0 && (
              <button
                type="button"
                className="org-link"
                aria-expanded={former}
                onClick={() => setFormer((v) => !v)}
              >
                {former ? "Hide" : "Show"} {count(past.length, "former officer")}
              </button>
            )}
            {former && (
              <OfficerList
                org={org}
                rows={past}
                past
                onEdit={(a) => open({ kind: "appointment", appointment: a, entityId: entity.id })}
              />
            )}
            <button
              type="button"
              className="org-link"
              onClick={() => open({ kind: "appointment", appointment: null, entityId: entity.id })}
            >
              Record an appointment
            </button>
          </div>
          <div>
            <Eyebrow>Share capital</Eyebrow>
            <p>{entity.shareCapital || <span className="og-muted">Not recorded</span>}</p>
            <Eyebrow>Shareholders</Eyebrow>
            {holders.length ? (
              <ul className="rg-plain">
                {holders.map((h) => (
                  <li key={h.id}>
                    {holderLabel(org, h)} — {percentLabel(h.percent)}
                    {h.instrument ? <span className="og-muted"> · {h.instrument}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="og-muted">
                None recorded.{" "}
                <button
                  type="button"
                  className="org-link"
                  onClick={() => go({ area: "structure", item: entity.id, mode: null })}
                >
                  Group structure
                </button>
              </p>
            )}
          </div>
        </div>
      </Panel>
      <Needs org={org} entity={entity} open={open} go={go} />
    </div>
  );
}

function OfficerList({
  org,
  rows,
  past,
  onEdit,
}: {
  org: Organisation;
  rows: Appointment[];
  past?: boolean;
  onEdit: (a: Appointment) => void;
}) {
  if (!rows.length) return <p className="og-muted">None recorded.</p>;
  return (
    <ul className="rg-plain">
      {rows.map((a) => (
        <li key={a.id}>
          <button type="button" className="rg-row-link is-plain" onClick={() => onEdit(a)}>
            {personName(org, a.personId)}
          </button>{" "}
          — {(a.title || CAPACITY_LABEL[a.capacity]).toLowerCase()}
          <span className="og-muted">
            {past
              ? ` · ${formatDay(a.appointedOn) || "?"} to ${formatDay(a.ceasedOn)}`
              : a.appointedOn
                ? ` · since ${formatDay(a.appointedOn)}`
                : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Needs({
  org,
  entity,
  open,
  go,
}: {
  org: Organisation;
  entity: Entity;
  open: (d: Dialog) => void;
  go: AreaProps["go"];
}) {
  const write = useOrgWrite(org.clientId);
  const qc = useQueryClient();
  const [raised, setRaised] = useState<Set<string>>(new Set());
  const needs = entityNeeds(org, entity.id);

  const act = async (n: EntityNeed) => {
    switch (n.action.kind) {
      case "occurrence": {
        const occ = n.action.occurrence;
        if (await write.run(() => taskForOccurrence(org, occ))) {
          setRaised((r) => new Set(r).add(n.key));
          await qc.invalidateQueries({ queryKey: ["org-tasks", org.clientId] });
        }
        return;
      }
      case "licence": {
        const licence = n.action.licence;
        if (await write.run(() => taskForLicenceRenewal(org, licence))) {
          setRaised((r) => new Set(r).add(n.key));
          await qc.invalidateQueries({ queryKey: ["org-tasks", org.clientId] });
        }
        return;
      }
      case "edit":
        return open({ kind: "entity", entity });
      case "officer":
        return open({ kind: "appointment", appointment: null, entityId: entity.id });
      case "document":
        return open({ kind: "document", entity });
    }
  };

  const label = (n: EntityNeed) =>
    raised.has(n.key)
      ? "Task in Tasks"
      : n.action.kind === "occurrence" || n.action.kind === "licence"
        ? "Create task"
        : n.action.kind === "edit"
          ? "Edit facts"
          : n.action.kind === "officer"
            ? "Record directors"
            : "Add document";

  return (
    <Panel
      title="What this entity still needs"
      right={
        <button
          type="button"
          className="org-link"
          onClick={() => open({ kind: "obligation", entityId: entity.id })}
        >
          Add obligation
        </button>
      }
    >
      {needs.length === 0 ? (
        <p className="og-muted rg-note">
          Nothing outstanding: no filing overdue or due soon, licences current, and the record is
          complete.
        </p>
      ) : (
        <ul className="og-rows">
          {needs.map((n) => (
            <li key={n.key}>
              <span className={`og-dot${n.tone === "neutral" ? "" : ` is-${n.tone}`}`} />
              <div className="og-row-main">
                <span className="og-row-title">{n.title}</span>
                <span className="og-row-meta">{n.detail}</span>
              </div>
              <div className="og-row-side">
                {n.action.kind === "licence" ? (
                  <button
                    type="button"
                    className="org-link"
                    onClick={() =>
                      go({
                        area: "licences",
                        item: n.action.kind === "licence" ? n.action.licence.id : null,
                        mode: null,
                      })
                    }
                  >
                    Open
                  </button>
                ) : null}
                <button
                  type="button"
                  className="org-link"
                  disabled={raised.has(n.key) || write.busy}
                  onClick={() => void act(n)}
                >
                  {label(n)}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ErrorLine error={write.error} />
      <div className="rg-matter">
        <Button onClick={() => open({ kind: "matter", entity })}>Open as a matter</Button>
        <span className="og-muted">
          A matter filed to this client, concerning {entityLabel(entity)}.
        </span>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------- full record */

const COLUMN: Record<string, string> = {
  name: "name",
  entityType: "entity_type",
  jurisdiction: "jurisdiction",
  registrationNo: "registration_no",
  taxNo: "tax_no",
  incorporatedOn: "incorporated_on",
  registeredOffice: "registered_office",
  activity: "activity",
  shareCapital: "share_capital",
};

function EntityRecord({
  org,
  entity,
  go,
  on,
  open,
}: AreaProps & { entity: Entity; open: (d: Dialog) => void }) {
  const today = localDay();
  const standing = entityStanding(org, entity.id, today);
  const officers = [...org.appointments.filter((a) => a.entityId === entity.id)].sort((a, b) =>
    (b.appointedOn ?? "").localeCompare(a.appointedOn ?? ""),
  );
  const holders = shareholdersOf(org, entity.id, today);
  const holds = holdingsBy(org, entity.id, today);
  const licences = org.licences.filter((l) => l.entityId === entity.id && !l.archivedAt);
  const obligations = org.obligations.filter((o) => o.entityId === entity.id && !o.archivedAt);
  const history = org.history.filter(
    (h) => h.recordId === entity.id || officers.some((a) => a.id === h.recordId),
  );
  const matters = useQuery({
    queryKey: ["entity-matters", entity.id],
    retry: false,
    queryFn: () => mattersForEntity(entity.id),
  });
  const sources = Object.entries(entity.fieldSources) as [string, FieldSource][];
  const docName = (id: string | null) =>
    org.documents.find((d) => d.id === id)?.name ?? "A document";
  const fieldLabel = (key: string) => ENTITY_FIELDS.find((f) => f.key === key)?.label ?? key;
  const write = useOrgWrite(org.clientId);

  const resolve = (
    key: string,
    useValue: { value: string; documentId: string | null; page: number | null } | null,
  ) => {
    const existing = entity.fieldSources[key];
    if (!existing) return;
    const nextSources = {
      ...entity.fieldSources,
      [key]: useValue
        ? {
            value: useValue.value,
            documentId: useValue.documentId,
            page: useValue.page,
            confidence: null,
            conflicts: [],
          }
        : { ...existing, conflicts: [] },
    };
    const column = COLUMN[key];
    const patch: Record<string, unknown> = { field_sources: nextSources };
    if (useValue && column) patch[column] = useValue.value;
    void write.run(() => updateRecord("org_entities", entity.id, patch));
  };

  return (
    <OrgPage
      title={entity.name}
      subtitle={
        <>
          <button type="button" className="org-link" onClick={() => go({ mode: null })}>
            Entities
          </button>{" "}
          · {entity.entityType || "Entity"}
          {entity.jurisdiction ? ` · ${entity.jurisdiction}` : ""}
          {entity.archivedAt ? " · Archived" : ""}
        </>
      }
      wide
      actions={
        <>
          <Pill tone={TONE[standing.tone]}>{standing.label}</Pill>
          <Button onClick={() => open({ kind: "matter", entity })}>Open as a matter</Button>
          <Button variant="primary" onClick={() => open({ kind: "entity", entity })}>
            Edit facts
          </Button>
        </>
      }
    >
      <ErrorLine error={write.error} />
      <div className="og-grid-2">
        <Panel title="Key facts">
          <Facts
            rows={[
              ["Registered name", entity.name],
              ["Short name", entity.shortName],
              ["Type", entity.entityType],
              ["Jurisdiction", entity.jurisdiction],
              [
                "Registration no.",
                entity.registrationNo ? (
                  <span className="og-mono">{entity.registrationNo}</span>
                ) : (
                  ""
                ),
              ],
              ["Tax no.", entity.taxNo ? <span className="og-mono">{entity.taxNo}</span> : ""],
              ["Incorporated", formatDay(entity.incorporatedOn, "long")],
              ["Status", ENTITY_STATUS_LABEL[entity.status]],
              ["Registered office", entity.registeredOffice],
              ["Objects & activity", entity.activity],
              ["Share capital", entity.shareCapital],
              ["Notes", entity.notes],
              [
                "Last change",
                entity.lastChangeRef
                  ? `${entity.lastChangeRef}${entity.lastChangeOn ? ` · ${formatDay(entity.lastChangeOn)}` : ""}`
                  : "",
              ],
            ]}
          />
          {standing.reasons.length > 0 && (
            <ul className="rg-plain rg-reasons">
              {standing.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Where the facts came from">
          {sources.length === 0 ? (
            <p className="og-muted rg-note">
              Every fact on this record was entered by hand. Read facts from a filing to keep their
              source.
            </p>
          ) : (
            <ul className="og-rows">
              {sources.map(([key, src]) => (
                <li key={key}>
                  <div className="og-row-main">
                    <span className="og-row-meta">{fieldLabel(key)}</span>
                    <span className="og-row-title">{src.value}</span>
                    <span className="og-row-meta">
                      {docName(src.documentId)}
                      {src.page ? ` · page ${src.page}` : ""}
                      {src.confidence !== null
                        ? ` · read with ${Math.round(src.confidence * 100)}% confidence`
                        : ""}
                    </span>
                    {(src.conflicts ?? []).map((c, i) => (
                      <div key={i} className="rg-flag">
                        {docName(c.documentId)}
                        {c.page ? ` (page ${c.page})` : ""} says “{c.value}”.{" "}
                        <button type="button" className="org-link" onClick={() => resolve(key, c)}>
                          Use this value
                        </button>{" "}
                        <button
                          type="button"
                          className="org-link"
                          onClick={() => resolve(key, null)}
                        >
                          Keep “{src.value}”
                        </button>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Officers"
        right={
          <button
            type="button"
            className="org-link"
            onClick={() => open({ kind: "appointment", appointment: null, entityId: entity.id })}
          >
            Record an appointment
          </button>
        }
      >
        {officers.length === 0 ? (
          <p className="og-muted rg-note">No directors or officers recorded.</p>
        ) : (
          <table className="og-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Office</th>
                <th>Appointed</th>
                <th>Ceased</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {officers.map((a) => {
                const ceased = !!a.ceasedOn && a.ceasedOn <= today;
                return (
                  <tr
                    key={a.id}
                    className={`is-selectable${ceased ? " rg-ceased" : ""}`}
                    onClick={() =>
                      open({ kind: "appointment", appointment: a, entityId: entity.id })
                    }
                  >
                    <td>{personName(org, a.personId)}</td>
                    <td>{a.title || CAPACITY_LABEL[a.capacity]}</td>
                    <td>{formatDay(a.appointedOn) || <span className="og-muted">—</span>}</td>
                    <td>
                      {a.ceasedOn ? (
                        formatDay(a.ceasedOn)
                      ) : (
                        <span className="og-muted">In office</span>
                      )}
                    </td>
                    <td className="og-muted">{a.lastChangeRef ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <div className="og-grid-2">
        <Panel
          title="Ownership"
          right={
            <button
              type="button"
              className="org-link"
              onClick={() => go({ area: "structure", item: entity.id, mode: null })}
            >
              Group structure
            </button>
          }
        >
          <Eyebrow>Held by</Eyebrow>
          {holders.length ? (
            <ul className="rg-plain">
              {holders.map((h) => (
                <li key={h.id}>
                  {holderLabel(org, h)} — {percentLabel(h.percent)}
                  {h.instrument ? <span className="og-muted"> · {h.instrument}</span> : null}
                  {h.effectiveFrom ? (
                    <span className="og-muted"> · since {formatDay(h.effectiveFrom)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="og-muted">No shareholders recorded.</p>
          )}
          <Eyebrow>Holds</Eyebrow>
          {holds.length ? (
            <ul className="rg-plain">
              {holds.map((h) => (
                <li key={h.id}>
                  {entityLabel(org.entities.find((e) => e.id === h.subsidiaryEntityId))} —{" "}
                  {percentLabel(h.percent)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="og-muted">No holdings in other group entities.</p>
          )}
        </Panel>
        <Panel title="Documents">
          <RecordDocuments org={org} recordType="entity" recordId={entity.id} label={entity.name} />
        </Panel>
      </div>

      {(on("licences") || on("calendar")) && (
        <div className="og-grid-2">
          {on("licences") && (
            <Panel
              title="Licences & registrations"
              right={
                <button
                  type="button"
                  className="org-link"
                  onClick={() => go({ area: "licences", item: null, mode: null })}
                >
                  All licences
                </button>
              }
            >
              {licences.length === 0 ? (
                <p className="og-muted rg-note">None recorded for this entity.</p>
              ) : (
                <ul className="og-rows">
                  {licences.map((l) => {
                    const s = licenceStatus(l, today);
                    return (
                      <li key={l.id}>
                        <div className="og-row-main">
                          <span className="og-row-title">{l.name}</span>
                          <span className="og-row-meta">
                            {[l.authority, l.reference, !l.verified ? "unverified" : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                        <div className="og-row-side">
                          <Pill
                            tone={
                              s.state === "expired" || s.state === "lapsed_lodged"
                                ? "danger"
                                : s.state === "renewal_due"
                                  ? "warning"
                                  : "good"
                            }
                          >
                            {s.label}
                          </Pill>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          )}
          {on("calendar") && (
            <Panel
              title="Obligations"
              right={
                <button
                  type="button"
                  className="org-link"
                  onClick={() => open({ kind: "obligation", entityId: entity.id })}
                >
                  Add obligation
                </button>
              }
            >
              {obligations.length === 0 ? (
                <p className="og-muted rg-note">
                  No filings or recurring duties recorded for this entity.
                </p>
              ) : (
                <ul className="og-rows">
                  {obligations.map((o) => {
                    const next = dueDates(o, today, addDays(today, 800))[0];
                    return (
                      <li key={o.id}>
                        <div className="og-row-main">
                          <span className="og-row-title">{o.title}</span>
                          <span className="og-row-meta">
                            {RECURRENCE_LABEL[o.recurrence]}
                            {next ? ` · next ${formatDay(next)}` : ""}
                            {ownerLabel(org, o) ? ` · ${ownerLabel(org, o)}` : ""}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          )}
        </div>
      )}

      <div className="og-grid-2">
        <Panel title="Matters about this entity" hint="Only matters you can open are listed.">
          {matters.isError ? (
            <p className="org-error" role="alert">
              {(matters.error as Error).message}
            </p>
          ) : !matters.data ? (
            <p className="og-muted rg-note" role="status">
              Loading…
            </p>
          ) : matters.data.length === 0 ? (
            <p className="og-muted rg-note">None that you can open.</p>
          ) : (
            <ul className="og-rows">
              {matters.data.map((m) => (
                <li key={m.id}>
                  <div className="og-row-main">
                    <Link
                      className="og-row-title"
                      to="/matters/$matterId"
                      params={{ matterId: m.id }}
                      search={{ screen: "matter" } as never}
                    >
                      {m.name}
                    </Link>
                    <span className="og-row-meta">
                      {[m.reference, `updated ${relTime(m.updatedAt)}`].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="History">
          {history.length === 0 ? (
            <p className="og-muted rg-note">No changes recorded.</p>
          ) : (
            <ul className="og-rows">
              {history.slice(0, 20).map((h) => (
                <li key={h.id}>
                  <div className="og-row-main">
                    <span className="og-row-title">{h.summary}</span>
                    <span className="og-row-meta">
                      {[
                        h.actor,
                        relTime(h.at),
                        h.effectiveOn ? `effective ${formatDay(h.effectiveOn)}` : "",
                        h.reference ?? "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </OrgPage>
  );
}
