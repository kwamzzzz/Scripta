import { HOUSE_FRONT, renderPlaceholder } from "@/lib/house-style";
import { HOUSE_SIGNATURE_RULE } from "@/lib/corporate/house";
import type { SignLine, SignTable } from "./docx";

/**
 * Everything before clause 1.
 *
 * The exporter began at the first clause. A contract that opens on
 * "1. DEFINITIONS AND INTERPRETATION" is not a contract yet — it has no cover,
 * does not say who is bound, on what date, or why, and never reaches the words
 * that make the rest operative. The firm's drafts carry the same front:
 *
 *   page one is the letterhead and the agreement type, and nothing else — no
 *   parties, no date, no rules. A first pass copied the cover from the tenancy
 *   agreement, which does list its parties; the employment contract does not,
 *   and the plain cover is the one to follow.
 *   page two opens on THIS [TYPE] … BETWEEN: the parties numbered, the line
 *   naming them collectively, WHEREAS, and NOW IT IS HEREBY AGREED as follows.
 *   The title is not repeated there — the cover has just said it.
 *
 * What the matter knows is used. What it does not know becomes a named
 * placeholder, so the gap is a question with a subject rather than a blank the
 * reader has to notice. Nothing here is invented — no address the app was not
 * given, no recital nobody wrote.
 */

/**
 * What the lawyer has said about the first page, where they have said it.
 *
 * Every field is optional and every empty one falls back to the matter's own
 * record. So editing the first page is a correction, not a second copy of the
 * matter that has to be kept in step with it.
 */
/**
 * Where the title sits on the cover, as a fraction of the text area from the
 * top margin: 0 is the top, 1 the foot. The firm's letterhead carries its
 * logo in the middle of page one, so the title is often moved below it; the
 * lawyer places it against the letterhead in the editor, or picks a preset.
 */
export const COVER_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: "Top of the page" },
  { value: HOUSE_FRONT.coverBelowLogo, label: "Below the letterhead logo" },
  { value: 0.9, label: "Foot of the page" },
];

/** A cover position read from anywhere: a number in [0, 1], or nothing. */
export const coverYOf = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined;

export type FrontMatterEdits = Partial<{
  agreementType: string;
  client: string;
  clientAddress: string;
  clientRole: string;
  counterparty: string;
  counterpartyAddress: string;
  counterpartyRole: string;
  date: string;
  recitals: string[];
  coverY: number;
  /**
   * The three lines that used to be locked as "Fixed wording".
   *
   * They are the form of a contract rather than anything it says, which is
   * why they were fixed — and the reasoning was too confident. A contract is
   * not always drafted to the firm's form: "BETWEEN" without the colon,
   * "IT IS AGREED as follows", a collective-parties line that names a Client
   * and a Service Provider rather than a First and Second Party. Locking the
   * words meant a document that said any of that could not be reproduced, and
   * being unable to match the agreement in front of you is a worse fault than
   * being able to type something odd.
   *
   * Empty means the house wording, which is what every contract had before.
   */
  betweenText: string;
  partiesText: string;
  agreedText: string;
  /**
   * Page one as THIS document sets it: the name of the agreement, who it was
   * prepared for and by, the date — centred on an otherwise empty sheet.
   *
   * Separate from `preamble` because they are two different things. A title
   * page is a label; a preamble is operative wording. Seeding both from one
   * lump put the title, the URLs and the date on page two, ranged left beside
   * the parties, which is not how any contract sets a title page.
   */
  titlePage: string;
  /**
   * The front of the contract as THIS document words it, editable as prose.
   *
   * A contract under review already says who is bound, from when and why, in
   * the drafter's own words. Rebuilding that from the matter's fields produced
   * a second, competing preamble full of [Date] and [First party address]
   * placeholders for facts the document had already stated — so the screen
   * showed the firm's form where the agreement's own front should be. When
   * this is set it IS the preamble; the field-by-field form is for a contract
   * being drafted from nothing.
   *
   * Paragraphs are separated by newlines. Empty means "not this document".
   */
  preamble: string;
}>;

