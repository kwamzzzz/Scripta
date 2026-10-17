/** Wireframe 1d: instruction capture and the redraft-session selector. */
import { Fragment, useState } from "react";
import { Trash2 } from "lucide-react";

export type Instruction = {
  id?: string;
  title: string;
  summary: string;
  anchor: string;
  on: boolean;
  clauseId?: string;
  basis?: string;
  scope?: "section" | "clause";
  /** Still only in this browser: an instruction an older build stored locally. */
  local?: boolean;
};

/** Wireframe 1c(i): the clause-anchored instruction panel. */
export function InstructionComposer({
  clauseLabel,
  instructions,
  onAdd,
  onRemove,
  onClose,
}: {
  clauseLabel: string;
  instructions: Instruction[];
  onAdd: (text: string) => void;
  onRemove: (instruction: Instruction) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onAdd(value);
    setText("");
  };
  return (
    <div className="ce-instruction-composer">
      <header>
        <strong>Instructions</strong>
        <button type="button" aria-label="Close instructions" onClick={onClose}>
          ×
        </button>
      </header>
      {!!instructions.length && (
        <div className="ce-held-instructions">
          {instructions.map((instruction, index) => (
            <div className="ce-held-instruction" key={`${instruction.anchor}-${index}`}>
              <span>{instruction.summary}</span>
              <button
                type="button"
                aria-label={`Delete instruction ${index + 1}`}
                title="Delete instruction"
                onClick={() => onRemove(instruction)}
              >
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        autoFocus
        aria-label={`Instruction for ${clauseLabel}`}
        placeholder="Describe the change you want made…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
        }}
      />
      <footer>
        <span>⌘+ENTER TO ADD</span>
        <button type="button" disabled={!text.trim()} onClick={submit}>
          <span className="ce-play" aria-hidden />
          Add
        </button>
      </footer>
    </div>
  );
}

export function InstructionCapture({
  clauseLabel,
  onAdd,
  onClose,
}: {
  clauseLabel: string;
  onAdd: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    onClose();
  };
  return (
    <div title={clauseLabel}>
      <div
        style={{
          width: "min(340px, calc(100vw - 52px))",
          border: "1px solid #dedede",
          borderRadius: "10px",
          background: "#fff",
          boxShadow: "0 6px 18px rgba(0,0,0,.07)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "11px 14px",
            borderBottom: "1px solid #e8e8e8",
            display: "flex",
            alignItems: "center",
          }}
        >
          <span>Instruction</span>
          <div style={{ flex: "1" }}></div>
          <button
            type="button"
            aria-label="Close instruction"
            style={{ color: "#6b6b6b" }}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <textarea
            aria-label={`Instruction for ${clauseLabel}`}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
            placeholder="Increase the interest rate by 3%"
            style={{
              border: "1px solid #d4d4d4",
              borderRadius: "8px",
              padding: "11px 12px",
              minHeight: "98px",
              color: "#333333",
              lineHeight: "1.5",
              font: "inherit",
              resize: "vertical",
              width: "100%",
              background: "#fff",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ font: "500 10.5px 'Geist',sans-serif", color: "#6b6b6b" }}>
              ⌘+ENTER TO ADD
            </span>
            <div style={{ flex: "1" }}></div>
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim()}
              style={{
                border: "1px solid #0b57d0",
                background: "#0b57d0",
                color: "#fff",
                borderRadius: "6px",
                padding: "6px 16px",
                fontSize: "12px",
              }}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InstructionSelector({
  instructions,
  toggle,
  remove,
  onStart,
  onClose,
}: {
  instructions: Instruction[];
  toggle: (i: number) => void;
  remove: (i: number) => void;
  onStart: (chosen: Instruction[]) => void;
  onClose: () => void;
}) {
  const count = instructions.filter((i) => i.on).length;
  const start = () => onStart(instructions.filter((i) => i.on));
  return (
    <>
      <div
        style={{
          alignSelf: "flex-end",
          width: "min(520px, calc(100vw - 52px))",
          border: "1px solid #dedede",
          borderRadius: "10px",
          background: "#fff",
          boxShadow: "0 6px 18px rgba(0,0,0,.07)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "13px 16px", borderBottom: "1px solid #e8e8e8" }}>
          <div>Select instructions to include</div>
          <div style={{ color: "#6f6f6f", fontSize: "12px" }}>
            Choose which instructions go into this redraft session
          </div>
        </div>
        <div
          style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "11px" }}
        >
          {instructions.map((ins, ins_i) => (
            <Fragment key={ins_i}>
              <div
                style={{
                  border: "1px solid #e4e4e4",
                  borderRadius: "8px",
                  padding: "12px",
                  display: "flex",
                  gap: "11px",
                  alignItems: "flex-start",
                }}
              >
                <input
                  type="checkbox"
                  aria-label={`Include ${ins.anchor}: ${ins.title}`}
                  checked={ins.on}
                  onChange={() => toggle(ins_i)}
                  style={{
                    width: "17px",
                    height: "17px",
                    border: ins.on ? "1px solid #0b57d0" : "1px solid #d4d4d4",
                    borderRadius: "4px",
                    background: ins.on ? "#e8f0fe" : "#fff",
                    flex: "none",
                    marginTop: "2px",
                  }}
                />
                <div
                  style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}
                >
                  <div>{ins.title}</div>
                  <div style={{ color: "#5f5f5f", fontSize: "12px", lineHeight: "1.5" }}>
                    {ins.summary}
                  </div>
                  <div
                    style={{
                      font: "500 10px 'Geist',sans-serif",
                      color: "#6b6b6b",
                      letterSpacing: ".06em",
                    }}
                  >
                    {ins.anchor}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove instruction ${ins_i + 1}`}
                  onClick={() => remove(ins_i)}
                  style={{ marginLeft: "auto", color: "#6b6b6b" }}
                >
                  ×
                </button>
              </div>
            </Fragment>
          ))}
        </div>
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid #e8e8e8",
            display: "flex",
            gap: "10px",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid #d4d4d4",
              borderRadius: "6px",
              padding: "7px 16px",
              fontSize: "12px",
              color: "#545454",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!count}
            onClick={start}
            style={{
              border: "1px solid #0b57d0",
              background: "#0b57d0",
              color: "#fff",
              borderRadius: "6px",
              padding: "7px 16px",
              fontSize: "12px",
            }}
          >
            {`Start with ${count} instruction${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </>
  );
}
