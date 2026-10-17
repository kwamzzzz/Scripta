/**
 * Book Review: the exact checks. Rule-based, no AI, pure functions: they
 * read the parsed manuscript and the style sheet and return findings and the
 * conventions they noticed. Every finding rests on quoted evidence; anything
 * the author must decide is a query, never a silent choice.
 */
import { checkAbbreviations } from "./abbreviations";
import { checkCapitalisation } from "./capitalisation";
import { checkCitations } from "./citations";
import { checkDates } from "./dates";
import { freshRules } from "./finding";
import { checkHyphenation } from "./hyphenation";
import { checkMechanics } from "./mechanics";
import { checkNameVariants } from "./names";
import { checkNumbers } from "./numbers";
import { checkQuotation } from "./quotes";
import { checkReferences } from "./references";
import { checkStyleRules } from "./rules";
import { checkSpelling } from "./spelling";
import type { CheckInput, CheckResult } from "./types";

export type { CheckInput, CheckResult, DetectedRule } from "./types";
export {
  checkAbbreviations,
  checkCapitalisation,
  checkCitations,
  checkDates,
  checkHyphenation,
  checkMechanics,
  checkNameVariants,
  checkNumbers,
  checkQuotation,
  checkReferences,
  checkSpelling,
  checkStyleRules,
};

/** Every check, in the order their findings are returned. */
export const CHECKS: { id: string; run: (input: CheckInput) => CheckResult }[] = [
  { id: "references", run: checkReferences },
  { id: "citations", run: checkCitations },
  { id: "style-rules", run: checkStyleRules },
  { id: "spelling", run: checkSpelling },
  { id: "hyphenation", run: checkHyphenation },
  { id: "capitalisation", run: checkCapitalisation },
  { id: "abbreviations", run: checkAbbreviations },
  { id: "numbers", run: checkNumbers },
  { id: "dates", run: checkDates },
  { id: "quotation", run: checkQuotation },
  { id: "names", run: checkNameVariants },
  { id: "mechanics", run: checkMechanics },
];

export function runChecks(input: CheckInput): CheckResult {
  const findings: CheckResult["findings"] = [];
  const detected: CheckResult["detectedRules"] = [];
  for (const check of CHECKS) {
    const r = check.run(input);
    findings.push(...r.findings);
    detected.push(...r.detectedRules);
  }
  // Fingerprints are unique within each check; make sure they are across checks too.
  const seen = new Set<string>();
  const unique = findings.filter((f) => (seen.has(f.fingerprint) ? false : (seen.add(f.fingerprint), true)));
  return { findings: unique, detectedRules: freshRules(input.rules, detected) };
}