/** The fields of the first page, in the order they are read on the page. */
export const FRONT_MATTER_FIELDS: {
  key: keyof Omit<FrontMatterEdits, "recitals">;
  label: string;
  placeholder: string;
  type?: "date";
}[] = [
  { key: "agreementType", label: "Agreement type", placeholder: "Employment Contract" },
  { key: "date", label: "Signing date", placeholder: "", type: "date" },
  { key: "client", label: "First party", placeholder: "Who they are" },
  {
    key: "clientAddress",
    label: "First party address",
    placeholder: "Registered office or address",
  },
  { key: "clientRole", label: "Called", placeholder: "Employer, Landlord, Purchaser…" },
  { key: "counterparty", label: "Second party", placeholder: "Who they are" },
  {
    key: "counterpartyAddress",
    label: "Second party address",
    placeholder: "Registered office or address",
  },
  { key: "counterpartyRole", label: "Called", placeholder: "Employee, Tenant, Vendor…" },
];

/** Read what was stored, tolerating anything that is not a front matter. */
export function readFrontMatterEdits(raw: unknown): FrontMatterEdits {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  const recitals = Array.isArray(o["recitals"])
    ? (o["recitals"] as unknown[]).filter((r): r is string => typeof r === "string")
    : undefined;
  const out: FrontMatterEdits = {};
  for (const k of [
    "agreementType",
    "client",
    "clientAddress",
    "clientRole",
    "counterparty",
    "counterpartyAddress",
    "counterpartyRole",
    "date",
    "preamble",
    "betweenText",
    "partiesText",
    "agreedText",
    "titlePage",
  ] as const) {
    const v = str(k);
    if (v !== undefined) out[k] = v;
  }
  if (recitals) out.recitals = recitals;
  const coverY = coverYOf(o["coverY"]);
  if (coverY !== undefined) out.coverY = coverY;
  return out;
}

export type FrontMatterSource = {
  /** "Employment Contract", "Supplemental Tenancy Agreement". */
  agreementType: string;
  client: string;
  counterparty: string;
  /** ISO date, or empty when the matter has none. */
  date: string;
  /** What each side is called in the operative clauses. */
  clientRole?: string | undefined;
  counterpartyRole?: string | undefined;
  clientAddress?: string | undefined;
  counterpartyAddress?: string | undefined;
  /** Recitals the lawyer has written. Never generated. */
  recitals?: string[] | undefined;
  coverY?: number | undefined;
  /** The document's own front matter, which replaces the built one entirely. */
  ownPreamble?: string | undefined;
  /** The document's own page one, which replaces the built cover entirely. */
  ownCover?: string | undefined;
  /** Overrides for the lines that were once fixed. Empty means the house wording. */
  betweenText?: string | undefined;
  partiesText?: string | undefined;
  agreedText?: string | undefined;
};

/** A run of one paragraph: the words and the weight they are set in. */
export type FrontMatterRun = {
  text: string;
  bold?: boolean;
  /** Raised and small, as the "st" of "1st" is. */
  sup?: boolean;
};

/** Which line of the front this is, so an editor can find it by name. */
export type FrontMatterPart =
  | "cover"
  | "title"
  | "between"
  | "party1"
  | "party2"
  | "parties"
  | "recital"
  | "agreed"
  | "blank"
  /** The document's own preamble, edited as one piece of prose. */
  | "own"
  /** The document's own page one, likewise. */
  | "ownCover";

export type FrontMatterLine = {
  /** The whole paragraph as plain text; a tab is "\t". Empty for a blank line. */
  text: string;
  /** The paragraph broken into runs where the weight changes. Absent means one regular run. */
  runs?: FrontMatterRun[];
  align: "left" | "center" | "justify";
  /** The whole line in bold, as BETWEEN: and the operative words are. */
  strong?: boolean;
  /** A full-width rule on its own, as an older cover drew. */
  rule?: boolean;
  /** A rule above and below the paragraph, as the cover title has. */
  framed?: boolean;
  /** Number at the margin, text hanging 1.25cm in, a tab between them. */
  hanging?: boolean;
  /** The cover title is set larger than the body. */
  size?: "cover" | "body";
  /** Twips, as Word measures paragraph spacing. */
  spaceBefore?: number;
  spaceAfter?: number;
  part?: FrontMatterPart;
};

