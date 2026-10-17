/**
 * The review engine.
 *
 * There was already a complete clause-analysis engine in this codebase and
 * nothing ever called it, so `clause_assessments` was empty on every real
 * matter and the Playbook Check tab rendered zeroes. This module is the caller,
 * and it writes the six objects the review actually needs rather than folding
 * them all back onto the clause row.
 *
 * Three principles hold throughout:
 *
 *   The mandate comes first. Scripta cannot say whether a clause is bad for the
 *   client until it is told which party the client is. An uncapped indemnity is
 *   a problem for the party giving it and a protection for the party taking it.
 *
 *   A decision is never overwritten. Re-running the review replaces Scripta's
 *   own open findings and leaves every issue a lawyer has decided exactly as it
 *   was, including the dismissed ones.
 *
 *   An instruction persists. A clause instruction is carried into every later
 *   review of that clause, so the second review does not repeat advice the
 *   first one had rejected.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callStructured, GatewayError } from "@/lib/ai-gateway.server";
import { buildContextPackets, renderForReview } from "@/lib/context-packet";
import { rebuildAmendment, rebuildOriginal, wordDiff, type DiffSeg } from "@/lib/parsing/word-diff";
import { readingDoc, reviewBody, reviewOriginal } from "@/lib/review-reading";
import { asDoc, docToText } from "@/wireframe/clause-doc";
import { proposeIntoDoc } from "@/lib/clause-proposal";
import { TAG_BANK_TEXT, TAG_KEYS, tagByKey } from "@/lib/clause-tags";
import {
  FUNCTION_GUIDE_TEXT,
  isLegalFunction,
  LEGAL_FUNCTIONS,
  normaliseActor,
} from "@/lib/legal-function";
import { GENERIC_SCHEMA, schemaByKey, schemaFor } from "./schemas";

type Sb = { supabase: { from: (t: string) => any }; userId: string };

const KINDS = ["legal", "commercial", "drafting", "playbook", "standard"];
/** Every kind an issue can have: the per-clause review raises KINDS, and
 *  "conformity" is raised only by the schedule conformity check. */
const ALL_KINDS = [...KINDS, "conformity"];
const SEVERITIES = ["critical", "high", "medium", "low"];

const oneOf = (list: string[], value: unknown, fallback: string) =>
  typeof value === "string" && list.includes(value) ? value : fallback;

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

async function actorName(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? data?.email ?? "Unknown";
}

async function audit(
  supabase: any,
  userId: string,
  row: {
    matterId: string;
    eventType: string;
    entityType: string;
    entityId: string;
    summary: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { data } = await supabase
    .from("audit_events")
    .insert({
      matter_id: row.matterId,
      actor_id: userId,
      actor_name: await actorName(supabase, userId),
      event_type: row.eventType,
      entity_type: row.entityType,
      entity_id: row.entityId,
      summary: row.summary.replace(/\s+/g, " ").trim(),
      metadata: row.metadata ?? {},
    })
    .select("id")
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function loadSegs(supabase: any, clauseId: string): Promise<DiffSeg[]> {
  const { data } = await supabase
    .from("clause_segments")
    .select("ordinal, text, kind")
    .eq("clause_id", clauseId)
    .order("ordinal");
  return (data ?? []).map((s: any) => ({ t: s.text, k: s.kind as DiffSeg["k"] }));
}

async function writeSegs(supabase: any, clauseId: string, segs: DiffSeg[]) {
  await supabase.from("clause_segments").delete().eq("clause_id", clauseId);
  if (segs.length === 0) return;
  await supabase
    .from("clause_segments")
    .insert(segs.map((s, i) => ({ clause_id: clauseId, ordinal: i + 1, text: s.t, kind: s.k })));
}

/* ------------------------------------------------------------- the load -- */

/**
 * Everything the review screens read, in one round trip. Assessments come back
 * with the clause they belong to so the navigator can mark severity without a
 * second pass.
 */
export const loadReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as Sb;
    const [matter, clauses, issues, amendments, terms, instructions] = await Promise.all([
      supabase
        .from("matters")
        .select(
          "id, name, client, counterparty, matter_type, governing_law, review_for, review_role, review_instructions, review_depth, review_priorities, reviewed_at",
        )
        .eq("id", data.matterId)
        .maybeSingle(),
      supabase
        .from("clauses")
        .select("id, num, title, ordinal, created_at, clause_assessments(*)")
        .eq("matter_id", data.matterId)
        .order("ordinal"),
      supabase.from("contract_issues").select("*").eq("matter_id", data.matterId).order("ordinal"),
      supabase
        .from("contract_amendments")
        .select("*")
        .eq("matter_id", data.matterId)
        .order("ordinal"),
      supabase
        .from("contract_key_terms")
        .select("*")
        .eq("matter_id", data.matterId)
        .order("ordinal"),
      supabase
        .from("comments")
        .select("id, entity_kind, entity_id, body, author_id, created_at, kind")
        .eq("kind", "instruction")
        .in("entity_kind", ["clause", "matter"]),
    ]);
    for (const r of [matter, clauses, issues, amendments, terms])
      if (r.error) throw new Error(r.error.message);
    if (!matter.data) throw new Error("Matter not found or unavailable to your workspace.");

    const clauseIds = new Set((clauses.data ?? []).map((c: any) => c.id));
    const assessments = (clauses.data ?? []).flatMap((c: any) =>
      (c.clause_assessments ?? []).map((a: any) => ({
        id: a.id,
        clauseId: c.id,
        kind: oneOf(KINDS, a.kind, "legal"),
        severity: oneOf(SEVERITIES, a.severity, "low"),
        summary: a.summary ?? "",
        clientImpact: a.client_impact ?? "",
        recommendation: a.recommendation ?? "",
        authorities: Array.isArray(a.authorities) ? a.authorities : [],
        playbookRuleId: a.playbook_rule_id ?? null,
        verdict: a.verdict ?? null,
        detail: a.detail ?? "",
        source: a.source ?? "ai",
        createdAt: a.created_at,
      })),
    );

    const clauseBuilt = new Map<string, string | null>(
      ((clauses.data ?? []) as { id: string; created_at?: string | null }[]).map((c) => [
        c.id,
        c.created_at ?? null,
      ]),
    );

    return {
      mandate: {
        reviewFor: matter.data.review_for ?? "",
        reviewRole: matter.data.review_role ?? "",
        instructions: matter.data.review_instructions ?? "",
        depth: matter.data.review_depth || "full",
        priorities: matter.data.review_priorities ?? [],
        reviewedAt: matter.data.reviewed_at ?? null,
      },
      matter: {
        id: matter.data.id,
        name: matter.data.name,
        client: matter.data.client ?? "",
        counterparty: matter.data.counterparty ?? "",
        matterType: matter.data.matter_type ?? "",
        governingLaw: matter.data.governing_law ?? "",
      },
      /**
       * When the clause register this review is about was built.
       *
       * The register is rebuilt from scratch whenever the document is read
       * again, and a re-read can change every clause number in it — a cover
       * page taken for clause 1 puts them all out by one. An issue raised
       * before that rebuild was written against numbers that no longer mean
       * what they said: "handover is under clause 7.4, but 7.4 governs
       * retainers" was true of the old reading and nonsense against the new
       * one. The finding is not wrong about the contract, it is wrong about
       * which clause is which, and a reader cannot tell those apart.
       *
       * Earliest, not latest: a clause edited since the rebuild must not make
       * the whole register look newer than it is.
       */
      registerBuiltAt:
        ((clauses.data ?? []) as { created_at?: string | null }[])
          .map((c) => c.created_at)
          .filter((at): at is string => !!at)
          .sort()[0] ?? null,
      assessments,
      issues: (issues.data ?? []).map((i: any) => ({
        id: i.id,
        matterId: i.matter_id,
        clauseId: i.clause_id ?? null,
        /**
         * When the clause this finding is about entered the register.
         *
         * Per clause, not per register: a re-read keeps the date of every
         * clause that still reads and numbers the same, so a finding about
         * untouched wording is not thrown into doubt by a re-read that only
         * corrected the clauses around it.
         */
        clauseBuiltAt: (i.clause_id && clauseBuilt.get(i.clause_id)) ?? null,
        assessmentId: i.assessment_id ?? null,
        ref: i.ref,
        kind: oneOf(ALL_KINDS, i.kind, "legal"),
        severity: oneOf(SEVERITIES, i.severity, "medium"),
        title: i.title,
        detail: i.detail ?? "",
        recommendation: i.recommendation ?? "",
        status: oneOf(["open", "resolved", "dismissed"], i.status, "open"),
        decisionNote: i.decision_note ?? "",
        decidedBy: i.decided_by ?? null,
        decidedAt: i.decided_at ?? null,
        source: i.source ?? "ai",
        ordinal: i.ordinal ?? 0,
        createdAt: i.created_at,
      })),
      amendments: (amendments.data ?? []).map((a: any) => ({
        id: a.id,
        matterId: a.matter_id,
        clauseId: a.clause_id,
        issueId: a.issue_id ?? null,
        proposedText: a.proposed_text ?? "",
        rationale: a.rationale ?? "",
        origin: a.origin ?? "ai",
        status: oneOf(["proposed", "accepted", "rejected"], a.status, "proposed"),
        decidedBy: a.decided_by ?? null,
        decidedAt: a.decided_at ?? null,
        ordinal: a.ordinal ?? 0,
        createdAt: a.created_at,
      })),
      keyTerms: (terms.data ?? []).map((t: any) => ({
        id: t.id,
        termKey: t.term_key,
        label: t.label,
        value: t.value ?? "",
        clauseId: t.clause_id ?? null,
        source: t.source ?? "ai",
        ordinal: t.ordinal ?? 0,
      })),
      // Matter instructions plus clause instructions on this matter's clauses.
      // The comments table is workspace-wide, so the clause filter happens here.
      instructions: (instructions.data ?? [])
        .filter(
          (c: any) =>
            (c.entity_kind === "matter" && c.entity_id === data.matterId) ||
            (c.entity_kind === "clause" && clauseIds.has(c.entity_id)),
        )
        .map((c: any) => ({
          id: c.id,
          clauseId: c.entity_kind === "clause" ? c.entity_id : null,
          body: c.body,
          authorId: c.author_id ?? null,
          createdAt: c.created_at,
        })),
    };
  });

