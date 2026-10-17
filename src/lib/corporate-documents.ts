import { supabase } from "@/integrations/supabase/client";
import type {
  ClauseLayout,
  ExportClause,
  ExportMarks,
  ExportPara,
  ExportSeg,
  SignLine,
} from "@/lib/export/docx";
import { HOUSE_LETTER, HOUSE_RESOLUTION, renderPlaceholder } from "@/lib/house-style";
import { docToParas } from "@/lib/export/rich-doc";
import { docToText, textToDoc, type ClauseDoc } from "@/wireframe/clause-doc";
import { emptyMeta, readMeta, uid, type EditorMeta, type EditorPart } from "@/editor/model";
import {
  HOUSE_SIGNATURE_RULE,
  houseLongDate,
  houseOpening,
  houseResolutionDate,
  houseSignature,
} from "./corporate/house";
import {
  CORPORATE_GROUPS,
  KIND_LABEL,
  readKind,
  type CorporateDocumentKind,
  type CorporateGroup,
} from "./corporate/kinds";

export { CORPORATE_KINDS, GROUP_LABEL, KIND_SUMMARY } from "./corporate/kinds";
export { KIND_LABEL };
export type { CorporateDocumentKind, CorporateGroup };

export type ResolutionContent = {
  companyName: string;
  registeredOffice: string;
  date: string;
  recitals: string[];
  resolutions: string[];
  directors: string[];
};

export type LetterContent = {
  date: string;
  sender: string;
  addressee: string;
  subject: string;
  body: string;
  purpose: string;
  signatoryName: string;
  signatoryTitle: string;
};

export type CorporateContent = ResolutionContent | LetterContent;

/**
 * The structured form of a corporate document: the facts that furnish it
 * (company, office, date, addresses, signatory) and the parts a lawyer writes
 * on the paper, each a formatted document. Recitals and resolutions are parts
 * with a group; a letter's body and purpose are parts too. `meta` is the
 * editing record — instructions, notes, one step of history per part, the
 * accepted text each change is measured against, and pending proposals.
 */
export type CorporateContentV2 = {
  version: 2;
  particulars: Record<string, string>;
  directors: string[];
  parts: (EditorPart & { group: CorporateGroup })[];
  meta: EditorMeta;
};

export type CorporateDocument = {
  id: string;
  workspaceId: string;
  matterId: string | null;
  matterName: string;
  kind: CorporateDocumentKind;
  title: string;
  content: CorporateContentV2;
  letterheadId: string | null;
  letterheadName: string;
  createdAt: string;
  updatedAt: string;
  /** Put aside and out of the active workspace; null means live. */
  archivedAt: string | null;
  /** In Recently Deleted since this moment; null means live. */
  deletedAt: string | null;
  /** Where the document has got to. Final is locked until the lawyer lifts it. */
  stage: CorporateStage;
};

export type CorporateDocumentPatch = {
  title: string;
  matterId: string | null;
  letterheadId: string | null;
  content: CorporateContentV2;
};

type CorporateDocumentRow = {
  id: string;
  workspace_id: string;
  matter_id: string | null;
  kind: string;
  title: string;
  content: unknown;
  letterhead_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  stage: string | null;
  matters: { name?: string | null } | null;
  letterheads: { name?: string | null } | null;
};

const SELECT =
  "id, workspace_id, matter_id, kind, title, content, letterhead_id, created_at, updated_at, archived_at, deleted_at, stage, matters(name), letterheads(name)";

export const EMPTY_RESOLUTION: ResolutionContent = {
  companyName: "",
  registeredOffice: "",
  date: "",
  recitals: [""],
  resolutions: [""],
  directors: [""],
};

export const EMPTY_LETTER: LetterContent = {
  date: "",
  sender: "",
  addressee: "",
  subject: "",
  body: "",
  purpose: "",
  signatoryName: "",
  signatoryTitle: "",
};

export const emptyCorporateContent = (kind: CorporateDocumentKind): CorporateContent =>
  isInstrumentKind(kind)
    ? {
        ...EMPTY_RESOLUTION,
        recitals: [...EMPTY_RESOLUTION.recitals],
        resolutions: [...EMPTY_RESOLUTION.resolutions],
        directors: [...EMPTY_RESOLUTION.directors],
      }
    : { ...EMPTY_LETTER };

