/**
 * The Library: the firm's research material — statutes, regulations, cases,
 * treaties, books, articles, websites, guidance, reports — kept with enough
 * about each to find it again and to know whether it can still be relied on.
 *
 * Firm knowledge by default: the workspace reads every shared source and any
 * writer may improve one. A source marked private is its author's alone, and
 * so is its file, which lives on the author's personal path until the source
 * is shared. Collections are shared shelves; a source may sit on several.
 */
import { supabase } from "@/integrations/supabase/client";

/* ----------------------------------------------------------------- kinds */

export type SourceKind =
  | "statute"
  | "regulation"
  | "case"
  | "treaty"
  | "book"
  | "article"
  | "website"
  | "guidance"
  | "report"
  | "other";

/**
 * What each kind is called, and what its fields mean for it: a case is
 * decided by a court and reported in a reporter; a book is written by an
 * author and published by a publisher; a statute is enacted by a legislature.
 */
export const SOURCE_KINDS: {
  id: SourceKind;
  label: string;
  plural: string;
  authors: string;
  publisher: string;
  issued: string;
  citation: string;
  /** Whether "in force / repealed" and "binding / persuasive" mean anything for it. */
  legal: boolean;
}[] = [
  {
    id: "statute",
    label: "Statute",
    plural: "Statutes",
    authors: "Enacted by",
    publisher: "Gazette or source",
    issued: "Enacted / in force",
    citation: "Citation, e.g. Act 992",
    legal: true,
  },
  {
    id: "regulation",
    label: "Regulation",
    plural: "Regulations",
    authors: "Made by",
    publisher: "Gazette or source",
    issued: "Made / in force",
    citation: "Citation, e.g. L.I. 2432",
    legal: true,
  },
  {
    id: "case",
    label: "Case",
    plural: "Case law",
    authors: "Court",
    publisher: "Law report",
    issued: "Decided",
    citation: "Citation, e.g. [2019] GHASC 12",
    legal: true,
  },
  {
    id: "treaty",
    label: "Treaty",
    plural: "Treaties & conventions",
    authors: "Parties or body",
    publisher: "Depositary or source",
    issued: "Signed / in force",
    citation: "Reference",
    legal: true,
  },
  {
    id: "book",
    label: "Book",
    plural: "Books",
    authors: "Author(s)",
    publisher: "Publisher",
    issued: "Edition / year",
    citation: "ISBN or reference",
    legal: false,
  },
  {
    id: "article",
    label: "Article",
    plural: "Articles",
    authors: "Author(s)",
    publisher: "Journal or publication",
    issued: "Published",
    citation: "Volume, issue, pages",
    legal: false,
  },
  {
    id: "website",
    label: "Website",
    plural: "Websites",
    authors: "Author or organisation",
    publisher: "Site",
    issued: "Published or accessed",
    citation: "Reference",
    legal: false,
  },
  {
    id: "guidance",
    label: "Guidance",
    plural: "Guidance & practice notes",
    authors: "Issued by",
    publisher: "Source",
    issued: "Issued",
    citation: "Reference",
    legal: true,
  },
  {
    id: "report",
    label: "Report",
    plural: "Reports",
    authors: "Author or body",
    publisher: "Publisher",
    issued: "Published",
    citation: "Reference",
    legal: false,
  },
  {
    id: "other",
    label: "Other",
    plural: "Other",
    authors: "Author or body",
    publisher: "Publisher or source",
    issued: "Date",
    citation: "Reference",
    legal: false,
  },
];

export const kindInfo = (kind: SourceKind) =>
  SOURCE_KINDS.find((k) => k.id === kind) ?? SOURCE_KINDS[SOURCE_KINDS.length - 1]!;

/** The kind as the writer named it: their own word for an "other", else the kind's. */
export const kindName = (s: Pick<LibrarySource, "kind" | "kindLabel">) =>
  (s.kind === "other" && s.kindLabel.trim()) || kindInfo(s.kind).label;

/** The heading a kind's group carries. */
export const kindGroup = (s: Pick<LibrarySource, "kind" | "kindLabel">) =>
  (s.kind === "other" && s.kindLabel.trim()) || kindInfo(s.kind).plural;

