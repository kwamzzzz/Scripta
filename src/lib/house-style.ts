/**
 * The house style, taken from Kwame's own documents.
 *
 * Read out of three drafts in the template bank rather than invented: a Nexis
 * Africa employment contract, a Goldenmark board resolution, and a Nexis Africa
 * salary confirmation letter. Everything here is a measurement from one of
 * those files — the fonts and sizes from their Word styles, the numbering from
 * their numbering definitions, the furniture from the order their paragraphs
 * actually run in.
 *
 * It lives in one module because two very different things need the same
 * answer and must not drift apart: the exporter, which has to produce a
 * document that looks like the firm's own, and the drafting prompt, which has
 * to be told the shape to write into. A house style described twice is a house
 * style that will disagree with itself.
 *
 * No client content is recorded here. These are the rules the documents follow,
 * not anything they say.
 */

export type DocumentKind = "contract" | "resolution" | "letter";

/** Word measures in half-points for type and twips (1/1440in) for space. */
export const HOUSE_FONT = {
  /** Arial throughout the operative text, not the Normal style's Cambria. */
  family: "Arial",
  /** 12pt. */
  halfPoints: 24,
} as const;

/**
 * The page, measured from the same three files.
 *
 * Left, right and bottom margins are one inch in all three, so that is the
 * house margin and not a coincidence. The top margin is not: a contract runs
 * closer to the top than a letter, because a letter is printed on a letterhead
 * and has to clear it.
 *
 * Every document is A4. The employment contract in the bank came out US Letter,
 * which Kwame confirmed was an accident of that file rather than a choice, so
 * it is not preserved here — the top margin difference is real and stays.
 */
export const HOUSE_PAGE: Record<
  DocumentKind,
  { width: number; height: number; top: number; right: number; bottom: number; left: number }
> = {
  contract: { width: 11910, height: 16845, top: 1204, right: 1440, bottom: 1440, left: 1440 },
  resolution: { width: 11910, height: 16845, top: 1440, right: 1440, bottom: 1440, left: 1440 },
  letter: { width: 11900, height: 16820, top: 1834, right: 1440, bottom: 1440, left: 1440 },
};

/**
 * Body text is justified in all three documents, so it is the default rather
 * than something each paragraph has to ask for. An explicit alignment — the
 * centred title of a resolution, the right-aligned date of a letter — still
 * wins over it.
 */
export const HOUSE_ALIGN = "both";

export const HOUSE_SPACING = {
  /** Clause headings: 240 twips clear above and below. */
  headingBefore: 240,
  headingAfter: 240,
  /** Sub-clauses sit closer to the heading above than to the clause below. */
  bodyBefore: 280,
  bodyAfter: 120,
  /** "At least" 15pt, so a long line never closes up. */
  line: 300,
  indentLeft: 720,
  indentHanging: 720,
} as const;

/**
 * The type and paragraph spacing of each kind of document, in Word's units.
 *
 * A contract and a letter are set in the contract measure above: Arial 12 at
 * "at least" 15pt, air above every paragraph. A resolution is not. The signed
 * Goldenmark board resolution is Arial 11 on single lines, nothing above a
 * paragraph and only a little below it, in a near-black #1A1A1A, under a 14pt
 * title — a one-page instrument that is meant to fit on one page. Setting it
 * in the contract measure made it look like a contract and run to two.
 */
export const HOUSE_TYPE: Record<
  DocumentKind,
  {
    halfPoints: number;
    /** Hex without the hash; absent means Word's automatic black. */
    colour?: string;
    before: number;
    after: number;
    line: number;
    lineRule: "atLeast" | "auto";
    title: { halfPoints: number; before: number; after: number; caps: boolean };
    subtitle: { halfPoints: number; after: number; italic: boolean; colour: string };
  }