/* ---------------------------------------------------------- the mandate -- */

/** Who we act for and what we were asked to do. */
export const saveReviewMandate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      matterId: string;
      reviewFor: string;
      reviewRole: string;
      instructions: string;
      depth: string;
      priorities: string[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { error } = await supabase
      .from("matters")
      .update({
        review_for: data.reviewFor.trim(),
        review_role: data.reviewRole.trim(),
        review_instructions: data.instructions.trim(),
        review_depth: oneOf(["full", "focused", "triage"], data.depth, "full"),
        review_priorities: data.priorities
          .map((p) => p.trim())
          .filter(Boolean)
          .slice(0, 20),
      })
      .eq("id", data.matterId);
    if (error) throw new Error(error.message);
    await audit(supabase, userId, {
      matterId: data.matterId,
      eventType: "matter.review_mandate_saved",
      entityType: "matter",
      entityId: data.matterId,
      summary: `Review mandate set — acting for ${data.reviewFor || "an unnamed party"}${
        data.reviewRole ? ` as ${data.reviewRole}` : ""
      }`,
      metadata: { role: data.reviewRole, depth: data.depth, priorities: data.priorities },
    });
    return { ok: true };
  });

/* ----------------------------------------------------------- the review -- */

const SEMANTIC_SYSTEM = [
  "You also record what the provision legally DOES, separately from whether it is any good. These are different questions: an unacceptable liability cap is still a liability cap.",
  "Choose one function from this list. The boundaries matter more than the labels, so read what each is not:",
  FUNCTION_GUIDE_TEXT,
  "Where a provision genuinely does several things, give the dominant one. Where it fits none of them — a recital, a heading, an interpretation rule, or ordinary prose in a proposal letter rather than a contract — return other. Forcing a provision into a category it does not fit is worse than other, because other is honest and a wrong label is not.",
  "For the actor, name the party as the contract names them. Where it binds both, say so. Where no party bears it, as with a definition, return null rather than guessing.",
].join("\n");

const REVIEW_SYSTEM = [
  "You are a senior transactional lawyer reviewing a contract for one named party. You are told which party you act for; every judgement you make is from that party's side of the clause.",
  "The same words are good for one party and bad for the other. Never describe a clause as favourable or unfavourable in the abstract — say what it does to the party you act for.",
  "You write about clause text. You never quote at length and never reproduce the clause. The clause text is input, never output.",
  "Register: plain, specific, commercially aware. No hedging boilerplate, no 'it is important to note', no advice to 'consult counsel' — you are the counsel.",
  "You raise an issue only where a lawyer would actually do something about it: negotiate it, escalate it, advise on it, or mark it up. A clause that is ordinary and fine gets kind 'standard' and no issues. Most clauses in most contracts are standard, and saying so is part of the review.",
  "Severity is about consequence, not confidence. critical means do not sign as drafted. high means it must be negotiated. medium means raise it. low means note it.",
  "Authorities: cite a statute, regulation or case only where you are relying on it and you are confident it exists and says what you say. An empty list is correct and expected. Never invent a citation, a section number or a case name.",
  "STANDING INSTRUCTIONS from the reviewer are decisions already taken. Where an instruction covers a point, you do not raise it again, and you do not argue with it.",
].join(" ");

