/**
 * The Transcript Distiller workspace for one meeting.
 *
 * Three views of the same record, kept apart on purpose:
 *   Distilled   what the meeting established, grouped the way a lawyer reads
 *               it, each item with its source one click away
 *   Transcript  the raw record, exactly as the recorder produced it
 *   People      who was there: an aid to attribution, never a requirement
 *
 * Only uncertainty that matters is raised ("Who is behind this?"), and only
 * above the items, once. Everything else is shown quietly on the item it
 * belongs to.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, FileText, ListChecks, Pencil, RotateCcw, Undo2, X } from "lucide-react";
import AppShell, { Crumbs } from "@/components/AppShell";
import ActionError, { attempt } from "@/components/ActionError";
import { Button } from "@/components/primitives";
import { Modal } from "@/wireframe/screens";
import { AppProvider } from "@/store/app";
import { useWorkspaceRole } from "@/lib/workspace-role";
import { loadFirmPeople, useMatterTeam } from "@/lib/matter-team";
import { useAuth } from "@/lib/auth";
import { relTime } from "@/lib/home-data";
import { distillationKey, fetchDistillation, type Distillation } from "@/lib/distiller-data";
import { useDistillRun } from "@/lib/distill-run";
import {
  approveDistillation,
  createTaskFromItem,
  editItem,
  resolveAttribution,
  reviewItem,
  saveParticipants,
} from "@/lib/distiller.functions";
import {
  ATTRIBUTION_LABEL,
  ITEM_GROUPS,
  ITEM_KINDS,
  KIND_LABEL,
  REVIEW_ROLE,
  ROLE_LABEL,
  TASKABLE,
  needsAttributionReview,
  refName,
  taskAssignee,
  type Item,
  type ItemKind,
  type Participant,
  type Ref,
  type RoleKey,
} from "@/lib/distiller";
import "@/components/organise.css";
import "./distiller.css";

type Tab = "distilled" | "transcript" | "people";

/** A role as one word, for a person who holds several. */
const ROLE_WORD: Record<RoleKey, string> = {
  owner: "owner",
  decisionMaker: "decided",
  speaker: "said",
};

export default function DistillerScreen({ transcriptId }: { transcriptId: string }) {
  const q = useQuery({
    queryKey: distillationKey(transcriptId),
    queryFn: () => fetchDistillation(transcriptId),
    // Another session may be distilling: keep an eye on it until it finishes.
    refetchInterval: (query) => (query.state.data?.status === "distilling" ? 5000 : false),
  });
  const d = q.data;
  // The matter is known only once the transcript has loaded, and the matter
  // provider must not change matter while mounted (its live channel would be
  // subscribed twice), so it wraps the screen only from then on.
  if (!d)
    return (
      <AppShell
        section="transcripts"
        back={{ label: "Transcript distiller", href: "/transcripts" }}
        breadcrumb={
          <Crumbs
            items={[
              { label: "Transcript distiller", to: "/transcripts" },
              { label: q.isError ? "Unavailable" : "Loading…" },
            ]}
          />
        }
      >
        <p role={q.isError ? "alert" : "status"} className="dx-empty">
          {q.isError ? (q.error as Error).message : "Loading the meeting…"}
        </p>
      </AppShell>
    );
  return (
    <AppProvider matterId={d.matterId} initial={{ screen: "transcript" }}>
      <AppShell
        section="transcripts"
        back={{ label: "Transcript distiller", href: "/transcripts" }}
        breadcrumb={
          <Crumbs
            items={[{ label: "Transcript distiller", to: "/transcripts" }, { label: d.title }]}
          />
        }
        trackLabel={d.title}
        assistant={{
          key: `transcript.${transcriptId}`,
          label: d.title,
          matterId: d.matterId,
          screen: "Transcript Distiller",
          intro: "Ask what was agreed on this call, who took what on, and where it was said.",
        }}
      >
        <Workspace d={d} />
      </AppShell>
    </AppProvider>
  );
}

