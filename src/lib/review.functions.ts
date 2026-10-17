import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rebuildOriginal, wordDiff, type DiffSeg } from "@/lib/parsing/word-diff";
import { asDoc, docToText } from "@/wireframe/clause-doc";
import { proposeIntoDoc } from "@/lib/clause-proposal";
import { insertionDoc } from "@/lib/clause-insert";

type Sb = {
  supabase: {
    from: (t: string) => any;
    /** Postgres functions: the clause insert shifts the register in one. */
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  userId: string;
};

async function actorName(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? data?.email ?? "Unknown";
}

async function clauseContext(supabase: any, clauseId: string) {
  const { data } = await supabase
    .from("clauses")
    .select("id, num, title, matter_id, suggested_text, doc, updated_at, matters(workspace_id)")
    .eq("id", clauseId)
    .maybeSingle();
  return data;
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
  const cleared = await supabase.from("clause_segments").delete().eq("clause_id", clauseId);
  if (cleared.error) throw new Error(cleared.error.message);
  if (segs.length === 0) return;
  const written = await supabase
    .from("clause_segments")
    .insert(segs.map((s, i) => ({ clause_id: clauseId, ordinal: i + 1, text: s.t, kind: s.k })));
  if (written.error) throw new Error(written.error.message);
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
  return data?.id as string | undefined;
}

type CommentKind = "note" | "instruction";

/**
 * Write comment rows. `kind` separates a note kept on the record from an
 * instruction handed to the redraft; a database that has not had the
 * comments.kind migration applied yet rejects the column, and the rows are
 * still written rather than lost — they simply read back as notes.
 */
async function insertComments(supabase: any, rows: Record<string, unknown>[], kind: CommentKind) {
  const { error } = await supabase.from("comments").insert(rows.map((r) => ({ ...r, kind })));
  if (!error) return;
  if (!/kind/i.test(String(error.message ?? ""))) throw new Error(error.message);
  const { error: retry } = await supabase.from("comments").insert(rows);
  if (retry) throw new Error(retry.message);
}

/** The clause a comment hangs on, for the audit trail. */
async function commentContext(supabase: any, commentId: string) {
  const { data } = await supabase
    .from("comments")
    .select("id, entity_kind, entity_id, body")
    .eq("id", commentId)
    .maybeSingle();
  if (!data) throw new Error("Note not found");
  if (data.entity_kind !== "clause") throw new Error("That note is not held on a clause");
  const clause = await clauseContext(supabase, data.entity_id);
  if (!clause) throw new Error("Clause not found");
  return { comment: data, clause };
}

/**
 * Apply a suggested redline to the amendment side of a clause. The prior segments
 * are kept on the audit event so the change is always reversible.
 */
export const acceptSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { clauseId: string; text: string; edited?: boolean | undefined }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const clause = await clauseContext(supabase, data.clauseId);
    if (!clause) throw new Error("Clause not found");

    const prior = await loadSegs(supabase, data.clauseId);
    /* The clause's own wording is the baseline, not the segments shadow — the
       shadow has been frozen since Phase 5 and diffing against it would
       redline the lawyer's own earlier edits back in. */
    const doc = asDoc(clause.doc);
    const original = doc ? docToText(doc) : rebuildOriginal(prior);
    const next = wordDiff(original, data.text);

    /* Accepted wording becomes THE ACCEPTING LAWYER'S OWN TRACKED PROPOSAL,
       which is what this function's own audit line has always claimed — "now
       recorded as the reviewer's own" — and what it never did. It is somebody
       taking responsibility for a machine's suggestion, so it is settled the
       way any other proposal is, by a colleague. Kwame's decision in the
       clause-workflow acceptance review. */
    await proposeIntoDoc(supabase, clause, userId, next, "accepting a suggestion");
    await writeSegs(supabase, data.clauseId, next);
    const cleared = await supabase
      .from("clauses")
      .update({ suggested_text: null, analysis_source: "human" })
      .eq("id", data.clauseId);
    if (cleared.error) throw new Error(cleared.error.message);

    const undoId = await audit(supabase, userId, {
      matterId: clause.matter_id,
      eventType: data.edited ? "clause.suggestion_edited_accepted" : "clause.suggestion_accepted",
      entityType: "clause",
      entityId: data.clauseId,
      summary: `Suggested language for clause ${clause.num ?? ""} ${clause.title} ${
        data.edited ? "edited and accepted" : "accepted"
      } — now recorded as the reviewer's own`,
      metadata: { prior_segments: prior, applied_text: data.text },
    });
    return { ok: true, undoId: undoId ?? null };
  });

