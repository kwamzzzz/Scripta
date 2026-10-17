/**
 * Learning — the pieces an author builds a course with.
 *
 * Everything is named as it is made. A course, a module or an item created as
 * "Untitled" and renamed afterwards is two steps where one will do, and the
 * placeholder names are what a learner ends up reading when the second step is
 * forgotten.
 */
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import type { CourseVisibility } from "./model";
import "@/components/organise.css";

/** A name field and an Add button, in place. Enter adds; Escape closes. */
export function InlineAdd({
  label,
  placeholder,
  onAdd,
  onCancel,
}: {
  label: string;
  placeholder: string;
  /** Resolves once the thing exists; the field clears for the next one. */
  onAdd: (name: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [waiting, setWaiting] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  // Names are saved one after another, in the order typed. Someone adding a
  // list presses Enter and carries straight on; the next name must not wait
  // for, or be swallowed by, the save of the one before.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef(onAdd);
  latest.current = onAdd;

  const add = () => {
    const next = name.trim();
    if (!next) return;
    setName("");
    setWaiting((n) => n + 1);
    queue.current = queue.current
      .then(() => latest.current(next))
      .catch(() => {
        // Put the name back so nothing typed is lost.
        setName((current) => (current ? current : next));
      })
      .finally(() => setWaiting((n) => n - 1));
    input.current?.focus();
  };
  const busy = waiting > 0;

  return (
    <form
      className="lr-inline-add"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <input
        ref={input}
        autoFocus
        aria-label={label}
        value={name}
        // Never disabled while saving: a disabled field drops the cursor, and
        // the next name typed straight after Enter would go nowhere.
        aria-busy={busy}
        placeholder={placeholder}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      />
      <button type="submit" className="lr-btn" data-primary="true" disabled={!name.trim()}>
        {busy ? "Adding…" : "Add"}
      </button>
      <button type="button" className="lr-btn" onClick={onCancel}>
        Done
      </button>
    </form>
  );
}

export type NewCourse = {
  title: string;
  subtitle: string;
  visibility: CourseVisibility;
  cpdHours: number;
  endsOn: string | null;
  /** Topic modules to lay out from the structured template, or null for a blank course. */
  template: number | null;
};

export function NewCourseDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (course: NewCourse) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [visibility, setVisibility] = useState<CourseVisibility>("self");
  const [hours, setHours] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [structured, setStructured] = useState(true);
  const [topics, setTopics] = useState("4");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSubtitle("");
    setVisibility("self");
    setHours("");
    setEndsOn("");
    setStructured(true);
    setTopics("4");
    setError(null);
  }, [open]);

  const submit = async () => {
    if (busy) return;
    if (!title.trim()) {
      setError("Give the course a title.");
      return;
    }
    const cpd = Number(hours || 0);
    if (visibility === "assigned" && (!Number.isFinite(cpd) || cpd < 0)) {
      setError("CPD hours must be a number, or left empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        title: title.trim(),
        subtitle: subtitle.trim(),
        visibility,
        cpdHours: visibility === "assigned" ? cpd : 0,
        endsOn: visibility === "assigned" && endsOn ? endsOn : null,
        template: structured ? Math.min(20, Math.max(1, Number(topics) || 4)) : null,
      });
      onClose();
    } catch (cause) {
      setError(errorText(cause, "The course could not be created."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} label="New course">
      <form
        className="org-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2>New course</h2>
        <p>
          Name it and say who it is for. Modules, their outlines and the reading that answers them
          are added once it exists.
        </p>
        <label className="org-field">
          <span className="org-label">Title</span>
          <input
            autoFocus
            value={title}
            placeholder="The UAE legal system"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="org-field">
          <span className="org-label">What it covers (optional)</span>
          <textarea
            className="lr-textarea"
            rows={3}
            value={subtitle}
            placeholder="One or two sentences a learner reads before starting."
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </label>
        <fieldset className="lr-choice">
          <legend className="org-label">Who it is for</legend>
          <label>
            <input
              type="radio"
              name="visibility"
              checked={visibility === "self"}
              onChange={() => setVisibility("self")}
            />
            <span>
              <b>My own reading</b>
              <small>Private to you. No CPD hours.</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="visibility"
              checked={visibility === "assigned"}
              onChange={() => setVisibility("assigned")}
            />
            <span>
              <b>Firm training</b>
              <small>Everyone in the workspace can see and enrol. Can carry CPD hours.</small>
            </span>
          </label>
        </fieldset>
        <fieldset className="lr-choice">
          <legend className="org-label">Start with</legend>
          <label>
            <input
              type="radio"
              name="start"
              checked={structured}
              onChange={() => setStructured(true)}
            />
            <span>
              <b>The structured course template</b>
              <small>
                Start here with the course team, then topic modules that each run listen, read,
                watch and review, then a final test. Every item is named and placed, with notes
                saying what goes where. Just add the content and the audio and video.
              </small>
              {structured ? (
                <span style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                  <input
                    className="lr-input"
                    style={{ width: 64 }}
                    inputMode="numeric"
                    aria-label="Number of topic modules"
                    value={topics}
                    onChange={(e) => setTopics(e.target.value.replace(/\D/g, ""))}
                  />
                  <small>topic modules</small>
                </span>
              ) : null}
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="start"
              checked={!structured}
              onChange={() => setStructured(false)}
            />
            <span>
              <b>A blank course</b>
              <small>Add modules and items yourself.</small>
            </span>
          </label>
        </fieldset>
        {visibility === "assigned" ? (
          <div style={{ display: "flex", gap: 12 }}>
            <label className="org-field" style={{ flex: 1 }}>
              <span className="org-label">CPD hours on completion</span>
              <input
                inputMode="decimal"
                value={hours}
                placeholder="0"
                onChange={(e) => setHours(e.target.value)}
              />
            </label>
            <label className="org-field" style={{ flex: 1 }}>
              <span className="org-label">Complete by (optional)</span>
              <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </label>
          </div>
        ) : null}
        {error ? (
          <p className="org-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="org-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create course"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Supabase rejects with a plain object, not an Error; both carry a message. */
export function errorText(cause: unknown, fallback: string): string {
  if (cause && typeof cause === "object" && "message" in cause) {
    const message = (cause as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}
