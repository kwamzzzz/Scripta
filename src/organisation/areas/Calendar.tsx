/**
 * The compliance calendar: every dated duty the group has, by month.
 *
 * Occurrences are generated from the obligations, so a monthly return shows in
 * every month. Only what has been done to an occurrence is stored — done,
 * waived, a task raised — and anything past due with none of those is overdue.
 * The expiry of each licence sits on the same calendar because it comes from
 * the same register.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import { downloadBytes } from "@/lib/export/download";
import { supabase } from "@/integrations/supabase/client";
import type { AreaProps } from "../area";
import {
  RECURRENCE_LABEL,
  addDays,
  dueDates,
  entityLabel,
  formatDay,
  localDay,
  monthLabel,
  occurrencesBetween,
  overdueOccurrences,
  ownerLabel,
  type DatedOccurrence,
  type Obligation,
  type Organisation,
} from "../model";
import {
  Empty,
  EntitySelect,
  ErrorLine,
  Field,
  OrgDialog,
  OrgPage,
  Panel,
  Pill,
  Segmented,
  TextArea,
  TextInput,
  count,
  useOrgWrite,
} from "../ui";
import { taskForOccurrence } from "../work";
import ObligationDialog from "../dialogs/ObligationDialog";
import { OBLIGATION_KIND_LABEL } from "../registers/labels";
import { organisationIcs } from "../ics";
import { calendarMonths, entityName } from "../registers/register";
import { useOrgTasks } from "../registers/hooks";
import "../registers.css";

type Range = "3" | "6" | "12";

const STATE_LABEL: Record<DatedOccurrence["state"], string> = {
  done: "Done",
  waived: "Waived",
  overdue: "Overdue",
  due_soon: "Due soon",
  upcoming: "Upcoming",
};

const STATE_TONE = {
  done: "good",
  waived: "retired",
  overdue: "danger",
  due_soon: "warning",
  upcoming: "neutral",
} as const;

/** Record what happened to one occurrence; the generated date is the key. */
async function setOccurrence(
  org: Organisation,
  occ: DatedOccurrence,
  state: "open" | "done" | "waived",
  note: string,
) {
  const { error } = await supabase.from("org_obligation_occurrences").upsert(
    {
      workspace_id: org.workspaceId,
      client_id: org.clientId,
      obligation_id: occ.obligation.id,
      due_on: occ.dueOn,
      state,
      completed_on: state === "open" ? null : localDay(),
      note,
    },
    { onConflict: "obligation_id,due_on" },
  );
  if (error) throw new Error(error.message);
}

const nextDue = (o: Obligation, today: string) =>
  dueDates(o, today, addDays(today, 800))[0] ?? null;

