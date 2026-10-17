/**
 * Frameworks a lawyer can start from instead of a blank page.
 *
 * Every profession that regulates itself publishes what competence means, and
 * those documents are better than anything a product could invent: they are
 * what the regulator will actually measure, they are already the vocabulary of
 * appraisals and training records, and they are public. A lawyer who has to
 * type forty requirements before the portal says anything useful will type
 * none, so the first thing offered is a real framework, ready to read against
 * their evidence.
 *
 * WHAT IS HERE IS THE STRUCTURE, NOT THE DOCUMENT. The competence codes and
 * the short descriptor of each are the profession's own shorthand — a lawyer
 * saying "B4" in a supervision meeting is understood. The elaboration under
 * each one is the regulator's text and is not reproduced: each framework
 * carries the link, and the original is always a click away. Everything added
 * is ordinary editable criteria afterwards; nothing about a starter is fixed.
 */
import type { CriterionKind } from "./model";

export type FrameworkCriterion = {
  code: string;
  kind: CriterionKind;
  section: string;
  text: string;
  essential: boolean;
};

export type Framework = {
  id: string;
  title: string;
  organisation: string;
  /** Who publishes it, and where the full text lives. */
  source: string;
  url: string;
  blurb: string;
  criteria: FrameworkCriterion[];
};

/**
 * The SRA's Statement of Solicitor Competence.
 *
 * Four areas, fifteen competences, and the framework English and Welsh
 * solicitors are assessed against for continuing competence. Useful well
 * beyond that jurisdiction: it is the most carefully worked-out account of
 * what a solicitor does that exists in public, and firms across the common law
 * world borrow from it.
 */
const SRA: Framework = {
  id: "sra-competence",
  title: "Statement of Solicitor Competence",
  organisation: "Solicitors Regulation Authority",
  source: "SRA, Statement of solicitor competence (updated 2022)",
  url: "https://www.sra.org.uk/solicitors/resources/continuing-competence/competence-statement/",
  blurb:
    "Four areas and fifteen competences — the framework solicitors in England and Wales record continuing competence against. A good spine for a supervision conversation anywhere.",
  criteria: [
    {
      code: "A1",
      kind: "competency",
      section: "A · Ethics, professionalism and judgement",
      text: "Act honestly and with integrity, in accordance with legal and regulatory requirements",
      essential: true,
    },
    {
      code: "A2",
      kind: "competency",
      section: "A · Ethics, professionalism and judgement",
      text: "Maintain the level of competence and legal knowledge needed to practise effectively",
      essential: true,
    },
    {
      code: "A3",
      kind: "competency",
      section: "A · Ethics, professionalism and judgement",
      text: "Work within the limits of your competence and the supervision needed",
      essential: true,
    },
    {
      code: "A4",
      kind: "competency",
      section: "A · Ethics, professionalism and judgement",
      text: "Draw on a sufficient detailed knowledge of your field to practise effectively",
      essential: true,
    },
    {
      code: "A5",
      kind: "competency",
      section: "A · Ethics, professionalism and judgement",
      text: "Apply understanding, critical thinking and analysis to solve problems",
      essential: true,
    },
    {
      code: "B1",
      kind: "skill",
      section: "B · Technical legal practice",
      text: "Obtain relevant facts",
      essential: true,
    },
    {
      code: "B2",
      kind: "skill",
      section: "B · Technical legal practice",
      text: "Undertake legal research",
      essential: true,
    },
    {
      code: "B3",
      kind: "skill",
      section: "B · Technical legal practice",
      text: "Develop and advise on relevant options, strategies and solutions",
      essential: true,
    },
    {
      code: "B4",
      kind: "skill",
      section: "B · Technical legal practice",
      text: "Draft documents which are legally effective and accurately reflect the client's instructions",
      essential: true,
    },
    {
      code: "B5",
      kind: "skill",
      section: "B · Technical legal practice",
      text: "Undertake effective spoken and written advocacy",
      essential: false,
    },
    {
      code: "B6",
      kind: "skill",
      section: "B · Technical legal practice",
      text: "Negotiate solutions to clients' issues",
      essential: true,
    },
    {
      code: "B7",
      kind: "responsibility",
      section: "B · Technical legal practice",
      text: "Plan, manage and progress legal cases and transactions",
      essential: true,
    },
    {
      code: "C1",
      kind: "skill",
      section: "C · Working with other people",
      text: "Communicate clearly and effectively, orally and in writing",
      essential: true,
    },
    {
      code: "C2",
      kind: "responsibility",
      section: "C · Working with other people",
      text: "Establish and maintain effective and professional relations with clients",
      essential: true,
    },
    {
      code: "C3",
      kind: "responsibility",
      section: "C · Working with other people",
      text: "Establish and maintain effective and professional relations with other people",
      essential: true,
    },
    {
      code: "D1",
      kind: "responsibility",
      section: "D · Managing yourself and your own work",
      text: "Initiate, plan, prioritise and manage work activities",
      essential: true,
    },
    {
      code: "D2",
      kind: "responsibility",
      section: "D · Managing yourself and your own work",
      text: "Keep, use and maintain accurate, complete and clear records",
      essential: true,
    },
    {
      code: "D3",
      kind: "responsibility",
      section: "D · Managing yourself and your own work",
      text: "Apply good business practice",
      essential: true,
    },
  ],
};

