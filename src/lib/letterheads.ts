import { supabase } from "@/integrations/supabase/client";
import { readPng, UnsupportedImage } from "@/lib/export/pdf-image";

export const LETTERHEAD_BUCKET = "matter-documents";
export const LETTERHEAD_MAX_BYTES = 10 * 1024 * 1024;
/** A4 minus the firm's one-inch side margins, supplied by the DOCX builder. */
export const LETTERHEAD_MAX_WIDTH_EMU = 5_733_415;

export type LetterheadMime = "image/png" | "image/jpeg";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * A strip is an image across the top of page one, as a letter carries its
 * letterhead. Paper is the firm's whole sheet: the design of page one and
 * the mark the pages after it carry — uploaded as the firm's Word template,
 * as a PDF of it, or as a page-sized image.
 */
export type LetterheadKind = "strip" | "page";

export type Letterhead = {
  id: string;
  name: string;
  kind: LetterheadKind;
  /** The strip, or page one of the paper, as an image. */
  storagePath: string;
  mime: LetterheadMime;
  bytes: number;
  widthPx: number;
  heightPx: number;
  /** Pages two onward of the paper, as an image, when the paper has any. */
  continuationPath: string | null;
  /** The file as uploaded — the Word template, or the PDF — kept for the exports. */
  sourcePath: string | null;
  sourceMime: string | null;
  /** Pixel rows of the continuation image the header and footer artwork reach. */
  bodyTopPx: number | null;
  bodyBottomPx: number | null;
  isDefault: boolean;
  updatedAt: string;
};

export type LetterheadUsage = {
  id: string;
  title: string;
  kind: "resolution" | "letter";
};

export type DeleteLetterheadResult =
  { deleted: false; usedBy: LetterheadUsage[] } | { deleted: true; cleanupWarning?: string };

type LetterheadRow = {
  id: string;
  name: string;
  // Plain string, because that is what the column is: letterheads.kind is free
  // text in the database, not a two-value enum. The union is this file's
  // reading of it, applied below where the row becomes a Letterhead.
  kind: string | null;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  width_px: number;
  height_px: number;
  continuation_path: string | null;
  source_path: string | null;
  source_mime: string | null;
  body_top_px: number | null;
  body_bottom_px: number | null;
  is_default: boolean;
  updated_at: string;
};

const COLUMNS =
  "id, name, kind, storage_path, mime_type, byte_size, width_px, height_px, continuation_path, source_path, source_mime, body_top_px, body_bottom_px, is_default, updated_at";

const toLetterhead = (row: LetterheadRow): Letterhead => ({
  id: row.id,
  name: row.name,
  kind: (row.kind as LetterheadKind | null) ?? "strip",
  storagePath: row.storage_path,
  mime: row.mime_type as LetterheadMime,
  bytes: Number(row.byte_size),
  widthPx: row.width_px,
  heightPx: row.height_px,
  continuationPath: row.continuation_path ?? null,
  sourcePath: row.source_path ?? null,
  sourceMime: row.source_mime ?? null,
  bodyTopPx: row.body_top_px ?? null,
  bodyBottomPx: row.body_bottom_px ?? null,
  isDefault: row.is_default,
  updatedAt: row.updated_at,
});

/** What an upload is, by its type or, failing that, its name. */
export const letterheadFileKind = (
  file: Pick<File, "type"> & { name?: string },
): "image" | "pdf" | "docx" | null => {
  const name = file.name ?? "";
  if (file.type === "image/png" || file.type === "image/jpeg") return "image";
  if (file.type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (file.type === DOCX_MIME || /\.docx$/i.test(name)) return "docx";
  return null;
};

export const LETTERHEAD_ACCEPT = `image/png,image/jpeg,application/pdf,${DOCX_MIME},.pdf,.docx`;

export function letterheadFileProblem(
  file: Pick<File, "type" | "size"> & { name?: string },
): string | null {
  if (!letterheadFileKind(file))
    return "Choose your letterhead as a Word template, a PDF, or a PNG or JPEG image.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > LETTERHEAD_MAX_BYTES) return "Choose a file no larger than 10 MB.";
  return null;
}

export const extensionForLetterhead = (mime: LetterheadMime) =>
  mime === "image/png" ? ".png" : ".jpg";

/**
 * Word sizes drawings in English Metric Units. Treat browser image pixels as
 * 96dpi, then reduce wide artwork to the firm's A4 text width without changing
 * its aspect ratio. Smaller artwork is not enlarged.
 */
export function letterheadExtent(
  widthPx: number,
  heightPx: number,
): { widthEmu: number; heightEmu: number } {
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0)
    throw new RangeError("Letterhead dimensions must be positive finite numbers.");
  const naturalWidth = Math.round(widthPx * 9_525);
  const widthEmu = Math.min(naturalWidth, LETTERHEAD_MAX_WIDTH_EMU);
  return {
    widthEmu,
    heightEmu: Math.max(1, Math.round((widthEmu * heightPx) / widthPx)),
  };
}

