/**
 * Reading and writing manuscripts. Plain client-side queries: the
 * `manuscript*` policies decide who may read and write — the workspace for an
 * unfiled manuscript, the matter's team for one filed to a matter, and the
 * author alone for a private one.
 *
 * The generated Supabase types predate these tables, so the handle below is
 * untyped and every row is given its shape here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  wordCount,
  type ChapterAssessment,
  type ChapterReviewState,
  type ChapterSummary,
  type DraftFinding,
  type Evidence,
  type FindingAction,
  type FindingCategory,
  type FindingSeverity,
  type FindingStatus,
  type ManuscriptKind,
  type ManuscriptMap,
  type NodeKind,
  type ParsedManuscript,
  type ParsedNode,
  type ReviewPass,
  type ReviewScope,
  type StyleCategory,
  type StyleRule,
} from "./model";
import { sentenceOf } from "./sentences";

export const db = supabase as unknown as SupabaseClient<any, "public", any>;

const BUCKET = "matter-documents";

/** What went wrong, in words. A PostgrestError is a plain object, not an Error. */
export function errorMessage(cause: unknown, fallback = "That did not work."): string {
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === "object") {
    const { message, details } = cause as Record<string, unknown>;
    for (const part of [message, details])
      if (typeof part === "string" && part.trim() !== "") return part.trim();
  }
  return fallback;
}

const fail = (error: unknown) => {
  throw new Error(errorMessage(error));
};

/* ------------------------------------------------------------------ types -- */

