/**
 * Scripta's wording, put into the contract where it belongs.
 *
 * Two steps, so nothing is written the lawyer has not seen:
 *
 *   draftEdits   Scripta reads the contract and what was agreed (an issue, or
 *                a redraft conversation) and returns pinpointed edits: the
 *                exact words that are wrong, in which clause, and what should
 *                replace them. Each is checked against the clause before it is
 *                shown, so an edit Scripta cannot point to is shown as such.
 *   applyEdits   The edits the lawyer kept go in as tracked changes in the
 *                lawyer's own name, one sitting, through `save_clause_doc`,
 *                so they are accepted or rejected like any other mark-up.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { asDoc, docToText, textToDoc, type ClauseDoc } from "@/wireframe/clause-doc";
import { rebuildAmendment, type DiffSeg } from "@/lib/parsing/word-diff";
import { operative } from "@/wireframe/tracked-change";
import { countIn, replaceInDoc } from "@/wireframe/pinpoint";

type Row = { id: string; num: string; title: string; doc: ClauseDoc | null; updated_at: string };

async function loadClauses(supabase: any, matterId: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from("clauses")
    .select("id, num, title, doc, updated_at, clause_segments(ordinal, text, kind)")
    .eq("matter_id", matterId)
    .order("ordinal");
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    num: String(r.num ?? "").trim(),
    title: String(r.title ?? ""),
    // A clause nobody has formatted yet has no document, only its words; it
    // becomes one the way the editor makes it, so the first edit creates it.
    doc:
      asDoc(r.doc) ??
      textToDoc(
        rebuildAmendment(
          [...(r.clause_segments ?? [])]
            .sort((a: any, b: any) => a.ordinal - b.ordinal)
            .map((x: any): DiffSeg => ({ t: x.text, k: x.kind })),
        ),
      ),
    updated_at: r.updated_at,
  }));
}

/** The clause as the model reads it: its words, a table's cells split by " | ". */
const reading = (doc: ClauseDoc | null) =>
  doc ? docToText(operative(doc)).replace(/\t/g, " | ") : "";

const SYSTEM = [
  "You are Scripta, turning an agreed change into exact edits to a contract, for a practising lawyer.",
  "You are given the whole contract, each clause headed by its number in square brackets, and what was agreed: an issue to fix, or the lawyer's instructions and the conversation in which the drafting points were settled.",
  "Return the smallest set of edits that makes the contract say what was agreed, and where the agreed change affects other wording (a schedule, a cross-reference, a defined term, a figure repeated elsewhere), edit that too so the contract stays consistent.",
  "Each edit names one clause and quotes, in `find`, words copied character for character from that clause as supplied: enough words to occur only once in the clause, from a single paragraph or a single table cell, never spanning cells and never including the | separators. `replace` is the wording that takes their place. Change only what needs changing: keep the defined terms, style and register of the document.",
  "Where the conversation left a point undecided, do not guess: leave it out and say so in `note`. Never invent figures, dates, names or authorities. If nothing needs changing, return no edits and say why in `note`.",
  "`note` is for the lawyer to read before deciding. Leave it empty when there is nothing left out. Never say the contract has been changed: nothing is changed until the lawyer puts the edits in.",
].join(" ");

const TOOL = {
  type: "object",
  additionalProperties: false,
  properties: {
    edits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          clause: {
            type: "string",
            description: "The clause number exactly as in the square brackets.",
          },
          find: {
            type: "string",
            description: "Words copied exactly from that clause, occurring once.",
          },
          replace: {
            type: "string",
            description: "The wording that replaces them. Empty to delete them.",
          },
          why: { type: "string", description: "One sentence: what this edit does." },
        },
        required: ["clause", "find", "replace", "why"],
      },
    },
    note: {
      type: "string",
      description: "Anything left out or undecided, in one or two sentences.",
    },
  },
  required: ["edits", "note"],
};

export type DraftedEdit = {
  clauseId: string | null;
  clauseNum: string;
  clauseTitle: string;
  find: string;
  replace: string;
  why: string;
  /** Why this edit cannot be applied as it stands, or null when it can. */
  problem: string | null;
};

const byNumber = (rows: Row[], label: string) => {
  const key = label
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/^(clause|section)\s+/i, "")
    .toLowerCase();
  return rows.find((r) => r.num.toLowerCase() === key);
};

