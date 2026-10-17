/**
 * A name that can be renamed where it is shown: a pencil beside it (on hover
 * or focus), or a double-click on the name, turns it into a field. Enter or
 * leaving the field saves; Escape puts the name back.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import "./editable-name.css";

export default function EditableName({
  value,
  onSave,
  label = "name",
  style,
  display,
}: {
  /** How the name reads when not being edited, a link for instance; the plain name if left out. */
  display?: ReactNode;
  value: string;
  /** Resolves true when the new name was saved. */
  onSave: (next: string) => Promise<boolean>;
  /** What is being renamed, for the screen reader: "flow". */
  label?: string;
  style?: CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  const save = async () => {
    if (busy) return;
    const next = draft.trim();
    if (!next || next === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      if (await onSave(next)) setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (editing)
    return (
      <input
        ref={input}
        className="scripta-editable-name-input"
        value={draft}
        disabled={busy}
        aria-label={`Rename ${label}`}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        onBlur={() => void save()}
      />
    );

  return (
    <span className="scripta-editable-name" style={style}>
      <span
        className="scripta-editable-name-text"
        onDoubleClick={() => setEditing(true)}
        title="Double-click to rename"
      >
        {display ?? value}
      </span>
      <button
        type="button"
        className="scripta-editable-name-button"
        aria-label={`Rename ${label}`}
        title={`Rename ${label}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }}
      >
        <Pencil size={13} aria-hidden />
      </button>
    </span>
  );
}