function Workspace({ d }: { d: Distillation }) {
  const qc = useQueryClient();
  // Mirrors can_write_matter: a lead or editor on the matter, and not a
  // firm-wide viewer. The server enforces it either way; this only decides
  // what is offered.
  const { role } = useWorkspaceRole();
  const { user } = useAuth();
  const team = useMatterTeam(d.matterId);
  const mine = team.data?.find((m) => m.userId === user?.id)?.role;
  const canWrite = role !== null && role !== "viewer" && (mine === "lead" || mine === "editor");
  const [tab, setTab] = useState<Tab>("distilled");
  const [error, setError] = useState<string | null>(null);
  const [focusBubbles, setFocusBubbles] = useState<string[]>([]);
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: distillationKey(d.id) });
    void qc.invalidateQueries({ queryKey: ["board"] });
  }, [qc, d.id]);
  const runner = useDistillRun(d.id, refresh);
  const approve = useServerFn(approveDistillation);

  const live = d.items.filter((i) => i.review !== "rejected");
  const pending = live.filter((i) => needsAttributionReview(i));
  const runningHere = runner.progress !== null;
  // A run nobody is driving any more: its tab was closed part-way.
  const stalled =
    d.status === "distilling" && !runningHere && Date.now() - Date.parse(d.updatedAt) > 10 * 60_000;
  const busyElsewhere = d.status === "distilling" && !runningHere && !stalled;

  const showSource = (item: Item) => {
    setFocusBubbles(item.pointIds);
    setTab("transcript");
  };

  return (
    <div className="dx">
      <header className="dx-head">
        <div className="dx-head-text">
          <h1>{d.title}</h1>
          <p>
            {[
              d.date
                ? new Date(d.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : null,
              d.durationMinutes ? `${d.durationMinutes} min` : null,
              `${d.bubbles.length} passages recorded`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <StatusPill d={d} pending={pending.length} />
        {canWrite && (
          <div className="dx-head-actions">
            {d.status === "approved" ? (
              <Button
                onClick={() =>
                  void attempt(
                    "Reopening the record",
                    async () => {
                      await approve({ data: { transcriptId: d.id, approve: false } });
                      refresh();
                    },
                    setError,
                  )
                }
              >
                Reopen for review
              </Button>
            ) : (
              <>
                <Button
                  variant={d.status === "raw" ? "primary" : "secondary"}
                  disabled={runningHere || busyElsewhere}
                  onClick={() => void runner.run()}
                >
                  {d.status === "raw" || stalled ? "Distil" : "Distil again"}
                </Button>
                {d.status === "distilled" && (
                  <Button
                    variant="primary"
                    disabled={pending.length > 0}
                    title={
                      pending.length
                        ? "Answer the attribution questions first"
                        : "Record that a lawyer has reviewed this distillation"
                    }
                    onClick={() =>
                      void attempt(
                        "Approving",
                        async () => {
                          await approve({ data: { transcriptId: d.id, approve: true } });
                          refresh();
                        },
                        setError,
                      )
                    }
                  >
                    Approve
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </header>

      <ActionError
        error={error ?? runner.error}
        onDismiss={() => (setError(null), runner.clearError())}
      />
      {d.error && !runner.error && d.status !== "distilling" && (
        <p className="dx-note">The last distillation did not finish: {d.error}</p>
      )}
      {runner.progress && (
        <div className="dx-progress" role="status">
          <span>
            {runner.progress.phase === "reading"
              ? `Reading the meeting: part ${Math.min(runner.progress.done + 1, runner.progress.total)} of ${runner.progress.total}`
              : "Joining it together and naming the phases of the meeting"}
          </span>
          <div className="dx-bar">
            <i
              style={{
                width: `${Math.round(((runner.progress.done + (runner.progress.phase === "finishing" ? 0.5 : 0)) / (runner.progress.total + 1)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
      {busyElsewhere && (
        <p className="dx-note">
          Being distilled in another window. This page will update when it finishes.
        </p>
      )}
      {stalled && (
        <p className="dx-note">
          The last distillation was interrupted before it finished. Distil to run it again.
        </p>
      )}

      <nav className="dx-tabs" aria-label="Views">
        {(
          [
            ["distilled", `Distilled${live.length ? ` · ${live.length}` : ""}`],
            ["transcript", "Transcript"],
            ["people", `People${d.participants.length ? ` · ${d.participants.length}` : ""}`],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "distilled" && (
        <Distilled
          d={d}
          canWrite={canWrite}
          pending={pending}
          onSource={showSource}
          onError={setError}
          refresh={refresh}
        />
      )}
      {tab === "transcript" && <RawTranscript d={d} focus={focusBubbles} />}
      {tab === "people" && (
        <People d={d} canWrite={canWrite} onError={setError} refresh={refresh} />
      )}
    </div>
  );
}

function StatusPill({ d, pending }: { d: Distillation; pending: number }) {
  const text =
    d.status === "approved"
      ? `Approved ${d.approvedAt ? relTime(d.approvedAt) : ""}`
      : d.status === "distilled"
        ? pending
          ? `Distilled · ${pending} to check`
          : "Distilled · ready to approve"
        : d.status === "distilling"
          ? "Distilling"
          : "Raw transcript";
  return <span className={`dx-pill dx-pill-${d.status}`}>{text}</span>;
}

/* ---------------------------------------------------------------- distilled */

function Distilled({
  d,
  canWrite,
  pending,
  onSource,
  onError,
  refresh,
}: {
  d: Distillation;
  canWrite: boolean;
  pending: Item[];
  onSource: (item: Item) => void;
  onError: (m: string) => void;
  refresh: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [tasking, setTasking] = useState<Item | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  if (d.status === "raw" || (!d.items.length && d.status !== "distilled"))
    return (
      <div className="dx-empty">
        <p>
          Nothing distilled yet. Distilling reads the whole meeting, rebuilds what was actually said
          from the recorder's fragments, and sets out the decisions, commitments, positions and open
          points, each linked to where it was said.
        </p>
        <p className="dx-muted">
          The recorder's speaker labels are treated as hints. Where it matters who said something
          and Scripta is not sure, it will ask you.
        </p>
      </div>
    );

  const live = d.items.filter((i) => i.review !== "rejected");
  const rejected = d.items.filter((i) => i.review === "rejected");

  return (
    <div className="dx-distilled">
      {d.summary && (
        <section className="dx-summary">
          <h2>What the meeting established</h2>
          <p>{d.summary}</p>
          {d.episodes.length > 0 && (
            <ol className="dx-episodes">
              {d.episodes.map((e) => (
                <li key={`${e.fromOrdinal}-${e.title}`}>{e.title}</li>
              ))}
            </ol>
          )}
        </section>
      )}

      {pending.length > 0 && (
        <section className="dx-review" aria-label="Attribution questions">
          <h2>Who is behind these? · {pending.length}</h2>
          <p className="dx-muted">
            These matter because of who is behind them, and the recording does not make it clear.
            Answer what you know; the rest can stay unattributed.
          </p>
          {pending.map((item) => (
            <ReviewQuestion
              key={item.id}
              d={d}
              item={item}
              canWrite={canWrite}
              onError={onError}
              refresh={refresh}
              onSource={onSource}
            />
          ))}
        </section>
      )}

      {ITEM_GROUPS.map((g) => {
        const rows = live.filter((i) => g.kinds.includes(i.kind));
        if (!rows.length) return null;
        return (
          <section key={g.key} className="dx-group">
            <h2>
              {g.label} <span>{rows.length}</span>
            </h2>
            {rows.map((item) => (
              <ItemCard
                key={item.id}
                d={d}
                item={item}
                open={open === item.id}
                onToggle={() => setOpen(open === item.id ? null : item.id)}
                canWrite={canWrite}
                onSource={() => onSource(item)}
                onEdit={() => setEditing(item)}
                onTask={() => setTasking(item)}
                onError={onError}
                refresh={refresh}
              />
            ))}
          </section>
        );
      })}

      {rejected.length > 0 && (
        <section className="dx-group dx-rejected">
          <button type="button" className="dx-link" onClick={() => setShowRejected(!showRejected)}>
            {showRejected ? "Hide" : "Show"} {rejected.length} rejected
          </button>
          {showRejected &&
            rejected.map((item) => (
              <ItemCard
                key={item.id}
                d={d}
                item={item}
                open={open === item.id}
                onToggle={() => setOpen(open === item.id ? null : item.id)}
                canWrite={canWrite}
                onSource={() => onSource(item)}
                onEdit={() => setEditing(item)}
                onTask={() => setTasking(item)}
                onError={onError}
                refresh={refresh}
              />
            ))}
        </section>
      )}

      {editing && <EditItem item={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {tasking && (
        <CreateTask d={d} item={tasking} onClose={() => setTasking(null)} onSaved={refresh} />
      )}
    </div>
  );
}

/** Who is behind an item, one chip per person: when the same person is
 *  owner, decider and speaker at the same confidence, that is said once. */
function roleLine(item: Item) {
  const out: { roles: RoleKey[]; ref: Ref }[] = [];
  const main = REVIEW_ROLE[item.kind];
  for (const role of ["owner", "decisionMaker", "speaker"] as RoleKey[]) {
    const ref = item.roles[role];
    if (!ref) continue;
    // An unknown speaker is only worth saying where the speaker matters.
    if (ref.status === "unattributed" && role !== main) continue;
    const same = out.find(
      (o) =>
        (ref.participant || ref.name) &&
        o.ref.status === ref.status &&
        o.ref.participant === ref.participant &&
        o.ref.name === ref.name,
    );
    if (same) same.roles.push(role);
    else out.push({ roles: [role], ref });
  }
  return out;
}

function ItemCard({
  d,
  item,
  open,
  onToggle,
  canWrite,
  onSource,
  onEdit,
  onTask,
  onError,
  refresh,
}: {
  d: Distillation;
  item: Item;
  open: boolean;
  onToggle: () => void;
  canWrite: boolean;
  onSource: () => void;
  onEdit: () => void;
  onTask: () => void;
  onError: (m: string) => void;
  refresh: () => void;
}) {
  const review = useServerFn(reviewItem);
  const [asking, setAsking] = useState<RoleKey | null>(null);
  const set = (state: "confirmed" | "rejected" | "distilled", what: string) =>
    void attempt(
      what,
      async () => {
        await review({ data: { itemId: item.id, state } });
        refresh();
      },
      onError,
    );
  const units = d.units.filter((u) => item.unitIds.includes(u.id));
  const bubbles = d.bubbles.filter((b) => item.pointIds.includes(b.id));
  const roles = roleLine(item);

  return (
    <article className={`dx-item dx-review-${item.review}`} data-item={item.id}>
      <div className="dx-item-top">
        <span className={`dx-kind dx-kind-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
        {item.reported && (
          <span
            className="dx-tag"
            title="Someone reported this; the meeting did not itself decide or verify it"
          >
            Reported
          </span>
        )}
        {item.substance !== "high" && (
          <span
            className="dx-tag"
            title="How closely the wording could be reconstructed from the recording"
          >
            Wording: {item.substance} confidence
          </span>
        )}
        {item.review === "confirmed" && <span className="dx-tag dx-tag-ok">Checked</span>}
        {item.review === "edited" && <span className="dx-tag dx-tag-ok">Edited</span>}
        {item.taskId && (
          <Link className="dx-tag dx-tag-ok" to="/tasks">
            Task created
          </Link>
        )}
      </div>
      <h3>{item.title}</h3>
      {item.statement && <p>{item.statement}</p>}
      <div className="dx-roles">
        {roles.map(({ roles: held, ref }) => {
          const name = refName(ref, d.participants);
          const role = held[0]!;
          return (
            <button
              key={role}
              type="button"
              className={`dx-role dx-att-${ref.status}`}
              disabled={!canWrite}
              title={ref.basis ?? ""}
              onClick={() => setAsking(asking === role ? null : role)}
            >
              {held.length === 1
                ? `${ROLE_LABEL[role]}: ${name ?? "not stated"}`
                : `${name} · ${held.map((r) => ROLE_WORD[r]).join(", ")}`}
              {ref.status !== "confirmed" && ref.status !== "unattributed" && (
                <em> · {ATTRIBUTION_LABEL[ref.status].toLowerCase()}</em>
              )}
            </button>
          );
        })}
        {item.roles.subjects?.length ? (
          <span className="dx-muted">About: {item.roles.subjects.join(", ")}</span>
        ) : null}
        {item.due && <span className="dx-muted">Due: {item.due}</span>}
      </div>
      {asking && (
        <Resolver
          d={d}
          item={item}
          role={asking}
          onDone={() => {
            setAsking(null);
            refresh();
          }}
          onError={onError}
        />
      )}
      <div className="dx-item-actions">
        <button type="button" className="dx-link" onClick={onToggle} aria-expanded={open}>
          <FileText size={13} aria-hidden /> {open ? "Hide source" : "Source"}
        </button>
        {canWrite && item.review !== "rejected" && (
          <>
            {item.review !== "confirmed" && item.review !== "edited" && (
              <button
                type="button"
                className="dx-link"
                onClick={() => set("confirmed", "Marking as checked")}
              >
                <Check size={13} aria-hidden /> Checked
              </button>
            )}
            <button type="button" className="dx-link" onClick={onEdit}>
              <Pencil size={13} aria-hidden /> Edit
            </button>
            {TASKABLE.includes(item.kind) && !item.taskId && (
              <button type="button" className="dx-link" onClick={onTask}>
                <ListChecks size={13} aria-hidden /> Create task
              </button>
            )}
            <button
              type="button"
              className="dx-link dx-quiet"
              onClick={() => set("rejected", "Rejecting")}
            >
              <X size={13} aria-hidden /> Reject
            </button>
          </>
        )}
        {canWrite && (item.review === "rejected" || item.review === "confirmed") && (
          <button
            type="button"
            className="dx-link dx-quiet"
            onClick={() => set("distilled", "Undoing")}
          >
            <Undo2 size={13} aria-hidden /> Undo {item.review === "rejected" ? "reject" : "check"}
          </button>
        )}
      </div>
      {open && (
        <div className="dx-source">
          {units.map((u) => (
            <p key={u.id} className="dx-unit">
              <span className="dx-muted">Reconstructed{u.episode ? ` · ${u.episode}` : ""}</span>
              {u.text}
            </p>
          ))}
          <div className="dx-bubbles">
            <span className="dx-muted">As recorded</span>
            {bubbles.map((b) => (
              <div key={b.id} className="dx-bubble">
                <span className="dx-ts">{b.ts}</span>
                <span className="dx-label">{b.label || "Unlabelled"}</span>
                <span>{b.text}</span>
              </div>
            ))}
          </div>
          <button type="button" className="dx-link" onClick={onSource}>
            Open in the transcript
          </button>
        </div>
      )}
    </article>
  );
}

/** One attribution question, as it appears in "Who is behind these?". */
function ReviewQuestion({
  d,
  item,
  canWrite,
  onError,
  refresh,
  onSource,
}: {
  d: Distillation;
  item: Item;
  canWrite: boolean;
  onError: (m: string) => void;
  refresh: () => void;
  onSource: (item: Item) => void;
}) {
  const role = needsAttributionReview(item)!;
  const ref = item.roles[role]!;
  const guess = refName(ref, d.participants);
  const question =
    role === "owner"
      ? "Who is to do this?"
      : role === "decisionMaker"
        ? "Who made this decision?"
        : "Who said this?";
  const units = d.units.filter((u) => item.unitIds.includes(u.id));
  return (
    <div className="dx-question">
      <div>
        <span className={`dx-kind dx-kind-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
        <strong>{item.title}</strong>
      </div>
      {units[0] && <p className="dx-unit">“{units.map((u) => u.text).join(" … ")}”</p>}
      <p className="dx-muted">
        {question} {guess ? `Scripta's guess is ${guess}` : "Scripta cannot tell"}
        {ref.basis ? ` (${ref.basis.replace(/\.$/, "")})` : ""}.{" "}
        <button type="button" className="dx-link" onClick={() => onSource(item)}>
          See it in the transcript
        </button>
      </p>
      {canWrite && (
        <Resolver d={d} item={item} role={role} onDone={refresh} onError={onError} inline />
      )}
    </div>
  );
}

/** Choose who is behind an item: a participant, someone else by name, or nobody. */
function Resolver({
  d,
  item,
  role,
  onDone,
  onError,
  inline,
}: {
  d: Distillation;
  item: Item;
  role: RoleKey;
  onDone: () => void;
  onError: (m: string) => void;
  inline?: boolean;
}) {
  const resolve = useServerFn(resolveAttribution);
  const [other, setOther] = useState<string | null>(null);
  const current = item.roles[role];
  // People the meeting itself names, beyond those listed as participants:
  // offered as quick answers, never assumed.
  const named = [
    ...new Set(
      [current, ...d.items.flatMap((i) => [i.roles.speaker, i.roles.owner, i.roles.decisionMaker])]
        .map((r) => (r && !r.participant ? r.name : undefined))
        .filter((n): n is string => !!n),
    ),
  ].sort();
  const send = (choice: { participant: string } | { name: string } | { none: true }) =>
    void attempt(
      "Saving who is behind it",
      async () => {
        await resolve({ data: { itemId: item.id, role, choice } });
        onDone();
      },
      onError,
    );
  return (
    <div
      className={`dx-resolver${inline ? " dx-resolver-inline" : ""}`}
      role="group"
      aria-label={`${ROLE_LABEL[role]} for ${item.title}`}
    >
      {!inline && <span className="dx-muted">{ROLE_LABEL[role]}:</span>}
      {d.participants.map((p) => (
        <button
          key={p.key}
          type="button"
          className={current?.participant === p.key ? "is-guess" : undefined}
          onClick={() => send({ participant: p.key })}
        >
          {p.name}
        </button>
      ))}
      {named.map((n) => (
        <button
          key={n}
          type="button"
          className={current?.name === n && !current.participant ? "is-guess" : undefined}
          onClick={() => send({ name: n })}
        >
          {n}
        </button>
      ))}
      {other === null ? (
        <button type="button" onClick={() => setOther("")}>
          Someone else…
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (other.trim()) send({ name: other.trim() });
          }}
        >
          <input
            autoFocus
            value={other}
            placeholder="Their name"
            onChange={(e) => setOther(e.target.value)}
          />
          <button type="submit" disabled={!other.trim()}>
            Save
          </button>
        </form>
      )}
      <button type="button" className="dx-quiet" onClick={() => send({ none: true })}>
        Leave unattributed
      </button>
    </div>
  );
}

function EditItem({
  item,
  onClose,
  onSaved,
}: {
  item: Item;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(editItem);
  const [draft, setDraft] = useState({
    kind: item.kind,
    title: item.title,
    statement: item.statement,
    due: item.due ?? "",
    reported: item.reported,
  });
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} label="Edit item">
      <form
        className="org-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void attempt(
            "Saving",
            async () => {
              await save({ data: { itemId: item.id, ...draft, due: draft.due.trim() || null } });
              onSaved();
              onClose();
            },
            setError,
          );
        }}
      >
        <h2>Edit item</h2>
        <p>Your wording replaces Scripta's. The source it was drawn from stays linked.</p>
        <label className="org-field">
          <span className="org-label">Kind</span>
          <select
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as ItemKind })}
          >
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="org-field">
          <span className="org-label">Heading</span>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label className="org-field">
          <span className="org-label">What was said</span>
          <textarea
            rows={4}
            value={draft.statement}
            onChange={(e) => setDraft({ ...draft, statement: e.target.value })}
          />
        </label>
        <label className="org-field">
          <span className="org-label">Due (as said)</span>
          <input
            value={draft.due}
            placeholder="e.g. by Friday"
            onChange={(e) => setDraft({ ...draft, due: e.target.value })}
          />
        </label>
        <label className="dx-check">
          <input
            type="checkbox"
            checked={draft.reported}
            onChange={(e) => setDraft({ ...draft, reported: e.target.checked })}
          />
          Reported by someone, not decided or verified in this meeting
        </label>
        {error && <p className="org-error">{error}</p>}
        <div className="org-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!draft.title.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateTask({
  d,
  item,
  onClose,
  onSaved,
}: {
  d: Distillation;
  item: Item;
  onClose: () => void;
  onSaved: () => void;
}) {
  const create = useServerFn(createTaskFromItem);
  const [title, setTitle] = useState(item.title);
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const assignee = taskAssignee(item, d.participants);
  const owner = item.roles.owner;
  const ownerName = refName(owner, d.participants);
  const who = assignee
    ? `It will be assigned to ${ownerName}.`
    : owner?.status === "confirmed" && ownerName
      ? `${ownerName} is not linked to a Scripta account, so it will be created unassigned.`
      : ownerName
        ? `It will be created unassigned: ${ownerName} is only ${ATTRIBUTION_LABEL[owner!.status].toLowerCase()} to be the owner. Confirm the owner first to assign it.`
        : "It will be created unassigned: the meeting did not make clear who owns it.";
  return (
    <Modal open onClose={onClose} label="Create task">
      <form
        className="org-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void attempt(
            "Creating the task",
            async () => {
              await create({
                data: { itemId: item.id, title: title.trim(), dueDate: due || null },
              });
              onSaved();
              onClose();
            },
            setError,
          );
        }}
      >
        <h2>Create a task from this</h2>
        <p>{who}</p>
        <label className="org-field">
          <span className="org-label">Task</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="org-field">
          <span className="org-label">
            Due date{item.due ? ` (the meeting said: ${item.due})` : ""}
          </span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        {error && <p className="org-error">{error}</p>}
        <div className="org-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!title.trim()}>
            Create task
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------- transcript */

function RawTranscript({ d, focus }: { d: Distillation; focus: string[] }) {
  useEffect(() => {
    if (!focus.length) return;
    document.querySelector(`[data-bubble="${focus[0]}"]`)?.scrollIntoView({ block: "center" });
  }, [focus]);
  const heading = new Map(d.episodes.map((e) => [e.fromOrdinal, e.title]));
  return (
    <div className="dx-raw">
      <p className="dx-muted">
        Exactly as recorded. The speaker labels are the recorder's and may be wrong; they are never
        changed here.
      </p>
      {d.bubbles.map((b) => (
        <div key={b.id}>
          {heading.has(b.ordinal) && <h3 className="dx-episode">{heading.get(b.ordinal)}</h3>}
          <div className={`dx-bubble${focus.includes(b.id) ? " is-focus" : ""}`} data-bubble={b.id}>
            <span className="dx-ts">{b.ts}</span>
            <span className="dx-label">{b.label || "Unlabelled"}</span>
            <span>{b.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ people */

function People({
  d,
  canWrite,
  onError,
  refresh,
}: {
  d: Distillation;
  canWrite: boolean;
  onError: (m: string) => void;
  refresh: () => void;
}) {
  const save = useServerFn(saveParticipants);
  const [rows, setRows] = useState<Participant[]>(d.participants);
  const [adding, setAdding] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => setRows(d.participants), [d.participants]);
  const { data: members = [] } = useQuery({
    queryKey: ["firm-people", d.matterId],
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("matters")
        .select("workspace_id")
        .eq("id", d.matterId)
        .single();
      return data ? loadFirmPeople(data.workspace_id) : [];
    },
  });
  const used = useMemo(() => {
    const n: Record<string, number> = {};
    for (const i of d.items)
      for (const r of ["speaker", "owner", "decisionMaker"] as RoleKey[]) {
        const p = i.roles[r]?.participant;
        if (p) n[p] = (n[p] ?? 0) + 1;
      }
    return n;
  }, [d.items]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(d.participants);
  const commit = (next: Participant[]) =>
    void attempt(
      "Saving who was there",
      async () => {
        await save({ data: { transcriptId: d.id, participants: next } });
        setSaved(true);
        refresh();
      },
      onError,
    );

  return (
    <div className="dx-people">
      <p className="dx-muted">
        Optional. Naming who was in the meeting lets Scripta attribute to real people rather than
        the recorder's labels, and lets a confirmed owner receive a task. It is never required, and
        it does not relabel the transcript.
      </p>
      {rows.length === 0 && <p>No one named yet.</p>}
      {rows.map((p, i) => (
        <div key={p.key} className="dx-person">
          <input
            aria-label="Name"
            value={p.name}
            disabled={!canWrite}
            onChange={(e) =>
              setRows(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))
            }
          />
          <span className="dx-muted">
            {p.source === "lawyer" ? "Named by you" : "Named in the recording"}
          </span>
          <select
            aria-label="Scripta account"
            value={p.userId ?? ""}
            disabled={!canWrite}
            onChange={(e) =>
              setRows(rows.map((r, j) => (j === i ? { ...r, userId: e.target.value || null } : r)))
            }
          >
            <option value="">Not a Scripta user</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="dx-muted">
            {used[p.key] ? `On ${used[p.key]} item${used[p.key] === 1 ? "" : "s"}` : ""}
          </span>
          {canWrite && !used[p.key] && (
            <button
              type="button"
              className="dx-link dx-quiet"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          )}
        </div>
      ))}
      {canWrite && (
        <form
          className="dx-person"
          onSubmit={(e) => {
            e.preventDefault();
            const name = adding.trim();
            if (!name) return;
            const n =
              rows.reduce((m, r) => Math.max(m, Number(r.key.replace(/\D/g, "")) || 0), 0) + 1;
            setRows([...rows, { key: `p${n}`, name, source: "lawyer", userId: null }]);
            setAdding("");
          }}
        >
          <input
            value={adding}
            placeholder="Add someone who was there"
            onChange={(e) => setAdding(e.target.value)}
          />
          <Button type="submit" disabled={!adding.trim()}>
            Add
          </Button>
        </form>
      )}
      {canWrite && dirty && (
        <div className="org-actions" style={{ justifyContent: "flex-start" }}>
          <Button variant="primary" onClick={() => commit(rows.filter((r) => r.name.trim()))}>
            Save
          </Button>
          <Button onClick={() => setRows(d.participants)}>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <RotateCcw size={13} aria-hidden /> Discard changes
            </span>
          </Button>
        </div>
      )}
      {saved && d.status !== "raw" && !dirty && (
        <p className="dx-muted">
          Saved. Items already distilled keep their attribution; distilling again lets Scripta use
          these names.
        </p>
      )}
    </div>
  );
}
