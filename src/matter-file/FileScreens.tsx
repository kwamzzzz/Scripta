/**
 * The matter as a file: Overview, Flows, Tasks, Documents and Activity.
 *
 * A matter is the legal file. Contract Review is one tool that may be used on
 * it, reached from its own tab, and is no longer what opening a matter shows.
 * The Overview answers, in order: where the work stands, what needs attention,
 * what has happened, and — beside it — whose file it is, who is on it, and
 * which tools have been used.
 *
 * Facts and counts, not pressure: an empty file says what is empty and offers
 * the one action that fills it.
 */
import { useRef, useState, type MouseEvent } from "react";
import { Trash2 } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setMatterEntity } from "@/organisation/db";
import { Card } from "@/review/ui";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import DocThumb from "@/components/DocThumb";
import { moveToBin } from "@/lib/trash";
import Thread from "@/components/Thread";
import MatterTeamCard from "@/components/MatterTeamCard";
import ClientPicker from "@/components/ClientPicker";
import { NO_CLIENT } from "@/components/client-choice";
import NewFlowDialog from "@/matter-flow/NewFlowDialog";
import { renameFlow } from "@/matter-flow/flow-db";
import EditableName from "@/components/EditableName";
import { setMatterClient } from "@/lib/clients";
import { resolveClient } from "@/lib/organise";
import { quickAdd } from "@/lib/tasks/data";
import { STATUS_LABEL, type TaskStatus } from "@/lib/tasks/model";
import { useDocumentUpload, type DocKind } from "@/lib/use-upload";
import DocumentViewer from "./DocumentViewer";
import { ACCEPT_ATTR } from "@/lib/parsing/mime";
import { inferRole, inferVersion, roleToKind } from "@/lib/intake";
import type { Screen } from "@/store/app";
import type { Clause, Matter } from "@/data/legal";
import type { FileFlow, FileTask, MatterFile } from "./data";
import { useMatterFile } from "./use-matter-file";
import "@/components/organise.css";
import "./matter-file.css";
import { useOpenFlow } from "@/lib/host-frame";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const shortDate = (iso: string | null) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    : "";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Attention = "overdue" | "today" | "waiting";

function attention(task: FileTask, on: string): Attention | null {
  if (task.status === "Done") return null;
  if (task.status === "Waiting" || task.status === "Blocked") return "waiting";
  if (task.dueDate && task.dueDate < on) return "overdue";
  if (task.dueDate === on || task.plannedOn === on) return "today";
  return null;
}

function Loading({ file }: { file: ReturnType<typeof useMatterFile> }) {
  return (
    <p className="org-hint" role={file.isError ? "alert" : "status"}>
      {file.isError ? (file.error as Error).message : "Loading…"}
    </p>
  );
}

/* ---------------------------------------------------------------- overview */

