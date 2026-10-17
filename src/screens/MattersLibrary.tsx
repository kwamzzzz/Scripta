import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { C, mono, riskColors } from "@/lib/tokens";
import {
  MATTER_FIELDS,
  setMatterArchived,
  updateMatter,
  type MatterPatch,
} from "@/lib/matter-edit";
import AppShell, { Crumbs } from "@/components/AppShell";
import { Button } from "@/components/primitives";
import Library, { type LibColumn, type LibView } from "@/components/Library";
import MoveToWorkspace from "@/components/MoveToWorkspace";
import LibraryEmpty from "@/components/LibraryEmpty";
import MatterCard, { useOpenMatter } from "@/components/MatterCard";
import NewMatterDialog from "@/components/NewMatterDialog";
import ClientPicker from "@/components/ClientPicker";
import { setMatterClient } from "@/lib/clients";
import { resolveClient } from "@/lib/organise";
import ReviewMatterCard from "@/screens/ReviewMatterCard";
import { loadMatterSummaries } from "@/lib/matter-summary";
import { useBoard } from "@/lib/use-board";
import { useAuth } from "@/lib/auth";
import { useApp } from "@/store/app";
import {
  counts,
  longDate,
  relTime,
  STAGES,
  stageOf,
  topRisk,
  type BoardMatter,
} from "@/lib/home-data";
import { deleteMatters } from "@/lib/delete-matters";
import { archiveVerb } from "@/lib/archive";
import { binCountdown, moveToBin, restoreFromBin } from "@/lib/trash";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import SaveState from "@/components/SaveState";
import LoadError from "@/components/LoadError";
import ActionError, { attempt } from "@/components/ActionError";

/**
 * Matters, and Contract Review, from one library.
 *
 * They were the same screen under one name, which put "New matter" inside a
 * review tool: to open a piece of work you went to the thing that reads
 * contracts, whether or not there was a contract to read. A matter is the work
 * itself; reviewing a contract is one of the things you might do to it.
 *
 * So the same rows serve both, and the mode decides three things: what it is
 * called, which matters it lists, and where opening one lands. Nothing is
 * duplicated — a second screen over the same table would drift.
 */
export type MattersMode = "matters" | "review";

