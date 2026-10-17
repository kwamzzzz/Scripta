import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildCleanDocx, buildDocx, type ExportClause, type SegKind } from "@/lib/export/docx";
import { asDoc } from "@/wireframe/clause-doc";
import { docToParas } from "@/wireframe/marks-to-segments";
import { buildCleanPdf, buildPdf, tableOfContents } from "@/lib/export/pdf";
import { loadWorkspacePaper } from "@/lib/letterhead-paper.server";
import { sectionOf } from "@/lib/subclauses";
import {
  buildFrontMatter,
  frontMatterSource,
  readFrontMatterEdits,
  type FrontMatterEdits,
} from "@/lib/export/front-matter";

export type ExportKind = "redline" | "clean";
export type ExportFormat = "docx" | "pdf";

const MIME: Record<ExportFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

const b64 = (buf: Uint8Array) => {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "matter";

/**
 * Export a matter's review as a Word document or a PDF.
 *
 * In `docx`, `redline` carries genuine <w:ins>/<w:del> revisions that Word lets
 * a lawyer accept or reject natively. A PDF has no revision model, so its
 * redline is the printed convention — insertions underlined, deletions struck —
 * which makes it the copy to read and circulate rather than the one to edit.
 * `clean` is the accept-all result in either format.
 */
/**
 * The document, once, for whoever needs it.
 *
 * The preview and the downloaded file are built from this one read. Drawing
 * the preview from the editor's state and the file from the database would
 * let them disagree, and a preview that can disagree with the file is worse
 * than no preview: it is a check that passes when it should not.
 */
const bareNum = (num: string) => (num ?? "").trim().replace(/\.$/, "");

async function loadDocument(supabase: any, matterId: string) {
  const { data: matter, error: mErr } = await supabase
    .from("matters")
    .select(
      "id, workspace_id, name, client, counterparty, stage, matter_type, target_date, created_at, front_matter, use_letterhead",
    )
    .eq("id", matterId)
    .single();
  if (mErr || !matter) throw new Error(mErr?.message ?? "Matter not found");

  const { data: clauses, error: cErr } = await supabase
    .from("clauses")
    .select("id, num, title, ordinal, parts_numbered, doc, clause_segments(ordinal, text, kind)")
    .eq("matter_id", matterId)
    .order("ordinal", { ascending: true });
  if (cErr) throw new Error(cErr.message);

  /**
   * Sections that print their parts without numbers.
   *
   * The flag is set on the section, and it reaches its parts through `num` —
   * the tree, as it has always been. It applies to every part of the section
   * rather than only the rows marked as definitions: a section that numbers
   * 1.1 and then shows the next three provisions as bare blocks does not read
   * as a drafting choice, it reads as a mistake.
   */
  const plain = new Set(
    (clauses ?? []).filter((c: any) => c.parts_numbered === false).map((c: any) => bareNum(c.num)),
  );
  const unnumbered = (num: string) => {
    const bare = bareNum(num);
    // The section itself keeps its number; only what sits under it loses one.
    return bare !== sectionOf(bare) && plain.has(sectionOf(bare));
  };

  /**
   * The names, for Word's own revision author.
   *
   * One read for the whole document. A marked-up contract where every change
   * says "Scripta" in the margin has thrown away the thing Phase 5 was built
   * to keep, at exactly the moment it matters most — when the counterparty
   * opens the file.
   */
  const { data: team } = await supabase
    .from("matter_members")
    .select("user_id, profiles(full_name, email)")
    .eq("matter_id", matterId);
  const names = new Map<string, string>(
    (team ?? []).map((m: any) => [
      m.user_id as string,
      (m.profiles?.full_name || m.profiles?.email || "A colleague") as string,
    ]),
  );
  const nameOf = (authorId: string) =>
    authorId === "migrated" ? "Before Scripta" : (names.get(authorId) ?? "A colleague");

  /**
   * THE DOCUMENT WINS.
   *
   * This used to read `clause_segments` alone. Step 2 of Phase 5 established
   * that those are a lossy shadow of the document — clause 1.5's table proved
   * it, and the migration was rewritten so the document governs. An export that
   * still read the shadow would be the one place where the shadow was still
   * authoritative, and it is the place the counterparty actually sees.
   *
   * Segments remain the fallback for a clause that has no document, which is a
   * clause the step 2 migration declined to convert. Those are exported exactly
   * as they were before.
   */
  const exportClauses: ExportClause[] = (clauses ?? []).map((c: any) => {
    const doc = asDoc(c.doc);
    const paras = doc ? docToParas(doc, nameOf) : [];
    return {
      num: c.num,
      title: c.title,
      ...(unnumbered(c.num) ? { unnumbered: true } : {}),
      ...(paras.length ? { paras } : {}),
      segs: [...(c.clause_segments ?? [])]
        .sort((a: any, b: any) => a.ordinal - b.ordinal)
        .map((s: any) => ({ t: s.text as string, k: s.kind as SegKind })),
    };
  });

  const edits = readFrontMatterEdits(matter.front_matter);

  return {
    title: matter.name as string,
    subtitle: [matter.client, matter.counterparty].filter(Boolean).join(" · "),
    clauses: exportClauses,
    // The matter's own record, corrected by whatever the lawyer typed on the
    // first page. Anything neither holds — an address, why the parties are
    // contracting — arrives as a named placeholder, never as something the app
    // made up.
    front: buildFrontMatter(
      frontMatterSource(
        {
          agreementType: (matter.matter_type as string) || "Agreement",
          client: (matter.client as string) ?? "",
          counterparty: (matter.counterparty as string) ?? "",
          date: (matter.target_date as string) || "",
        },
        edits,
      ),
    ),
    frontMatterEdits: edits,
    workspaceId: matter.workspace_id as string,
    /** Null means nobody has said, which is on — what every contract did. */
    useLetterhead: (matter as { use_letterhead?: boolean | null }).use_letterhead ?? true,
  };
}

/** The clauses behind the preview. Same read, same rows, same order. */
export const loadMatterExport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const loaded = await loadDocument(supabase, data.matterId);
    /**
     * Whether there is a letterhead at all, so the screen offers the choice
     * only where there is one to make.
     *
     * A METADATA READ, NOT THE PAPER. This used to call `loadWorkspacePaper`,
     * which downloads the page image, the continuation image and the firm's
     * Word template and then unzips the template — three storage round trips
     * and a zip parse, to decide a boolean. It cost 3.6 seconds on a warm
     * machine and, on the deployed worker, long enough that the request never
     * came back: the Final tab sat on "Loading…", and because the query has no
     * retry it stayed there, showing an empty document with no letterhead
     * control and no preview. The paper itself is loaded by the export, which
     * is the call that actually needs it.
     */
    const { data: paper, error: paperErr } = await supabase
      .from("letterheads")
      .select("id")
      .eq("workspace_id", loaded.workspaceId)
      .eq("is_default", true)
      .eq("kind", "page")
      .limit(1)
      .maybeSingle();
    if (paperErr) throw new Error(paperErr.message);
    return { ...loaded, hasLetterhead: !!paper, useLetterhead: loaded.useLetterhead };
  });

