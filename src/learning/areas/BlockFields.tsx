/**
 * The fields for editing one block, by type. Practice questions, flashcards
 * and tables are edited in the same plain forms they can be pasted in, so a
 * deck of forty cards is forty lines rather than eighty fields.
 */
import { useEffect, useRef, useState } from "react";
import {
  cardsToText,
  parseCards,
  parseTable,
  tableToText,
  type Block,
  type Media,
} from "../blocks";
import { MediaView, TableView } from "./RichBlocks";

export function BlockFields({
  block,
  onChange,
  onUpload,
}: {
  block: Block;
  onChange: (fields: Partial<Block>) => void;
  /** Stores a file for this item; used for a credit's logo. */
  onUpload?: (file: File) => Promise<Media>;
}) {
  switch (block.type) {
    case "credit":
      return <CreditFields block={block} onChange={onChange} onUpload={onUpload} />;
    case "media":
      return (
        <>
          {block.media ? (
            <MediaView
              media={block.media}
              caption={block.text}
              onDuration={(seconds) =>
                block.media && onChange({ media: { ...block.media, seconds } })
              }
            />
          ) : null}
          <input
            className="lr-input"
            aria-label="Caption"
            placeholder="Caption: what the learner should take from it"
            value={block.text}
            onChange={(e) => onChange({ text: e.target.value })}
          />
        </>
      );
    case "quiz":
      return <QuizFields block={block} onChange={onChange} />;
    case "flashcards":
      return <CardsFields block={block} onChange={onChange} />;
    case "table":
      return <TableFields block={block} onChange={onChange} />;
    default:
      return (
        <>
          {block.type === "authority" ? (
            <input
              className="lr-input"
              aria-label="Citation"
              placeholder="Citation, e.g. UAE Constitution, Art. 7"
              value={block.cite ?? ""}
              onChange={(e) => onChange({ cite: e.target.value })}
            />
          ) : null}
          <AutoTextarea
            value={block.text}
            label={`${block.type} text`}
            placeholder={
              block.type === "note"
                ? "Guidance for whoever writes this item. Learners never see it."
                : block.type === "authority"
                  ? "What it says or why it matters (a link can go here)"
                  : block.type === "check"
                    ? "A question the learner should be able to answer"
                    : block.type === "heading"
                      ? "Heading"
                      : "Write here"
            }
            onChange={(text) => onChange({ text })}
          />
        </>
      );
  }
}

