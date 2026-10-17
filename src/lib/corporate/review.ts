/**
 * The drafting check Scripta runs before a corporate document is finalised.
 *
 * It is a completeness and consistency check, not legal approval. Everything it
 * reports is something a careful drafter would catch on a read-through: a
 * section left empty, a placeholder never filled, a company named one way in
 * the heading and another in the body, a resolution with nobody to sign it.
 * Scripta does not say the document is right; it says what is plainly missing.
 *
 * Every check is deterministic and reads only the document, so the result is
 * the same for the same document and can be relied on.
 */
import { partText, type EditorPart } from "@/editor/model";
import type { PreflightItem } from "@/components/Preflight";
import type { CorporateContentV2 } from "../corporate-documents";
import { endsAsHouse, housePunctuation } from "./house";
import { KIND_LABEL, type CorporateDocumentKind, type CorporateGroup } from "./kinds";

// The pre-flight before a document is finalised is the same check wherever it
// happens, so this speaks Contract Review's language rather than its own.
export type { PreflightItem } from "@/components/Preflight";

const PLACEHOLDER = /\[([^\]]{1,60})\]/g;

/** Sections a document of this kind cannot sensibly go out without. */
const REQUIRED_GROUPS: Record<CorporateDocumentKind, CorporateGroup[]> = {
  board_written_resolution: ["resolution", "execution"],
  board_minutes: ["attendance", "resolution"],
  shareholder_written_resolution: ["resolution", "execution"],
  letter: ["body"],
};

const GROUP_NOUN: Record<CorporateGroup, string> = {
  company: "company details",
  attendance: "attendance",
  recital: "recital",
  consideration: "consideration",
  resolution: "resolution",
  authority: "authority",
  execution: "execution",
  body: "body",
  purpose: "purpose",
};

const label = (part: EditorPart) => [part.num, part.title].filter(Boolean).join(" ") || "A section";

