/**
 * The text behind a final version, where Scripta has it.
 *
 * A deliverable's version is a file. Keeping one as a precedent needs the
 * drafting itself, and Scripta only holds that when it produced the document:
 * a memo it composed, a contract or resolution it drafted. For a file somebody
 * uploaded there is nothing to keep but the file, so the offer is withheld
 * rather than made and then refused.
 */
import type { DerivedDeliverable } from "./model";

export type KeepSource = { ok: true; load: () => Promise<string> } | { ok: false; why: string };

export function keepSource(deliverable: DerivedDeliverable): KeepSource {
  if (deliverable.kind !== "document")
    return { ok: false, why: "Only a document can be kept as a precedent." };

  if (deliverable.type === "memo" && deliverable.editorRef) {
    const researchId = deliverable.editorRef;
    return {
      ok: true,
      load: async () => {
        const { loadResearchMatter } = await import("@/lib/research-store.functions");
        const res = await loadResearchMatter({ data: { id: researchId } });
        const memo = (
          res as { state?: { memo?: { sections?: { heading?: string; body?: string }[] } } }
        ).state?.memo;
        return (memo?.sections ?? [])
          .map((s) => [s.heading, s.body].filter(Boolean).join("\n"))
          .join("\n\n")
          .trim();
      },
    };
  }

  if (deliverable.type === "contract")
    return {
      ok: false,
      why: "Keep a contract's wording from the review, clause by clause — a whole agreement is not a precedent.",
    };

  if (deliverable.type === "board_resolution" || deliverable.type === "letter")
    return {
      ok: false,
      why: "Keep this from the corporate drafting editor, where the sections are.",
    };

  return { ok: false, why: "Scripta does not hold the text of this document." };
}