function QuizFields({ block, onChange }: { block: Block; onChange: (f: Partial<Block>) => void }) {
  const options = block.options ?? [];
  const answers = new Set(block.answers ?? []);
  const setOption = (i: number, text: string) =>
    onChange({ options: options.map((o, j) => (j === i ? text : o)) });
  const toggle = (i: number) => {
    const next = new Set(answers);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    onChange({ answers: [...next].sort((a, b) => a - b) });
  };
  const remove = (i: number) =>
    onChange({
      options: options.filter((_, j) => j !== i),
      answers: [...answers].filter((a) => a !== i).map((a) => (a > i ? a - 1 : a)),
    });

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <AutoTextarea
        value={block.text}
        label="Question"
        placeholder="The question"
        onChange={(text) => onChange({ text })}
      />
      {options.map((option, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <label className="lr-quiz-mark" title="A right answer">
            <input type="checkbox" checked={answers.has(i)} onChange={() => toggle(i)} />
            <b>{String.fromCharCode(65 + i)}</b>
          </label>
          <input
            className="lr-input"
            style={{ flex: 1 }}
            aria-label={`Option ${String.fromCharCode(65 + i)}`}
            value={option}
            placeholder="An answer"
            onChange={(e) => setOption(i, e.target.value)}
          />
          <button
            type="button"
            className="lr-btn"
            title="Remove this answer"
            onClick={() => remove(i)}
          >
            ✕
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          className="lr-btn"
          onClick={() => onChange({ options: [...options, ""] })}
        >
          Add an answer
        </button>
        {answers.size === 0 ? (
          <span className="lr-badge" data-tone="soon">
            tick the right answer
          </span>
        ) : null}
      </div>
      <AutoTextarea
        value={block.explanation ?? ""}
        label="Explanation"
        placeholder="Why the right answer is right (shown after the learner answers)"
        onChange={(explanation) => onChange({ explanation })}
      />
    </div>
  );
}

/** Edited as text, one "front :: back" per line; the deck is parsed as you type. */
function CardsFields({ block, onChange }: { block: Block; onChange: (f: Partial<Block>) => void }) {
  const [text, setText] = useState(() => cardsToText(block.cards ?? []));
  const count = parseCards(text).length;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <input
        className="lr-input"
        aria-label="Deck title"
        placeholder="Deck title (optional)"
        value={block.text}
        onChange={(e) => onChange({ text: e.target.value })}
      />
      <AutoTextarea
        value={text}
        label="Cards"
        placeholder={
          "One card per line:\nArticle 7 :: Islam the official religion; Sharia a main source of legislation"
        }
        onChange={(next) => {
          setText(next);
          onChange({ cards: parseCards(next) });
        }}
      />
      <span className="lr-saved">
        {count} {count === 1 ? "card" : "cards"}
      </span>
    </div>
  );
}

function TableFields({ block, onChange }: { block: Block; onChange: (f: Partial<Block>) => void }) {
  const [text, setText] = useState(() => tableToText(block.rows ?? []));
  const rows = parseTable(text);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <input
        className="lr-input"
        aria-label="Table title"
        placeholder="Table title (optional)"
        value={block.text}
        onChange={(e) => onChange({ text: e.target.value })}
      />
      <AutoTextarea
        value={text}
        label="Table"
        placeholder="Paste from a spreadsheet, or a Markdown table. The first row is the header."
        onChange={(next) => {
          setText(next);
          onChange({ rows: parseTable(next) });
        }}
      />
      {rows.length > 0 ? <TableView title="" rows={rows} /> : null}
    </div>
  );
}

/** A textarea that grows with its text, so a long paragraph is read whole. */
export function AutoTextarea({
  value,
  label,
  placeholder,
  onChange,
}: {
  value: string;
  label: string;
  placeholder: string;
  onChange: (text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="lr-textarea"
      rows={1}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ resize: "none", overflow: "hidden" }}
    />
  );
}

function CreditFields({
  block,
  onChange,
  onUpload,
}: {
  block: Block;
  onChange: (f: Partial<Block>) => void;
  onUpload?: ((file: File) => Promise<Media>) | undefined;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <input
        className="lr-input"
        aria-label="Name"
        placeholder="Name of the person (or leave empty to credit an organisation)"
        value={block.text}
        onChange={(e) => onChange({ text: e.target.value })}
      />
      <input
        className="lr-input"
        aria-label="Role"
        list="lr-team-roles"
        placeholder="Role: pick one or type your own"
        value={block.cite ?? ""}
        onChange={(e) => onChange({ cite: e.target.value })}
      />
      <datalist id="lr-team-roles">
        {[
          "Course manager",
          "Course tutor",
          "Course reviewer",
          "Course sponsor",
          "Author",
          "Presenter",
          "Subject expert",
        ].map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <input
        className="lr-input"
        aria-label="Organisation"
        placeholder="Organisation or institution"
        value={block.org ?? ""}
        onChange={(e) => onChange({ org: e.target.value })}
      />
      {onUpload ? (
        <label className="lr-btn" style={{ justifySelf: "start" }}>
          {block.photo ? "Replace photo" : "Add photo"}
          <input
            type="file"
            hidden
            accept="image/*"
            aria-label={`Photo for ${block.text || block.cite || "credit"}`}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              onChange({ photo: await onUpload(file) });
            }}
          />
        </label>
      ) : null}
      {block.photo ? (
        <button
          type="button"
          className="lr-btn"
          style={{ justifySelf: "start" }}
          onClick={() => onChange({ photo: undefined })}
        >
          Remove photo
        </button>
      ) : null}
      {onUpload ? (
        <label className="lr-btn" style={{ justifySelf: "start" }}>
          {busy ? "Adding logo…" : block.media ? "Replace logo" : "Add logo"}
          <input
            type="file"
            hidden
            accept="image/*"
            aria-label={`Logo for ${block.text || block.org || "credit"}`}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              try {
                onChange({ media: await onUpload(file) });
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
