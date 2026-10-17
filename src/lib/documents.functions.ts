import { createServerFn } from "@tanstack/react-start";
import { bodyToDoc } from "@/lib/parsing/table-doc";
import { textToDoc } from "@/wireframe/clause-doc";
import {
  carryReviewOver,
  matchByWording,
  placeDraftedClauses,
  snapshotReview,
  type OldClause,
} from "@/lib/parsing/carry-review";
import { readsAsContract } from "@/lib/intake";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  blocksToText,
  htmlToBlocks,
  pagesToBlocks,
  textToBlocks,
  type Block,
} from "@/lib/parsing/blocks";
import { splitClauses } from "@/lib/parsing/clauses";
import { buildReview } from "@/lib/parsing/build-review";
import { ACCEPTED_EXT, extOf } from "@/lib/parsing/mime";

const BUCKET = "matter-documents";

export async function extract(
  ext: string,
  buf: ArrayBuffer,
): Promise<{ blocks: Block[]; pageCount: number }> {
  if (!(ACCEPTED_EXT as readonly string[]).includes(ext)) {
    throw new Error(`Unsupported file type ${ext}. Accepted: ${ACCEPTED_EXT.join(", ")}.`);
  }
  if (ext === ".docx") {
    // Read it with its own clause numbers first. Word generates them from
    // numbering.xml at render time, so they are not in the text and mammoth
    // does not resolve them; a contract read through mammoth arrives with no
    // numbers at all and gets renumbered from whatever heading comes first,
    // which on a document with a cover page makes the parties clause 1 and
    // breaks every cross-reference after it. See parsing/docx-blocks.ts.
    try {
      const { blocksFromDocx } = await import("./parsing/docx-blocks");
      const read = await blocksFromDocx(buf);
      // Only trust it where it actually found numbering. A document numbered
      // by hand in the text, or not numbered at all, is better served by
      // mammoth's semantic HTML than by a reading with nothing to add.
      if (read.numbered >= 2) return { blocks: read.blocks, pageCount: read.pageCount };
    } catch {
      // A malformed or unusual .docx falls through to mammoth, which is what
      // read every document before this and still reads most of them well.
    }
    const mammoth = await import("mammoth");
    // mammoth resolves a different unzip implementation per runtime: the browser
    // build reads `arrayBuffer`, the Node build (which server functions use) reads
    // only path/buffer/file and throws "Could not find file in options" otherwise.
    // Passing both keeps one call working in either runtime.
    const { value: html } = await mammoth.convertToHtml({
      arrayBuffer: buf,
      buffer: new Uint8Array(buf),
    } as Parameters<typeof mammoth.convertToHtml>[0]);
    const blocks = htmlToBlocks(html);
    return { blocks, pageCount: 1 };
  }
  if (ext === ".pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [String(text)];
    return { blocks: pagesToBlocks(pages), pageCount: totalPages ?? pages.length };
  }
  const raw = new TextDecoder().decode(buf);
  const blocks = textToBlocks(raw);
  return { blocks, pageCount: Math.max(1, raw.split(/\f/).length) };
}

/**
 * The blocks to split a stored document from — always re-read, for a .docx.
 *
 * This used to skip the re-read whenever the stored blocks already held a
 * table, on the reasoning that the only thing a fresh read could add was
 * tables kept whole. That reasoning aged badly. When the reader learned to
 * resolve Word's clause numbering, a document with a table anywhere in it
 * short-circuited here and went on being split from a parse that had no
 * numbers in it at all — so its cover page stayed clause 1, its clauses
 * stayed one out, and re-preparing the review rebuilt the same wrong
 * register from the same stale blocks. It looked exactly like the fix not
 * working, because from the outside it was.
 *
 * A staleness test that has to be taught about each new kind of improvement
 * will always be one improvement behind. So: read the file, and store the
 * reading when it differs from what was there.
 */
async function currentBlocks(
  supabase: any,
  doc: { id: string; storage_path?: string | null; parsed_blocks: unknown },
): Promise<Block[]> {
  const stored = (doc.parsed_blocks ?? []) as Block[];
  const path = doc.storage_path ?? "";
  if (extOf(path) !== ".docx") return stored;
  const file = await supabase.storage.from(BUCKET).download(path);
  if (file.error || !file.data) return stored;
  const { blocks } = await extract(".docx", await file.data.arrayBuffer());
  // A read that produced nothing is not an improvement on what is stored.
  if (!blocks.length) return stored;
  const changed =
    blocks.length !== stored.length || blocks.some((b, at) => b.text !== stored[at]?.text);
  if (changed)
    await supabase
      .from("documents")
      .update({ parsed_blocks: blocks, parsed_text: blocksToText(blocks) })
      .eq("id", doc.id);
  return blocks;
}

