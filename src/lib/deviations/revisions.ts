/**
 * Reading a redline: what a reviewer proposed, run by run, out of a real .docx.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT mammoth, docx-preview, OR THE COMPARISON IN clause-compare
 * ---------------------------------------------------------------------------
 *
 * Scripta can already write `w:ins`/`w:del` (`lib/export/docx.ts`) and can
 * already diff two saved versions (`lib/clause-compare.ts`). Neither reads a
 * redline somebody else sent us, and the difference matters: a diff infers
 * what probably changed, whereas a redline records what a named lawyer
 * actually proposed. A deviation schedule is a statement about the second. It
 * must never be built from the first, or it will confidently report edits that
 * nobody made.
 *
 * The converters are no help either. mammoth throws revisions away to produce
 * clean HTML, and docx-preview renders them for the eye. Both are lossy in the
 * one dimension this needs: for every character, was it inserted, deleted, or
 * untouched.
 *
 * ---------------------------------------------------------------------------
 * NO DOM, ON PURPOSE
 * ---------------------------------------------------------------------------
 *
 * `preview/sheet.ts` and friends use `DOMParser`, which is fine in a browser
 * and absent in Node, so nothing that uses it can be unit tested. This runs on
 * both sides, so it walks the XML with a scanner instead. WordprocessingML is
 * machine-written and well-formed, which makes that safe here and would not
 * make it safe for arbitrary XML.
 */

/** Whether a stretch of text survived, was proposed, or was struck. */
export type SegmentKind = "same" | "insert" | "delete";

/** A run of characters that share one fate. */
export type Segment = { text: string; kind: SegmentKind };

/** One paragraph of the document, with its revisions still attached. */
export type RevisedParagraph = {
  /** 1-based position in document order, tables and all. */
  index: number;
  /** `w:pStyle`, which is how this document carries its numbering scheme. */
  style: string | null;
  /** Direct numbering on the paragraph, which overrides the style's. */
  numId: string | null;
  ilvl: number | null;
  /** The paragraph mark itself was inserted — i.e. this paragraph is new. */
  paraMarkInserted: boolean;
  /** The paragraph mark was struck — i.e. this paragraph is being merged away. */
  paraMarkDeleted: boolean;
  /** `w:pPrChange`: indent, numbering or alignment moved, wording did not. */
  propertiesChanged: boolean;
  segments: Segment[];
  /** The wording before the redline: what survived, plus what was struck. */
  original: string;
  /** The wording if every change is accepted: what survived, plus what was added. */
  amended: string;
  /** Any revision at all, including one that left the words alone. */
  changed: boolean;
};

type Attrs = Record<string, string>;
type Token =
  | { kind: "open"; name: string; attrs: Attrs; selfClosing: boolean }
  | { kind: "close"; name: string }
  | { kind: "text"; text: string };

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
};

/** XML entities, including the numeric ones Word emits for odd characters. */
export function decodeEntities(raw: string): string {
  if (!raw.includes("&")) return raw;
  return raw.replace(/&(#x?[0-9A-Fa-f]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X"))
      return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return ENTITIES[body] ?? whole;
  });
}

function attributes(source: string): Attrs {
  const attrs: Attrs = {};
  const pattern = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) attrs[match[1]!] = decodeEntities(match[2]!);
  return attrs;
}

/**
 * Element and text events, in document order.
 *
 * Comments, processing instructions and CDATA are skipped rather than parsed:
 * Word does not put document text in any of them, and a scanner that tries to
 * be a general XML parser is a scanner with more ways to be wrong.
 */
