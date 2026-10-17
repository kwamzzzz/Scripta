/**
 * Files attached to a matter's work.
 *
 * These used to be written to the browser's IndexedDB "until the storage bucket
 * write exists". That was tolerable while Scripta had one user and one browser,
 * and it is not tolerable in a firm: an attachment kept in your browser is a
 * chip a colleague can see and a file they cannot open, which is worse than
 * having no attachment at all. So `putFile` writes to the bucket.
 *
 * WHERE a file goes matters as much as that it is saved. The path is
 * `<workspace>/<matter>/<file>`, which is the layout the bucket already uses for
 * matter documents, and which lets the Phase 3 storage policy read the matter
 * out of the second path segment and gate on membership without a single file
 * being moved. A file with no matter — an attachment on a personal task — goes
 * to `<workspace>/personal/<user>/<file>` instead, where "personal" is a
 * literal that can never be mistaken for a matter id. A file in a flow that is
 * not filed to a matter goes to `<workspace>/flows/<flow>/<file>`, which the
 * storage policy answers by asking the flow — so when the flow is later filed,
 * its files answer to the matter without being moved.
 *
 * READING still understands everything it ever did: `idb:` refs, object, https
 * and data URLs, and storage paths. Nothing that was stored before stops
 * opening. Only the write path changed.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DB = "px-flow-files";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
}

export const isIdbRef = (ref: string | null | undefined): ref is string =>
  !!ref && ref.startsWith("idb:");

/**
 * Where a file belongs.
 *
 * Required rather than optional, deliberately. An optional home would mean a
 * call site that forgot one quietly wrote to the browser again, and the whole
 * point of this change is that such a thing can no longer happen by accident.
 */
export type FileHome = {
  workspaceId: string;
  /** The matter this file belongs to, where it belongs to one. */
  matterId?: string | null;
  /** The flow it was attached in, when that flow is filed to no matter. */
  flowId?: string | null;
  /** Whose it is, when it belongs to no matter. */
  userId?: string | null;
};

/* Object keys are not filenames: a space or a comma is enough for a signed URL
   to come back with the wrong thing. The readable name is kept on the record
   beside the ref, so nothing is lost by scrubbing it here. */
const slug = (name: string) =>
  (name || "file")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-60) || "file";

export function filePath(home: FileHome, id: string, name: string): string {
  if (home.matterId) return `${home.workspaceId}/${home.matterId}/${id}-${slug(name)}`;
  if (home.flowId) return `${home.workspaceId}/flows/${home.flowId}/${id}-${slug(name)}`;
  return `${home.workspaceId}/personal/${home.userId ?? "unfiled"}/${id}-${slug(name)}`;
}

/**
 * Store a file and return the fileRef to keep on the record.
 *
 * Throws rather than falling back to the browser. A silent local write is how
 * this went wrong the first time: the upload looks like it worked, the record
 * saves, and the file is discovered to be missing weeks later by somebody else.
 */
export async function putFile(
  id: string,
  file: Blob,
  name: string | undefined,
  home: FileHome,
): Promise<string> {
  const label = name ?? (file as File).name ?? id;
  const path = filePath(home, id, label);
  const { error } = await supabase.storage.from("matter-documents").upload(path, file, {
    upsert: true,
    ...(file.type ? { contentType: file.type } : {}),
  });
  if (error) throw new Error(`${label} could not be saved: ${error.message}`);
  return path;
}

/** Reads a file written by an earlier version of Scripta, from this browser. */
export async function getFile(ref: string): Promise<{ blob: Blob; name: string } | null> {
  const id = ref.replace(/^idb:/, "");
  const db = await openDb();
  const row = await new Promise<{ blob: Blob; name: string } | undefined>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as { blob: Blob; name: string } | undefined);
    req.onerror = () => reject(req.error ?? new Error("Could not read the file"));
  });
  db.close();
  return row ?? null;
}

/** Bytes behind any fileRef: IndexedDB, object/https/data URLs, or a storage path. */
export async function loadFileBytes(fileRef: string): Promise<ArrayBuffer> {
  if (isIdbRef(fileRef)) {
    const row = await getFile(fileRef);
    if (!row) throw new Error("The file is no longer in this browser");
    return row.blob.arrayBuffer();
  }
  if (/^(blob:|https?:|data:)/.test(fileRef)) {
    const res = await fetch(fileRef);
    if (!res.ok) throw new Error("Could not read the file");
    return res.arrayBuffer();
  }
  const { data, error } = await supabase.storage.from("matter-documents").download(fileRef);
  if (error) throw error;
  return data.arrayBuffer();
}

/** A URL the browser can open or download for this fileRef; object URLs must be revoked by the caller. */
export async function resolveFileUrl(
  fileRef: string,
): Promise<{ url: string; name?: string; revoke: boolean } | null> {
  if (isIdbRef(fileRef)) {
    const row = await getFile(fileRef);
    return row ? { url: URL.createObjectURL(row.blob), name: row.name, revoke: true } : null;
  }
  if (/^(blob:|https?:|data:)/.test(fileRef)) return { url: fileRef, revoke: false };
  const { data, error } = await supabase.storage
    .from("matter-documents")
    .createSignedUrl(fileRef, 600);
  if (error) return null;
  return { url: data.signedUrl, revoke: false };
}

/** Object URL for a fileRef, for links; revoked when the ref changes. */
export function useFileUrl(fileRef: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fileRef) {
      setUrl(null);
      return;
    }
    let revoke: string | null = null;
    let cancelled = false;
    resolveFileUrl(fileRef)
      .then((r) => {
        if (cancelled || !r) return;
        if (r.revoke) revoke = r.url;
        setUrl(r.url);
      })
      .catch(() => setUrl(null));
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [fileRef]);
  return url;
}

/** Trigger a browser download of a fileRef. */
export async function downloadFile(fileRef: string, fallbackName: string) {
  const r = await resolveFileUrl(fileRef);
  if (!r) return;
  const a = document.createElement("a");
  a.href = r.url;
  a.download = r.name ?? fallbackName;
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (r.revoke) window.setTimeout(() => URL.revokeObjectURL(r.url), 10_000);
}