/**
 * Parse an uploaded document into text + a structured block list, then split
 * it into clauses. Idempotent: re-parsing replaces the stored blocks.
 */
export const parseDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      documentId: string;
      /** The kind was guessed from the file name: let the text correct it. */
      reclassify?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error } = await supabase
      .from("documents")
      .select("id, name, kind, matter_id, storage_path, parse_status")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error || !doc) throw new Error("Document not found");
    if (!doc.storage_path) throw new Error("Document has no stored file");

    await supabase
      .from("documents")
      .update({ parse_status: "parsing", parse_error: null })
      .eq("id", doc.id);

    try {
      const file = await supabase.storage.from(BUCKET).download(doc.storage_path);
      if (file.error || !file.data) throw new Error(file.error?.message ?? "Download failed");
      const buf = await file.data.arrayBuffer();
      // Use the storage path for the extension: documents.name is stored with
      // the extension stripped, so extOf(doc.name) yields garbage like "t".
      const { blocks, pageCount } = await extract(extOf(doc.storage_path), buf);
      if (blocks.length === 0) throw new Error("No readable text found in the file");
      const { clauses, structureDetected } = splitClauses(blocks);
      // A kind that was only guessed from the file name gives way to what the
      // document says it is: a services agreement named without "agreement"
      // in a form the guess knew was filed as Reference and never reviewed.
      const text = blocksToText(blocks);
      const kind =
        data.reclassify && doc.kind === "reference" && readsAsContract(text, clauses.length)
          ? "contract"
          : undefined;

      await supabase
        .from("documents")
        .update({
          ...(kind ? { kind } : {}),
          parse_status: "parsed",
          parse_error: null,
          parsed_text: blocksToText(blocks),
          parsed_blocks: blocks,
          page_count: pageCount,
          structure_detected: structureDetected,
          parsed_at: new Date().toISOString(),
        })
        .eq("id", doc.id);

      return {
        ok: true as const,
        clauseCount: clauses.length,
        structureDetected,
        pageCount,
        kind: kind ?? doc.kind,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Parsing failed";
      // Never leave a document stuck in `pending`.
      await supabase
        .from("documents")
        .update({ parse_status: "failed", parse_error: message })
        .eq("id", doc.id);
      return { ok: false as const, error: message };
    }
  });

/**
 * Redline: pair the clauses of an original and an amendment and write the
 * clause + clause_segments rows that drive the Contract Review screen.
 */