export function* scan(xml: string): Generator<Token> {
  let at = 0;
  while (at < xml.length) {
    const open = xml.indexOf("<", at);
    if (open === -1) {
      const tail = xml.slice(at);
      if (tail) yield { kind: "text", text: decodeEntities(tail) };
      return;
    }
    if (open > at) yield { kind: "text", text: decodeEntities(xml.slice(at, open)) };

    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open);
      at = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open);
      const body = xml.slice(open + 9, end === -1 ? xml.length : end);
      if (body) yield { kind: "text", text: body };
      at = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith("<?", open) || xml.startsWith("<!", open)) {
      const end = xml.indexOf(">", open);
      at = end === -1 ? xml.length : end + 1;
      continue;
    }

    const close = xml.indexOf(">", open);
    if (close === -1) return;
    const body = xml.slice(open + 1, close);
    if (body.startsWith("/")) {
      yield { kind: "close", name: body.slice(1).trim() };
    } else {
      const selfClosing = body.endsWith("/");
      const inner = selfClosing ? body.slice(0, -1) : body;
      const space = inner.search(/\s/);
      const name = space === -1 ? inner : inner.slice(0, space);
      yield {
        kind: "open",
        name,
        attrs: space === -1 ? {} : attributes(inner.slice(space)),
        selfClosing,
      };
    }
    at = close + 1;
  }
}

/** The `<w:p>…</w:p>` spans of a document, in order — tables and content controls included. */
export function paragraphSpans(xml: string): string[] {
  const spans: string[] = [];
  const opener = /<w:p(?:\s[^>]*)?>/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(xml))) {
    // `<w:pPr>`, `<w:pict>` and the rest start with the same three letters.
    const after = xml[match.index + 4];
    if (after !== ">" && after !== " " && after !== "\t" && after !== "\n" && after !== "\r")
      continue;
    const from = match.index + match[0].length;
    const to = xml.indexOf("</w:p>", from);
    if (to === -1) continue;
    spans.push(xml.slice(from, to));
    // A `w:p` never nests inside a `w:p`, so the next search may start after
    // this one closes.
    opener.lastIndex = to + 6;
  }
  return spans;
}

/**
 * The index of the `close` tag that matches the `open` tag at position 0.
 *
 * Returns -1 when the element does not start the string or never closes.
 */
export function closeOfNested(source: string, open: string, close: string): number {
  if (!source.startsWith(open)) return -1;
  let depth = 0;
  let at = 0;
  while (at < source.length) {
    const nextOpen = source.indexOf(open, at);
    const nextClose = source.indexOf(close, at);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      at = nextOpen + open.length;
      continue;
    }
    depth -= 1;
    if (depth === 0) return nextClose;
    at = nextClose + close.length;
  }
  return -1;
}

/** Paragraph-level properties, read from `<w:pPr>` before the wording is walked. */
function readProperties(span: string) {
  const start = span.indexOf("<w:pPr>");
  const result = {
    style: null as string | null,
    numId: null as string | null,
    ilvl: null as number | null,
    paraMarkInserted: false,
    paraMarkDeleted: false,
    propertiesChanged: false,
  };
  if (start !== 0) return result; // w:pPr is always first when present
  // `w:pPrChange` carries the properties this paragraph had BEFORE the
  // reviewer reformatted it — a complete second `w:pPr` nested inside this
  // one. So the first `</w:pPr>` closes the INNER block, and slicing there
  // truncates the outer one: three renumbered sub-paragraphs of the order of
  // precedence came back as bullets, because the only numbering left in the
  // slice was the numbering they used to have. Close it by depth, then cut the
  // old properties out before anything is read.
  const end = closeOfNested(span, "<w:pPr>", "</w:pPr>");
  if (end === -1) return result;
  const raw = span.slice(start, end);
  result.propertiesChanged = raw.includes("<w:pPrChange");
  const pPr = raw.replace(/<w:pPrChange[\s\S]*?<\/w:pPrChange>/g, "");

  result.style = /<w:pStyle\s[^>]*w:val="([^"]*)"/.exec(pPr)?.[1] ?? null;

  const numPr = /<w:numPr>([\s\S]*?)<\/w:numPr>/.exec(pPr)?.[1];
  if (numPr) {
    result.numId = /<w:numId\s[^>]*w:val="([^"]*)"/.exec(numPr)?.[1] ?? null;
    const lvl = /<w:ilvl\s[^>]*w:val="([^"]*)"/.exec(numPr)?.[1];
    result.ilvl = lvl === undefined ? null : Number(lvl);
  }

  // A revision inside `w:pPr/w:rPr` is about the paragraph MARK, not the
  // wording. Conflating the two was the first bug this module had: every
  // newly inserted paragraph reported its whole text twice.
  const rPr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(pPr)?.[1];
  if (rPr) {
    result.paraMarkInserted = /<w:ins[\s/>]/.test(rPr);
    result.paraMarkDeleted = /<w:del[\s/>]/.test(rPr);
  }
  return result;
}

