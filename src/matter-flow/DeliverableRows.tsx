/**
 * DeliverableChecklist (6a) and ActionList (6d) share one row shell and
 * switch on the deliverable's kind: checkbox, type chip, meta row, state chip
 * and the primary action link.
 */
import type { ReactNode } from "react";
import {
  Calendar,
  Clock,
  CreditCard,
  FileCheck,
  FileText,
  Mail,
  MapPin,
  Paperclip,
  Phone,
  Reply,
} from "lucide-react";
import { OwnerTag } from "@/components/Person";
import { Button } from "@/components/primitives";
import {
  isEmailDeliverable,
  type ActionType,
  type DerivedDeliverable,
  type DerivedPhase,
} from "./model";
import { typeLabel } from "./editor-routes";
import { Eyebrow, LinkAction, StateChip, Tick, TypeChip, fmtDay, FLOW } from "./ui";
import SortableList from "@/components/SortableList";

export type RowIntent =
  | { type: "open"; deliverable: DerivedDeliverable }
  /** Open an email deliverable's draft and the replies logged against it. */
  | { type: "email"; deliverable: DerivedDeliverable }
  | { type: "attach"; deliverable: DerivedDeliverable }
  | { type: "evidence"; deliverable: DerivedDeliverable }
  | { type: "follow-up"; deliverable: DerivedDeliverable }
  | { type: "schedule"; deliverable: DerivedDeliverable }
  /** Put this deliverable on the task list, joined rather than copied. */
  | { type: "task"; deliverable: DerivedDeliverable };

export type RowHandlers = {
  onTick: (deliverable: DerivedDeliverable) => void;
  onIntent: (intent: RowIntent) => void;
  onEdit: (deliverable: DerivedDeliverable) => void;
};

const ACTION_ICON: Record<ActionType, typeof Mail> = {
  meeting: Calendar,
  email: Mail,
  visit: MapPin,
  call: Phone,
  filing: FileCheck,
  payment: CreditCard,
  waiting: Clock,
};

const waitingLabel = (d: DerivedDeliverable, today: string) => {
  const w = d.waitingOn;
  if (!w) return "Waiting";
  const total = w.workingDays ?? Math.max(1, daysInclusive(w.since, w.expectedBy));
  const day = Math.min(total, Math.max(1, daysInclusive(w.since, today)));
  return `Waiting · day ${day}/${total}`;
};

/** Working days from `since` to `to`, counting Mon–Fri after the start day. */
function daysInclusive(since: string, to: string) {
  const start = new Date(since);
  const end = new Date(to);
  let n = 0;
  const c = new Date(start);
  while (c < end) {
    c.setDate(c.getDate() + 1);
    if (c.getDay() !== 0 && c.getDay() !== 6) n++;
  }
  return n;
}

