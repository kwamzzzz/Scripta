import { byCategory } from "./issues";

/**
 * The playbook as a document somebody can carry out of Scripta.
 *
 * ---------------------------------------------------------------------------
 * THE PLAYBOOK IS THE FIRM'S, NOT THE APP'S
 * ---------------------------------------------------------------------------
 *
 * A firm records its positions here, but it uses them in places this product
 * has nothing to do with: on a call with a client, in a Word document somebody
 * is drafting by hand, in a folder of what the firm's position was in 2026 when
 * somebody asks in 2029. A playbook that can only be read on the screen it was
 * typed into is a worse filing cabinet than the one it replaced.
 *
 * So it exports whole, or one position at a time — because "what do we say
 * about liability" is the question actually asked on a call, and nobody wants
 * eighteen pages to answer it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS EMPTY IS SAID, NOT SKIPPED
 * ---------------------------------------------------------------------------
 *
 * A heading with nothing under it reads, in a printed document, as though the
 * firm has no view. It might mean that, or it might mean nobody has written it
 * down yet, and those are different things — the second is a task and the first
 * is a decision. An unwritten position says so in as many words.
 */

export type ExportRule = {
  topic: string;
  category: string | null;
  /** Where the lawyer put it within its category. */
  ordinal?: number | null;
  preferred: string | null;
  acceptable: string | null;
  fallback: string | null;
  redflag: string | null;
  escalate: string | null;
  approved_clause_text: string | null;
  negotiation_guidance: string | null;
  commercial_rationale: string | null;
  legal_rationale: string | null;
  approval_threshold: string | null;
  risk_level: string | null;
};

export type ExportPlaybook = {
  name: string;
  version_label: string | null;
  status: string | null;
  jurisdiction: string | null;
  agreement_type: string | null;
  our_role: string | null;
  description: string | null;
  last_reviewed_at: string | null;
};

type Seg = { t: string; k: "n" };
type Para = { runs: Seg[]; heading?: 1 | 2 | 3; quote?: boolean };
type Clause = { num: string; title: string; segs: Seg[]; paras?: Para[]; unnumbered?: boolean };

const line = (text: string, over: Partial<Para> = {}): Para => ({
  runs: [{ t: text, k: "n" }],
  ...over,
});

/**
 * The labels a lawyer reads on the page.
 *
 * Deliberately the words the editor uses, so the export and the screen cannot
 * describe the same field differently — the printed page is the one that gets
 * quoted back in a negotiation.
 */
const SECTIONS: { key: keyof ExportRule; label: string; quote?: boolean }[] = [
  { key: "preferred", label: "Preferred" },
  { key: "acceptable", label: "Acceptable" },
  { key: "fallback", label: "Fallback" },
  { key: "redflag", label: "Unacceptable" },
  { key: "escalate", label: "Escalate if" },
  { key: "approved_clause_text", label: "Approved wording", quote: true },
  { key: "negotiation_guidance", label: "How to argue it" },
  { key: "commercial_rationale", label: "Why the business cares" },
  { key: "legal_rationale", label: "Why the law cares" },
  { key: "approval_threshold", label: "Who must approve a deviation" },
];

const said = (value: string | null | undefined) => (value ?? "").trim();

/** Whether this position says anything at all. */
export const isWritten = (rule: ExportRule) =>
  SECTIONS.some((section) => said(rule[section.key] as string | null));

/** One position, as the paragraphs it prints to. */
export function rulePara(rule: ExportRule): Para[] {
  const out: Para[] = [];
  if (said(rule.risk_level)) out.push(line(`Risk level: ${said(rule.risk_level)}`));

  for (const section of SECTIONS) {
    const body = said(rule[section.key] as string | null);
    if (!body) continue;
    out.push(line(section.label, { heading: 3 }));
    for (const paragraph of body.split(/\n{2,}/)) {
      const text = paragraph.trim();
      if (text) out.push(line(text, section.quote ? { quote: true } : {}));
    }
  }

  if (out.length === 0 || !isWritten(rule)) {
    out.push(
      line(
        "No position recorded yet. This topic is on the playbook because it comes up in this kind of agreement, but nobody has written down where the firm stands.",
      ),
    );
  }
  return out;
}