/** Collapse neighbours that share a fate, so a clause reads as prose and not as confetti. */
function merge(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const last = out[out.length - 1];
    if (last && last.kind === segment.kind) last.text += segment.text;
    else out.push({ ...segment });
  }
  return out;
}

/**
 * The wording of one paragraph, with each run labelled by its fate.
 *
 * `w:ins` and `w:del` nest — Word writes a deletion inside an insertion when
 * one reviewer strikes another's addition — so the walk carries both flags
 * rather than a single mode.
 */
export function segmentsOf(span: string): Segment[] {
  // Same nesting trap as `readProperties`: a non-greedy strip stops at the
  // `</w:pPr>` belonging to `w:pPrChange` and leaves the tail of the outer
  // properties sitting in front of the wording.
  const closes = closeOfNested(span, "<w:pPr>", "</w:pPr>");
  const body = closes === -1 ? span : span.slice(closes + "</w:pPr>".length);
  const segments: Segment[] = [];
  let inserting = 0;
  let deleting = 0;
  let inRun = false;
  let capture: "" | "t" | "delText" = "";

  const push = (text: string) => {
    if (!inRun || !text) return;
    segments.push({ text, kind: deleting ? "delete" : inserting ? "insert" : "same" });
  };

  for (const token of scan(body)) {
    if (token.kind === "text") {
      if (capture) push(token.text);
      continue;
    }
    if (token.kind === "open") {
      switch (token.name) {
        case "w:ins": if (!token.selfClosing) inserting += 1; break;
        case "w:del": if (!token.selfClosing) deleting += 1; break;
        case "w:r": inRun = true; break;
        case "w:t": capture = "t"; break;
        case "w:delText": capture = "delText"; break;
        case "w:tab": push("\t"); break;
        case "w:br":
        case "w:cr": push("\n"); break;
        case "w:noBreakHyphen": push("-"); break;
        default: break;
      }
      continue;
    }
    switch (token.name) {
      case "w:ins": inserting = Math.max(0, inserting - 1); break;
      case "w:del": deleting = Math.max(0, deleting - 1); break;
      case "w:r": inRun = false; break;
      case "w:t":
      case "w:delText": capture = ""; break;
      default: break;
    }
  }
  return merge(segments);
}

export const originalOf = (segments: Segment[]) =>
  segments.filter((s) => s.kind !== "insert").map((s) => s.text).join("");

export const amendedOf = (segments: Segment[]) =>
  segments.filter((s) => s.kind !== "delete").map((s) => s.text).join("");

/** Every paragraph of `word/document.xml`, with its revisions read out. */
export function readRevisions(documentXml: string): RevisedParagraph[] {
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(documentXml)?.[1] ?? documentXml;
  return paragraphSpans(body).map((span, at) => {
    const props = readProperties(span);
    const segments = segmentsOf(span);
    return {
      index: at + 1,
      ...props,
      segments,
      original: originalOf(segments),
      amended: amendedOf(segments),
      changed:
        segments.some((s) => s.kind !== "same") ||
        props.paraMarkInserted ||
        props.paraMarkDeleted ||
        props.propertiesChanged,
    };
  });
}
