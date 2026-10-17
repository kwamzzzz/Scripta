/**
 * 8d, the author's side: writing an item.
 *
 * The body stays a block document with stable ids (see blocks.ts). Each block
 * is edited in place with its type beside it; a whole item written elsewhere
 * can be pasted in and split into blocks by the prefixes textToBlocks reads.
 *
 * Saving is automatic and quiet: the document is written a moment after the
 * last keystroke and the state is shown as a word, not a spinner.
 */
import { useEffect, useRef, useState } from "react";
import EditableName from "@/components/EditableName";
import {
  BLOCK_TYPES,
  newBlockId,
  readBlocks,
  textToBlocks,
  type Block,
  type BlockType,
  type Media,
} from "../blocks";
import { BlockFields } from "./BlockFields";
import type { CourseFile } from "../db";
import { numberCourse } from "../model";

type SaveState = "saved" | "saving" | "unsaved" | "failed";

export function ItemEditor({
  file,
  itemId,
  onRename,
  onSaveBlocks,
  onDelete,
  onOpenModule,
  onOpenItem,
  onUpload,
  onRemoveMedia,
}: {
  file: CourseFile;
  itemId: string;
  onRename: (title: string) => Promise<boolean>;
  onSaveBlocks: (blocks: Block[]) => Promise<void>;
  /** Store a file for this item and say where it went. */
  onUpload: (file: File) => Promise<Media>;
  /** A file whose block was removed; nothing points at it any more. */
  onRemoveMedia: (path: string) => void;
  onDelete: () => void;
  onOpenModule: (id: string) => void;
  onOpenItem: (id: string) => void;
}) {
  const numbered = numberCourse(file.modules, file.items);
  const item = numbered.find((i) => i.id === itemId);
  const [blocks, setBlocks] = useState<Block[]>(() => readBlocks(item?.payload));
  const [state, setState] = useState<SaveState>("saved");
  const [paste, setPaste] = useState("");
  const [pasting, setPasting] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  // The latest blocks, for uploads that finish after more typing.
  const current = useRef<Block[]>([]);
  const timer = useRef<number | null>(null);
  const pending = useRef<Block[] | null>(null);

  // A different item, not a refetch of this one, replaces what is on screen.
  useEffect(() => {
    current.current = readBlocks(item?.payload);
    setBlocks(current.current);
    setState("saved");
    setPasting(false);
    setPaste("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const flush = async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setState("saving");
    try {
      await onSaveBlocks(next);
      setState(pending.current ? "unsaved" : "saved");
    } catch {
      setState("failed");
    }
  };

  // Leaving the item writes whatever is still waiting.
  useEffect(
    () => () => {
      void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemId],
  );

  const change = (next: Block[]) => {
    current.current = next;
    setBlocks(next);
    pending.current = next;
    setState("unsaved");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 700);
  };

  if (!item) {
    return (
      <div className="lr-page">
        <div className="lr-empty">That item is not in this course.</div>
      </div>
    );
  }

  const module = file.modules.find((m) => m.id === item.moduleId);
  const moduleItems = numbered.filter((i) => i.moduleId === item.moduleId && i.kind !== "folder");
  const position = moduleItems.findIndex((i) => i.id === item.id);
  const next = moduleItems[position + 1];
  const answers = module?.outline.find((l) => l.itemId === item.id);

  const patch = (id: string, fields: Partial<Block>) =>
    change(blocks.map((b) => (b.id === id ? { ...b, ...fields } : b)));
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= blocks.length) return;
    const out = [...blocks];
    [out[i], out[j]] = [out[j]!, out[i]!];
    change(out);
  };
  const insert = (type: BlockType, at = blocks.length) => {
    const out = [...blocks];
    out.splice(at, 0, { id: newBlockId(), type, text: "", ...starter(type) });
    change(out);
  };

  /**
   * Files become media blocks where the author put them: after the block they
   * were dropped on, or at the top of the item from the Add button, which sits
   * there. Each is stored as it arrives, so one refused file does not lose the
   * rest, and several land in the order given.
   */
  const addFiles = async (files: File[], afterBlockId: string | null = null) => {
    setUploadError(null);
    let anchor = afterBlockId;
    for (const f of files) {
      setUploading((u) => [...u, f.name]);
      try {
        const media = await onUpload(f);
        // "Mapping_the_UAE_Courts.mp4" reads "Mapping the UAE Courts"; a
        // spaced hyphen in a name is kept as a pause, not doubled spaces.
        const caption = f.name
          .replace(/\.[^.]+$/, "")
          .replace(/_+/g, " ")
          .replace(/\s+-\s+/g, ": ")
          .replace(/\s+/g, " ")
          .trim();
        const block: Block = { id: newBlockId(), type: "media", text: caption, media };
        const list = [...current.current];
        const at = anchor ? list.findIndex((b) => b.id === anchor) + 1 : 0;
        list.splice(at, 0, block);
        anchor = block.id;
        change(list);
        await flush();
      } catch (cause) {
        setUploadError(
          cause && typeof cause === "object" && "message" in cause
            ? String((cause as { message: unknown }).message)
            : `${f.name} could not be added.`,
        );
      } finally {
        setUploading((u) => u.filter((n) => n !== f.name));
      }
    }
  };

  return (
    <div className="lr-page">
      <div
        className={`lr-read${dragging ? " lr-drop" : ""}`}
        style={{ maxWidth: 760 }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          const target = (e.target as HTMLElement).closest("[data-block-id]");
          void addFiles([...e.dataTransfer.files], target?.getAttribute("data-block-id") ?? null);
        }}
      >
        <div className="lr-label">
          {module?.title ? `${module.title} · ` : ""}
          {item.number} · writing
        </div>
        <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <EditableName label="item" value={item.title || "Untitled item"} onSave={onRename} />
        </h2>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <span className="lr-saved" role="status">
            {state === "saved"
              ? blocks.length === 0
                ? "Nothing written yet"
                : `Saved · ${blocks.length} ${blocks.length === 1 ? "block" : "blocks"}`
              : state === "saving"
                ? "Saving…"
                : state === "unsaved"
                  ? "Unsaved changes"
                  : "Not saved. Keep typing to retry."}
          </span>
          {answers ? (
            <span style={{ fontSize: 12, color: "#5f5f5f" }}>Answers “{answers.text}”</span>
          ) : (
            <span className="lr-badge" data-tone="soon">
              answers no outline line
            </span>
          )}
        </div>

        {blocks.length === 0 || pasting ? (
          <div className="lr-card" style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            <div className="lr-label">
              {blocks.length === 0 ? "Start by pasting or typing the item" : "Paste more text"}
            </div>
            <textarea
              className="lr-textarea"
              rows={8}
              value={paste}
              aria-label="Paste text"
              placeholder={
                "A blank line starts a new block. Prefixes set the kind of block:\n" +
                "## A heading\n" +
                "> A clause quoted from the instrument\n" +
                "? A question the learner should be able to answer\n" +
                "Authority: Federal Law No. 5 of 1985, Art. 1 | what it says\n" +
                "Anything else is a paragraph."
              }
              onChange={(e) => setPaste(e.target.value)}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="lr-btn"
                data-primary="true"
                disabled={!paste.trim()}
                onClick={() => {
                  change([...blocks, ...textToBlocks(paste)]);
                  setPaste("");
                  setPasting(false);
                  void Promise.resolve().then(flush);
                }}
              >
                Add to the item
              </button>
              {blocks.length > 0 ? (
                // An introduction or a caveat belongs before what is already
                // written; moving each new block up one at a time is a chore.
                <button
                  type="button"
                  className="lr-btn"
                  disabled={!paste.trim()}
                  onClick={() => {
                    change([...textToBlocks(paste), ...blocks]);
                    setPaste("");
                    setPasting(false);
                    void Promise.resolve().then(flush);
                  }}
                >
                  Add at the top
                </button>
              ) : null}
              {blocks.length > 0 ? (
                <button type="button" className="lr-btn" onClick={() => setPasting(false)}>
                  Cancel
                </button>
              ) : (
                <button type="button" className="lr-btn" onClick={() => insert("paragraph")}>
                  Start with an empty paragraph
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div className="lr-upload" style={{ marginBottom: 12 }}>
          <button type="button" className="lr-btn" onClick={() => picker.current?.click()}>
            Add audio, video, image or PDF
          </button>
          <span>
            {uploading.length > 0
              ? `Adding ${uploading.join(", ")}…`
              : "Adds at the top. Or drop files onto a block to put them after it. Up to 25 MB each."}
          </span>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            aria-label="Add media files"
            accept="audio/*,video/*,image/*,application/pdf"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) void addFiles(files);
            }}
          />
          {uploadError ? (
            <span className="lr-badge" data-tone="late" role="alert">
              {uploadError}
            </span>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {blocks.map((block, i) => (
            <div
              key={block.id}
              className="lr-block"
              data-type={block.type}
              data-block-id={block.id}
            >
              <div className="lr-block-bar">
                {block.type === "media" ? (
                  <span className="lr-saved">{block.media?.kind ?? "file"}</span>
                ) : (
                  <select
                    aria-label="Block type"
                    value={block.type}
                    onChange={(e) => {
                      const type = e.target.value as BlockType;
                      patch(block.id, { type, ...starter(type, block) });
                    }}
                  >
                    {BLOCK_TYPES.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                )}
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  className="lr-btn"
                  title="Move up"
                  aria-disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="lr-btn"
                  title="Move down"
                  aria-disabled={i === blocks.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="lr-btn"
                  title="Insert a paragraph below"
                  onClick={() => insert("paragraph", i + 1)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="lr-btn"
                  title="Remove this block"
                  onClick={() => {
                    change(blocks.filter((b) => b.id !== block.id));
                    if (block.media) onRemoveMedia(block.media.path);
                  }}
                >
                  ✕
                </button>
              </div>
              <BlockFields
                block={block}
                onChange={(fields) => patch(block.id, fields)}
                onUpload={onUpload}
              />
            </div>
          ))}
        </div>

        <div className="lr-foot" style={{ flexWrap: "wrap" }}>
          {blocks.length > 0 ? (
            <>
              <button type="button" className="lr-btn" onClick={() => insert("paragraph")}>
                Add paragraph
              </button>
              <button type="button" className="lr-btn" onClick={() => insert("heading")}>
                Add heading
              </button>
              <button type="button" className="lr-btn" onClick={() => insert("authority")}>
                Add authority
              </button>
              <button type="button" className="lr-btn" onClick={() => insert("check")}>
                Add check
              </button>
              <button type="button" className="lr-btn" onClick={() => insert("quiz")}>
                Add practice question
              </button>
              <button type="button" className="lr-btn" onClick={() => insert("flashcards")}>
                Add flashcards
              </button>
              <button type="button" className="lr-btn" onClick={() => insert("table")}>
                Add table
              </button>
              <button type="button" className="lr-btn" onClick={() => setPasting(true)}>
                Paste text
              </button>
            </>
          ) : null}
          <span style={{ flex: 1 }} />
          {next ? (
            <button
              type="button"
              className="lr-btn"
              onClick={() => {
                void flush();
                onOpenItem(next.id);
              }}
            >
              Next · {next.number} {shortTitle(next.title)}
            </button>
          ) : null}
          <button
            type="button"
            className="lr-btn"
            onClick={() => {
              void flush();
              onOpenModule(item.moduleId);
            }}
          >
            Back to the module
          </button>
          <button type="button" className="lr-btn" data-danger="true" onClick={onDelete}>
            Delete item
          </button>
        </div>
      </div>
    </div>
  );
}

/** What a new block of a type starts with, keeping what can be kept. */
function starter(type: BlockType, from?: Block): Partial<Block> {
  switch (type) {
    case "authority":
    case "credit":
      return { cite: from?.cite ?? "" };
    case "quiz":
      return { options: from?.options ?? ["", ""], answers: from?.answers ?? [], explanation: "" };
    case "flashcards":
      return { cards: from?.cards ?? [] };
    case "table":
      return { rows: from?.rows ?? [] };
    default:
      return {};
  }
}

function shortTitle(title: string): string {
  const t = title || "Untitled item";
  return t.length > 34 ? `${t.slice(0, 33)}…` : t;
}