function ListShell({
  title,
  counts,
  controls,
  children,
}: {
  title: string;
  counts: string;
  controls: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mf-list">
      <div className="mf-list-head">
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        <Eyebrow color="#6b6b6b">{counts}</Eyebrow>
        <div style={{ flex: 1 }} />
        {controls}
      </div>
      <div className="mf-list-body">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------- list */

/** The checklist (6a) / action list (6d): one list, each row drawn by its own kind. */
export function DeliverableList({
  phase,
  kind,
  today,
  highlightId,
  controls,
  onAdd,
  handlers,
  onReorder,
}: {
  phase: DerivedPhase;
  /** The matter's default kind: names the list and the Add button. */
  kind: "document" | "action";
  today: string;
  highlightId?: string | null;
  controls: ReactNode;
  onAdd: () => void;
  handlers: RowHandlers;
  /** The phase's deliverable ids in the order they were dragged into. */
  onReorder?: (ids: string[]) => void;
}) {
  const n = (state: DerivedDeliverable["state"]) =>
    phase.deliverables.filter((d) => d.state === state).length;
  const counts = [
    `${phase.deliverables.length} IN THIS PHASE`,
    `${phase.completeCount} ${kind === "action" ? "DONE" : "COMPLETE"}`,
    n("waiting_on") ? `${n("waiting_on")} WAITING` : null,
    n("due_today") ? `${n("due_today")} DUE TODAY` : null,
    n("overdue") ? `${n("overdue")} OVERDUE` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <ListShell
      title={kind === "action" ? "Actions" : "Deliverables"}
      counts={counts}
      controls={
        <>
          {controls}
          <Button variant="primary" onClick={onAdd}>
            {kind === "action" ? "Add action" : "Add deliverable"}
          </Button>
        </>
      }
    >
      {phase.deliverables.length === 0 && (
        <div style={{ color: FLOW.muted, fontSize: 12.5, padding: "12px 2px" }}>
          Nothing in this phase yet. Add the first {kind === "action" ? "action" : "deliverable"}{" "}
          from the proposal's deliverables table.
        </div>
      )}
      <SortableList
        items={phase.deliverables}
        getId={(d) => d.id}
        getLabel={(d) => d.name}
        onReorder={(ids) => onReorder?.(ids)}
        disabled={!onReorder}
        renderItem={(d, handle) => (
          <DeliverableRow
            d={d}
            today={today}
            highlight={d.id === highlightId}
            handlers={handlers}
            handle={handle}
          />
        )}
      />
    </ListShell>
  );
}

/**
 * Every deliverable is drawn by this one row, whatever it is: tick, icon, what
 * it is and why, then owner, date, state and the actions — always in the same
 * columns, in the same order, at the same alignment. Only what sits in those
 * columns changes between a document and an action.
 */
function DeliverableRow({
  d,
  today,
  highlight,
  handlers,
  handle,
}: {
  d: DerivedDeliverable;
  today: string;
  highlight: boolean;
  handlers: RowHandlers;
  /** The drag handle, where the list can be reordered. */
  handle?: ReactNode;
}) {
  const document = d.kind === "document";
  const email = isEmailDeliverable(d);
  const Icon = document ? FileText : (ACTION_ICON[d.type as ActionType] ?? Calendar);

  // Ticking asks for whatever is missing: a final version, or evidence.
  const canTick = document ? d.finalVersion !== null : d.complete || d.evidence.length > 0;
  const tickTitle = d.complete
    ? document
      ? "Untick this deliverable"
      : "Untick this action"
    : canTick
      ? "Tick this as complete"
      : document
        ? "Attach the final version before ticking"
        : "Ticking asks for evidence";
  const onToggle = () =>
    canTick
      ? handlers.onTick(d)
      : handlers.onIntent({ type: document ? "attach" : "evidence", deliverable: d });

  const when =
    d.state === "due_today"
      ? "Today"
      : d.state === "waiting_on" && d.waitingOn
        ? `by ${fmtDay(d.waitingOn.expectedBy)}`
        : fmtDay(d.deadline);
  const chipLabel =
    !document && d.state === "complete"
      ? "Done"
      : !document && d.state === "waiting_on"
        ? waitingLabel(d, today)
        : undefined;

  const files =
    d.versions.length === 0
      ? "No file yet"
      : d.versions.length === 1
        ? d.versions[0]!.isFinal
          ? "1 version"
          : "1 working file"
        : `${d.versions.length} versions`;

  const primary: { label: string; intent: RowIntent } = document
    ? d.complete || d.versions.length > 0
      ? { label: "Open", intent: { type: "open", deliverable: d } }
      : { label: "Attach", intent: { type: "attach", deliverable: d } }
    : d.state === "complete"
      ? { label: "Evidence", intent: { type: "evidence", deliverable: d } }
      : d.state === "waiting_on"
        ? { label: "Follow up", intent: { type: "follow-up", deliverable: d } }
        : d.state === "planned"
          ? { label: "Schedule", intent: { type: "schedule", deliverable: d } }
          : { label: "Log", intent: { type: "evidence", deliverable: d } };

  return (
    <div className={`mf-row${highlight ? " is-highlight" : ""}`} id={`deliverable-${d.id}`}>
      {handle}
      <Tick state={d.state} ticked={d.ticked} title={tickTitle} onToggle={onToggle} />
      <span className="mf-row-icon">
        <Icon size={13} strokeWidth={2} />
      </span>

      <div className="mf-row-main">
        <div className="mf-row-title">
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{d.name}</span>
          <TypeChip>{typeLabel(d)}</TypeChip>
          {!d.mandatory && <TypeChip>Optional</TypeChip>}
        </div>
        {d.description && <div className="mf-row-desc">{d.description}</div>}
        {d.note && <div className="mf-preset-note">{d.note}</div>}
        {(document || (email && d.threads.length > 0)) && (
          <div className="mf-row-meta">
            {document && (
              <span>
                <Paperclip size={11} strokeWidth={2} /> {files}
              </span>
            )}
            {email && d.threads.length > 0 && (
              <span>
                <Reply size={11} strokeWidth={2} /> {d.threads.length}{" "}
                {d.threads.length === 1 ? "reply" : "replies"} logged
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mf-row-side">
        <span className="mf-row-owner">
          <OwnerTag ownerId={d.ownerId} legacy={d.owner} />
        </span>
        <span className="mf-row-when">{when}</span>
        <span className="mf-row-state">
          <StateChip state={d.state} {...(chipLabel ? { label: chipLabel } : {})} />
        </span>
        <span className="mf-row-actions">
          {email && (
            <LinkAction
              onClick={() => handlers.onIntent({ type: "email", deliverable: d })}
              title="Open the draft and the replies logged against it"
            >
              Draft
            </LinkAction>
          )}
          <LinkAction
            onClick={() => handlers.onIntent({ type: "task", deliverable: d })}
            style={{ color: FLOW.muted }}
            title="Put this on your task list, linked to this deliverable"
          >
            Task
          </LinkAction>
          <LinkAction onClick={() => handlers.onEdit(d)} style={{ color: FLOW.muted }}>
            Edit
          </LinkAction>
          <LinkAction
            onClick={() => handlers.onIntent(primary.intent)}
            style={{ width: 78, textAlign: "right" }}
          >
            {primary.label}
          </LinkAction>
        </span>
      </div>
    </div>
  );
}
