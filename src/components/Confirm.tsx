/**
 * The question Scripta asks when something is not a delete.
 *
 * `ConfirmDelete` is deliberately narrow: it builds one sentence about one act,
 * so that every delete in the app reads identically and cannot drift. That
 * narrowness is why four other confirmations were still browser dialogs —
 * replacing a draft, discarding edits, restoring an old version, revoking
 * access. None of them is a delete, and forcing them through the delete
 * wording would have made the dialog lie: it would have offered archiving, and
 * said "This cannot be undone" about a thing you can simply do again.
 *
 * So the shape is shared and the words are not. The caller supplies the
 * question and the verb on the button, because only the caller knows what is
 * about to happen. What is shared is that it looks like Scripta, that the
 * destructive option is marked, and that the safe option is not called
 * "Cancel" when the risky one is called "OK".
 *
 * Use `useConfirmDelete` for deletes. Use this for everything else that a
 * lawyer would want a moment to think about.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import "./confirm-delete.css";

export type ConfirmRequest = {
  /** The question, as a question. "Replace the draft?" */
  title: string;
  /** What actually happens if they say yes. The part worth reading. */
  body: string;
  /** The verb on the confirming button. Never "OK" — say what it does. */
  confirmLabel: string;
  /** The way out. Defaults to "Cancel", which is right when nothing is lost. */
  cancelLabel?: string;
  /** Whether the confirming button is marked destructive. Default true. */
  danger?: boolean;
};

export function useConfirm(): {
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  confirmDialog: ReactNode;
} {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const answer = useRef<(confirmed: boolean) => void>(() => {});

  const confirm = useCallback(
    (next: ConfirmRequest) =>
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

  return {
    confirm,
    confirmDialog: (
      <Modal open={!!request} onClose={() => settle(false)} label={request?.title ?? "Confirm"}>
        <div className="scripta-confirm">
          <div className="scripta-confirm-title">{request?.title}</div>
          <p className="scripta-confirm-body">{request?.body}</p>
          <div className="scripta-confirm-actions">
            <Button onClick={() => settle(false)}>{request?.cancelLabel ?? "Cancel"}</Button>
            <Button
              variant={request?.danger === false ? "primary" : "danger"}
              onClick={() => settle(true)}
            >
              {request?.confirmLabel}
            </Button>
          </div>
        </div>
      </Modal>
    ),
  };
}