export const draftEdits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      matterId: z.string().uuid(),
      issueId: z.string().uuid().optional(),
      instructions: z
        .array(z.object({ anchor: z.string(), title: z.string(), summary: z.string() }))
        .max(100)
        .optional(),
      history: z
        .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(20_000) }))
        .max(40)
        .optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const [{ data: matter }, rows] = await Promise.all([
      supabase
        .from("matters")
        .select("name, review_for, review_role")
        .eq("id", data.matterId)
        .maybeSingle(),
      loadClauses(supabase, data.matterId),
    ]);
    if (!rows.length) throw new Error("There is no contract on this matter to edit.");

    let asked: string;
    if (data.issueId) {
      const { data: issue } = await supabase
        .from("contract_issues")
        .select("ref, title, detail, recommendation, clause_id")
        .eq("id", data.issueId)
        .eq("matter_id", data.matterId)
        .maybeSingle();
      if (!issue) throw new Error("That issue is no longer on this matter.");
      const at = rows.find((r) => r.id === issue.clause_id);
      asked = [
        `THE ISSUE TO FIX (#${issue.ref}${at ? `, raised on ${at.num}` : ""}): ${issue.title}`,
        issue.detail ?? "",
        issue.recommendation ? `Recommended: ${issue.recommendation}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    } else {
      const list = (data.instructions ?? [])
        .map((i, k) => `${k + 1}. ${i.anchor} — ${i.title}: ${i.summary}`)
        .join("\n");
      const talk = (data.history ?? [])
        .map((t) => `${t.role === "user" ? "LAWYER" : "SCRIPTA"}: ${t.text}`)
        .join("\n\n");
      if (!list && !talk) throw new Error("There is nothing agreed yet to put into the contract.");
      asked = [
        "THE LAWYER'S INSTRUCTIONS:",
        list || "(none)",
        talk ? `\nTHE CONVERSATION IN WHICH THE DRAFTING WAS SETTLED:\n${talk}` : "",
        "\nMake the edits that put what was settled into the contract.",
      ].join("\n");
    }

    const contract = rows
      .map((r) => `[${r.num}] ${r.title}\n${reading(r.doc)}`.trim())
      .join("\n\n");
    if (contract.length > 200_000)
      throw new Error("This contract is too long for Scripta to edit in one pass.");

    const { callStructured } = await import("@/lib/ai-gateway.server");
    const out = await callStructured<{ edits?: any[]; note?: string }>({
      feature: "contract-edits",
      actor: { supabase, userId },
      system: SYSTEM,
      user: [
        `Contract: ${matter?.name ?? "Agreement"}`,
        matter?.review_for
          ? `We act for: ${matter.review_for}${matter.review_role ? ` (${matter.review_role})` : ""}`
          : "",
        "",
        asked,
        "",
        "THE CONTRACT:",
        contract,
      ].join("\n"),
      toolName: "record_edits",
      toolDescription: "Record the exact edits that put the agreed change into the contract.",
      parameters: TOOL,
    });

    const edits: DraftedEdit[] = (out.edits ?? []).slice(0, 40).map((e) => {
      const find = String(e.find ?? "");
      const replace = String(e.replace ?? "");
      const why = String(e.why ?? "").trim();
      const named = byNumber(rows, String(e.clause ?? ""));
      // The quote is the better evidence: where the clause named does not hold
      // it and exactly one other clause does, that is the clause meant.
      let row = named && named.doc && countIn(named.doc, find) === 1 ? named : undefined;
      if (!row) {
        const holders = rows.filter((r) => r.doc && countIn(r.doc, find) > 0);
        if (holders.length === 1) row = holders[0];
      }
      const target = row ?? named;
      let problem: string | null = null;
      if (!target?.doc) problem = "Scripta could not find those words in the contract.";
      else {
        const trial = replaceInDoc(target.doc, find, replace, {
          setId: "trial",
          authorId: userId,
          at: "",
        });
        if (!trial.ok) problem = trial.problem;
      }
      return {
        clauseId: target?.id ?? null,
        clauseNum: target?.num ?? String(e.clause ?? ""),
        clauseTitle: target?.title ?? "",
        find,
        replace,
        why,
        problem,
      };
    });
    return { edits, note: String(out.note ?? "").trim() };
  });

export const applyEdits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      matterId: z.string().uuid(),
      issueId: z.string().uuid().optional(),
      edits: z
        .array(
          z.object({
            clauseId: z.string().uuid(),
            find: z.string().min(1).max(5_000),
            replace: z.string().max(10_000),
          }),
        )
        .min(1)
        .max(40),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const rows = await loadClauses(supabase, data.matterId);
    const byId = new Map(rows.map((r) => [r.id, r]));
    // One sitting, so the whole change can be accepted or rejected as one act.
    const stamp = {
      setId: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      authorId: userId as string,
      at: new Date().toISOString(),
    };

    const results: { index: number; ok: boolean; problem: string | null }[] = [];
    const touched: string[] = [];
    const clauseIds = [...new Set(data.edits.map((e) => e.clauseId))];
    for (const clauseId of clauseIds) {
      const row = byId.get(clauseId);
      const mine = data.edits
        .map((e, index) => ({ e, index }))
        .filter((x) => x.e.clauseId === clauseId);
      if (!row?.doc) {
        for (const { index } of mine)
          results.push({ index, ok: false, problem: "That clause is not on this matter." });
        continue;
      }
      let doc = row.doc;
      const applied: number[] = [];
      for (const { e, index } of mine) {
        const out = replaceInDoc(doc, e.find, e.replace, stamp);
        if (out.ok) {
          doc = out.doc;
          applied.push(index);
        } else results.push({ index, ok: false, problem: out.problem });
      }
      if (!applied.length) continue;
      const saved = await supabase.rpc("save_clause_doc", {
        _clause: clauseId,
        _doc: doc,
        _seen: row.updated_at,
      });
      if (saved.error) {
        for (const index of applied)
          results.push({ index, ok: false, problem: saved.error.message });
        continue;
      }
      for (const index of applied) results.push({ index, ok: true, problem: null });
      touched.push(row.num);
    }

    const done = results.filter((r) => r.ok).length;
    if (done) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", userId)
        .maybeSingle();
      await supabase.from("audit_events").insert({
        matter_id: data.matterId,
        actor_id: userId,
        actor_name: profile?.full_name ?? profile?.email ?? "Team member",
        event_type: "edits.applied",
        entity_type: "matter",
        entity_id: data.matterId,
        summary: `Scripta's wording put in as tracked changes: ${done} edit${done === 1 ? "" : "s"} in ${touched.join(", ")}`,
        metadata: { set_id: stamp.setId, issue_id: data.issueId ?? null, clauses: touched },
      });
    }
    return {
      applied: done,
      setId: stamp.setId,
      results: results.sort((a, b) => a.index - b.index),
    };
  });