/** Restore the clause text captured on an earlier accept. */
export const restorePriorText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { clauseId: string; auditEventId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const clause = await clauseContext(supabase, data.clauseId);
    if (!clause) throw new Error("Clause not found");
    const { data: ev } = await supabase
      .from("audit_events")
      .select("metadata")
      .eq("id", data.auditEventId)
      .maybeSingle();
    const prior = (ev?.metadata?.prior_segments ?? []) as DiffSeg[];
    if (prior.length === 0) throw new Error("No prior text was recorded for this change");
    await proposeIntoDoc(supabase, clause, userId, prior, "restoring the prior text");
    await writeSegs(supabase, data.clauseId, prior);
    await audit(supabase, userId, {
      matterId: clause.matter_id,
      eventType: "clause.text_restored",
      entityType: "clause",
      entityId: data.clauseId,
      summary: `Prior text restored for clause ${clause.num ?? ""} ${clause.title}`,
      metadata: { undone_event: data.auditEventId },
    });
    return { ok: true };
  });

/** Reject an AI proposal. The suggestion is cleared and the reason recorded. */
export const rejectSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { clauseId: string; reason?: string | undefined }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const clause = await clauseContext(supabase, data.clauseId);
    if (!clause) throw new Error("Clause not found");
    const prior = clause.suggested_text ?? "";
    await supabase.from("clauses").update({ suggested_text: null }).eq("id", data.clauseId);
    const undoId = await audit(supabase, userId, {
      matterId: clause.matter_id,
      eventType: "clause.suggestion_rejected",
      entityType: "clause",
      entityId: data.clauseId,
      summary: `Suggested language for clause ${clause.num ?? ""} ${clause.title} rejected${
        data.reason ? ` — ${data.reason}` : ""
      }`,
      metadata: { rejected_text: prior, reason: data.reason ?? null },
    });
    return { ok: true, undoId: undoId ?? null };
  });

/** Put a rejected or accepted suggestion back on the clause. */
export const restoreSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { clauseId: string; text: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const clause = await clauseContext(supabase, data.clauseId);
    if (!clause) throw new Error("Clause not found");
    await supabase.from("clauses").update({ suggested_text: data.text }).eq("id", data.clauseId);
    await audit(supabase, userId, {
      matterId: clause.matter_id,
      eventType: "clause.suggestion_restored",
      entityType: "clause",
      entityId: data.clauseId,
      summary: `Suggested language restored on clause ${clause.num ?? ""} ${clause.title}`,
    });
    return { ok: true };
  });

/** Reviewer sets the review state explicitly. */
export const setClauseReviewState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { clauseId: string; state: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const clause = await clauseContext(supabase, data.clauseId);
    if (!clause) throw new Error("Clause not found");
    await supabase.from("clauses").update({ review_state: data.state }).eq("id", data.clauseId);
    await audit(supabase, userId, {
      matterId: clause.matter_id,
      eventType: "clause.review_state_set",
      entityType: "clause",
      entityId: data.clauseId,
      summary: `Clause ${clause.num ?? ""} ${clause.title} marked ${data.state}`,
      metadata: { review_state: data.state },
    });
    return { ok: true };
  });

/** Turn an AI proposal into a comment rather than a change. */
export const addClauseComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { clauseId: string; body: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const clause = await clauseContext(supabase, data.clauseId);
    if (!clause) throw new Error("Clause not found");
    await supabase.from("comments").insert({
      workspace_id: clause.matters.workspace_id,
      entity_kind: "clause",
      entity_id: data.clauseId,
      body: data.body,
      author_id: userId,
      resolved: false,
    });
    await audit(supabase, userId, {
      matterId: clause.matter_id,
      eventType: "clause.commented",
      entityType: "clause",
      entityId: data.clauseId,
      summary: `Comment added on clause ${clause.num ?? ""} ${clause.title}`,
    });
    return { ok: true };
  });

