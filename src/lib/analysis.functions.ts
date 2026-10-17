import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callStructured, GatewayError, resolveProvider } from "@/lib/ai-gateway.server";
import { rebuildAmendment, rebuildOriginal, type DiffSeg } from "@/lib/parsing/word-diff";
import { TAG_BANK_TEXT, TAG_KEYS, tagByKey } from "@/lib/clause-tags";
import { loadMatterContext } from "@/lib/matter-context.server";

type Risk = "Low" | "Medium" | "High";
type Verdict = "Consistent" | "Fallback" | "Red flag" | "Escalate";
const RISKS: Risk[] = ["Low", "Medium", "High"];
const VERDICTS: Verdict[] = ["Consistent", "Fallback", "Red flag", "Escalate"];

type Sb = { supabase: { from: (t: string) => any }; userId: string };

async function actorName(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? data?.email ?? "Unknown";
}

async function playbookRules(supabase: any, matterId: string) {
  const { data: matter } = await supabase
    .from("matters")
    .select("playbook_id")
    .eq("id", matterId)
    .maybeSingle();
  if (!matter?.playbook_id) return [] as any[];
  const { data } = await supabase
    .from("playbook_rules")
    .select(
      "id, topic, preferred, acceptable, fallback, redflag, escalate, approved_clause_text, approval_threshold",
    )
    .eq("playbook_id", matter.playbook_id)
    .order("ordinal");
  return data ?? [];
}

const rulesBlock = (rules: any[]) =>
  rules.length === 0
    ? "No playbook rules are available for this matter. Always return playbook_rule_id = null."
    : rules
        .map(
          (r) =>
            `id: ${r.id}\ntopic: ${r.topic}\npreferred: ${r.preferred ?? ""}\nacceptable: ${r.acceptable ?? ""}\nfallback: ${r.fallback ?? ""}\nred flag: ${r.redflag ?? ""}\nescalate: ${r.escalate ?? ""}`,
        )
        .join("\n---\n");

const ANALYST_SYSTEM = [
  "You are a lawyer assisting a collaborative legal team. Review from the represented party and role in the shared matter brief, never assume a buyer or supplier perspective.",
  "You write analysis ABOUT clause text. You never quote at length, never rewrite, never paraphrase and never invent clause language — the clause text you are given is input, never output.",
  "Register: plain, specific, commercially aware, two or three sentences. No hedging boilerplate, no 'it is important to note', no recommendations to 'consult counsel'.",
  "Playbook rules are supplied with ids. You may only return an id from that list, or null. Never invent a rule.",
  "You never decide review status — that is the lawyer's decision.",
  "You also classify the clause with exactly one key from the classification bank supplied in the prompt, answering: is this clause right in law, and right for this contract? Choose the most serious tag that applies (contrary_to_law over inconsistent, for example) and give one sentence of reason grounded in the clause text, the matter brief or named law.",
].join(" ");

const clauseTool = {
  type: "object",
  additionalProperties: false,
  properties: {
    risk: {
      type: "string",
      enum: RISKS,
      description: "Commercial/legal risk this change carries for the client.",
    },
    analysis: {
      type: "string",
      description: "Two or three sentences of analysis about the change.",
    },
    playbook_rule_id: {
      type: ["string", "null"],
      description: "Id of the best-matching supplied playbook rule, or null when none applies.",
    },
    verdict: {
      type: ["string", "null"],
      enum: [...VERDICTS, null],
      description:
        "How the amendment sits on the matched rule's ladder. Null when no rule matched.",
    },
    verdict_detail: {
      type: ["string", "null"],
      description: "One sentence explaining the verdict. Null when no rule matched.",
    },
    confidence: {
      type: "number",
      description: "How confident you are in this assessment, 0 to 1.",
    },
    classification: {
      type: "string",
      enum: TAG_KEYS,
      description: "One key from the classification bank.",
    },
    classification_reason: {
      type: "string",
      description:
        "One sentence: why that classification, citing the clause, the brief or the law relied on.",
    },
  },
  required: [
    "risk",
    "analysis",
    "playbook_rule_id",
    "verdict",
    "verdict_detail",
    "confidence",
    "classification",
    "classification_reason",
  ],
};

