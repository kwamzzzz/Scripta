/**
 * Deleting a course that has something in it.
 *
 * A course with no modules goes at once: there is nothing to lose. A course
 * with modules takes two deliberate steps, because there is no bin for
 * courses and a course can hold hours of writing, recordings and every
 * learner's progress. Step one says exactly what goes and offers archiving,
 * which keeps everything and can be undone. Step two asks for the course's
 * name to be typed, so the delete cannot be a slip of the mouse.
 */
import { useState } from "react";
import { Modal } from "@/wireframe/screens";
import "@/components/organise.css";

export type CourseSize = { title: string; modules: number; items: number; files: number };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function DeleteCourseDialog({
  course,
  archived,
  onArchive,
  onDelete,
  onClose,
}: {
  course: CourseSize;
  /** Already archived: archiving is not offered again. */
  archived: boolean;
  onArchive: () => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const name = course.title.trim() || "Untitled course";
  const matches = typed.trim() === name;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const contents = [
    plural(course.modules, "module"),
    plural(course.items, "item"),
    course.files
      ? plural(course.files, "audio, video or other file", "audio, video and other files")
      : null,
  ].filter(Boolean);

  return (
    <Modal open onClose={onClose} label="Delete course">
      <div className="org-dialog">
        {step === 1 ? (
          <>
            <h2>Delete “{name}”?</h2>
            <p>
              This course has {contents.join(", ")}. Deleting it removes all of it, and every
              learner’s progress on it, for good. There is no bin for courses and it cannot be
              undone.
            </p>
            {!archived ? (
              <p>
                <b>Archive it instead</b> if you might want it again: it leaves the shelf but keeps
                everything, and you can restore it from Archived at any time.
              </p>
            ) : null}
            <div className="org-actions" style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                className="lr-btn"
                data-danger="true"
                disabled={busy}
                onClick={() => setStep(2)}
              >
                Continue to delete
              </button>
              <span style={{ display: "flex", gap: 8 }}>
                <button type="button" className="lr-btn" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                {!archived ? (
                  <button
                    type="button"
                    className="lr-btn"
                    data-primary="true"
                    disabled={busy}
                    onClick={() => void run(onArchive)}
                  >
                    Archive instead
                  </button>
                ) : null}
              </span>
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (matches && !busy) void run(onDelete);
            }}
            style={{ display: "grid", gap: 12 }}
          >
            <h2>Type the course name to delete it</h2>
            <p>
              To confirm, type <b>{name}</b> exactly as it appears. {contents.join(", ")} will be
              deleted permanently.
            </p>
            <label className="org-field">
              <span className="org-label">Course name</span>
              <input
                autoFocus
                value={typed}
                aria-label="Type the course name to confirm"
                placeholder={name}
                onChange={(e) => setTyped(e.target.value)}
                onPaste={(e) => e.preventDefault()}
              />
            </label>
            <div className="org-actions" style={{ justifyContent: "space-between" }}>
              <button type="button" className="lr-btn" onClick={() => setStep(1)} disabled={busy}>
                Back
              </button>
              <span style={{ display: "flex", gap: 8 }}>
                <button type="button" className="lr-btn" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="lr-btn lr-btn-danger-solid"
                  disabled={!matches || busy}
                >
                  {busy ? "Deleting…" : "Delete permanently"}
                </button>
              </span>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
