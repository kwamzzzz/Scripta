/**
 * An item's body is a block document, never an HTML string.
 *
 * Everything downstream depends on a block having a stable id: a highlight
 * anchors to one, a note quotes one, and the tutor cites one. An offset into
 * rendered HTML would move the first time a paragraph above it was edited, and
 * every note in the course would quietly start pointing at the wrong sentence.
 *
 * Three of these types exist because legal training needs them as real blocks
 * rather than styled text: a clause, an authority, and a check that is asked
 * but never marked.
 *
 * Learning is not only reading, so an item can also hold media (a recording,
 * a video, a diagram, a slide deck), a practice question, a deck of flashcards
 * and a table. Practice questions and flashcards are for the learner alone:
 * nothing they answer is stored, in keeping with the check block. Assessment
 * is a different thing and does not live in a reading item.
 */

export type BlockType =
  | "paragraph"
  | "heading"
  | "clause"
  | "authority"
  | "check"
  | "media"
  | "quiz"
  | "flashcards"
  | "table"
  | "caveat"
  | "credit"
  | "note";

const TYPES: BlockType[] = [
  "paragraph",
  "heading",
  "clause",
  "authority",
  "check",
  "media",
  "quiz",
  "flashcards",
  "table",
  "caveat",
  "credit",
  "note",
];

export type MediaKind = "audio" | "video" | "image" | "pdf" | "file";

/** A file in storage. The path is what is kept; a link to it is signed when shown. */
export type Media = {
  kind: MediaKind;
  path: string;
  name: string;
  mime: string;
  bytes: number;
  /** Running time of a recording or video, read from the file when it is added. */
  seconds?: number;
  /** Pages in a PDF, counted when it is added. */
  pages?: number;
};

export type Flashcard = { front: string; back: string };

export type Block = {
  id: string;
  type: BlockType;
  /**
   * The words of the block. For media it is the caption; for a practice
   * question, the question; for flashcards and a table, an optional title.
   */
  text: string;
  /** An authority's citation line: the case or statute being pointed at. */
  cite?: string;
  media?: Media;
  /** A practice question's options, and which of them are right. */
  options?: string[];
  answers?: number[];
  /** Why the right answer is right. Shown once the learner has answered. */
  explanation?: string;
  cards?: Flashcard[];
  /** A table's cells, header row first. */
  rows?: string[][];
  /** A credit's organisation. The name is `text`, the role is `cite`, a logo is `media`. */
  org?: string;
  /** A credit's photograph of the person. */
  photo?: Media | undefined;
};

export type BlockDocument = { blocks: Block[] };

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((s) => (typeof s === "string" ? s : String(s ?? ""))) : [];

function readMedia(v: unknown): Media | undefined {
  if (!v || typeof v !== "object") return undefined;
  const m = v as Record<string, unknown>;
  if (typeof m["path"] !== "string") return undefined;
  const kind = (["audio", "video", "image", "pdf", "file"] as string[]).includes(String(m["kind"]))
    ? (m["kind"] as MediaKind)
    : "file";
  return {
    kind,
    path: m["path"],
    name: typeof m["name"] === "string" ? m["name"] : "file",
    mime: typeof m["mime"] === "string" ? m["mime"] : "",
    bytes: typeof m["bytes"] === "number" ? m["bytes"] : 0,
    ...(typeof m["seconds"] === "number" ? { seconds: m["seconds"] } : {}),
    ...(typeof m["pages"] === "number" ? { pages: m["pages"] } : {}),
  };
}

/**
 * Read whatever is stored on the item, defensively. An item created before it
 * was written, or by an importer that has not run yet, has no blocks — that is
 * an empty document, not an error.
 */
export function readBlocks(payload: unknown): Block[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as { blocks?: unknown }).blocks;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((block): Block[] => {
    if (!block || typeof block !== "object") return [];
    const b = block as Record<string, unknown>;
    if (typeof b["id"] !== "string") return [];
    const raw = typeof b["type"] === "string" ? b["type"] : "paragraph";
    const type = (TYPES as string[]).includes(raw) ? (raw as BlockType) : "paragraph";
    const media = readMedia(b["media"]);
    // A media block whose file reference is unreadable has nothing to show.
    // A credit's logo is optional, so only media blocks need one.
    if (type === "media" && !media) return [];
    return [
      {
        id: b["id"],
        type,
        text: typeof b["text"] === "string" ? b["text"] : "",
        ...(typeof b["cite"] === "string" ? { cite: b["cite"] } : {}),
        ...(media ? { media } : {}),
        ...(Array.isArray(b["options"]) ? { options: strings(b["options"]) } : {}),
        ...(Array.isArray(b["answers"])
          ? {
              answers: (b["answers"] as unknown[]).filter(
                (n): n is number => typeof n === "number",
              ),
            }
          : {}),
        ...(typeof b["explanation"] === "string" ? { explanation: b["explanation"] } : {}),
        ...(Array.isArray(b["cards"])
          ? {
              cards: (b["cards"] as unknown[]).flatMap((c) =>
                c && typeof c === "object"
                  ? [
                      {
                        front: String((c as Record<string, unknown>)["front"] ?? ""),
                        back: String((c as Record<string, unknown>)["back"] ?? ""),
                      },
                    ]
                  : [],
              ),
            }
          : {}),
        ...(Array.isArray(b["rows"]) ? { rows: (b["rows"] as unknown[]).map(strings) } : {}),
        ...(typeof b["org"] === "string" ? { org: b["org"] } : {}),
        ...(readMedia(b["photo"]) ? { photo: readMedia(b["photo"])! } : {}),
      },
    ];
  });
}

