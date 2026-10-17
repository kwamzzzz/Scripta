import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callStructured, GatewayError } from "@/lib/ai-gateway.server";
import { ACTION_LABEL, ASSESSMENTS, type DraftAction, type GuidanceStep } from "@/lib/drafting";
import { restoreDraft, shapeDraftList, type DraftRow } from "@/lib/draft-persistence";

async function actorName(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? data?.email ?? "Unknown";
}

const DRAFTER_SYSTEM = [
  "You are a senior commercial lawyer drafting contract language for the party named in the request.",
  "Write clause text only: no preamble, no commentary, no markdown, no headings, no bullet lists inside the clause.",
  "Follow the supplied source guidance exactly. Where the guidance gives approved language, stay as close to it as the request allows and say in your reasoning where you departed from it and why.",
  "Never invent a party name, a figure, a jurisdiction or a defined term that is not in the request or the guidance — use a clearly bracketed placeholder instead.",
  "Register: precise, plain, enforceable. No hedging, no 'best efforts to endeavour', no recitals of good faith unless asked.",
].join(" ");

const ASSESSOR_SYSTEM = [
  "You are a senior commercial lawyer assessing contract language against a stated position.",
  "You produce analysis, never replacement clause text. Two to five short paragraphs at most.",
  "Be specific about what the text does, where it departs from the guidance, and what the negotiating consequence is.",
].join(" ");

const instruction: Record<DraftAction, string> = {
  draft_clause: "Draft the clause described in the request.",
  create_fallback:
    "Write fallback wording: a position the client can move to if the preferred position is rejected, while still protecting the key interest.",
  governing_law:
    "Produce a variation of the clause adapted to the stated governing law, flagging any term that does not travel to that jurisdiction.",
  improve:
    "Improve the clause: tighten it, close gaps and remove ambiguity, without shifting the commercial deal.",
  balance:
    "Rewrite the clause so obligations, remedies and carve-outs fall evenly on both parties. Neither side should be advantaged.",
  favour_customer:
    "Rewrite the clause to favour the customer, while keeping it a clause a supplier could realistically sign.",
  favour_supplier:
    "Rewrite the clause to favour the supplier, while keeping it a clause a customer could realistically sign.",
  compare_playbook:
    "Compare the text against the playbook position supplied. State whether it is consistent, a fallback, a red flag or requires escalation, and why.",
  negotiation_summary:
    "Summarise the negotiating position this text creates: what the client is asking for, what the counterparty will push back on, and where the landing zone is.",
  find_precedent:
    "Assess which of the supplied precedents is the closest match to the request, and what would need to change to reuse it.",
};

/**
 * Run one structured drafting action. The guidance chain — request, source
 * guidance, suggested language — is returned with the output, so the drafting
 * screen can show exactly what drove the result.
 */