export type Manuscript = {
  id: string;
  workspaceId: string;
  createdBy: string;
  title: string;
  kind: ManuscriptKind;
  author: string;
  clientId: string | null;
  matterId: string | null;
  private: boolean;
  currentVersionId: string | null;
  map: ManuscriptMap | null;
  mappedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManuscriptVersion = {
  id: string;
  versionNo: number;
  fileName: string;
  format: "docx" | "pdf";
  storagePath: string | null;
  wordCount: number;
  warnings: string[];
  verifiedAt: string | null;
  createdAt: string;
};

export type StoredNode = ParsedNode & { id: string; ord: number };

export type Chapter = {
  id: string;
  chapterKey: string;
  ord: number;
  number: string;
  title: string;
  wordCount: number;
  state: ChapterReviewState;
  summary: ChapterSummary | null;
  summarisedAt: string | null;
  assessment: ChapterAssessment | null;
  reviewedAt: string | null;
};

export type Finding = {
  id: string;
  versionId: string;
  ref: number;
  pass: ReviewPass;
  category: FindingCategory;
  severity: FindingSeverity;
  action: FindingAction;
  title: string;
  body: string;
  original: string | null;
  replacement: string | null;
  evidence: Evidence[];
  chapterKeys: string[];
  fingerprint: string;
  source: "rule" | "ai";
  ruleId: string | null;
  status: FindingStatus;
  decisionNote: string;
  decidedAt: string | null;
  carriedFrom: string | null;
  verification: "remains" | "fixed" | "introduced" | null;
  createdAt: string;
};

export type ReviewRun = {
  id: string;
  versionId: string;
  scope: ReviewScope | "verification";
  chapterKeys: string[];
  passes: ReviewPass[];
  status: "running" | "done" | "failed" | "cancelled";
  progress: { step?: string; done?: number; of?: number };
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

/** A row as Supabase returns it: the generated types do not know these tables. */
type Row = any;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const toManuscript = (r: Row): Manuscript => ({
  id: str(r.id),
  workspaceId: str(r.workspace_id),
  createdBy: str(r.created_by),
  title: str(r.title),
  kind: (str(r.kind) || "thesis") as ManuscriptKind,
  author: str(r.author),
  clientId: strOrNull(r.client_id),
  matterId: strOrNull(r.matter_id),
  private: r.private === true,
  currentVersionId: strOrNull(r.current_version_id),
  map: (r.map as ManuscriptMap | null) ?? null,
  mappedAt: strOrNull(r.mapped_at),
  archivedAt: strOrNull(r.archived_at),
  deletedAt: strOrNull(r.deleted_at),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

const toVersion = (r: Row): ManuscriptVersion => ({
  id: str(r.id),
  versionNo: Number(r.version_no) || 1,
  fileName: str(r.file_name),
  format: r.format === "pdf" ? "pdf" : "docx",
  storagePath: strOrNull(r.storage_path),
  wordCount: Number(r.word_count) || 0,
  warnings: arr<string>(r.warnings),
  verifiedAt: strOrNull(r.verified_at),
  createdAt: str(r.created_at),
});

const toNode = (r: Row): StoredNode => ({
  id: str(r.id),
  key: str(r.key),
  ord: Number(r.ord) || 0,
  kind: str(r.kind) as NodeKind,
  level: Number(r.level) || 0,
  number: str(r.number),
  label: str(r.label),
  text: str(r.text),
  parentKey: strOrNull(r.parent_key),
  chapterKey: strOrNull(r.chapter_key),
  page: typeof r.page === "number" ? r.page : undefined,
  source: typeof r.source === "number" ? r.source : undefined,
  noteRefs: arr<string>(r.note_refs),
  rows: (r.rows as string[][] | null) ?? undefined,
  style: strOrNull(r.style) ?? undefined,
});

export const chapterState = (v: unknown): ChapterReviewState =>
  v === "reviewing" || v === "reviewed" ? v : "not_reviewed";

const toChapter = (r: Row): Chapter => ({
  id: str(r.id),
  chapterKey: str(r.chapter_key),
  ord: Number(r.ord) || 0,
  number: str(r.number),
  title: str(r.title),
  wordCount: Number(r.word_count) || 0,
  state: chapterState(r.state),
  summary: (r.summary as ChapterSummary | null) ?? null,
  summarisedAt: strOrNull(r.summarised_at),
  assessment: (r.assessment as ChapterAssessment | null) ?? null,
  reviewedAt: strOrNull(r.reviewed_at),
});

export const toFinding = (r: Row): Finding => ({
  id: str(r.id),
  versionId: str(r.version_id),
  ref: Number(r.ref) || 0,
  pass: str(r.pass) as ReviewPass,
  category: str(r.category) as FindingCategory,
  severity: (str(r.severity) || "minor") as FindingSeverity,
  action: (str(r.action) || "query") as FindingAction,
  title: str(r.title),
  body: str(r.body),
  original: strOrNull(r.original),
  replacement: strOrNull(r.replacement),
  evidence: arr<Evidence>(r.evidence),
  chapterKeys: arr<string>(r.chapter_keys),
  fingerprint: str(r.fingerprint),
  source: r.source === "ai" ? "ai" : "rule",
  ruleId: strOrNull(r.rule_id),
  status: (str(r.status) || "open") as FindingStatus,
  decisionNote: str(r.decision_note),
  decidedAt: strOrNull(r.decided_at),
  carriedFrom: strOrNull(r.carried_from),
  verification: (strOrNull(r.verification) as Finding["verification"]) ?? null,
  createdAt: str(r.created_at),
});

const toRule = (r: Row): StyleRule => ({
  id: str(r.id),
  category: (str(r.category) || "other") as StyleCategory,
  preferred: str(r.preferred),
  variants: arr<string>(r.variants),
  note: str(r.note),
  origin: r.origin === "detected" ? "detected" : "author",
  active: r.active !== false,
});

const toRun = (r: Row): ReviewRun => ({
  id: str(r.id),
  versionId: str(r.version_id),
  scope: str(r.scope) as ReviewRun["scope"],
  chapterKeys: arr<string>(r.chapter_keys),
  passes: arr<ReviewPass>(r.passes),
  status: (str(r.status) || "running") as ReviewRun["status"],
  progress: (r.progress as ReviewRun["progress"]) ?? {},
  error: strOrNull(r.error),
  startedAt: str(r.started_at),
  finishedAt: strOrNull(r.finished_at),
});

/* ------------------------------------------------------------------- list -- */

export type ManuscriptListItem = Manuscript & {
  wordCount: number;
  chapters: number;
  chaptersReviewed: number;
  openFindings: number;
  materialOpen: number;
  authorName: string;
  mine: boolean;
};

export const manuscriptsKey = (workspaceId: string | null) => ["manuscripts", workspaceId];
export const manuscriptKey = (id: string) => ["manuscript", id];

export async function listManuscripts(
  workspaceId: string,
  userId: string,
): Promise<ManuscriptListItem[]> {
  const { data, error } = await db
    .from("manuscripts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) fail(error);
  const rows = ((data ?? []) as Row[]).map(toManuscript);
  const versionIds = rows.map((m) => m.currentVersionId).filter(Boolean) as string[];
  const [versions, chapters, findings, people] = await Promise.all([
    versionIds.length
      ? db.from("manuscript_versions").select("id, word_count").in("id", versionIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length
      ? db.from("manuscript_chapters").select("version_id, state").in("version_id", versionIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length
      ? db
          .from("manuscript_findings")
          .select("version_id, severity")
          .in("version_id", versionIds)
          .eq("status", "open")
      : Promise.resolve({ data: [], error: null }),
    rows.length
      ? supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", [...new Set(rows.map((r) => r.createdBy))])
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [versions, chapters, findings]) if (r.error) fail(r.error);
  const words = new Map(
    ((versions.data ?? []) as Row[]).map((v) => [str(v.id), Number(v.word_count) || 0]),
  );
  const name = new Map(
    ((people.data ?? []) as Row[]).map((p) => [
      str(p.id),
      str(p.full_name) || str(p.email) || "Someone",
    ]),
  );
  return rows.map((m) => {
    const ch = ((chapters.data ?? []) as Row[]).filter((c) => c.version_id === m.currentVersionId);
    const fi = ((findings.data ?? []) as Row[]).filter((f) => f.version_id === m.currentVersionId);
    return {
      ...m,
      wordCount: words.get(m.currentVersionId ?? "") ?? 0,
      chapters: ch.length,
      chaptersReviewed: ch.filter((c) => c.state === "reviewed").length,
      openFindings: fi.length,
      materialOpen: fi.filter((f) => f.severity !== "minor").length,
      authorName: name.get(m.createdBy) ?? "Someone",
      mine: m.createdBy === userId,
    };
  });
}

/* ----------------------------------------------------------------- create -- */

export type NewManuscript = {
  workspaceId: string;
  title: string;
  kind: ManuscriptKind;
  author: string;
  clientId: string | null;
  matterId: string | null;
  private: boolean;
};

/** The id is chosen here, so nothing depends on reading the row straight back. */
export async function createManuscript(draft: NewManuscript): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await db.from("manuscripts").insert({
    id,
    workspace_id: draft.workspaceId,
    title: draft.title.trim(),
    kind: draft.kind,
    author: draft.author.trim(),
    client_id: draft.clientId,
    matter_id: draft.matterId,
    private: draft.private,
  });
  if (error) fail(error);
  return id;
}

export async function updateManuscript(
  id: string,
  patch: Partial<
    Pick<Manuscript, "title" | "kind" | "author" | "clientId" | "matterId" | "private">
  >,
) {
  const row: Row = {};
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.author !== undefined) row.author = patch.author.trim();
  if (patch.clientId !== undefined) row.client_id = patch.clientId;
  if (patch.matterId !== undefined) row.matter_id = patch.matterId;
  if (patch.private !== undefined) row.private = patch.private;
  const { error } = await db.from("manuscripts").update(row).eq("id", id);
  if (error) fail(error);
}

export async function setManuscriptArchived(id: string, archived: boolean) {
  const { error } = await db
    .from("manuscripts")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) fail(error);
}

/** Delete for good: the versions, atoms and findings go with it (cascade). */
export async function deleteManuscript(m: Pick<Manuscript, "id">) {
  const { data } = await db
    .from("manuscript_versions")
    .select("storage_path")
    .eq("manuscript_id", m.id);
  const paths = ((data ?? []) as Row[]).map((r) => str(r.storage_path)).filter(Boolean);
  const { error } = await db.from("manuscripts").delete().eq("id", m.id);
  if (error) fail(error);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

/* ----------------------------------------------------------------- import -- */

/**
 * Where a manuscript's file is kept: inside the same boundary as the record —
 * the author's own folder when private, the matter's when filed to one
 * (storage checks matter membership on that path), otherwise the workspace's.
 */
function storagePath(
  m: Pick<Manuscript, "id" | "workspaceId" | "private" | "matterId">,
  userId: string,
  name: string,
) {
  const file = `manuscripts/${m.id}/${name}`;
  return m.private
    ? `${m.workspaceId}/personal/${userId}/${file}`
    : m.matterId
      ? `${m.workspaceId}/${m.matterId}/${file}`
      : `${m.workspaceId}/${file}`;
}

/**
 * Make a manuscript private, or share it again. The files move with the
 * record: a private manuscript whose file still sat in the firm's folder could
 * be opened by anyone who guessed the path. Only the author may do this (the
 * database refuses anyone else), so the author's folder is the one used.
 */
export async function setManuscriptPrivate(
  m: Pick<Manuscript, "id" | "workspaceId" | "matterId" | "createdBy">,
  makePrivate: boolean,
) {
  const { data, error } = await db
    .from("manuscript_versions")
    .select("id, storage_path")
    .eq("manuscript_id", m.id);
  if (error) fail(error);
  for (const v of (data ?? []) as Row[]) {
    const from = str(v.storage_path);
    if (!from) continue;
    const name = from.slice(from.lastIndexOf("/") + 1);
    const to = storagePath({ ...m, private: makePrivate }, m.createdBy, name);
    if (to === from) continue;
    const moved = await supabase.storage.from(BUCKET).move(from, to);
    if (moved.error) fail(moved.error);
    const { error: e } = await db
      .from("manuscript_versions")
      .update({ storage_path: to })
      .eq("id", str(v.id));
    if (e) fail(e);
  }
  const { error: e } = await db.from("manuscripts").update({ private: makePrivate }).eq("id", m.id);
  if (e) fail(e);
}

const safeName = (fileName: string) =>
  fileName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-80) || "manuscript";

/** Chapter rows from the atoms: title, number, words. */
export function chaptersFrom(nodes: ParsedNode[]) {
  const words = new Map<string, number>();
  for (const n of nodes)
    if (n.chapterKey && n.kind !== "chapter")
      words.set(n.chapterKey, (words.get(n.chapterKey) ?? 0) + wordCount(n.text));
  return nodes
    .filter((n) => n.kind === "chapter")
    .map((n, i) => {
      // "1 Introduction" is stored as number "1" and title "Introduction", so
      // the two can be shown together without the number twice.
      const full = (n.label || n.text).trim();
      const lead = n.number
        ? new RegExp(
            `^(chapter\\s+)?${n.number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[.:)\\s–-]*`,
            "i",
          )
        : null;
      const title = (lead ? full.replace(lead, "") : full) || full;
      return {
        chapterKey: n.key,
        ord: i,
        number: n.number,
        title,
        wordCount: words.get(n.key) ?? 0,
      };
    });
}

/**
 * Store a parsed reading as a new version: the file, the atoms in batches, the
 * chapters, then point the manuscript at it. Returns the new version's id.
 */
export async function importVersion(args: {
  manuscript: Pick<Manuscript, "id" | "workspaceId" | "private" | "matterId">;
  userId: string;
  file: File;
  parsed: ParsedManuscript;
  onProgress?: (done: number, of: number) => void;
}): Promise<string> {
  const { manuscript, parsed } = args;
  const { data: last } = await db
    .from("manuscript_versions")
    .select("version_no")
    .eq("manuscript_id", manuscript.id)
    .order("version_no", { ascending: false })
    .limit(1);
  const versionNo = (Number(((last ?? []) as Row[])[0]?.version_no) || 0) + 1;
  const versionId = crypto.randomUUID();
  // The file sits inside the same boundary as the record: the author's own
  // folder when private, the matter's when filed to one (storage checks
  // matter membership on that path), otherwise the workspace's.
  const path = storagePath(manuscript, args.userId, `v${versionNo}-${safeName(args.file.name)}`);

  const up = await supabase.storage
    .from(BUCKET)
    .upload(
      path,
      args.file,
      args.file.type ? { contentType: args.file.type, upsert: false } : { upsert: false },
    );
  // The reading is what the review runs on; a copy that could not be kept is
  // not a reason to lose it.
  const keptPath = up.error ? null : path;

  const words = parsed.nodes
    .filter((n) => n.kind !== "toc_entry")
    .reduce((sum, n) => sum + wordCount(n.text), 0);
  const { error: vErr } = await db.from("manuscript_versions").insert({
    id: versionId,
    manuscript_id: manuscript.id,
    version_no: versionNo,
    file_name: args.file.name,
    format: parsed.format,
    storage_path: keptPath,
    word_count: words,
    warnings: up.error
      ? [...parsed.warnings, "The original file could not be stored; the reading below was kept."]
      : parsed.warnings,
  });
  if (vErr) fail(vErr);

  const rows = parsed.nodes.map((n, ord) => ({
    manuscript_id: manuscript.id,
    version_id: versionId,
    key: n.key,
    ord,
    kind: n.kind,
    level: n.level,
    number: n.number,
    label: n.label,
    text: n.text,
    parent_key: n.parentKey,
    chapter_key: n.chapterKey,
    page: n.page ?? null,
    source: n.source ?? null,
    note_refs: n.noteRefs ?? [],
    rows: n.rows ?? null,
    style: n.style ?? null,
  }));
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from("manuscript_nodes").insert(rows.slice(i, i + BATCH));
    if (error) {
      await db.from("manuscript_versions").delete().eq("id", versionId);
      fail(error);
    }
    args.onProgress?.(Math.min(i + BATCH, rows.length), rows.length);
  }

  const chapters = chaptersFrom(parsed.nodes).map((c) => ({
    manuscript_id: manuscript.id,
    version_id: versionId,
    chapter_key: c.chapterKey,
    ord: c.ord,
    number: c.number,
    title: c.title,
    word_count: c.wordCount,
  }));
  if (chapters.length) {
    const { error } = await db.from("manuscript_chapters").insert(chapters);
    if (error) fail(error);
  }
  const { error: mErr } = await db
    .from("manuscripts")
    .update({ current_version_id: versionId })
    .eq("id", manuscript.id);
  if (mErr) fail(mErr);
  return versionId;
}

/* ------------------------------------------------------------------- load -- */

export type ManuscriptBundle = {
  manuscript: Manuscript;
  versions: ManuscriptVersion[];
  version: ManuscriptVersion | null;
  nodes: StoredNode[];
  chapters: Chapter[];
  findings: Finding[];
  rules: StyleRule[];
  runs: ReviewRun[];
};

/** Everything the manuscript screens read, for the current version. */
export async function loadManuscript(id: string): Promise<ManuscriptBundle> {
  const { data, error } = await db.from("manuscripts").select("*").eq("id", id).maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error("This manuscript does not exist, or you cannot see it.");
  const manuscript = toManuscript(data as Row);
  const [versions, rules, runs] = await Promise.all([
    db
      .from("manuscript_versions")
      .select("*")
      .eq("manuscript_id", id)
      .order("version_no", { ascending: false }),
    db.from("manuscript_style_rules").select("*").eq("manuscript_id", id).order("created_at"),
    db
      .from("manuscript_runs")
      .select("*")
      .eq("manuscript_id", id)
      .order("started_at", { ascending: false })
      .limit(10),
  ]);
  for (const r of [versions, rules, runs]) if (r.error) fail(r.error);
  const allVersions = ((versions.data ?? []) as Row[]).map(toVersion);
  const version =
    allVersions.find((v) => v.id === manuscript.currentVersionId) ?? allVersions[0] ?? null;
  let nodes: StoredNode[] = [];
  let chapters: Chapter[] = [];
  let findings: Finding[] = [];
  if (version) {
    [nodes, chapters, findings] = await Promise.all([
      loadNodes(version.id),
      db
        .from("manuscript_chapters")
        .select("*")
        .eq("version_id", version.id)
        .order("ord")
        .then((r) => {
          if (r.error) fail(r.error);
          return ((r.data ?? []) as Row[]).map(toChapter);
        }),
      loadFindings(version.id),
    ]);
  }
  return {
    manuscript,
    versions: allVersions,
    version,
    nodes,
    chapters,
    findings,
    rules: ((rules.data ?? []) as Row[]).map(toRule),
    runs: ((runs.data ?? []) as Row[]).map(toRun),
  };
}

/** Every atom of a version, in order. Paged, since a book runs to thousands. */
export async function loadNodes(versionId: string): Promise<StoredNode[]> {
  const out: StoredNode[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("manuscript_nodes")
      .select("*")
      .eq("version_id", versionId)
      .order("ord")
      .range(from, from + PAGE - 1);
    if (error) fail(error);
    const rows = (data ?? []) as Row[];
    out.push(...rows.map(toNode));
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function loadFindings(versionId: string): Promise<Finding[]> {
  const out: Finding[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("manuscript_findings")
      .select("*")
      .eq("version_id", versionId)
      .order("ref")
      .range(from, from + PAGE - 1);
    if (error) fail(error);
    const rows = (data ?? []) as Row[];
    out.push(...rows.map(toFinding));
    if (rows.length < PAGE) break;
  }
  return out;
}

/* --------------------------------------------------------------- findings -- */

/**
 * Keep findings that are new to this version. A fingerprint already on the
 * version is the same problem at the same words: it is not raised again, and
 * whatever the author decided about it stands.
 */
export async function saveFindings(args: {
  manuscriptId: string;
  versionId: string;
  drafts: DraftFinding[];
  nodes: Pick<ParsedNode, "key" | "chapterKey" | "text">[];
  extra?: (d: DraftFinding) => Row;
}): Promise<number> {
  const existing = await db
    .from("manuscript_findings")
    .select("fingerprint, ref")
    .eq("version_id", args.versionId);
  if (existing.error) fail(existing.error);
  const seen = new Set(((existing.data ?? []) as Row[]).map((r) => str(r.fingerprint)));
  let ref = ((existing.data ?? []) as Row[]).reduce((m, r) => Math.max(m, Number(r.ref) || 0), 0);
  const chapterOf = new Map(args.nodes.map((n) => [n.key, n.chapterKey]));
  const textOf = new Map(args.nodes.map((n) => [n.key, n.text]));
  // Every place is pinned to its sentence where the words tell us which one,
  // whichever pass raised it — the exact checks quote words, not sentences.
  const pin = (e: Evidence): Evidence =>
    e.sentence || !e.quote
      ? e
      : (() => {
          const n = sentenceOf(textOf.get(e.nodeKey) ?? "", e.quote);
          return n ? { ...e, sentence: n } : e;
        })();
  const rows: Row[] = [];
  for (const d of args.drafts) {
    if (seen.has(d.fingerprint)) continue;
    seen.add(d.fingerprint);
    const chapterKeys = [
      ...new Set(d.evidence.map((e) => chapterOf.get(e.nodeKey)).filter(Boolean) as string[]),
    ];
    rows.push({
      manuscript_id: args.manuscriptId,
      version_id: args.versionId,
      ref: ++ref,
      pass: d.pass,
      category: d.category,
      severity: d.severity,
      action: d.action,
      title: d.title.slice(0, 300),
      body: d.body,
      original: d.original ?? null,
      replacement: d.replacement ?? null,
      evidence: d.evidence.map(pin),
      chapter_keys: chapterKeys,
      fingerprint: d.fingerprint,
      source: d.source,
      rule_id: d.ruleId && /^[0-9a-f-]{36}$/.test(d.ruleId) ? d.ruleId : null,
      ...(args.extra?.(d) ?? {}),
    });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("manuscript_findings").insert(rows.slice(i, i + 500));
    if (error) fail(error);
  }
  return rows.length;
}

export async function decideFinding(id: string, status: FindingStatus, note = "") {
  const { data } = await supabase.auth.getUser();
  const { error } = await db
    .from("manuscript_findings")
    .update({
      status,
      decision_note: note,
      decided_by: status === "open" ? null : (data.user?.id ?? null),
      decided_at: status === "open" ? null : new Date().toISOString(),
    })
    .eq("id", id);
  if (error) fail(error);
}

export async function decideFindings(ids: string[], status: FindingStatus) {
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.auth.getUser();
    const { error } = await db
      .from("manuscript_findings")
      .update({
        status,
        decided_by: status === "open" ? null : (data.user?.id ?? null),
        decided_at: status === "open" ? null : new Date().toISOString(),
      })
      .in("id", ids.slice(i, i + 200));
    if (error) fail(error);
  }
}

/* ------------------------------------------------------------ style sheet -- */

export async function saveRule(
  manuscriptId: string,
  rule: Omit<StyleRule, "id"> & { id?: string },
) {
  const row = {
    manuscript_id: manuscriptId,
    category: rule.category,
    preferred: rule.preferred.trim(),
    variants: rule.variants.map((v) => v.trim()).filter(Boolean),
    note: rule.note.trim(),
    origin: rule.origin,
    active: rule.active,
    updated_at: new Date().toISOString(),
  };
  const { error } = rule.id
    ? await db.from("manuscript_style_rules").update(row).eq("id", rule.id)
    : await db.from("manuscript_style_rules").insert(row);
  if (error) fail(error);
}

export async function deleteRule(id: string) {
  const { error } = await db.from("manuscript_style_rules").delete().eq("id", id);
  if (error) fail(error);
}

/**
 * Conventions the checks noticed, offered as proposals: inactive until a
 * person adopts them, so Scripta never decides the author's style for them.
 * A convention already on the sheet (same category and preferred form, or the
 * same forms reversed) is not proposed again.
 */
export async function proposeRules(
  manuscriptId: string,
  existing: StyleRule[],
  detected: Omit<StyleRule, "id">[],
): Promise<number> {
  const norm = (s: string) => s.trim().toLowerCase();
  const known = new Set<string>();
  for (const r of existing)
    for (const form of [r.preferred, ...r.variants]) known.add(`${r.category}|${norm(form)}`);
  const fresh = detected.filter(
    (d) =>
      d.preferred.trim() &&
      ![d.preferred, ...d.variants].some((f) => known.has(`${d.category}|${norm(f)}`)),
  );
  if (!fresh.length) return 0;
  const { error } = await db.from("manuscript_style_rules").insert(
    fresh.map((d) => ({
      manuscript_id: manuscriptId,
      category: d.category,
      preferred: d.preferred,
      variants: d.variants,
      note: d.note,
      origin: "detected",
      active: false,
    })),
  );
  if (error) fail(error);
  return fresh.length;
}

/* ------------------------------------------------------------------- runs -- */

export async function startRun(args: {
  manuscriptId: string;
  versionId: string;
  scope: ReviewRun["scope"];
  chapterKeys: string[];
  passes: ReviewPass[];
}): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await db.from("manuscript_runs").insert({
    id,
    manuscript_id: args.manuscriptId,
    version_id: args.versionId,
    scope: args.scope,
    chapter_keys: args.chapterKeys,
    passes: args.passes,
  });
  if (error) fail(error);
  return id;
}

export async function updateRun(
  id: string,
  patch: { progress?: ReviewRun["progress"]; status?: ReviewRun["status"]; error?: string | null },
) {
  const row: Row = {};
  if (patch.progress) row.progress = patch.progress;
  if (patch.status) {
    row.status = patch.status;
    if (patch.status !== "running") row.finished_at = new Date().toISOString();
  }
  if (patch.error !== undefined) row.error = patch.error;
  await db.from("manuscript_runs").update(row).eq("id", id);
}

export async function setChapterState(
  versionId: string,
  chapterKeys: string[],
  state: ChapterReviewState,
) {
  if (!chapterKeys.length) return;
  const { error } = await db
    .from("manuscript_chapters")
    .update({ state, ...(state === "reviewed" ? { reviewed_at: new Date().toISOString() } : {}) })
    .eq("version_id", versionId)
    .in("chapter_key", chapterKeys);
  if (error) fail(error);
}

/** Where the original file can be opened from. */
export async function versionFileUrl(v: ManuscriptVersion): Promise<string | null> {
  if (!v.storagePath) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(v.storagePath, 600);
  return data?.signedUrl ?? null;
}
