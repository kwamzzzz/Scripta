/**
 * Reading a chart someone already made, into candidates — never straight
 * into the records.
 *
 * An import is a proposal: boxes become candidate nodes, lines become
 * candidate edges, and each candidate is matched against the people, roles and
 * entities the client already has. Whatever cannot be read is listed rather
 * than guessed. Nothing is written until the lawyer publishes.
 *
 * Parsing is done with plain string handling rather than a DOM parser, so it
 * runs the same in the browser and in tests.
 */
import JSZip from "jszip";

export type ChartKind = "reporting" | "ownership";

export type CandidateNode = {
  key: string;
  title: string;
  subtitle: string;
  /** Position in the source, when it had one: used to tell parent from child. */
  y?: number;
  x?: number;
};

export type CandidateEdge = {
  from: string;
  to: string;
  label: string;
  percent: number | null;
  /** Worked out from where boxes sit, because the source had no line. */
  inferred: boolean;
};

export type ImportJob = {
  kind: ChartKind;
  sourceName: string;
  format: "csv" | "xlsx" | "drawio" | "pptx";
  nodes: CandidateNode[];
  edges: CandidateEdge[];
  /** Things in the source that could not be read into the chart. */
  unresolved: string[];
};

export const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/\b(limited|ltd|llc|plc|inc|fzco|fze|the)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

export const parsePercent = (s: string): number | null => {
  const m = /(\d+(?:\.\d+)?)\s*%/.exec(s) ?? /^\s*(\d+(?:\.\d+)?)\s*$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 100 ? n : null;
};

/* -------------------------------------------------------------------- csv */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim()));
}

/* ------------------------------------------------------------------- xlsx */

const columnIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** The first worksheet of a workbook, as rows of text. */
export async function parseXlsx(data: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const zip = await JSZip.loadAsync(data);
  const shared: string[] = [];
  const sst = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (sst)
    for (const si of sst.match(/<si>[\s\S]*?<\/si>/g) ?? [])
      shared.push(
        decodeEntities(
          (si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
            .map((t) => t.replace(/<[^>]+>/g, ""))
            .join(""),
        ),
      );

  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = await zip.file("xl/workbook.xml")?.async("string");
  const wbRels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  const firstSheet = workbook ? /<sheet [^>]*r:id="([^"]+)"/.exec(workbook)?.[1] : undefined;
  if (firstSheet && wbRels) {
    const target =
      new RegExp(`<Relationship [^>]*Id="${firstSheet}"[^>]*Target="([^"]+)"`).exec(wbRels)?.[1] ??
      new RegExp(`<Relationship [^>]*Target="([^"]+)"[^>]*Id="${firstSheet}"`).exec(wbRels)?.[1];
    if (target)
      sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheet = await zip.file(sheetPath)?.async("string");
  if (!sheet) throw new Error("The workbook has no worksheet Scripta can read.");

  const rows: string[][] = [];
  for (const rowXml of sheet.match(/<row[^>]*>[\s\S]*?<\/row>|<row[^>]*\/>/g) ?? []) {
    const row: string[] = [];
    for (const c of rowXml.match(/<c [^>]*\/>|<c [^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const ref = /r="([A-Z]+\d+)"/.exec(c)?.[1] ?? "";
      const type = /t="([^"]+)"/.exec(c)?.[1] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1];
      let value = "";
      if (type === "s" && v !== undefined) value = shared[Number(v)] ?? "";
      else if (type === "inlineStr")
        value = decodeEntities(
          (c.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
            .map((t) => t.replace(/<[^>]+>/g, ""))
            .join(""),
        );
      else if (v !== undefined) value = decodeEntities(v);
      const index = ref ? columnIndex(ref) : row.length;
      while (row.length < index) row.push("");
      row[index] = value;
    }
    if (row.some((v) => v.trim())) rows.push(row);
  }
  return rows;
}

/* ---------------------------------------------------------- column mapping */

export type ColumnMap = {
  /** Reporting: role title, holder's name, and whom the role reports to. */
  title: number | null;
  name: number | null;
  reportsTo: number | null;
  /** Ownership: holder, held entity, share. */
  parent: number | null;
  child: number | null;
  percent: number | null;
};

const find = (header: string[], words: RegExp) => {
  const i = header.findIndex((h) => words.test(h.toLowerCase()));
  return i < 0 ? null : i;
};

/** A first guess at which column is which, from the header row. */
export function guessColumns(header: string[]): ColumnMap {
  return {
    title: find(header, /^(title|role|position|job)/),
    name: find(header, /(^name$|holder|person|employee|incumbent|full name)/),
    reportsTo: find(header, /(reports|manager|supervisor|line manager|parent role)/),
    parent: find(header, /(parent|owner|holder|shareholder|held by)/),
    child: find(header, /(child|subsidiary|entity|company|held)$/),
    percent: find(header, /(percent|%|stake|interest|^shares?$|^holding$)/),
  };
}

/** Rows (header first) into a job, using the column map the lawyer confirmed. */
export function rowsToJob(
  rows: string[][],
  kind: ChartKind,
  map: ColumnMap,
  sourceName: string,
  format: "csv" | "xlsx",
): ImportJob {
  const body = rows.slice(1);
  const at = (row: string[], i: number | null) => (i === null ? "" : (row[i] ?? "").trim());
  const nodes = new Map<string, CandidateNode>();
  const edges: CandidateEdge[] = [];
  const unresolved: string[] = [];

  if (kind === "reporting") {
    if (map.title === null && map.name === null) {
      return {
        kind,
        sourceName,
        format,
        nodes: [],
        edges: [],
        unresolved: ["No column holds a role title or a name."],
      };
    }
    body.forEach((row, i) => {
      const title = at(row, map.title) || at(row, map.name);
      if (!title) {
        unresolved.push(`Row ${i + 2} has no title or name.`);
        return;
      }
      const key = normalise(title) || `row-${i}`;
      nodes.set(key, { key, title, subtitle: map.title !== null ? at(row, map.name) : "" });
    });
    // Reports-to may name the manager's role or the manager's name.
    const byName = new Map<string, string>();
    for (const n of nodes.values()) {
      byName.set(normalise(n.title), n.key);
      if (n.subtitle) byName.set(normalise(n.subtitle), n.key);
    }
    body.forEach((row, i) => {
      const title = at(row, map.title) || at(row, map.name);
      const to = at(row, map.reportsTo);
      if (!title || !to) return;
      const parent = byName.get(normalise(to));
      if (!parent) unresolved.push(`Row ${i + 2}: "${to}" is not a role or person in the sheet.`);
      else if (parent !== (normalise(title) || `row-${i}`))
        edges.push({
          from: parent,
          to: normalise(title) || `row-${i}`,
          label: "",
          percent: null,
          inferred: false,
        });
    });
  } else {
    if (map.parent === null || map.child === null) {
      return {
        kind,
        sourceName,
        format,
        nodes: [],
        edges: [],
        unresolved: ["Choose the holder column and the held entity column."],
      };
    }
    body.forEach((row, i) => {
      const parent = at(row, map.parent);
      const child = at(row, map.child);
      if (!parent || !child) {
        unresolved.push(`Row ${i + 2} is missing a holder or an entity.`);
        return;
      }
      for (const name of [parent, child]) {
        const key = normalise(name) || name;
        if (!nodes.has(key)) nodes.set(key, { key, title: name, subtitle: "" });
      }
      const raw = at(row, map.percent);
      const percent = raw ? parsePercent(raw) : null;
      if (raw && percent === null)
        unresolved.push(`Row ${i + 2}: could not read "${raw}" as a percentage.`);
      edges.push({
        from: normalise(parent) || parent,
        to: normalise(child) || child,
        label: percent === null ? "" : `${percent}%`,
        percent,
        inferred: false,
      });
    });
  }
  return { kind, sourceName, format, nodes: [...nodes.values()], edges, unresolved };
}

/* ----------------------------------------------------------------- draw.io */

const inflateRaw = async (bytes: Uint8Array): Promise<string> => {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
};

const base64Bytes = (b64: string) => {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeEntities(m[1]!) : undefined;
};

/** Text of a draw.io label, which may be HTML: lines split at <br> and <div>. */
const labelLines = (value: string) =>
  decodeEntities(value)
    .replace(/<br\s*\/?>|<\/div>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((l) => decodeEntities(l).trim())
    .filter(Boolean);

export async function parseDrawio(
  text: string,
  kind: ChartKind,
  sourceName: string,
): Promise<ImportJob> {
  let model = text;
  if (!/<mxGraphModel/.test(text)) {
    const diagram = /<diagram[^>]*>([\s\S]*?)<\/diagram>/.exec(text)?.[1]?.trim();
    if (!diagram) throw new Error("This file has no draw.io diagram in it.");
    model = decodeURIComponent(await inflateRaw(base64Bytes(diagram)));
  }
  const nodes: CandidateNode[] = [];
  const edges: CandidateEdge[] = [];
  const unresolved: string[] = [];
  const known = new Set<string>();
  const cells = model.match(/<mxCell\b[^>]*?(?:\/>|>[\s\S]*?<\/mxCell>)/g) ?? [];
  const openTag = (cell: string) => /<mxCell\b[^>]*>/.exec(cell)?.[0] ?? cell;
  const edgeIds = new Set(
    cells
      .map(openTag)
      .filter((t) => attr(t, "edge") === "1")
      .map((t) => attr(t, "id") ?? ""),
  );
  // Text drawn on a line is a child cell of that line, not a box.
  const labels = new Map<string, string>();
  for (const cell of cells) {
    const open = openTag(cell);
    if (attr(open, "vertex") !== "1") continue;
    const id = attr(open, "id")!;
    const parent = attr(open, "parent") ?? "";
    const lines = labelLines(attr(open, "value") ?? "");
    if (edgeIds.has(parent)) {
      if (lines.length) labels.set(parent, lines.join(" "));
      continue;
    }
    if (!lines.length) continue;
    const geometry = /<mxGeometry\b[^>]*>/.exec(cell)?.[0] ?? "";
    known.add(id);
    nodes.push({
      key: id,
      title: lines[0]!,
      subtitle: lines.slice(1).join(" "),
      y: Number(attr(geometry, "y") ?? 0),
      x: Number(attr(geometry, "x") ?? 0),
    });
  }
  for (const cell of cells) {
    const open = openTag(cell);
    if (attr(open, "edge") !== "1") continue;
    const source = attr(open, "source");
    const target = attr(open, "target");
    const label =
      labelLines(attr(open, "value") ?? "").join(" ") || labels.get(attr(open, "id") ?? "") || "";
    if (!source || !target || !known.has(source) || !known.has(target)) {
      unresolved.push(`A line${label ? ` labelled "${label}"` : ""} is not attached to two boxes.`);
      continue;
    }
    edges.push({ from: source, to: target, label, percent: parsePercent(label), inferred: false });
  }
  return orient({ kind, sourceName, format: "drawio", nodes, edges, unresolved });
}

/* -------------------------------------------------------------- powerpoint */

export async function parsePptx(
  data: ArrayBuffer | Uint8Array,
  kind: ChartKind,
  sourceName: string,
): Promise<ImportJob> {
  const zip = await JSZip.loadAsync(data);
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  if (!slides.length) throw new Error("This PowerPoint file has no slides.");
  const unresolved: string[] = [];
  let best: { nodes: CandidateNode[]; edges: CandidateEdge[]; slide: number } | null = null;
  for (const [index, path] of slides.entries()) {
    const xml = await zip.file(path)!.async("string");
    const nodes: CandidateNode[] = [];
    const edges: CandidateEdge[] = [];
    for (const sp of xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []) {
      const id = /<p:cNvPr [^>]*id="(\d+)"/.exec(sp)?.[1];
      const paragraphs = (sp.match(/<a:p>[\s\S]*?<\/a:p>|<a:p\/>/g) ?? [])
        .map((p) =>
          decodeEntities(
            (p.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? [])
              .map((t) => t.replace(/<[^>]+>/g, ""))
              .join(""),
          ).trim(),
        )
        .filter(Boolean);
      if (!id || !paragraphs.length) continue;
      // Containers, tags, notes and legends Scripta drew are drawing, not boxes.
      if (/<p:cNvPr [^>]*name="Scripta · /.test(sp)) continue;
      // A free text box is a title or a note, unless it is a percentage beside a line.
      if (/txBox="1"/.test(sp) && !/%/.test(paragraphs.join(" "))) continue;
      const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(sp);
      nodes.push({
        key: `${index + 1}:${id}`,
        title: paragraphs[0]!,
        subtitle: paragraphs.slice(1).join(" "),
        x: off ? Number(off[1]) : 0,
        y: off ? Number(off[2]) : 0,
      });
    }
    for (const cxn of xml.match(/<p:cxnSp>[\s\S]*?<\/p:cxnSp>/g) ?? []) {
      if (/<p:cNvPr [^>]*name="Scripta · /.test(cxn)) continue;
      const st = /<a:stCxn id="(\d+)"/.exec(cxn)?.[1];
      const end = /<a:endCxn id="(\d+)"/.exec(cxn)?.[1];
      if (!st || !end) {
        unresolved.push(`Slide ${index + 1}: a connector is not attached at both ends.`);
        continue;
      }
      edges.push({
        from: `${index + 1}:${st}`,
        to: `${index + 1}:${end}`,
        label: "",
        percent: null,
        inferred: false,
      });
    }
    if (!best || nodes.length > best.nodes.length) best = { nodes, edges, slide: index + 1 };
  }
  if (!best || !best.nodes.length) {
    const smartArt = Object.keys(zip.files).some((p) => p.startsWith("ppt/diagrams/"));
    throw new Error(
      smartArt
        ? "This deck draws its chart as SmartArt, which Scripta cannot read yet. Convert the SmartArt to shapes in PowerPoint and import again."
        : "No boxes with text were found on any slide.",
    );
  }
  const nodes = best.nodes.filter(
    (n) => !(parsePercent(n.title) !== null && /%/.test(n.title) && !n.subtitle),
  );
  const labels = best.nodes.filter((n) => !nodes.includes(n));
  const job = orient({ kind, sourceName, format: "pptx", nodes, edges: best.edges, unresolved });
  // Percentages drawn as separate text next to a line: attach each to the nearest edge end.
  for (const label of labels) {
    const nearest = [...job.edges]
      .map((e) => {
        const child = nodes.find((n) => n.key === e.to);
        return {
          e,
          d: child
            ? Math.hypot((child.x ?? 0) - (label.x ?? 0), (child.y ?? 0) - (label.y ?? 0))
            : Infinity,
        };
      })
      .sort((a, b) => a.d - b.d)[0];
    if (nearest && Number.isFinite(nearest.d) && !nearest.e.label) {
      nearest.e.label = label.title;
      nearest.e.percent = parsePercent(label.title);
    }
  }
  if (!best.edges.length && nodes.length > 1) inferFromPosition(job);
  if (slides.length > 1)
    job.unresolved.push(`Read slide ${best.slide}, the one with the most boxes.`);
  return job;
}

/* ------------------------------------------------------------ orientation */

/**
 * A line in a drawing has no reliable direction — people draw from child to
 * parent as often as the other way. The box higher on the page is taken as
 * the manager or the holder, which is how charts are drawn.
 */
function orient(job: ImportJob): ImportJob {
  const at = new Map(job.nodes.map((n) => [n.key, n]));
  job.edges = job.edges
    .filter((e) => at.has(e.from) && at.has(e.to))
    .map((e) => {
      const a = at.get(e.from)!;
      const b = at.get(e.to)!;
      return (a.y ?? 0) > (b.y ?? 0) ? { ...e, from: e.to, to: e.from } : e;
    });
  return job;
}

/**
 * No lines at all: each box is placed under the nearest box on the row above
 * that overlaps it. Marked as inferred, so the review asks.
 */
function inferFromPosition(job: ImportJob) {
  const rows = [...new Set(job.nodes.map((n) => n.y ?? 0))].sort((a, b) => a - b);
  for (const n of job.nodes) {
    const above = rows.filter((y) => y < (n.y ?? 0)).pop();
    if (above === undefined) continue;
    const candidates = job.nodes.filter((m) => (m.y ?? 0) === above);
    const nearest = candidates.sort(
      (a, b) => Math.abs((a.x ?? 0) - (n.x ?? 0)) - Math.abs((b.x ?? 0) - (n.x ?? 0)),
    )[0];
    if (nearest)
      job.edges.push({ from: nearest.key, to: n.key, label: "", percent: null, inferred: true });
  }
  if (job.edges.length)
    job.unresolved.push(
      "The slide has no connectors; reporting lines were worked out from where the boxes sit.",
    );
}

/* ------------------------------------------------------------------ review */

export type Decision =
  | { kind: "match"; id: string; as: "role" | "entity" | "person" }
  | { kind: "new"; as: "role" | "entity" | "outside" }
  | { kind: "ignore" };

export type Existing = {
  roles: { id: string; title: string; holder: string }[];
  entities: { id: string; name: string; shortName: string }[];
  people: { id: string; fullName: string }[];
};

/** The first proposal for each candidate: a match by name where there is one. */
export function proposeDecisions(job: ImportJob, existing: Existing): Record<string, Decision> {
  const out: Record<string, Decision> = {};
  const held = new Set(job.edges.map((e) => e.to));
  for (const n of job.nodes) {
    const t = normalise(n.title);
    if (job.kind === "reporting") {
      const role =
        existing.roles.find(
          (r) =>
            normalise(r.title) === t &&
            (!n.subtitle || !r.holder || normalise(r.holder) === normalise(n.subtitle)),
        ) ?? existing.roles.find((r) => normalise(r.title) === t);
      out[n.key] = role ? { kind: "match", id: role.id, as: "role" } : { kind: "new", as: "role" };
    } else {
      const entity = existing.entities.find(
        (e) => normalise(e.name) === t || (e.shortName && normalise(e.shortName) === t),
      );
      const person = existing.people.find((p) => normalise(p.fullName) === t);
      out[n.key] = entity
        ? { kind: "match", id: entity.id, as: "entity" }
        : person
          ? { kind: "match", id: person.id, as: "person" }
          : held.has(n.key)
            ? { kind: "new", as: "entity" }
            : { kind: "new", as: "outside" };
    }
  }
  return out;
}

export const importSummary = (job: ImportJob, decisions: Record<string, Decision>) => {
  const matched = job.nodes.filter((n) => decisions[n.key]?.kind === "match").length;
  const labelled = job.edges.filter((e) => e.percent !== null).length;
  const inferred = job.edges.filter((e) => e.inferred).length;
  return {
    nodes: job.nodes.length,
    matched,
    edges: job.edges.length,
    percentRead: labelled,
    needsConfirmation: job.nodes.length - matched + inferred + job.unresolved.length,
  };
};