/** Escalate a deviation for the approval level the playbook requires. */
export const requestClauseApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { clauseId: string; reason?: string | undefined }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const clause = await clauseContext(supabase, data.clauseId);
    if (!clause) throw new Error("Clause not found");
    await supabase.from("approvals").insert({
      workspace_id: clause.matters.workspace_id,
      entity_kind: "clause",
      entity_id: data.clauseId,
      reason: data.reason ?? null,
      status: "Requested",
      requested_by: userId,
    });
    await supabase.from("clauses").update({ approval: "Requested" }).eq("id", data.clauseId);
    await audit(supabase, userId, {
      matterId: clause.matter_id,
      eventType: "clause.approval_requested",
      entityType: "clause",
      entityId: data.clauseId,
      summary: `Approval requested for clause ${clause.num ?? ""} ${clause.title}${
        data.reason ? ` — ${data.reason}` : ""
      }`,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Document-first editing: the user's own words, not only AI proposals */
/* ------------------------------------------------------------------ */

/**
 * The reviewer rewrites a clause in their own words. The same diff engine that
 * renders AI redlines records the edit as insertions and deletions, so the Word
 * export carries it as genuine tracked changes. Prior segments are kept on the
 * audit event, so restorePriorText undoes it.
 */
export const editClauseText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { clauseId: string; text: string; doc?: unknown }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const clause = await clauseContext(supabase, data.clauseId);
    if (!clause) throw new Error("Clause not found");
    const prior = await loadSegs(supabase, data.clauseId);
    const original = rebuildOriginal(prior);
    const next = wordDiff(original, data.text);

    /* -------------------------------------------------------------------
       THE DOCUMENT GOES FIRST, AND ITS REFUSAL IS FATAL
       -------------------------------------------------------------------

       This wrote the segments first and then updated the clause WITHOUT
       LOOKING AT THE RESULT. `authenticated` has no UPDATE on `clauses.doc`
       — Phase 5 revoked it so that every document write goes through
       `save_clause_doc`, where authorship, the staleness guard and
       `can_settle_change` are enforced — and Postgres refuses the whole
       statement when it touches one column the caller may not write.

       So an ordinary Edit wrote the redline to `clause_segments`, wrote an
       audit row saying the reviewer had edited the clause, left
       `clauses.doc` and even `analysis_source` untouched, and reported
       success. The lawyer saw their redline; the authoritative document had
       never heard of it, and neither had the export, the Changes pane or the
       changed-clause filter, all of which read the document.

       Reproduced end to end in the clause-workflow acceptance review on a
       disposable clause: segments 4 rows, doc unchanged, analysis_source
       still 'ai', one audit row claiming the edit, and no error anywhere on
       screen, in the console, or on the network — the write is server-side,
       so there was no surface on which it could be seen to fail.

       Attempted first, so a refusal leaves NOTHING changed rather than a
       redline in one table and an error in the interface. The lawyer is told
       the truth, and their text is still in the editor to try again.

       This stops the false success. It does not make the edit land: that
       needs the write routed through `save_clause_doc`, which is a change to
       the tracked write path and is deliberately not made here. */
    const wrote = await supabase
      .from("clauses")
      .update({
        analysis_source: "human",
        ...(data.doc === undefined ? {} : { doc: data.doc as never }),
      })
      .eq("id", data.clauseId);
    if (wrote.error) throw new Error(wrote.error.message);

    await writeSegs(supabase, data.clauseId, next);
    const undoId = await audit(supabase, userId, {
      matterId: clause.matter_id,
      eventType: "clause.text_edited",
      entityType: "clause",
      entityId: data.clauseId,
      summary: `Clause ${clause.num ?? ""} ${clause.title} edited by the reviewer`,
      metadata: { prior_segments: prior, applied_text: data.text },
    });
    return { ok: true, undoId: undoId ?? null };
  });

/** Rename a clause heading. */
export const renameClause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { clauseId: string; title: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const clause = await clauseContext(supabase, data.clauseId);
    if (!clause) throw new Error("Clause not found");
    const title = data.title.trim();
    if (!title) throw new Error("A clause needs a heading");
    await supabase.from("clauses").update({ title }).eq("id", data.clauseId);
    await audit(supabase, userId, {
      matterId: clause.matter_id,
      eventType: "clause.renamed",
      entityType: "clause",
      entityId: data.clauseId,
      summary: `Clause ${clause.num ?? ""} renamed to ${title}`,
      metadata: { from: clause.title, to: title },
    });
    return { ok: true };
  });