export async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      if (size.width > 0 && size.height > 0) return size;
    } catch {
      // Safari and a few managed browsers expose createImageBitmap but reject
      // Files. The ordinary Image decoder below handles the same local blob.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? resolve({ width: image.naturalWidth, height: image.naturalHeight })
          : reject(new Error("The image has no readable dimensions."));
      image.onerror = () => reject(new Error("The image could not be read."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * PDF can carry an ordinary RGB PNG directly, but the logo files firms upload
 * are commonly RGBA. Flatten only PNG variants the PDF writer cannot place,
 * on the white paper they will be printed on, and store a JPEG that works in
 * Word and PDF. The upload remains one choice with one result in both formats.
 */
export async function normaliseLetterheadFile(
  file: File,
  width: number,
  height: number,
): Promise<File> {
  if (file.type !== "image/png") return file;
  try {
    readPng(new Uint8Array(await file.arrayBuffer()));
    return file;
  } catch (error) {
    if (!(error instanceof UnsupportedImage)) throw error;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The letterhead image could not be prepared for export.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;
  try {
    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(file);
        context.drawImage(bitmap, 0, 0, width, height);
      } catch {
        bitmap = null;
      }
    }
    if (!bitmap) {
      objectUrl = URL.createObjectURL(file);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("The letterhead image could not be read."));
        element.src = objectUrl!;
      });
      context.drawImage(image, 0, 0, width, height);
    }
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("The letterhead image could not be prepared.")),
      "image/jpeg",
      0.96,
    ),
  );
  if (blob.size > LETTERHEAD_MAX_BYTES)
    throw new Error("The prepared letterhead is larger than 10 MB. Choose smaller artwork.");
  return new File([blob], `${file.name.replace(/\.png$/i, "") || "letterhead"}.jpg`, {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

export async function listLetterheads(workspaceId: string): Promise<Letterhead[]> {
  const { data, error } = await supabase
    .from("letterheads")
    .select(COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LetterheadRow[];
  return Promise.all(rows.map(async (row) => toLetterhead(await withMeasuredReach(row))));
}

/**
 * Paper uploaded before its artwork was measured carries no reach, and an
 * export then has no idea how far the header's logo comes down the page: the
 * GMG paper's PDF put the date and the addressee under its crest. The reach is
 * measured from the stored continuation page, the same way an upload measures
 * it, and saved once so no later export depends on this having run.
 */
async function withMeasuredReach(row: LetterheadRow): Promise<LetterheadRow> {
  if (
    typeof window === "undefined" ||
    row.kind !== "page" ||
    !row.continuation_path ||
    row.body_top_px !== null ||
    row.body_bottom_px !== null
  )
    return row;
  try {
    const stored = await supabase.storage.from(LETTERHEAD_BUCKET).download(row.continuation_path);
    if (stored.error) return row;
    const bitmap = await createImageBitmap(stored.data);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const { measureArtwork } = await import("@/lib/letterhead-raster");
    const reach = measureArtwork(canvas);
    if (reach.bodyTopPx === null && reach.bodyBottomPx === null) return row;
    // The reach is kept in pixels of the stored picture, which is what the
    // export converts from; a picture of another size is scaled to it.
    const scale = row.height_px && bitmap.height ? row.height_px / bitmap.height : 1;
    const measured = {
      body_top_px: reach.bodyTopPx === null ? null : Math.round(reach.bodyTopPx * scale),
      body_bottom_px: reach.bodyBottomPx === null ? null : Math.round(reach.bodyBottomPx * scale),
    };
    // Best effort: somebody who may not write the firm's paper still gets the
    // measured reach on screen, and the next person who may saves it.
    await supabase.from("letterheads").update(measured).eq("id", row.id);
    return { ...row, ...measured };
  } catch {
    return row;
  }
}

export async function uploadLetterhead(
  workspaceId: string,
  file: File,
  name: string,
): Promise<Letterhead> {
  const problem = letterheadFileProblem(file);
  if (problem) throw new Error(problem);
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Give the letterhead a name.");

  const id = crypto.randomUUID();
  const base = `${workspaceId}/letterheads/${id}`;
  const uploaded: string[] = [];
  const put = async (path: string, body: Blob | File, contentType: string) => {
    const { error } = await supabase.storage
      .from(LETTERHEAD_BUCKET)
      .upload(path, body, { contentType, upsert: false });
    if (error) throw new Error(error.message);
    uploaded.push(path);
    return path;
  };

  type Row = {
    kind: LetterheadKind;
    storage_path: string;
    mime_type: string;
    byte_size: number;
    width_px: number;
    height_px: number;
    continuation_path: string | null;
    source_path: string | null;
    source_mime: string | null;
    body_top_px: number | null;
    body_bottom_px: number | null;
  };

  try {
    let row: Row;
    const fileKind = letterheadFileKind(file);
    if (fileKind === "image") {
      const { width, height } = await imageDimensions(file);
      const storedFile = await normaliseLetterheadFile(file, width, height);
      const mime = storedFile.type as LetterheadMime;
      const { looksLikeAPage } = await import("@/lib/letterhead-raster");
      const kind: LetterheadKind = looksLikeAPage(width, height) ? "page" : "strip";
      const path = await put(`${base}${extensionForLetterhead(mime)}`, storedFile, mime);
      row = {
        kind,
        storage_path: path,
        mime_type: mime,
        byte_size: storedFile.size,
        width_px: width,
        height_px: height,
        continuation_path: null,
        source_path: null,
        source_mime: null,
        body_top_px: null,
        body_bottom_px: null,
      };
    } else {
      // The firm's paper as a Word template or a PDF: pictured page by page
      // here in the browser, and kept as uploaded for the exports.
      const raster = await import("@/lib/letterhead-raster");
      const pictures =
        fileKind === "pdf"
          ? await raster.rasterisePdf(file)
          : await raster.composeTemplateRasters(
              await (
                await import("@/lib/export/letterhead-template")
              ).readDocxTemplate(new Uint8Array(await file.arrayBuffer())),
            );
      const sourceMime = fileKind === "pdf" ? "application/pdf" : DOCX_MIME;
      const first = await put(`${base}/first.jpg`, pictures.first, "image/jpeg");
      const continuation = pictures.continuation
        ? await put(`${base}/continuation.jpg`, pictures.continuation, "image/jpeg")
        : null;
      const source = await put(`${base}/source.${fileKind}`, file, sourceMime);
      row = {
        kind: "page",
        storage_path: first,
        mime_type: "image/jpeg",
        byte_size: pictures.first.size,
        width_px: pictures.width,
        height_px: pictures.height,
        continuation_path: continuation,
        source_path: source,
        source_mime: sourceMime,
        body_top_px: pictures.bodyTopPx,
        body_bottom_px: pictures.bodyBottomPx,
      };
    }

    const { count, error: countError } = await supabase
      .from("letterheads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    if (countError) throw new Error(countError.message);

    const { data, error } = await supabase
      .from("letterheads")
      .insert({ id, workspace_id: workspaceId, name: cleanName, is_default: count === 0, ...row })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return toLetterhead(data as LetterheadRow);
  } catch (error) {
    if (uploaded.length) await supabase.storage.from(LETTERHEAD_BUCKET).remove(uploaded);
    throw error;
  }
}

export async function renameLetterhead(id: string, name: string): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Give the letterhead a name.");
  const { error } = await supabase.from("letterheads").update({ name: cleanName }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setDefaultLetterhead(id: string): Promise<void> {
  const { error } = await supabase.from("letterheads").update({ is_default: true }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listLetterheadUsage(id: string): Promise<LetterheadUsage[]> {
  const { data, error } = await supabase
    .from("corporate_documents")
    .select("id, title, kind")
    .eq("letterhead_id", id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LetterheadUsage[];
}

export async function deleteLetterhead(id: string): Promise<DeleteLetterheadResult> {
  const usedBy = await listLetterheadUsage(id);
  if (usedBy.length) return { deleted: false, usedBy };

  const { data, error } = await supabase
    .from("letterheads")
    .delete()
    .eq("id", id)
    .select("storage_path, continuation_path, source_path")
    .maybeSingle();
  if (error) {
    if (error.code === "23503") return { deleted: false, usedBy: await listLetterheadUsage(id) };
    throw new Error(error.message);
  }
  if (!data) throw new Error("That letterhead is no longer available.");

  const { error: cleanupError } = await supabase.storage
    .from(LETTERHEAD_BUCKET)
    .remove(
      [data.storage_path, data.continuation_path, data.source_path].filter((p): p is string => !!p),
    );
  return cleanupError
    ? {
        deleted: true,
        cleanupWarning: `The record was deleted, but its stored image could not be cleaned up: ${cleanupError.message}`,
      }
    : { deleted: true };
}