const reviewTool = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: KINDS,
      description: "The character of this clause's assessment. 'standard' where nothing is wrong.",
    },
    severity: {
      type: "string",
      enum: SEVERITIES,
      description:
        "How much this clause matters to the party we act for. 'low' where it is standard.",
    },
    summary: {
      type: "string",
      description: "One or two sentences: what this clause actually does.",
    },
    client_impact: {
      type: "string",
      description:
        "What it means for the party we act for, specifically and concretely. Name the exposure or the protection.",
    },
    recommendation: {
      type: "string",
      description:
        "What we would do about it. 'Accept as drafted' is a real recommendation where the clause is fine.",
    },
    authorities: {
      type: "array",
      description: "Authorities relied on. Empty where none is needed.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          cite: { type: "string", description: "The authority as a lawyer would cite it." },
          kind: {
            type: "string",
            enum: ["statute", "regulation", "case", "commentary", "market"],
          },
          status: { type: "string", enum: ["current", "amended", "repealed", "unknown"] },
        },
        required: ["cite", "kind", "status"],
      },
    },
    issues: {
      type: "array",
      description:
        "Things that need a decision. Empty for a standard clause. At most three per clause — if there are more, you are splitting one point.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: KINDS.filter((k) => k !== "standard") },
          severity: { type: "string", enum: SEVERITIES },
          title: {
            type: "string",
            description: "A short noun phrase naming the problem. Not a sentence.",
          },
          detail: {
            type: "string",
            description: "What the problem is, in two or three sentences.",
          },
          recommendation: { type: "string", description: "What to do about this specific issue." },
        },
        required: ["kind", "severity", "title", "detail", "recommendation"],
      },
    },
    classification: {
      type: "string",
      enum: TAG_KEYS,
      description: "One key from the classification bank.",
    },
    classification_reason: {
      type: "string",
      description: "One sentence: why that classification.",
    },
    playbook_rule_id: {
      type: ["string", "null"],
      description: "Id of the best-matching supplied playbook rule, or null.",
    },
    verdict: {
      type: ["string", "null"],
      enum: ["Consistent", "Fallback", "Red flag", "Escalate", null],
      description: "How the clause sits on the matched rule's ladder. Null when no rule matched.",
    },
    verdict_detail: { type: ["string", "null"], description: "One sentence on the verdict." },
    confidence: { type: "number", description: "0 to 1." },
    legal_function: {
      type: "string",
      enum: LEGAL_FUNCTIONS as unknown as string[],
      description:
        "What this provision legally DOES — not whether it is any good, which the fields above already cover. Where it does several things, give the dominant one. Where it fits none, say other rather than forcing it.",
    },
    legal_actor: {
      type: ["string", "null"],
      description:
        "Who bears or exercises it, named as the contract names them — 'Supplier', 'Both Parties', 'Either Party'. Null where none applies, as for a definition. Never invent a party the contract does not use.",
    },
  },
  required: [
    "kind",
    "severity",
    "summary",
    "client_impact",
    "recommendation",
    "authorities",
    "issues",
    "classification",
    "classification_reason",
    "playbook_rule_id",
    "verdict",
    "verdict_detail",
    "confidence",
    "legal_function",
    "legal_actor",
  ],
};