/** Resolutions and minutes share a layout; a letter does not. */
export const isInstrumentKind = (kind: CorporateDocumentKind) => kind !== "letter";

/** Being written, being checked, or settled. */
export type CorporateStage = "drafting" | "review" | "final";

export const CORPORATE_STAGES: CorporateStage[] = ["drafting", "review", "final"];

export const STAGE_LABEL: Record<CorporateStage, string> = {
  drafting: "Draft",
  review: "Review",
  final: "Final",
};

const readStage = (value: string | null): CorporateStage =>
  value === "review" || value === "final" ? value : "drafting";

/** A settled document is locked against editing until the lawyer lifts it. */
export const isLocked = (document: { stage: CorporateStage }) => document.stage === "final";

/** Move a document to a stage. Nothing else about it changes. */
export async function setCorporateStage(
  id: string,
  workspaceId: string,
  stage: CorporateStage,
): Promise<void> {
  const { error } = await supabase
    .from("corporate_documents")
    .update({ stage })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown) => (typeof value === "string" ? value : "");
const strings = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string") && value.length
    ? value
    : [""];

/** JSON from the database is untrusted at runtime, even when TypeScript knows its intended shape. */
export function readCorporateContent(
  kind: CorporateDocumentKind,
  value: unknown,
): CorporateContent {
  const source = record(value);
  return isInstrumentKind(kind)
    ? {
        companyName: string(source["companyName"]),
        registeredOffice: string(source["registeredOffice"]),
        date: string(source["date"]),
        recitals: strings(source["recitals"]),
        resolutions: strings(source["resolutions"]),
        directors: strings(source["directors"]),
      }
    : {
        date: string(source["date"]),
        sender: string(source["sender"]),
        addressee: string(source["addressee"]),
        subject: string(source["subject"]),
        body: string(source["body"]),
        purpose: string(source["purpose"]),
        signatoryName: string(source["signatoryName"]),
        signatoryTitle: string(source["signatoryTitle"]),
      };
}

const GROUP_NUM = (group: CorporateGroup, index: number) =>
  group === "recital"
    ? alphaMarker(index, true)
    : group === "resolution" || group === "authority"
      ? alphaMarker(index, false)
      : "";

/** Recitals run (A), (B)…; resolutions (a), (b)…; a letter's parts carry no number. */
export function renumberCorporateParts<T extends EditorPart & { group: CorporateGroup }>(
  parts: T[],
): T[] {
  const counters: Record<string, number> = {};
  return parts.map((part) => {
    // Authorities are lettered in the same run as the resolutions they follow,
    // because that is how they print: (a), (b), (c) down one list.
    const counter = part.group === "authority" ? "resolution" : part.group;
    const index = counters[counter] ?? 0;
    counters[counter] = index + 1;
    return { ...part, num: GROUP_NUM(part.group, index) };
  });
}

const GROUP_TITLE: Record<CorporateGroup, string> = {
  company: "The company",
  attendance: "Present and apologies",
  recital: "Recital",
  consideration: "Consideration",
  resolution: "Resolution",
  authority: "Authority",
  execution: "Execution",
  body: "Body",
  purpose: "Purpose",
};
const groupTitle = (group: CorporateGroup) => GROUP_TITLE[group];

const corporatePart = (
  group: CorporateGroup,
  text: string,
  extra: Partial<EditorPart> = {},
): EditorPart & { group: CorporateGroup } => ({
  id: uid("part"),
  num: "",
  title: groupTitle(group),
  doc: textToDoc(text),
  ...extra,
  group,
});

const PLACEHOLDERS: Record<CorporateGroup, string> = {
  company: "The company's registered name, number and registered office.",
  attendance: "Who attended, who chaired, who sent apologies.",
  recital: "One fact the decision rests on.",
  consideration: "What was discussed, and on what material.",
  resolution: "What is resolved — one resolution per part.",
  authority: "Who is authorised, and precisely what they may do.",
  execution: "How and when the document takes effect.",
  body: "The letter, one point per paragraph.",
  purpose: "Why this letter is issued.",
};

