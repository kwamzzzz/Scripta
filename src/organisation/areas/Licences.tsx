/**
 * Licences & registrations: the renewal runway beside the compliance calendar.
 *
 * Two lenses on one dataset. The runway orders licences by how little time is
 * left; the calendar lays the same obligations and expiries out by date. A
 * licence's state is computed from its dates — nobody types "expired" — so the
 * entity register, the overview and this screen always agree.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import type { AreaProps } from "../area";
import { updateRecord } from "../db";
import {
  entityLabel,
  formatDay,
  licenceStatus,
  localDay,
  missingLicenceFields,
  monthLabel,
  overdueOccurrences,
  ownerLabel,
  type ChangeContext,
  type Licence,
  type Organisation,
} from "../model";
import {
  ChangeFields,
  Empty,
  EntitySelect,
  ErrorLine,
  Eyebrow,
  Field,
  OrgDialog,
  OrgPage,
  Panel,
  Pill,
  TextInput,
  count,
  useOrgWrite,
} from "../ui";
import { taskForLicenceRenewal, taskForOccurrence } from "../work";
import { useOrgTasks } from "../registers/hooks";
import LicenceDialog from "../dialogs/LicenceDialog";
import LicenceIntake from "../licences/LicenceIntake";
import { PrerequisiteEditor } from "../licences/form";
import { calendarMonths, licenceSummary } from "../registers/register";
import "../registers.css";

const toneOf = (l: Licence) => {
  const s = licenceStatus(l).state;
  return s === "expired" || s === "lapsed_lodged"
    ? "danger"
    : s === "renewal_due"
      ? "warning"
      : "good";
};

export default function Licences(props: AreaProps) {
  const { org, mode, go } = props;
  const [entityId, setEntityId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Licence | null>(null);
  const [lodging, setLodging] = useState<Licence | null>(null);
  const [renewing, setRenewing] = useState<Licence | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const write = useOrgWrite(org.clientId);
  const today = localDay();

  const licences = useMemo(
    () =>
      org.licences.filter(
        (l) =>
          (showArchived ? !!l.archivedAt : !l.archivedAt) && (!entityId || l.entityId === entityId),
      ),
    [org.licences, showArchived, entityId],
  );
  const tasks = useOrgTasks(
    org,
    org.licences.map((l) => l.id),
  );

  if (mode === "new") return <LicenceIntake {...props} />;

  const withExpiry = licences
    .filter((l) => l.expiresOn)
    .sort((a, b) => (licenceStatus(a).daysLeft ?? 0) - (licenceStatus(b).daysLeft ?? 0));
  const noExpiry = licences.filter((l) => !l.expiresOn);
  const summary = licenceSummary(org, licences, today);
  const openTask = (l: Licence) =>
    tasks.data?.find((t) => t.originId === l.id && t.status !== "Done");

  const startRenewal = (l: Licence) =>
    write.run(async () => {
      await taskForLicenceRenewal(org, l);
      await qc.invalidateQueries({ queryKey: ["org-tasks", org.clientId] });
    });

  const suggestions = org.licences.filter((l) => {
    if (l.archivedAt || dismissed.has(l.id) || openTask(l)) return false;
    const s = licenceStatus(l, today);
    return s.state === "renewal_due" && l.prerequisites.some((p) => !p.done);
  });

  const filter = (id: string | null) => !entityId || id === entityId;
  const months = calendarMonths(org, today, 3, filter, today);
  const atRisk = overdueOccurrences(org, today).filter((o) => filter(o.obligation.entityId));
  const lapsed = org.licences.filter(
    (l) =>
      !l.archivedAt &&
      filter(l.entityId) &&
      ["expired", "lapsed_lodged"].includes(licenceStatus(l, today).state),
  );

  const card = (l: Licence) => {
    const s = licenceStatus(l, today);
    const entity = org.entities.find((e) => e.id === l.entityId);
    const missing = missingLicenceFields(l, org.licenceTypes);
    const needs = l.prerequisites.filter((p) => !p.done);
    const task = openTask(l);
    const owner = ownerLabel(org, l);
    return (
      <LicenceCard
        key={l.id}
        org={org}
        licence={l}
        tone={toneOf(l)}
        header={
          <>
            <span className="rg-lic-name">{l.name}</span>
            {entity && <span className="og-chip">{entityLabel(entity)}</span>}
            {!l.verified && (
              <span
                className="og-chip is-unverified"
                title={
                  missing.length ? `Gaps: ${missing.map((m) => m.label).join(", ")}` : undefined
                }
              >
                Unverified{missing.length ? ` · ${count(missing.length, "gap")}` : ""}
              </span>
            )}
          </>
        }
        pill={<Pill tone={toneOf(l)}>{s.label}</Pill>}
        bar={s.state !== "no_expiry" ? s.windowUsed : null}
        meta={[
          l.expiresOn
            ? `${s.daysLeft !== null && s.daysLeft < 0 ? "Expired" : "Expires"} ${formatDay(l.expiresOn)}`
            : `Registered ${formatDay(l.issuedOn) || l.issuedNote || "—"}`,
          l.renewalState === "lodged"
            ? `Renewal lodged ${formatDay(l.renewalLodgedOn)} · awaiting issue`
            : l.renewalState === "preparing"
              ? "Renewal in preparation"
              : s.state === "renewal_due"
                ? "Renewal window open"
                : "",
          l.recurringNote,
          needs.length ? `Needs ${needs.map((p) => p.label).join(", ")}` : "",
          owner ? `Owner: ${owner}` : "",
        ]}
        actions={
          <>
            {l.expiresOn &&
              (task ? (
                <span className="rg-task-open">Renewal task open</span>
              ) : (
                <Button onClick={() => void startRenewal(l)}>Start renewal</Button>
              ))}
            {l.expiresOn && l.renewalState !== "lodged" && (
              <button type="button" className="org-link" onClick={() => setLodging(l)}>
                Mark lodged
              </button>
            )}
            {l.expiresOn && (
              <button type="button" className="org-link" onClick={() => setRenewing(l)}>
                Mark renewed
              </button>
            )}
            <button type="button" className="org-link" onClick={() => setEditing(l)}>
              Edit
            </button>
          </>
        }
      />
    );
  };

  return (
    <OrgPage
      title="Licences & registrations"
      subtitle={
        licences.length
          ? `${summary.live} live · ${summary.expired} expired · ${count(summary.dueSoon, "renewal", "renewals")} inside 60 days`
          : undefined
      }
      wide
      actions={
        <>
          <div className="rg-filter">
            <EntitySelect org={org} value={entityId} onChange={setEntityId} empty="All entities" />
          </div>
          <Button variant="quiet" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Show current" : "Show archived"}
          </Button>
          <Button variant="primary" onClick={() => go({ mode: "new" })}>
            Add licence
          </Button>
        </>
      }
    >
      <ErrorLine error={write.error} />
      {org.licences.length === 0 ? (
        <Empty
          title="No licences or registrations recorded"
          body="Add each licence, permit and registration the group holds. Expiry dates and renewal lead times put them on the compliance calendar."
          action={
            <Button variant="primary" onClick={() => go({ mode: "new" })}>
              Add licence
            </Button>
          }
        />
      ) : (
        <div className="rg-split">
          <div className="rg-col">
            <Eyebrow>Renewal runway</Eyebrow>
            {withExpiry.length === 0 && (
              <p className="og-muted rg-note">
                No licence with an expiry date{showArchived ? " is archived" : ""}.
              </p>
            )}
            {withExpiry.map(card)}
            {noExpiry.length > 0 && (
              <>
                <Eyebrow>Registrations with no expiry</Eyebrow>
                {noExpiry.map(card)}
              </>
            )}
          </div>
          <div className="rg-col">
            <div className="rg-col-head">
              <Eyebrow>Compliance calendar · next three months</Eyebrow>
              <button
                type="button"
                className="org-link"
                onClick={() => go({ area: "calendar", item: null, mode: null })}
              >
                Full calendar
              </button>
            </div>
            <div className="rg-months">
              {months.map((m) => (
                <div key={m.month} className="rg-month">
                  <strong>{monthLabel(m.month).replace(/ \d{4}$/, "")}</strong>
                  {m.entries.length === 0 && <span className="og-muted">Nothing due</span>}
                  {m.entries.map((e) =>
                    e.kind === "occurrence" ? (
                      <span key={e.key} className={`rg-entry is-${e.occurrence.state}`}>
                        {Number(e.day.slice(8))} · {e.occurrence.obligation.title}
                      </span>
                    ) : (
                      <span key={e.key} className="rg-entry is-expiry">
                        {Number(e.day.slice(8))} · {e.licence.name} expires
                      </span>
                    ),
                  )}
                </div>
              ))}
            </div>
            <Panel
              title="Overdue & at risk"
              right={
                <span className="og-eyebrow">{count(atRisk.length + lapsed.length, "item")}</span>
              }
            >
              {atRisk.length + lapsed.length === 0 ? (
                <p className="og-muted rg-note">Nothing is overdue and no licence has lapsed.</p>
              ) : (
                <ul className="og-rows">
                  {atRisk.map((o) => (
                    <li key={o.key}>
                      <span className="og-dot is-danger" />
                      <div className="og-row-main">
                        <span className="og-row-title">
                          {o.obligation.title}
                          {o.obligation.entityId
                            ? ` — ${entityLabel(org.entities.find((e) => e.id === o.obligation.entityId))}`
                            : ""}
                        </span>
                        <span className="og-row-meta">
                          Was due {formatDay(o.dueOn)}
                          {o.obligation.penaltyNote ? ` · ${o.obligation.penaltyNote}` : ""}
                        </span>
                      </div>
                      <div className="og-row-side">
                        <button
                          type="button"
                          className="org-link"
                          onClick={() =>
                            void write.run(async () => {
                              await taskForOccurrence(org, o);
                              await qc.invalidateQueries({ queryKey: ["org-tasks", org.clientId] });
                            })
                          }
                        >
                          Create task
                        </button>
                      </div>
                    </li>
                  ))}
                  {lapsed.map((l) => (
                    <li key={l.id}>
                      <span className="og-dot is-danger" />
                      <div className="og-row-main">
                        <span className="og-row-title">
                          {l.name}
                          {l.entityId
                            ? ` — ${entityLabel(org.entities.find((e) => e.id === l.entityId))}`
                            : ""}
                        </span>
                        <span className="og-row-meta">
                          {licenceStatus(l, today).label}
                          {l.renewalState === "lodged"
                            ? ` · renewal lodged ${formatDay(l.renewalLodgedOn)}, not yet issued`
                            : ""}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {suggestions.slice(0, 2).map((l) => {
              const needs = l.prerequisites.filter((p) => !p.done).map((p) => p.label);
              return (
                <Panel key={l.id} tone="note" title="Scripta">
                  <p className="rg-suggest">
                    {l.name} needs {needs.join(" and ")} before it expires on{" "}
                    {formatDay(l.expiresOn, "long")}. Create a renewal task?
                  </p>
                  <div className="rg-actions">
                    <Button variant="primary" onClick={() => void startRenewal(l)}>
                      Create task
                    </Button>
                    <Button onClick={() => setDismissed((d) => new Set(d).add(l.id))}>
                      Not now
                    </Button>
                  </div>
                </Panel>
              );
            })}
          </div>
        </div>
      )}
      {editing && (
        <LicenceDialog org={org} licence={editing} open onClose={() => setEditing(null)} />
      )}
      {lodging && <LodgedDialog org={org} licence={lodging} onClose={() => setLodging(null)} />}
      {renewing && <RenewedDialog org={org} licence={renewing} onClose={() => setRenewing(null)} />}
    </OrgPage>
  );
}

function LicenceCard({
  org,
  licence,
  tone,
  header,
  pill,
  bar,
  meta,
  actions,
}: {
  org: Organisation;
  licence: Licence;
  tone: "danger" | "warning" | "good";
  header: ReactNode;
  pill: ReactNode;
  bar: number | null;
  meta: string[];
  actions: ReactNode;
}) {
  const [checklist, setChecklist] = useState(false);
  const write = useOrgWrite(org.clientId);
  const done = licence.prerequisites.filter((p) => p.done).length;
  return (
    <article className={`rg-lic is-${tone}`}>
      <header>
        <div className="rg-lic-title">{header}</div>
        {pill}
      </header>
      {bar !== null && (
        <div className={`og-bar${tone === "good" ? "" : ` is-${tone}`}`} aria-hidden>
          <i style={{ width: `${Math.round(bar * 100)}%` }} />
        </div>
      )}
      <div className="rg-lic-meta">
        {meta.filter(Boolean).map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="rg-lic-actions">
        {actions}
        {(licence.prerequisites.length > 0 || licence.expiresOn) && (
          <button
            type="button"
            className="org-link"
            aria-expanded={checklist}
            onClick={() => setChecklist((v) => !v)}
          >
            Checklist
            {licence.prerequisites.length ? ` ${done}/${licence.prerequisites.length}` : ""}
          </button>
        )}
      </div>
      {checklist && (
        <div className="rg-lic-check">
          <PrerequisiteEditor
            value={licence.prerequisites}
            onChange={(next) =>
              void write.run(() =>
                updateRecord("org_licences", licence.id, { prerequisites: next }),
              )
            }
          />
          <ErrorLine error={write.error} />
        </div>
      )}
    </article>
  );
}

function LodgedDialog({
  org,
  licence,
  onClose,
}: {
  org: Organisation;
  licence: Licence;
  onClose: () => void;
}) {
  const [on, setOn] = useState(localDay());
  const [ref, setRef] = useState("");
  const write = useOrgWrite(org.clientId);
  return (
    <OrgDialog
      open
      title={`Renewal lodged — ${licence.name}`}
      blurb="The licence keeps its expiry date until the renewed licence issues."
      onClose={onClose}
      onSubmit={async () => {
        if (
          await write.run(() =>
            updateRecord(
              "org_licences",
              licence.id,
              { renewal_state: "lodged", renewal_lodged_on: on || null },
              { on, ref },
            ),
          )
        )
          onClose();
      }}
      submitLabel="Record lodgement"
      busy={write.busy}
      error={write.error}
    >
      <Field label="Lodged on">
        <TextInput type="date" value={on} onChange={setOn} />
      </Field>
      <Field label="Receipt or reference">
        <TextInput value={ref} onChange={setRef} />
      </Field>
    </OrgDialog>
  );
}

function RenewedDialog({
  org,
  licence,
  onClose,
}: {
  org: Organisation;
  licence: Licence;
  onClose: () => void;
}) {
  const [expires, setExpires] = useState("");
  const [issued, setIssued] = useState(localDay());
  const [reference, setReference] = useState(licence.reference);
  const [change, setChange] = useState<ChangeContext>({ on: localDay() });
  const write = useOrgWrite(org.clientId);
  return (
    <OrgDialog
      open
      title={`Renewed — ${licence.name}`}
      blurb="The new dates replace the old ones. The previous expiry stays in the licence's history, and the prerequisites reset for the next renewal."
      onClose={onClose}
      onSubmit={async () => {
        if (!expires) return write.setError("Give the new expiry date.");
        const ok = await write.run(() =>
          updateRecord(
            "org_licences",
            licence.id,
            {
              issued_on: issued || null,
              issued_note: "",
              expires_on: expires,
              reference: reference.trim(),
              renewal_state: "none",
              renewal_lodged_on: null,
              prerequisites: licence.prerequisites.map((p) => ({ ...p, done: false })),
            },
            change,
          ),
        );
        if (ok) onClose();
      }}
      submitLabel="Record renewal"
      busy={write.busy}
      error={write.error}
    >
      <Field label="Licence number">
        <TextInput value={reference} onChange={setReference} />
      </Field>
      <Field label="Valid from">
        <TextInput type="date" value={issued} onChange={setIssued} />
      </Field>
      <Field label="New expiry">
        <TextInput type="date" value={expires} onChange={setExpires} autoFocus />
      </Field>
      <ChangeFields value={change} onChange={setChange} />
    </OrgDialog>
  );
}