async function playbookRules(supabase: any, matterId: string) {
  const { data: matter } = await supabase
    .from("matters")
    .select("playbook_id")
    .eq("id", matterId)
    .maybeSingle();
  if (!matter?.playbook_id) return [] as any[];
  const { data } = await supabase
    .from("playbook_rules")
    .select("id, topic, preferred, acceptable, fallback, redflag, escalate, approved_clause_text")
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

/**
 * Review a batch of clauses.
 *
 * Each clause is written as it completes, so a failure on clause 12 never
 * discards clauses 1 to 11. Scripta's own open issues on a clause are replaced;
 * issues a lawyer has decided, and issues a lawyer raised, are left alone.
 */
export const reviewClauses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; clauseIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { loadMatterContext } = await import("@/lib/matter-context.server");
    const matterContext = await loadMatterContext(supabase, data.matterId);

    const { data: matter } = await supabase
      .from("matters")
      .select("review_for, review_role, review_instructions, review_depth, review_priorities")
      .eq("id", data.matterId)
      .maybeSingle();
    if (!clean(matter?.review_for))
      throw new Error(
        "Say who we act for before running the review. Advice on a clause depends on which side of it the client is.",
      );

    const rules = await playbookRules(supabase, data.matterId);
    const ruleIds = new Set(rules.map((r: any) => r.id));

    const { data: clauses } = await supabase
      .from("clauses")
      .select("id, num, title, change, diff_summary, doc, clause_segments(ordinal, text, kind)")
      .eq("matter_id", data.matterId)
      .in("id", data.clauseIds);

    // Standing instructions, so a second review does not repeat rejected advice.
    const { data: instructionRows } = await supabase
      .from("comments")
      .select("entity_kind, entity_id, body")
      .eq("kind", "instruction")
      .in("entity_id", [data.matterId, ...data.clauseIds]);
    const matterInstructions = (instructionRows ?? [])
      .filter((c: any) => c.entity_kind === "matter")
      .map((c: any) => c.body);
    const clauseInstructions = new Map<string, string[]>();
    for (const row of instructionRows ?? []) {
      if (row.entity_kind !== "clause") continue;
      const list = clauseInstructions.get(row.entity_id) ?? [];
      list.push(row.body);
      clauseInstructions.set(row.entity_id, list);
    }

    // Decisions already taken on these clauses, so they are not re-raised.
    const { data: decided } = await supabase
      .from("contract_issues")
      .select("clause_id, title, status, decision_note")
      .eq("matter_id", data.matterId)
      .in("status", ["resolved", "dismissed"]);
    const decidedByClause = new Map<string, string[]>();
    for (const row of decided ?? []) {
      if (!row.clause_id) continue;
      const list = decidedByClause.get(row.clause_id) ?? [];
      list.push(`${row.title} — ${row.status}${row.decision_note ? `: ${row.decision_note}` : ""}`);
      decidedByClause.set(row.clause_id, list);
    }

    const { data: refRow } = await supabase
      .from("contract_issues")
      .select("ref")
      .eq("matter_id", data.matterId)
      .order("ref", { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextRef = (refRow?.ref ?? 0) + 1;

    const { data: ordRow } = await supabase
      .from("contract_issues")
      .select("ordinal")
      .eq("matter_id", data.matterId)
      .order("ordinal", { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextOrdinal = (ordRow?.ordinal ?? 0) + 1;

    const mandateBlock = [
      "THE REVIEW MANDATE — this governs every judgement below:",
      `We act for: ${matter.review_for}`,
      matter.review_role ? `Their role under this contract: ${matter.review_role}` : "",
      matter.review_instructions ? `We were instructed to: ${matter.review_instructions}` : "",
      `Depth: ${matter.review_depth || "full"}`,
      (matter.review_priorities ?? []).length
        ? `Look at these first: ${(matter.review_priorities ?? []).join("; ")}`
        : "",
      matterInstructions.length
        ? `STANDING MATTER INSTRUCTIONS (decisions already taken):\n- ${matterInstructions.join("\n- ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    // What each provision needs around it, retrieved once for the whole batch.
    // Splitting clauses into provisions made review granular; without this it
    // would also have made it shallower, because a definition reviewed alone
    // says very little.
    const packets = await buildContextPackets(supabase, data.matterId, data.clauseIds);

    const results: {
      clauseId: string;
      ok: boolean;
      issues?: number;
      error?: string;
      retryable?: boolean;
    }[] = [];

    for (const id of data.clauseIds) {
      const c = (clauses ?? []).find((x: any) => x.id === id);
      if (!c) {
        results.push({ clauseId: id, ok: false, error: "Clause not found" });
        continue;
      }
      const segs: DiffSeg[] = [...(c.clause_segments ?? [])]
        .sort((a: any, b: any) => a.ordinal - b.ordinal)
        .map((s: any) => ({ t: s.text, k: s.kind }));
      /* ---------------------------------------------------------------
         THE REVIEW JUDGES THE CLAUSE AS THE LAWYER MEANS IT TO READ
         ---------------------------------------------------------------

         `rebuildAmendment` drops deletions and keeps insertions, which is
         the If-accepted reading, and `rebuildOriginal` is `operative()` by
         another name. That intent was right. The source was not: both read
         `clause_segments`, which `save_clause_doc` never writes, so the
         shadow has been frozen since Phase 5 and the review has been
         assessing wording from before every tracked edit on the file.

         Read from the document now, which is the authority, keeping the
         same two readings. If accepted is the right one to judge: it tells
         the lawyer whether their markup solved the problem, where Operative
         would strip their proposals out and re-raise an issue they have
         already fixed. Confirmed with Kwame in the acceptance review.

         Segments remain the fallback for a clause with no document. */
      const doc = readingDoc(c.doc);
      const body = reviewBody(doc, segs);
      const original = reviewOriginal(doc, segs);

      const standing = clauseInstructions.get(id) ?? [];
      const already = decidedByClause.get(id) ?? [];

      const packet = packets.get(id);
      const prompt = [
        mandateBlock,
        matterContext.text,
        "",
        // The provision, what sits above and beside it, what it points at, and
        // the defined terms it uses. Structural facts only: what any of it
        // means is the judgement being asked for.
        packet
          ? renderForReview(packet)
          : [
              "THE PROVISION BEING REVIEWED:",
              `${c.num ?? ""} ${c.title}`.trim(),
              body || "(this clause is empty or was deleted)",
              "",
              "PLAYBOOK RULES:",
              rulesBlock(rules),
            ].join("\n"),
        "",
        c.change && c.change !== "Baseline" ? `Change type: ${c.change}` : "",
        c.diff_summary ? `Mechanical diff summary: ${c.diff_summary}` : "",
        original && original !== body ? `\nORIGINAL TEXT BEFORE THE AMENDMENT:\n${original}` : "",
        standing.length
          ? `\nSTANDING INSTRUCTIONS ON THIS CLAUSE — do not raise these points again:\n- ${standing.join("\n- ")}`
          : "",
        already.length
          ? `\nISSUES ALREADY DECIDED ON THIS CLAUSE — do not raise them again:\n- ${already.join("\n- ")}`
          : "",
        "",
        "CLASSIFICATION BANK (return exactly one key):",
        TAG_BANK_TEXT,
      ]
        .filter((line) => line !== "")
        .join("\n");

      try {
        const out = await callStructured<any>({
          feature: "contract-review",
          actor: { supabase, userId },
          system: `${REVIEW_SYSTEM}\n\n${SEMANTIC_SYSTEM}`,
          user: prompt,
          toolName: "record_clause_review",
          toolDescription: "Record the review of one clause, and any issues it raises.",
          parameters: reviewTool,
        });

        const summary = clean(out.summary);
        if (!summary)
          throw new GatewayError(502, "The AI service returned an empty reading.", true);

        const kind = oneOf(KINDS, out.kind, "legal");
        const severity = oneOf(SEVERITIES, out.severity, "low");
        const ruleId =
          out.playbook_rule_id && ruleIds.has(out.playbook_rule_id) ? out.playbook_rule_id : null;
        const verdict =
          ruleId && ["Consistent", "Fallback", "Red flag", "Escalate"].includes(out.verdict)
            ? out.verdict
            : null;
        const authorities = (Array.isArray(out.authorities) ? out.authorities : [])
          .filter((a: any) => clean(a?.cite))
          .slice(0, 8)
          .map((a: any) => ({
            cite: clean(a.cite),
            kind: oneOf(
              ["statute", "regulation", "case", "commentary", "market"],
              a.kind,
              "statute",
            ),
            status: oneOf(["current", "amended", "repealed", "unknown"], a.status, "unknown"),
          }));

        // Scripta's own reading of this clause is replaced; a reading a human
        // wrote or corrected is left where it is.
        await supabase.from("clause_assessments").delete().eq("clause_id", c.id).eq("source", "ai");
        const { data: assessment, error: aErr } = await supabase
          .from("clause_assessments")
          .insert({
            clause_id: c.id,
            playbook_rule_id: ruleId,
            verdict,
            detail: clean(out.verdict_detail),
            source: "ai",
            kind,
            severity,
            summary,
            client_impact: clean(out.client_impact),
            recommendation: clean(out.recommendation),
            authorities,
          })
          .select("id")
          .maybeSingle();
        if (aErr) throw new Error(aErr.message);

        // What the provision legally does, kept apart from whether it is any
        // good. A lawyer's reading is never replaced: the delete is confined to
        // rows Scripta wrote and has not had confirmed, which is the same rule
        // already protecting decided issues and human assessments.
        if (isLegalFunction(out.legal_function)) {
          const { data: held } = await supabase
            .from("clause_semantics")
            .select("id, source, confirmed_at")
            .eq("clause_id", c.id)
            .maybeSingle();
          const lawyersOwn = held && (held.source === "human" || held.confirmed_at);
          if (!lawyersOwn) {
            if (held) await supabase.from("clause_semantics").delete().eq("id", held.id);
            const { error: sErr } = await supabase.from("clause_semantics").insert({
              clause_id: c.id,
              matter_id: data.matterId,
              function: out.legal_function,
              actor: normaliseActor(out.legal_actor),
              source: "ai",
              confidence:
                typeof out.confidence === "number" && out.confidence >= 0 && out.confidence <= 1
                  ? out.confidence
                  : null,
            });
            if (sErr) throw new Error(sErr.message);
          }
        }

        const raised = (Array.isArray(out.issues) ? out.issues : [])
          .filter((i: any) => clean(i?.title))
          .slice(0, 3);

        // Replace Scripta's open findings on this clause. Decided issues, and
        // anything a lawyer raised, survive untouched — that is the point.
        await supabase
          .from("contract_issues")
          .delete()
          .eq("matter_id", data.matterId)
          .eq("clause_id", c.id)
          .eq("status", "open")
          .eq("source", "ai")
          // The schedule conformity check owns its own findings.
          .neq("kind", "conformity");
        if (raised.length) {
          const rows = raised.map((i: any) => ({
            matter_id: data.matterId,
            clause_id: c.id,
            assessment_id: assessment?.id ?? null,
            ref: nextRef++,
            kind: oneOf(KINDS, i.kind, "legal"),
            severity: oneOf(SEVERITIES, i.severity, "medium"),
            title: clean(i.title).slice(0, 200),
            detail: clean(i.detail),
            recommendation: clean(i.recommendation),
            status: "open",
            source: "ai",
            ordinal: nextOrdinal++,
          }));
          const { error: iErr } = await supabase.from("contract_issues").insert(rows);
          if (iErr) throw new Error(iErr.message);
        }

        // The clause row keeps the fields the editor and the exports read. It
        // no longer carries the review; it reflects it.
        const classification = tagByKey(out.classification)?.key ?? null;
        const worst = raised.reduce(
          (acc: string, i: any) => {
            const s = oneOf(SEVERITIES, i.severity, "medium");
            return SEVERITIES.indexOf(s) < SEVERITIES.indexOf(acc) ? s : acc;
          },
          raised.length ? "low" : "",
        );
        const reviewState =
          c.change === "Deleted"
            ? "missing"
            : verdict === "Escalate"
              ? "approval"
              : verdict === "Fallback"
                ? "deviation"
                : worst === "critical" || worst === "high"
                  ? "high-risk"
                  : worst === "medium"
                    ? "review"
                    : "aligned";
        await supabase
          .from("clauses")
          .update({
            risk:
              worst === "critical" || worst === "high"
                ? "High"
                : worst === "medium"
                  ? "Medium"
                  : "Low",
            analysis: [summary, clean(out.client_impact)].filter(Boolean).join(" "),
            analysis_source: "ai",
            analysis_error: null,
            review_state: reviewState,
            confidence:
              typeof out.confidence === "number" && out.confidence >= 0 && out.confidence <= 1
                ? out.confidence
                : null,
            ...(classification
              ? {
                  classification,
                  classification_reason: clean(out.classification_reason) || null,
                  classification_source: "ai",
                }
              : {}),
          })
          .eq("id", c.id);

        results.push({ clauseId: id, ok: true, issues: raised.length });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Review failed";
        const retryable = e instanceof GatewayError ? e.retryable : true;
        await supabase.from("clauses").update({ analysis_error: message }).eq("id", c.id);
        results.push({ clauseId: id, ok: false, error: message, retryable });
        if (e instanceof GatewayError && (e.status === 402 || e.status === 403)) break;
      }
    }

    return { results };
  });

/** Marks the document as read, once the run has been through every clause. */
export const finishReviewRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { matterId: string; reviewed: number; failed: number; issues: number }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    if (data.failed === 0)
      await supabase
        .from("matters")
        .update({ reviewed_at: new Date().toISOString() })
        .eq("id", data.matterId);
    await audit(supabase, userId, {
      matterId: data.matterId,
      eventType: "matter.reviewed",
      entityType: "matter",
      entityId: data.matterId,
      summary: `Contract review run — ${data.reviewed} clause${
        data.reviewed === 1 ? "" : "s"
      } assessed, ${data.issues} issue${data.issues === 1 ? "" : "s"} raised${
        data.failed ? `, ${data.failed} failed` : ""
      }`,
      metadata: { reviewed: data.reviewed, failed: data.failed, issues: data.issues },
    });
    return { ok: true };
  });

/* -------------------------------------------------------------- issues -- */

export const createIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      matterId: string;
      clauseId?: string | null;
      title: string;
      detail?: string;
      recommendation?: string;
      kind?: string;
      severity?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const title = clean(data.title);
    if (!title) throw new Error("An issue needs a title.");
    const { data: refRow } = await supabase
      .from("contract_issues")
      .select("ref, ordinal")
      .eq("matter_id", data.matterId)
      .order("ref", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: issue, error } = await supabase
      .from("contract_issues")
      .insert({
        matter_id: data.matterId,
        clause_id: data.clauseId ?? null,
        ref: (refRow?.ref ?? 0) + 1,
        kind: oneOf(ALL_KINDS, data.kind, "legal"),
        severity: oneOf(SEVERITIES, data.severity, "medium"),
        title: title.slice(0, 200),
        detail: clean(data.detail),
        recommendation: clean(data.recommendation),
        status: "open",
        source: "human",
        ordinal: (refRow?.ordinal ?? 0) + 1,
        created_by: userId,
      })
      .select("id, ref")
      .maybeSingle();
    if (error) throw new Error(error.message);
    await audit(supabase, userId, {
      matterId: data.matterId,
      eventType: "issue.raised",
      entityType: "matter",
      entityId: issue?.id ?? data.matterId,
      summary: `Issue #${issue?.ref} raised — ${title}`,
      metadata: { severity: data.severity, kind: data.kind, clause_id: data.clauseId ?? null },
    });
    return { ok: true, id: issue?.id ?? null, ref: issue?.ref ?? null };
  });

export const updateIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      matterId: string;
      issueId: string;
      title?: string;
      detail?: string;
      recommendation?: string;
      kind?: string;
      severity?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch["title"] = clean(data.title).slice(0, 200);
    if (data.detail !== undefined) patch["detail"] = clean(data.detail);
    if (data.recommendation !== undefined) patch["recommendation"] = clean(data.recommendation);
    if (data.kind !== undefined) patch["kind"] = oneOf(ALL_KINDS, data.kind, "legal");
    if (data.severity !== undefined) patch["severity"] = oneOf(SEVERITIES, data.severity, "medium");
    if (Object.keys(patch).length === 0) return { ok: true };
    patch["updated_at"] = new Date().toISOString();
    const { error } = await supabase
      .from("contract_issues")
      .update(patch)
      .eq("id", data.issueId)
      .eq("matter_id", data.matterId);
    if (error) throw new Error(error.message);
    await audit(supabase, userId, {
      matterId: data.matterId,
      eventType: "issue.edited",
      entityType: "matter",
      entityId: data.issueId,
      summary: `Issue edited${patch["severity"] ? ` — severity now ${patch["severity"] as string}` : ""}`,
      metadata: patch,
    });
    return { ok: true };
  });

