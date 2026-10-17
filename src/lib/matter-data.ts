import { nextStepKind } from "./collaboration";
import { supabase } from "@/integrations/supabase/client";
import type {
  Change,
  ClauseStatus,
  LegalData,
  Risk,
  ApprovalStatus,
  ClauseLink,
  PlaybookMeta,
  Precedent,
  ReviewStateName,
  Seg,
  TranscriptMeta,
  Verdict,
} from "@/data/legal";
import { asDoc } from "@/wireframe/clause-doc";

export const EMPTY_DATA: LegalData = {
  transcript: null,
  matter: {
    name: "",
    client: "",
    counterparty: "",
    stage: "",
    playbook: "",
    docs: [],
    timeline: [],
  },
  clauses: [],
  discussions: [],
  resolutions: [],
  draftingPoints: [],
  playbook: [],
  playbookMeta: null,
  precedents: [],
  links: [],
};

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

const longDate = (d: string | null) =>
  d
    ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type MatterSummary = {
  id: string;
  name: string;
  is_sample: boolean;
  stage: string | null;
  client: string | null;
  counterparty: string | null;
  /** Put aside, reversibly. Null is live. */
  archived_at: string | null;
  /** In Recently Deleted. Null is live. */
  deleted_at: string | null;
};

export async function fetchMatterData(matterId: string): Promise<LegalData> {
  const [matterRes, docRes, clauseRes, transcriptRes, resolutionRes, draftRes, auditRes] =
    await Promise.all([
      supabase.from("matters").select("*, playbooks(*)").eq("id", matterId).maybeSingle(),
      supabase
        .from("documents")
        .select("*")
        .eq("matter_id", matterId)
        // Not the ones in Recently Deleted. The Documents library has always
        // filtered these; the matter workbench never did, so a document
        // deleted anywhere went on appearing on its own matter — which reads
        // as the delete having silently failed.
        .is("deleted_at", null)
        .order("doc_date", { ascending: true }),
      supabase
        .from("clauses")
        .select(
          "*, clause_segments(ordinal, text, kind), clause_assessments(playbook_rule_id, verdict, detail)",
        )
        .eq("matter_id", matterId)
        .order("ordinal", { ascending: true }),
      supabase
        .from("transcripts")
        .select(
          "id, meeting_title, meeting_date, duration_minutes, source_label, speaker_count, attribution, meeting_kind, created_at, discussion_points(id, ordinal, timestamp_label, speaker_name, speaker_role, text), transcript_insights(discussion_point_id, excerpt, title, category)",
        )
        .order("created_at", { ascending: true })
        .eq("matter_id", matterId),
      supabase
        .from("resolutions")
        .select("*, resolution_sources(discussion_point_id)")
        .eq("matter_id", matterId)
        .order("ordinal", { ascending: true }),
      supabase
        .from("drafting_points")
        .select("*")
        .eq("matter_id", matterId)
        .order("ordinal", { ascending: true }),
      supabase
        .from("audit_events")
        .select("created_at, summary, actor_name, entity_id, event_type, metadata")
        .eq("matter_id", matterId)
        .order("created_at", { ascending: true }),
    ]);

  const matter = matterRes.data;
  if (!matter) return EMPTY_DATA;

  const playbookId = matter.playbook_id;
  const ruleRes = playbookId
    ? await supabase
        .from("playbook_rules")
        .select("*")
        .eq("playbook_id", playbookId)
        .order("ordinal")
    : { data: [] };
  const rules = ruleRes.data ?? [];

  const pbOwnerId = (matter.playbooks as { owner_id?: string | null } | null)?.owner_id ?? null;
  const [precedentRes, linkRes, pbOwnerRes] = await Promise.all([
    supabase
      .from("precedents")
      .select("id, title, clause_type, agreement_type, jurisdiction, body, approved")
      .eq("workspace_id", matter.workspace_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("links")
      .select("id, from_kind, from_id, to_kind, to_id, note")
      .eq("workspace_id", matter.workspace_id)
      .eq("from_kind", "clause"),
    pbOwnerId
      ? supabase.from("profiles").select("full_name, email").eq("id", pbOwnerId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const approverIds = (
    ((matter.playbooks as { approvers?: string[] | null } | null)?.approvers ?? []) as string[]
  ).filter(Boolean);
  const approverRes = approverIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", approverIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const approverNames = approverIds.map((id) => {
    const p = (approverRes.data ?? []).find((x) => x.id === id);
    return p?.full_name ?? p?.email ?? id;
  });

  const ruleById = new Map(rules.map((r) => [r.id, r]));

  const clauses = (clauseRes.data ?? []).map((c) => {
    const assessment = (c.clause_assessments ?? [])[0] ?? null;
    const rule = assessment?.playbook_rule_id
      ? ruleById.get(assessment.playbook_rule_id)
      : undefined;
    const segs: Seg[] = [...(c.clause_segments ?? [])]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((s) => ({ t: s.text, k: s.kind as Seg["k"] }));
    return {
      id: c.id,
      num: c.num ?? "",
      documentNum: c.document_num ?? null,
      title: c.title,
      change: (c.change ?? "Baseline") as Change,
      risk: (c.risk ?? "Low") as Risk,
      status: c.status as ClauseStatus,
      diff: c.diff_summary ?? "",
      analysis: c.analysis ?? "",
      pb:
        assessment && rule
          ? {
              rule: rule.id,
              topic: rule.topic,
              verdict: assessment.verdict as Verdict,
              detail: assessment.detail ?? "",
            }
          : null,
      page: c.page_ref ?? "",
      segs,
      partsNumbered: (c as { parts_numbered?: boolean | null }).parts_numbered ?? undefined,
      // The clause as an editor document, when it has been formatted. Null means
      // the clause is exactly its segments' text.
      doc: asDoc(c.doc),
      aiAnalysis: c.analysis_source === "ai" && !!(c.analysis ?? "").trim(),
      analysisError: c.analysis_error ?? null,
      reviewState: (c.review_state ?? null) as ReviewStateName | null,
      approval: (c.approval ?? "Not required") as ApprovalStatus,
      assigneeId: c.assignee_id ?? null,
      suggestedText: c.suggested_text ?? null,
      classification: c.classification ?? null,
      classificationReason: c.classification_reason ?? null,
      classificationSource: (c.classification_source ?? null) as "ai" | "human" | null,
      confidence: c.confidence === null || c.confidence === undefined ? null : Number(c.confidence),
    };
  });

  const transcriptRows = transcriptRes.data ?? [];
  const trMeta = transcriptRows[transcriptRows.length - 1] ?? null;

  const points = (transcriptRes.data ?? [])
    .flatMap((t) => t.discussion_points ?? [])
    .sort((a, b) => a.ordinal - b.ordinal);

  const resolutionRows = resolutionRes.data ?? [];
  const draftRows = draftRes.data ?? [];

  const auditRows = auditRes.data ?? [];
  const confirmedDraftIds = new Set(
    auditRows.filter((e) => e.event_type === "drafting_point.instructed").map((e) => e.entity_id),
  );
  const resolutions = resolutionRows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as ClauseStatus,
    text: r.text ?? "",
    src: (r.resolution_sources ?? []).map((s) => s.discussion_point_id),
    dp: draftRows
      .filter((d) => d.resolution_id === r.id && confirmedDraftIds.has(d.id))
      .map((d) => d.id),
    owner: r.owner_name ?? "",
    pb: r.playbook_verdict
      ? { verdict: r.playbook_verdict as Verdict, detail: r.playbook_detail ?? "" }
      : null,
    ai: (r as { source?: string }).source === "ai",
    updatedAt: r.updated_at,
    ownerId: r.owner_id,
    reviewedBy:
      [...auditRows]
        .reverse()
        .find(
          (e) =>
            e.entity_id === r.id &&
            ["resolution.accepted", "resolution.reviewed"].includes(e.event_type),
        )?.actor_name ?? undefined,
    reviewedAt: [...auditRows]
      .reverse()
      .find(
        (e) =>
          e.entity_id === r.id &&
          ["resolution.accepted", "resolution.reviewed"].includes(e.event_type),
      )?.created_at,
  }));

  // The passage each cited utterance was quoted for — first insight wins.
  const excerptByPoint = new Map<string, string>();
  for (const t of transcriptRows)
    for (const i of t.transcript_insights ?? [])
      if (i.discussion_point_id && i.excerpt && !excerptByPoint.has(i.discussion_point_id))
        excerptByPoint.set(i.discussion_point_id, i.excerpt);

  const discussions = points.map((p) => ({
    id: p.id,
    t: p.timestamp_label ?? "",
    speaker: p.speaker_name ?? "",
    role: p.speaker_role ?? "",
    text: p.text,
    excerpt: excerptByPoint.get(p.id) ?? null,
    res: resolutions.filter((r) => r.src.includes(p.id)).map((r) => r.id),
  }));

  const draftingPoints = draftRows.map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status as ClauseStatus,
    text: d.text ?? "",
    from: confirmedDraftIds.has(d.id) ? (d.resolution_id ?? "") : "",
    linkConfirmed: confirmedDraftIds.has(d.id),
    kind: confirmedDraftIds.has(d.id)
      ? ("drafting" as const)
      : nextStepKind(
          transcriptRows
            .flatMap((t) => t.transcript_insights ?? [])
            .find((i) => i.title === d.title)?.category,
        ),
    clause: d.clause_id,
    ai: (d as { source?: string }).source === "ai",
  }));

  const playbook = rules.map((r) => ({
    id: r.id,
    topic: r.topic,
    preferred: r.preferred ?? "",
    fallback: r.fallback ?? "",
    redflag: r.redflag ?? "",
    escalate: r.escalate ?? "",
    clause: r.approved_clause_text ?? "",
    owner: r.owner_name ?? "",
    usage: r.usage_note ?? "",
    linked: clauses.filter((c) => c.pb?.rule === r.id).map((c) => c.id),
    note: r.suggestion_note,
    acceptable: r.acceptable ?? "",
    riskLevel: r.risk_level ?? "",
    negotiation: r.negotiation_guidance ?? "",
    commercialRationale: r.commercial_rationale ?? "",
    legalRationale: r.legal_rationale ?? "",
    approvalThreshold: r.approval_threshold ?? "",
    jurisdictionNote: r.jurisdiction_note ?? "",
    internalNote: r.internal_note ?? "",
    updatedAt: r.updated_at ?? null,
  }));

  const pbRow = matter.playbooks as Record<string, any> | null;
  const pbMeta: PlaybookMeta | null = pbRow
    ? {
        id: pbRow["id"],
        name: pbRow["name"],
        version: pbRow["version_label"] ?? "",
        status: pbRow["status"] ?? "",
        description: pbRow["description"] ?? "",
        jurisdiction: pbRow["jurisdiction"] ?? "",
        agreementType: pbRow["agreement_type"] ?? "",
        team: pbRow["team"] ?? "",
        owner: pbOwnerRes.data?.full_name ?? pbOwnerRes.data?.email ?? "",
        effectiveDate: longDate(pbRow["effective_date"] ?? null),
        lastReviewedAt: longDate(pbRow["last_reviewed_at"] ?? null),
        approval: (pbRow["approval"] ?? "Not required") as ApprovalStatus,
        approvers: approverNames,
      }
    : null;

  const precedents: Precedent[] = (precedentRes.data ?? []).map((p: any) => ({
    id: p.id,
    title: p.title,
    clauseType: p.clause_type ?? "",
    agreementType: p.agreement_type ?? "",
    jurisdiction: p.jurisdiction ?? "",
    body: p.body,
    approved: !!p.approved,
  }));

  const clauseIds = new Set(clauses.map((c) => c.id));
  const links: ClauseLink[] = (linkRes.data ?? [])
    .filter((l: any) => clauseIds.has(l.from_id))
    .map((l: any) => ({
      id: l.id,
      clauseId: l.from_id,
      toKind: l.to_kind,
      toId: l.to_id,
      note: l.note ?? "",
    }));

  return {
    transcript: trMeta
      ? {
          id: trMeta.id,
          meetingKind: (trMeta as { meeting_kind?: string }).meeting_kind ?? "negotiation",
          title: trMeta.meeting_title ?? "Meeting",
          date: longDate(trMeta.meeting_date),
          durationMinutes: trMeta.duration_minutes,
          sourceLabel: trMeta.source_label ?? "",
          speakerCount: trMeta.speaker_count,
          attribution: ((trMeta.attribution as string | null) ?? "file") as NonNullable<
            TranscriptMeta["attribution"]
          >,
        }
      : null,
    matter: {
      name: matter.name,
      useLetterhead: (matter as { use_letterhead?: boolean | null }).use_letterhead ?? undefined,
      client: matter.client ?? "",
      counterparty: matter.counterparty ?? "",
      stage: matter.stage ?? "",
      playbook: pbMeta ? `${pbMeta.name} ${pbMeta.version}`.trim() : "",
      docs: (docRes.data ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        ver: d.version_label ?? "",
        date: longDate(d.doc_date),
        kind: cap(d.kind),
        rawKind: d.kind,
        parseStatus: d.parse_status,
        parseError: d.parse_error,
        storagePath: d.storage_path ?? null,
      })),
      timeline: (auditRes.data ?? []).map((e) => ({
        d: shortDate(e.created_at),
        e: e.summary,
        by: e.actor_name ?? "System",
      })),
    },
    clauses,
    discussions,
    resolutions,
    draftingPoints,
    playbook,
    playbookMeta: pbMeta,
    precedents,
    links,
  };
}