/** The structured form of a legacy form-based document. Nothing is lost: each list item becomes a part. */
export function legacyToV2(
  kind: CorporateDocumentKind,
  content: CorporateContent,
): CorporateContentV2 {
  if (isInstrumentKind(kind)) {
    const c = content as ResolutionContent;
    return {
      version: 2,
      particulars: {
        companyName: c.companyName,
        registeredOffice: c.registeredOffice,
        date: c.date,
      },
      directors: c.directors.length ? c.directors : [""],
      parts: renumberCorporateParts([
        ...c.recitals.map((t) =>
          corporatePart("recital", t, { placeholder: PLACEHOLDERS.recital }),
        ),
        ...c.resolutions.map((t) =>
          corporatePart("resolution", t, { placeholder: PLACEHOLDERS.resolution }),
        ),
      ]),
      meta: emptyMeta(),
    };
  }
  const c = content as LetterContent;
  return {
    version: 2,
    particulars: {
      date: c.date,
      sender: c.sender,
      addressee: c.addressee,
      subject: c.subject,
      signatoryName: c.signatoryName,
      signatoryTitle: c.signatoryTitle,
    },
    directors: [],
    parts: renumberCorporateParts([
      corporatePart("body", c.body, { placeholder: PLACEHOLDERS.body }),
      corporatePart("purpose", c.purpose, { placeholder: PLACEHOLDERS.purpose }),
    ]),
    meta: emptyMeta(),
  };
}

const isV2 = (value: unknown): value is CorporateContentV2 =>
  !!value && typeof value === "object" && (value as { version?: unknown }).version === 2;

const asPart = (
  value: unknown,
  fallbackGroup: CorporateGroup,
): (EditorPart & { group: CorporateGroup }) | null => {
  const o = record(value);
  const doc = o["doc"] as ClauseDoc | undefined;
  // Every structural group, not just the four that existed before the
  // instruments were split out: a group that falls through here is silently
  // turned into a resolution, which mislays the whole document.
  const group = CORPORATE_GROUPS.find((g) => g === o["group"]) ?? fallbackGroup;
  if (!doc || (doc as { type?: string }).type !== "doc") return null;
  return {
    id: string(o["id"]) || uid("part"),
    num: string(o["num"]),
    title: string(o["title"]) || groupTitle(group),
    doc,
    group,
    placeholder: string(o["placeholder"]) || PLACEHOLDERS[group],
    ...(string(o["hint"]) ? { hint: string(o["hint"]) } : {}),
  };
};

/** Read either form off the row; a legacy form is converted, malformed JSON becomes an empty document. */
export function readCorporateContentV2(
  kind: CorporateDocumentKind,
  value: unknown,
): CorporateContentV2 {
  if (!isV2(value)) return legacyToV2(kind, readCorporateContent(kind, value));
  const o = record(value);
  const particulars = Object.fromEntries(
    Object.entries(record(o["particulars"])).map(([k, v]) => [k, string(v)]),
  );
  const parts = (Array.isArray(o["parts"]) ? o["parts"] : [])
    .map((p) => asPart(p, isInstrumentKind(kind) ? "resolution" : "body"))
    .filter((p): p is EditorPart & { group: CorporateGroup } => p !== null);
  return {
    version: 2,
    particulars,
    directors: isInstrumentKind(kind) ? strings(o["directors"]) : [],
    parts: renumberCorporateParts(parts),
    meta: readMeta(o["meta"]),
  };
}

export const emptyCorporateContentV2 = (kind: CorporateDocumentKind): CorporateContentV2 =>
  legacyToV2(kind, emptyCorporateContent(kind));

/** A blank part of the right group, ready to be written. */
export const newCorporatePart = (group: CorporateGroup) =>
  corporatePart(group, "", { placeholder: PLACEHOLDERS[group] });

const relatedName = (
  value: CorporateDocumentRow["matters"] | CorporateDocumentRow["letterheads"],
) => value?.name ?? "";

const toCorporateDocument = (row: CorporateDocumentRow): CorporateDocument => {
  const kind = readKind(row.kind);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    matterId: row.matter_id,
    matterName: relatedName(row.matters),
    kind,
    title: row.title,
    content: readCorporateContentV2(kind, row.content),
    letterheadId: row.letterhead_id,
    letterheadName: relatedName(row.letterheads),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null,
    deletedAt: row.deleted_at ?? null,
    stage: readStage(row.stage),
  };
};

export async function listCorporateDocuments(workspaceId: string): Promise<CorporateDocument[]> {
  const { data, error } = await supabase
    .from("corporate_documents")
    .select(SELECT)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: CorporateDocumentRow) => toCorporateDocument(row));
}

