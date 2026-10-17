/**
 * The course as a route: every module in order, how long it takes, what it
 * holds, and how far the learner has got. It is the first thing to read after
 * the course team, because a long course is easier to start when you can see
 * the whole of it and where the checkpoints are.
 */
import type { CourseFile } from "../db";
import { readBlocks } from "../blocks";
import { formatDuration, type TimeCell } from "../estimate";
import { indexProgress, isComplete } from "../model";

export function Roadmap({
  file,
  times,
  onOpenModule,
}: {
  file: CourseFile;
  times: Map<string, TimeCell>;
  onOpenModule: (moduleId: string) => void;
}) {
  const index = indexProgress(file.progress);
  const modules = [...file.modules].sort((a, b) => a.position - b.position);

  return (
    <section className="lr-roadmap">
      <div className="lr-label">Course roadmap</div>
      <ol>
        {modules.map((m, i) => {
          const items = file.items.filter(
            (it) => it.moduleId === m.id && it.kind !== "folder" && it.visible,
          );
          const blocks = items.flatMap((it) => readBlocks(it.payload));
          // Media blocks only: a team member's logo is not an infographic.
          const has = (kind: string) =>
            blocks.some((b) => b.type === "media" && b.media?.kind === kind);
          const review = items.some((it) => /^review/i.test(it.title));
          const questions = blocks.filter((b) => b.type === "quiz").length;
          const finalTest = /final/i.test(m.title) && questions > 0;
          const done = items.length > 0 && items.every((it) => isComplete(index, it.id));
          const started = items.some((it) => isComplete(index, it.id));
          const t = times.get(m.id);
          return (
            <li key={m.id} data-state={done ? "done" : started ? "started" : undefined}>
              <button type="button" onClick={() => onOpenModule(m.id)}>
                <span className="lr-roadmap-dot">{done ? "✓" : i + 1}</span>
                <span className="lr-roadmap-body">
                  <b>{m.title || "Untitled module"}</b>
                  <span className="lr-roadmap-meta">
                    {t && t.total > 0 ? <span>about {formatDuration(t.total)}</span> : null}
                    <span>
                      {items.length} {items.length === 1 ? "item" : "items"}
                    </span>
                    {has("audio") ? <span className="lr-tag">audio lesson</span> : null}
                    {has("video") ? <span className="lr-tag">video</span> : null}
                    {has("image") ? <span className="lr-tag">visuals</span> : null}
                    {has("pdf") ? <span className="lr-tag">slides</span> : null}
                    {review ? (
                      <span className="lr-tag" data-tone="check">
                        review
                      </span>
                    ) : null}
                    {finalTest ? (
                      <span className="lr-tag" data-tone="check">
                        final test · {questions} questions
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
