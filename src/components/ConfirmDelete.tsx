/**
 * The one confirmation in Scripta.
 *
 * Deleting is the only action a lawyer cannot take back, so it is the only one
 * that asks. Archiving does not ask: it is reversible, and a question before a
 * reversible action teaches people to dismiss questions.
 *
 * Every delete asks the same way, in the same words: what is going, what goes
 * with it, what actually happens to it, and — where the item can be archived —
 * that putting it aside for good is the other option. Screens supply the
 * nouns; the sentence is built here so it cannot drift.
 *
 * Built on the shared Modal rather than a browser confirm, which cannot say
 * what else goes, cannot mark the destructive button, and looks like the
 * browser rather than the app.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import { C } from "@/lib/tokens";
import { RECENTLY_DELETED_DAYS } from "@/lib/trash";
import "./confirm-delete.css";

export type DeleteRequest = {
  /** Named as a lawyer would say it: `“Vendor Agreement v3”`, `3 playbooks`. */
  what: string;
  /** How many are going, for pronoun agreement. Default 1. */
  count?: number;
  /** What else is lost, when deleting takes more than the item itself. */
  consequence?: string;
  /** Whether archiving is offered as the reversible alternative. Default true. */
  archivable?: boolean;
  /**
   * Whether this goes to Recently Deleted. Default true.
   *
   * False for the parts of a record — a position inside a playbook, a section
   * inside a template — which have no bin because there is no collection to
   * recover them into. Those really are gone, and the sentence says so.
   */
  binned?: boolean;
};

/**
 * "Delete “X”? …" — the same sentence wherever it is asked.
 *
 * The middle line used to read "This cannot be undone." For anything with a
 * bin that is now simply untrue, and a confirmation that overstates what it
 * does teaches people to dismiss confirmations. It says what actually happens
 * instead, and keeps the old line only where it is still true.
 *
 * Archiving is still offered beside it, because the two are different
 * promises: Recently Deleted holds something for a fortnight, archiving holds
 * it for ever.
 */
export function deleteQuestion(request: DeleteRequest) {
  const many = (request.count ?? 1) !== 1;
  const it = many ? "them" : "it";
  const goes = many ? "They go" : "It goes";
  const fate =
    request.binned === false
      ? "This cannot be undone."
      : `${goes} to Recently Deleted and ${many ? "are" : "is"} removed for good after ${RECENTLY_DELETED_DAYS} days.`;
  return {
    title: `Delete ${request.what}?`,
    body: [
      request.consequence,
      fate,
      request.archivable === false ? null : `Archive ${it} instead to keep ${it} for good.`,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/**
 * `const { confirmDelete, confirmDialog } = useConfirmDelete();`
 *
 * Await `confirmDelete(...)` where a browser confirm used to sit, and render
 * `confirmDialog` once anywhere in the screen.
 */
export function useConfirmDelete(): {
  confirmDelete: (request: DeleteRequest) => Promise<boolean>;
  confirmDialog: ReactNode;
} {
  const [request, setRequest] = useState<DeleteRequest | null>(null);
  const answer = useRef<(confirmed: boolean) => void>(() => {});

  const confirmDelete = useCallback(
    (next: DeleteRequest) =>
      new Promise<boolean>((resolve) => {
        answer.current = resolve;
        setRequest(next);
      }),
    [],
  );

  const settle = (confirmed: boolean) => {
    setRequest(null);
    answer.current(confirmed);
    answer.current = () => {};
  };

  const words = request ? deleteQuestion(request) : null;

  return {
    confirmDelete,
    confirmDialog: (
      <Modal open={!!request} onClose={() => settle(false)} label="Confirm delete">
        <div className="scripta-confirm">
          <div className="scripta-confirm-title">{words?.title}</div>
          <p className="scripta-confirm-body">{words?.body}</p>
          <div className="scripta-confirm-actions">
            <Button onClick={() => settle(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => settle(true)}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    ),
  };
}

/** The colour the destructive button carries, for screens that need it inline. */
export const DANGER = C.red;