export type FrontMatter = {
  cover: FrontMatterLine[];
  preamble: FrontMatterLine[];
  /** Where the cover title sits on page one, 0 (top) to 1 (foot). Absent means the top. */
  coverY?: number;
  /**
   * The execution page, one signing table per party, which closes the
   * contract after its last clause. It lives with the front because it is
   * built from the same parties the preamble names.
   */
  execution?: SignTable[];
};

const known = (value: string, name: string) => value.trim() || renderPlaceholder(name);

const ordinalOf = (day: number) =>
  day % 10 === 1 && day !== 11
    ? "st"
    : day % 10 === 2 && day !== 12
      ? "nd"
      : day % 10 === 3 && day !== 13
        ? "rd"
        : "th";

/** "1st September 2026", the form the firm writes dates in. */
export function longDate(iso: string): string {
  const at = Date.parse(iso);
  if (!iso.trim() || Number.isNaN(at)) return renderPlaceholder("Date");
  const d = new Date(at);
  const day = d.getUTCDate();
  return `${day}${ordinalOf(day)} ${d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}

/**
 * "1st day of September 2026", the form the operative sentence uses, broken
 * so the ordinal can be set superscript as the firm's contracts set it.
 * Null when there is no date to write.
 */
export function formalDate(iso: string): { day: string; ordinal: string; rest: string } | null {
  const at = Date.parse(iso);
  if (!iso.trim() || Number.isNaN(at)) return null;
  const d = new Date(at);
  const day = d.getUTCDate();
  return {
    day: String(day),
    ordinal: ordinalOf(day),
    rest: ` day of ${d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} ${d.getUTCFullYear()}`,
  };
}

/**
 * What the instrument calls itself. An employment contract is "the Contract";
 * anything styled an agreement is "the Agreement". The word is taken from the
 * agreement type rather than fixed, so a tenancy agreement does not open by
 * calling itself a contract.
 */
export const instrumentName = (agreementType: string) =>
  /\bagreement\b/i.test(agreementType) ? "Agreement" : "Contract";

/**
 * The matter's own record, corrected by whatever the lawyer typed on the first
 * page. An edit that is blank is not an edit: it falls through to the matter,
 * so clearing a field restores the derived value rather than emptying it.
 */
export function frontMatterSource(
  matter: { agreementType: string; client: string; counterparty: string; date: string },
  edits: FrontMatterEdits,
): FrontMatterSource {
  const pick = (edit: string | undefined, fallback: string) => (edit?.trim() ? edit : fallback);
  return {
    agreementType: pick(edits.agreementType, matter.agreementType),
    client: pick(edits.client, matter.client),
    counterparty: pick(edits.counterparty, matter.counterparty),
    date: pick(edits.date, matter.date),
    ...(edits.clientRole ? { clientRole: edits.clientRole } : {}),
    ...(edits.counterpartyRole ? { counterpartyRole: edits.counterpartyRole } : {}),
    ...(edits.clientAddress ? { clientAddress: edits.clientAddress } : {}),
    ...(edits.counterpartyAddress ? { counterpartyAddress: edits.counterpartyAddress } : {}),
    ...(edits.recitals?.length ? { recitals: edits.recitals } : {}),
    ...(edits.coverY !== undefined ? { coverY: edits.coverY } : {}),
    ...(edits.preamble?.trim() ? { ownPreamble: edits.preamble } : {}),
    ...(edits.titlePage?.trim() ? { ownCover: edits.titlePage } : {}),
    ...(edits.betweenText?.trim() ? { betweenText: edits.betweenText } : {}),
    ...(edits.partiesText?.trim() ? { partiesText: edits.partiesText } : {}),
    ...(edits.agreedText?.trim() ? { agreedText: edits.agreedText } : {}),
  };
}

const runsText = (runs: FrontMatterRun[]) => runs.map((r) => r.text).join("");

/**
 * One party, as the firm sets it: the number, a tab, then who they are and
 * what the contract calls them. The particulars are whatever the lawyer wrote
 * — an address, or a whole description beginning "a company incorporated…" —
 * and the joining word follows: a description that starts in lower case runs
 * on after a comma; an address is introduced by "of".
 */
const party = (
  part: "party1" | "party2",
  num: 1 | 2,
  name: string,
  particulars: string,
  role: string,
  tail: string,
): FrontMatterLine => {
  const joiner = /^[a-z]/.test(particulars.trim()) ? ", " : " of ";
  return {
    part,
    text: `(${num})\t${name}${joiner}${particulars} (the “${role}”)${tail}`,
    align: "justify",
    hanging: true,
    spaceAfter: HOUSE_FRONT.after,
  };
};

const blank = (hanging: boolean): FrontMatterLine => ({
  part: "blank",
  text: "",
  align: "justify",
  ...(hanging ? { hanging: true } : {}),
  spaceAfter: HOUSE_FRONT.after,
});

/**
 * One party's signing table, as the firm's employment contract closes: who
 * signs for the party on the left, and on the right the room to sign, the
 * dotted rule, and the signatory's name and title to be written in; then a
 * witness, likewise, beneath.
 *
 * Every party is signed for by an officer. Whether a party is a company or a
 * person is not something the matter records, and a name is not evidence of
 * either, so the lawyer strikes the words for an individual rather than the
 * app guessing.
 */
export function executionTable(party: string): SignTable {
  // Half the page is narrower than a director's column in a resolution, so
  // the rule is shortened to stay on one line of it.
  const rule: SignLine = [{ text: HOUSE_SIGNATURE_RULE.slice(0, 15) }];
  const space: SignLine = [];
  return {
    before: 0,
    rows: [
      [
        [
          [
            { text: "Signed for and on behalf of " },
            { text: party, bold: true },
            { text: " by its duly authorised officer:" },
          ],
        ],
        [
          space,
          space,
          rule,
          [{ text: "Signature" }],
          space,
          [{ text: "Name:" }],
          space,
          [{ text: "Title:" }],
          space,
        ],
      ],
      [
        [[{ text: "In the presence of:" }]],
        [
          space,
          space,
          rule,
          [{ text: "Witness signature" }],
          space,
          [{ text: "Name:" }],
          space,
          [{ text: "Address:" }],
          space,
        ],
      ],
    ],
  };
}

/**
 * The document's own front matter, typeset as the export sets the rest.
 *
 * Its paragraphs are kept exactly as the drafter wrote them — nothing is
 * reordered, relabelled or completed from the matter's record, because the
 * whole point is that this document has already said these things. A short
 * all-capitals line ("BETWEEN", "WHEREAS") is set bold, which is how the firm
 * sets one and is a decision about weight rather than about words.
 */
function ownPreambleLines(text: string): FrontMatterLine[] {
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  return paragraphs.map((paragraph) => ({
    part: "own",
    text: paragraph,
    align: "justify",
    ...(paragraph.length <= 60 && paragraph === paragraph.toUpperCase() && /[A-Z]{2,}/.test(paragraph)
      ? { strong: true, align: "left" as const }
      : {}),
    spaceAfter: HOUSE_FRONT.after,
  }));
}

/** Page one as the document sets it: centred, at body size, no rules around it. */
function ownCoverLines(text: string): FrontMatterLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .map((line, at) => ({
      part: "ownCover" as const,
      text: line,
      align: "center" as const,
      ...(at === 0 ? { strong: true } : {}),
      spaceAfter: HOUSE_FRONT.after,
    }));
}

export function buildFrontMatter(source: FrontMatterSource): FrontMatter {
  const type = known(source.agreementType, "Agreement type");
  const client = known(source.client, "First party");
  const counterparty = known(source.counterparty, "Second party");
  const clientRole = source.clientRole?.trim() || "First Party";
  const counterpartyRole = source.counterpartyRole?.trim() || "Second Party";
  const instrument = instrumentName(type);

  const cover: FrontMatterLine[] = [
    {
      part: "cover",
      text: type.toUpperCase(),
      align: "center",
      strong: true,
      framed: true,
      size: "cover",
      spaceAfter: HOUSE_FRONT.coverAfter,
    },
  ];

  // THIS EMPLOYMENT CONTRACT (the “Contract”) is made on this 1st day of
  // September 2026 (the Signing Date) — the type in bold, the ordinal raised.
  const date = formalDate(source.date);
  const titleRuns: FrontMatterRun[] = [
    { text: `THIS ${type.toUpperCase()} `, bold: true },
    ...(date
      ? [
          { text: `(the “${instrument}”) is made on this ${date.day}` },
          { text: date.ordinal, sup: true },
          { text: `${date.rest} (the Signing Date)` },
        ]
      : [
          {
            text: `(the “${instrument}”) is made on this ${renderPlaceholder("Date")} (the Signing Date)`,
          },
        ]),
  ];

  const partiesRuns: FrontMatterRun[] = [
    { text: `(the ${clientRole} and the ${counterpartyRole} are together referred to as the ` },
    { text: "“Parties”", bold: true },
    { text: " and each individually as a " },
    { text: "“Party”", bold: true },
    { text: ")." },
  ];

  const preamble: FrontMatterLine[] = [
    {
      part: "title",
      text: runsText(titleRuns),
      runs: titleRuns,
      align: "justify",
      spaceAfter: HOUSE_FRONT.titleAfter,
    },
    {
      part: "between",
      text: source.betweenText?.trim() || "BETWEEN:",
      align: "left",
      strong: true,
      spaceAfter: HOUSE_FRONT.after,
    },
    party(
      "party1",
      1,
      client,
      known(source.clientAddress ?? "", "First party address"),
      clientRole,
      "; AND",
    ),
    blank(true),
    party(
      "party2",
      2,
      counterparty,
      known(source.counterpartyAddress ?? "", "Second party address"),
      counterpartyRole,
      ",",
    ),
    blank(true),
    // Typed wording is one plain run: the bold on "Parties" and "Party" is a
    // property of the sentence the app composes, not of whatever replaces it.
    source.partiesText?.trim()
      ? {
          part: "parties" as const,
          text: source.partiesText.trim(),
          align: "justify" as const,
          spaceAfter: HOUSE_FRONT.after,
        }
      : {
          part: "parties" as const,
          text: runsText(partiesRuns),
          runs: partiesRuns,
          align: "justify" as const,
          spaceAfter: HOUSE_FRONT.after,
        },
    blank(false),
  ];

  // Recitals are the lawyer's account of why the parties are contracting. The
  // app does not have one unless it was written, and will not compose one.
  // A recital typed with its own "WHEREAS" is not given a second one.
  const recitals = (source.recitals ?? [])
    .map((r) => r.trim().replace(/^whereas[\s,:]+/i, ""))
    .filter(Boolean);
  const recitalTexts = recitals.length
    ? recitals.map((text, i) => `${i === 0 ? "WHEREAS " : ""}${text}`)
    : [`WHEREAS ${renderPlaceholder("Why the parties are contracting")}`];
  preamble.push(
    ...recitalTexts.map((text, i): FrontMatterLine => ({
      part: "recital",
      text,
      align: "justify",
      ...(i === 0 ? { spaceBefore: HOUSE_FRONT.recitalBefore } : {}),
      spaceAfter: HOUSE_FRONT.after,
    })),
  );

  preamble.push({
    part: "agreed",
    text: source.agreedText?.trim() || "NOW IT IS HEREBY AGREED as follows:",
    align: "left",
    strong: true,
    spaceBefore: HOUSE_FRONT.agreedBefore,
    spaceAfter: HOUSE_FRONT.agreedAfter,
  });

  // The document's own front replaces the built one whole. Returning a mix of
  // the two would put the firm's placeholders next to the drafter's own words
  // and leave the reader to work out which governs.
  const own = source.ownPreamble?.trim() ? ownPreambleLines(source.ownPreamble) : null;
  const ownCover = source.ownCover?.trim() ? ownCoverLines(source.ownCover) : null;

  return {
    cover: ownCover ?? cover,
    preamble: own ?? preamble,
    coverY: coverYOf(source.coverY) ?? 0,
    execution: [executionTable(client), executionTable(counterparty)],
  };
}