export function FileOverview({
  matterId,
  workspaceId,
  matter,
  clauses,
  openIssues,
  onGo,
}: {
  matterId: string;
  workspaceId: string | null;
  matter: Matter;
  clauses: Clause[];
  openIssues: number;
  onGo: (screen: Screen) => void;
}) {
  const file = useMatterFile(matterId);
  const f = file.data;
  const on = today();

  return (
    <div className="mfile">
      <div className="mfile-cols">
        <div className="mfile-main">
          {!f ? (
            <Loading file={file} />
          ) : (
            <>
              <WhereItStands file={f} matterId={matterId} onGo={onGo} />
              <NeedsAttention file={f} openIssues={openIssues} on={on} onGo={onGo} />
            </>
          )}
          <Card
            title="Recent activity"
            right={
              <button type="button" className="org-link" onClick={() => onGo("activity")}>
                All activity
              </button>
            }
          >
            {matter.timeline.length === 0 ? (
              <p className="org-hint">Nothing recorded yet.</p>
            ) : (
              <ul className="org-list mfile-compact">
                {/* The timeline is kept oldest first; recent means the other end. */}
                {[...matter.timeline]
                  .reverse()
                  .slice(0, 5)
                  .map((event, index) => (
                    <li key={index}>
                      <div>
                        <span className="org-list-title">{event.e}</span>
                        <span className="org-list-meta">{event.by}</span>
                        <span className="org-list-when">{event.d}</span>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
          {/* The file's own discussion. Mentions and replies about the matter as
              a whole land here, which is where the awareness bell sends them. */}
          <Card>
            <Thread
              kind="matter"
              entityId={matterId}
              workspaceId={workspaceId}
              title="Matter discussion"
              blurb="Questions, decisions and points to revisit on the file as a whole."
            />
          </Card>
        </div>

        <aside className="mfile-side">
          {f ? <FileFacts file={f} matterId={matterId} /> : <Card title="File">…</Card>}
          {workspaceId && <MatterTeamCard matterId={matterId} workspaceId={workspaceId} />}
          <ToolsInUse
            matterId={matterId}
            file={f ?? null}
            reviewing={clauses.length > 0 || matter.docs.some((d) => d.rawKind === "contract")}
            clauses={clauses.length}
            openIssues={openIssues}
            onGo={onGo}
          />
        </aside>
      </div>
    </div>
  );
}

function FlowLine({ flow, renamable = false }: { flow: FileFlow; renamable?: boolean }) {
  const share = flow.total ? Math.round((flow.complete / flow.total) * 100) : 0;
  const qc = useQueryClient();
  const openFlow = useOpenFlow();
  // A plain click opens the flow where this matter is shown; a modified click
  // (new tab, new window) still follows the flow's own address.
  const opened = (event: MouseEvent, flowId: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    openFlow(flowId);
  };
  return (
    <div className="mfile-flow">
      <div className="mfile-flow-head">
        {renamable ? (
          <EditableName
            label="flow"
            value={flow.name}
            display={
              <Link
                to="/flows/$flowId"
                params={{ flowId: flow.id }}
                onClick={(event) => opened(event, flow.id)}
              >
                {flow.name}
              </Link>
            }
            onSave={async (name) => {
              try {
                await renameFlow(flow.id, name);
                await qc.invalidateQueries();
                return true;
              } catch {
                return false;
              }
            }}
          />
        ) : (
          <Link
            to="/flows/$flowId"
            params={{ flowId: flow.id }}
            onClick={(event) => opened(event, flow.id)}
          >
            {flow.name}
          </Link>
        )}
        <span>
          {flow.phaseCount
            ? `Phase ${flow.phaseNumber || flow.phaseCount} of ${flow.phaseCount}${flow.phase ? ` · ${flow.phase}` : ""}`
            : "No phases yet"}
        </span>
      </div>
      {flow.total > 0 && (
        <div
          className="mfile-bar"
          role="img"
          aria-label={`${flow.complete} of ${flow.total} deliverables complete`}
        >
          <i style={{ width: `${share}%` }} />
        </div>
      )}
      <div className="org-filing">
        <span>
          {flow.complete} of {plural(flow.total, "deliverable")} complete
        </span>
        {flow.next && (
          <>
            <span aria-hidden>·</span>
            <span>
              Next: <strong>{flow.next.name}</strong> {shortDate(flow.next.on)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function WhereItStands({
  file,
  matterId,
  onGo,
}: {
  file: MatterFile;
  matterId: string;
  onGo: (screen: Screen) => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <Card
      title="Where it stands"
      right={
        file.flows.length > 1 ? (
          <button type="button" className="org-link" onClick={() => onGo("flows")}>
            All flows
          </button>
        ) : undefined
      }
    >
      {file.flows.length === 0 ? (
        <div className="mfile-empty">
          <p className="org-hint">
            No flow yet. A flow lays the work out as phases, what each owes and when.
          </p>
          <div>
            <Button onClick={() => setCreating(true)}>New flow</Button>
          </div>
        </div>
      ) : (
        <div className="mfile-stack">
          {file.flows.slice(0, 2).map((flow) => (
            <FlowLine key={flow.id} flow={flow} />
          ))}
        </div>
      )}
      {creating && <NewFlowDialog open matterId={matterId} onClose={() => setCreating(false)} />}
    </Card>
  );
}

function NeedsAttention({
  file,
  openIssues,
  on,
  onGo,
}: {
  file: MatterFile;
  openIssues: number;
  on: string;
  onGo: (screen: Screen) => void;
}) {
  const marked = file.tasks
    .map((task) => ({ task, state: attention(task, on) }))
    .filter((x): x is { task: FileTask; state: Attention } => !!x.state);
  const overdueDeliverables = file.flows.reduce((n, x) => n + x.overdue, 0);
  const waitingDeliverables = file.flows.reduce((n, x) => n + x.waiting, 0);
  const counts = [
    {
      label: "Overdue",
      n: marked.filter((x) => x.state === "overdue").length + overdueDeliverables,
    },
    { label: "Today", n: marked.filter((x) => x.state === "today").length },
    {
      label: "Waiting",
      n: marked.filter((x) => x.state === "waiting").length + waitingDeliverables,
    },
    { label: "Open issues", n: openIssues },
  ];
  const order: Record<Attention, number> = { overdue: 0, today: 1, waiting: 2 };
  const rows = [...marked].sort((a, b) => order[a.state] - order[b.state]).slice(0, 5);

  return (
    <Card
      title="What needs attention"
      right={
        <button type="button" className="org-link" onClick={() => onGo("tasks")}>
          All tasks
        </button>
      }
    >
      <div className="mfile-counts">
        {counts.map((c) => (
          <div key={c.label} className={c.n && c.label === "Overdue" ? "is-late" : undefined}>
            <strong>{c.n}</strong>
            <span>{c.label}</span>
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="org-hint">Nothing is overdue, due today or waiting on someone.</p>
      ) : (
        <ul className="org-list mfile-compact">
          {rows.map(({ task, state }) => (
            <li key={task.id}>
              <Link to="/tasks">
                <span className="org-list-title">{task.title}</span>
                <span className="org-list-meta">
                  {state === "overdue"
                    ? `Due ${shortDate(task.dueDate)}`
                    : state === "today"
                      ? "Today"
                      : "Waiting"}
                  {task.fromFlow ? " · from a flow" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FileFacts({ file, matterId }: { file: MatterFile; matterId: string }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const facts: [string, string][] = [
    ["Reference", file.reference],
    ["Type", file.matterType],
    ["Counterparty", file.counterparty],
    ["Governing law", file.governingLaw],
    ["Target date", shortDate(file.targetDate)],
  ];
  return (
    <Card title="File">
      <div className="mfile-stack">
        <ClientPicker
          key={file.clientId ?? "none"}
          value={
            file.clientId
              ? { kind: "existing", id: file.clientId, name: file.clientName }
              : NO_CLIENT
          }
          onChange={(choice) => {
            setError(null);
            void resolveClient(file.workspaceId, choice)
              .then((clientId) => setMatterClient(matterId, clientId))
              .then(() => qc.invalidateQueries())
              .catch((cause: unknown) =>
                setError(cause instanceof Error ? cause.message : "The client was not saved."),
              );
          }}
        />
        {file.clientId && (
          <div className="org-filing">
            <Link to="/clients/$clientId" params={{ clientId: file.clientId }}>
              Open {file.clientName}
            </Link>
          </div>
        )}
        {file.clientId && (
          <MatterEntity
            key={`${file.clientId}-${file.clientEntityId ?? "none"}`}
            matterId={matterId}
            clientId={file.clientId}
            entityId={file.clientEntityId}
          />
        )}
        {error && (
          <p className="org-error" role="alert">
            {error}
          </p>
        )}
        <dl className="mfile-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

/**
 * Which of the client's companies the matter concerns. Offered only when the
 * client's organisation records entities; the entities are firm business, and
 * the link is saved on the matter under the matter's own policy.
 */
function MatterEntity({
  matterId,
  clientId,
  entityId,
}: {
  matterId: string;
  clientId: string;
  entityId: string | null;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const entities = useQuery({
    queryKey: ["client-entities", clientId],
    retry: false,
    queryFn: async () => {
      const { data, error: readError } = await supabase
        .from("org_entities")
        .select("id, name, short_name")
        .eq("client_id", clientId)
        .is("archived_at", null)
        .is("proposed_change_id", null)
        .order("name");
      if (readError) throw new Error(readError.message);
      return data ?? [];
    },
  });
  const rows = entities.data ?? [];
  if (!rows.length && !entityId) return null;
  const linked = rows.find((e) => e.id === entityId);
  return (
    <div className="org-field">
      <span className="org-label">Entity</span>
      <select
        value={entityId ?? ""}
        disabled={saving}
        aria-label="The client entity this matter concerns"
        onChange={(event) => {
          setError(null);
          setSaving(true);
          void setMatterEntity(matterId, event.target.value || null)
            .then(() => qc.invalidateQueries())
            .catch((cause: unknown) =>
              setError(cause instanceof Error ? cause.message : "The entity was not saved."),
            )
            .finally(() => setSaving(false));
        }}
      >
        <option value="">Not a particular entity</option>
        {rows.map((e) => (
          <option key={e.id} value={e.id}>
            {e.short_name || e.name}
          </option>
        ))}
      </select>
      {linked && (
        <div className="org-filing">
          <Link
            to="/clients/$clientId"
            params={{ clientId }}
            search={{ tab: "organisation", area: "entities", item: linked.id } as never}
          >
            Open {linked.short_name || linked.name}
          </Link>
        </div>
      )}
      {error && (
        <p className="org-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** The tools that can be started on a file, each filed to it from the outset. */
const STARTS = [
  { label: "Draft a contract", to: "/matters/contract-drafting/new" },
  { label: "Draft a corporate document", to: "/matters/corporate-drafting/new" },
  { label: "Start legal research", to: "/research/new" },
] as const;

function ToolsInUse({
  matterId,
  file,
  reviewing,
  clauses,
  openIssues,
  onGo,
}: {
  matterId: string;
  file: MatterFile | null;
  reviewing: boolean;
  clauses: number;
  openIssues: number;
  onGo: (screen: Screen) => void;
}) {
  const navigate = useNavigate();
  const tools = file?.tools ?? [];
  return (
    <Card title="Tools in use">
      <ul className="org-list mfile-compact">
        <li>
          <button type="button" onClick={() => onGo("contract")}>
            <span className="org-list-title">Contract Review</span>
            <span className="org-list-meta">
              {clauses > 0
                ? `${plural(clauses, "clause")} · ${plural(openIssues, "open issue")}`
                : reviewing
                  ? "Ready to prepare from its documents"
                  : "Not started"}
            </span>
          </button>
        </li>
        {tools.map((tool) => (
          <li key={`${tool.kind}-${tool.id}`}>
            <button
              type="button"
              onClick={() => void navigate({ to: tool.to as never, params: tool.params as never })}
            >
              <span className="org-list-title">{tool.title}</span>
              <span className="org-list-meta">{tool.kind}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mfile-starts">
        <span className="org-label">Start on this matter</span>
        {STARTS.map((start) => (
          <button
            key={start.to}
            type="button"
            className="org-link"
            onClick={() => void navigate({ to: start.to, search: { matter: matterId } as never })}
          >
            {start.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ flows */

export function FileFlows({ matterId }: { matterId: string }) {
  const file = useMatterFile(matterId);
  const [creating, setCreating] = useState(false);
  return (
    <div className="mfile">
      <div className="mfile-page-head">
        <h2>Flows</h2>
        <Button variant="primary" onClick={() => setCreating(true)}>
          New flow
        </Button>
      </div>
      {!file.data ? (
        <Loading file={file} />
      ) : file.data.flows.length === 0 ? (
        <p className="org-hint">No flow yet.</p>
      ) : (
        <div className="mfile-stack mfile-flows">
          {file.data.flows.map((flow) => (
            <div key={flow.id} className="mfile-panel">
              <FlowLine flow={flow} renamable />
            </div>
          ))}
        </div>
      )}
      {creating && <NewFlowDialog open matterId={matterId} onClose={() => setCreating(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ tasks */

export function FileTasks({ matterId }: { matterId: string }) {
  const file = useMatterFile(matterId);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = today();

  const add = async () => {
    const f = file.data;
    if (!f || !title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await quickAdd(f.workspaceId, { title, matterId });
      setTitle("");
      await qc.invalidateQueries();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The task was not added.");
    } finally {
      setBusy(false);
    }
  };

  const tasks = file.data?.tasks ?? [];
  const open = tasks.filter((t) => t.status !== "Done");
  const done = tasks.filter((t) => t.status === "Done");

  return (
    <div className="mfile">
      <div className="mfile-page-head">
        <h2>Tasks</h2>
        <Link to="/tasks" className="org-link">
          Open in Tasks
        </Link>
      </div>
      <form
        className="org-quick"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task on this matter"
          aria-label="Add a task on this matter"
          disabled={busy || !file.data}
        />
        <Button type="submit" variant="primary" disabled={!title.trim() || busy}>
          {busy ? "Adding…" : "Add"}
        </Button>
      </form>
      {error && (
        <p className="org-error" role="alert">
          {error}
        </p>
      )}
      {!file.data ? (
        <Loading file={file} />
      ) : tasks.length === 0 ? (
        <p className="org-hint">No tasks yet.</p>
      ) : (
        <ul className="org-list">
          {[...open, ...done].map((task) => {
            const state = attention(task, on);
            return (
              <li key={task.id}>
                <Link to="/tasks">
                  <span className={`org-list-title${task.status === "Done" ? " is-done" : ""}`}>
                    {task.title}
                  </span>
                  <span className="org-list-meta">
                    {[
                      STATUS_LABEL[task.status as TaskStatus] ?? task.status,
                      state === "overdue" ? "Overdue" : state === "today" ? "Today" : "",
                      task.dueDate ? `Due ${shortDate(task.dueDate)}` : "",
                      task.priority === "high" ? "High priority" : "",
                      task.fromFlow ? "From a flow" : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- documents */

/** What an uploaded file is. "Auto" reads it off the file name, as intake does. */
const UPLOAD_KINDS: { value: DocKind | "auto"; label: string }[] = [
  { value: "auto", label: "Work it out from the name" },
  { value: "contract", label: "Contract" },
  { value: "amendment", label: "Amendment" },
  { value: "letter", label: "Letter" },
  { value: "resolution", label: "Resolution" },
  { value: "minutes", label: "Minutes" },
  { value: "proposal", label: "Proposal" },
  { value: "reference", label: "Reference" },
];

export function FileDocuments({
  matterId,
  matter,
  onOpenReview,
}: {
  matterId: string;
  matter: Matter;
  /** Opens a contract or amendment in Contract Review. */
  onOpenReview: () => void;
}) {
  const qc = useQueryClient();
  const { upload, busy, error } = useDocumentUpload(matterId);
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<DocKind | "auto">("auto");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = matter.docs.find((d) => d.id === selectedId) ?? null;
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const [docError, setDocError] = useState<string | null>(null);

  /**
   * Remove the wrong document.
   *
   * Uploading the wrong file is the commonest mistake there is, and the only
   * way out of it was to delete the matter and start again — which throws away
   * the flows, tasks and notes filed under it to correct a single upload. It
   * goes to Recently Deleted like everything else, so a misfire is recoverable
   * for fifteen days from the Documents library.
   */
  const removeDoc = async (doc: { id: string; name: string }) => {
    const yes = await confirmDelete({
      what: `“${doc.name}”`,
      count: 1,
      consequence: "Every stored version goes too, and any review of it loses its source.",
    });
    if (!yes) return;
    setDocError(null);
    try {
      await moveToBin("documents", [doc.id]);
      if (selectedId === doc.id) setSelectedId(null);
      await qc.invalidateQueries();
    } catch (cause) {
      setDocError(cause instanceof Error ? cause.message : `“${doc.name}” could not be deleted.`);
    }
  };

  const handle = async (files: File[]) => {
    for (const f of files) {
      setNote(`Uploading ${f.name}…`);
      await upload(
        f,
        kind === "auto" ? roleToKind(inferRole(f.name)) : kind,
        inferVersion(f.name),
        kind === "auto",
      );
    }
    setNote("");
    await qc.invalidateQueries();
  };

  return (
    <div className="mfile mfile-documents">
      <div className="mfile-page-head">
        <h2>Documents</h2>
        <div className="mfile-upload">
          <label className="org-field">
            <span className="sr-only">Type of document</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as DocKind | "auto")}>
              {UPLOAD_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept={ACCEPT_ATTR}
            onChange={(e) => {
              // Copy first: resetting the input empties the live FileList.
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void handle(files);
            }}
          />
          <Button variant="primary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>
      {note && (
        <p className="org-hint" role="status">
          {note}
        </p>
      )}
      {error && (
        <p className="org-error" role="alert">
          {error}
        </p>
      )}
      {docError && (
        <p className="org-error" role="alert">
          {docError}
        </p>
      )}
      {confirmDialog}
      {matter.docs.length === 0 ? (
        <p className="org-hint">No documents yet.</p>
      ) : (
        <div className="mfile-doc-split">
          <ul className="org-list">
            {matter.docs.map((doc) => (
              <li key={doc.id} className={doc.id === selectedId ? "is-selected" : undefined}>
                {/* Page one, and a readable look at it on hover: a list of
                    documents is read by its paper as much as by its names. */}
                <DocThumb
                  file={{ id: doc.id, fileRef: doc.storagePath }}
                  name={doc.name}
                  meta={[doc.kind, doc.ver, doc.date].filter(Boolean).join(" · ")}
                  size={46}
                  className="mfile-doc-thumb"
                />
                <button
                  type="button"
                  aria-pressed={doc.id === selectedId}
                  onClick={() => setSelectedId(doc.id)}
                >
                  <span className="org-list-title">{doc.name}</span>
                  <span className="org-list-meta">
                    {[
                      doc.kind,
                      doc.ver,
                      doc.parseStatus === "failed"
                        ? "Could not be read"
                        : doc.parseStatus === "parsed"
                          ? ""
                          : "Being read",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="org-list-when">{doc.date}</span>
                </button>
                {/* The wrong file should not cost the whole matter to correct. */}
                <button
                  type="button"
                  className="mfile-doc-remove"
                  title={`Delete “${doc.name}”`}
                  aria-label={`Delete ${doc.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void removeDoc(doc);
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <DocumentViewer
              key={selected.id}
              doc={selected}
              onOpenReview={
                selected.rawKind === "contract" || selected.rawKind === "amendment"
                  ? onOpenReview
                  : undefined
              }
            />
          ) : (
            <p className="org-hint mfile-viewer-empty">Choose a document to read it here.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- activity */

export function FileActivity({ matter }: { matter: Matter }) {
  return (
    <div className="mfile">
      <div className="mfile-page-head">
        <h2>Activity</h2>
      </div>
      {matter.timeline.length === 0 ? (
        <p className="org-hint">Nothing recorded yet.</p>
      ) : (
        <ul className="org-list">
          {[...matter.timeline].reverse().map((event, index) => (
            <li key={index}>
              <div>
                <span className="org-list-title">{event.e}</span>
                <span className="org-list-meta">{event.by}</span>
                <span className="org-list-when">{event.d}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