/** The front matter: what this playbook is, and how current it is. */
export function playbookHeading(playbook: ExportPlaybook, showing: number, total: number): Para[] {
  const facts = [
    playbook.agreement_type,
    playbook.our_role ? `${playbook.our_role} side` : "",
    playbook.jurisdiction,
    playbook.version_label,
    playbook.status,
  ]
    .map((fact) => said(fact))
    .filter(Boolean);

  const out: Para[] = [];
  if (facts.length) out.push(line(facts.join(" · ")));
  if (said(playbook.description)) out.push(line(said(playbook.description)));

  out.push(
    line(
      said(playbook.last_reviewed_at)
        ? `Last reviewed ${said(playbook.last_reviewed_at).slice(0, 10)}.`
        : "This playbook has never been marked as reviewed.",
    ),
  );

  /* A partial export says so on its face. A page headed "Logistics playbook"
     holding one position, handed to somebody on a call, otherwise reads as the
     whole of the firm's position on everything. */
  out.push(
    line(
      showing === total
        ? `${total} ${total === 1 ? "position" : "positions"}.`
        : `${showing} of ${total} positions — this is an extract, not the whole playbook.`,
    ),
  );
  return out;
}

/**
 * The whole document. `chosen` limits it to an extract; omit for everything.
 */
export function playbookDocument(
  playbook: ExportPlaybook,
  rules: ExportRule[],
  chosen?: ExportRule[],
): { title: string; subtitle: string; clauses: Clause[] } {
  const showing = chosen ?? rules;
  const single = showing.length === 1 && rules.length !== 1;

  const clauses: Clause[] = [
    {
      num: "0",
      title: single ? `${playbook.name} — ${showing[0]!.topic}` : playbook.name,
      unnumbered: true,
      segs: [],
      paras: playbookHeading(playbook, showing.length, rules.length),
    },
  ];

  /* Grouped the way the screen groups, through the same function.
     -------------------------------------------------------------------------
     This walked the positions in the order they came and printed a heading
     whenever the category CHANGED. Positions are ordered by the lawyer, not by
     category, so a real playbook came out as
     COMMERCIAL, OPERATIONAL, RISK ALLOCATION, IP AND DATA, OPERATIONAL,
     BOILERPLATE, COMMERCIAL... — the same heading three times and the document
     jumping between subjects. Found by exporting an 18-position playbook and
     reading what came out.

     `byCategory` is what the overview and the rail already use, so the page a
     lawyer prints now reads in the same order as the screen they built it on. */
  let counter = 0;
  for (const group of byCategory(showing)) {
    group.rows.forEach((rule, within) => {
      counter += 1;
      const paras: Para[] = [];
      // The heading belongs to the first position under it, and appears once.
      if (within === 0) paras.push(line(group.category.toUpperCase(), { heading: 2 }));
      paras.push(...rulePara(rule));
      clauses.push({
        num: String(counter),
        title: rule.topic || "Untitled position",
        segs: [],
        paras,
      });
    });
  }

  return {
    title: single ? `${showing[0]!.topic} — ${playbook.name}` : playbook.name,
    subtitle: [playbook.agreement_type, playbook.jurisdiction].filter(Boolean).join(" · "),
    clauses,
  };
}

/** A filename a lawyer can find again in a folder of forty. */
export function playbookFilename(
  playbook: ExportPlaybook,
  chosen: ExportRule[] | undefined,
  total: number,
  format: string,
): string {
  const tidy = (text: string) =>
    text
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);
  const base =
    chosen && chosen.length === 1 && total !== 1
      ? `${tidy(playbook.name)}-${tidy(chosen[0]!.topic)}`
      : tidy(playbook.name);
  return `${base || "playbook"}.${format}`;
}
