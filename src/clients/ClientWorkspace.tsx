/**
 * One client: who they are, and the work the firm is doing for them.
 *
 * The page carries the client's own name. For an organisation it opens onto an
 * overview and the organisation itself — its entities and who owns them, its
 * people and who reports to whom, who may sign, what it is licensed for and
 * what it must file — beside the work filed under it.
 *
 * Matters, flows, tasks and documents are each read through their own
 * policy — so a lawyer who is on one of a client's five matters sees one
 * matter and its documents, and no sign of the other four. The
 * tab counts are counts of those rows and nothing else. The organisation is
 * firm business and is the same for everyone in the workspace; it grants
 * nothing over the matters.
 *
 * Marketing is not. It belongs to whoever created the client, and only they
 * and the people they add see the tab at all. The same person is the one who
 * can delete the client.
 *
 * Not every client needs the whole file. Licences, the compliance calendar,
 * processes and marketing are for a client whose company the firm helps run;
 * an advisory client has the essentials, and the areas it does not carry are
 * not shown (see `optionalAreas`).
 *
 * It is not a CRM.
 */
import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppShell, { Crumbs } from "@/components/AppShell";
import { Button } from "@/components/primitives";
import ActionError, { attempt } from "@/components/ActionError";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import NewMatterDialog from "@/components/NewMatterDialog";
import NewFlowDialog from "@/matter-flow/NewFlowDialog";
import MatterUnavailable from "@/screens/MatterUnavailable";
import { TabRow } from "@/wireframe/screens";
import { AppProvider, useApp, type Screen } from "@/store/app";
import Workbench from "@/screens/Workbench";
import MatterFlowScreen from "@/matter-flow/MatterFlowScreen";
import TaskDetail from "@/screens/tasks/TaskDetail";
import {
  FlowOpenerProvider,
  NO_HOSTED_FLOW,
  flowSearchOf,
  hostedPatch,
  type HostFrame,
} from "@/lib/host-frame";
import { relTime } from "@/lib/home-data";
import { STATUS_LABEL, type TaskStatus } from "@/lib/tasks/model";
import { deleteTask, listTasks, quickAdd, updateTask } from "@/lib/tasks/data";
import { archiveVerb, setArchived } from "@/lib/archive";
import { binCountdown, deleteForever, moveToBin } from "@/lib/trash";
import { setMatterArchived, updateMatter } from "@/lib/matter-edit";
import { renameFlow } from "@/matter-flow/flow-db";
import { clientNotesKey, listClientNotes } from "@/lib/client-notes";
import ActionMenu from "@/components/ActionMenu";
import {
  CLIENT_KIND_LABEL,
  areaOn,
  getClient,
  loadClientWork,
  setClientArchived,
  setClientDeleted,
} from "@/lib/clients";
import { CLIENT_TABS } from "./tabs";
import ClientNotes from "./ClientNotes";
import EditClientDialog from "./EditClientDialog";
import WorkList from "./WorkList";
import OrganisationArea from "@/organisation/OrganisationArea";
import ClientOverview from "@/organisation/ClientOverview";
import { ClientHeldDocuments } from "@/organisation/components/RecordDocuments";
import { useOrganisation } from "@/organisation/ui";
import type { ClientSearch } from "@/routes/clients.$clientId";
import { ORG_AREAS, type OrgArea } from "@/organisation/model";
import MarketingArea from "@/marketing/MarketingArea";
import { loadMarketingLevel, marketingLevelKey } from "@/marketing/db";
import { MARKETING_VIEWS, type MarketingView } from "@/marketing/model";
import "@/components/organise.css";
import "./clients.css";

import type { ClientTab } from "./tabs";

