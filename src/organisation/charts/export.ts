/**
 * Chart files, drawn from the composition — never from the screen.
 *
 * The PowerPoint file is real shapes and connectors a lawyer can move and
 * retype; the PDF is vector at any paper size. Both are written by hand, for
 * the reason `src/lib/export/pdf.ts` gives: the parts needed are few and fully
 * known. Every file carries the as-at date, because an organogram without one
 * is a claim about a moment nobody can identify.
 *
 * Containers, notes, tags and the legend are drawing, not records. In the
 * PowerPoint file their shapes are named "Scripta · …" so reading the deck
 * back into Scripta takes the cards and lines and leaves the drawing.
 */
import { createZip, utf8 } from "@/lib/export/zip";
import { pdfString, winAnsi } from "@/lib/export/pdf";
import { textWidth, type Point } from "./layout";
import { TAG_FILL, type ComposedNode, type Composition, type LegendItem } from "./compose";

export type ChartMeta = {
  /** "Organogram — Neemba Group". */
  title: string;
  /** "As at 16 September 2026 · Scripta". */
  footer: string;
};

export type Paper = "A3" | "A4";

export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const SVG_MIME = "image/svg+xml";
export const CSV_MIME = "text/csv";

/** Names given to drawing shapes in a deck, so an import leaves them out. */
export const DRAWING_PREFIX = "Scripta · ";

const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );

const DASH_SVG = { none: "", dotted: "2 3", dashed: "6 4" } as const;

/** The arrowhead at the end of a line: a small triangle along its last run. */
const arrowHead = (points: Point[], size: number): Point[] => {
  const end = points[points.length - 1]!;
  const prev = points[points.length - 2] ?? end;
  const len = Math.hypot(end.x - prev.x, end.y - prev.y) || 1;
  const ux = (end.x - prev.x) / len;
  const uy = (end.y - prev.y) / len;
  const bx = end.x - ux * size;
  const by = end.y - uy * size;
  return [
    end,
    { x: bx - uy * size * 0.5, y: by + ux * size * 0.5 },
    { x: bx + uy * size * 0.5, y: by - ux * size * 0.5 },
  ];
};

/** Where a card's tag sits: a small pill over its top-right corner. */
export const tagBox = (n: ComposedNode) => {
  const w = Math.round(textWidth(n.tag ?? "", 8, true) + 12);
  return { x: n.x + n.w - w - 6, y: n.y - 7, w, h: 14 };
};

/** Where a container's label sits: a pill in its bottom-left corner. */
export const containerLabelBox = (c: Composition["containers"][number]) => {
  const w = Math.round(textWidth(c.label.toUpperCase(), 9, true) + 16);
  return { x: c.x + 10, y: c.y + c.h - 22, w, h: 16 };
};

/**
 * Where the drawing actually is: every box, tag, line, share, container, note
 * and the legend. A page centres this, not the layout's allowance around it,
 * so a chart sits in the middle of the paper rather than off to one side or
 * pushed up under the title.
 */
export function drawnBounds(c: Composition) {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    xs.push(x0, x1);
    ys.push(y0, y1);
  };
  for (const n of c.nodes) {
    add(n.x, n.y, n.x + n.w, n.y + n.h);
    if (n.tag) {
      const t = tagBox(n);
      add(t.x, t.y, t.x + t.w, t.y + t.h);
    }
  }
  for (const e of c.edges) {
    for (const p of e.points) add(p.x, p.y, p.x, p.y);
    if (e.text)
      add(e.textAt.x, e.textAt.y - 10, e.textAt.x + textWidth(e.text, 10, true), e.textAt.y + 2);
  }
  for (const k of c.containers) add(k.x, k.y, k.x + k.w, k.y + k.h);
  for (const note of c.notes) add(note.x, note.y, note.x + note.w, note.y + note.h);
  if (c.legend) add(c.legend.x, c.legend.y, c.legend.x + c.legend.w, c.legend.y + c.legend.h);
  if (!xs.length) return { x: 0, y: 0, w: Math.max(c.width, 1), h: Math.max(c.height, 1) };
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