/** Loose comparison: case, punctuation and company suffixes aside. */
const normalise = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(limited|ltd|plc|inc|llc|gmbh|ag)\b\.?/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function reviewCorporateDocument(
  kind: CorporateDocumentKind,
  content: CorporateContentV2,
): PreflightItem[] {
  const findings: PreflightItem[] = [];
  const parts = content.parts;
  const particulars = content.particulars;
  const signatories = content.directors.filter((name) => name.trim());
  /** A check that failed. */
  const add = (input: {
    key: string;
    level: "blocking" | "warning";
    label: string;
    detail: string;
    count?: number;
    anchorId?: string;
  }) =>
    findings.push({
      key: input.key,
      level: input.level,
      label: input.label,
      detail: input.detail,
      count: input.count ?? 1,
      ...(input.anchorId ? { anchorId: input.anchorId } : {}),
    });

  /** A check that passed, stated rather than left silent. */
  const clear = (key: string, label: string, detail: string) =>
    findings.push({ key, level: "clear", label, detail, count: 0 });

  /* ------------------------------------------------------- the company */

  if (kind !== "letter") {
    if (!particulars["companyName"]?.trim())
      add({
        key: "company-name",
        level: "blocking",
        label: "The company is not named",
        detail: `A ${KIND_LABEL[kind].toLowerCase()} has to say which company resolved. Add the registered name in the front matter.`,
      });
    if (!particulars["registeredOffice"]?.trim())
      add({
        key: "registered-office",
        level: "warning",
        label: "No registered office",
        detail:
          "The registered office identifies the company beyond doubt. Add it, or delete the reference.",
      });
    if (!particulars["date"]?.trim())
      add({
        key: "date",
        level: "blocking",
        label: "The document is undated",
        detail:
          kind === "board_minutes"
            ? "Minutes record a meeting held on a date. Add it."
            : "A resolution takes effect on a date. Add it, or say it is dated on execution.",
      });
  } else {
    // A letter to whom it may concern has no addressee to miss.
    const unaddressed = /^to whom it may concern/i.test(particulars["salutation"]?.trim() ?? "");
    for (const [key, noun] of [
      ["addressee", "addressee"],
      ["subject", "subject"],
      ["signatoryName", "signatory"],
    ] as const)
      if (!particulars[key]?.trim() && !(key === "addressee" && unaddressed))
        add({
          key: `letter-${key}`,
          level: "blocking",
          label: `The letter has no ${noun}`,
          detail: `Add the ${noun} in the front matter; it is printed on the paper.`,
        });
  }

  /* ---------------------------------------------------------- sections */

  const present = new Set(parts.map((p) => p.group));
  for (const group of REQUIRED_GROUPS[kind])
    if (!present.has(group))
      add({
        key: `missing-${group}`,
        level: "blocking",
        label: `There is no ${GROUP_NOUN[group]} section`,
        detail: `A ${KIND_LABEL[kind].toLowerCase()} needs one. Add it from the bar above the document.`,
      });

  for (const part of parts) {
    const text = partText(part).trim();
    if (!text) {
      const required = REQUIRED_GROUPS[kind].includes(part.group);
      add({
        key: `empty-${part.id}`,
        level: required ? "blocking" : "warning",
        label: `${label(part)} is empty`,
        detail: part.hint
          ? part.hint
          : `Write the ${GROUP_NOUN[part.group]}, or remove the section.`,
        anchorId: part.id,
      });
      continue;
    }
    const placeholders = [...text.matchAll(PLACEHOLDER)].map((m) => m[1]!.trim());
    if (placeholders.length)
      add({
        key: `placeholder-${part.id}`,
        level: "blocking",
        label: `${label(part)} still has ${placeholders.length === 1 ? "a placeholder" : "placeholders"}`,
        detail: `Fill in ${placeholders.map((p) => `[${p}]`).join(", ")} before this goes out.`,
        anchorId: part.id,
      });
  }

  /* -------------------------------------------------------- consistency */

  const company = particulars["companyName"]?.trim();
  if (company && kind !== "letter") {
    const target = normalise(company);
    // A company named one way in the heading and another in the body is the
    // commonest defect in a resolution assembled from a precedent.
    const strays = parts.filter((part) => {
      const text = partText(part);
      const mentions = [
        ...text.matchAll(/\b([A-Z][A-Za-z&.' -]{3,60}?(?:Limited|Ltd|PLC|Inc|LLC|GmbH|AG))\b/g),
      ];
      return mentions.some((m) => normalise(m[1]!) !== target);
    });
    if (strays.length)
      add({
        key: "company-consistency",
        level: "warning",
        label: "Another company is named in the body",
        detail: `The document is made by ${company}, but ${strays.map(label).join(", ")} ${strays.length === 1 ? "names" : "name"} a different company. Check it is deliberate.`,
        ...(strays[0]?.id ? { anchorId: strays[0].id } : {}),
      });
  }

  /* --------------------------------------------------------- execution */

  if (kind !== "letter" && signatories.length === 0)
    add({
      key: "signatories",
      level: "blocking",
      label: "Nobody is named to sign",
      detail:
        kind === "board_minutes"
          ? "Minutes are signed by the chair. Name them in the front matter."
          : "A written resolution binds only those who sign it. Name the signatories in the front matter.",
    });

  if (kind === "board_minutes") {
    const attendance = parts
      .filter((p) => p.group === "attendance")
      .map(partText)
      .join(" ");
    if (attendance && !/quorum/i.test(attendance))
      add({
        key: "quorum",
        level: "warning",
        label: "Quorum is not recorded",
        detail:
          "Without a quorum nothing resolved at the meeting is valid. Say that a quorum was present.",
      });
  }

  if (kind === "shareholder_written_resolution" && !particulars["resolutionType"]?.trim())
    add({
      key: "resolution-type",
      level: "warning",
      label: "Ordinary or special is not stated",
      detail:
        "The threshold decides how the resolution must be passed and described. Say which it is.",
    });

  /* ------------------------------------------------------- punctuation */

  // A run of resolutions is punctuated the way the firm punctuates one:
  // semicolons throughout, "; and" before the last, a full stop at the end.
  // Reported rather than imposed, because the words are the lawyer's.
  const run = parts.filter((p) => p.group === "resolution" || p.group === "authority");
  run.forEach((part, index) => {
    const text = partText(part).trim();
    if (!text || endsAsHouse(text, index, run.length)) return;
    add({
      key: `punctuation-${part.id}`,
      level: "warning",
      label: `${label(part)} does not end as the house runs a list`,
      detail: `In a run of ${run.length}, this one should end "${housePunctuation(index, run.length)}".`,
      anchorId: part.id,
    });
  });

  /* --------------------------------------------------------- authority */

  for (const part of parts.filter((p) => p.group === "authority")) {
    const text = partText(part).toLowerCase();
    if (
      text.trim() &&
      !/(execute|sign|do all|take all|apply|open|negotiate|deliver|represent)/.test(text)
    )
      add({
        key: `authority-scope-${part.id}`,
        level: "warning",
        label: `${label(part)} does not say what may be done`,
        detail:
          "Authority that names no act authorises nothing. Say what the authorised person may execute, sign or do.",
        anchorId: part.id,
      });
  }

  // A check that found nothing is still a check that ran. Saying so is the
  // difference between "this was looked at" and "nothing was looked at".
  if (!findings.some((f) => f.key.startsWith("empty-") || f.key.startsWith("placeholder-")))
    clear(
      "sections",
      "Every section is written",
      "No section is empty and no placeholder is left to fill.",
    );
  if (!findings.some((f) => f.key === "signatories"))
    clear(
      "execution",
      kind === "letter" ? "The letter is signed" : "The signatories are named",
      kind === "board_minutes"
        ? "The chair is named to sign the minutes."
        : "Everyone who must sign is named in the front matter.",
    );
  if (kind !== "letter" && !findings.some((f) => f.key === "company-consistency"))
    clear(
      "consistency",
      "The company is named consistently",
      "No other company is named in the body of the document.",
    );

  return findings;
}

// Filtering and summarising a pre-flight is the same everywhere.
export { blocking, preflightSummary } from "@/components/Preflight";