/**
 * Analyse a small batch of clauses. Each clause is persisted as it completes,
 * so a failure on clause 12 never discards clauses 1–11.
 */
export const analyseClauses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; clauseIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { loadMatterContext } = await import("./matter-context.server");
    const matterContext = await loadMatterContext(supabase, data.matterId);
    const { briefMissing } = await import("./collaboration");
    const missing = briefMissing(matterContext.brief);
    if (missing.length)
      throw new Error(`Complete the Team brief before analysis: ${missing.join(", ")}.`);
    const rules = await playbookRules(supabase, data.matterId);
    const ruleIds = new Set(rules.map((r: any) => r.id));

    const { data: clauses } = await supabase
      .from("clauses")
      .select("id, num, title, change, diff_summary, clause_segments(ordinal, text, kind)")
      .eq("matter_id", data.matterId)
      .in("id", data.clauseIds);

    const results: { clauseId: string; ok: boolean; error?: string; retryable?: boolean }[] = [];

    for (const id of data.clauseIds) {
      const c = (clauses ?? []).find((x: any) => x.id === id);
      if (!c) {
        results.push({ clauseId: id, ok: false, error: "Clause not found" });
        continue;
      }
      const segs: DiffSeg[] = [...(c.clause_segments ?? [])]
        .sort((a: any, b: any) => a.ordinal - b.ordinal)
        .map((s: any) => ({ t: s.text, k: s.kind }));

      const prompt = [
        matterContext.text,
        "FOCUS CLAUSE FOR THIS ASSESSMENT:",
        `Clause ${c.num ?? ""} — ${c.title}`,
        `Change type: ${c.change}`,
        `Mechanical diff summary: ${c.diff_summary ?? ""}`,
        "",
        "ORIGINAL TEXT:",
        rebuildOriginal(segs) || "(clause did not exist in the original)",
        "",
        "AMENDMENT TEXT:",
        rebuildAmendment(segs) || "(clause was deleted in the amendment)",
        "",
        "PLAYBOOK RULES:",
        rulesBlock(rules),
        "",
        "CLASSIFICATION BANK (return exactly one key):",
        TAG_BANK_TEXT,
      ].join("\n");

      try {
        const out = await callStructured<{
          risk: string;
          analysis: string;
          playbook_rule_id: string | null;
          verdict: string | null;
          verdict_detail: string | null;
          confidence: number;
          classification?: string;
          classification_reason?: string;
        }>({
          feature: "clause-analysis",
          actor: { supabase, userId },
          system: ANALYST_SYSTEM,
          user: prompt,
          toolName: "record_clause_analysis",
          toolDescription: "Record the analysis of one clause change.",
          parameters: clauseTool,
        });

        const risk = (RISKS as string[]).includes(out.risk) ? (out.risk as Risk) : "Medium";
        const analysis = (out.analysis ?? "").trim();
        if (!analysis)
          throw new GatewayError(502, "The AI service returned an empty analysis.", true);

        // Only a rule id we actually supplied is ever accepted.
        const ruleId =
          out.playbook_rule_id && ruleIds.has(out.playbook_rule_id) ? out.playbook_rule_id : null;
        const rule = ruleId ? rules.find((r: any) => r.id === ruleId) : null;
        const verdict =
          ruleId && out.verdict && (VERDICTS as string[]).includes(out.verdict)
            ? out.verdict
            : null;

        // The suggested redline is never model prose: it is the playbook's own
        // approved drafting, proposed for this clause.
        const suggested =
          verdict && verdict !== "Consistent" && (rule?.approved_clause_text ?? "").trim()
            ? (rule.approved_clause_text as string).trim()
            : null;

        const reviewState =
          c.change === "Deleted"
            ? "missing"
            : verdict === "Escalate"
              ? "approval"
              : verdict === "Red flag"
                ? "high-risk"
                : verdict === "Fallback"
                  ? "deviation"
                  : verdict === "Consistent"
                    ? "aligned"
                    : risk === "High"
                      ? "high-risk"
                      : risk === "Medium"
                        ? "review"
                        : "aligned";

        const confidence =
          typeof out.confidence === "number" && out.confidence >= 0 && out.confidence <= 1
            ? out.confidence
            : null;

        const classification = tagByKey(out.classification)?.key ?? null;
        await supabase
          .from("clauses")
          .update({
            risk,
            analysis,
            analysis_source: "ai",
            analysis_error: null,
            review_state: reviewState,
            suggested_text: suggested,
            confidence,
            ...(classification
              ? {
                  classification,
                  classification_reason: (out.classification_reason ?? "").trim() || null,
                  classification_source: "ai",
                }
              : {}),
          })
          .eq("id", c.id);
        await supabase.from("clause_assessments").delete().eq("clause_id", c.id);
        if (ruleId && verdict) {
          await supabase.from("clause_assessments").insert({
            clause_id: c.id,
            playbook_rule_id: ruleId,
            verdict,
            detail: (out.verdict_detail ?? "").trim(),
            source: "ai",
          });
        }
        results.push({ clauseId: id, ok: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Analysis failed";
        const retryable = e instanceof GatewayError ? e.retryable : true;
        // Never leave a clause stuck mid-analysis: record the reason and move on.
        await supabase.from("clauses").update({ analysis_error: message }).eq("id", c.id);
        results.push({ clauseId: id, ok: false, error: message, retryable });
        if (e instanceof GatewayError && (e.status === 402 || e.status === 403)) break;
      }
    }

    return { results };
  });