/** Append a new, empty clause to a matter's document — drafting in place. */
export const addClause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; title?: string | undefined }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { data: last } = await supabase
      .from("clauses")
      .select("ordinal, source_document_id")
      .eq("matter_id", data.matterId)
      .order("ordinal", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ordinal = (last?.ordinal ?? 0) + 1;
    const title = data.title?.trim() || "New clause";
    const { data: inserted, error } = await supabase
      .from("clauses")
      .insert({
        matter_id: data.matterId,
        source_document_id: last?.source_document_id ?? null,
        num: String(ordinal),
        title,
        status: "Open",
        ordinal,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Could not add clause");
    await supabase
      .from("clause_segments")
      .insert({ clause_id: inserted.id, ordinal: 1, text: "", kind: "n" });
    await audit(supabase, userId, {
      matterId: data.matterId,
      eventType: "clause.added",
      entityType: "clause",
      entityId: inserted.id,
      summary: `Clause ${ordinal} ${title} added`,
    });
    return { clauseId: inserted.id as string, ordinal };
  });

/**
 * Insert a clause after another one.
 *
 * The register makes room in one statement (`insert_clause`), so it cannot be
 * left half-shifted, and the new clause is marked `drafted_here` so re-reading
 * the document does not throw it away.
 *
 * The number is the caller's: the screen offers "5.2A" for a clause inserted
 * after 5.2 and lets the lawyer change it. NOTHING IS RENUMBERED — the
 * document's cross-references are prose, and a register that renumbers itself
 * leaves all of them pointing at the wrong provision.
 *
 * The wording goes in as a tracked insertion, like every other edit here, so
 * the marked-up copy shows it as added with a name against it and the
 * counterparty can accept or reject it in Word.
 */
export const insertClauseAfter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      matterId: string;
      /** The clause it goes after; null puts it before everything. */
      afterClauseId: string | null;
      num: string;
      title: string;
      text: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const num = data.num.trim();
    const title = data.title.trim();
    const text = data.text.replace(/\r\n?/g, "\n").trim();

    const { data: newId, error } = await supabase.rpc("insert_clause", {
      _matter: data.matterId,
      _after: data.afterClauseId,
      _num: num,
      _title: title,
    });
    if (error || !newId) throw new Error(error?.message ?? "The clause could not be inserted");
    const clauseId = newId as unknown as string;

    /* One change for the whole clause: a lawyer proposing a new clause has
       made one proposal, and the Changes pane should offer one decision. */
    const stamp = {
      changeId: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      setId: `insert_${clauseId}`,
      authorId: userId,
      at: new Date().toISOString(),
    };

    /**
     * The wording goes in through `save_clause_doc`, not by writing the row.
     *
     * `clauses.doc` is the one column `authenticated` may not update directly,
     * and that is deliberate: every clause document goes through this function,
     * which checks the matter, the edit lock, and that a tracked change is
     * being made in the author's own name. Writing the column round the side
     * would be the one edit in the app that skipped all three.
     */
    const { error: docErr } = await supabase.rpc("save_clause_doc", {
      _clause: clauseId,
      _doc: insertionDoc(text, stamp),
      _seen: null,
    });
    if (docErr) throw new Error(docErr.message);

    /* The flat reading, which the older surfaces and the diff still use. An
       empty clause gets an empty operative segment rather than none, so it
       reads as a clause with nothing in it yet. */
    const { error: segErr } = await supabase
      .from("clause_segments")
      .insert({ clause_id: clauseId, ordinal: 1, text, kind: text ? "i" : "n" });
    if (segErr) throw new Error(segErr.message);

    await audit(supabase, userId, {
      matterId: data.matterId,
      eventType: "clause.inserted",
      entityType: "clause",
      entityId: clauseId,
      summary: `Clause ${num || "(unnumbered)"}${title ? ` ${title}` : ""} inserted as a tracked change`,
      metadata: {
        after_clause_id: data.afterClauseId,
        num,
        words: text ? text.split(/\s+/).length : 0,
      },
    });

    return { clauseId, num };
  });