export default function MattersLibrary({
  mode = "matters",
  startNew = false,
}: {
  mode?: MattersMode;
  /** Arrived asking to start a matter, from the dashboard or elsewhere. */
  startNew?: boolean;
} = {}) {
  const [creating, setCreating] = useState(startNew);
  /* The matter whose filing is being changed, if any. One at a time: moving a
     matter is a decision about one file, and a bulk version of it would be a
     way to relocate a practice by accident. */
  const [moving, setMoving] = useState<{ id: string; name: string } | null>(null);
  const reviewing = mode === "review";
  const { workspaceId } = useApp();
  const { board, error: boardError, refetch } = useBoard({ binned: true });
  const { user } = useAuth();
  const navigate = useNavigate();
  const openMatter = useOpenMatter();
  /** Matters opens the overview; Contract Review opens the review itself. */
  const open = (id: string) =>
    reviewing ? openMatter(id, { screen: "contract" }) : openMatter(id, { screen: "matter" });
  const qc = useQueryClient();

  // Every one of these was launched with a bare `void` and no catch, so a
  // refusal became an unhandled rejection and the row stayed where it was — a
  // delete that silently does nothing looks exactly like one you did not press.
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const remove = async (rows: BoardMatter[]) => {
    if (!rows.length) return;
    const what = rows.length === 1 ? `"${rows[0]!.name}"` : `${rows.length} matters`;
    const it = rows.length === 1 ? "it" : "them";
    if (
      !(await confirmDelete({
        what,
        count: rows.length,
        consequence: `Everything in ${it} goes too.`,
      }))
    )
      return;
    setActionError(null);
    const done = await attempt(
      `${what} could not be deleted`,
      () =>
        moveToBin(
          "matters",
          rows.map((row) => row.id),
        ),
      setActionError,
    );
    if (!done) return;
    await qc.invalidateQueries();
  };

  /** Out of Recently Deleted, back to wherever it was — archived matters included. */
  const restore = async (rows: BoardMatter[]) => {
    if (!rows.length) return;
    setActionError(null);
    const what = rows.length === 1 ? `"${rows[0]!.name}"` : `${rows.length} matters`;
    const done = await attempt(
      `${what} could not be restored`,
      () =>
        restoreFromBin(
          "matters",
          rows.map((row) => row.id),
        ),
      setActionError,
    );
    if (!done) return;
    await qc.invalidateQueries();
  };

  /**
   * Before the fifteen days are up. `deleteMatters` rather than `deleteForever`
   * because a matter's uploaded files live in storage, which no cascade reaches:
   * a bare row delete would leave every document it holds orphaned there.
   */
  const removeForGood = async (rows: BoardMatter[]) => {
    if (!rows.length) return;
    const what = rows.length === 1 ? `"${rows[0]!.name}"` : `${rows.length} matters`;
    const it = rows.length === 1 ? "it" : "them";
    if (
      !(await confirmDelete({
        what,
        count: rows.length,
        consequence: `Everything in ${it} goes too.`,
        binned: false,
      }))
    )
      return;
    setActionError(null);
    const done = await attempt(
      `${what} could not be deleted`,
      () => deleteMatters(rows.map((row) => row.id)),
      setActionError,
    );
    if (!done) return;
    await qc.invalidateQueries();
  };

  const setArchived = async (rows: BoardMatter[], archived: boolean) => {
    if (!rows.length) return;
    const word = archiveVerb(archived);
    setActionError(null);
    for (const row of rows) {
      const done = await attempt(
        `"${row.name}" could not be ${word}`,
        () => setMatterArchived(row.id, archived),
        setActionError,
      );
      if (!done) break;
    }
    await qc.invalidateQueries();
  };

  const columns: LibColumn<BoardMatter>[] = [
    {
      key: "name",
      label: "Name",
      value: (m) => m.name.toLowerCase(),
      render: (m) => (
        <span style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, color: C.text }}>{m.name}</span>
          {m.deletedAt && (
            <span style={{ fontSize: 11.5, color: C.muted }}>{binCountdown(m.deletedAt)}</span>
          )}
          {m.isSample && (
            <span
              style={{
                fontSize: 11,
                color: C.faint,
              }}
            >
              Sample
            </span>
          )}
        </span>
      ),
    },
    { key: "client", label: "Client", width: 150, value: (m) => m.client, render: (m) => m.client },
    {
      key: "counterparty",
      label: "Counterparty",
      width: 160,
      value: (m) => m.counterparty,
      render: (m) => m.counterparty,
    },
    {
      key: "type",
      label: "Type",
      width: 130,
      value: (m) => m.matterType,
      render: (m) => m.matterType,
    },
    {
      key: "stage",
      label: "Stage",
      width: 140,
      value: (m) => stageOf(m),
      render: (m) => stageOf(m),
    },
    {
      key: "risk",
      label: "Risk",
      width: 80,
      value: (m) => topRisk(m) ?? "",
      render: (m) => {
        const r = topRisk(m);
        return r ? (
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: riskColors[r] }} />
            {r}
          </span>
        ) : null;
      },
    },
    {
      key: "open",
      label: "Open items",
      width: 92,
      value: (m) => counts(m).open + counts(m).escalated,
      render: (m) => {
        const c = counts(m);
        const n = c.open + c.escalated;
        return n ? <span style={{ fontFamily: mono }}>{n}</span> : null;
      },
    },
    {
      key: "playbook",
      label: "Playbook",
      width: 150,
      value: (m) => m.playbookName,
      render: (m) => m.playbookName,
    },
    {
      key: "owner",
      label: "Owner",
      width: 130,
      value: (m) => m.ownerName,
      render: (m) => m.ownerName,
    },
    {
      key: "reference",
      label: "Reference",
      width: 110,
      defaultOff: true,
      value: (m) => m.reference,
      render: (m) => <span style={{ fontFamily: mono }}>{m.reference}</span>,
    },
    {
      key: "target",
      label: "Target",
      width: 110,
      defaultOff: true,
      value: (m) => m.targetDate ?? "",
      render: (m) => <span style={{ fontFamily: mono }}>{longDate(m.targetDate)}</span>,
    },
    {
      key: "updated",
      label: "Updated",
      width: 120,
      value: (m) => m.lastEvent?.at ?? m.updatedAt,
      render: (m) => (
        <span style={{ color: C.muted }}>{relTime(m.lastEvent?.at ?? m.updatedAt)}</span>
      ),
    },
  ];

  const week = Date.now() - 7 * 86400000;
  // Archived matters are out of the way, not gone. Every working view hides
  // them; one view is for finding them again.
  // A deleted matter is not merely archived: it leaves every view, Archived
  // included, and shows only under Recently Deleted.
  const live = (m: BoardMatter) => !m.archivedAt && !m.deletedAt;
  /**
   * What Contract Review is for: a matter with a contract in it. A matter
   * opened to produce a board resolution has nothing to read, and listing it
   * under a tool that reads contracts is how the tool came to be the place
   * matters were created.
   */
  /**
   * What is inside each file, and what it owes next. A separate read because
   * tasks and deliverables live in tables the matters query has never needed;
   * the cards draw without it and fill in when it lands, rather than holding
   * the whole list back for a count.
   */
  const summaries = useQuery({
    queryKey: ["matter-summaries", workspaceId],
    enabled: !!workspaceId && !reviewing,
    retry: false,
    queryFn: () => loadMatterSummaries(workspaceId!),
  });

  const reviewable = (m: BoardMatter) =>
    counts(m).clauses > 0 || m.docs.some((d) => d.kind === "contract" || d.kind === "amendment");
  const rows = reviewing ? board.matters.filter(reviewable) : board.matters;

  const views: LibView<BoardMatter>[] = [
    { key: "All", label: "All", filter: live },
    { key: "Active", label: "Active", filter: (m) => live(m) && stageOf(m) !== "Complete" },
    {
      key: "Awaiting",
      label: "Awaiting decisions",
      filter: (m) => live(m) && stageOf(m) === "Awaiting decisions",
    },
    { key: "Mine", label: "My matters", filter: (m) => live(m) && !!user && m.ownerId === user.id },
    { key: "NoClient", label: "No client yet", filter: (m) => live(m) && !m.clientId },
    {
      key: "Recent",
      label: "Recently updated",
      filter: (m) => live(m) && new Date(m.lastEvent?.at ?? m.updatedAt).getTime() > week,
    },
    { key: "Archived", label: "Archived", filter: (m) => !!m.archivedAt && !m.deletedAt },
    { key: "Deleted", label: "Recently Deleted", filter: (m) => !!m.deletedAt },
  ];

  return (
    <AppShell
      section={reviewing ? "contract-review" : "matters"}
      breadcrumb={<Crumbs items={[{ label: reviewing ? "Contract Review" : "Matters" }]} />}
      scroll={false}
    >
      <LoadError what="matters" error={boardError} onRetry={() => void refetch()} />
      <ActionError error={actionError} onDismiss={() => setActionError(null)} />
      <Library
        storageKey={reviewing ? "contract-review" : "matters"}
        defaultMode="cards"
        title={reviewing ? "Contract Review" : "Matters"}
        description={
          reviewing
            ? "Matters with a contract to read: what changed, what is open and what has been decided."
            : "Every piece of work in the workspace. Open one to see where it stands, or start a new one."
        }
        rowLabel={(m) => m.name}
        rows={rows}
        columns={columns}
        views={views}
        searchText={(m) => [m.name, m.client, m.counterparty, m.reference, m.matterType].join(" ")}
        searchPlaceholder="Search matters"
        onOpen={(m) => void open(m.id)}
        // Work is opened in Matters. Contract Review reads contracts; offering
        // "New matter" here is what made a review tool the front door to the
        // whole app.
        // A matter is the legal file, so creating one asks for a name and,
        // if known, the client. Contract Review keeps its guided intake —
        // documents, pairing, review setup — for when a review is what the
        // lawyer set out to start.
        primary={
          reviewing
            ? { label: "New review", onClick: () => void navigate({ to: "/matters/new" }) }
            : { label: "New matter", onClick: () => setCreating(true) }
        }
        actions={(m) =>
          m.deletedAt
            ? [
                { label: "Restore", onClick: () => void restore([m]) },
                { label: "Delete for good", danger: true, onClick: () => void removeForGood([m]) },
              ]
            : [
                { label: "Open", onClick: () => void open(m.id) },
                {
                  label: "Move to another workspace…",
                  onClick: () => setMoving({ id: m.id, name: m.name }),
                },
                m.archivedAt
                  ? { label: "Restore", onClick: () => void setArchived([m], false) }
                  : { label: "Archive", onClick: () => void setArchived([m], true) },
                { label: "Delete", danger: true, onClick: () => void remove([m]) },
              ]
        }
        bulk={(view) =>
          view === "Deleted"
            ? [
                { label: "Restore", onClick: (rows) => void restore(rows) },
                {
                  label: "Delete for good",
                  danger: true,
                  onClick: (rows) => void removeForGood(rows),
                },
              ]
            : [
                { label: "Archive", onClick: (rows) => void setArchived(rows, true) },
                { label: "Restore", onClick: (rows) => void setArchived(rows, false) },
                { label: "Delete", danger: true, onClick: (rows) => void remove(rows) },
              ]
        }
        // No board. A matter's stage is not a pipeline anybody drags work
        // along, and Flow is already the board. A third view mode kept for
        // symmetry is how these two screens came to look alike.
        cards={(m) =>
          reviewing ? (
            <ReviewMatterCard m={m} />
          ) : (
            <MatterCard
              m={m}
              {...(summaries.data?.get(m.id)
                ? {
                    counts: {
                      tasks: summaries.data.get(m.id)!.tasks,
                      deliverables: summaries.data.get(m.id)!.deliverables,
                      documents: m.docs.length,
                    },
                    ...(summaries.data.get(m.id)!.next
                      ? { next: summaries.data.get(m.id)!.next! }
                      : {}),
                  }
                : {})}
            />
          )
        }
        detail={(m) => <MatterDetail m={m} />}
        empty={
          <LibraryEmpty
            title="No matters yet"
            action={
              reviewing
                ? { label: "New review", onClick: () => void navigate({ to: "/matters/new" }) }
                : { label: "New matter", onClick: () => setCreating(true) }
            }
          >
            A matter is one piece of work for one client — the contract being reviewed, the parties,
            the documents and every decision taken on it. Start one and the rest of Scripta has
            somewhere to file its work.
          </LibraryEmpty>
        }
      />
      {confirmDialog}
      {creating && !reviewing && <NewMatterDialog open onClose={() => setCreating(false)} />}
      {moving && (
        <MoveToWorkspace
          matterId={moving.id}
          matterName={moving.name}
          currentWorkspaceId={workspaceId}
          open
          onClose={() => setMoving(null)}
        />
      )}
    </AppShell>
  );
}