/** Save the first page. Blank fields are dropped, so clearing one restores the
 *  value derived from the matter rather than emptying the contract. */
export const saveFrontMatter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string; edits: FrontMatterEdits }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const kept = Object.fromEntries(
      Object.entries(data.edits).filter(([, v]) =>
        Array.isArray(v)
          ? v.some((line) => line.trim())
          : typeof v === "number"
            ? Number.isFinite(v)
            : typeof v === "string" && v.trim(),
      ),
    );
    const { error } = await supabase
      .from("matters")
      // The generated types do not yet carry front_matter; the column is jsonb
      // and the shape is checked by readFrontMatterEdits on the way back out.
      .update({ front_matter: kept, updated_at: new Date().toISOString() } as never)
      .eq("id", data.matterId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const exportMatterDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      matterId: string;
      kind: ExportKind;
      format: ExportFormat;
      /**
       * Print it on the firm's paper. Default true, which is what every export
       * did before there was a choice — a contract going to a client normally
       * wants the letterhead, and the ones that do not are the exception.
       */
      letterhead?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const loaded = await loadDocument(supabase, data.matterId);
    const matter = { name: loaded.title };
    const exportClauses = loaded.clauses;
    if (exportClauses.length === 0)
      throw new Error("This matter has no review to export yet. Generate a review first.");

    const isRedline = data.kind === "redline";
    // The firm's paper, when the workspace has one: page one's design behind
    // the cover, the continuation behind every page after it.
    // The choice was made in the editor. The finalising screen can still
    // override it for one download, but it does not have to ask again.
    const wanted = data.letterhead ?? loaded.useLetterhead;
    const paper =
      wanted === false ? undefined : await loadWorkspacePaper(supabase, loaded.workspaceId);
    const opts = {
      title: loaded.title,
      subtitle: loaded.subtitle,
      clauses: exportClauses,
      front: loaded.front,
      kind: "contract" as const,
      author: "Scripta",
      date: new Date().toISOString(),
    };
    const forPdf = paper ? { ...opts, letterhead: paper.pdf } : opts;
    const forDocx = paper ? { ...opts, letterhead: paper.docx } : opts;

    // The Word copy cannot know its own pagination until Word opens it, so
    // its table of contents is cached from the PDF layout of the same text and
    // marked for Word to refresh.
    const bytes =
      data.format === "pdf"
        ? (isRedline ? buildPdf : buildCleanPdf)(forPdf)
        : (isRedline ? buildDocx : buildCleanDocx)({
            ...forDocx,
            toc: tableOfContents(forPdf, isRedline),
          });
    const filename = `${slug(matter.name)}-${isRedline ? "redline" : "clean"}.${data.format}`;

    await supabase.from("audit_events").insert({
      matter_id: data.matterId,
      actor_id: userId,
      event_type: "document.exported",
      entity_type: "matter",
      entity_id: data.matterId,
      summary: `Exported ${isRedline ? "redlined" : "clean"} ${
        data.format === "pdf" ? "PDF" : "Word document"
      }`,
      metadata: {
        kind: data.kind,
        format: data.format,
        clauses: exportClauses.length,
        filename,
      },
    });

    return {
      filename,
      base64: b64(bytes),
      mime: MIME[data.format],
      clauses: exportClauses.length,
    };
  });
