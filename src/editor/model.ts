/**
 * The structured document model every non-contract editor now shares.
 *
 * A document is a list of parts — a recital, a resolution, a memo section, a
 * clause of a draft — each a formatted ProseMirror document. Around the parts
 * sits the editing record the contract editor keeps on the matter: private
 * instructions, notes, one step of history per part, the text each part had
 * when it was last accepted (for "See changes"), and any wording Scripta has
 * proposed and the lawyer has not yet decided.
 */
import { docToText, textToDoc, type ClauseDoc } from "@/wireframe/clause-doc";

export type EditorPart = {
  id: string;
  /** "(A)", "3", "1.2" — printed as given; empty for an unnumbered part. */
  num: string;
  title: string;
  doc: ClauseDoc;
  /** Nesting under another part, for the table of contents. */
  parentId?: string | null;
  /** What belongs in the part while it is empty. */
  placeholder?: string;
  /** House-style guidance shown under the heading. */
  hint?: string;
  /** Adapter-specific grouping (a corporate recital vs a resolution). */
  group?: string;
};

export type EditorInstruction = {
  id: string;
  partId: string;
  text: string;
  createdAt: string;
};

export type EditorNote = {
  id: string;
  partId: string;
  body: string;
  created_at: string;
};

export type PartSuggestion = {
  text: string;
  rationale: string;
  at: string;
};

export type EditorMeta = {
  instructions: EditorInstruction[];
  notes: EditorNote[];
  /** The text a part had when its changes were last accepted; absent = never edited. */
  baselines: Record<string, string>;
  /** The document a part had before its last saved edit; one step of undo. */
  history: Record<string, ClauseDoc>;
  /** Wording proposed by Scripta, awaiting accept or reject. */
  suggestions: Record<string, PartSuggestion>;
};

export const emptyMeta = (): EditorMeta => ({
  instructions: [],
  notes: [],
  baselines: {},
  history: {},
  suggestions: {},
});

/** Read a meta record off untrusted JSON, filling anything missing. */
export function readMeta(value: unknown): EditorMeta {
  const m = (value && typeof value === "object" ? value : {}) as Partial<EditorMeta>;
  return {
    instructions: Array.isArray(m.instructions) ? m.instructions : [],
    notes: Array.isArray(m.notes) ? m.notes : [],
    baselines: m.baselines && typeof m.baselines === "object" ? m.baselines : {},
    history: m.history && typeof m.history === "object" ? m.history : {},
    suggestions: m.suggestions && typeof m.suggestions === "object" ? m.suggestions : {},
  };
}

export const uid = (prefix = "p") =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const partText = (part: Pick<EditorPart, "doc">) => docToText(part.doc);

export const makePart = (
  input: Partial<EditorPart> & { title: string; text?: string },
): EditorPart => ({
  id: input.id ?? uid(),
  num: input.num ?? "",
  title: input.title,
  doc: input.doc ?? textToDoc(input.text ?? ""),
  ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
  ...(input.placeholder ? { placeholder: input.placeholder } : {}),
  ...(input.hint ? { hint: input.hint } : {}),
  ...(input.group ? { group: input.group } : {}),
});

/** A part whose words differ from the text last accepted. */
export const partChanged = (part: EditorPart, meta: EditorMeta) => {
  const baseline = meta.baselines[part.id];
  return baseline !== undefined && baseline !== partText(part);
};

/** Parts with an outstanding change or proposal, for See changes. */
export const changedPartIds = (parts: EditorPart[], meta: EditorMeta) =>
  new Set(parts.filter((p) => partChanged(p, meta) || meta.suggestions[p.id]).map((p) => p.id));

/** Drop meta entries for parts that no longer exist. */
export function pruneMeta(meta: EditorMeta, parts: EditorPart[]): EditorMeta {
  const ids = new Set(parts.map((p) => p.id));
  const keep = <T>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).filter(([id]) => ids.has(id)));
  return {
    instructions: meta.instructions.filter((i) => ids.has(i.partId)),
    notes: meta.notes.filter((n) => ids.has(n.partId)),
    baselines: keep(meta.baselines),
    history: keep(meta.history),
    suggestions: keep(meta.suggestions),
  };
}

/** The whole document as plain text, for the AI and for plain-text stores. */
export const partsToText = (parts: EditorPart[]) =>
  parts
    .map((p) => {
      const head = [p.num, p.title].filter(Boolean).join(" ");
      const body = partText(p);
      return head && body ? `${head}\n${body}` : head || body;
    })
    .filter(Boolean)
    .join("\n\n");
