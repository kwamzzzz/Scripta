import type { DraftFinding, ParsedNode, StyleRule } from "../model";

export type CheckInput = {
  nodes: ParsedNode[];
  rules: StyleRule[];
  /** Chapters under review. Null, undefined or empty: the whole manuscript. */
  targetChapterKeys?: string[] | null | undefined;
  /**
   * Where the manuscript came from. A Word file's pictures, tables and
   * captions are read reliably, so there a figure or table referred to but
   * absent is a broken reference; from a PDF it may just not have been found.
   */
  format?: "docx" | "pdf" | undefined;
};

export type DetectedRule = Omit<StyleRule, "id">;

export type CheckResult = { findings: DraftFinding[]; detectedRules: DetectedRule[] };

/** The most evidence locations a finding lists; the body says how many more there are. */
export const EVIDENCE_CAP = 12;