export default function Calendar({ org, client }: AreaProps) {
  const [range, setRange] = useState<Range>("6");
  const [entityId, setEntityId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Obligation | "new" | null>(null);
  const [selected, setSelected] = useState<DatedOccurrence | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const write = useOrgWrite(org.clientId);
  const qc = useQueryClient();
  const today = localDay();

  const filter = (id: string | null) => !entityId || id === entityId;
  const overdue = overdueOccurrences(org, today).filter((o) => filter(o.obligation.entityId));
  const months = calendarMonths(org, today, Number(range), filter, today);
  const obligations = org.obligations.filter(
    (o) => (showArchived ? !!o.archivedAt : !o.archivedAt) && filter(o.entityId),
  );
  const tasks = useOrgTasks(
    org,
    org.occurrences.map((o) => o.id),
  );
  const dueInRange = months.reduce(
    (n, m) =>
      n +
      m.entries.filter(
        (e) =>
          e.kind === "occurrence" &&
          e.occurrence.state !== "done" &&
          e.occurrence.state !== "waived",
      ).length,
    0,
  );

  const raiseTask = (occ: DatedOccurrence) =>
    write.run(async () => {
      await taskForOccurrence(org, occ);
      await qc.invalidateQueries({ queryKey: ["org-tasks", org.clientId] });
    });

  // Re-read the selected occurrence from the records so its dialog reflects a
  // write made while it is open.
  const current = selected
    ? (occurrencesBetween(org, selected.dueOn, selected.dueOn, today).find(
        (o) => o.key === selected.key,
      ) ?? selected)
    : null;

  return (
    <OrgPage
      title="Compliance calendar"
      subtitle={
        org.obligations.length
          ? `${count(overdue.length, "overdue item")} · ${dueInRange} due in the next ${range} months · ${count(org.obligations.filter((o) => !o.archivedAt).length, "obligation")}`
          : undefined
      }
      wide
      actions={
        <>
          <Segmented
            label="Months shown"
            value={range}
            onChange={setRange}
            options={[
              { id: "3", label: "3 months" },
              { id: "6", label: "6 months" },
              { id: "12", label: "12 months" },
            ]}
          />
          <div className="rg-filter">
            <EntitySelect org={org} value={entityId} onChange={setEntityId} empty="All entities" />
          </div>
          <Button
            title="A file for your calendar. Download again to pick up changes; it is not a live feed."
            onClick={() =>
              downloadBytes(
                new TextEncoder().encode(organisationIcs(org, client.name, today)),
                `${client.name.replace(/[^\w.-]+/g, "-")}-compliance.ics`,
                "text/calendar",
              )
            }
          >
            Download .ics
          </Button>
          <Button variant="primary" onClick={() => setEditing("new")}>
            Add obligation
          </Button>
        </>
      }
    >
      <ErrorLine error={write.error} />
      {org.obligations.length === 0 && org.licences.every((l) => !l.expiresOn) ? (
        <Empty
          title="Nothing on the calendar yet"
          body="Add the group's recurring filings, returns and meetings. Licence expiries appear here as soon as a licence with an expiry date is recorded."
          action={
            <Button variant="primary" onClick={() => setEditing("new")}>
              Add obligation
            </Button>
          }
        />
      ) : (
        <>
          <Panel
            title="Overdue & at risk"
            right={<span className="og-eyebrow">{count(overdue.length, "item")}</span>}
            {...(overdue.length ? { tone: "danger" as const } : {})}
          >
            {overdue.length === 0 ? (
              <p className="og-muted rg-note">Nothing is overdue.</p>
            ) : (
              <ul className="og-rows">
                {overdue.map((o) => (
                  <li key={o.key}>
                    <span className="og-dot is-danger" />
                    <div className="og-row-main">
                      <button type="button" className="rg-row-link" onClick={() => setSelected(o)}>
                        {o.obligation.title}
                        {o.obligation.entityId
                          ? ` — ${entityName(org, o.obligation.entityId)}`
                          : ""}
                      </button>
                      <span className="og-row-meta">
                        Was due {formatDay(o.dueOn)}
                        {o.obligation.penaltyNote ? ` · ${o.obligation.penaltyNote}` : ""}
                        {ownerLabel(org, o.obligation) ? ` · ${ownerLabel(org, o.obligation)}` : ""}
                      </span>
                    </div>
                    <div className="og-row-side">
                      <button type="button" className="org-link" onClick={() => void raiseTask(o)}>
                        Create task
                      </button>
                      <button type="button" className="org-link" onClick={() => setSelected(o)}>
                        Record
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="rg-cal">
            {months.map((m) => (
              <section key={m.month} className="rg-cal-month">
                <h3>{monthLabel(m.month)}</h3>
                {m.entries.length === 0 ? (
                  <p className="og-muted rg-note">Nothing due.</p>
                ) : (
                  <ul>
                    {m.entries.map((e) =>
                      e.kind === "occurrence" ? (
                        <li key={e.key}>
                          <button
                            type="button"
                            className={`rg-cal-item is-${e.occurrence.state}`}
                            onClick={() => setSelected(e.occurrence)}
                          >
                            <span className="rg-cal-day">{Number(e.day.slice(8))}</span>
                            <span className="rg-cal-text">
                              {e.occurrence.obligation.title}
                              {e.occurrence.obligation.entityId ? (
                                <span className="og-muted">
                                  {" "}
                                  · {entityName(org, e.occurrence.obligation.entityId)}
                                </span>
                              ) : null}
                            </span>
                            {(e.occurrence.state === "done" ||
                              e.occurrence.state === "waived" ||
                              e.occurrence.state === "overdue") && (
                              <span className="rg-cal-state">
                                {STATE_LABEL[e.occurrence.state]}
                              </span>
                            )}
                          </button>
                        </li>
                      ) : (
                        <li key={e.key}>
                          <div className="rg-cal-item is-expiry">
                            <span className="rg-cal-day">{Number(e.day.slice(8))}</span>
                            <span className="rg-cal-text">
                              {e.licence.name} expires
                              {e.licence.entityId ? (
                                <span className="og-muted">
                                  {" "}
                                  · {entityName(org, e.licence.entityId)}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <Panel
            title="Obligations"
            right={
              <button type="button" className="org-link" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? "Show current" : "Show archived"}
              </button>
            }
          >
            {obligations.length === 0 ? (
              <p className="og-muted rg-note">
                {showArchived ? "No archived obligations." : "No obligations recorded."}
              </p>
            ) : (
              <table className="og-table">
                <thead>
                  <tr>
                    <th>Obligation</th>
                    <th>Entity</th>
                    <th>Repeats</th>
                    <th>Next due</th>
                    <th>Owner</th>
                    <th>Licence</th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.map((o) => {
                    const next = nextDue(o, today);
                    return (
                      <tr key={o.id} className="is-selectable" onClick={() => setEditing(o)}>
                        <td>
                          <span className="og-strong">{o.title}</span>
                          <div className="og-muted">{OBLIGATION_KIND_LABEL[o.kind]}</div>
                        </td>
                        <td>
                          {entityName(org, o.entityId) || <span className="og-muted">Group</span>}
                        </td>
                        <td>{RECURRENCE_LABEL[o.recurrence]}</td>
                        <td>
                          {next ? formatDay(next) : <span className="og-muted">None ahead</span>}
                        </td>
                        <td>{ownerLabel(org, o) || <span className="og-muted">—</span>}</td>
                        <td>{org.licences.find((l) => l.id === o.licenceId)?.name ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {editing && (
        <ObligationDialog
          org={org}
          obligation={editing === "new" ? null : editing}
          open
          onClose={() => setEditing(null)}
          defaults={{ entityId }}
        />
      )}
      {current && (
        <OccurrenceDialog
          org={org}
          occurrence={current}
          tasks={(tasks.data ?? []).filter((t) => t.originId === current.record?.id)}
          onRaiseTask={() => void raiseTask(current)}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setSelected(null);
            setEditing(current.obligation);
          }}
        />
      )}
    </OrgPage>
  );
}

function OccurrenceDialog({
  org,
  occurrence,
  tasks,
  onRaiseTask,
  onClose,
  onEdit,
}: {
  org: Organisation;
  occurrence: DatedOccurrence;
  tasks: { id: string; title: string; status: string }[];
  onRaiseTask: () => void;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [note, setNote] = useState(occurrence.record?.note ?? "");
  const [state, setState] = useState<"done" | "waived" | "open">(
    occurrence.record?.state === "waived" ? "waived" : "done",
  );
  const write = useOrgWrite(org.clientId);
  const o = occurrence.obligation;
  const closed = occurrence.state === "done" || occurrence.state === "waived";
  const entity = org.entities.find((e) => e.id === o.entityId);
  return (
    <OrgDialog
      open
      title={`${o.title}${entity ? ` — ${entityLabel(entity)}` : ""}`}
      blurb={`Due ${formatDay(occurrence.dueOn, "long")} · ${RECURRENCE_LABEL[o.recurrence].toLowerCase()}`}
      onClose={onClose}
      onSubmit={async () => {
        const next = closed ? "open" : state;
        if (next === "waived" && !note.trim()) return write.setError("Say why it was waived.");
        if (await write.run(() => setOccurrence(org, occurrence, next, note.trim()))) onClose();
      }}
      submitLabel={closed ? "Reopen" : state === "waived" ? "Record as waived" : "Record as done"}
      busy={write.busy}
      error={write.error}
      extra={
        <Button variant="quiet" onClick={onEdit}>
          Edit obligation
        </Button>
      }
    >
      <div className="rg-occ">
        <Pill tone={STATE_TONE[occurrence.state]}>{STATE_LABEL[occurrence.state]}</Pill>
        {occurrence.record?.completedOn && closed && (
          <span className="og-muted">
            {occurrence.state === "done" ? "Done" : "Waived"}{" "}
            {formatDay(occurrence.record.completedOn)}
          </span>
        )}
      </div>
      {(ownerLabel(org, o) || o.penaltyNote) && (
        <p className="og-muted rg-note">
          {[
            ownerLabel(org, o) ? `Owner at the client: ${ownerLabel(org, o)}` : "",
            o.penaltyNote ? `Penalty: ${o.penaltyNote}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <div className="rg-occ-tasks">
        <span className="org-label">Tasks</span>
        {tasks.length ? (
          <ul className="og-rows">
            {tasks.map((t) => (
              <li key={t.id}>
                <div className="og-row-main">
                  <span className="og-row-title">{t.title}</span>
                  <span className="og-row-meta">{t.status === "Done" ? "Complete" : t.status}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="og-muted rg-note">No task of yours for this occurrence.</p>
        )}
        {!tasks.some((t) => t.status !== "Done") && !closed && (
          <div>
            <Button onClick={onRaiseTask}>Create task</Button>
          </div>
        )}
      </div>
      {!closed && (
        <Field label="Outcome">
          <Segmented
            label="Outcome"
            value={state === "open" ? "done" : state}
            onChange={(v) => setState(v)}
            options={[
              { id: "done", label: "Done" },
              { id: "waived", label: "Waived" },
            ]}
          />
        </Field>
      )}
      {!closed && (
        <Field
          label={state === "waived" ? "Why it was waived" : "Note"}
          hint={state === "done" ? "e.g. filing receipt number" : undefined}
        >
          {state === "waived" ? (
            <TextArea value={note} onChange={setNote} rows={2} />
          ) : (
            <TextInput value={note} onChange={setNote} />
          )}
        </Field>
      )}
      {closed && occurrence.record?.note && <p className="rg-note">{occurrence.record.note}</p>}
    </OrgDialog>
  );
}