/* -------------------------------------------------------------------- svg */

const legendSwatchSvg = (i: LegendItem, x: number, y: number) =>
  i.shape === "line"
    ? `<line x1="${x}" y1="${y + 5}" x2="${x + 22}" y2="${y + 5}" stroke="${i.stroke}" stroke-width="1.5"${i.dash && i.dash !== "none" ? ` stroke-dasharray="${DASH_SVG[i.dash]}"` : ""}/>`
    : `<rect x="${x}" y="${y}" width="22" height="11" rx="2" fill="${i.fill}" stroke="${i.stroke}"${i.dash === "dashed" ? ' stroke-dasharray="3 2"' : ""}/>`;

export function chartSvg(c: Composition, meta: ChartMeta): string {
  const top = 48;
  const w = Math.max(c.width, 480);
  const h = c.height + top + 36;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Helvetica, Arial, sans-serif">`,
    `<rect width="${w}" height="${h}" fill="#fff"/>`,
    `<text x="24" y="30" font-size="16" font-weight="700" fill="#123247">${xml(meta.title)}</text>`,
    `<g transform="translate(0 ${top})">`,
  ];
  for (const k of c.containers) {
    const l = containerLabelBox(k);
    parts.push(
      `<rect x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}" rx="6" fill="${k.fill}" stroke="${k.stroke}"/>`,
    );
    if (k.label)
      parts.push(
        `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="2" fill="${k.labelFill}"/>`,
        `<text x="${l.x + 8}" y="${l.y + 11.5}" font-size="9" font-weight="700" letter-spacing="0.4" fill="#fff">${xml(k.label.toUpperCase())}</text>`,
      );
  }
  for (const e of c.edges) {
    const dash = e.dash !== "none" ? ` stroke-dasharray="${DASH_SVG[e.dash]}"` : "";
    parts.push(
      `<polyline fill="none" stroke="${e.colour}" stroke-width="${e.width}"${dash} points="${e.points.map((p) => `${p.x},${p.y}`).join(" ")}"/>`,
    );
    if (e.arrow && e.points.length > 1)
      parts.push(
        `<polygon fill="${e.colour}" points="${arrowHead(e.points, 7)
          .map((p) => `${p.x},${p.y}`)
          .join(" ")}"/>`,
      );
    if (e.text)
      parts.push(
        `<text x="${e.textAt.x}" y="${e.textAt.y}" font-size="10" font-weight="700" fill="${e.textColour}">${xml(e.text)}</text>`,
      );
  }
  for (const n of c.nodes) {
    const dash = n.dashed ? ' stroke-dasharray="4 3"' : "";
    parts.push(
      `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.radius}" fill="${n.fill}" stroke="${n.stroke}"${dash}/>`,
    );
    for (const line of n.lines)
      parts.push(
        `<text x="${n.x + n.w / 2}" y="${n.y + line.y}" text-anchor="middle" font-size="${line.size}"${line.bold ? ' font-weight="700"' : ""}${line.italic ? ' font-style="italic"' : ""}${line.caps ? ' letter-spacing="0.5"' : ""} fill="${line.colour}">${xml(line.text)}</text>`,
      );
    if (n.tag) {
      const t = tagBox(n);
      parts.push(
        `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="2" fill="${TAG_FILL}"/>`,
        `<text x="${t.x + t.w / 2}" y="${t.y + 10}" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">${xml(n.tag)}</text>`,
      );
    }
  }
  for (const note of c.notes)
    note.lines.forEach((line, i) =>
      parts.push(
        `<text x="${note.x + 6}" y="${note.y + 16 + i * 15}" font-size="11" fill="#3E4A4F">${xml(line)}</text>`,
      ),
    );
  if (c.legend) {
    const g = c.legend;
    parts.push(
      `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="4" fill="#fff" stroke="#D3D7D1"/>`,
      `<text x="${g.x + 12}" y="${g.y + 19}" font-size="9" font-weight="700" letter-spacing="0.6" fill="#626C70">LEGEND</text>`,
    );
    g.items.forEach((item, i) => {
      const y = g.y + 30 + i * 18;
      parts.push(
        legendSwatchSvg(item, g.x + 12, y),
        `<text x="${g.x + 44}" y="${y + 9.5}" font-size="10.5" fill="#123247">${xml(item.label)}</text>`,
      );
    });
  }
  parts.push(
    "</g>",
    `<text x="24" y="${h - 14}" font-size="10" fill="#626C70">${xml(meta.footer)}</text>`,
    "</svg>",
  );
  return parts.join("\n");
}