/** One audit line per analysis run, written when the run finishes. */
export const recordAnalysisRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; analysed: number; failed: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    await supabase.from("audit_events").insert({
      matter_id: data.matterId,
      actor_id: userId,
      actor_name: await actorName(supabase, userId),
      event_type: "clauses.analysed",
      entity_type: "matter",
      entity_id: data.matterId,
      summary: `AI analysis run — ${data.analysed} clause${data.analysed === 1 ? "" : "s"} analysed${
        data.failed ? `, ${data.failed} failed` : ""
      }`,
      metadata: { analysed: data.analysed, failed: data.failed },
    });
    return { ok: true };
  });

/** A human editing the analysis takes ownership of it. */
export const editClauseAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; clauseId: string; analysis: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { data: clause } = await supabase
      .from("clauses")
      .select("num, title")
      .eq("id", data.clauseId)
      .maybeSingle();
    await supabase
      .from("clauses")
      .update({ analysis: data.analysis, analysis_source: "human", analysis_error: null })
      .eq("id", data.clauseId);
    await supabase
      .from("clause_assessments")
      .update({ source: "human" })
      .eq("clause_id", data.clauseId);
    await supabase.from("audit_events").insert({
      matter_id: data.matterId,
      actor_id: userId,
      actor_name: await actorName(supabase, userId),
      event_type: "clause.analysis_edited",
      entity_type: "clause",
      entity_id: data.clauseId,
      summary:
        `Analysis for clause ${clause?.num ?? ""} ${clause?.title ?? ""} edited — now recorded as the reviewer's own`
          .replace(/\s+/g, " ")
          .trim(),
      metadata: {},
    });
    return { ok: true };
  });

/* ---------------- transcript distilling ---------------- */

const DISTIL_SYSTEM = [
  "You are a senior commercial lawyer distilling a negotiation meeting transcript into decisions.",
  "You never invent quotes and never rewrite what was said — the transcript is input, never output.",
  "Each resolution must cite the ids of the discussion points it came from, chosen only from the ids supplied.",
  "Drafting points describe what must change in the contract, in plain instruction form.",
  "Playbook rules are supplied with ids; only use a supplied id, or none.",
].join(" ");