export const SOURCE_STATUSES = ["current", "repealed", "superseded", "unverified"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];
export const STATUS_NAME: Record<SourceStatus, string> = {
  current: "Current",
  repealed: "Repealed",
  superseded: "Superseded",
  unverified: "Unable to verify",
};
export const SOURCE_WEIGHTS = ["binding", "persuasive"] as const;
export type SourceWeight = (typeof SOURCE_WEIGHTS)[number];
export const WEIGHT_NAME: Record<SourceWeight, string> = {
  binding: "Binding",
  persuasive: "Persuasive",
};

/* ----------------------------------------------------------------- shapes */

export type LibraryCollection = {
  id: string;
  name: string;
  description: string;
  position: number;
  archivedAt: string | null;
};

export type LibrarySource = {
  id: string;
  kind: SourceKind;
  kindLabel: string;
  title: string;
  citation: string;
  authors: string;
  publisher: string;
  jurisdiction: string;
  issued: string;
  status: SourceStatus | null;
  weight: SourceWeight | null;
  url: string;
  file: { path: string; name: string; mime: string; bytes: number } | null;
  topics: string[];
  notes: string;
  private: boolean;
  collectionIds: string[];
  createdBy: string;
  authorName: string;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type SourceDraft = Pick<
  LibrarySource,
  | "kind"
  | "kindLabel"
  | "title"
  | "citation"
  | "authors"
  | "publisher"
  | "jurisdiction"
  | "issued"
  | "status"
  | "weight"
  | "url"
  | "topics"
  | "notes"
  | "private"
  | "collectionIds"
>;

export const emptyDraft = (collectionIds: string[] = []): SourceDraft => ({
  kind: "statute",
  kindLabel: "",
  title: "",
  citation: "",
  authors: "",
  publisher: "",
  jurisdiction: "",
  issued: "",
  status: null,
  weight: null,
  url: "",
  topics: [],
  notes: "",
  private: false,
  collectionIds,
});

/* ---------------------------------------------------------------- helpers */

/** A link as typed, made openable: "legislation.gov.gh/act992" gains https://. */
export function normaliseUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) || url.startsWith("mailto:")) return url;
  return `https://${url}`;
}

/** The site a link points at, for a row that has no room for the whole address. */
export function hostOf(url: string): string {
  try {
    return new URL(normaliseUrl(url)).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Topics as typed ("tax, VAT;  free zones") into a clean, de-duplicated list. */
export function parseTopics(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]/)) {
    const topic = part.trim().replace(/\s+/g, " ");
    const key = topic.toLowerCase();
    if (topic && !seen.has(key)) {
      seen.add(key);
      out.push(topic);
    }
  }
  return out;
}

/** Everything a search should reach, in one lower-case string. */
export const sourceSearchText = (s: LibrarySource, collections: LibraryCollection[]) =>
  [
    s.title,
    s.citation,
    s.authors,
    s.publisher,
    s.jurisdiction,
    s.issued,
    kindName(s),
    s.status ? STATUS_NAME[s.status] : "",
    s.weight ? WEIGHT_NAME[s.weight] : "",
    s.url,
    s.file?.name ?? "",
    s.topics.join(" "),
    s.notes,
    s.authorName,
    collections
      .filter((c) => s.collectionIds.includes(c.id))
      .map((c) => c.name)
      .join(" "),
  ]
    .join(" ")
    .toLowerCase();

/** Where a source's file belongs: the workspace's library, or its author's own path while private. */
export const libraryFilePath = (
  workspaceId: string,
  userId: string,
  sourceId: string,
  fileName: string,
  isPrivate: boolean,
) => {
  const safe =
    fileName
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-80) || "file";
  return isPrivate
    ? `${workspaceId}/personal/${userId}/library/${sourceId}/${safe}`
    : `${workspaceId}/library/${sourceId}/${safe}`;
};

/* ------------------------------------------------------------------- data */

const BUCKET = "matter-documents";

export const libraryKey = (workspaceId: string | null) => ["library", workspaceId];

