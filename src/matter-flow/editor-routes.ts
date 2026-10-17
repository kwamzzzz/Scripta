/**
 * Open-in-editor routes by document type, reusing the editors that exist:
 *   contract          → the matter's contract editor (/matters/$matterId?screen=review)
 *   board resolution  → corporate drafting editor (/matters/corporate-drafting)
 *   letter            → corporate drafting editor
 *   memo              → memo composer (/research/$researchId?tab=memo)
 * Diagrams, schedules and annexes have no editor here: Download only.
 */
import type { Deliverable } from "./model";

export type EditorTarget = {
  label: string;
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
};

export function editorTarget(
  deliverable: Pick<Deliverable, "kind" | "type" | "editorRef">,
  matterId: string | null,
): EditorTarget | null {
  if (deliverable.kind !== "document") return null;
  switch (deliverable.type) {
    case "contract":
      // The contract editor is a matter's; a flow filed to no matter has none.
      if (!matterId) return null;
      return {
        label: "Contract editor",
        to: "/matters/$matterId",
        params: { matterId },
        search: { screen: "review" },
      };
    case "board_resolution":
    case "letter":
      return { label: "Corporate drafting editor", to: "/matters/corporate-drafting" };
    case "memo":
      return deliverable.editorRef
        ? {
            label: "Memo composer",
            to: "/research/$researchId",
            params: { researchId: deliverable.editorRef },
            search: { tab: "memo" },
          }
        : { label: "Memo composer", to: "/research" };
    default:
      return null;
  }
}

/** Human label for a document type, as drawn on the type chip. */
export const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  contract: "Contract",
  board_resolution: "Board resolution",
  memo: "Memorandum",
  letter: "Letter",
  diagram: "Diagram",
  schedule: "Schedule",
  annex: "Annex",
  client_note: "Client note",
  report: "Report",
  other: "Document",
};

export const ACTION_TYPE_LABEL: Record<string, string> = {
  meeting: "Meeting",
  email: "Email",
  visit: "Office visit",
  call: "Call",
  filing: "Filing",
  payment: "Payment",
  waiting: "Waiting on",
};

export const typeLabel = (d: Pick<Deliverable, "kind" | "type">) =>
  (d.kind === "document" ? DOCUMENT_TYPE_LABEL[d.type] : ACTION_TYPE_LABEL[d.type]) ?? d.type;
