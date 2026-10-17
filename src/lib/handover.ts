/**
 * Handover notes: an email written in Scripta, with tables and attachments,
 * that leaves as a draft for the author's own mail client to send.
 *
 * Scripta still sends nothing. "Open in email" hands over an .eml file marked
 * unsent, which Outlook and Apple Mail open as a new message with the body,
 * its tables and every attachment already in place; the author checks it and
 * presses Send there. A handover is its author's alone.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ClauseDoc, DocNode } from "@/wireframe/clause-doc";

export type HandoverAttachment = {
  id: string;
  name: string;
  fileRef: string;
  bytes: number;
  mime: string;
};

export type Handover = {
  id: string;
  to: string;
  cc: string;
  subject: string;
  body: ClauseDoc | null;
  attachments: HandoverAttachment[];
  status: "draft" | "sent";
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type HandoverPatch = Partial<
  Pick<Handover, "to" | "cc" | "subject" | "body" | "attachments">
>;

export const handoversKey = (workspaceId: string | null) => ["handovers", workspaceId];

/* ------------------------------------------------------------ document */

const text = (t: string): DocNode => ({ type: "text", text: t });
const para = (t = ""): DocNode => ({ type: "paragraph", ...(t ? { content: [text(t)] } : {}) });
const heading = (t: string): DocNode => ({
  type: "heading",
  attrs: { level: 2 },
  content: [text(t)],
});
const cell = (t: string, header = false): DocNode => ({
  type: header ? "tableHeader" : "tableCell",
  content: [para(t)],
});

/** A table: a heading row, then the rows given (one blank row if none). */
export function tableNode(head: string[], rows: string[][]): DocNode {
  const body = rows.length ? rows : [head.map(() => "")];
  return {
    type: "table",
    content: [
      { type: "tableRow", content: head.map((h) => cell(h, true)) },
      ...body.map((row) => ({ type: "tableRow", content: row.map((c) => cell(c)) })),
    ],
  };
}

export const TASK_TABLE_HEAD = ["Task", "Client / matter", "Status", "Due", "Next step"];

/** The skeleton a handover starts from. Every part can be rewritten or removed. */
export function starterDoc(): ClauseDoc {
  return {
    type: "doc",
    content: [
      para("Hi all,"),
      para("Please see my handover below."),
      heading("Summary"),
      para(),
      heading("Matters and tasks"),
      tableNode(TASK_TABLE_HEAD, []),
      heading("Key dates"),
      tableNode(["Date", "What happens"], []),
      heading("Contacts"),
      tableNode(["Name", "Role", "Email / phone"], []),
      heading("Outstanding issues"),
      { type: "bulletList", content: [{ type: "listItem", content: [para()] }] },
      para("Thanks,"),
    ],
  };
}

const cellText = (node: DocNode): string =>
  node.text ?? (node.content ?? []).map(cellText).join("");

const isTaskTable = (node: DocNode) =>
  node.type === "table" &&
  JSON.stringify((node.content?.[0]?.content ?? []).map(cellText)) ===
    JSON.stringify(TASK_TABLE_HEAD);

/**
 * Put tasks into the handover's tasks table: appended to the one already in
 * the note (its blank rows dropped), or as a new table at the end when the
 * writer has removed it.
 */
export function addTaskRows(doc: ClauseDoc, rows: string[][]): ClauseDoc {
  const fresh = tableNode(TASK_TABLE_HEAD, rows).content!.slice(1);
  const at = doc.content.findIndex(isTaskTable);
  if (at === -1) return { ...doc, content: [...doc.content, tableNode(TASK_TABLE_HEAD, rows)] };
  const table = doc.content[at]!;
  const [head, ...body] = table.content ?? [];
  const kept = body.filter((row) => (row.content ?? []).some((c) => cellText(c).trim()));
  const content = [...doc.content];
  content[at] = { ...table, content: [head!, ...kept, ...fresh] };
  return { ...doc, content };
}

/* ---------------------------------------------------------------- email */

/**
 * The editor's HTML, dressed for a mail client. Outlook ignores stylesheets,
 * so the rules and padding a table needs are written onto each element.
 */