export async function loadLibrary(
  workspaceId: string,
  userId: string,
): Promise<{ sources: LibrarySource[]; collections: LibraryCollection[] }> {
  const [sources, collections, links] = await Promise.all([
    supabase
      .from("library_sources")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("library_collections")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("position")
      .order("name"),
    supabase
      .from("library_source_collections")
      .select("source_id, collection_id")
      .eq("workspace_id", workspaceId),
  ]);
  for (const r of [sources, collections, links]) if (r.error) throw new Error(r.error.message);
  const rows = sources.data ?? [];
  const byUser = new Map<string, string>();
  const people = [...new Set(rows.map((r) => r.created_by))];
  if (people.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", people);
    for (const p of data ?? [])
      byUser.set(p.id, (p.full_name as string | null) || (p.email as string | null) || "Someone");
  }
  const shelves = new Map<string, string[]>();
  for (const l of links.data ?? [])
    shelves.set(l.source_id, [...(shelves.get(l.source_id) ?? []), l.collection_id]);
  return {
    collections: (collections.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? "",
      position: c.position ?? 0,
      archivedAt: c.archived_at,
    })),
    sources: rows.map((r) => ({
      id: r.id,
      kind: (SOURCE_KINDS.some((k) => k.id === r.kind) ? r.kind : "other") as SourceKind,
      kindLabel: r.kind_label ?? "",
      title: r.title,
      citation: r.citation ?? "",
      authors: r.authors ?? "",
      publisher: r.publisher ?? "",
      jurisdiction: r.jurisdiction ?? "",
      issued: r.issued ?? "",
      status: (r.status as SourceStatus | null) ?? null,
      weight: (r.weight as SourceWeight | null) ?? null,
      url: r.url ?? "",
      file: r.file_path
        ? {
            path: r.file_path,
            name: r.file_name ?? "file",
            mime: r.file_mime ?? "application/octet-stream",
            bytes: Number(r.file_bytes ?? 0),
          }
        : null,
      topics: r.topics ?? [],
      notes: r.notes ?? "",
      private: !!r.private,
      collectionIds: shelves.get(r.id) ?? [],
      createdBy: r.created_by,
      authorName: byUser.get(r.created_by) ?? "Someone",
      mine: r.created_by === userId,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      archivedAt: r.archived_at,
    })),
  };
}

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const row = (d: SourceDraft) => {
  const title = d.title.trim();
  if (!title) throw new Error("A source needs a title.");
  const legal = kindInfo(d.kind).legal;
  return {
    kind: d.kind,
    kind_label: d.kind === "other" ? d.kindLabel.trim() : "",
    title,
    citation: d.citation.trim(),
    authors: d.authors.trim(),
    publisher: d.publisher.trim(),
    jurisdiction: d.jurisdiction.trim(),
    issued: d.issued.trim(),
    status: legal ? d.status : null,
    weight: legal ? d.weight : null,
    url: normaliseUrl(d.url),
    topics: d.topics,
    notes: d.notes.replace(/\s+$/, ""),
    private: d.private,
  };
};

async function syncCollections(
  workspaceId: string,
  sourceId: string,
  want: string[],
  had: string[],
) {
  const add = want.filter((id) => !had.includes(id));
  const drop = had.filter((id) => !want.includes(id));
  if (add.length)
    fail(
      (
        await supabase.from("library_source_collections").insert(
          add.map((collection_id) => ({
            workspace_id: workspaceId,
            source_id: sourceId,
            collection_id,
          })),
        )
      ).error,
    );
  if (drop.length)
    fail(
      (
        await supabase
          .from("library_source_collections")
          .delete()
          .eq("source_id", sourceId)
          .in("collection_id", drop)
      ).error,
    );
}

/**
 * Add or save a source, with its file and shelves. A new file replaces the
 * old one; a change of privacy moves the file to where the new privacy keeps
 * it, so a private source's file is never on the workspace's shared path.
 */