/**
 * A team credit worth showing: it names a person or an organisation. A card
 * with only a role ("Course tutor") is an unfilled space and is not shown.
 */
export function isFilledCredit(b: Block): boolean {
  return b.type === "credit" && (!!b.text.trim() || !!b.org?.trim());
}

/** Whether an item has anything to read yet. */
export function hasBody(payload: unknown): boolean {
  return readBlocks(payload).length > 0;
}

/** The types an author picks from the block menu. Media arrives by upload instead. */
export const BLOCK_TYPES: { type: BlockType; label: string }[] = [
  { type: "paragraph", label: "Paragraph" },
  { type: "heading", label: "Heading" },
  { type: "clause", label: "Clause" },
  { type: "authority", label: "Authority" },
  { type: "check", label: "Check" },
  { type: "quiz", label: "Practice question" },
  { type: "flashcards", label: "Flashcards" },
  { type: "table", label: "Table" },
  { type: "caveat", label: "Check the current position" },
  { type: "credit", label: "Course team member" },
  { type: "note", label: "Note to authors (hidden from learners)" },
];

export function newBlockId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

export function mediaKindOf(mime: string, name: string): MediaKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime.startsWith("audio/") || ["mp3", "m4a", "wav", "aac", "ogg", "oga"].includes(ext))
    return "audio";
  if (mime.startsWith("video/") || ["mp4", "m4v", "mov", "webm"].includes(ext)) return "video";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
    return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  return "file";
}

/**
 * What an item holds besides reading, in a few words for the module list:
 * "audio · 12 flashcards · 5 questions". Empty for plain reading.
 */
export function blockSummary(payload: unknown): string {
  const blocks = readBlocks(payload);
  const parts: string[] = [];
  const media = new Map<MediaKind, number>();
  for (const b of blocks) if (b.media) media.set(b.media.kind, (media.get(b.media.kind) ?? 0) + 1);
  const label: Record<MediaKind, string> = {
    audio: "audio",
    video: "video",
    image: "diagram",
    pdf: "slides",
    file: "file",
  };
  for (const kind of ["video", "audio", "image", "pdf", "file"] as MediaKind[]) {
    const n = media.get(kind);
    if (n) parts.push(n === 1 ? label[kind] : `${n} ${label[kind]}s`);
  }
  const questions = blocks.filter((b) => b.type === "quiz").length;
  if (questions) parts.push(`${questions} ${questions === 1 ? "question" : "questions"}`);
  const cards = blocks.reduce(
    (n, b) => n + (b.type === "flashcards" ? (b.cards?.length ?? 0) : 0),
    0,
  );
  if (cards) parts.push(`${cards} flashcards`);
  if (blocks.some((b) => b.type === "table")) parts.push("table");
  return parts.join(" · ");
}

// ------------------------------------------------------------ pasting in --

/** "front :: back" lines, the flashcard format, one card per line. */
export function parseCards(text: string): Flashcard[] {
  return text
    .split("\n")
    .map((line) => line.split("::"))
    .filter((parts) => parts.length >= 2 && parts[0]!.trim())
    .map(([front = "", ...back]) => ({ front: front.trim(), back: back.join("::").trim() }));
}

export function cardsToText(cards: Flashcard[]): string {
  return cards.map((c) => `${c.front} :: ${c.back}`).join("\n");
}

/**
 * Table text into rows: a Markdown table (`| a | b |`, separator line
 * skipped) or tab-separated lines, which is what copying from a spreadsheet
 * or a web table gives.
 */
export function parseTable(text: string): string[][] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim());
  const markdown = lines.every((l) => l.trim().startsWith("|"));
  return lines
    .filter((l) => !(markdown && /^\s*\|?[\s:|-]+\|?\s*$/.test(l)))
    .map((l) =>
      markdown
        ? l
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim())
        : l.split("\t").map((c) => c.trim()),
    );
}

export function tableToText(rows: string[][]): string {
  return rows.map((r) => r.join("\t")).join("\n");
}

/**
 * A practice question written out:
 *
 *   Q: Which article makes Sharia a main source of legislation?
 *   - Article 1
 *   * Article 7
 *   - Article 121
 *   Why: Article 7 names Islam as the official religion and Sharia as a main source.
 *
 * `*` marks a right answer; there may be more than one. The lettered style
 * most question banks use reads too, with the answer given by letter:
 *
 *   Q: Which article makes Sharia a main source of legislation?
 *   A) Article 1
 *   B) Article 7
 *   Answer: B
 *   Why: …
 */