export function emailHtml(bodyHtml: string): string {
  const td = "border:1px solid #a8b0ac;padding:6px 8px;vertical-align:top;text-align:left";
  const styled = bodyHtml
    .replace(
      /<table[^>]*>/g,
      '<table style="border-collapse:collapse;width:100%;margin:6px 0 14px">',
    )
    .replace(/<colgroup>.*?<\/colgroup>/g, "")
    .replace(/<th([^>]*)>/g, `<th$1 style="${td};background:#edefec;font-weight:600">`)
    .replace(/<td([^>]*)>/g, `<td$1 style="${td}">`)
    .replace(/<(th|td)([^>]*)><p>(.*?)<\/p>/g, "<$1$2>$3")
    .replace(/<h2>/g, '<h2 style="font-size:15px;margin:18px 0 6px">')
    .replace(/<p><\/p>/g, "<p>&nbsp;</p>");
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    `<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222">${styled}</body></html>`
  );
}

/** UTF-8 bytes as base64, wrapped at 76 characters as MIME requires. */
function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return (btoa(bin).match(/.{1,76}/g) ?? []).join("\r\n");
}

const utf8 = (s: string) => new TextEncoder().encode(s);

/** A header value, encoded when it is not plain ASCII. */
const header = (s: string) =>
  /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${base64(utf8(s)).replace(/\r\n/g, "")}?=`;

/** A filename parameter, quoted, with non-ASCII names encoded the way mail clients read. */
const fileParam = (name: string) => `"${header(name.replace(/"/g, "'"))}"`;

export type EmlInput = {
  to: string;
  cc: string;
  subject: string;
  html: string;
  plain: string;
  attachments: { name: string; mime: string; bytes: Uint8Array }[];
};

/**
 * An unsent email as one .eml file. `X-Unsent: 1` is what makes Outlook open it
 * as a new message to send rather than as one already received.
 */
export function buildEml(input: EmlInput, boundarySeed = Date.now().toString(36)): string {
  const mixed = `=_scripta_mixed_${boundarySeed}`;
  const alt = `=_scripta_alt_${boundarySeed}`;
  const lines = [
    "X-Unsent: 1",
    `To: ${header(input.to)}`,
    ...(input.cc.trim() ? [`Cc: ${header(input.cc)}`] : []),
    `Subject: ${header(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64(utf8(input.plain)),
    `--${alt}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64(utf8(input.html)),
    `--${alt}--`,
  ];
  for (const file of input.attachments)
    lines.push(
      `--${mixed}`,
      `Content-Type: ${file.mime || "application/octet-stream"}; name=${fileParam(file.name)}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename=${fileParam(file.name)}`,
      "",
      base64(file.bytes),
    );
  lines.push(`--${mixed}--`, "");
  return lines.join("\r\n");
}

/* ----------------------------------------------------------------- data */

const row = (r: any): Handover => ({
  id: r.id,
  to: r.to_line ?? "",
  cc: r.cc_line ?? "",
  subject: r.subject ?? "",
  body: (r.body as ClauseDoc | null) ?? null,
  attachments: Array.isArray(r.attachments) ? (r.attachments as HandoverAttachment[]) : [],
  status: r.status === "sent" ? "sent" : "draft",
  sentAt: r.sent_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  archivedAt: r.archived_at ?? null,
});

export async function listHandovers(workspaceId: string): Promise<Handover[]> {
  const { data, error } = await supabase
    .from("handovers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(row);
}

export async function createHandover(workspaceId: string, subject: string): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await supabase.from("handovers").insert({
    id,
    workspace_id: workspaceId,
    subject,
    body: starterDoc() as never,
  });
  if (error) throw new Error(error.message);
  return id;
}

export async function saveHandover(id: string, patch: HandoverPatch): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.to !== undefined) update["to_line"] = patch.to;
  if (patch.cc !== undefined) update["cc_line"] = patch.cc;
  if (patch.subject !== undefined) update["subject"] = patch.subject;
  if (patch.body !== undefined) update["body"] = patch.body;
  if (patch.attachments !== undefined) update["attachments"] = patch.attachments;
  const { error } = await supabase
    .from("handovers")
    .update(update as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setHandoverSent(id: string, sent: boolean): Promise<void> {
  const { error } = await supabase
    .from("handovers")
    .update({ status: sent ? "sent" : "draft", sent_at: sent ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setHandoverArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from("handovers")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteHandover(id: string): Promise<void> {
  const { error } = await supabase.from("handovers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