/* -------------------------------------------------------------------- csv */

const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Nodes, then edges, in one sheet a spreadsheet opens without asking. */
export function chartCsv(c: Composition, meta: ChartMeta): string {
  const names = new Map(c.nodes.map((n) => [n.id, n.title]));
  const rows = [
    [meta.title],
    [meta.footer],
    [],
    ["Nodes"],
    ["id", "kind", "title", "subtitle"],
    ...c.nodes.filter((n) => n.kind !== "group").map((n) => [n.id, n.kind, n.title, n.subtitle]),
    [],
    ["Edges"],
    ["from", "to", "label", "style"],
    ...c.edges.map((e) => [names.get(e.from) ?? e.from, names.get(e.to) ?? e.to, e.text, e.style]),
  ];
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

/* -------------------------------------------------------------------- pdf */

const PAPER_PT: Record<Paper, [number, number]> = { A3: [1190.55, 841.89], A4: [841.89, 595.28] };

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(" ");
};

const f = (n: number) => (Math.round(n * 100) / 100).toString();

const PDF_DASH = { none: "[] 0 d", dotted: "[1.5 2.5] 0 d", dashed: "[5 3] 0 d" } as const;

/** A one-page, landscape, vector PDF: boxes, lines and Helvetica text. */
export function chartPdf(c: Composition, meta: ChartMeta, paper: Paper = "A3"): Uint8Array {
  const [pw, ph] = PAPER_PT[paper];
  const margin = 36;
  const titleBand = 34;
  const footBand = 24;
  // The drawing, centred both ways in the space between the title and the foot.
  const b = drawnBounds(c);
  const areaW = pw - margin * 2;
  const areaH = ph - margin * 2 - titleBand - footBand;
  const scale = Math.min(areaW / b.w, areaH / b.h, 1.4);
  const ox = margin + (areaW - b.w * scale) / 2 - b.x * scale;
  const oyTop = ph - margin - titleBand - (areaH - b.h * scale) / 2 + b.y * scale;
  const X = (x: number) => f(ox + x * scale);
  const Y = (y: number) => f(oyTop - y * scale);

  const ops: string[] = [];
  const text = (
    x: number,
    y: number,
    size: number,
    font: "regular" | "bold" | "italic",
    colour: string,
    s: string,
    anchor: "left" | "centre" = "left",
  ) => {
    const safe = winAnsi(s);
    // Centre by measuring in the chart's own width table.
    const width = anchor === "centre" ? textWidth(s, size, font === "bold") : 0;
    const name = font === "bold" ? "F2" : font === "italic" ? "F3" : "F1";
    ops.push(
      `BT /${name} ${f(size)} Tf ${rgb(colour)} rg ${f(x - width / 2)} ${f(y)} Td (${pdfString(safe)}) Tj ET`,
    );
  };
  /** A rectangle in chart units, rounded when asked: four quarter-circle Béziers. */
  const box = (x: number, y: number, w: number, h: number, r: number) => {
    const x0 = ox + x * scale;
    const y0 = oyTop - (y + h) * scale;
    const W = w * scale;
    const H = h * scale;
    const radius = r * scale;
    if (radius <= 0) return `${f(x0)} ${f(y0)} ${f(W)} ${f(H)} re`;
    const k = radius * 0.5523;
    return [
      `${f(x0 + radius)} ${f(y0)} m`,
      `${f(x0 + W - radius)} ${f(y0)} l`,
      `${f(x0 + W - radius + k)} ${f(y0)} ${f(x0 + W)} ${f(y0 + radius - k)} ${f(x0 + W)} ${f(y0 + radius)} c`,
      `${f(x0 + W)} ${f(y0 + H - radius)} l`,
      `${f(x0 + W)} ${f(y0 + H - radius + k)} ${f(x0 + W - radius + k)} ${f(y0 + H)} ${f(x0 + W - radius)} ${f(y0 + H)} c`,
      `${f(x0 + radius)} ${f(y0 + H)} l`,
      `${f(x0 + radius - k)} ${f(y0 + H)} ${f(x0)} ${f(y0 + H - radius + k)} ${f(x0)} ${f(y0 + H - radius)} c`,
      `${f(x0)} ${f(y0 + radius)} l`,
      `${f(x0)} ${f(y0 + radius - k)} ${f(x0 + radius - k)} ${f(y0)} ${f(x0 + radius)} ${f(y0)} c h`,
    ].join(" ");
  };
  const lineW = (w: number) => f(Math.max(0.5, w * 0.8 * scale));

  text(margin, ph - margin - 16, 16, "bold", "#123247", meta.title);

  for (const k of c.containers) {
    ops.push(
      `q ${rgb(k.fill)} rg ${rgb(k.stroke)} RG ${lineW(1)} w [] 0 d ${box(k.x, k.y, k.w, k.h, 6)} B Q`,
    );
    if (k.label) {
      const l = containerLabelBox(k);
      ops.push(`q ${rgb(k.labelFill)} rg ${box(l.x, l.y, l.w, l.h, 2)} f Q`);
      text(
        ox + (l.x + 8) * scale,
        oyTop - (l.y + 11.5) * scale,
        Math.max(5, 9 * scale),
        "bold",
        "#FFFFFF",
        k.label.toUpperCase(),
      );
    }
  }
  for (const e of c.edges) {
    const path = e.points.map((p, i) => `${X(p.x)} ${Y(p.y)} ${i ? "l" : "m"}`).join(" ");
    ops.push(`q ${rgb(e.colour)} RG ${lineW(e.width)} w 0 J 0 j ${PDF_DASH[e.dash]} ${path} S Q`);
    if (e.arrow && e.points.length > 1) {
      const [a, b, d] = arrowHead(e.points, 7);
      ops.push(
        `q ${rgb(e.colour)} rg ${X(a!.x)} ${Y(a!.y)} m ${X(b!.x)} ${Y(b!.y)} l ${X(d!.x)} ${Y(d!.y)} l h f Q`,
      );
    }
    if (e.text)
      text(
        ox + e.textAt.x * scale,
        oyTop - e.textAt.y * scale,
        Math.max(6, 9 * scale),
        "bold",
        e.textColour,
        e.text,
      );
  }
  for (const n of c.nodes) {
    const dash = n.dashed ? "[3 2] 0 d" : "[] 0 d";
    ops.push(
      `q ${rgb(n.fill)} rg ${rgb(n.stroke)} RG ${f(Math.max(0.5, scale))} w ${dash} ${box(n.x, n.y, n.w, n.h, n.radius)} B Q`,
    );
    const cx = ox + (n.x + n.w / 2) * scale;
    for (const line of n.lines)
      text(
        cx,
        oyTop - (n.y + line.y) * scale,
        Math.max(5, line.size * 0.92 * scale),
        line.bold ? "bold" : line.italic ? "italic" : "regular",
        line.colour,
        line.text,
        "centre",
      );
    if (n.tag) {
      const t = tagBox(n);
      ops.push(`q ${rgb(TAG_FILL)} rg ${box(t.x, t.y, t.w, t.h, 2)} f Q`);
      text(
        ox + (t.x + t.w / 2) * scale,
        oyTop - (t.y + 10) * scale,
        Math.max(5, 8 * scale),
        "bold",
        "#FFFFFF",
        n.tag,
        "centre",
      );
    }
  }
  for (const note of c.notes)
    note.lines.forEach((line, i) =>
      text(
        ox + (note.x + 6) * scale,
        oyTop - (note.y + 16 + i * 15) * scale,
        Math.max(6, 10 * scale),
        "regular",
        "#3E4A4F",
        line,
      ),
    );
  if (c.legend) {
    const g = c.legend;
    ops.push(
      `q 1 1 1 rg ${rgb("#D3D7D1")} RG ${lineW(1)} w [] 0 d ${box(g.x, g.y, g.w, g.h, 4)} B Q`,
    );
    text(
      ox + (g.x + 12) * scale,
      oyTop - (g.y + 19) * scale,
      Math.max(5, 8.5 * scale),
      "bold",
      "#626C70",
      "LEGEND",
    );
    g.items.forEach((item, i) => {
      const y = g.y + 30 + i * 18;
      if (item.shape === "line")
        ops.push(
          `q ${rgb(item.stroke ?? "#1C2B6B")} RG ${lineW(1.5)} w ${PDF_DASH[item.dash ?? "none"]} ${X(g.x + 12)} ${Y(y + 5)} m ${X(g.x + 34)} ${Y(y + 5)} l S Q`,
        );
      else
        ops.push(
          `q ${rgb(item.fill ?? "#FFFFFF")} rg ${rgb(item.stroke ?? "#8E999C")} RG ${lineW(1)} w ${item.dash === "dashed" ? "[2 1.5] 0 d" : "[] 0 d"} ${box(g.x + 12, y, 22, 11, 2)} B Q`,
        );
      text(
        ox + (g.x + 44) * scale,
        oyTop - (y + 9.5) * scale,
        Math.max(6, 10 * scale),
        "regular",
        "#123247",
        item.label,
      );
    });
  }
  text(margin, margin - 4, 8.5, "regular", "#626C70", meta.footer);

  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw)} ${f(ph)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 8 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    // UTF-16 with a byte-order mark: the title's dash survives into the reader's window title.
    `<< /Title <FEFF${[...meta.title]
      .map((ch) => ch.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase())
      .join("")}> /Producer (Scripta) >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  // Latin-1: one character, one byte, so the offsets above are byte offsets.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

/* ------------------------------------------------------------------- pptx */

const EMU_PER_PX = 9525;
const PAPER_EMU: Record<Paper, [number, number]> = {
  A3: [15120000, 10692000],
  A4: [10692000, 7560000],
};

const hex = (c: string) => c.replace("#", "").toUpperCase();

/**
 * A single-slide deck. Boxes are rectangles with their text as text;
 * reporting and ownership lines are connectors glued to the boxes, so moving a
 * box in PowerPoint brings its lines with it.
 */
export function chartPptx(c: Composition, meta: ChartMeta, paper: Paper = "A3"): Uint8Array {
  const [sw, sh] = PAPER_EMU[paper];
  const margin = 457200; // half an inch
  const titleBand = 520000;
  const footBand = 320000;
  // The drawing, centred both ways in the space between the title and the foot.
  const b = drawnBounds(c);
  const areaW = sw - margin * 2;
  const areaH = sh - margin * 2 - titleBand - footBand;
  const scale = Math.min(areaW / (b.w * EMU_PER_PX), areaH / (b.h * EMU_PER_PX), 1.4);
  const E = (px: number) => Math.round(px * EMU_PER_PX * scale);
  const ox = margin + Math.round((areaW - E(b.w)) / 2) - E(b.x);
  const oy = margin + titleBand + Math.round((areaH - E(b.h)) / 2) - E(b.y);
  // Card text at its screen size, scaled with the chart but never above it:
  // PowerPoint wraps rather than shrinks, and a wrapped name overruns the card.
  const fontSize = (pt: number) => Math.max(600, Math.round(pt * 100 * Math.min(scale * 1.05, 1)));

  const shapeIds = new Map<string, number>();
  let nextId = 4;
  const shapes: string[] = [];
  const run = (t: string, size: number, bold: boolean, colour: string, italic = false) =>
    `<a:r><a:rPr lang="en-GB" sz="${size}"${bold ? ' b="1"' : ""}${italic ? ' i="1"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${hex(colour)}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${xml(t)}</a:t></a:r>`;
  const solid = (colour: string) => `<a:solidFill><a:srgbClr val="${hex(colour)}"/></a:solidFill>`;

  const textBox = (
    id: number,
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    body: string,
    fill?: string,
    align: "l" | "ctr" = "l",
  ) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill ? solid(fill) : "<a:noFill/>"}</p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="${align}"/>${body}</a:p></p:txBody></p:sp>`;

  const shape = (
    id: number,
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    stroke: string | null,
    round: boolean,
    dash = "",
  ) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>${
      round
        ? '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 6000"/></a:avLst></a:prstGeom>'
        : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
    }${solid(fill)}${stroke ? `<a:ln w="9525">${solid(stroke)}${dash}</a:ln>` : "<a:ln><a:noFill/></a:ln>"}</p:spPr></p:sp>`;

  shapes.push(
    textBox(
      2,
      "Title",
      margin,
      margin,
      sw - margin * 2,
      titleBand - 120000,
      run(meta.title, 2000, true, "#123247"),
    ),
  );
  shapes.push(
    textBox(
      3,
      "As at",
      margin,
      sh - margin - footBand + 60000,
      sw - margin * 2,
      footBand - 60000,
      run(meta.footer, 1000, false, "#626C70"),
    ),
  );

  for (const k of c.containers) {
    shapes.push(
      shape(
        nextId++,
        `${DRAWING_PREFIX}container ${k.label}`,
        ox + E(k.x),
        oy + E(k.y),
        E(k.w),
        E(k.h),
        k.fill,
        k.stroke,
        true,
      ),
    );
    if (k.label) {
      const l = containerLabelBox(k);
      shapes.push(
        textBox(
          nextId++,
          `${DRAWING_PREFIX}container label`,
          ox + E(l.x),
          oy + E(l.y),
          E(l.w),
          E(l.h),
          run(k.label.toUpperCase(), fontSize(8.5), true, "#FFFFFF"),
          k.labelFill,
          "ctr",
        ),
      );
    }
  }

  for (const n of c.nodes) {
    const id = nextId++;
    shapeIds.set(n.id, id);
    const dash = n.dashed ? '<a:prstDash val="dash"/>' : "";
    const geometry =
      n.radius > 0
        ? '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 10000"/></a:avLst></a:prstGeom>'
        : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
    // The eyebrow is drawn as its own text box over the card, so the card's
    // first paragraph is always its name.
    const body = n.lines.filter((l) => !l.caps);
    const first = body[0];
    const top = first ? Math.max(0, first.y - first.size * 1.02) : 0;
    // A name wrapped onto several lines stays one paragraph, broken with line
    // breaks, so the deck reads back with the whole name as the card's title.
    const groups: (typeof body)[] = [];
    for (const l of body) {
      const last = groups.at(-1);
      if (last && l.role === "title" && last[0]!.role === "title") last.push(l);
      else groups.push([l]);
    }
    const paragraphs = groups
      .map(
        (g) =>
          `<a:p><a:pPr algn="ctr"/>${g
            .map((l, i) =>
              run(
                i < g.length - 1 ? `${l.text} ` : l.text,
                fontSize(l.size * 0.92),
                l.bold,
                l.colour,
                l.italic,
              ),
            )
            .join("<a:br/>")}</a:p>`,
      )
      .join("");
    shapes.push(
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(n.title)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${ox + E(n.x)}" y="${oy + E(n.y)}"/><a:ext cx="${E(n.w)}" cy="${E(n.h)}"/></a:xfrm>${geometry}${solid(n.fill)}<a:ln w="${n.fill === "#FFFFFF" ? 15875 : 9525}">${solid(n.stroke)}${dash}</a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="45720" tIns="${E(top)}" rIns="45720" bIns="0" anchor="t"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`,
    );
    const eyebrow = n.lines.find((l) => l.caps);
    if (eyebrow)
      shapes.push(
        textBox(
          nextId++,
          `${DRAWING_PREFIX}eyebrow`,
          ox + E(n.x),
          oy + E(n.y + eyebrow.y - eyebrow.size),
          E(n.w),
          E(eyebrow.size + 3),
          run(eyebrow.text, fontSize(eyebrow.size * 0.92), true, eyebrow.colour),
          undefined,
          "ctr",
        ),
      );
    if (n.tag) {
      const t = tagBox(n);
      shapes.push(
        textBox(
          nextId++,
          `${DRAWING_PREFIX}tag`,
          ox + E(t.x),
          oy + E(t.y),
          E(t.w),
          E(t.h),
          run(n.tag, fontSize(7.5), true, "#FFFFFF"),
          TAG_FILL,
          "ctr",
        ),
      );
    }
  }

  const at = new Map(c.nodes.map((n) => [n.id, n]));
  for (const e of c.edges) {
    const from = at.get(e.from);
    const to = at.get(e.to);
    if (!from || !to) continue;
    const id = nextId++;
    const dash =
      e.dash === "dotted"
        ? '<a:prstDash val="sysDot"/>'
        : e.dash === "dashed"
          ? '<a:prstDash val="dash"/>'
          : "";
    // One connector per line, following the chart's own path, glued at both
    // ends to the middle of an edge of each card (0 top, 1 left, 2 bottom,
    // 3 right), so PowerPoint keeps it attached to the cards it joins.
    const pts = e.points.map((p) => ({ x: ox + E(p.x), y: oy + E(p.y) }));
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const w = Math.max(1, Math.max(...pts.map((p) => p.x)) - minX);
    const h = Math.max(1, Math.max(...pts.map((p) => p.y)) - minY);
    const path = pts
      .map(
        (p, i) =>
          `<a:${i ? "lnTo" : "moveTo"}><a:pt x="${p.x - minX}" y="${p.y - minY}"/></a:${i ? "lnTo" : "moveTo"}>`,
      )
      .join("");
    const siteOf = (point: Point, card: typeof to) => {
      if (Math.abs(point.y - card.y) < 0.5) return 0;
      if (Math.abs(point.y - (card.y + card.h)) < 0.5) return 2;
      return Math.abs(point.x - card.x) < 0.5 ? 1 : 3;
    };
    const glue = `<a:stCxn id="${shapeIds.get(e.from)}" idx="${siteOf(e.points[0]!, from)}"/><a:endCxn id="${shapeIds.get(e.to)}" idx="${siteOf(e.points[e.points.length - 1]!, to)}"/>`;
    const lineW = Math.round(e.width * 9525);
    const arrow = e.arrow ? '<a:tailEnd type="triangle" w="med" len="med"/>' : "";
    shapes.push(
      `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Line ${id}"/><p:cNvCxnSpPr>${glue}</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="${minX}" y="${minY}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${w}" h="${h}">${path}</a:path></a:pathLst></a:custGeom><a:ln w="${lineW}">${solid(e.colour)}${dash}<a:miter lim="800000"/>${arrow}</a:ln></p:spPr></p:cxnSp>`,
    );
    if (e.text)
      shapes.push(
        textBox(
          nextId++,
          `Label ${id}`,
          ox + E(e.textAt.x),
          oy + E(e.textAt.y) - 90000,
          E(Math.max(60, textWidth(e.text, 10, true) + 8)),
          180000,
          run(e.text, fontSize(9), true, e.textColour),
        ),
      );
  }

  for (const note of c.notes)
    shapes.push(
      `<p:sp><p:nvSpPr><p:cNvPr id="${nextId++}" name="${DRAWING_PREFIX}note"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${ox + E(note.x)}" y="${oy + E(note.y)}"/><a:ext cx="${E(note.w)}" cy="${E(note.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="45720" tIns="45720" rIns="45720" bIns="0" anchor="t"/><a:lstStyle/>${note.lines
        .map((l) => `<a:p>${run(l, fontSize(10), false, "#3E4A4F")}</a:p>`)
        .join("")}</p:txBody></p:sp>`,
    );

  if (c.legend) {
    const g = c.legend;
    shapes.push(
      shape(
        nextId++,
        `${DRAWING_PREFIX}legend`,
        ox + E(g.x),
        oy + E(g.y),
        E(g.w),
        E(g.h),
        "#FFFFFF",
        "#D3D7D1",
        true,
      ),
    );
    shapes.push(
      textBox(
        nextId++,
        `${DRAWING_PREFIX}legend title`,
        ox + E(g.x + 12),
        oy + E(g.y + 10),
        E(g.w - 24),
        E(12),
        run("LEGEND", fontSize(8), true, "#626C70"),
      ),
    );
    g.items.forEach((item, i) => {
      const y = g.y + 30 + i * 18;
      if (item.shape === "line")
        shapes.push(
          `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${nextId++}" name="${DRAWING_PREFIX}legend line"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="${ox + E(g.x + 12)}" y="${oy + E(y + 5)}"/><a:ext cx="${E(22)}" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="14288">${solid(item.stroke ?? "#1C2B6B")}${item.dash === "dashed" ? '<a:prstDash val="dash"/>' : item.dash === "dotted" ? '<a:prstDash val="sysDot"/>' : ""}</a:ln></p:spPr></p:cxnSp>`,
        );
      else
        shapes.push(
          shape(
            nextId++,
            `${DRAWING_PREFIX}legend swatch`,
            ox + E(g.x + 12),
            oy + E(y),
            E(22),
            E(11),
            item.fill ?? "#FFFFFF",
            item.stroke ?? "#8E999C",
            false,
            item.dash === "dashed" ? '<a:prstDash val="dash"/>' : "",
          ),
        );
      shapes.push(
        textBox(
          nextId++,
          `${DRAWING_PREFIX}legend label`,
          ox + E(g.x + 44),
          oy + E(y - 1),
          E(g.w - 50),
          E(13),
          run(item.label, fontSize(9.5), false, "#123247"),
        ),
      );
    });
  }

  const NS =
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const rels = (items: [string, string, string][]) =>
    `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items
      .map(
        ([id, type, target]) =>
          `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`,
      )
      .join("")}</Relationships>`;
  const emptyTree =
    '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>';

  const files: Record<string, string> = {
    "[Content_Types].xml": `${header}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    "_rels/.rels": `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    "docProps/core.xml": `${header}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(meta.title)}</dc:title><dc:creator>Scripta</dc:creator></cp:coreProperties>`,
    "docProps/app.xml": `${header}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Scripta</Application><Slides>1</Slides></Properties>`,
    "ppt/presentation.xml": `${header}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="${sw}" cy="${sh}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": rels([
      ["rId1", "slideMaster", "slideMasters/slideMaster1.xml"],
      ["rId2", "slide", "slides/slide1.xml"],
      ["rId3", "theme", "theme/theme1.xml"],
    ]),
    "ppt/slideMasters/slideMaster1.xml": `${header}<p:sldMaster ${NS}>${emptyTree}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`,
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": rels([
      ["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"],
      ["rId2", "theme", "../theme/theme1.xml"],
    ]),
    "ppt/slideLayouts/slideLayout1.xml": `${header}<p:sldLayout ${NS} type="blank" preserve="1">${emptyTree.replace("<p:cSld>", '<p:cSld name="Blank">')}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": rels([
      ["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"],
    ]),
    "ppt/slides/slide1.xml": `${header}<p:sld ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    "ppt/slides/_rels/slide1.xml.rels": rels([
      ["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"],
    ]),
    "ppt/theme/theme1.xml": THEME,
  };
  return createZip(Object.entries(files).map(([path, body]) => ({ path, data: utf8(body) })));
}

const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Scripta"><a:themeElements><a:clrScheme name="Scripta"><a:dk1><a:srgbClr val="123247"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="20495F"/></a:dk2><a:lt2><a:srgbClr val="F4F6F4"/></a:lt2><a:accent1><a:srgbClr val="247A78"/></a:accent1><a:accent2><a:srgbClr val="123247"/></a:accent2><a:accent3><a:srgbClr val="C9822B"/></a:accent3><a:accent4><a:srgbClr val="B4483A"/></a:accent4><a:accent5><a:srgbClr val="3F8B64"/></a:accent5><a:accent6><a:srgbClr val="626C70"/></a:accent6><a:hlink><a:srgbClr val="247A78"/></a:hlink><a:folHlink><a:srgbClr val="20495F"/></a:folHlink></a:clrScheme><a:fontScheme name="Scripta"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Scripta"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
