import type { DocxLetterhead } from "@/lib/export/docx";
import { readDocxTemplate } from "@/lib/export/letterhead-template";
import type { PdfLetterhead } from "@/lib/export/pdf";
import { HOUSE_PAGE } from "@/lib/house-style";
import {
  DOCX_MIME,
  LETTERHEAD_BUCKET,
  letterheadExtent,
  type LetterheadMime,
} from "@/lib/letterheads";

/**
 * The firm's paper, loaded for an export.
 *
 * One read for both exporters: a strip becomes the header picture each has
 * always taken; paper becomes its page pictures, the reach of its artwork
 * converted from pixels of the picture to twips of the page, and — when the
 * paper was uploaded as the firm's Word template — the template itself, so
 * the Word export can splice the firm's own parts in.
 */

export type Paper = { docx: DocxLetterhead; pdf: PdfLetterhead };

type Row = {
  id: string;
  kind: "strip" | "page" | null;
  storage_path: string;
  mime_type: string;
  width_px: number;
  height_px: number;
  continuation_path: string | null;
  source_path: string | null;
  source_mime: string | null;
  body_top_px: number | null;
  body_bottom_px: number | null;
};

const COLUMNS =
  "id, kind, storage_path, mime_type, width_px, height_px, continuation_path, source_path, source_mime, body_top_px, body_bottom_px";

const isImageMime = (mime: string): mime is LetterheadMime =>
  mime === "image/png" || mime === "image/jpeg";

async function download(supabase: any, path: string): Promise<Uint8Array> {
  const stored = await supabase.storage.from(LETTERHEAD_BUCKET).download(path);
  if (stored.error) throw new Error(stored.error.message);
  return new Uint8Array(await stored.data.arrayBuffer());
}

export async function paperFromRow(supabase: any, row: Row): Promise<Paper> {
  if (!isImageMime(row.mime_type))
    throw new Error("The selected letterhead is not a supported PNG or JPEG image.");
  const bytes = await download(supabase, row.storage_path);
  if (row.kind !== "page") {
    const strip = {
      mode: "strip" as const,
      bytes,
      mime: row.mime_type,
      ...letterheadExtent(row.width_px, row.height_px),
    };
    return { docx: strip, pdf: strip };
  }
  const page = HOUSE_PAGE.contract;
  // The artwork's reach was measured on the picture; the page is in twips.
  const twips = (px: number | null) =>
    px === null ? undefined : Math.round((px / row.height_px) * page.height);
  const continuation = row.continuation_path
    ? { bytes: await download(supabase, row.continuation_path), mime: "image/jpeg" as const }
    : undefined;
  const template =
    row.source_path && row.source_mime === DOCX_MIME
      ? await readDocxTemplate(await download(supabase, row.source_path))
      : undefined;
  const bodyTop = twips(row.body_top_px);
  const bodyBottom = twips(row.body_bottom_px);
  const common = {
    mode: "page" as const,
    bytes,
    mime: row.mime_type,
    widthEmu: page.width * 635,
    heightEmu: page.height * 635,
    ...(continuation ? { continuation } : {}),
    ...(bodyTop !== undefined ? { bodyTop } : {}),
    ...(bodyBottom !== undefined ? { bodyBottom } : {}),
  };
  return { docx: { ...common, ...(template ? { template } : {}) }, pdf: common };
}

/** The paper for a workspace: its default letterhead, when that is paper rather than a strip. */
export async function loadWorkspacePaper(
  supabase: any,
  workspaceId: string,
): Promise<Paper | undefined> {
  const { data, error } = await supabase
    .from("letterheads")
    .select(COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.kind !== "page") return undefined;
  return paperFromRow(supabase, data as Row);
}

/** One letterhead by id, strip or paper. */
export async function loadLetterhead(supabase: any, id: string): Promise<Paper | undefined> {
  const { data, error } = await supabase
    .from("letterheads")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  return paperFromRow(supabase, data as Row);
}
