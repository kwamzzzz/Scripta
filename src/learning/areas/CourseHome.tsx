/**
 * 8a — course home.
 *
 * It opens on a single Continue card, because the common case is resuming one
 * item rather than choosing from a shelf. Continue resolves to the furthest
 * incomplete item in reading order, not to the last URL visited, so it stays
 * right when the author reorders the module underneath the learner.
 *
 * Every figure here is derived from progress on the way past. Nothing is
 * cached, and nothing counts time on a page.
 */
import { useEffect, useState } from "react";
import EditableName from "@/components/EditableName";
import { InlineAdd } from "../authoring";
import type { CourseFile } from "../db";
import { type Block, type Media } from "../blocks";
import { CreditCard } from "./RichBlocks";
import { Roadmap } from "./Roadmap";
import { TeamBand } from "./TeamBand";
import { CourseCover, CoverField } from "../CourseCover";
import { courseTimes, describeItem, fitsOneSitting, formatDuration, sittings } from "../estimate";
import {
  indexProgress,
  moduleWarnings,
  nextIncomplete,
  numberCourse,
  numberItems,
  standing,
  streakDays,
  type CourseVisibility,
} from "../model";

export type CoursePatch = {
  title?: string;
  subtitle?: string;
  visibility?: CourseVisibility;
  cpdHours?: number;
  endsOn?: string | null;
  published?: boolean;
  coverPath?: string | null;
  coverCredit?: string;
};

