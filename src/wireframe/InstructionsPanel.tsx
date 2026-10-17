/**
 * The private Instructions panel. Instruction text never appears in the
 * document itself; it lives here, grouped by clause, where the lawyer can
 * review, expand, amend or delete each one and start the redraft.
 */
import { useState } from "react";
import { Trash2, X } from "lucide-react";
import GeminiMark from "@/components/GeminiMark";
import type { Instruction } from "./InstructionModals";

export default function InstructionsPanel({
  instructions,
  onUpdate,
  onRemove,
  onGoTo,
  onRedraft,
  onClose,
}: {
  instructions: Instruction[];
  onUpdate: (instruction: Instruction, summary: string) => void;
  onRemove: (instruction: Instruction) => void;
  onGoTo: (instruction: Instruction) => void;
  onRedraft: () => void;
  onClose: () => void;
}) {
  const groups = new Map<string, { title: string; items: Instruction[] }>();
  for (const i of instructions) {
    const g = groups.get(i.anchor) ?? { title: i.title, items: [] };
    g.items.push(i);
    groups.set(i.anchor, g);
  }
  return (
    <aside className="ce-instructions-panel" aria-label="Instructions">
      <header>
        <div>
          <strong>Instructions</strong>
          <span>
            {instructions.length
              ? `${instructions.length} held on ${groups.size} clause${groups.size === 1 ? "" : "s"} · private to you`
              : "Private to you"}
          </span>
        </div>
        <button type="button" aria-label="Close instructions" onClick={onClose}>
          <X />
        </button>
      </header>
      <div className="ce-instructions-list">
        {!instructions.length && (
          <p className="ce-instructions-empty">
            No instructions yet. Use the instruction control on a clause header to say what should
            change; it is kept here, off the document, until you start the redraft.
          </p>
        )}
        {[...groups.entries()].map(([anchor, group]) => (
          <section key={anchor}>
            <button
              type="button"
              className="ce-instructions-clause"
              onClick={() => onGoTo(group.items[0]!)}
              title="Go to clause"
            >
              <i>{anchor}</i>
              <b>{group.title}</b>
            </button>
            {group.items.map((item, k) => (
              <InstructionRow
                key={item.id ?? `${anchor}-${k}`}
                item={item}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            ))}
          </section>
        ))}
      </div>
      <footer>
        <button
          type="button"
          className="ce-redraft"
          disabled={!instructions.length}
          onClick={onRedraft}
        >
          <GeminiMark size={16} />
          Redraft with Scripta{instructions.length > 0 && <b>{instructions.length}</b>}
        </button>
      </footer>
    </aside>
  );
}

function InstructionRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: Instruction;
  onUpdate: (instruction: Instruction, summary: string) => void;
  onRemove: (instruction: Instruction) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.summary);
  const save = () => {
    const value = text.trim();
    if (value && value !== item.summary) onUpdate(item, value);
    setEditing(false);
  };
  if (editing)
    return (
      <div className="ce-instruction-edit">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
            if (e.key === "Escape") {
              setText(item.summary);
              setEditing(false);
            }
          }}
        />
        <div>
          <span>{item.scope === "section" ? "SECTION-LEVEL" : "CLAUSE-LEVEL"}</span>
          <button
            type="button"
            onClick={() => {
              setText(item.summary);
              setEditing(false);
            }}
          >
            Cancel
          </button>
          <button type="button" className="is-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    );
  return (
    <div className="ce-instruction-row">
      <button
        type="button"
        className="ce-instruction-text"
        onClick={() => setEditing(true)}
        title="Amend"
      >
        {item.summary}
      </button>
      <span>{item.scope === "section" ? "SECTION" : "CLAUSE"}</span>
      <button
        type="button"
        aria-label="Delete instruction"
        title="Delete"
        onClick={() => onRemove(item)}
      >
        <Trash2 />
      </button>
    </div>
  );
}