export async function saveSource(input: {
  workspaceId: string;
  userId: string;
  existing: LibrarySource | null;
  draft: SourceDraft;
  file: File | null;
  removeFile: boolean;
}): Promise<string> {
  const { workspaceId, userId, existing, draft, file, removeFile } = input;
  const id = existing?.id ?? crypto.randomUUID();
  const base = row(draft);
  const fileCols: Record<string, unknown> = {};

  if (file) {
    const path = libraryFilePath(workspaceId, userId, id, file.name, draft.private);
    fail(
      (
        await supabase.storage.from(BUCKET).upload(path, file, {
          upsert: true,
          ...(file.type ? { contentType: file.type } : {}),
        })
      ).error,
    );
    Object.assign(fileCols, {
      file_path: path,
      file_name: file.name,
      file_mime: file.type || "application/octet-stream",
      file_bytes: file.size,
    });
  } else if (removeFile) {
    Object.assign(fileCols, {
      file_path: null,
      file_name: null,
      file_mime: null,
      file_bytes: null,
    });
  } else if (existing?.file && existing.private !== draft.private) {
    // Same file, new privacy: move it to where the new privacy keeps it.
    const path = libraryFilePath(
      workspaceId,
      existing.createdBy,
      id,
      existing.file.name,
      draft.private,
    );
    if (path !== existing.file.path) {
      fail((await supabase.storage.from(BUCKET).move(existing.file.path, path)).error);
      fileCols["file_path"] = path;
    }
  }

  if (existing)
    fail(
      (
        await supabase
          .from("library_sources")
          .update({ ...base, ...fileCols } as never)
          .eq("id", id)
      ).error,
    );
  else
    fail(
      (
        await supabase
          .from("library_sources")
          .insert({ id, workspace_id: workspaceId, ...base, ...fileCols } as never)
      ).error,
    );

  // The replaced or removed file goes too, once the record no longer points at it.
  if (existing?.file && (file || removeFile) && existing.file.path !== fileCols["file_path"])
    await supabase.storage.from(BUCKET).remove([existing.file.path]);

  await syncCollections(workspaceId, id, draft.collectionIds, existing?.collectionIds ?? []);
  return id;
}

export async function setSourceArchived(id: string, archived: boolean) {
  fail(
    (
      await supabase
        .from("library_sources")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", id)
    ).error,
  );
}

export async function deleteSource(source: LibrarySource) {
  fail((await supabase.from("library_sources").delete().eq("id", source.id)).error);
  if (source.file) await supabase.storage.from(BUCKET).remove([source.file.path]);
}

/** Put a set of sources on, or take them off, one shelf. */
export async function fileSources(
  workspaceId: string,
  collectionId: string,
  sources: LibrarySource[],
  on: boolean,
) {
  const touched = sources.filter((s) => s.collectionIds.includes(collectionId) !== on);
  if (!touched.length) return;
  if (on)
    fail(
      (
        await supabase.from("library_source_collections").insert(
          touched.map((s) => ({
            workspace_id: workspaceId,
            source_id: s.id,
            collection_id: collectionId,
          })),
        )
      ).error,
    );
  else
    fail(
      (
        await supabase
          .from("library_source_collections")
          .delete()
          .eq("collection_id", collectionId)
          .in(
            "source_id",
            touched.map((s) => s.id),
          )
      ).error,
    );
}

/* ------------------------------------------------------------ collections */

export async function createCollection(workspaceId: string, name: string, position: number) {
  const clean = name.trim();
  if (!clean) throw new Error("A collection needs a name.");
  const id = crypto.randomUUID();
  fail(
    (
      await supabase
        .from("library_collections")
        .insert({ id, workspace_id: workspaceId, name: clean, position })
    ).error,
  );
  return id;
}

export async function renameCollection(id: string, name: string) {
  const clean = name.trim();
  if (!clean) throw new Error("A collection needs a name.");
  fail((await supabase.from("library_collections").update({ name: clean }).eq("id", id)).error);
}

export async function setCollectionArchived(id: string, archived: boolean) {
  fail(
    (
      await supabase
        .from("library_collections")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", id)
    ).error,
  );
}

/** Deleting a shelf leaves its sources in the library; only the shelf goes. */
export async function deleteCollection(id: string) {
  fail((await supabase.from("library_collections").delete().eq("id", id)).error);
}
