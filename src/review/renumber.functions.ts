/**
 * Renumbering a matter's contract: in order, by the lawyer's own edits, or
 * back to the document's numbering. See lib/renumber.ts for what is kept whole.
 *
 * After it, the certain findings that depend on numbers are brought up to
 * date: numbering gaps it has closed are cleared, and wording that still
 * cites a clause by its old number is raised, on the clause whose wording it
 * is, for the lawyer to correct.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cascade, remapRefs, renumberPlan, staleCitations, type Change } from "@/lib/renumber";
import { numberingGaps } from "@/lib/conformity";
import { readingDoc, reviewBody } from "@/lib/review-reading";
import { referencesIn, type Reference } from "@/lib/subclauses";

/** Findings this action owns, recognised by their title. */
const STALE = "still cites clause";
const GAP = "Numbering skips";

export const renumberClauses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      matterId: z.string().uuid(),
      mode: z.enum(["sequential", "edits", "reset"]),
      edits: z
        .array(z.object({ id: z.string().uuid(), to: z.string().trim().min(1).max(40) }))
        .max(500)
        .optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: rows, error } = await supabase
      .from("clauses")
      .select(
        "id, num, document_num, refs, doc, title, ordinal, clause_segments(ordinal, text, kind)",
      )
      .eq("matter_id", data.matterId)
      .order("ordinal");
    if (error) throw new Error(error.message);
    const clauses = ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string,
      num: String(r.num ?? "").trim(),
      documentNum: (r.document_num as string | null) ?? null,
      refs: (Array.isArray(r.refs) ? r.refs : []) as Reference[],
      text: reviewBody(
        readingDoc(r.doc),
        [...(r.clause_segments ?? [])]
          .sort((a: any, b: any) => a.ordinal - b.ordinal)
          .map((s: any) => ({ t: s.text, k: s.kind })),
      ),
    }));
    if (!clauses.length) throw new Error("There is no contract on this matter to renumber.");

    let changes: Change[];
    if (data.mode === "sequential") changes = renumberPlan(clauses);
    else if (data.mode === "edits") changes = cascade(clauses, data.edits ?? []);
    else
      changes = cascade(
        clauses,
        clauses.filter((c) => c.documentNum).map((c) => ({ id: c.id, to: c.documentNum! })),
      );

    const renamed = new Map(changes.map((c) => [c.from, c.to]));
    if (changes.length) {
      // Whole or not at all: one statement, under the caller's own rights.
      const { error: upErr } = await supabase.rpc("renumber_clauses", {
        p_matter: data.matterId,
        p_changes: changes.map((ch) => ({ id: ch.id, to_num: ch.to })),
        p_reset: data.mode === "reset",
      });
      if (upErr) throw new Error(upErr.message);
      for (const ch of changes) {
        const c = clauses.find((x) => x.id === ch.id)!;
        c.documentNum = data.mode === "reset" ? null : (c.documentNum ?? ch.from);
        c.num = ch.to;
      }
    }

    // The links between clauses follow the clauses they point at.
    if (renamed.size)
      for (const c of clauses) {
        const { refs, moved } = remapRefs(c.refs, renamed);
        if (!moved.length) continue;
        const { error: refErr } = await supabase.from("clauses").update({ refs }).eq("id", c.id);
        if (refErr) throw new Error(refErr.message);
      }

    // Bring the number-dependent findings up to date.
    await supabase
      .from("contract_issues")
      .delete()
      .eq("matter_id", data.matterId)
      .eq("status", "open")
      .eq("source", "ai")
      .or(`title.ilike.*${STALE}*,title.ilike.${GAP}*`);
    const stale = staleCitations(clauses, referencesIn);
    const gaps = numberingGaps(clauses.map((c) => ({ ...c, title: "", refs: [] })));
    const findings = [
      ...stale.map((s) => {
        // "Clause 4", but "Schedule 1.B.3": a schedule names itself.
        const who = /^\d/.test(s.clauseNum) ? `clause ${s.clauseNum}` : s.clauseNum;
        const Who = who.charAt(0).toUpperCase() + who.slice(1);
        return {
          clause_id: s.clauseId,
          kind: "drafting",
          severity: "medium",
          title: `${Who} ${STALE} ${s.cites}, now ${s.now}`,
          detail: `The contract was renumbered, and the clause the document called ${s.cites} is now ${s.now}. The wording of ${who} still says “clause ${s.cites}”, which a reader will take to mean the clause now numbered ${s.cites}, if there is one.`,
          recommendation: `Change “clause ${s.cites}” to “clause ${s.now}” in ${who}.`,
        };
      }),
      ...gaps.map((g) => ({
        clause_id: g.clauseId,
        kind: "conformity",
        severity: g.severity,
        title: g.title,
        detail: g.detail,
        recommendation: g.recommendation,
      })),
    ];
    if (findings.length) {
      const [{ data: refRow }, { data: ordRow }] = await Promise.all([
        supabase
          .from("contract_issues")
          .select("ref")
          .eq("matter_id", data.matterId)
          .order("ref", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("contract_issues")
          .select("ordinal")
          .eq("matter_id", data.matterId)
          .order("ordinal", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      let ref = (refRow?.ref ?? 0) + 1;
      let ordinal = (ordRow?.ordinal ?? 0) + 1;
      const { error: insErr } = await supabase.from("contract_issues").insert(
        findings.map((f) => ({
          ...f,
          matter_id: data.matterId,
          ref: ref++,
          ordinal: ordinal++,
          status: "open",
          source: "ai",
        })),
      );
      if (insErr) throw new Error(insErr.message);
    }

    if (changes.length) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", userId)
        .maybeSingle();
      await supabase.from("audit_events").insert({
        matter_id: data.matterId,
        actor_id: userId,
        actor_name: profile?.full_name ?? profile?.email ?? "Team member",
        event_type: "clauses.renumbered",
        entity_type: "matter",
        entity_id: data.matterId,
        summary:
          data.mode === "reset"
            ? `Contract put back to the document's numbering (${changes.length} clauses)`
            : `Contract renumbered: ${changes.length} clause${changes.length === 1 ? "" : "s"} (${changes
                .slice(0, 3)
                .map((c) => `${c.from} → ${c.to}`)
                .join(", ")}${changes.length > 3 ? "…" : ""})`,
        metadata: { mode: data.mode, changes },
      });
    }

    return { changed: changes.length, stale: stale.length, gaps: gaps.length };
  });
