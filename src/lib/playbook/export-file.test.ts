/**
 * That the export is a file Word will actually open.
 *
 * The document model is tested next door; this tests the thing that leaves the
 * building. A playbook a lawyer cannot open on a call is not an export, and the
 * failure would be invisible from inside the app — the download would simply
 * produce a file that will not open, somewhere else, later.
 */
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildCleanDocx } from "@/lib/export/docx";
import { playbookDocument, type ExportPlaybook, type ExportRule } from "./export-document";

const playbook: ExportPlaybook = {
  name: "Logistics services — supplier side",
  version_label: "v1",
  status: "Draft",
  jurisdiction: "Ghana",
  agreement_type: "Freight forwarding and logistics services agreements",
  our_role: "Supplier",
  description: "Standard supplier-side positions for logistics engagements",
  last_reviewed_at: "2026-09-16",
};

const blank = {
  acceptable: null,
  fallback: null,
  redflag: null,
  escalate: null,
  approved_clause_text: null,
  negotiation_guidance: null,
  commercial_rationale: null,
  legal_rationale: null,
  approval_threshold: null,
  risk_level: null,
};

const rules: ExportRule[] = [
  {
    ...blank,
    topic: "Fees and payment terms",
    category: "Commercial",
    preferred: "Payment within 30 days of a valid invoice.",
  },
  { ...blank, topic: "Termination", category: "Commercial", preferred: null },
  {
    ...blank,
    topic: "Limitation of liability",
    category: "Risk allocation",
    preferred: "Liability capped at the charges paid in the preceding 12 months.",
    redflag: "Any total exclusion of liability.",
    approved_clause_text: "Subject to clause 10.3, the total liability of each party …",
  },
];

const build = (chosen?: ExportRule[]) =>
  buildCleanDocx({
    ...playbookDocument(playbook, rules, chosen),
    kind: "letter",
    author: "Scripta",
    date: "2026-09-16T09:00:00.000Z",
  } as never);

/** The words Word will show, in order. */
async function textOf(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes as never);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((hit) => hit[1]).join("\n");
}

describe("the playbook as a file", () => {
  it("is a Word package, not bytes that merely have the extension", async () => {
    const bytes = build();
    // "PK" — every OOXML file is a zip, and Word refuses anything that is not.
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const zip = await JSZip.loadAsync(bytes as never);
    for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml"])
      expect(zip.file(part), `missing ${part}`).toBeTruthy();
  });

  it("carries the positions, their labels and the model wording", async () => {
    const text = await textOf(build());
    expect(text).toContain("Preferred");
    expect(text).toContain("Payment within 30 days of a valid invoice.");
    expect(text).toContain("Unacceptable");
    expect(text).toContain("Any total exclusion of liability.");
    expect(text).toContain("Approved wording");
    expect(text).toContain("Subject to clause 10.3");
  });

  it("says how current the playbook is, for the folder somebody opens in 2029", async () => {
    expect(await textOf(build())).toContain("Last reviewed 2026-09-16");
  });

  it("does not print a blank where a position was never written", async () => {
    const text = await textOf(build());
    expect(text).toContain("No position recorded yet");
  });

  /* An extract handed to somebody on a call must not read as the whole of the
     firm's position on everything. */
  it("admits on its face that one position is an extract", async () => {
    const text = await textOf(build([rules[2]!]));
    expect(text).toContain("1 of 3 positions — this is an extract, not the whole playbook.");
    expect(text).toContain("Limitation of liability");
    expect(text).not.toContain("Payment within 30 days");
  });
});