export const runDraftingAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      action: DraftAction;
      request: string;
      currentText?: string;
      playbookRuleId?: string | null;
      precedentId?: string | null;
      matterId?: string | null;
      jurisdiction?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const guidance: GuidanceStep[] = [];
    if (data.matterId) {
      const { loadMatterContext } = await import("./matter-context.server");
      const ctx = await loadMatterContext(supabase, data.matterId);
      const { briefMissing } = await import("./collaboration");
      const missing = briefMissing(ctx.brief);
      if (missing.length)
        throw new Error(`Complete the Team brief before drafting: ${missing.join(", ")}.`);
      guidance.push({
        label: "Shared matter brief and agreement context",
        body: ctx.text,
        source: "user",
      });
    }

    if (data.playbookRuleId) {
      const { data: rule } = await supabase
        .from("playbook_rules")
        .select(
          "topic, preferred, acceptable, fallback, redflag, escalate, approved_clause_text, negotiation_guidance, commercial_rationale, legal_rationale, playbooks(name, version_label)",
        )
        .eq("id", data.playbookRuleId)
        .maybeSingle();
      if (rule) {
        const pb = rule.playbooks as { name?: string; version_label?: string } | null;
        guidance.push({
          label:
            `Playbook — ${rule.topic}${pb?.name ? ` · ${pb.name} ${pb.version_label ?? ""}` : ""}`.trim(),
          body: [
            rule.preferred ? `Preferred: ${rule.preferred}` : null,
            rule.acceptable ? `Acceptable: ${rule.acceptable}` : null,
            rule.fallback ? `Fallback: ${rule.fallback}` : null,
            rule.redflag ? `Red flag: ${rule.redflag}` : null,
            rule.escalate ? `Escalate: ${rule.escalate}` : null,
            rule.approved_clause_text ? `Approved language: ${rule.approved_clause_text}` : null,
            rule.negotiation_guidance ? `Negotiation: ${rule.negotiation_guidance}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          source: "playbook",
        });
      }
    }

    if (data.precedentId) {
      const { data: p } = await supabase
        .from("precedents")
        .select("title, body, clause_type, jurisdiction, agreement_type, approved")
        .eq("id", data.precedentId)
        .maybeSingle();
      if (p)
        guidance.push({
          label: `Precedent — ${p.title}${p.approved ? " (approved)" : ""}`,
          body: p.body,
          source: "precedent",
        });
    }

    if (data.currentText?.trim())
      guidance.push({ label: "Text being revised", body: data.currentText.trim(), source: "user" });

    const assessment = ASSESSMENTS.includes(data.action);

    const prompt = [
      `ACTION: ${ACTION_LABEL[data.action]}`,
      `INSTRUCTION: ${instruction[data.action]}`,
      data.jurisdiction ? `GOVERNING LAW: ${data.jurisdiction}` : null,
      "",
      `REQUEST: ${data.request || "(none given — work from the guidance below)"}`,
      "",
      guidance.length ? "SOURCE GUIDANCE:" : "SOURCE GUIDANCE: none supplied.",
      ...guidance.map((g) => `${g.label}\n${g.body}`),
    ]
      .filter((l) => l !== null)
      .join("\n");

    try {
      const out = await callStructured<{ text: string; reasoning: string }>({
        feature: "drafting",
        actor: { supabase, userId },
        system: assessment ? ASSESSOR_SYSTEM : DRAFTER_SYSTEM,
        user: prompt,
        toolName: "return_draft",
        toolDescription: "Return the drafted or assessed text and the reasoning behind it.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            reasoning: { type: "string" },
          },
          required: ["text", "reasoning"],
        },
      });
      guidance.push({ label: "How this was produced", body: out.reasoning, source: "ai" });
      return { ok: true as const, text: out.text, guidance, assessment };
    } catch (e) {
      const message =
        e instanceof GatewayError ? e.message : e instanceof Error ? e.message : "Drafting failed";
      return { ok: false as const, error: message, guidance };
    }
  });

const DRAFT_SELECT = [
  "id",
  "workspace_id",
  "matter_id",
  "title",
  "body",
  "source",
  "agreement_type",
  "clause_category",
  "jurisdiction",
  "sector",
  "risk_position",
  "created_by",
  "created_at",
  "updated_at",
  "matters(name)",
].join(", ");

/** The current workspace's saved drafting work, newest first. */
export const listDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: rows, error } = await supabase
      .from("drafts")
      .select(DRAFT_SELECT)
      .eq("workspace_id", data.workspaceId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true });
    if (error) throw new Error(error.message);
    return shapeDraftList((rows ?? []) as unknown as DraftRow[]);
  });

/** One saved draft, scoped explicitly to the workspace as well as by RLS. */
export const loadDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string; draftId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: row, error } = await supabase
      .from("drafts")
      .select(DRAFT_SELECT)
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.draftId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("This draft is unavailable in the current workspace.");
    return restoreDraft(row as unknown as DraftRow);
  });

/** Persist a draft so the work survives a reload. */
export const saveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      id?: string | null;
      workspaceId: string;
      matterId?: string | null;
      title: string;
      body: string;
      source: "ai" | "human";
      agreementType?: string | null;
      clauseCategory?: string | null;
      jurisdiction?: string | null;
      sector?: string | null;
      riskPosition?: string | null;
      expectedUpdatedAt?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const row = {
      matter_id: data.matterId ?? null,
      title: data.title || "Untitled draft",
      body: data.body,
      source: data.source,
      agreement_type: data.agreementType ?? null,
      clause_category: data.clauseCategory ?? null,
      jurisdiction: data.jurisdiction ?? null,
      sector: data.sector ?? null,
      risk_position: data.riskPosition ?? null,
    };
    if (data.id) {
      let update = supabase
        .from("drafts")
        .update(row)
        .eq("workspace_id", data.workspaceId)
        .eq("id", data.id);
      if (data.expectedUpdatedAt) update = update.eq("updated_at", data.expectedUpdatedAt);
      const { data: saved, error } = await update.select("id, updated_at").maybeSingle();
      if (error) throw new Error(error.message);
      if (!saved)
        throw new Error(
          "This draft changed elsewhere or is no longer available. Reload it before saving again.",
        );
      return { ok: true as const, id: saved.id as string, updatedAt: saved.updated_at as string };
    }
    const { data: created, error } = await supabase
      .from("drafts")
      .insert({ ...row, workspace_id: data.workspaceId, created_by: userId })
      .select("id, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      ok: true as const,
      id: created.id as string,
      updatedAt: created.updated_at as string,
    };
  });

/**
 * Land a draft somewhere real: the playbook, or straight into a matter's review
 * as an added clause with tracked changes.
 *
 * Keeping a draft as a precedent does not come through here. A precedent is
 * only worth having with the context around it — which side we acted for, how
 * far the wording got, why it is worth reaching for — and that is asked for at
 * the moment of saving, so it writes through capturePrecedent instead.
 */
export const placeDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      target: "playbook" | "document";
      workspaceId: string;
      title: string;
      body: string;
      matterId?: string | null;
      playbookId?: string | null;
      agreementType?: string | null;
      clauseCategory?: string | null;
      jurisdiction?: string | null;
      sector?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const who = await actorName(supabase, userId);
    if (!data.body.trim()) throw new Error("There is nothing to save yet");

    if (data.target === "playbook") {
      let playbookId = data.playbookId ?? null;
      if (!playbookId) {
        const { data: pb } = await supabase
          .from("playbooks")
          .select("id")
          .eq("workspace_id", data.workspaceId)
          .order("created_at")
          .limit(1);
        playbookId = pb?.[0]?.id ?? null;
      }
      if (!playbookId) {
        const { data: created, error } = await supabase
          .from("playbooks")
          .insert({
            workspace_id: data.workspaceId,
            name: "Working playbook",
            version_label: "v0.1",
            status: "Draft",
            description:
              "Started from the drafting workspace — edit these positions before relying on them.",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        playbookId = created.id;
      }
      const { data: last } = await supabase
        .from("playbook_rules")
        .select("ordinal")
        .eq("playbook_id", playbookId)
        .order("ordinal", { ascending: false })
        .limit(1);
      const { data: row, error: rErr } = await supabase
        .from("playbook_rules")
        .insert({
          playbook_id: playbookId,
          topic: data.title || "Untitled position",
          preferred: data.body,
          approved_clause_text: data.body,
          jurisdiction_note: data.jurisdiction ?? null,
          usage_note: "Added from the drafting workspace",
          ordinal: (last?.[0]?.ordinal ?? 0) + 1,
        })
        .select("id")
        .single();
      if (rErr) throw new Error(rErr.message);
      return {
        ok: true as const,
        message: `Added to the playbook as “${data.title}”.`,
        id: row.id,
      };
    }

    // Insert into a matter's review as an added clause, rendered as tracked
    // changes: every run is an insertion, so the redline reads correctly.
    if (!data.matterId) throw new Error("Choose the matter to insert this clause into");
    const { data: matter } = await supabase
      .from("matters")
      .select("id, name")
      .eq("id", data.matterId)
      .maybeSingle();
    if (!matter) throw new Error("Matter not found");

    const { data: last } = await supabase
      .from("clauses")
      .select("ordinal")
      .eq("matter_id", data.matterId)
      .order("ordinal", { ascending: false })
      .limit(1);
    const ordinal = (last?.[0]?.ordinal ?? 0) + 1;

    const { data: clause, error: cErr } = await supabase
      .from("clauses")
      .insert({
        matter_id: data.matterId,
        title: data.title || "New clause",
        num: `New ${ordinal}`,
        change: "Added",
        status: "Open",
        review_state: "review",
        analysis_source: "human",
        approval: "Not required",
        ordinal,
        diff_summary: "Clause inserted from the drafting workspace — shown as a tracked insertion.",
      })
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);

    const { error: sErr } = await supabase.from("clause_segments").insert({
      clause_id: clause.id,
      ordinal: 1,
      text: data.body,
      kind: "i",
    });
    if (sErr) throw new Error(sErr.message);

    await supabase.from("audit_events").insert({
      matter_id: data.matterId,
      actor_id: userId,
      actor_name: who,
      event_type: "clause.inserted",
      entity_type: "clause",
      entity_id: clause.id,
      summary: `Clause “${data.title}” inserted into the review as a tracked insertion`,
      metadata: { origin: "drafting" },
    });

    return {
      ok: true as const,
      message: `Inserted into ${matter.name} as a tracked insertion.`,
      id: clause.id as string,
    };
  });