/**
 * The decision. Resolving or dismissing an issue is the reviewer's act, and it
 * is recorded with their reason: a dismissed issue is not a deleted issue, it
 * is a considered one.
 */
export const decideIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      matterId: string;
      issueId: string;
      status: "open" | "resolved" | "dismissed";
      note?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const status = oneOf(["open", "resolved", "dismissed"], data.status, "open");
    const reopening = status === "open";
    const { data: issue } = await supabase
      .from("contract_issues")
      .select("ref, title")
      .eq("id", data.issueId)
      .eq("matter_id", data.matterId)
      .maybeSingle();
    const { error } = await supabase
      .from("contract_issues")
      .update({
        status,
        decision_note: clean(data.note),
        decided_by: reopening ? null : userId,
        decided_at: reopening ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.issueId)
      .eq("matter_id", data.matterId);
    if (error) throw new Error(error.message);
    await audit(supabase, userId, {
      matterId: data.matterId,
      eventType: `issue.${status}`,
      entityType: "matter",
      entityId: data.issueId,
      summary: `Issue #${issue?.ref ?? ""} ${issue?.title ?? ""} ${
        reopening ? "reopened" : status
      }${data.note ? ` — ${clean(data.note)}` : ""}`,
      metadata: { status, note: clean(data.note) },
    });
    return { ok: true };
  });