> = {
  contract: {
    halfPoints: HOUSE_FONT.halfPoints,
    before: HOUSE_SPACING.bodyBefore,
    after: HOUSE_SPACING.bodyAfter,
    line: HOUSE_SPACING.line,
    lineRule: "atLeast",
    title: { halfPoints: 32, before: 0, after: 120, caps: true },
    subtitle: { halfPoints: 20, after: 400, italic: true, colour: "4A4A4A" },
  },
  letter: {
    halfPoints: HOUSE_FONT.halfPoints,
    before: HOUSE_SPACING.bodyBefore,
    after: HOUSE_SPACING.bodyAfter,
    line: HOUSE_SPACING.line,
    lineRule: "atLeast",
    title: { halfPoints: 32, before: 0, after: 120, caps: true },
    subtitle: { halfPoints: 20, after: 400, italic: true, colour: "4A4A4A" },
  },
  resolution: {
    halfPoints: 22,
    colour: "1A1A1A",
    before: 0,
    after: 120,
    line: 240,
    lineRule: "auto",
    title: { halfPoints: 28, before: 480, after: 160, caps: false },
    subtitle: { halfPoints: 22, after: 240, italic: false, colour: "1A1A1A" },
  },
};

/**
 * Where each part of a resolution sits, from the same signed resolution.
 *
 * The firm's resolution runs wider than its margins: every paragraph is
 * pulled 567 twips out on the left and 326 on the right. Against that edge the
 * resolutions hang from the margin — (a) at the edge, the words 640 in — while
 * the recitals are set further in, (A) 940 in and their words at 1500. The
 * space beneath each part is the resolution's own, and the last of a run
 * takes more, so the list closes before the next heading.
 */
export const HOUSE_RESOLUTION = {
  left: -567,
  right: -326,
  opening: { after: 220 },
  label: { after: 180 },
  recital: { left: 933, hanging: 560, after: 120, lastAfter: 200 },
  resolution: { left: 73, hanging: 640, after: 110, lastAfter: 360 },
  paragraph: { after: 220 },
  /** The directors sign side by side in a table without borders. */
  signatures: { width: 9782, indent: -426, before: 360, columns: 2 },
} as const;

/**
 * A letter's signature, from the firm's export request and salary letters:
 * the closing, room to sign, a dotted rule, the signatory's name in bold, and
 * beneath it the title and whom they sign for.
 */
export const HOUSE_LETTER = {
  /** The room left to sign in beneath "Yours faithfully,". */
  signingSpace: 560,
  closings: ["Yours faithfully,", "Yours sincerely,", "Sincerely,"],
  salutations: ["Dear Sir/Madam,", "To Whom It May Concern"],
} as const;

/**
 * The front of a contract, measured from the employment contract in the
 * template bank: the cover title, then the lines that run from "THIS …
 * CONTRACT" to "NOW IT IS HEREBY AGREED". Twips and half-points, as Word
 * stores them, so the exporter and the editor's preview read one table.
 */
export const HOUSE_FRONT = {
  /** 1.15 lines, the spacing every front paragraph carries. */
  line: 276,
  /** The cover title: 14pt bold, centred, a rule above and below it. */
  coverHalfPoints: 28,
  coverAfter: 160,
  /** The operative sentence has a full line clear beneath it; the rest half. */
  titleAfter: 240,
  after: 120,
  /** WHEREAS and the operative words take air above them as well. */
  recitalBefore: 120,
  agreedBefore: 120,
  agreedAfter: 200,
  /** Each party: the number at the margin and the text hanging 1.25cm in. */
  hanging: 709,
  /**
   * Where the cover title sits when the contract is printed on the firm's
   * letterhead, whose logo occupies the middle of page one: this far down
   * the text area, clear of the logo, or at the foot of the page.
   */
  coverBelowLogo: 0.62,
} as const;

/**
 * Clause numbering, four levels deep.
 *
 * `1.` then `1.1` then `(a)` then `(i)`. The third and fourth levels change
 * character rather than growing another decimal — the contracts do not use
 * 1.1.1, and a level that reads (a) is the one a lawyer cross-refers to.
 */
export const HOUSE_NUMBERING: {
  level: number;
  format: "decimal" | "lowerLetter" | "lowerRoman";
  text: string;
  left: number;
  hanging: number;
}[] = [
  { level: 0, format: "decimal", text: "%1.", left: 720, hanging: 720 },
  { level: 1, format: "decimal", text: "%1.%2", left: 720, hanging: 720 },
  { level: 2, format: "lowerLetter", text: "(%3)", left: 1555, hanging: 561 },
  { level: 3, format: "lowerRoman", text: "(%4)", left: 2275, hanging: 576 },
];