function parseQuiz(lines: string[], makeId: () => string): Block | null {
  const [first = "", ...rest] = lines;
  const q = /^q(?:uestion)?\s*[:.]\s*(.*)$/i.exec(first);
  if (!q) return null;
  const options: string[] = [];
  const answers: number[] = [];
  let explanation = "";
  let question = q[1] ?? "";
  for (const line of rest) {
    const opt = /^([-*])\s+(.*)$/.exec(line);
    const lettered = /^\(?([A-Ha-h])[).:]\s+(.*)$/.exec(line);
    const key =
      /^(?:answer|correct(?: answer)?)s?\s*:\s*([A-Ha-h](?:\s*(?:,|and|&)\s*[A-Ha-h])*)\s*\.?$/i.exec(
        line,
      );
    const why = /^(?:why|answer|explanation)\s*:\s*(.*)$/i.exec(line);
    if (opt) {
      if (opt[1] === "*") answers.push(options.length);
      options.push(opt[2] ?? "");
    } else if (lettered) {
      options.push(lettered[2] ?? "");
    } else if (key) {
      for (const letter of (key[1] ?? "").match(/\b[A-Ha-h]\b/g) ?? []) {
        const i = letter.toUpperCase().charCodeAt(0) - 65;
        if (!answers.includes(i)) answers.push(i);
      }
    } else if (why) {
      explanation = why[1] ?? "";
    } else if (options.length === 0) {
      question = `${question} ${line}`.trim();
    } else if (explanation) {
      explanation = `${explanation} ${line}`;
    }
  }
  if (options.length < 2) return null;
  return {
    id: makeId(),
    type: "quiz",
    text: question,
    options,
    answers: answers.filter((i) => i < options.length).sort((a, b) => a - b),
    explanation,
  };
}

/**
 * Pasted text into blocks, one block per paragraph (a blank line ends one).
 * A few prefixes say what a paragraph is, so a whole item can be written
 * elsewhere and pasted in without choosing a type for every block:
 *
 *   ## Heading
 *   > A clause, quoted from the instrument
 *   ? A question the learner should be able to answer
 *   Authority: Federal Law No. 5 of 1985, Art. 1 | what it says
 *   Q: A practice question, with "- option" lines, "* right option" and "Why:"
 *   front :: back          (every line like this: a deck of flashcards)
 *   | a | b |              (a Markdown table, or tab-separated lines)
 *   ! What has changed since this was written, and what to check
 *   Credit: Name | Role | Organisation     (leave the name empty for a space to fill)
 *   Note: guidance for whoever writes the item; learners never see it
 *
 * Anything else is a paragraph. Line breaks inside a paragraph are joined.
 */
export function textToBlocks(text: string, makeId: () => string = newBlockId): Block[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((chunk) =>
      chunk
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0)
    .map((lines): Block => {
      // A note is read first and keeps its line breaks, so a note can show
      // an example of the other formats without becoming one.
      const first = /^note:\s*(.*)$/i.exec(lines[0] ?? "");
      if (first) {
        return {
          id: makeId(),
          type: "note",
          text: [first[1] ?? "", ...lines.slice(1)].join("\n").trim(),
        };
      }
      const quiz = parseQuiz(lines, makeId);
      if (quiz) return quiz;
      if (lines.every((l) => l.includes("::"))) {
        return { id: makeId(), type: "flashcards", text: "", cards: parseCards(lines.join("\n")) };
      }
      if (
        lines.length >= 2 &&
        (lines.every((l) => l.startsWith("|")) || lines.every((l) => l.includes("\t")))
      ) {
        return { id: makeId(), type: "table", text: "", rows: parseTable(lines.join("\n")) };
      }
      const para = lines.join(" ");
      if (para.startsWith("!"))
        return { id: makeId(), type: "caveat", text: para.replace(/^!\s*/, "") };
      const credit = /^credit:\s*(.*)$/i.exec(para);
      if (credit) {
        const [name = "", role = "", org = ""] = (credit[1] ?? "").split("|").map((s) => s.trim());
        return { id: makeId(), type: "credit", text: name, cite: role, org };
      }
      const heading = /^#{1,6}\s+(.*)$/.exec(para);
      if (heading) return { id: makeId(), type: "heading", text: heading[1] ?? "" };
      if (para.startsWith(">"))
        return { id: makeId(), type: "clause", text: para.replace(/^>\s*/, "") };
      if (para.startsWith("?"))
        return { id: makeId(), type: "check", text: para.replace(/^\?\s*/, "") };
      const authority = /^authority:\s*(.*)$/i.exec(para);
      if (authority) {
        const [cite = "", ...rest] = (authority[1] ?? "").split("|");
        return {
          id: makeId(),
          type: "authority",
          cite: cite.trim(),
          text: rest.join("|").trim(),
        };
      }
      return { id: makeId(), type: "paragraph", text: para };
    });
}
