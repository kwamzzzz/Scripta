/**
 * A matter as a file: what hangs off it, read through each table's own policy.
 *
 * The workbench already loads the matter's documents, clauses and activity for
 * Contract Review. This adds what a file needs besides: its flows as they
 * stand, its tasks, and which Workflow Tools have been used on it. Nothing here
 * asks the database for more than the reader may see.
 */
import { supabase } from "@/integrations/supabase/client";
import { loadFlow } from "@/matter-flow/flow-db";
import { allDeliverables, deriveFlow } from "@/matter-flow/model";

export type FileFlow = {
  id: string;
  name: string;
  phase: string;
  phaseNumber: number;
  phaseCount: number;
  complete: number;
  total: number;
  overdue: number;
  waiting: number;
  next: { name: string; on: string } | null;
};

export type FileTask = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  plannedOn: string | null;
  priority: string;
  fromFlow: boolean;
};

export type FileTool = {
  kind: string;
  id: string;
  title: string;
  to: string;
  params: Record<string, string>;
};

export type MatterFile = {
  workspaceId: string;
  reference: string;
  matterType: string;
  counterparty: string;
  governingLaw: string;
  targetDate: string | null;
  clientId: string | null;
  clientName: string;
  /** The client's entity this matter concerns, if one is named. */
  clientEntityId: string | null;
  flows: FileFlow[];
  tasks: FileTask[];
  tools: FileTool[];
};

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function loadMatterFile(matterId: string): Promise<MatterFile> {
  const [matter, flowRows, tasks, drafts, corporate, research, transcripts] = await Promise.all([
    supabase
      .from("matters")
      .select(
        "workspace_id, name, reference, matter_type, counterparty, governing_law, target_date, client_id, client, client_entity_id",
      )
      .eq("id", matterId)
      .maybeSingle(),
    supabase.from("matter_flows").select("id").eq("matter_id", matterId).order("created_at"),
    supabase
      .from("tasks")
      .select("id, title, status, due_date, planned_on, priority, flow_deliverable_id")
      .eq("matter_id", matterId)
      .order("created_at", { ascending: false }),
    supabase
      .from("contract_drafts")
      .select("id, title")
      .eq("matter_id", matterId)
      .is("deleted_at", null),
    supabase
      .from("corporate_documents")
      .select("id, title")
      .eq("matter_id", matterId)
      .is("deleted_at", null),
    supabase
      .from("research_matters")
      .select("id, title")
      .eq("matter_id", matterId)
      .is("deleted_at", null),
    supabase.from("transcripts").select("id, meeting_title").eq("matter_id", matterId),
  ]);
  for (const res of [matter, flowRows, tasks, drafts, corporate, research, transcripts])
    fail(res.error);
  const m = matter.data;
  if (!m) throw new Error("This matter is unavailable.");

  const today = isoToday();
  // A matter holds a few flows at most, so each is read whole and derived the
  // way the Flow screen derives it: one definition of "overdue" in the product.
  const loaded = await Promise.all(
    ((flowRows.data ?? []) as { id: string }[]).map((f) =>
      loadFlow(m.workspace_id, { flowId: f.id }),
    ),
  );
  const flows: FileFlow[] = loaded
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map(({ head, record }) => {
      const derived = deriveFlow(record, today);
      const items = allDeliverables(derived);
      const next = items
        .filter((d) => !d.complete && d.deadline)
        .sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
      const active = derived.activePhase;
      return {
        id: head.flowId,
        name: head.name || m.name,
        phase: active?.name ?? "",
        phaseNumber: active ? derived.phases.findIndex((p) => p.id === active.id) + 1 : 0,
        phaseCount: derived.phases.length,
        complete: items.filter((d) => d.complete).length,
        total: items.length,
        overdue: items.filter((d) => d.state === "overdue").length,
        waiting: items.filter((d) => d.state === "waiting_on").length,
        next: next ? { name: next.name, on: next.deadline } : null,
      };
    });

  const tools: FileTool[] = [
    ...((drafts.data ?? []) as { id: string; title: string }[]).map((d) => ({
      kind: "Contract Drafting",
      id: d.id,
      title: d.title || "Untitled draft",
      to: "/matters/contract-drafting/$draftId",
      params: { draftId: d.id },
    })),
    ...((corporate.data ?? []) as { id: string; title: string }[]).map((d) => ({
      kind: "Corporate Drafting",
      id: d.id,
      title: d.title || "Untitled document",
      to: "/matters/corporate-drafting/$documentId",
      params: { documentId: d.id },
    })),
    ...((research.data ?? []) as { id: string; title: string }[]).map((d) => ({
      kind: "Legal Research",
      id: d.id,
      title: d.title || "Untitled research",
      to: "/research/$researchId",
      params: { researchId: d.id },
    })),
    ...((transcripts.data ?? []) as { id: string; meeting_title: string | null }[]).map((d) => ({
      kind: "Transcript",
      id: d.id,
      title: d.meeting_title || "Meeting transcript",
      to: "/transcripts/$transcriptId",
      params: { transcriptId: d.id },
    })),
  ];

  return {
    workspaceId: m.workspace_id,
    reference: m.reference ?? "",
    matterType: m.matter_type ?? "",
    counterparty: m.counterparty ?? "",
    governingLaw: m.governing_law ?? "",
    targetDate: m.target_date ?? null,
    clientId: m.client_id ?? null,
    clientName: m.client_id ? (m.client ?? "") : "",
    clientEntityId: m.client_entity_id ?? null,
    flows,
    tasks: ((tasks.data ?? []) as any[]).map((t) => ({
      id: t.id,
      title: String(t.title ?? ""),
      status: String(t.status ?? "Open"),
      dueDate: t.due_date ?? null,
      plannedOn: t.planned_on ?? null,
      priority: String(t.priority ?? "normal"),
      fromFlow: !!t.flow_deliverable_id,
    })),
    tools,
  };
}