const distilTool = {
  type: "object",
  additionalProperties: false,
  properties: {
    resolutions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string", description: "A short unique key for this resolution, e.g. r1." },
          title: { type: "string" },
          text: { type: "string", description: "One or two sentences stating what was decided." },
          status: { type: "string", enum: ["Accepted", "Open", "Escalated"] },
          owner: {
            type: ["string", "null"],
            description: "Suggested owner's name, taken from the speakers.",
          },
          source_point_ids: { type: "array", items: { type: "string" } },
          playbook_rule_id: { type: ["string", "null"] },
          playbook_verdict: { type: ["string", "null"], enum: [...VERDICTS, null] },
          playbook_detail: { type: ["string", "null"] },
        },
        required: [
          "key",
          "title",
          "text",
          "status",
          "owner",
          "source_point_ids",
          "playbook_rule_id",
          "playbook_verdict",
          "playbook_detail",
        ],
      },
    },
    drafting_points: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          resolution_key: { type: "string" },
          title: { type: "string" },
          text: { type: "string" },
          status: { type: "string", enum: ["Draft", "Open", "Escalated"] },
          clause_id: {
            type: ["string", "null"],
            description: "Id of a supplied clause this obviously changes.",
          },
        },
        required: ["resolution_key", "title", "text", "status", "clause_id"],
      },
    },
  },
  required: ["resolutions", "drafting_points"],
};

export const distilTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;

    const { data: transcripts } = await supabase
      .from("transcripts")
      .select(
        "id, meeting_title, discussion_points(id, ordinal, timestamp_label, speaker_name, speaker_role, text)",
      )
      .eq("matter_id", data.matterId);

    const points = (transcripts ?? [])
      .flatMap((t: any) => t.discussion_points ?? [])
      .sort((a: any, b: any) => a.ordinal - b.ordinal);
    if (points.length === 0) throw new Error("Import a transcript before distilling it.");

    const pointIds = new Set(points.map((p: any) => p.id));
    const rules = await playbookRules(supabase, data.matterId);
    const ruleIds = new Set(rules.map((r: any) => r.id));

    const { data: clauses } = await supabase
      .from("clauses")
      .select("id, num, title")
      .eq("matter_id", data.matterId)
      .order("ordinal");
    const clauseIds = new Set((clauses ?? []).map((c: any) => c.id));

    const prompt = [
      "DISCUSSION POINTS:",
      points
        .map(
          (p: any) =>
            `id: ${p.id}\n${p.timestamp_label ?? ""} ${p.speaker_name ?? ""} (${p.speaker_role ?? ""}): ${p.text}`,
        )
        .join("\n---\n"),
      "",
      "CLAUSES UNDER REVIEW:",
      (clauses ?? []).map((c: any) => `id: ${c.id} — ${c.num ?? ""} ${c.title}`).join("\n") ||
        "(none)",
      "",
      "PLAYBOOK RULES:",
      rulesBlock(rules),
    ].join("\n");

    const out = await callStructured<{
      resolutions: any[];
      drafting_points: any[];
    }>({
      feature: "resolutions",
      actor: { supabase, userId },
      system: DISTIL_SYSTEM,
      user: prompt,
      toolName: "record_decisions",
      toolDescription: "Record the resolutions and drafting points distilled from the meeting.",
      parameters: distilTool,
    });

    // Rerunning replaces only what the model previously proposed.
    await supabase
      .from("drafting_points")
      .delete()
      .eq("matter_id", data.matterId)
      .eq("source", "ai");
    await supabase.from("resolutions").delete().eq("matter_id", data.matterId).eq("source", "ai");

    const { data: existing } = await supabase
      .from("resolutions")
      .select("ordinal")
      .eq("matter_id", data.matterId)
      .order("ordinal", { ascending: false })
      .limit(1);
    let ordinal = (existing?.[0]?.ordinal ?? 0) + 1;
    let dpOrdinal = 1;

    const idByKey = new Map<string, string>();
    let resolutionCount = 0;
    let sourceCount = 0;

    for (const r of out.resolutions ?? []) {
      const src: string[] = (r.source_point_ids ?? []).filter((id: string) => pointIds.has(id));
      // Provenance is the backbone of the decision map — a hallucinated edge is dropped.
      const verdict =
        r.playbook_rule_id &&
        ruleIds.has(r.playbook_rule_id) &&
        (VERDICTS as string[]).includes(r.playbook_verdict)
          ? (r.playbook_verdict as Verdict)
          : null;
      const { data: inserted, error } = await supabase
        .from("resolutions")
        .insert({
          matter_id: data.matterId,
          title: String(r.title ?? "Resolution").slice(0, 200),
          text: String(r.text ?? ""),
          status: ["Accepted", "Open", "Escalated"].includes(r.status) ? r.status : "Open",
          owner_name: r.owner ?? null,
          playbook_verdict: verdict,
          playbook_detail: verdict ? (r.playbook_detail ?? "") : null,
          ordinal: ordinal++,
          source: "ai",
        })
        .select("id")
        .single();
      if (error || !inserted) continue;
      idByKey.set(String(r.key), inserted.id);
      resolutionCount++;
      if (src.length) {
        await supabase
          .from("resolution_sources")
          .insert(src.map((pid) => ({ resolution_id: inserted.id, discussion_point_id: pid })));
        sourceCount += src.length;
      }
    }

    let draftingCount = 0;
    for (const p of out.drafting_points ?? []) {
      const resolutionId = idByKey.get(String(p.resolution_key));
      if (!resolutionId) continue;
      const { error } = await supabase.from("drafting_points").insert({
        matter_id: data.matterId,
        resolution_id: resolutionId,
        title: String(p.title ?? "Drafting point").slice(0, 200),
        text: String(p.text ?? ""),
        status: ["Draft", "Open", "Escalated"].includes(p.status) ? p.status : "Draft",
        clause_id: p.clause_id && clauseIds.has(p.clause_id) ? p.clause_id : null,
        ordinal: dpOrdinal++,
        source: "ai",
      });
      if (!error) draftingCount++;
    }

    await supabase.from("audit_events").insert({
      matter_id: data.matterId,
      actor_id: userId,
      actor_name: await actorName(supabase, userId),
      event_type: "transcript.distilled",
      entity_type: "matter",
      entity_id: data.matterId,
      summary: `Transcript distilled by AI — ${resolutionCount} resolution${
        resolutionCount === 1 ? "" : "s"
      }, ${draftingCount} drafting point${draftingCount === 1 ? "" : "s"} proposed`,
      metadata: {
        resolutions: resolutionCount,
        drafting_points: draftingCount,
        sources: sourceCount,
      },
    });

    return { resolutions: resolutionCount, draftingPoints: draftingCount, sources: sourceCount };
  });

