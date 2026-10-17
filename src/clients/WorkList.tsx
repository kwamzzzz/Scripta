/**
 * The work filed under a client, as a list that can be acted on where it is.
 *
 * Each row opens its item, and its ⋯ menu offers what the item's own screen
 * would: Open first, Rename, Archive or Restore, Delete last. Renaming happens
 * in the row itself (Enter saves, Escape leaves it), and a task can be ticked
 * off or given a due date without leaving the client.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import ActionMenu, { type MenuAction } from "@/components/ActionMenu";

export type WorkRow = {
  id: string;
  title: string;
  meta: string[];
  when?: string;
  done?: boolean;
  archived?: boolean;
  onOpen?: () => void;
  /** A tick box before the title; given the state it was changed to. */
  onToggleDone?: (done: boolean) => Promise<unknown>;
  onRename?: (next: string) => Promise<boolean>;
  due?: { value: string | null; onChange: (next: string | null) => Promise<boolean> };
  /** Archive, Restore, Delete and the like; Open and Rename are added for you. */
  actions?: MenuAction[];
  /** How the item is named in "Actions for …". */
  label?: string;
};

const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

export default function WorkList({
  rows,
  empty,
  toolbar,
}: {
  rows: WorkRow[];
  empty: ReactNode;
  toolbar?: ReactNode;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dating, setDating] = useState<string | null>(null);
  // A tick shows at once and a second click reads it, rather than waiting for
  // the list to come back from the database.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setTicked((prev) => {
      const next = { ...prev };
      for (const r of rows) if (next[r.id] === !!r.done) delete next[r.id];
      return next;
    });
  }, [rows]);
  return (
    <div className="cw">
      {toolbar && <div className="cw-bar">{toolbar}</div>}
      {!rows.length ? (
        <div className="cl-quiet">{empty}</div>
      ) : (
        <ul className="cw-list">
          {rows.map((r) => (
            <li key={r.id} className={`cw-row${r.archived ? " is-archived" : ""}`}>
              {r.onToggleDone && (
                <input
                  type="checkbox"
                  className="cw-check"
                  checked={ticked[r.id] ?? !!r.done}
                  aria-label={
                    (ticked[r.id] ?? r.done)
                      ? `Mark “${r.title}” not done`
                      : `Mark “${r.title}” done`
                  }
                  onChange={(e) => {
                    const done = e.target.checked;
                    setTicked((prev) => ({ ...prev, [r.id]: done }));
                    void r.onToggleDone!(done);
                  }}
                />
              )}
              {renaming === r.id && r.onRename ? (
                <RenameField
                  value={r.title}
                  onCancel={() => setRenaming(null)}
                  onSave={async (next) => {
                    if (!next.trim() || next.trim() === r.title) return setRenaming(null);
                    if (await r.onRename!(next.trim())) setRenaming(null);
                  }}
                />
              ) : (
                <button type="button" className="cw-main" onClick={r.onOpen} disabled={!r.onOpen}>
                  <span className={`cw-title${(ticked[r.id] ?? r.done) ? " is-done" : ""}`}>
                    {r.title}
                  </span>
                  <span className="cw-meta">{r.meta.filter(Boolean).join(" · ")}</span>
                </button>
              )}
              <span className="cw-side">
                {r.due &&
                  (dating === r.id ? (
                    <input
                      type="date"
                      className="cw-date"
                      autoFocus
                      defaultValue={r.due.value ?? ""}
                      aria-label={`Due date for ${r.title}`}
                      onKeyDown={(e) => e.key === "Escape" && setDating(null)}
                      onBlur={async (e) => {
                        const next = e.target.value || null;
                        if (next !== r.due!.value) await r.due!.onChange(next);
                        setDating(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`cw-due${r.due.value ? "" : " is-empty"}`}
                      onClick={() => setDating(r.id)}
                    >
                      {r.due.value ? `Due ${shortDate(r.due.value)}` : "Add due date"}
                    </button>
                  ))}
                {r.when && <span className="cw-when">{r.when}</span>}
                {r.onRename && renaming !== r.id && (
                  <button
                    type="button"
                    className="cw-icon"
                    aria-label={`Rename “${r.title}”`}
                    title="Rename"
                    onClick={() => setRenaming(r.id)}
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                )}
                <ActionMenu
                  label={r.label ?? r.title}
                  actions={[
                    ...(r.onOpen ? [{ label: "Open", onClick: r.onOpen }] : []),
                    ...(r.onRename ? [{ label: "Rename", onClick: () => setRenaming(r.id) }] : []),
                    ...(r.due
                      ? [{ label: "Change due date", onClick: () => setDating(r.id) }]
                      : []),
                    ...(r.actions ?? []),
                  ]}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RenameField({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave(draft);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="cw-rename">
      <input
        ref={input}
        value={draft}
        aria-label="New name"
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => void save()}
      />
      <span className="cw-rename-hint">Enter to save · Esc to cancel</span>
    </span>
  );
}