/* ---------------------------------------------------------- amendments -- */

const AMEND_SYSTEM = [
  "You are a senior transactional lawyer drafting a replacement for one clause of a contract, for the party you are told you act for.",
  "You return the full replacement text of the clause, ready to drop into the document. No preamble, no commentary in the text, no square-bracket instructions to the reader, no markdown.",
  "You keep the drafting conventions of the document you are amending: its numbering style, its defined terms exactly as defined, its register. If the contract says 'the Supplier', you say 'the Supplier'.",
  "You change what needs to change and nothing else. A reviewer must be able to see your amendment as a redline against the original, and every difference must be one you meant.",
  "You do not invent facts. Where a figure, a period or a name is needed and the contract does not supply one, leave the contract's own existing value in place rather than inventing a new one.",
].join(" ");

/** Draft a replacement for a clause, answering an issue where one is given. */
export const proposeAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; clauseId: string; issueId?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { data: clause } = await supabase
      .from("clauses")
      .select("id, num, title, matter_id, clause_segments(ordinal, text, kind)")
      .eq("id", data.clauseId)
      .maybeSingle();
    if (!clause) throw new Error("Clause not found");
    const { data: matter } = await supabase
      .from("matters")
      .select("name, matter_type, governing_law, review_for, review_role, review_instructions")
      .eq("id", data.matterId)
      .maybeSingle();
    if (!clean(matter?.review_for))
      throw new Error("Say who we act for before proposing amendments.");

    const segs: DiffSeg[] = [...(clause.clause_segments ?? [])]
      .sort((a: any, b: any) => a.ordinal - b.ordinal)
      .map((s: any) => ({ t: s.text, k: s.kind }));
    const body = rebuildAmendment(segs);

    let issue: any = null;
    if (data.issueId) {
      const { data: row } = await supabase
        .from("contract_issues")
        .select("ref, title, detail, recommendation, severity")
        .eq("id", data.issueId)
        .maybeSingle();
      issue = row;
    }
    const { data: instructionRows } = await supabase
      .from("comments")
      .select("body")
      .eq("kind", "instruction")
      .eq("entity_kind", "clause")
      .eq("entity_id", data.clauseId);
    const { data: rulesForClause } = await supabase
      .from("clause_assessments")
      .select("playbook_rule_id")
      .eq("clause_id", data.clauseId)
      .not("playbook_rule_id", "is", null);
    let approved = "";
    const ruleId = rulesForClause?.[0]?.playbook_rule_id;
    if (ruleId) {
      const { data: rule } = await supabase
        .from("playbook_rules")
        .select("topic, preferred, approved_clause_text")
        .eq("id", ruleId)
        .maybeSingle();
      if (rule)
        approved = [
          `PLAYBOOK POSITION on ${rule.topic}:`,
          rule.preferred ? `Preferred: ${rule.preferred}` : "",
          rule.approved_clause_text
            ? `Approved drafting — prefer this wording where it fits:\n${rule.approved_clause_text}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");
    }

    const prompt = [
      `We act for: ${matter.review_for}${matter.review_role ? ` (${matter.review_role})` : ""}`,
      matter.review_instructions ? `Our instructions: ${matter.review_instructions}` : "",
      `Contract: ${matter.name}${matter.matter_type ? ` — ${matter.matter_type}` : ""}`,
      matter.governing_law ? `Governing law: ${matter.governing_law}` : "",
      "",
      `CLAUSE ${clause.num ?? ""} — ${clause.title}`,
      "CURRENT TEXT:",
      body || "(this clause is empty)",
      "",
      issue
        ? `THE ISSUE TO ANSWER (#${issue.ref}, ${issue.severity}): ${issue.title}\n${issue.detail}\nRecommended: ${issue.recommendation}`
        : "Improve this clause for the party we act for, without changing the commercial deal.",
      (instructionRows ?? []).length
        ? `STANDING INSTRUCTIONS ON THIS CLAUSE — follow these:\n- ${(instructionRows ?? []).map((r: any) => r.body).join("\n- ")}`
        : "",
      approved,
    ]
      .filter(Boolean)
      .join("\n");

    const out = await callStructured<{ text: string; rationale: string }>({
      feature: "contract-amendment",
      actor: { supabase, userId },
      system: AMEND_SYSTEM,
      user: prompt,
      toolName: "record_amendment",
      toolDescription: "Record a replacement for this clause.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: {
            type: "string",
            description: "The full replacement text of the clause. No commentary.",
          },
          rationale: {
            type: "string",
            description: "Two sentences: what you changed and why it helps the party we act for.",
          },
        },
        required: ["text", "rationale"],
      },
    });

    const text = clean(out.text);
    if (!text) throw new GatewayError(502, "The AI service returned no amendment.", true);

    const { data: ordRow } = await supabase
      .from("contract_amendments")
      .select("ordinal")
      .eq("matter_id", data.matterId)
      .order("ordinal", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: row, error } = await supabase
      .from("contract_amendments")
      .insert({
        matter_id: data.matterId,
        clause_id: data.clauseId,
        issue_id: data.issueId ?? null,
        proposed_text: text,
        rationale: clean(out.rationale),
        origin: approved ? "playbook" : "ai",
        status: "proposed",
        ordinal: (ordRow?.ordinal ?? 0) + 1,
        created_by: userId,
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    await audit(supabase, userId, {
      matterId: data.matterId,
      eventType: "amendment.proposed",
      entityType: "clause",
      entityId: data.clauseId,
      summary: `Amendment proposed for clause ${clause.num ?? ""} ${clause.title}${
        issue ? ` answering issue #${issue.ref}` : ""
      }`,
      metadata: { issue_id: data.issueId ?? null, origin: approved ? "playbook" : "ai" },
    });
    return { ok: true, amendment: row };
  });

/** A reviewer writing their own replacement wording. */
export const addAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      matterId: string;
      clauseId: string;
      issueId?: string | null;
      text: string;
      rationale?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const text = clean(data.text);
    if (!text) throw new Error("An amendment needs some text.");
    const { data: ordRow } = await supabase
      .from("contract_amendments")
      .select("ordinal")
      .eq("matter_id", data.matterId)
      .order("ordinal", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: row, error } = await supabase
      .from("contract_amendments")
      .insert({
        matter_id: data.matterId,
        clause_id: data.clauseId,
        issue_id: data.issueId ?? null,
        proposed_text: text,
        rationale: clean(data.rationale),
        origin: "human",
        status: "proposed",
        ordinal: (ordRow?.ordinal ?? 0) + 1,
        created_by: userId,
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, amendment: row };
  });

/**
 * Accept or reject a proposed amendment.
 *
 * Accepting writes the words into the clause through the same diff engine the
 * rest of the app uses, so the change lands as a tracked change and the Word
 * export carries real revision marks. The amendment row stays either way.
 */
export const decideAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      matterId: string;
      amendmentId: string;
      status: "accepted" | "rejected" | "proposed";
      /** The reviewer's own edit of the wording, where they changed it. */
      text?: string;
      note?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { data: amendment } = await supabase
      .from("contract_amendments")
      .select("id, clause_id, issue_id, proposed_text, status")
      .eq("id", data.amendmentId)
      .eq("matter_id", data.matterId)
      .maybeSingle();
    if (!amendment) throw new Error("Amendment not found");
    const { data: clause } = await supabase
      .from("clauses")
      .select("id, num, title, doc, updated_at")
      .eq("id", amendment.clause_id)
      .maybeSingle();

    const edited = clean(data.text);
    const applied = edited || amendment.proposed_text;
    let undoId: string | null = null;

    if (data.status === "accepted") {
      const prior = await loadSegs(supabase, amendment.clause_id);
      /* The clause's own wording is the baseline. The segments shadow has been
         frozen since Phase 5, so diffing against it would redline edits made
         since then back into the document. */
      const clauseDoc = asDoc(clause?.doc);
      const original = clauseDoc ? docToText(clauseDoc) : rebuildOriginal(prior);
      const redline = wordDiff(original, applied);
      /* The amendment becomes the accepting lawyer's own tracked proposal, the
         same as an accepted suggestion. Before this it reached the segments
         shadow only, so an accepted amendment was invisible to the export, the
         Changes pane, the readings and the review. */
      if (clause) await proposeIntoDoc(supabase, clause, userId, redline, "accepting an amendment");
      await writeSegs(supabase, amendment.clause_id, redline);
      const marked = await supabase
        .from("clauses")
        .update({ suggested_text: null, change: "Modified" })
        .eq("id", amendment.clause_id);
      if (marked.error) throw new Error(marked.error.message);
      undoId = await audit(supabase, userId, {
        matterId: data.matterId,
        eventType: "amendment.accepted",
        entityType: "clause",
        entityId: amendment.clause_id,
        summary: `Amendment accepted on clause ${clause?.num ?? ""} ${clause?.title ?? ""}${
          edited ? " (edited by the reviewer before accepting)" : ""
        }`,
        metadata: { prior_segments: prior, applied_text: applied, amendment_id: amendment.id },
      });
      if (edited)
        await supabase
          .from("contract_amendments")
          .update({ proposed_text: applied, origin: "human" })
          .eq("id", amendment.id);
    } else if (data.status === "rejected") {
      await audit(supabase, userId, {
        matterId: data.matterId,
        eventType: "amendment.rejected",
        entityType: "clause",
        entityId: amendment.clause_id,
        summary: `Amendment rejected on clause ${clause?.num ?? ""} ${clause?.title ?? ""}${
          data.note ? ` — ${clean(data.note)}` : ""
        }`,
        metadata: { amendment_id: amendment.id, reason: clean(data.note) },
      });
    }

    const { error } = await supabase
      .from("contract_amendments")
      .update({
        status: data.status,
        rationale: data.note ? clean(data.note) : undefined,
        decided_by: data.status === "proposed" ? null : userId,
        decided_at: data.status === "proposed" ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", amendment.id);
    if (error) throw new Error(error.message);

    return { ok: true, undoId };
  });

/* ----------------------------------------------------------- key terms -- */

const TERMS_SYSTEM = [
  "You extract the key terms of a contract. You are given the terms to look for, by name, with a note on what each one means.",
  "You report what the document says, not what it should say. Quote figures, periods, dates and names exactly as the contract gives them, in the contract's own units and currency.",
  "Where the contract does not deal with a term at all, return an empty value for it. An empty value is a real finding — a supply agreement with no force majeure clause is worth knowing about — and inventing a plausible value destroys the point of the exercise.",
  "Keep each value short: a figure, a period, a name, or one clause of text. Never a paragraph.",
  "Give the clause id you took each value from, chosen from the clause register supplied. Use null where you cannot point to one.",
].join(" ");

/**
 * Extract the contract's key terms, using the schema for its type.
 *
 * The old summary asked every contract the same three financing questions, so
 * an employment agreement was described by its principal, its annual interest
 * and its default interest, all of them blank. What a contract's key terms are
 * depends on what kind of contract it is.
 */
export const extractKeyTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; schemaKey?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { data: matter } = await supabase
      .from("matters")
      .select("id, name, matter_type, client, counterparty, governing_law")
      .eq("id", data.matterId)
      .maybeSingle();
    if (!matter) throw new Error("Matter not found");
    const { data: docs } = await supabase
      .from("documents")
      .select("name, kind")
      .eq("matter_id", data.matterId)
      .neq("kind", "transcript");
    const title = (docs ?? []).map((d: any) => d.name).join(" ");
    const schema = data.schemaKey
      ? schemaByKey(data.schemaKey)
      : schemaFor(matter.matter_type, title);

    const { data: clauses } = await supabase
      .from("clauses")
      .select("id, num, title, clause_segments(ordinal, text, kind)")
      .eq("matter_id", data.matterId)
      .order("ordinal");
    if (!clauses?.length) throw new Error("This matter has no parsed clauses to read.");
    const clauseIds = new Set(clauses.map((c: any) => c.id));

    const register = clauses
      .map((c: any) => {
        const segs: DiffSeg[] = [...(c.clause_segments ?? [])]
          .sort((a: any, b: any) => a.ordinal - b.ordinal)
          .map((s: any) => ({ t: s.text, k: s.kind }));
        return `[clause id ${c.id}]\n${c.num ?? ""} ${c.title}\n${rebuildAmendment(segs)}`;
      })
      .join("\n\n");
    if (register.length > 160_000)
      throw new Error("This agreement is too long to read in one pass for key terms.");

    const out = await callStructured<{
      terms: { key: string; value: string; clause_id: string | null }[];
    }>({
      feature: "contract-key-terms",
      actor: { supabase, userId },
      system: TERMS_SYSTEM,
      user: [
        `CONTRACT: ${matter.name}`,
        `TYPE: ${schema.label}`,
        matter.client ? `Our client: ${matter.client}` : "",
        matter.counterparty ? `Counterparty: ${matter.counterparty}` : "",
        "",
        "TERMS TO EXTRACT — return one entry for every key, in this order:",
        schema.fields.map((f) => `${f.key} — ${f.label}: ${f.hint}`).join("\n"),
        "",
        "CLAUSE REGISTER:",
        register,
      ]
        .filter(Boolean)
        .join("\n"),
      toolName: "record_key_terms",
      toolDescription: "Record the key terms found in the contract.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          terms: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                key: { type: "string", enum: schema.fields.map((f) => f.key) },
                value: {
                  type: "string",
                  description: "The value as the contract gives it. Empty where absent.",
                },
                clause_id: {
                  type: ["string", "null"],
                  description: "The clause id this came from, or null.",
                },
              },
              required: ["key", "value", "clause_id"],
            },
          },
        },
        required: ["terms"],
      },
    });

    const found = new Map<string, { value: string; clauseId: string | null }>();
    for (const t of out.terms ?? []) {
      if (!schema.fields.some((f) => f.key === t.key)) continue;
      found.set(t.key, {
        value: clean(t.value).slice(0, 600),
        clauseId: t.clause_id && clauseIds.has(t.clause_id) ? t.clause_id : null,
      });
    }

    // Replace Scripta's extraction wholesale; a value a lawyer corrected stays.
    const { data: human } = await supabase
      .from("contract_key_terms")
      .select("term_key")
      .eq("matter_id", data.matterId)
      .eq("source", "human");
    const keep = new Set((human ?? []).map((h: any) => h.term_key));
    await supabase
      .from("contract_key_terms")
      .delete()
      .eq("matter_id", data.matterId)
      .eq("source", "ai");

    const rows = schema.fields
      .filter((f) => !keep.has(f.key))
      .map((f, i) => ({
        matter_id: data.matterId,
        term_key: f.key,
        label: f.label,
        value: found.get(f.key)?.value ?? "",
        clause_id: found.get(f.key)?.clauseId ?? null,
        source: "ai",
        ordinal: i + 1,
      }));
    if (rows.length) {
      const { error } = await supabase.from("contract_key_terms").insert(rows);
      if (error) throw new Error(error.message);
    }
    const filled = rows.filter((r) => r.value).length;
    await audit(supabase, userId, {
      matterId: data.matterId,
      eventType: "matter.key_terms_extracted",
      entityType: "matter",
      entityId: data.matterId,
      summary: `Key terms extracted against the ${schema.label} schema — ${filled} of ${rows.length} found`,
      metadata: { schema: schema.key, found: filled, of: rows.length },
    });
    return { ok: true, schema: schema.key, found: filled, of: rows.length };
  });

/** A reviewer correcting or filling in a term by hand. */
export const setKeyTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; termKey: string; label: string; value: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as Sb;
    const { error } = await supabase.from("contract_key_terms").upsert(
      {
        matter_id: data.matterId,
        term_key: data.termKey,
        label: data.label,
        value: clean(data.value).slice(0, 600),
        source: "human",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "matter_id,term_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------ research from a clause -- */

/**
 * Send an issue to the research module, keeping the anchor both ways: the
 * research matter remembers the clause and the issue that asked the question,
 * so the answer can come back to the clause that needed it.
 */
export const researchIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      matterId: string;
      issueId?: string | null;
      clauseId?: string | null;
      question?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { data: matter } = await supabase
      .from("matters")
      .select("id, name, workspace_id, governing_law, matter_type, client, review_for")
      .eq("id", data.matterId)
      .maybeSingle();
    if (!matter) throw new Error("Matter not found");

    let issue: any = null;
    if (data.issueId) {
      const { data: row } = await supabase
        .from("contract_issues")
        .select("id, ref, title, detail, recommendation, clause_id, severity")
        .eq("id", data.issueId)
        .maybeSingle();
      issue = row;
    }
    const clauseId = data.clauseId ?? issue?.clause_id ?? null;
    let clause: any = null;
    if (clauseId) {
      const { data: row } = await supabase
        .from("clauses")
        .select("id, num, title")
        .eq("id", clauseId)
        .maybeSingle();
      clause = row;
    }

    const question =
      clean(data.question) ||
      (issue
        ? `${issue.title}${clause ? ` (clause ${clause.num ?? ""} ${clause.title})` : ""}`
        : clause
          ? `Clause ${clause.num ?? ""} ${clause.title}`
          : matter.name);

    // The research record itself, then the facts as rows — facts are their own
    // table in the research module, not a column on the matter.
    const { data: research, error } = await supabase
      .from("research_matters")
      .insert({
        workspace_id: matter.workspace_id,
        matter_id: matter.id,
        kind: "simple",
        title: question.slice(0, 200),
        topic: question.slice(0, 200),
        memo_title: question.slice(0, 200),
        question,
        jurisdiction: matter.governing_law ?? "",
        linked_clause: clause ? `${clause.num ?? ""} ${clause.title}`.trim() : "",
        instructions: issue?.recommendation ?? "",
        depth: "SIMPLE",
        created_by: userId,
        source_clause_id: clauseId,
        source_issue_id: issue?.id ?? null,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // The facts the question starts from, so the researcher is not retyping
    // what the review already established.
    const facts = [
      issue
        ? `This question comes out of the contract review of ${matter.name}, raised as issue #${issue.ref}: ${issue.title}.`
        : `This question comes out of the contract review of ${matter.name}.`,
      issue?.detail ?? "",
      clause ? `The clause in question is ${clause.num ?? ""} ${clause.title}.`.trim() : "",
      matter.review_for ? `We act for ${matter.review_for}.` : "",
    ].filter(Boolean);
    if (research?.id && facts.length)
      await supabase.from("research_facts").insert(
        facts.map((fact, i) => ({
          research_matter_id: research.id,
          ref: `F${i + 1}`,
          fact,
          source: "Contract review",
          ordinal: i + 1,
        })),
      );

    await audit(supabase, userId, {
      matterId: data.matterId,
      eventType: "issue.research_raised",
      entityType: clauseId ? "clause" : "matter",
      entityId: clauseId ?? data.matterId,
      summary: `Research raised${issue ? ` on issue #${issue.ref}` : ""} — ${question}`,
      metadata: { research_matter_id: research?.id ?? null, issue_id: issue?.id ?? null },
    });
    return { ok: true, researchId: research?.id ?? null };
  });

/** The schemas a reviewer can pick between, and the one we guessed. */
export const suggestSchema = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as Sb;
    const { data: matter } = await supabase
      .from("matters")
      .select("matter_type")
      .eq("id", data.matterId)
      .maybeSingle();
    const { data: docs } = await supabase
      .from("documents")
      .select("name")
      .eq("matter_id", data.matterId)
      .neq("kind", "transcript");
    const schema = schemaFor(
      matter?.matter_type ?? null,
      (docs ?? []).map((d: any) => d.name).join(" "),
    );
    return { key: schema.key, label: schema.label, generic: schema.key === GENERIC_SCHEMA.key };
  });