/** A lawyer accepting an AI-proposed record takes ownership of it. */
export const acceptAiRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { matterId: string; kind: "resolution" | "drafting_point"; id: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    if (!["resolution", "drafting_point"].includes(data.kind))
      throw new Error("Unknown review record type");
    const table = data.kind === "resolution" ? "resolutions" : "drafting_points";
    const { data: row } = await supabase
      .from(table)
      .select("title")
      .eq("id", data.id)
      .eq("matter_id", data.matterId)
      .maybeSingle();
    if (!row) throw new Error("Review record not found in this matter");
    const { error } = await supabase
      .from(table)
      .update({ source: "human" })
      .eq("id", data.id)
      .eq("matter_id", data.matterId);
    if (error) throw new Error(error.message);
    await supabase.from("audit_events").insert({
      matter_id: data.matterId,
      actor_id: userId,
      actor_name: await actorName(supabase, userId),
      event_type: `${data.kind}.accepted`,
      entity_type: data.kind,
      entity_id: data.id,
      summary: `AI-proposed ${data.kind === "resolution" ? "resolution" : "drafting point"} “${
        row?.title ?? ""
      }” accepted by the reviewer`,
      metadata: {},
    });
    return { ok: true };
  });

/**
 * A reviewer overrides (or clears) the research-backed classification on a
 * clause. Recorded as the reviewer's decision in the audit trail.
 */