/** A note on the document as a whole, optionally anchored to a quoted passage. */
export const addMatterNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; body: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { data: m } = await supabase
      .from("matters")
      .select("workspace_id")
      .eq("id", data.matterId)
      .maybeSingle();
    if (!m) throw new Error("Matter not found");
    const body = data.body.trim();
    if (!body) throw new Error("Write something first");
    await supabase.from("comments").insert({
      workspace_id: m.workspace_id,
      entity_kind: "matter",
      entity_id: data.matterId,
      body,
      author_id: userId,
      resolved: false,
    });
    await audit(supabase, userId, {
      matterId: data.matterId,
      eventType: "matter.noted",
      entityType: "matter",
      entityId: data.matterId,
      summary: "Note added to the document",
    });
    return { ok: true };
  });

/**
 * Draft a contract from nothing. A document with no stored file, marked parsed,
 * holding one empty clause the user writes into. Everything else — editing,
 * notes, playbook checks, Word export — works on it exactly as on an upload.
 */
export const createBlankContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { workspaceId: string; matterId?: string | undefined; title: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const title = data.title.trim() || "Untitled contract";
    let matterId = data.matterId ?? null;
    if (!matterId) {
      const { data: m, error } = await supabase
        .from("matters")
        .insert({
          workspace_id: data.workspaceId,
          name: title,
          stage: "Drafting",
          owner_id: userId,
          created_by: userId,
          is_sample: false,
        })
        .select("id")
        .single();
      if (error || !m) throw new Error(error?.message ?? "Could not create matter");
      matterId = m.id as string;
    }
    const { data: doc, error: dErr } = await supabase
      .from("documents")
      .insert({
        matter_id: matterId,
        name: title,
        kind: "contract",
        version_label: "Draft v1",
        doc_date: new Date().toISOString().slice(0, 10),
        storage_path: null,
        mime_type: null,
        byte_size: null,
        uploaded_by: userId,
        parse_status: "parsed",
        parsed_blocks: [],
        parsed_text: "",
        structure_detected: true,
        page_count: 1,
      })
      .select("id")
      .single();
    if (dErr || !doc) throw new Error(dErr?.message ?? "Could not create document");
    const { data: clause, error: cErr } = await supabase
      .from("clauses")
      .insert({
        matter_id: matterId,
        source_document_id: doc.id,
        num: "1",
        title: "Definitions",
        status: "Open",
        ordinal: 1,
      })
      .select("id")
      .single();
    if (cErr || !clause) throw new Error(cErr?.message ?? "Could not create first clause");
    await supabase
      .from("clause_segments")
      .insert({ clause_id: clause.id, ordinal: 1, text: "", kind: "n" });
    await audit(supabase, userId, {
      matterId,
      eventType: "document.drafted",
      entityType: "document",
      entityId: doc.id,
      summary: `${title} started from a blank draft`,
    });
    return { matterId, documentId: doc.id as string, clauseId: clause.id as string };
  });

/* ------------------------------------------------------------------ */
/* Clause instructions: the reviewer's own words, kept on the record   */
/* ------------------------------------------------------------------ */

/**
 * An instruction the reviewer holds against a clause for the redraft. It is a
 * comment, not a change: nothing on the document moves. Stored in the database
 * rather than the browser, so clearing a cache no longer loses it.
 */
export const addClauseInstruction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { clauseId: string; body: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const clause = await clauseContext(supabase, data.clauseId);
    if (!clause) throw new Error("Clause not found");
    const body = data.body.trim();
    if (!body) throw new Error("Write the instruction first");
    await insertComments(
      supabase,
      [
        {
          workspace_id: clause.matters.workspace_id,
          entity_kind: "clause",
          entity_id: data.clauseId,
          body,
          author_id: userId,
          resolved: false,
        },
      ],
      "instruction",
    );
    await audit(supabase, userId, {
      matterId: clause.matter_id,
      eventType: "clause.instruction_added",
      entityType: "clause",
      entityId: data.clauseId,
      summary: `Instruction held on clause ${clause.num ?? ""} ${clause.title} — ${body}`,
    });
    return { ok: true };
  });

/** Amend the wording of a note or an instruction already held on a clause. */
export const updateClauseComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { commentId: string; body: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { comment, clause } = await commentContext(supabase, data.commentId);
    const body = data.body.trim();
    if (!body) throw new Error("An instruction cannot be emptied — delete it instead");
    const { error } = await supabase.from("comments").update({ body }).eq("id", data.commentId);
    if (error) throw new Error(error.message);
    await audit(supabase, userId, {
      matterId: clause.matter_id,
      eventType: "clause.instruction_edited",
      entityType: "clause",
      entityId: clause.id,
      summary: `Instruction on clause ${clause.num ?? ""} ${clause.title} amended`,
      metadata: { from: comment.body, to: body },
    });
    return { ok: true };
  });

