/**
 * Repository: documents attached to each deliverable in the phase as
 * first-page thumbnails, grouped under a labelled divider per deliverable and
 * reflowed to however much width the detail panel has left them. Empty tiles
 * are drop zones that write a new version to that deliverable — never a loose
 * file. Selecting a tile opens the detail panel, where the versions are a rail
 * that switches the whole panel and a history of who attached what when.
 */
import Thread from "@/components/Thread";
import ResizableSplitPane from "@/components/ResizableSplitPane";
import { useApp } from "@/store/app";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Check, Download, Eye, Plus, Upload } from "lucide-react";
import { Button } from "@/components/primitives";
import {
  deliverableMatches,
  type DerivedDeliverable,
  type DerivedPhase,
  type Version,
} from "./model";
import { editorTarget, type EditorTarget } from "./editor-routes";
import { renderThumbnail, useVersionThumbnail, type Thumb } from "@/lib/thumbnails";
import { downloadFile } from "@/lib/files";
import { EvidenceCards } from "./EvidenceRail";
import { Eyebrow, FLOW, LinkAction, Segmented, TintChip, fmtDay } from "./ui";
import { VERSION_TAGS, VERSION_TAG_LABEL, VERSION_TAG_SHORT, type VersionTag } from "./model";
import { keepSource } from "./keep-version";
import FileViewer from "@/preview/FileViewer";
import { kindFromName } from "@/preview/kinds";
import { KIND_LOOK, type DocKind } from "@/preview/model";

/**
 * The states worth filtering to, all of them on the screen at once.
 *
 * These used to be one chip that cycled: every option was reachable and none
 * of them was visible, so finding "not yet attached" meant pressing a button
 * four times and reading what it said each time. A lawyer should not have to
 * play a guessing game to find out what a filter can do. `label` is the word
 * on the chip; `hint` is the sentence it means, on the tooltip.
 */
type StateFilter = "all" | "final" | "draft" | "overdue" | "empty" | "replied";
const STATE_FILTERS: { id: StateFilter; label: string; hint: string }[] = [
  { id: "all", label: "All", hint: "Every deliverable in this phase" },
  { id: "final", label: "Final", hint: "Only the versions marked final" },
  { id: "draft", label: "Drafts", hint: "Only versions not yet marked final" },
  { id: "overdue", label: "Overdue", hint: "Only deliverables past their deadline" },
  { id: "empty", label: "Not attached", hint: "Deliverables with nothing attached yet" },
  { id: "replied", label: "With replies", hint: "Deliverables that have correspondence logged" },
];

export type AttachInput = {
  deliverableId: string;
  file: File;
};