function MatterDetail({ m }: { m: BoardMatter }) {
  const open = useOpenMatter();
  const c = counts(m);
  // Split deliberately. The fields above are what the matter records about
  // itself and can be corrected. These are worked out from what the matter
  // contains — stage most of all — and typing over them would put a second,
  // more flattering answer beside the true one.
  const derived: [string, string][] = [
    ["Recently Deleted", m.deletedAt ? binCountdown(m.deletedAt) : ""],
    ["Archived", m.archivedAt ? longDate(m.archivedAt.slice(0, 10)) : ""],
    ["Value", m.value !== null ? `${m.currency} ${m.value.toLocaleString()}`.trim() : ""],
    ["Owner", m.ownerName],
    ["Playbook", m.playbookName],
    ["Stage", stageOf(m)],
    ["Clauses", c.clauses ? `${c.clauses} · ${c.open} open · ${c.escalated} escalated` : ""],
    ["Documents", `${m.docs.length}`],
  ];

  return (
    <div className="scripta-matter-detail">
      <header>
        <h2>{m.name}</h2>
        <p>Created {relTime(m.createdAt)}</p>
      </header>
      <Button variant="primary" onClick={() => void open(m.id)}>
        Open matter
      </Button>
      <MatterFields m={m} />
      <section>
        <h3>Matter summary</h3>
        <dl>
          {derived
            .filter(([, value]) => value)
            .map(([key, value]) => (
              <div key={key} style={{ display: "contents" }}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
      </section>
      <section className="scripta-matter-activity">
        <h3>Recent activity</h3>
        {m.lastEvent ? (
          <>
            <div>{m.lastEvent.summary}</div>
            <p>
              {m.lastEvent.by} · {relTime(m.lastEvent.at)}
            </p>
          </>
        ) : (
          <p>Nothing recorded yet.</p>
        )}
      </section>
    </div>
  );
}

/**
 * The facts a matter records about itself, editable in place.
 *
 * Until now these were captured once at intake and could never be changed. A
 * client renames, a counterparty joins late, a target date moves, a reference
 * is mistyped — and the matter quietly stopped describing the work.
 *
 * Saved on blur, like the rest of the app: a matter is corrected in passing,
 * not by opening a form and pressing Save.
 */
function MatterFields({ m }: { m: BoardMatter }) {
  const qc = useQueryClient();
  const { workspaceId } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const current: Record<string, string> = {
    name: m.name,
    counterparty: m.counterparty,
    matterType: m.matterType,
    governingLaw: m.governingLaw,
    reference: m.reference,
    targetDate: m.targetDate ?? "",
  };

  const save = async (key: keyof MatterPatch, value: string) => {
    if (value === (current[key] ?? "")) return;
    setError(null);
    setSaving(key);
    try {
      await updateMatter(m.id, { [key]: value } as MatterPatch);
      await qc.invalidateQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That change did not save.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="scripta-matter-fields">
      <h3>Details</h3>
      <div className="scripta-matter-fields-note">
        <SaveState
          mode="on-blur"
          status={error ? "error" : saving ? "saving" : "idle"}
          error={error ?? undefined}
        />
      </div>
      {MATTER_FIELDS.slice(0, 1).map((field) => (
        <label key={field.key} className="scripta-matter-field">
          <span>{field.label}</span>
          <input
            defaultValue={current[field.key] ?? ""}
            placeholder={field.placeholder}
            onBlur={(e) => void save(field.key, e.target.value)}
            aria-busy={saving === field.key}
          />
        </label>
      ))}
      {/* Filed under a client, or not yet. Changing it moves nothing and
          recreates nothing: the matter keeps its id and everything in it. */}
      <div className="scripta-matter-field scripta-matter-client">
        <ClientPicker
          key={m.clientId ?? "none"}
          value={
            m.clientId ? { kind: "existing", id: m.clientId, name: m.client } : { kind: "none" }
          }
          disabled={!!m.deletedAt}
          onChange={(choice) => {
            if (!workspaceId) return;
            setError(null);
            setSaving("client");
            void resolveClient(workspaceId, choice)
              .then((clientId) => setMatterClient(m.id, clientId))
              .then(() => qc.invalidateQueries())
              .catch((cause: unknown) =>
                setError(cause instanceof Error ? cause.message : "The client was not saved."),
              )
              .finally(() => setSaving(null));
          }}
        />
      </div>
      {MATTER_FIELDS.slice(1).map((field) => (
        <label key={field.key} className="scripta-matter-field">
          <span>{field.label}</span>
          <input
            defaultValue={current[field.key] ?? ""}
            placeholder={field.placeholder}
            {...(field.type === "date" ? { type: "date" } : {})}
            onBlur={(e) => void save(field.key, e.target.value)}
            aria-busy={saving === field.key}
          />
        </label>
      ))}
    </section>
  );
}