/**
 * How this section's sub-clauses are printed: with their numbers, or each one
 * headed by the term it defines.
 *
 * A drafting convention, so it is recorded on the document and audited like
 * any other change to it. Nothing about the rows moves — `num` still orders
 * them and still carries the tree; only the exporters withhold the label.
 */
export const setClausePartsNumbered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { clauseId: string; numbered: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { data: clause, error: readErr } = await supabase
      .from("clauses")
      .select("id, num, title, matter_id")
      .eq("id", data.clauseId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!clause) throw new Error("That clause is no longer available to you.");

    const { error } = await supabase
      .from("clauses")
      .update({ parts_numbered: data.numbered } as never)
      .eq("id", data.clauseId);
    if (error) throw new Error(error.message);

    await audit(supabase, userId, {
      matterId: clause.matter_id,
      eventType: "clause.parts_numbering_changed",
      entityType: "clause",
      entityId: clause.id,
      summary: `Sub-clauses of ${clause.num ?? ""} ${clause.title} ${
        data.numbered ? "numbered" : "printed without numbers"
      }`,
      metadata: { numbered: data.numbered },
    });
    return { ok: true };
  });

/**
 * Whether this contract is drafted onto the firm's paper.
 *
 * Recorded on the matter, so the choice is made once, where the drafting
 * happens, and the finalising screen follows it rather than asking again.
 */
export const setMatterLetterhead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; use: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { error } = await supabase
      .from("matters")
      .update({ use_letterhead: data.use } as never)
      .eq("id", data.matterId);
    if (error) throw new Error(error.message);
    await audit(supabase, userId, {
      matterId: data.matterId,
      eventType: "matter.letterhead_changed",
      entityType: "matter",
      entityId: data.matterId,
      summary: data.use
        ? "Contract set to print on the firm's letterhead"
        : "Contract set to print without the letterhead",
      metadata: { use_letterhead: data.use },
    });
    return { ok: true };
  });

/** Delete a note or instruction. The deleted words are kept on the audit event. */
export const deleteClauseComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { commentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { comment, clause } = await commentContext(supabase, data.commentId);
    const { error } = await supabase.from("comments").delete().eq("id", data.commentId);
    if (error) throw new Error(error.message);
    await audit(supabase, userId, {
      matterId: clause.matter_id,
      eventType: "clause.instruction_deleted",
      entityType: "clause",
      entityId: clause.id,
      summary: `Instruction on clause ${clause.num ?? ""} ${clause.title} deleted`,
      metadata: { deleted_body: comment.body },
    });
    return { ok: true };
  });

/**
 * Move instructions an earlier build left in the browser into the matter
 * record. Runs once per matter; clauses that are no longer in the document are
 * skipped rather than written against nothing.
 */
export const importClauseInstructions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; items: { clauseId: string; body: string }[] }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { data: matter } = await supabase
      .from("matters")
      .select("workspace_id")
      .eq("id", data.matterId)
      .maybeSingle();
    if (!matter) throw new Error("Matter not found");
    const { data: clauses } = await supabase
      .from("clauses")
      .select("id")
      .eq("matter_id", data.matterId);
    const known = new Set((clauses ?? []).map((c: { id: string }) => c.id));
    const rows = data.items
      .filter((item) => known.has(item.clauseId) && item.body.trim())
      .map((item) => ({
        workspace_id: matter.workspace_id,
        entity_kind: "clause",
        entity_id: item.clauseId,
        body: item.body.trim(),
        author_id: userId,
        resolved: false,
      }));
    if (!rows.length) return { imported: 0 };
    await insertComments(supabase, rows, "instruction");
    await audit(supabase, userId, {
      matterId: data.matterId,
      eventType: "clause.instructions_imported",
      entityType: "matter",
      entityId: data.matterId,
      summary: `${rows.length} clause instruction${
        rows.length === 1 ? "" : "s"
      } moved out of browser storage onto the matter record`,
      metadata: { imported: rows.length, offered: data.items.length },
    });
    return { imported: rows.length };
  });