export const setClauseClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      matterId: string;
      clauseId: string;
      classification: string | null;
      reason?: string | undefined;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tag = tagByKey(data.classification);
    if (data.classification && !tag) throw new Error("Unknown classification");
    const { data: clause } = await supabase
      .from("clauses")
      .select("id, num, title, matter_id")
      .eq("id", data.clauseId)
      .eq("matter_id", data.matterId)
      .maybeSingle();
    if (!clause) throw new Error("Clause not found");
    const { error } = await supabase
      .from("clauses")
      .update({
        classification: tag?.key ?? null,
        classification_reason: tag ? data.reason?.trim() || "Set by the reviewer." : null,
        classification_source: tag ? "human" : null,
      })
      .eq("id", clause.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_events").insert({
      matter_id: data.matterId,
      actor_id: userId,
      actor_name: await actorName(supabase, userId),
      event_type: "clause.classified",
      entity_type: "clause",
      entity_id: clause.id,
      summary:
        `Clause ${clause.num ?? ""} ${clause.title ?? ""} classified ${tag ? tag.label : "unclassified"}`
          .replace(/\s+/g, " ")
          .trim(),
      metadata: { classification: tag?.key ?? null },
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ */
/* Classification — AI first, reviewer can override                    */
/* ------------------------------------------------------------------ */

const CLASSIFIER_SYSTEM = [
  "You are a lawyer classifying the clauses of an agreement for the client named in the matter brief.",
  "For each clause you answer two questions from the whole document and its context: is this clause right in law, and is it right for this contract? You return exactly one key from the classification bank and one sentence of reason grounded in the clause text, another clause it interacts with, the brief, or named law. Choose the most serious tag that applies.",
  "You never rewrite clause text and never invent authorities. Where the law is uncertain, say so in the reason and prefer the more cautious tag.",
].join(" ");

const classifyTool = {
  type: "object",
  additionalProperties: false,
  properties: {
    classification: { type: "string", enum: TAG_KEYS, description: "One key from the bank." },
    reason: {
      type: "string",
      description:
        "One sentence: why, citing the clause, another clause, the brief or the law relied on.",
    },
  },
  required: ["classification", "reason"],
};

/** Which provider will answer, so the client can avoid spending metered credits without consent. */
export const aiProviderKind = createServerFn({ method: "GET" }).handler(async () => {
  const r = resolveProvider();
  return { provider: r?.provider ?? null };
});

/**
 * Classify a batch of clauses against the bank. Reads the whole matter
 * register for context, needs no completed brief, and never touches the
 * analysis text or the reviewer's status. Each clause is saved as it lands.
 */
export const classifyClauses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; clauseIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ids = data.clauseIds.slice(0, 8);
    if (!ids.length) return { ok: true as const, done: [] as string[], failed: [] as string[] };
    const ctx = await loadMatterContext(supabase, data.matterId);
    const { data: rows } = await supabase
      .from("clauses")
      .select("id, num, title, clause_segments(ordinal, text, kind)")
      .in("id", ids)
      .eq("matter_id", data.matterId);
    const done: string[] = [];
    const failed: string[] = [];
    for (const c of rows ?? []) {
      const segs: DiffSeg[] = [...(c.clause_segments ?? [])]
        .sort((a: any, b: any) => a.ordinal - b.ordinal)
        .map((s: any) => ({ t: s.text, k: s.kind }));
      const text = rebuildAmendment(segs).trim();
      if (!text) continue;
      const prompt = [
        ctx.text,
        "",
        `CLAUSE TO CLASSIFY: ${c.num ?? ""} ${c.title}`,
        text,
        "",
        "CLASSIFICATION BANK (return exactly one key):",
        TAG_BANK_TEXT,
      ].join("\n");
      try {
        const out = await callStructured<{ classification: string; reason: string }>({
          feature: "clause-classification",
          actor: { supabase, userId },
          system: CLASSIFIER_SYSTEM,
          user: prompt,
          toolName: "classify_clause",
          toolDescription: "Classify one clause against the bank.",
          parameters: classifyTool,
        });
        const tag = tagByKey(out.classification);
        if (!tag) throw new Error("The model returned a classification outside the bank.");
        await supabase
          .from("clauses")
          .update({
            classification: tag.key,
            classification_reason: (out.reason ?? "").trim() || tag.meaning,
            classification_source: "ai",
          })
          .eq("id", c.id);
        done.push(c.id);
      } catch (e) {
        failed.push(c.id);
        if (e instanceof GatewayError && (e.status === 402 || e.status === 403)) break;
      }
    }
    return { ok: true as const, done, failed };
  });
