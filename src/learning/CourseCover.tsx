/**
 * A cover: the photo on a course's or module's card and across the top of
 * its page. Optional everywhere.
 *
 * The stored path is turned into a short-lived signed link when shown, like
 * every other learning file. A course without a cover gets a quiet panel with
 * its initials rather than an empty grey box, so a shelf of mixed courses
 * still reads as one designed set.
 */
import { useEffect, useState } from "react";
import { removeMedia, useMediaUrl } from "./media";

const initials = (title: string) =>
  title
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(the|of|and|for|in|to|a|an)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "•";

export function CourseCover({
  path,
  title,
  credit,
  variant,
}: {
  path: string | null;
  title: string;
  credit?: string;
  variant: "tile" | "banner";
}) {
  const url = useMediaUrl(path);
  return (
    <div className={`lr-cover lr-cover-${variant}`} data-empty={path ? undefined : "true"}>
      {path && url.data ? (
        <img src={url.data} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="lr-cover-initials" aria-hidden="true">
          {path ? "" : initials(title)}
        </span>
      )}
      {variant === "banner" && credit ? <span className="lr-cover-credit">{credit}</span> : null}
    </div>
  );
}

/**
 * The "Cover image" control, the same for a course and a module: add,
 * replace or remove the photo, and its credit line. Saves as it goes.
 */
export function CoverField({
  path,
  credit,
  title,
  onUpload,
  onSave,
}: {
  path: string | null;
  credit: string;
  title: string;
  /** Store the file and return its path. */
  onUpload: (file: File) => Promise<string>;
  /** Write the fields given; resolves false if the save failed. */
  onSave: (patch: { coverPath?: string | null; coverCredit?: string }) => Promise<boolean>;
}) {
  const [line, setLine] = useState(credit);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setLine(credit), [credit]);

  return (
    <div className="lr-cover-edit">
      <CourseCover path={path} title={title} variant="tile" />
      <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
        <span className="lr-label">Cover image · optional</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label className="lr-btn" data-busy={busy ? "true" : undefined}>
            {busy ? "Uploading…" : path ? "Replace image" : "Add an image"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              disabled={busy}
              onChange={async (e) => {
                const picked = e.target.files?.[0];
                e.target.value = "";
                if (!picked) return;
                setBusy(true);
                setProblem(null);
                try {
                  const next = await onUpload(picked);
                  const ok = await onSave({ coverPath: next });
                  if (ok && path) await removeMedia([path]);
                } catch (cause) {
                  setProblem(
                    cause instanceof Error ? cause.message : "The image could not be added.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {path ? (
            <button
              type="button"
              className="lr-btn"
              onClick={async () => {
                const ok = await onSave({ coverPath: null, coverCredit: "" });
                if (ok) await removeMedia([path]);
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
        <input
          className="lr-input"
          value={line}
          placeholder="Credit, e.g. Photo: Jane Doe on Unsplash"
          onChange={(e) => setLine(e.target.value)}
          onBlur={() => {
            if (line.trim() !== credit) void onSave({ coverCredit: line.trim() });
          }}
        />
        <span className="lr-hint">
          A wide photo works best (at least 1600 pixels across). JPEG, PNG or WebP, up to 25 MB.
        </span>
        {problem ? (
          <span className="lr-hint" data-tone="late">
            {problem}
          </span>
        ) : null}
      </div>
    </div>
  );
}