/**
 * What a blank looks like on the page.
 *
 * The firm's drafts leave an empty bracket — "a gross salary of [ ] Ghana
 * Cedis". We keep the bracket and put the name of the missing fact inside it,
 * so the document reads in house form and the drafter can still tell what
 * belongs there. An empty bracket in a thirty-page contract is a question
 * without a subject.
 *
 * Internally a gap is `{{Name}}`, the form Templates already uses, so one
 * convention finds them all.
 */
export const renderPlaceholder = (name: string) => `[${name.trim() || " "}]`;

export const toHousePlaceholders = (text: string) =>
  text.replace(/\{\{\s*([a-zA-Z0-9_ .-]{1,60}?)\s*\}\}/g, (_, name: string) =>
    renderPlaceholder(name),
  );

/**
 * The furniture each kind of document is built from, in order.
 *
 * This is what the drafting prompt is told to produce and what a reviewer can
 * check a draft against. It is structure only — no wording, because the wording
 * is the lawyer's and the model's job, not a fixture's.
 */
export const HOUSE_STRUCTURE: Record<DocumentKind, { part: string; note: string }[]> = {
  contract: [
    { part: "Title", note: "The agreement type in capitals, centred." },
    {
      part: "Date and parties",
      note: 'THIS [TYPE] (the "Contract") is made on this [day] of [month] [year], then BETWEEN: with each party numbered (1), (2), giving incorporation details or identification and address.',
    },
    {
      part: "Collective definition",
      note: 'A line naming the parties collectively as the "Parties" and individually as a "Party".',
    },
    { part: "Recitals", note: "WHEREAS …, stating why the parties are contracting." },
    { part: "Operative words", note: "NOW IT IS HEREBY AGREED as follows:" },
    {
      part: "Clause 1",
      note: "DEFINITIONS AND INTERPRETATION. Defined terms in quotation marks, alphabetical, each ending in a semicolon, closing with the rule that headings do not affect interpretation.",
    },
    {
      part: "Operative clauses",
      note: "Each with a capitalised heading and numbered sub-clauses. Cross-references name the clause, as in clause 13 (Termination).",
    },
    { part: "Schedules", note: "Referred to by number and name where the clauses rely on them." },
  ],
  resolution: [
    {
      part: "Title",
      note: "WRITTEN RESOLUTIONS OF THE DIRECTORS OF, then the company name in capitals, both centred.",
    },
    { part: "Date", note: "Dated this [ ] day of [ ] [year], centred." },
    { part: "Company", note: "The company and its registered office, justified." },
    {
      part: "Recitals",
      note: "Considering that: followed by lettered recitals (A), (B), (C) — capitals.",
    },
    {
      part: "Resolutions",
      note: "It is resolved that: followed by lettered resolutions (a), (b), (c) — lower case.",
    },
    {
      part: "Execution",
      note: "A signature rule per director, with the name and Director beneath.",
    },
  ],
  letter: [
    { part: "Reference", note: "Our Ref: at the head of the letter, where there is one." },
    { part: "Date", note: "Right aligned, written out as 25th August 2026." },
    {
      part: "Sender",
      note: "The office address block. Leave it out when the letterhead already carries it.",
    },
    { part: "Addressee", note: "The recipient's name and address." },
    {
      part: "Salutation",
      note: "Dear Sir/Madam, — or To Whom It May Concern where there is no addressee.",
    },
    { part: "Subject", note: "RE: SUBJECT IN CAPITALS, centred, naming the person or matter." },
    { part: "Body", note: "Justified paragraphs, each making one point." },
    { part: "Purpose", note: "A closing line saying why the letter was issued." },
    {
      part: "Execution",
      note: "Yours faithfully, room to sign, a dotted rule, the name in bold, the title, and whom they sign for.",
    },
  ],
};

/** The house rules as a drafting instruction, for the AI prompt. */
export function houseStyleBrief(kind: DocumentKind): string {
  return [
    `House style for a ${kind}:`,
    ...HOUSE_STRUCTURE[kind].map((s) => `- ${s.part}: ${s.note}`),
    kind === "contract"
      ? "- Numbering: clauses 1., sub-clauses 1.1, then (a), then (i). Never 1.1.1."
      : "",
    "- Any fact you were not given is a {{placeholder}} naming what is missing. Never invent a party, a sum, a date or a registration number.",
  ]
    .filter(Boolean)
    .join("\n");
}