export const diffDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; originalId: string; amendmentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: docs, error } = await supabase
      .from("documents")
      .select("id, name, matter_id, storage_path, parsed_blocks, parse_status, structure_detected")
      .in("id", [data.originalId, data.amendmentId]);
    if (error) throw new Error(error.message);

    const original = docs?.find((d) => d.id === data.originalId);
    const amendment = docs?.find((d) => d.id === data.amendmentId);
    if (!original || !amendment) throw new Error("Both documents must exist");
    if (original.parse_status !== "parsed" || amendment.parse_status !== "parsed")
      throw new Error("Both documents must finish parsing first");

    const oClauses = splitClauses(await currentBlocks(supabase, original)).clauses;
    const aClauses = splitClauses(await currentBlocks(supabase, amendment)).clauses;
    const review = buildReview(oClauses, aClauses);

    // Idempotent: the review set is rebuilt from scratch each run.
    await supabase.from("clauses").delete().eq("matter_id", data.matterId);

    for (const c of review) {
      const { data: inserted, error: insErr } = await supabase
        .from("clauses")
        .insert({
          matter_id: data.matterId,
          source_document_id: amendment.id,
          compared_to_document_id: original.id,
          num: c.num,
          title: c.title,
          kind: c.kind ?? null,
          refs: c.refs ?? [],
          change: c.change,
          status: "Open",
          page_ref: c.page,
          diff_summary: c.diffSummary,
          ordinal: c.ordinal,
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw new Error(insErr?.message ?? "Could not write clause");

      if (c.segs.length > 0) {
        const { error: segErr } = await supabase.from("clause_segments").insert(
          c.segs.map((s, i) => ({
            clause_id: inserted.id,
            ordinal: i + 1,
            text: s.t,
            kind: s.k,
          })),
        );
        if (segErr) throw new Error(segErr.message);
      }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();

    await supabase.from("audit_events").insert({
      matter_id: data.matterId,
      actor_id: userId,
      actor_name: profile?.full_name ?? profile?.email ?? "Unknown",
      event_type: "review.generated",
      entity_type: "matter",
      entity_id: data.matterId,
      summary: `Review generated — ${amendment.name} vs ${original.name} · ${review.length} clauses changed`,
      metadata: {
        original_id: original.id,
        amendment_id: amendment.id,
        clause_count: review.length,
      },
    });

    return {
      clauseCount: review.length,
      structureDetected: original.structure_detected && amendment.structure_detected,
    };
  });

/**
 * Review a single contract on its own — no amendment to compare against.
 * Most reviews are of one incoming draft, so this cannot depend on a diff.
 * Writes one clause per detected clause with a single unchanged segment, so
 * Contract Review, analysis and export all work on a baseline document.
 */

/**
 * The gap left between two document clauses in the register's ordering, so a
 * clause drafted here can be placed between them without every ordinal after
 * it having to move. An ordinal is an ordering and never a count.
 */
const ORDINAL_SPACING = 10;

export const extractClauses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; documentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc, error } = await supabase
      .from("documents")
      .select("id, name, matter_id, storage_path, parsed_blocks, parse_status")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error || !doc) throw new Error("Document not found");
    if (doc.parse_status !== "parsed") throw new Error("The document must finish parsing first");

    const { clauses, structureDetected } = splitClauses(await currentBlocks(supabase, doc));
    if (clauses.length === 0) throw new Error("No clauses could be found in this document");

    // What the review has recorded so far, read before the delete takes it.
    const before = await snapshotReview(supabase, data.matterId);
    /* Only the document's own clauses are matched against the document. A
       clause we drafted is not in the file and must not claim one that is. */
    const carry = matchByWording(
      before.clauses.filter((c) => !c.draftedHere),
      clauses.map((c) => ({ num: c.num, text: c.body })),
    );
    const kept: { newId: string; was: OldClause }[] = [];

    /* Idempotent: the register is rebuilt from the document each run — except
       for the clauses a lawyer drafted here, which the document knows nothing
       about. Those rows are kept as they are, with their wording, their
       assessments and the findings against them, and are put back into place
       below. */
    await supabase
      .from("clauses")
      .delete()
      .eq("matter_id", data.matterId)
      .eq("drafted_here", false);

    /* How each clause arrived, so the first change to it has something to be
       read against. Written after the register is built, in one insert. */
    const asRead: { clause_id: string; doc: unknown; kind: "baseline" }[] = [];

    for (const [at, c] of clauses.entries()) {
      const was = carry.matched.get(at);
      /**
       * A clause that reads the same and is numbered the same is the same
       * clause, so it keeps the date it entered the register. That date is
       * what tells a finding whether it was written against this wording or
       * against an earlier reading — so a renumbered clause deliberately
       * takes a fresh one, because a finding citing its old number does need
       * reading again with that in mind.
       */
      const sameClause = was && was.num === c.num && was.createdAt ? was.createdAt : null;
      const { data: inserted, error: insErr } = await supabase
        .from("clauses")
        .insert({
          ...(sameClause ? { created_at: sameClause } : {}),
          matter_id: data.matterId,
          source_document_id: doc.id,
          compared_to_document_id: null,
          num: c.num,
          title: c.title,
          kind: c.kind ?? null,
          refs: (c.refs ?? []) as never,
          // A clause that holds a table keeps it as a table: the grid is how
          // the editor shows it and how Word receives it. The title page brings
          // its own document, because centring cannot be said in plain text.
          doc: (c.doc ?? bodyToDoc(c.body)) as never,
          change: null,
          status: "Open",
          page_ref: c.page,
          diff_summary: null,
          /* Spaced, so a clause drafted here can sit between two of the
             document's own without the whole register being shifted.
             Ordinals are an ordering, never a count. */
          ordinal: at * ORDINAL_SPACING,
          // Last, so what the review recorded about this wording wins over the
          // blanks a fresh reading would otherwise write — including `status`.
          ...(was?.review ?? {}),
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw new Error(insErr?.message ?? "Could not write clause");
      const { error: segErr } = await supabase
        .from("clause_segments")
        .insert({ clause_id: inserted.id, ordinal: 1, text: c.body, kind: "n" });
      if (segErr) throw new Error(segErr.message);
      if (was) kept.push({ newId: inserted.id, was });
      /* A clause whose history came with it already has a starting point; one
         read for the first time gets the version it was read as.

         `bodyToDoc` is for tables and returns null for ordinary wording — most
         clauses have no document at all until somebody edits them — so the
         baseline is built from the text. A clause with neither gets none: a
         version of nothing is not a version. */
      const asReadDoc = c.doc ?? bodyToDoc(c.body) ?? (c.body.trim() ? textToDoc(c.body) : null);
      if (asReadDoc && (!was || !(before.revisions.get(was.id) ?? []).length))
        asRead.push({ clause_id: inserted.id, doc: asReadDoc, kind: "baseline" });
    }

    if (asRead.length) {
      const { error: baseErr } = await supabase.from("clause_revisions").insert(asRead as never);
      if (baseErr) throw new Error(baseErr.message);
    }

    const carriedAssessments = await carryReviewOver(
      supabase,
      data.matterId,
      kept,
      before.assessments,
      before.revisions,
    );

    /* Our own clauses back into place: after the clause each one used to
       follow, found by wording so the insertion survives the renumbering that
       the re-read was asked for. */
    const draftedBack = placeDraftedClauses(before.clauses, carry.matched, ORDINAL_SPACING);
    for (const row of draftedBack)
      await supabase.from("clauses").update({ ordinal: row.ordinal }).eq("id", row.id);

    await supabase
      .from("documents")
      .update({ structure_detected: structureDetected })
      .eq("id", doc.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    await supabase.from("audit_events").insert({
      matter_id: data.matterId,
      actor_id: userId,
      actor_name: profile?.full_name ?? profile?.email ?? "Unknown",
      event_type: "review.extracted",
      entity_type: "matter",
      entity_id: data.matterId,
      summary:
        `Review prepared — ${doc.name} · ${clauses.length} clauses extracted` +
        (kept.length
          ? `, ${kept.length} kept from the previous reading (${carriedAssessments} assessment${
              carriedAssessments === 1 ? "" : "s"
            })`
          : ""),
      metadata: {
        document_id: doc.id,
        clause_count: clauses.length,
        structure_detected: structureDetected,
        clauses_kept: kept.length,
        assessments_carried: carriedAssessments,
        clauses_renumbered: carry.renumbered,
        clauses_to_read: carry.unmatched,
        clauses_drafted_here: draftedBack.length,
      },
    });

    return {
      clauseCount: clauses.length,
      structureDetected,
      /** Clauses whose wording was unchanged, so their assessment was kept. */
      kept: kept.length,
      assessmentsCarried: carriedAssessments,
      /** Kept, but numbered differently now — so any prose citing the old
       *  number needs reading with that in mind. */
      renumbered: carry.renumbered,
      /** What still needs reading: everything the previous reading did not
       *  already cover. */
      toRead: carry.unmatched,
      /** Clauses drafted here, which the document does not contain and which
       *  were kept and put back into place. */
      drafted: draftedBack.length,
    };
  });

/**
 * Delete a document: the stored file, its cached thumbnails, and the row.
 * References are kept but unlinked (clauses/transcripts FKs are SET NULL),
 * so a review built from the document keeps its text and history. Always
 * confirmed by the user first, and always audited.
 */
export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { documentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc, error } = await supabase
      .from("documents")
      .select("id, name, matter_id, storage_path, kind")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error || !doc) throw new Error("Document not found");

    if (doc.storage_path) {
      const dir = doc.storage_path.replace(/\/[^/]+$/, "");
      const { data: thumbs } = await supabase.storage.from(BUCKET).list(`${dir}/.thumbs`);
      const targets = [
        doc.storage_path,
        ...(thumbs ?? [])
          .filter((t) => t.name.startsWith(`${doc.id}-`))
          .map((t) => `${dir}/.thumbs/${t.name}`),
      ];
      // Best effort: a missing file must not block removing the record.
      await supabase.storage.from(BUCKET).remove(targets);
    }

    const { error: delErr } = await supabase.from("documents").delete().eq("id", doc.id);
    if (delErr) throw new Error(delErr.message);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();

    await supabase.from("audit_events").insert({
      matter_id: doc.matter_id,
      actor_id: userId,
      actor_name: profile?.full_name ?? profile?.email ?? "Unknown",
      event_type: "document.deleted",
      entity_type: "document",
      entity_id: doc.id,
      summary: `Document "${doc.name}" deleted — parsed content keeps its text but loses the source link`,
      metadata: { name: doc.name, kind: doc.kind },
    });

    return { ok: true };
  });