export async function createCorporateDocument(
  workspaceId: string,
  kind: CorporateDocumentKind,
  options: {
    matterId?: string | null;
    letterheadId?: string | null;
    /** The name the blueprint gave it. */
    title?: string;
    /** The structure a blueprint built. Absent means an empty document. */
    content?: CorporateContentV2;
  } = {},
): Promise<CorporateDocument> {
  const { data, error } = await supabase
    .from("corporate_documents")
    .insert({
      workspace_id: workspaceId,
      matter_id: options.matterId ?? null,
      kind,
      title: options.title?.trim() || `Untitled ${KIND_LABEL[kind].toLowerCase()}`,
      content: options.content ?? emptyCorporateContentV2(kind),
      letterhead_id: options.letterheadId ?? null,
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return toCorporateDocument(data as CorporateDocumentRow);
}

export async function updateCorporateDocument(
  id: string,
  workspaceId: string,
  patch: CorporateDocumentPatch,
): Promise<CorporateDocument> {
  const { data, error } = await supabase
    .from("corporate_documents")
    .update({
      title: patch.title.trim() || "Untitled corporate document",
      matter_id: patch.matterId,
      letterhead_id: patch.letterheadId,
      content: patch.content,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .select(SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This document is no longer available in the current workspace.");
  return toCorporateDocument(data as CorporateDocumentRow);
}

export async function deleteCorporateDocument(id: string, workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from("corporate_documents")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Zero-based index as a legal alphabetic marker: 0 -> (A), 26 -> (AA). */
export function alphaMarker(index: number, capitals: boolean): string {
  if (!Number.isInteger(index) || index < 0)
    throw new RangeError("A lettered paragraph needs a non-negative integer index.");
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return `(${capitals ? label : label.toLowerCase()})`;
}

const supplied = (value: string, missing: string) => value.trim() || renderPlaceholder(missing);
const normal = (text: string, marks?: ExportMarks): ExportSeg => ({
  t: text,
  k: "n",
  ...(marks ? { m: marks } : {}),
});

const paragraph = (
  text: string,
  options: Pick<ExportPara, "align" | "heading"> & {
    marks?: ExportMarks;
    layout?: ClauseLayout;
  } = {},
): ExportClause => ({
  num: "",
  title: "",
  segs: [normal(text, options.marks)],
  paras: [
    {
      runs: [normal(text, options.marks)],
      ...(options.align ? { align: options.align } : {}),
      ...(options.heading ? { heading: options.heading } : {}),
    },
  ],
  ...(options.layout ? { layout: options.layout } : {}),
});

const lettered = (
  marker: string,
  text: string,
  missing: string,
  layout?: ClauseLayout,
): ExportClause => ({
  num: marker,
  title: "",
  segs: [normal(supplied(text, missing))],
  ...(layout ? { layout } : {}),
});

const paragraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

export type CorporateExportSpec = {
  title: string;
  subtitle?: string;
  clauses: ExportClause[];
  /** The page layout the builder uses: an instrument, or a letter. */
  kind: "resolution" | "letter";
  numbering: "literal";
  /** No page numbers and no running head: the firm's letters and resolutions carry neither. */
  furniture: false;
};

/**
 * The same clauses feed DocumentPreview and the file builders. Nothing is
 * tracked because these are documents the lawyer writes from a blank form.
 */
const written = (part: EditorPart, missing: string, layout?: ClauseLayout): ExportClause => {
  const text = docToText(part.doc);
  const placed = layout ? { layout } : {};
  if (!text.trim())
    return { num: part.num, title: "", segs: [normal(renderPlaceholder(missing))], ...placed };
  const paras = docToParas(part.doc);
  return {
    num: part.num,
    title: "",
    segs: [normal(text)],
    ...(paras.length ? { paras } : {}),
    ...placed,
  };
};

/** A part of a resolution set out to the firm's edges, with the space beneath it the standard gives. */
const edged = (after: number): ClauseLayout => ({
  left: HOUSE_RESOLUTION.left,
  right: HOUSE_RESOLUTION.right,
  after,
});

/** A lettered part, hanging as its kind hangs, with more space beneath the last of its run. */
const hung = (
  spec: { left: number; hanging: number; after: number; lastAfter: number },
  index: number,
  total: number,
): ClauseLayout => ({
  left: spec.left,
  hanging: spec.hanging,
  right: HOUSE_RESOLUTION.right,
  after: index === total - 1 ? spec.lastAfter : spec.after,
});

/**
 * The directors' signatures as the signed resolution sets them: side by side,
 * two to a row, each a dotted rule over the name in bold over the office.
 * The words are kept as plain text too, which is what the preview reads.
 */
function signatureTable(names: string[], office: string): ExportClause {
  const { columns, width, indent, before } = HOUSE_RESOLUTION.signatures;
  const rows: SignLine[][][] = [];
  for (let at = 0; at < names.length; at += columns)
    rows.push(
      names
        .slice(at, at + columns)
        .map((name) => [
          [{ text: HOUSE_SIGNATURE_RULE }],
          [{ text: name.trim() || "[name]", bold: true }],
          [{ text: office }],
        ]),
    );
  return {
    num: "",
    title: "",
    segs: [normal(names.map((name) => houseSignature(name, office)).join("\n\n"))],
    table: { rows, width, indent, before },
  };
}

export function corporateExportSpec(document: {
  kind: CorporateDocumentKind;
  content: CorporateContent | CorporateContentV2;
}): CorporateExportSpec {
  const v2 = isV2(document.content)
    ? document.content
    : legacyToV2(document.kind, document.content as CorporateContent);
  if (isInstrumentKind(document.kind)) {
    const kind = document.kind;
    const company = supplied(v2.particulars["companyName"] ?? "", "company name");
    const office = v2.particulars["registeredOffice"] ?? "";
    const minutes = kind === "board_minutes";
    const members = kind === "shareholder_written_resolution";

    // Each instrument is headed as what it is. A set of minutes recording a
    // meeting that happened must not go out titled as a written resolution.
    const heading = minutes
      ? "MINUTES OF A MEETING OF THE DIRECTORS OF"
      : members
        ? "WRITTEN RESOLUTIONS OF THE MEMBERS OF"
        : "WRITTEN RESOLUTIONS OF THE DIRECTORS OF";
    const signatureRole = minutes ? "Chair" : members ? "Member" : "Director";

    const byGroup = (group: CorporateGroup) => v2.parts.filter((p) => p.group === group);
    const opening = byGroup("company");
    const attendance = byGroup("attendance");
    const recitals = byGroup("recital");
    const consideration = byGroup("consideration");
    const resolutions = [...byGroup("resolution"), ...byGroup("authority")];
    const execution = byGroup("execution");
    const signatories = v2.directors.filter((name) => name.trim()).length
      ? v2.directors.filter((name) => name.trim())
      : [""];
    const label = (text: string) =>
      paragraph(text, { marks: { b: true }, layout: edged(HOUSE_RESOLUTION.label.after) });
    const prose = edged(HOUSE_RESOLUTION.paragraph.after);

    return {
      title: `${heading}\n${company.toUpperCase()}`,
      subtitle: minutes
        ? `Held on ${supplied(houseLongDate(v2.particulars["date"] ?? ""), "date")}`
        : houseResolutionDate(v2.particulars["date"] ?? ""),
      kind: "resolution",
      numbering: "literal",
      furniture: false,
      clauses: [
        ...(opening.length
          ? opening.map((part, index) =>
              written(part, `company details ${index + 1}`, edged(HOUSE_RESOLUTION.opening.after)),
            )
          : [
              paragraph(
                houseOpening({
                  companyName: v2.particulars["companyName"] ?? "",
                  registeredOffice: office,
                  organ: members ? "members" : "directors",
                }),
                { align: "justify", layout: edged(HOUSE_RESOLUTION.opening.after) },
              ),
            ]),
        ...(attendance.length
          ? [
              label(minutes ? "Present:" : "Attendance:"),
              ...attendance.map((part, index) => written(part, `attendance ${index + 1}`, prose)),
            ]
          : []),
        ...(recitals.length
          ? [
              label(minutes ? "Background:" : "Considering that:"),
              ...recitals.map((part, index) =>
                written(
                  part,
                  `recital ${index + 1}`,
                  hung(HOUSE_RESOLUTION.recital, index, recitals.length),
                ),
              ),
            ]
          : []),
        ...(consideration.length
          ? [
              label("The board considered:"),
              ...consideration.map((part, index) =>
                written(part, `consideration ${index + 1}`, prose),
              ),
            ]
          : []),
        label(minutes ? "It was resolved that:" : "It is resolved that:"),
        ...(resolutions.length
          ? resolutions.map((part, index) =>
              written(
                part,
                `resolution ${index + 1}`,
                hung(HOUSE_RESOLUTION.resolution, index, resolutions.length),
              ),
            )
          : [
              lettered(
                alphaMarker(0, false),
                "",
                "resolution 1",
                hung(HOUSE_RESOLUTION.resolution, 0, 1),
              ),
            ]),
        ...execution.map((part, index) => written(part, `execution ${index + 1}`, prose)),
        signatureTable(signatories, signatureRole),
      ],
    };
  }

  const p = v2.particulars;
  const field = (key: string) => (p[key] ?? "").trim();
  const addressee = field("addressee");
  // "Dear Sir/Madam," unless the lawyer chose otherwise. A letter written
  // before there was a salutation, whose addressee line already says "To Whom
  // It May Concern", is not given a second greeting under it.
  const salutation =
    field("salutation") ||
    (/to whom it may concern/i.test(addressee) ? "" : HOUSE_LETTER.salutations[0]);
  const unaddressed = /^to whom it may concern/i.test(salutation);
  const closing = field("closing") || HOUSE_LETTER.closings[0];
  const entity = field("signatoryEntity");
  const bodyParts = v2.parts.filter((part) => part.group === "body");
  const purposeParts = v2.parts.filter((part) => part.group === "purpose");
  // A body part written as plain paragraphs goes out one paragraph per clause,
  // as the form-based letter did; a formatted one keeps its shape.
  const body: { text: string; paras?: ExportPara[] }[] = bodyParts.flatMap((part) => {
    const text = docToText(part.doc);
    if (!text.trim()) return [];
    const paras = docToParas(part.doc);
    const formatted = paras.some(
      (para) => para.heading || para.list || para.quote || para.align || para.runs.some((r) => r.m),
    );
    return formatted ? [{ paras, text }] : paragraphs(text).map((t) => ({ text: t }));
  });
  const name = supplied(field("signatoryName"), "signatory name");
  const title = supplied(field("signatoryTitle"), "signatory title");
  const block = [HOUSE_SIGNATURE_RULE, name, title, ...(entity ? [entity] : [])].join("\n");
  // The address blocks are left-aligned outright: the document default is
  // justified, and Word stretches each line of a justified block that ends in
  // a line break across the page.
  const left = { align: "left" as const };
  return {
    title: "",
    kind: "letter",
    numbering: "literal",
    furniture: false,
    clauses: [
      // The firm's order, from its export request and its confirmations: the
      // reference, the date, who writes, to whom, the greeting, the subject.
      ...(field("reference") ? [paragraph(`Our Ref: ${field("reference")}`, left)] : []),
      paragraph(supplied(houseLongDate(field("date")), "date"), { align: "right" }),
      ...(field("sender") ? [paragraph(field("sender"), left)] : []),
      ...(addressee
        ? [paragraph(addressee, left)]
        : unaddressed
          ? []
          : [paragraph(renderPlaceholder("addressee"), left)]),
      ...(salutation ? [paragraph(salutation, left)] : []),
      paragraph(`RE: ${supplied(field("subject"), "subject").toUpperCase()}`, {
        align: "center",
        marks: { b: true, u: true },
      }),
      ...(body.length
        ? body.map((item) =>
            item.paras
              ? { num: "", title: "", segs: [normal(item.text)], paras: item.paras }
              : paragraph(item.text, { align: "justify" }),
          )
        : [paragraph(renderPlaceholder("letter body"), { align: "justify" })]),
      // A purpose section is asked for by the general letter. A letter that has
      // none, as a confirmation of address does not, prints no blank for one.
      ...purposeParts.map((part) => {
        const text = docToText(part.doc);
        return text.trim()
          ? paragraph(text, { align: "justify" })
          : paragraph(renderPlaceholder("purpose for issuing this letter"), { align: "justify" });
      }),
      paragraph(closing, { ...left, layout: { after: HOUSE_LETTER.signingSpace } }),
      {
        num: "",
        title: "",
        segs: [normal(block)],
        paras: [
          {
            runs: [
              normal(`${HOUSE_SIGNATURE_RULE}\n`),
              normal(name, { b: true }),
              normal(`\n${[title, ...(entity ? [entity] : [])].join("\n")}`),
            ],
            align: "left",
          },
        ],
        layout: { before: 0 },
      },
    ],
  };
}