export function CourseHome({
  file,
  authoring,
  onOpenModule,
  onOpenItem,
  onAddModule,
  onMoveModule,
  onUpdate,
  onArchive,
  onDelete,
  onSaveTeam,
  onUploadTeam,
  onUploadCover,
}: {
  file: CourseFile;
  authoring: boolean;
  onOpenModule: (moduleId: string) => void;
  onOpenItem: (itemId: string) => void;
  /** Resolves once the module exists, so the name field can clear for the next. */
  onAddModule: (title: string) => Promise<unknown>;
  onMoveModule: (moduleId: string, by: -1 | 1) => void;
  onUpdate: (patch: CoursePatch) => Promise<boolean>;
  onArchive: () => void;
  onDelete: () => void;
  onSaveTeam: (itemId: string, blocks: Block[]) => Promise<void>;
  onUploadTeam: (file: File, itemId: string) => Promise<Media>;
  /** Store a cover image and return its path; the caller saves it on the course. */
  onUploadCover: (file: File) => Promise<string>;
}) {
  const [adding, setAdding] = useState(false);
  const { course, modules, items, progress } = file;
  const index = indexProgress(progress);
  const numbered = numberCourse(modules, items);
  const overall = standing(items, index);
  const next = nextIncomplete(numbered, index);
  const streak = streakDays(progress);

  const moduleOf = new Map(modules.map((m) => [m.id, m]));
  const anyCover = modules.some((m) => m.coverPath);
  const nextModule = next ? moduleOf.get(next.moduleId) : null;
  const times = courseTimes(modules, items, index);
  const moduleTotals = modules
    .map((m) => times.byModule.get(m.id)?.total ?? 0)
    .filter((t) => t > 0);
  // Sittings for what is left, so the plan shrinks as the learner gets through it.
  const plan = sittings(
    modules.map((m) => times.byModule.get(m.id)?.left ?? 0).filter((t) => t > 0),
  );
  const weeks = Math.max(1, Math.ceil(plan / 3));
  const nextEstimate = next ? times.byItem.get(next.id) : undefined;
  const nextTime = nextEstimate ? describeItem(nextEstimate) : "";

  return (
    <div className="lr-page" style={{ display: "grid", gap: 20 }}>
      {course.coverPath ? (
        <CourseCover
          path={course.coverPath}
          title={course.title}
          credit={course.coverCredit}
          variant="banner"
        />
      ) : null}
      <div>
        <h1 className="lr-h1">
          {authoring ? (
            <EditableName
              label="course"
              value={course.title || "Untitled course"}
              onSave={(title) => onUpdate({ title })}
            />
          ) : (
            course.title || "Untitled course"
          )}
        </h1>
        <p className="lr-sub">
          {course.visibility === "self" ? "Your own reading" : "Assigned training"} ·{" "}
          {modules.length} {modules.length === 1 ? "module" : "modules"} · {overall.done} of{" "}
          {overall.total} {overall.total === 1 ? "item" : "items"}
          {times.course.total > 0 ? ` · about ${formatDuration(times.course.total)} in all` : ""}
          {course.cpdHours > 0 ? ` · ${course.cpdHours} CPD hours` : ""}
          {streak > 0 ? ` · ${streak}-day streak` : ""}
        </p>
        {course.subtitle && !authoring ? <p className="lr-lede">{course.subtitle}</p> : null}
      </div>

      {/* Who made it: the course's team blocks, editable here in authoring mode. */}
      <TeamBand
        file={file}
        authoring={authoring}
        onSaveBlocks={onSaveTeam}
        onUpload={onUploadTeam}
      />

      {authoring ? (
        <CourseDetails
          file={file}
          onUpdate={onUpdate}
          onArchive={onArchive}
          onDelete={onDelete}
          onUploadCover={onUploadCover}
        />
      ) : null}

      {modules.length > 1 ? (
        <Roadmap file={file} times={times.byModule} onOpenModule={onOpenModule} />
      ) : null}

      {/* How big this is, in terms a person plans a week with. */}
      {times.course.total > 0 && overall.done < overall.total ? (
        <div className="lr-plan">
          <div>
            <b>{formatDuration(times.course.left)}</b>
            <span>
              {overall.done === 0 ? "to finish the whole course" : "left to finish"}, at study pace,
              with time to take notes and let it sink in
            </span>
          </div>
          <div>
            <b>
              {plan} {plan === 1 ? "sitting" : "sittings"}
            </b>
            <span>of about half an hour, taking the modules in order</span>
          </div>
          <div>
            <b>
              {weeks} {weeks === 1 ? "week" : "weeks"}
            </b>
            <span>at three half-hour sittings a week, if you want a steady pace</span>
          </div>
        </div>
      ) : null}

      {/* The one card the page opens on. */}
      {next && nextModule ? (
        <div className="lr-card lr-continue">
          <div className="lr-label">Continue</div>
          <div style={{ marginTop: 6, fontSize: 15, fontWeight: 600 }}>
            {next.number} · {next.title || "Untitled item"}
          </div>
          {nextTime ? <div className="lr-next-time">Next up · {nextTime}</div> : null}
          <div style={{ marginTop: 2, fontSize: 12.5, color: "#5f5f5f" }}>
            {nextModule.title || "Untitled module"}
            {nextModule.week ? ` · week ${nextModule.week}` : ""}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              className="lr-btn"
              data-primary="true"
              onClick={() => onOpenItem(next.id)}
            >
              Continue reading
            </button>
            <button type="button" className="lr-btn" onClick={() => onOpenModule(next.moduleId)}>
              Open the module
            </button>
          </div>
        </div>
      ) : overall.total > 0 ? (
        <div
          className="lr-card"
          style={{ borderColor: "var(--lr-good-border)", background: "var(--lr-good-tint)" }}
        >
          <div className="lr-label">Finished</div>
          <div style={{ marginTop: 6, fontSize: 15, fontWeight: 600 }}>
            Every item in this course is complete.
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div className="lr-label">Course content</div>
          {authoring && !adding && modules.length > 0 ? (
            <button type="button" className="lr-btn" onClick={() => setAdding(true)}>
              Add module
            </button>
          ) : null}
        </div>

        {authoring && (adding || modules.length === 0) ? (
          <InlineAdd
            label="Module title"
            placeholder={
              modules.length === 0
                ? "Name the first module, e.g. Foundations of the federation"
                : "Name the next module"
            }
            onAdd={(title) => {
              // Stay open for the next one, even when it opened because the
              // course was empty and no longer is.
              setAdding(true);
              return onAddModule(title);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : null}

        {modules.length === 0 ? (
          <div className="lr-empty">
            {authoring
              ? "No modules yet. A module is an outline and the content that answers it."
              : "This course has no modules yet."}
          </div>
        ) : (
          <div className="lr-grid">
            {modules.map((module, moduleIndex) => {
              const own = items.filter((i) => i.moduleId === module.id);
              const cell = standing(own, index);
              const warnings = authoring ? moduleWarnings(module, numberItems(own)) : [];
              const unpublished = authoring && !module.publishedAt;
              return (
                <button
                  key={module.id}
                  type="button"
                  className="lr-card lr-tile"
                  style={{ textAlign: "left", cursor: "pointer" }}
                  onClick={() => onOpenModule(module.id)}
                >
                  {/* Covers are optional: shown once any module has one, so a
                      course that uses none looks as it always did. */}
                  {anyCover ? (
                    <CourseCover path={module.coverPath} title={module.title} variant="tile" />
                  ) : null}
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span className="lr-label">
                      {module.week ? `Week ${module.week}` : `Module ${moduleIndex + 1}`}
                    </span>
                    {cell.total > 0 && cell.done === cell.total ? (
                      <span className="lr-badge" data-tone="done">
                        done
                      </span>
                    ) : null}
                    {unpublished ? (
                      <span className="lr-badge" data-tone="self">
                        draft
                      </span>
                    ) : null}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600 }}>
                    {module.title || "Untitled module"}
                  </div>
                  <div style={{ marginTop: 8 }} className="lr-bar">
                    <i style={{ width: `${cell.percent}%` }} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11.5, color: "#6f6f6f" }}>
                    {cell.done} of {cell.total} {cell.total === 1 ? "item" : "items"}
                    {(() => {
                      const t = times.byModule.get(module.id);
                      if (!t || t.total === 0) return "";
                      if (t.left === 0) return " · done";
                      return t.left < t.total
                        ? ` · ${formatDuration(t.left)} left`
                        : ` · about ${formatDuration(t.total)}`;
                    })()}
                    {module.cpdHours > 0 ? ` · ${module.cpdHours} CPD hrs` : ""}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                    {cell.done < cell.total &&
                    fitsOneSitting(times.byModule.get(module.id)?.total ?? 0) ? (
                      <span className="lr-badge" data-tone="done">
                        one sitting
                      </span>
                    ) : null}
                    {warnings.some((w) => w.kind === "no-outline") ? (
                      <span className="lr-badge" data-tone="soon">
                        needs an outline
                      </span>
                    ) : null}
                    {authoring ? (
                      <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                        <span
                          role="button"
                          tabIndex={0}
                          className="lr-btn"
                          title="Move earlier"
                          aria-disabled={moduleIndex === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (moduleIndex > 0) onMoveModule(module.id, -1);
                          }}
                        >
                          ↑
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          className="lr-btn"
                          title="Move later"
                          aria-disabled={moduleIndex === modules.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (moduleIndex < modules.length - 1) onMoveModule(module.id, 1);
                          }}
                        >
                          ↓
                        </span>
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * What a course says about itself, edited where it is read. Each field saves
 * when you leave it; there is no Save button to forget.
 */
function CourseDetails({
  file,
  onUpdate,
  onArchive,
  onDelete,
  onUploadCover,
}: {
  file: CourseFile;
  onUpdate: (patch: CoursePatch) => Promise<boolean>;
  onArchive: () => void;
  onDelete: () => void;
  onUploadCover: (file: File) => Promise<string>;
}) {
  const { course } = file;
  const [subtitle, setSubtitle] = useState(course.subtitle);
  const [hours, setHours] = useState(String(course.cpdHours || ""));
  const [endsOn, setEndsOn] = useState(course.endsOn ?? "");

  useEffect(() => setSubtitle(course.subtitle), [course.subtitle]);
  useEffect(() => setHours(String(course.cpdHours || "")), [course.cpdHours]);
  useEffect(() => setEndsOn(course.endsOn ?? ""), [course.endsOn]);

  const firm = course.visibility === "assigned";

  return (
    <section className="lr-card" style={{ display: "grid", gap: 12 }}>
      <div className="lr-label">
        Course details · saved as you go · {course.publishedAt ? "published" : "draft"}
      </div>
      {/* The cover: the photo on the course's tile and across its top. */}
      <CoverField
        path={course.coverPath}
        credit={course.coverCredit}
        title={course.title}
        onUpload={onUploadCover}
        onSave={onUpdate}
      />
      <label style={{ display: "grid", gap: 4 }}>
        <span className="lr-label">What it covers</span>
        <textarea
          className="lr-textarea"
          rows={3}
          value={subtitle}
          placeholder="One or two sentences a learner reads before starting."
          onChange={(e) => setSubtitle(e.target.value)}
          onBlur={() => {
            if (subtitle.trim() !== course.subtitle) void onUpdate({ subtitle: subtitle.trim() });
          }}
        />
      </label>
      <div className="lr-details">
        <label>
          <span className="lr-label">Who it is for</span>
          <select
            className="lr-input"
            value={course.visibility}
            onChange={(e) => void onUpdate({ visibility: e.target.value as CourseVisibility })}
          >
            <option value="self">My own reading (private, no CPD)</option>
            <option value="assigned">Firm training (workspace, CPD)</option>
          </select>
        </label>
        {firm ? (
          <>
            <label>
              <span className="lr-label">CPD hours on completion</span>
              <input
                className="lr-input"
                inputMode="decimal"
                value={hours}
                placeholder="0"
                onChange={(e) => setHours(e.target.value)}
                onBlur={() => {
                  const n = Number(hours || 0);
                  if (Number.isFinite(n) && n >= 0 && n !== course.cpdHours) {
                    void onUpdate({ cpdHours: n });
                  }
                }}
              />
            </label>
            <label>
              <span className="lr-label">Complete by</span>
              <input
                className="lr-input"
                type="date"
                value={endsOn}
                onChange={(e) => {
                  setEndsOn(e.target.value);
                  void onUpdate({ endsOn: e.target.value || null });
                }}
              />
            </label>
          </>
        ) : null}
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {/* A course goes out once something in it can be read. */}
          <button
            type="button"
            className="lr-btn"
            data-primary={!course.publishedAt ? "true" : undefined}
            disabled={!course.publishedAt && !file.modules.some((m) => m.publishedAt)}
            title={
              !course.publishedAt && !file.modules.some((m) => m.publishedAt)
                ? "Publish a module first"
                : undefined
            }
            onClick={() => void onUpdate({ published: !course.publishedAt })}
          >
            {course.publishedAt ? "Unpublish" : "Publish course"}
          </button>
          <button type="button" className="lr-btn" onClick={onArchive}>
            Archive
          </button>
          <button type="button" className="lr-btn" data-danger="true" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </section>
  );
}
