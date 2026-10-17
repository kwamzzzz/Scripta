/**
 * What a collection says when it has nothing in it.
 *
 * An empty collection is the first thing a new lawyer sees, and "No documents
 * yet" tells them nothing they had not already worked out. It should say what
 * belongs here and offer the one action that puts something here.
 *
 * `library.css` has carried `.scripta-library-empty` all along — heading and
 * paragraph styles included. The screens simply passed a bare sentence instead,
 * so the styling went unused and each screen's empty state drifted.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/primitives";

export type LibraryEmptyProps = {
  /** What is missing, as a statement rather than an apology. */
  title: string;
  /** One or two sentences on what belongs here and where it comes from. */
  children: ReactNode;
  /** The action that fills it. Omitted where the collection fills itself. */
  action?: { label: string; onClick: () => void } | undefined;
};

export default function LibraryEmpty({ title, children, action }: LibraryEmptyProps) {
  return (
    <div className="scripta-library-empty">
      <h2>{title}</h2>
      <p>{children}</p>
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