export default function DeliverableRepository({
  phase,
  matterId,
  focusId,
  selectedVersionId,
  onSelectVersion,
  onAttach,
  onSetFinal,
  onSetTag,
  onKeepVersion,
  onOpenEditor,
  onAddEvidence,
  onOpenEmail,
  viewControl,
}: {
  phase: DerivedPhase;
  matterId: string | null;
  /** Deliverable the checklist handed over ("Attach / Open"): shown first and highlighted. */
  focusId?: string | null;
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string | null) => void;
  onAttach: (input: AttachInput, thumbnail: Thumb | null) => void;
  onSetFinal: (versionId: string, isFinal: boolean) => void;
  /** What kind of document this version is, in the firm's own vocabulary. */
  onSetTag: (versionId: string, tag: VersionTag) => void;
  /** Keep this version's drafting as a precedent. */
  onKeepVersion: (deliverable: DerivedDeliverable, version: Version) => void;
  onOpenEditor: (target: EditorTarget) => void;
  /** Actions in a document matter keep their evidence here instead of document tiles. */
  onAddEvidence: (deliverable: DerivedDeliverable) => void;
  /** Opens an email deliverable's draft and the replies logged against it. */
  onOpenEmail: (deliverable: DerivedDeliverable) => void;
  viewControl: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [latestOnly, setLatestOnly] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ordered = focusId
      ? [
          ...phase.deliverables.filter((d) => d.id === focusId),
          ...phase.deliverables.filter((d) => d.id !== focusId),
        ]
      : phase.deliverables;
    return ordered
      .map((d) => {
        /* Newest first when the whole history is shown: the version a reader
           wants is almost always the current one, and a row that ends with it
           makes them count along to find it. */
        let versions =
          latestOnly && d.versions.length > 0 ? [d.versions.at(-1)!] : [...d.versions].reverse();
        if (latestOnly && d.finalVersion && !versions.includes(d.finalVersion))
          versions = [d.finalVersion];
        if (stateFilter === "final") versions = versions.filter((v) => v.isFinal);
        if (stateFilter === "draft") versions = versions.filter((v) => !v.isFinal);
        if (q)
          versions = versions.filter((v) =>
            `${d.name} ${v.label} ${v.note ?? ""}`.toLowerCase().includes(q),
          );
        // A keyword reaches the deliverable's correspondence too: the draft it
        // carries and the replies logged against it, so a phrase remembered
        // from an email finds the deliverable it belongs to.
        const matchesGroup =
          (!q || deliverableMatches(d, query) || versions.length > 0) &&
          (stateFilter !== "overdue" || d.state === "overdue") &&
          (stateFilter !== "empty" || d.versions.length === 0) &&
          (stateFilter !== "replied" || d.threads.length > 0);
        return { deliverable: d, versions, show: matchesGroup };
      })
      .filter((g) => g.show);
  }, [phase, focusId, query, stateFilter, latestOnly]);

  const total = groups.reduce(
    (n, g) =>
      n + (g.deliverable.kind === "action" ? g.deliverable.evidence.length : g.versions.length),
    0,
  );
  const selected = useMemo(() => {
    for (const d of phase.deliverables)
      for (const v of d.versions)
        if (v.id === selectedVersionId) return { deliverable: d, version: v };
    return null;
  }, [phase, selectedVersionId]);

  const preview = useMemo(() => {
    for (const d of phase.deliverables)
      for (const v of d.versions) if (v.id === previewId) return { deliverable: d, version: v };
    return null;
  }, [phase, previewId]);
  const previewTarget = preview ? editorTarget(preview.deliverable, matterId) : null;

  const attach = async (deliverableId: string, file: File) => {
    const thumb = await renderThumbnail(await file.arrayBuffer(), file.name);
    onAttach({ deliverableId, file }, thumb);
  };

  return (
    <>
      <ResizableSplitPane
        className="mf-repo"
        /* A 320px column was the whole of a deck's first page on a 27" monitor.
         The same divider the Library panes use, remembered per person. */
        storageKey="px.flow.repository.detail.width"
        defaultSize={400}
        minSize={320}
        maxSize={680}
        minPrimarySize={520}
        compactAt={860}
        label="Resize document details"
        primary={
          <div className="mf-repo-main">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, lineHeight: 1.3 }}>
                  {phase.name}
                </h1>
                <div style={{ color: FLOW.muted, fontSize: 12, marginTop: 2 }}>
                  Repository · every document attached to a deliverable in this phase
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <input
                className="mf-search"
                placeholder="Search this phase…"
                aria-label="Search this phase"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {viewControl}
            </div>
            <div className="mf-filters">
              {/* One of these at a time, all of them in sight. Pressing the one
                  already on puts the filter back to everything, so a filter
                  can be taken off where it was put on. */}
              <div className="mf-filter-set" role="group" aria-label="Filter by state">
                {STATE_FILTERS.map((f) => {
                  const on = stateFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={`mf-filter-chip${on ? " is-on" : ""}`}
                      aria-pressed={on}
                      title={f.hint}
                      onClick={() => setStateFilter(on ? "all" : f.id)}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
              <span className="mf-filter-rule" aria-hidden />
              {/* Which versions are on the wall. Two named states rather than
                  one ticked chip: "✓ Latest version only" says what you are
                  looking at and nothing about what the other setting gives
                  you, so the way to see a document's history was to press a
                  tick and hope. */}
              <div className="mf-filter-set" role="group" aria-label="Which versions to show">
                {(
                  [
                    ["latest", "Latest only", "The current version of each deliverable"],
                    ["all", "All versions", "Every version, newest first, superseded ones behind"],
                  ] as const
                ).map(([id, label, hint]) => (
                  <button
                    key={id}
                    type="button"
                    className={`mf-filter-chip${(id === "latest") === latestOnly ? " is-on" : ""}`}
                    aria-pressed={(id === "latest") === latestOnly}
                    title={hint}
                    onClick={() => setLatestOnly(id === "latest")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              <Eyebrow color="#6b6b6b">
                {total} ITEM{total === 1 ? "" : "S"}
              </Eyebrow>
            </div>
            {groups.length === 0 && (
              <div style={{ color: FLOW.muted, fontSize: 12.5 }}>
                Nothing in this phase matches.
              </div>
            )}
            {groups.map(({ deliverable: d, versions }, i) => (
              <DropZone
                key={d.id}
                // Once a version is attached the big drop tile goes; a file dropped
                // anywhere on the deliverable still attaches, and "Attach version"
                // does the same from the button.
                enabled={d.kind !== "action" && d.versions.length > 0}
                onFile={(file) => void attach(d.id, file)}
                id={`deliverable-${d.id}`}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Eyebrow
                    color={d.id === focusId ? FLOW.orange : FLOW.muted}
                    style={{ whiteSpace: "normal" }}
                  >
                    DELIVERABLE {i + 1} · {d.name}
                  </Eyebrow>
                  <div style={{ flex: 1, height: 1, background: FLOW.line }} />
                  {d.threads.length > 0 && (
                    <LinkAction
                      onClick={() => onOpenEmail(d)}
                      title="Open the draft and the replies logged against it"
                    >
                      {d.threads.length} {d.threads.length === 1 ? "reply" : "replies"}
                    </LinkAction>
                  )}
                  {d.kind === "action" ? (
                    <LinkAction onClick={() => onAddEvidence(d)}>Add evidence</LinkAction>
                  ) : (
                    <AttachLink onFile={(file) => void attach(d.id, file)} />
                  )}
                </div>
                {d.kind === "action" ? (
                  <EvidenceCards evidence={d.evidence} />
                ) : (
                  <div className="mf-grid">
                    {versions.slice(0, latestOnly ? versions.length : 1).map((v) => (
                      <Tile
                        key={v.id}
                        deliverable={d}
                        version={v}
                        selected={v.id === selectedVersionId}
                        onSelect={() => onSelectVersion(v.id === selectedVersionId ? null : v.id)}
                        onPreview={() => {
                          onSelectVersion(v.id);
                          setPreviewId(v.id);
                        }}
                      />
                    ))}
                    {/* The line between what this deliverable IS and what it
                        used to be. Without it a wall of tiles says nothing
                        about which one is current. */}
                    {!latestOnly && versions.length > 1 && (
                      <div className="mf-superseded-rule">
                        <span>
                          {versions.length - 1} earlier{" "}
                          {versions.length - 1 === 1 ? "version" : "versions"}
                        </span>
                      </div>
                    )}
                    {!latestOnly &&
                      versions.slice(1).map((v) => (
                        <Tile
                          key={v.id}
                          deliverable={d}
                          version={v}
                          selected={v.id === selectedVersionId}
                          onSelect={() => onSelectVersion(v.id === selectedVersionId ? null : v.id)}
                          onPreview={() => {
                            onSelectVersion(v.id);
                            setPreviewId(v.id);
                          }}
                        />
                      ))}
                    {d.versions.length === 0 && (
                      <DropTile
                        title={d.name}
                        meta={`due ${fmtDay(d.deadline)} · owner ${d.owner}`}
                        state={d.state === "overdue" ? "overdue" : "empty"}
                        onFile={(file) => void attach(d.id, file)}
                      />
                    )}
                    {(d.expected ?? []).map((name) => (
                      <DropTile
                        key={name}
                        title={name}
                        meta="annex · not started"
                        state="empty"
                        onFile={(file) => void attach(d.id, file)}
                      />
                    ))}
                  </div>
                )}
              </DropZone>
            ))}
          </div>
        }
        secondary={
          selected && (
            <DetailPanel
              deliverable={selected.deliverable}
              version={selected.version}
              target={editorTarget(selected.deliverable, matterId)}
              onSelectVersion={onSelectVersion}
              onAttachFile={(file) => void attach(selected.deliverable.id, file)}
              onSetFinal={onSetFinal}
              onSetTag={onSetTag}
              onKeepVersion={onKeepVersion}
              onOpenEditor={onOpenEditor}
              onPreview={() => setPreviewId(selected.version.id)}
              onClose={() => onSelectVersion(null)}
            />
          )
        }
      />
      {preview && (
        <FileViewer
          open
          fileRef={preview.version.fileRef}
          name={preview.version.note ?? preview.deliverable.name}
          meta={[
            preview.version.label,
            preview.version.isFinal ? "final" : "draft",
            fmtDay(preview.version.createdAt),
            preview.version.by,
          ]
            .filter(Boolean)
            .join(" · ")}
          downloadName={`${preview.deliverable.name} ${preview.version.label}`}
          {...(previewTarget
            ? { editorLabel: previewTarget.label, onOpenEditor: () => onOpenEditor(previewTarget) }
            : {})}
          onClose={() => setPreviewId(null)}
        />
      )}
    </>
  );
}

/** A deliverable that takes a dropped file without showing a drop tile for it. */
function DropZone({
  enabled,
  onFile,
  id,
  children,
}: {
  enabled: boolean;
  onFile: (file: File) => void;
  id: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      id={id}
      className={`mf-drop-zone${over ? " is-over" : ""}`}
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
      {...(enabled
        ? {
            onDragOver: (e: DragEvent) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              setOver(true);
            },
            onDragLeave: (e: DragEvent) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
            },
            onDrop: (e: DragEvent) => {
              e.preventDefault();
              setOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) onFile(file);
            },
          }
        : {})}
    >
      {children}
    </div>
  );
}

function AttachLink({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <LinkAction onClick={() => input.current?.click()}>Attach version</LinkAction>
      <input
        ref={input}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** "7 slides", "4 sheets", "12 pages" — what this kind of file is counted in. */
function countOf(kind: DocKind, count: number) {
  const noun = kind === "slides" ? "slide" : kind === "sheet" ? "sheet" : "page";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function versionChip(d: DerivedDeliverable, v: Version) {
  if (v.isFinal) return <TintChip tint="green">Final</TintChip>;
  if (d.state === "overdue") return <TintChip tint="red">Overdue</TintChip>;
  const tag = v.tag ? VERSION_TAG_LABEL[v.tag] : null;
  return (
    <TintChip tint={v.tag === "execution" || v.tag === "signed" ? "green" : "amber"}>
      {tag ? `${v.label} · ${tag.toLowerCase()}` : v.label}
    </TintChip>
  );
}

function Tile({
  deliverable,
  version,
  selected,
  onSelect,
  onPreview,
}: {
  deliverable: DerivedDeliverable;
  version: Version;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
}) {
  const thumb = useVersionThumbnail(version);
  const kind = kindFromName(version.fileRef ?? "");
  const look = KIND_LOOK[kind];
  const meta = [
    version.pages ? countOf(kind, version.pages) : null,
    version.label,
    version.isFinal ? "final" : version.tag ? VERSION_TAG_LABEL[version.tag].toLowerCase() : null,
    fmtDay(version.createdAt),
    version.by,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={`mf-tile${selected ? " is-selected" : ""}`}>
      <button
        type="button"
        className="mf-tile-main"
        aria-pressed={selected}
        onClick={onSelect}
        onDoubleClick={onPreview}
      >
        <div className="mf-tile-head">
          <div className="mf-tile-name">{version.note ?? deliverable.name}</div>
          {versionChip(deliverable, version)}
        </div>
        <div className="mf-tile-meta">
          {kind !== "unknown" && (
            <span className="mf-kind" style={{ background: look.tint, color: look.ink }}>
              {look.short}
            </span>
          )}
          {meta}
        </div>
        <Page src={thumb.src} loading={thumb.status === "loading"} />
      </button>
      {version.fileRef && (
        <button type="button" className="mf-tile-open" onClick={onPreview}>
          <Eye size={13} aria-hidden /> Preview
        </button>
      )}
    </div>
  );
}

/** A page at 1:1.3 — the real first page when we have it, otherwise the drawn placeholder. */
export function Page({
  src,
  loading,
  large,
}: {
  src: string | null;
  loading?: boolean;
  large?: boolean;
}) {
  // The tile takes the shape of what it is showing: a page is tall, a slide is
  // wide. Until the picture has loaded, a page is the safe assumption.
  const [ratio, setRatio] = useState<number | null>(null);
  return (
    <div
      className="mf-page"
      style={{
        ...(large ? { padding: "18px 16px", gap: 7 } : null),
        ...(ratio ? { aspectRatio: ratio } : null),
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) =>
            setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || null)
          }
        />
      ) : (
        <>
          <div className="mf-page-title" />
          {[92, 88, 95, 0, 90, 86, 0, 93, 80, 84, 0, 90].map((w, i) => (
            <div
              key={i}
              className="mf-page-line"
              style={{ width: `${w || 70}%`, background: w ? undefined : "transparent" }}
            />
          ))}
          {loading && (
            <span
              role="status"
              style={{ position: "absolute", left: 8, bottom: 6, fontSize: 9.5, color: FLOW.muted }}
            >
              Rendering…
            </span>
          )}
        </>
      )}
    </div>
  );
}

function DropTile({
  title,
  meta,
  state,
  onFile,
}: {
  title: string;
  meta: string;
  state: "empty" | "overdue" | "quiet";
  onFile: (file: File) => void;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 }}>{title}</div>
          <div style={{ color: FLOW.muted, fontSize: 11, marginTop: 2 }}>{meta}</div>
        </div>
        {state === "overdue" ? (
          <TintChip tint="red">Overdue</TintChip>
        ) : state === "empty" ? (
          <TintChip tint="grey">Not yet attached</TintChip>
        ) : null}
      </div>
      <button
        type="button"
        className={`mf-drop${over ? " is-over" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        aria-label={`Attach a document to ${title}`}
      >
        <Upload size={20} strokeWidth={1.7} />
        <span>
          Drop the document here
          <br />
          or attach from drafts
        </span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * What a version says about itself.
 *
 * The tag the lawyer put on it, or Final where one has been marked and no tag
 * set. Scripta no longer calls anything "superseded": which version came after
 * which is plain from the numbers and the dates, and what the document IS is a
 * matter of law office practice, not of arithmetic on timestamps.
 */
function versionState(v: Version) {
  if (v.tag)
    return {
      label: VERSION_TAG_SHORT[v.tag],
      tint: v.tag === "execution" || v.tag === "signed" ? ("green" as const) : ("grey" as const),
    };
  if (v.isFinal) return { label: "Final", tint: "green" as const };
  return { label: "", tint: "grey" as const };
}

/**
 * The versions, as the first thing in the panel and the one thing always
 * clickable.
 *
 * A document here is never one file: it is the latest of several, and the
 * questions asked of it — which version is this, what came before it, is this
 * the one that goes out — are questions about the set. Switching used to mean
 * leaving the panel and finding another tile in the grid, which is also where
 * the superseded versions are hidden whenever "latest only" is on. So the set
 * lives here, and moving through it changes the picture, the facts and the
 * actions in place.
 */
function VersionRail({
  deliverable,
  version,
  onSelect,
  onFile,
}: {
  deliverable: DerivedDeliverable;
  version: Version;
  onSelect: (versionId: string) => void;
  onFile: (file: File) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // Keyboard selection has to take the focus with it, and the selection is
  // made upstream — it travels through the URL — so which chip is selected is
  // not known until the render after the key. The intent is recorded here and
  // spent when that render arrives; a click, which brings its own focus, never
  // sets it.
  const follow = useRef(false);

  useEffect(() => {
    if (!follow.current) return;
    follow.current = false;
    rail.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
  }, [version.id]);

  // Arrow keys walk the versions, the way a tab strip does. The selected chip
  // is the only one in the tab order, so the rail is one stop rather than one
  // per version.
  const step = (dir: 1 | -1) => {
    const list = deliverable.versions;
    const at = list.findIndex((v) => v.id === version.id);
    const next = list[Math.min(list.length - 1, Math.max(0, at + dir))];
    if (!next || next.id === version.id) return;
    follow.current = true;
    onSelect(next.id);
  };

  return (
    <div
      ref={rail}
      className="mf-vrail"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") step(1);
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") step(-1);
        else return;
        e.preventDefault();
      }}
    >
      <div role="tablist" aria-label="Versions" className="mf-vrail-tabs">
        {deliverable.versions.map((v) => {
          const state = versionState(v);
          const on = v.id === version.id;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              className={`mf-vchip is-${state.tint}${on ? " is-on" : ""}`}
              onClick={() => onSelect(v.id)}
              title={`${v.label} · ${state.label.toLowerCase()} · ${fmtDay(v.createdAt)}${
                v.by ? ` · ${v.by}` : ""
              }`}
            >
              <span className="mf-vchip-label">{v.label}</span>
              <span className="mf-vchip-state">{state.label}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="mf-vchip mf-vchip-add"
        onClick={() => input.current?.click()}
        title="Attach a new version of this deliverable"
      >
        <Plus size={12} strokeWidth={2.2} aria-hidden />
        <span>Version</span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * What this version is.
 *
 * A select rather than a row of chips: the tags are a closed list a firm
 * agrees on, only one is true at a time, and it is set once and rarely
 * changed — which is a dropdown's whole job. The list is the same everywhere,
 * so a Comparison in one matter means a Comparison in the next.
 */
function TagControl({
  version,
  onSetTag,
}: {
  version: Version;
  onSetTag: (versionId: string, tag: VersionTag) => void;
}) {
  return (
    <label className="mf-tag">
      <span>This version is</span>
      <select
        value={version.tag ?? ""}
        onChange={(e) => onSetTag(version.id, e.target.value as VersionTag)}
      >
        {!version.tag && <option value="">Not said yet</option>}
        {VERSION_TAGS.map((t) => (
          <option key={t} value={t}>
            {VERSION_TAG_LABEL[t]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The record: every version, newest first, with the day and the person.
 *
 * Only drawn once there is more than one, since a history of a single entry is
 * a heading with nothing under it. Each row selects, so the rail and the
 * history are the same act at two sizes — the rail for the switch you make
 * constantly, the history for the one you make after reading who did what.
 */
function VersionHistory({
  deliverable,
  version,
  onSelect,
  onDownload,
}: {
  deliverable: DerivedDeliverable;
  version: Version;
  onSelect: (versionId: string) => void;
  onDownload: (v: Version) => void;
}) {
  const rows = [...deliverable.versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="mf-history">
      <Eyebrow>History</Eyebrow>
      <ol>
        {rows.map((v) => {
          const state = versionState(v);
          const on = v.id === version.id;
          return (
            <li key={v.id} className={`mf-hrow${on ? " is-on" : ""}`}>
              <button
                type="button"
                onClick={() => onSelect(v.id)}
                {...(on ? { "aria-current": "true" as const } : {})}
              >
                <span className="mf-hdot" aria-hidden />
                <span className="mf-hlabel">{v.label}</span>
                <span className="mf-hwhen">
                  {fmtDay(v.createdAt)}
                  {v.by ? ` · ${v.by}` : ""}
                </span>
                <span className={`mf-hstate is-${state.tint}`}>{state.label}</span>
              </button>
              <button
                type="button"
                className="mf-hdl"
                disabled={!v.fileRef}
                onClick={() => onDownload(v)}
                aria-label={`Download ${v.label}`}
                title={v.fileRef ? `Download ${v.label}` : "No file is attached to this version"}
              >
                <Download size={12} aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Final, as a decision rather than a tick box.
 *
 * Marking a version final supersedes the one before it, which is a consequence
 * worth stating where the act happens instead of leaving it to be discovered
 * in the grid afterwards.
 */
function FinalControl({
  deliverable,
  version,
  onSetFinal,
}: {
  deliverable: DerivedDeliverable;
  version: Version;
  onSetFinal: (versionId: string, isFinal: boolean) => void;
}) {
  const earlier = deliverable.versions.filter(
    (v) => v.id !== version.id && v.createdAt < version.createdAt,
  );
  const later = deliverable.versions.filter((v) => v.createdAt > version.createdAt);
  return (
    <div className={`mf-final${version.isFinal ? " is-on" : ""}`}>
      <button
        type="button"
        aria-pressed={version.isFinal}
        onClick={() => onSetFinal(version.id, !version.isFinal)}
      >
        {version.isFinal ? (
          <>
            <Check size={13} strokeWidth={2.4} aria-hidden /> Final version
          </>
        ) : (
          "Mark as final"
        )}
      </button>
      <span>
        {version.isFinal
          ? "This is the version that goes out."
          : later.length
            ? `${version.label} becomes the one that goes out, although ${later
                .map((v) => v.label)
                .join(", ")} came after it.`
            : earlier.length
              ? `${version.label} becomes the one that goes out; ${earlier
                  .map((v) => v.label)
                  .join(", ")} ${earlier.length === 1 ? "is" : "are"} superseded.`
              : "Says this is the version that goes out."}
      </span>
    </div>
  );
}

function DetailPanel({
  deliverable,
  version,
  target,
  onSelectVersion,
  onAttachFile,
  onSetFinal,
  onSetTag,
  onKeepVersion,
  onOpenEditor,
  onPreview,
  onClose,
}: {
  deliverable: DerivedDeliverable;
  version: Version;
  target: EditorTarget | null;
  onSelectVersion: (versionId: string) => void;
  onAttachFile: (file: File) => void;
  onSetFinal: (versionId: string, isFinal: boolean) => void;
  onSetTag: (versionId: string, tag: VersionTag) => void;
  onKeepVersion: (deliverable: DerivedDeliverable, version: Version) => void;
  onOpenEditor: (target: EditorTarget) => void;
  onPreview: () => void;
  onClose: () => void;
}) {
  const thumb = useVersionThumbnail(version);
  const kind = kindFromName(version.fileRef ?? "");
  const look = KIND_LOOK[kind];
  // Only a final version is worth keeping, and only where Scripta holds the
  // drafting rather than a file somebody attached.
  const { workspaceId } = useApp();
  const keep = keepSource(deliverable);
  const count = deliverable.versions.length;
  const download = (v: Version) => {
    if (!v.fileRef) return;
    void downloadFile(v.fileRef, `${deliverable.name} ${v.label}`);
  };
  /* One line where there was a table of five rows. "Deliverable" repeated the
     title above it, "Phase" repeated the page heading, and "Opens in" told a
     lawyer about the implementation. What is left is what the file is, how
     much of it there is, and who put it there when. */
  const facts = [
    version.pages ? countOf(kind, version.pages) : null,
    fmtDay(version.createdAt),
    version.by,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <aside className="mf-detail" aria-label="Document details">
      <header className="mf-detail-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="mf-detail-title">{deliverable.name}</div>
          <div className="mf-detail-sub">
            {[
              `${count} version${count === 1 ? "" : "s"}`,
              deliverable.deadline ? `due ${fmtDay(deliverable.deadline)}` : null,
              deliverable.owner,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <button
          type="button"
          className="mf-detail-close"
          onClick={onClose}
          aria-label="Close details"
        >
          ×
        </button>
      </header>

      <div className="mf-detail-body">
        <VersionRail
          deliverable={deliverable}
          version={version}
          onSelect={onSelectVersion}
          onFile={onAttachFile}
        />

        <TagControl version={version} onSetTag={onSetTag} />

        <button
          type="button"
          className="mf-detail-page"
          onClick={onPreview}
          disabled={!version.fileRef}
          title={version.fileRef ? "Open this document" : "Nothing is attached yet"}
        >
          <Page src={thumb.src} loading={thumb.status === "loading"} large />
          {version.fileRef && (
            <span className="mf-detail-open">
              <Eye size={13} aria-hidden /> Open
            </span>
          )}
        </button>

        <div className="mf-detail-facts">
          {kind !== "unknown" && (
            <span className="mf-kind" style={{ background: look.tint, color: look.ink }}>
              {look.short}
            </span>
          )}
          {facts}
        </div>

        {/* The work you came to do, above the reading and the talking rather
            than under a thread that can be any length. */}
        <div className="mf-detail-actions">
          {version.fileRef && (
            <Button variant="primary" onClick={onPreview}>
              Preview
            </Button>
          )}
          <div className="mf-detail-actions-row">
            {target && <Button onClick={() => onOpenEditor(target)}>{target.label}</Button>}
            <Button
              onClick={() => download(version)}
              disabled={!version.fileRef}
              title={
                version.fileRef ? "Download this version" : "No file is attached to this version"
              }
            >
              Download
            </Button>
          </div>
          {version.isFinal && (
            <Button
              disabled={!keep.ok}
              title={keep.ok ? "Keep this drafting in the precedent library" : keep.why}
              onClick={() => onKeepVersion(deliverable, version)}
            >
              Save as precedent
            </Button>
          )}
        </div>

        <FinalControl deliverable={deliverable} version={version} onSetFinal={onSetFinal} />

        {deliverable.references && (
          <div className="mf-detail-facts">Referenced by {deliverable.references}</div>
        )}

        {count > 1 && (
          <VersionHistory
            deliverable={deliverable}
            version={version}
            onSelect={onSelectVersion}
            onDownload={download}
          />
        )}

        {/* The thread hangs off the DELIVERABLE, not the version. A version is
            a file at a moment; the conversation is about the thing being
            produced, and it has to survive the next upload. */}
        <div className="mf-detail-thread">
          <Thread
            kind="deliverable"
            entityId={deliverable.id}
            workspaceId={workspaceId}
            title="Discussion"
            blurb="Questions and decisions about this deliverable."
            reviewLabel={`Review: ${deliverable.name}`}
          />
        </div>
      </div>
    </aside>
  );
}

export { Segmented };