export default function ClientWorkspace({
  clientId,
  tab: requested,
  area,
  item,
  mode,
  view,
  nested,
  navigate: go,
}: {
  clientId: string;
  /** What is open inside the client: a matter, a flow, a task. */
  nested: ClientSearch;
  tab: ClientTab;
  area: OrgArea;
  item: string | null;
  mode: string | null;
  view: MarketingView;
  navigate: (next: ClientSearch, replace?: boolean) => void;
}) {
  const { workspaceId, matters: matterList } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState<"matter" | "flow" | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [composingNote, setComposingNote] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const taskInput = useRef<HTMLInputElement>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const client = useQuery({
    queryKey: ["client", clientId],
    retry: false,
    queryFn: () => getClient(clientId),
  });
  const organisation = useOrganisation(client.data?.workspaceId ?? null, clientId);
  const level = useQuery({
    queryKey: marketingLevelKey(clientId),
    enabled: !!client.data,
    retry: false,
    queryFn: () => loadMarketingLevel(clientId),
  });
  const notes = useQuery({
    queryKey: clientNotesKey(clientId),
    enabled: !!client.data,
    retry: false,
    queryFn: () => listClientNotes(clientId),
  });
  const work = useQuery({
    queryKey: ["client-work", workspaceId, clientId],
    enabled: !!workspaceId && !!client.data,
    retry: false,
    queryFn: () => loadClientWork(client.data!.workspaceId, clientId),
  });

  // The task open beside the client's list is shown in full, as on Tasks.
  const openTaskId = requested === "tasks" ? (nested.task ?? null) : null;
  const allTasks = useQuery({
    queryKey: ["tasks", workspaceId],
    enabled: !!workspaceId && !!openTaskId,
    retry: false,
    queryFn: () => listTasks(workspaceId!),
  });

  if (client.isSuccess && !client.data) return <MatterUnavailable what="client" />;
  const c = client.data ?? null;
  // A person has no organogram; their page is their work.
  const hasOrganisation = c?.kind !== "individual";
  // Marketing is shown only to its owner and the people they let in; anyone
  // else who follows a link to it lands on the overview.
  // A client that does not carry marketing has no Marketing tab, even for its owner.
  const marketingLevel = c && areaOn(c, "marketing") ? (level.data ?? null) : null;
  const tab: ClientTab =
    (requested === "organisation" && !hasOrganisation) ||
    (requested === "marketing" && !!c && level.isFetched && !marketingLevel)
      ? "overview"
      : requested;
  // Owning the client does not depend on whether it carries marketing.
  const owner = level.data === "owner";
  const setTab = (next: ClientTab) =>
    go(
      {
        tab: next,
        // A post open in marketing is not a record in the organisation.
        ...(next === "organisation" && tab === "organisation"
          ? {}
          : next === "organisation" && tab !== "marketing"
            ? {}
            : { item: undefined, mode: undefined }),
        ...(next === "marketing" ? {} : { view: undefined }),
        // Leaving a tab leaves whatever was open inside it.
        ...NO_HOSTED_FLOW,
        matter: undefined,
        screen: undefined,
        task: undefined,
      },
      true,
    );
  const w = work.data;
  const live = <T extends { archivedAt: string | null; deletedAt: string | null }>(rows: T[]) =>
    rows.filter((r) => !r.deletedAt);
  const allMatters = w ? live(w.matters) : [];
  const allFlows = w ? live(w.flows) : [];
  const matters = allMatters.filter((m) => showArchived || !m.archivedAt);
  const flows = allFlows.filter((f) => showArchived || !f.archivedAt);
  const openTasks = w ? w.tasks.filter((t) => t.status !== "Done") : [];

  const refresh = () => qc.invalidateQueries();

  const addTask = async () => {
    if (!c || !taskTitle.trim() || addingTask) return;
    setAddingTask(true);
    setActionError(null);
    const done = await attempt(
      "The task could not be added",
      () => quickAdd(c.workspaceId, { title: taskTitle, clientId: c.id }),
      setActionError,
    );
    setAddingTask(false);
    if (done) {
      setTaskTitle("");
      await refresh();
    }
  };

  const toggleArchive = async () => {
    if (!c) return;
    const archived = !c.archivedAt;
    const done = await attempt(
      `“${c.name}” could not be ${archiveVerb(archived)}`,
      () => setClientArchived(c, archived),
      setActionError,
    );
    if (done) await refresh();
  };

  const removeClient = async () => {
    if (!c) return;
    const yes = await confirmDelete({
      what: `“${c.name}”`,
      consequence:
        "Its organisation, marketing and documents go with it when it is removed for good. Matters, flows and tasks filed under it are kept and unfiled.",
    });
    if (!yes) return;
    const done = await attempt(
      `“${c.name}” could not be deleted`,
      () => setClientDeleted(c, true),
      setActionError,
    );
    if (done) {
      await refresh();
      void navigate({ to: "/clients" });
    }
  };

  const restoreClient = async () => {
    if (!c) return;
    const done = await attempt(
      `“${c.name}” could not be restored`,
      () => setClientDeleted(c, false),
      setActionError,
    );
    if (done) await refresh();
  };

  const removeForGood = async () => {
    if (!c) return;
    const yes = await confirmDelete({
      what: `“${c.name}”`,
      consequence:
        "Its organisation, marketing and documents go with it. Matters, flows and tasks filed under it are kept and unfiled.",
      binned: false,
      archivable: false,
    });
    if (!yes) return;
    const done = await attempt(
      `“${c.name}” could not be deleted`,
      () => deleteForever("clients", [c.id]),
      setActionError,
    );
    if (done) {
      await refresh();
      void navigate({ to: "/clients" });
    }
  };

  const counts: Record<ClientTab, number | null> = {
    overview: null,
    notes: notes.data ? notes.data.filter((n) => !n.archivedAt).length : null,
    organisation: null,
    marketing: null,
    matters: allMatters.filter((m) => !m.archivedAt).length,
    flows: allFlows.filter((f) => !f.archivedAt).length,
    tasks: openTasks.length,
    documents: w?.documents.length ?? 0,
  };
  const TAB_LABEL: Record<ClientTab, string> = {
    overview: "Overview",
    notes: "Notes",
    organisation: "Organisation",
    marketing: "Marketing",
    matters: "Matters",
    flows: "Flows",
    tasks: "Tasks",
    documents: "Documents",
  };

  /** Runs a change to something filed under the client, reports a failure, and refreshes. */
  const act = async (failure: string, work: () => Promise<unknown>) => {
    setActionError(null);
    const ok = await attempt(failure, work, setActionError);
    if (ok) {
      await refresh();
      if (openTaskId) await qc.invalidateQueries({ queryKey: ["tasks", workspaceId] });
    }
    return ok;
  };
  const openTask = openTaskId ? (allTasks.data?.find((t) => t.id === openTaskId) ?? null) : null;

  const archivedToggle = (count: number, noun: string) =>
    count > 0 ? (
      <label className="cw-toggle">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived {noun} ({count})
      </label>
    ) : (
      <span />
    );

  const newTask = () => {
    setTab("tasks");
    window.setTimeout(() => taskInput.current?.focus(), 50);
  };

  // A client's matters, flows and tasks open inside the client.
  const openMatter = (id: string, screen?: Screen) =>
    go({ tab: "matters", ...NO_HOSTED_FLOW, matter: id, screen, task: undefined });
  const openFlow = (flowId: string, matterId: string | null) =>
    matterId
      ? go({
          tab: "matters",
          ...NO_HOSTED_FLOW,
          matter: matterId,
          screen: "flows",
          flow: flowId,
          task: undefined,
        })
      : go({ tab: "flows", ...NO_HOSTED_FLOW, matter: undefined, flow: flowId, task: undefined });

  const body =
    tab === "overview" ? (
      c && (
        <ClientOverview
          client={c}
          org={organisation.data ?? null}
          orgError={organisation.isError ? (organisation.error as Error).message : null}
          work={w ?? null}
          goArea={(next, nextItem) =>
            go({ tab: "organisation", area: next, item: nextItem ?? undefined, mode: undefined })
          }
          openTab={setTab}
        />
      )
    ) : tab === "organisation" || tab === "marketing" ? null : !w ? (
      <p className="cl-quiet" role="status">
        {work.isError ? (work.error as Error).message : "Loading…"}
      </p>
    ) : tab === "notes" ? (
      c && (
        <ClientNotes
          client={c}
          composing={composingNote}
          onCompose={() => setComposingNote(true)}
          onComposed={() => setComposingNote(false)}
        />
      )
    ) : tab === "matters" ? (
      <WorkList
        toolbar={
          <>
            {archivedToggle(allMatters.filter((m) => m.archivedAt).length, "matters")}
            <Button variant="primary" onClick={() => setCreating("matter")}>
              New matter
            </Button>
          </>
        }
        empty={
          allMatters.some((x) => x.archivedAt)
            ? "No active matters. Archived ones are hidden."
            : "No matters yet."
        }
        rows={matters.map((m) => ({
          id: m.id,
          title: m.name,
          meta: [m.reference, m.matterType, m.archivedAt ? "Archived" : ""],
          when: relTime(m.updatedAt),
          archived: !!m.archivedAt,
          onOpen: () => openMatter(m.id),
          onRename: (name) =>
            act(`“${m.name}” could not be renamed`, () => updateMatter(m.id, { name })),
          actions: [
            m.archivedAt
              ? {
                  label: "Restore",
                  onClick: () =>
                    void act(`“${m.name}” could not be restored`, () =>
                      setMatterArchived(m.id, false),
                    ),
                }
              : {
                  label: "Archive",
                  onClick: () =>
                    void act(`“${m.name}” could not be archived`, () =>
                      setMatterArchived(m.id, true),
                    ),
                },
            {
              label: "Delete",
              danger: true,
              onClick: () =>
                void (async () => {
                  if (
                    !(await confirmDelete({
                      what: `“${m.name}”`,
                      consequence: "Everything in it goes too.",
                    }))
                  )
                    return;
                  await act(`“${m.name}” could not be deleted`, () => moveToBin("matters", [m.id]));
                })(),
            },
          ],
        }))}
      />
    ) : tab === "flows" ? (
      <WorkList
        toolbar={
          <>
            {archivedToggle(allFlows.filter((f) => f.archivedAt).length, "flows")}
            <Button variant="primary" onClick={() => setCreating("flow")}>
              New flow
            </Button>
          </>
        }
        empty={
          allFlows.some((x) => x.archivedAt)
            ? "No active flows. Archived ones are hidden."
            : "No flows yet."
        }
        rows={flows.map((f) => {
          const title = f.name || "Untitled flow";
          // A flow filed to a matter is archived and deleted with its matter,
          // as the Flow screen does; one organised under the client, as itself.
          const onMatter = !!f.matterId;
          return {
            id: f.id,
            title,
            meta: [
              onMatter
                ? f.matterName && f.matterName !== f.name
                  ? `Matter: ${f.matterName}`
                  : "Matter flow"
                : "Client flow · Private to you",
              f.archivedAt ? "Archived" : "",
            ],
            when: relTime(f.updatedAt),
            archived: !!f.archivedAt,
            onOpen: () => openFlow(f.id, f.matterId ?? null),
            onRename: (name: string) =>
              act(`“${title}” could not be renamed`, () => renameFlow(f.id, name)),
            actions: [
              ...(onMatter
                ? [{ label: "Open matter", onClick: () => openMatter(f.matterId!) }]
                : []),
              f.archivedAt
                ? {
                    label: "Restore",
                    onClick: () =>
                      void act(`“${title}” could not be restored`, () =>
                        onMatter
                          ? setMatterArchived(f.matterId!, false)
                          : setArchived("matter_flows", [f.id], false),
                      ),
                  }
                : {
                    label: "Archive",
                    onClick: () =>
                      void act(`“${title}” could not be archived`, () =>
                        onMatter
                          ? setMatterArchived(f.matterId!, true)
                          : setArchived("matter_flows", [f.id], true),
                      ),
                  },
              {
                label: "Delete",
                danger: true,
                onClick: () =>
                  void (async () => {
                    if (
                      !(await confirmDelete({
                        what: `“${title}”`,
                        consequence: onMatter
                          ? `The matter “${f.matterName}” goes with it, and so does everything else in it.`
                          : "Everything in it goes too.",
                      }))
                    )
                      return;
                    await act(`“${title}” could not be deleted`, () =>
                      onMatter
                        ? moveToBin("matters", [f.matterId!])
                        : moveToBin("matter_flows", [f.id]),
                    );
                  })(),
              },
            ],
          };
        })}
      />
    ) : tab === "tasks" ? (
      <>
        <form
          className="org-quick"
          onSubmit={(e) => {
            e.preventDefault();
            void addTask();
          }}
        >
          <input
            ref={taskInput}
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder={`Add a task for ${c?.name ?? "this client"}`}
            aria-label="Add a task for this client"
            disabled={addingTask}
          />
          <Button type="submit" variant="primary" disabled={!taskTitle.trim() || addingTask}>
            {addingTask ? "Adding…" : "Add"}
          </Button>
        </form>
        <div className={openTask ? "cl-task-split" : undefined}>
          <WorkList
            empty="No tasks yet."
            rows={w.tasks.map((t) => ({
              id: t.id,
              title: t.title,
              done: t.status === "Done",
              meta: [
                STATUS_LABEL[t.status as TaskStatus] ?? t.status,
                t.via === "matter"
                  ? t.matterName
                  : t.via === "flow"
                    ? "From a flow"
                    : "Client task",
              ],
              onOpen: () => go({ task: t.id }),
              onToggleDone: (done: boolean) =>
                act(`“${t.title}” could not be updated`, () =>
                  updateTask(t.id, { status: done ? "Done" : "Open" }),
                ),
              onRename: (title: string) =>
                act(`“${t.title}” could not be renamed`, () => updateTask(t.id, { title })),
              due: {
                value: t.dueDate,
                onChange: (dueDate: string | null) =>
                  act(`“${t.title}” could not be updated`, () => updateTask(t.id, { dueDate })),
              },
              actions: [
                {
                  label: "Delete",
                  danger: true,
                  onClick: () =>
                    void (async () => {
                      if (
                        !(await confirmDelete({
                          what: `“${t.title}”`,
                          binned: false,
                          archivable: false,
                        }))
                      )
                        return;
                      await act(`“${t.title}” could not be deleted`, () => deleteTask(t.id));
                    })(),
                },
              ],
            }))}
          />
          {openTask && (
            <aside className="cl-task-detail" aria-label={`Task: ${openTask.title}`}>
              <button
                type="button"
                className="cl-task-close"
                aria-label="Close the task"
                onClick={() => go({ task: undefined })}
              >
                ×
              </button>
              <TaskDetail
                key={openTask.id}
                task={openTask}
                today={new Date().toISOString().slice(0, 10)}
                matters={(matterList ?? []).map((m) => ({ id: m.id, name: m.name }))}
                onPatch={(patch) =>
                  void act(`“${openTask.title}” could not be updated`, () =>
                    updateTask(openTask.id, patch),
                  )
                }
                onDelete={(task) =>
                  void (async () => {
                    if (
                      !(await confirmDelete({
                        what: `“${task.title}”`,
                        binned: false,
                        archivable: false,
                      }))
                    )
                      return;
                    if (
                      await act(`“${task.title}” could not be deleted`, () => deleteTask(task.id))
                    )
                      go({ task: undefined });
                  })()
                }
                onConvertToFlow={(task) =>
                  task.matterId
                    ? openMatter(task.matterId, "flows")
                    : void navigate({ to: "/matters/flow" })
                }
              />
            </aside>
          )}
        </div>
      </>
    ) : (
      <>
        <ClientHeldDocuments
          documents={organisation.data?.documents ?? null}
          onOpenShelf={() =>
            go({ tab: "organisation", area: "documents", item: undefined, mode: undefined })
          }
        />
        <WorkList
          empty="No documents on its matters yet."
          rows={w.documents.map((d) => ({
            id: d.id,
            title: d.name,
            meta: [d.matterName, d.kind],
            when: relTime(d.createdAt),
            onOpen: () => openMatter(d.matterId, "documents"),
          }))}
        />
      </>
    );

  const clientTabs = (
    <TabRow<ClientTab>
      tabs={CLIENT_TABS.filter(
        (id) =>
          (id !== "organisation" || hasOrganisation) && (id !== "marketing" || !!marketingLevel),
      ).map((id) => ({
        id,
        label: w && counts[id] !== null ? `${TAB_LABEL[id]} ${counts[id]}` : TAB_LABEL[id],
      }))}
      active={tab}
      onChange={setTab}
    />
  );

  // A matter or flow open inside the client is drawn by its own screen, framed
  // by the client: Clients in the sidebar, the client in the breadcrumb, the
  // client's tabs above its own.
  const frame: HostFrame = {
    section: "clients",
    back: { label: c?.name ?? "Client", href: `/clients/${clientId}` },
    crumbs: [
      { label: "Clients", to: "/clients" },
      { label: c?.name ?? "Client", onClick: () => setTab("overview") },
    ],
    tabs: clientTabs,
  };
  // Opening or leaving a matter or flow is a step Back undoes; moving inside one is not.
  const setNested = (patch: Partial<ClientSearch>) =>
    go(patch, !("flow" in patch) && !("matter" in patch));

  if (tab === "matters" && nested.matter)
    return (
      <AppProvider
        key={nested.matter}
        matterId={nested.matter}
        initial={{ screen: nested.screen ?? "matter" }}
      >
        <Workbench frame={frame} hostedFlow={{ search: nested, setSearch: setNested }} />
      </AppProvider>
    );
  if (tab === "flows" && nested.flow)
    return (
      <MatterFlowScreen
        key={nested.flow}
        flowKey={{ flowId: nested.flow }}
        search={flowSearchOf(nested)}
        setSearch={(patch) => setNested(hostedPatch(patch))}
        frame={frame}
      />
    );

  const openFlowById = (flowId: string) =>
    openFlow(flowId, w?.flows.find((f) => f.id === flowId)?.matterId ?? null);

  return (
    <FlowOpenerProvider value={openFlowById}>
      <AppShell
        section="clients"
        scroll={false}
        back={{ label: "Clients", href: "/clients" }}
        trackLabel={c ? `${c.name} · Client` : "Client"}
        breadcrumb={
          <Crumbs
            items={[
              { label: "Clients", to: "/clients" },
              tab === "organisation" || tab === "marketing"
                ? { label: c?.name ?? "Client", onClick: () => setTab("overview") }
                : { label: c?.name ?? "Client" },
              ...(tab === "organisation"
                ? [{ label: ORG_AREAS.find((a) => a.id === area)?.label ?? "Organisation" }]
                : []),
              ...(tab === "marketing"
                ? [
                    { label: "Marketing", onClick: () => go({ view: "content", item: undefined }) },
                    { label: MARKETING_VIEWS.find((v) => v.id === view)?.label ?? "Content" },
                  ]
                : []),
            ]}
          />
        }
        assistant={{
          key: `client.${clientId}`,
          label: c?.name ?? "Client",
          screen: "Client",
          intro: "Ask what is open for this client across the work you can see.",
        }}
        tabs={clientTabs}
      >
        <div
          className={`cl-page${tab === "organisation" || tab === "marketing" ? " is-organisation" : ""}`}
        >
          <ActionError error={actionError} onDismiss={() => setActionError(null)} />
          {c && (
            <header className="cl-head">
              <div className="cl-head-text">
                <div className="cl-title-row">
                  <h1>{c.name}</h1>
                  {!c.deletedAt && (
                    // The client's own actions sit with its name, so they are
                    // never read as acting on the list below.
                    <ActionMenu
                      align="start"
                      label={c.name}
                      trigger={
                        <button
                          type="button"
                          className="cl-title-menu"
                          aria-label={`Actions for ${c.name}`}
                          title="Client actions"
                        >
                          ⋯
                        </button>
                      }
                      actions={[
                        { label: "Edit client details", onClick: () => setEditing(true) },
                        c.archivedAt
                          ? { label: "Restore client", onClick: () => void toggleArchive() }
                          : { label: "Archive client", onClick: () => void toggleArchive() },
                        ...(owner
                          ? [
                              {
                                label: "Delete client",
                                danger: true,
                                onClick: () => void removeClient(),
                              },
                            ]
                          : []),
                      ]}
                    />
                  )}
                </div>
                <p>
                  {CLIENT_KIND_LABEL[c.kind]}
                  {c.reference ? ` · ${c.reference}` : ""}
                  {c.archivedAt ? " · Archived" : ""}
                  {c.deletedAt ? ` · In Recently Deleted · ${binCountdown(c.deletedAt)}` : ""}
                </p>
              </div>
              {c.deletedAt ? (
                <div className="cl-head-actions">
                  {owner && (
                    <>
                      <Button variant="primary" onClick={() => void restoreClient()}>
                        Restore
                      </Button>
                      <Button variant="quiet" onClick={() => void removeForGood()}>
                        Delete for good
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="cl-head-actions">
                  <ActionMenu
                    label={`new work for ${c.name}`}
                    trigger={
                      <button type="button" className="cl-new" aria-label={`New for ${c.name}`}>
                        New <span aria-hidden>▾</span>
                      </button>
                    }
                    actions={[
                      {
                        label: "Note",
                        onClick: () => {
                          setTab("notes");
                          setComposingNote(true);
                        },
                      },
                      { label: "Task", onClick: newTask },
                      { label: "Matter", onClick: () => setCreating("matter") },
                      { label: "Flow", onClick: () => setCreating("flow") },
                    ]}
                  />
                </div>
              )}
            </header>
          )}
          {tab === "marketing" ? (
            c && marketingLevel ? (
              <MarketingArea
                client={c}
                level={marketingLevel}
                view={view}
                item={item}
                go={(next) =>
                  go({
                    tab: "marketing",
                    ...(next.view ? { view: next.view } : {}),
                    ...(next.item !== undefined ? { item: next.item ?? undefined } : {}),
                  })
                }
              />
            ) : (
              <p className="cl-quiet" role="status" style={{ padding: "0 32px" }}>
                Loading…
              </p>
            )
          ) : tab === "organisation" ? (
            c && organisation.data ? (
              <OrganisationArea
                org={organisation.data}
                client={c}
                area={area}
                item={item}
                mode={mode}
                go={(next) =>
                  go({
                    tab: "organisation",
                    ...(next.area ? { area: next.area } : {}),
                    ...(next.item !== undefined ? { item: next.item ?? undefined } : {}),
                    ...(next.mode !== undefined ? { mode: next.mode ?? undefined } : {}),
                  })
                }
                openTab={setTab}
                onManageAreas={() => setEditing(true)}
              />
            ) : (
              <p className="cl-quiet" role={organisation.isError ? "alert" : "status"}>
                {organisation.isError ? (organisation.error as Error).message : "Loading…"}
              </p>
            )
          ) : (
            <div className="cl-body">{body}</div>
          )}
        </div>
        {confirmDialog}
        {c && (
          <EditClientDialog
            client={c}
            open={editing}
            onClose={() => setEditing(false)}
            onSaved={refresh}
          />
        )}
        {creating === "matter" && c && (
          <NewMatterDialog
            open
            onClose={() => setCreating(null)}
            client={{ kind: "existing", id: c.id, name: c.name }}
          />
        )}
        {creating === "flow" && c && (
          <NewFlowDialog
            open
            onClose={() => setCreating(null)}
            client={{ kind: "existing", id: c.id, name: c.name }}
          />
        )}
      </AppShell>
    </FlowOpenerProvider>
  );
}
