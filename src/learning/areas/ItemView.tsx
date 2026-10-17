/**
 * 8d — what the learner actually spends their time in.
 *
 * One measured column of reading and nothing competing with it. Completion is
 * an explicit act: there is no scroll threshold and no timer anywhere in this
 * file, because a page being open is not evidence that anybody read it.
 *
 * Next moves to the following item in outline order — the same order the
 * module page numbers — so the sequence a learner walks is the sequence the
 * author wrote.
 */
import { useRef } from "react";
import { isFilledCredit, readBlocks } from "../blocks";
import { describeItem, estimateBlocks } from "../estimate";
import { RichBlock } from "./RichBlocks";
import { ReadAloud } from "./ReadAloud";
import { linkify } from "../linkify";
import type { CourseFile } from "../db";
import {
  indexProgress,
  isComplete,
  isReleased,
  itemAfter,
  numberCourse,
  type NumberedItem,
} from "../model";

export function ItemView({
  file,
  itemId,
  onOpenItem,
  onOpenModule,
  onSetComplete,
  saving,
}: {
  file: CourseFile;
  itemId: string;
  onOpenItem: (id: string) => void;
  onOpenModule: (id: string) => void;
  onSetComplete: (itemId: string, complete: boolean) => void;
  saving: boolean;
}) {
  const article = useRef<HTMLElement>(null);
  const index = indexProgress(file.progress);
  const numbered = numberCourse(file.modules, file.items);
  const item = numbered.find((i) => i.id === itemId);

  if (!item) {
    return (
      <div className="lr-page">
        <div className="lr-empty">That item is not in this course.</div>
      </div>
    );
  }

  const module = file.modules.find((m) => m.id === item.moduleId);
  const moduleItems = numbered.filter((i) => i.moduleId === item.moduleId);
  const next = itemAfter(moduleItems, item.id);
  const done = isComplete(index, item.id);

  if (!isReleased(item, index)) {
    return (
      <div className="lr-page">
        <div className="lr-read">
          <div className="lr-label">{item.number}</div>
          <h2>{item.title || "Untitled item"}</h2>
          <div className="lr-warn" style={{ marginTop: 12 }}>
            This releases once the items before it are complete. It is held back so the module is
            worked through in order, not to keep anything from you.
          </div>
          <div className="lr-foot">
            <button type="button" className="lr-btn" onClick={() => onOpenModule(item.moduleId)}>
              Back to the module
            </button>
          </div>
        </div>
      </div>
    );
  }

  const blocks = readBlocks(item.payload);

  return (
    <div className="lr-page">
      <article className="lr-read" ref={article}>
        <button type="button" className="lr-back" onClick={() => onOpenModule(item.moduleId)}>
          ← Back to {module?.title || "the module"}
        </button>
        <div className="lr-label">
          {module?.title ? `${module.title} · ` : ""}
          {item.number}
        </div>
        <h2>{item.title || "Untitled item"}</h2>
        {blocks.length > 0 ? (
          <div className="lr-next-time" style={{ marginTop: 4 }}>
            {describeItem(estimateBlocks(blocks))}
          </div>
        ) : null}
        <ReadAloud itemId={item.id} blocks={blocks} container={article} />

        {blocks.length === 0 ? (
          <div className="lr-empty" style={{ marginTop: 18 }}>
            Nothing has been written into this item yet.
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>
            {blocks.map((block) => {
              // Notes are guidance for authors; a learner never sees them.
              if (block.type === "note") return null;
              // An unfilled team card is a space for the author, not something to read.
              if (block.type === "credit" && !isFilledCredit(block)) return null;
              if (
                block.type === "media" ||
                block.type === "quiz" ||
                block.type === "flashcards" ||
                block.type === "table" ||
                block.type === "caveat" ||
                block.type === "credit"
              ) {
                return (
                  <div
                    key={block.id}
                    data-block={block.id}
                    className={block.type === "credit" ? "lr-credit-slot" : undefined}
                  >
                    <RichBlock block={block} />
                  </div>
                );
              }
              if (block.type === "heading") {
                return (
                  <h3
                    key={block.id}
                    data-block={block.id}
                    style={{ margin: "24px 0 8px", fontSize: 15, fontWeight: 600 }}
                  >
                    {linkify(block.text)}
                  </h3>
                );
              }
              if (block.type === "clause") {
                return (
                  <div key={block.id} data-block={block.id} className="lr-clause">
                    {linkify(block.text)}
                  </div>
                );
              }
              if (block.type === "authority") {
                return (
                  <p key={block.id} data-block={block.id} className="lr-authority">
                    <b>{block.cite ?? "Authority"}</b>
                    {block.text ? (
                      <>
                        {" · "}
                        {linkify(block.text)}
                      </>
                    ) : null}
                  </p>
                );
              }
              if (block.type === "check") {
                return (
                  <div key={block.id} data-block={block.id} className="lr-check">
                    <div className="lr-label" style={{ color: "var(--lr-action)" }}>
                      Check your understanding · never marked
                    </div>
                    <p style={{ margin: "6px 0 0" }}>{linkify(block.text)}</p>
                  </div>
                );
              }
              return (
                <p key={block.id} data-block={block.id}>
                  {linkify(block.text)}
                </p>
              );
            })}
          </div>
        )}

        <div className="lr-foot">
          <button
            type="button"
            className="lr-btn"
            data-primary="true"
            data-on={done ? "true" : undefined}
            disabled={saving}
            onClick={() => onSetComplete(item.id, !done)}
          >
            {done ? "Completed" : "Mark complete"}
          </button>
          {next ? (
            <button type="button" className="lr-btn" onClick={() => onOpenItem(next.id)}>
              Next · {next.number} {shorten(next)}
            </button>
          ) : (
            <button type="button" className="lr-btn" onClick={() => onOpenModule(item.moduleId)}>
              Back to the module
            </button>
          )}
          {done ? (
            <span style={{ fontSize: 11.5, color: "#6f6f6f" }}>
              Marked by you, not by how long this was open.
            </span>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function shorten(item: NumberedItem): string {
  const title = item.title || "Untitled item";
  return title.length > 34 ? `${title.slice(0, 33)}…` : title;
}