/**
 * A senior associate's step up, written from what firms actually promote on.
 *
 * Not published by anybody — this is the common ground between the promotion
 * criteria firms circulate, offered as a starting point to edit rather than as
 * an authority. Said plainly in the blurb, because a lawyer should know which
 * of these came from a regulator and which came from a product.
 */
const STEP_UP: Framework = {
  id: "senior-step-up",
  title: "Step up to senior associate",
  organisation: "",
  source: "Scripta's own starting point, not a published framework",
  url: "",
  blurb:
    "The things firms usually promote on, as a starting point to edit. Nobody published this one — it is here so you are not staring at an empty list.",
  criteria: [
    {
      code: "1",
      kind: "responsibility",
      section: "Running the work",
      text: "Run matters of your own from instruction to completion, with supervision by exception rather than by default",
      essential: true,
    },
    {
      code: "2",
      kind: "responsibility",
      section: "Running the work",
      text: "Own the client relationship on your matters, including scope, expectations and fees",
      essential: true,
    },
    {
      code: "3",
      kind: "responsibility",
      section: "Running the work",
      text: "Supervise and review the work of junior lawyers, and give feedback they can act on",
      essential: true,
    },
    {
      code: "4",
      kind: "competency",
      section: "Judgement",
      text: "Take a commercial position on a difficult point and be able to defend it",
      essential: true,
    },
    {
      code: "5",
      kind: "competency",
      section: "Judgement",
      text: "Spot the risk nobody asked about and raise it in time",
      essential: true,
    },
    {
      code: "6",
      kind: "experience",
      section: "Building the practice",
      text: "Contribute to winning work: pitches, client development, or a referral relationship of your own",
      essential: true,
    },
    {
      code: "7",
      kind: "experience",
      section: "Building the practice",
      text: "Contribute to the firm's knowledge — a precedent, a playbook, training given",
      essential: false,
    },
    {
      code: "8",
      kind: "skill",
      section: "Craft",
      text: "Draft the principal documents in your practice area without a template to lean on",
      essential: true,
    },
    {
      code: "9",
      kind: "skill",
      section: "Craft",
      text: "Negotiate directly with the other side and hold a position under pressure",
      essential: true,
    },
  ],
};

export const FRAMEWORKS: Framework[] = [SRA, STEP_UP];

/**
 * The SRA's Threshold Standard, as a reference for what "how far in" means.
 *
 * Six dimensions, of which autonomy is the one this portal records on every
 * piece of evidence. Shown beside the ladder so a lawyer can see that the
 * question being asked of them is the regulator's question, not an invention.
 */
export const THRESHOLD_DIMENSIONS = [
  "Functioning knowledge",
  "Standard of work",
  "Autonomy",
  "Complexity",
  "Perception of context",
  "Innovation and originality",
];

export const THRESHOLD_SOURCE = {
  label: "SRA Threshold Standard",
  url: "https://www.sra.org.uk/solicitors/resources/continuing-competence/threshold-standard/",
};
