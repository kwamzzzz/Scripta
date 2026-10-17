import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Upload } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { saveFrontMatter } from "@/lib/exports.functions";
import { setMatterLetterhead } from "@/lib/review.functions";
import {
  COVER_PRESETS,
  buildFrontMatter,
  frontMatterSource,
  type FrontMatterEdits,
  type FrontMatterLine,
  type FrontMatterPart,
} from "@/lib/export/front-matter";
import { HOUSE_PAGE } from "@/lib/house-style";
import {
  LETTERHEAD_ACCEPT,
  LETTERHEAD_BUCKET,
  letterheadFileProblem,
  listLetterheads,
  setDefaultLetterhead,
  uploadLetterhead,
} from "@/lib/letterheads";
import { useApp } from "@/store/app";

/**
 * The cover page: page one, and where the title sits on it.
 *
 * Page two used to be drawn here too, with the preamble on it. It went when
 * the preamble became an item in the clause register: the preamble is wording,
 * so it is read and edited in Review beside the rest of the wording, and a
 * second copy of it here was one more place for the two to disagree. What is
 * left is the one thing this page is for — placing the title against the
 * firm's letterhead before the copies go out.
 *
 * These were a form on the export screen, which put the front of the document
 * somewhere other than the document. A lawyer reads a contract from the top;
 * the first thing they read should be editable in the same place, in the same
 * way, as clause 4.
 *
 * The front is typeset here as the export sets it — Arial, justified, the
 * parties hanging from their numbers, the type in bold and the ordinal raised
 * — so what is read on screen is what leaves in the Word and PDF copies. Each
 * part of it is selectable; the ones that carry meaning open a small form
 * beneath themselves. "BETWEEN:" and the operative words are a fixed part of
 * the form of a contract — changing them would not make it say something
 * different, it would make it wrong — so they are shown and locked. The line
 * naming the parties collectively follows from what the parties are called,
 * and is edited there.
 *
 * Page one is drawn to the proportions of the printed page, with the firm's
 * letterhead behind it when one has been uploaded. The contract is printed on
 * that paper, and its logo takes the middle of the page, so the title is
 * placed against it: dragged on the page, set with the slider, or dropped on
 * a preset. Where it lands is where the export puts it.
 */

type MatterFacts = {
  agreementType: string;
  client: string;
  counterparty: string;
  date: string;
};

type FieldKey = keyof Omit<FrontMatterEdits, "recitals" | "coverY" | "preamble" | "titlePage">;

type Field = { key: FieldKey; label: string; placeholder?: string; type?: "date" | "multiline" };

type PartSpec = {
  label: string;
  /** Fields the part opens for editing. None means the part is fixed or derived. */
  fields?: Field[];
  recitals?: boolean;
  /** The part is one piece of prose, edited whole rather than field by field. */
  prose?: "titlePage";
  /** The part is the cover title, which is also placed on the page. */
  placed?: boolean;
  /** Why the part cannot be edited here. */
  fixed?: string;
};

const PARTS: Record<Exclude<FrontMatterPart, "blank">, PartSpec> = {
  cover: {
    label: "Cover page",
    placed: true,
    fields: [{ key: "agreementType", label: "Agreement type", placeholder: "Employment Contract" }],
  },
  title: {
    label: "Operative sentence",
    fields: [
      { key: "agreementType", label: "Agreement type", placeholder: "Employment Contract" },
      { key: "date", label: "Signing date", type: "date" },
    ],
  },
  between: {
    label: "Between",
    fields: [
      {
        key: "betweenText",
        label: "Wording",
        placeholder: "BETWEEN:",
      },
    ],
  },
  party1: {
    label: "First party",
    fields: [
      { key: "client", label: "Name", placeholder: "Who they are" },
      {
        key: "clientAddress",
        label: "Particulars",
        placeholder:
          "a company incorporated under the laws of … with its registered office at …, or an address",
        type: "multiline",
      },
      { key: "clientRole", label: "Called", placeholder: "Employer, Landlord, Purchaser…" },
    ],
  },
  party2: {
    label: "Second party",
    fields: [
      { key: "counterparty", label: "Name", placeholder: "Who they are" },
      {
        key: "counterpartyAddress",
        label: "Particulars",
        placeholder: "of 15 Nuumo Nii Sai Ave, Haatso, Accra, holder of Ghana Card number …",
        type: "multiline",
      },
      { key: "counterpartyRole", label: "Called", placeholder: "Employee, Tenant, Vendor…" },
    ],
  },
  parties: {
    label: "The Parties",
    fields: [
      {
        key: "partiesText",
        label: "Wording — leave empty to follow what each party is called",
        placeholder:
          "(the Client and the Service Provider are together referred to as the “Parties” and each individually as a “Party”).",
        type: "multiline",
      },
    ],
  },
  recital: { label: "Recitals", recitals: true },
  // `placed` as well as the prose: editing the document's own page one has to
  // offer the same placement slider and letterhead panel as the house cover,
  // or a contract that brought its own title page could have its words changed
  // and nothing else — no way to move the title, no way to put it on paper.
  ownCover: { label: "Title page", prose: "titlePage", placed: true },
  // The document's own preamble still exists in the front matter, because the
  // Word and PDF copies are built from it. It is simply not drawn on this
  // page any more: it is read and edited in Review, with the other wording.
  own: { label: "Preamble", fixed: "Edited in Review, with the rest of the wording." },
  agreed: {
    label: "Operative words",
    fields: [
      {
        key: "agreedText",
        label: "Wording — the words that make every clause below binding",
        placeholder: "NOW IT IS HEREBY AGREED as follows:",
      },
    ],
  },
};

/** The printed page's margins as a share of the page, so the sheet matches it. */
const PAGE = HOUSE_PAGE.contract;
const MARGIN_PCT = {
  top: (PAGE.top / PAGE.height) * 100,
  bottom: (PAGE.bottom / PAGE.height) * 100,
  side: (PAGE.left / PAGE.width) * 100,
};
const TEXT_PCT = 100 - MARGIN_PCT.top - MARGIN_PCT.bottom;
/** The lowest the title's top edge may go and still leave room for the title. */
const COVER_Y_MAX = 0.92;
const clampY = (y: number) => Math.min(COVER_Y_MAX, Math.max(0, y));
const titleTop = (coverY: number) => `${MARGIN_PCT.top + TEXT_PCT * clampY(coverY)}%`;

/** Consecutive lines of one part, or a blank line between parts. */
type Group = { id: string; part: FrontMatterPart; lines: FrontMatterLine[] };

const groupLines = (lines: FrontMatterLine[]): Group[] => {
  const groups: Group[] = [];
  lines.forEach((line, i) => {
    const part = line.part ?? "blank";
    const last = groups[groups.length - 1];
    if (part !== "blank" && last && last.part === part) last.lines.push(line);
    else groups.push({ id: part === "blank" ? `blank-${i}` : part, part, lines: [line] });
  });
  return groups;
};

/** A placeholder the matter has not filled, marked so the gap is seen. */
const withGaps = (text: string): ReactNode[] =>
  text
    .split(/(\[[^\]]+\])/)
    .filter(Boolean)
    .map((piece, i) =>
      /^\[[^\]]+\]$/.test(piece) ? (
        <mark key={i} className="ce-front-gap">
          {piece}
        </mark>
      ) : (
        piece
      ),
    );

const runsOf = (line: FrontMatterLine) => line.runs ?? [{ text: line.text }];

const typesetRuns = (line: FrontMatterLine, runs = runsOf(line)) =>
  runs.map((run, i) =>
    run.sup ? (
      <sup key={i}>{run.text}</sup>
    ) : run.bold ? (
      <b key={i}>{withGaps(run.text)}</b>
    ) : (
      <span key={i}>{withGaps(run.text)}</span>
    ),
  );

/** One line of the front, in the shape the page gives it. */
function Typeset({ line }: { line: FrontMatterLine }) {
  const className = [
    "ce-front-line",
    line.align === "left" ? "is-left" : "",
    line.align === "center" ? "is-centred" : "",
    line.strong ? "is-strong" : "",
    line.framed ? "is-framed" : "",
    line.size === "cover" ? "is-cover" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = {
    marginTop: `${(line.spaceBefore ?? 0) / 20}pt`,
    marginBottom: `${(line.spaceAfter ?? 0) / 20}pt`,
  };
  if (!line.text) return <p className={`${className} is-blank`} style={style} />;
  if (line.hanging) {
    // The number at the margin and the particulars hanging from the tab, which
    // is what the tab and the hanging indent do in the Word copy.
    const runs = runsOf(line);
    const at = runs.findIndex((r) => r.text.includes("\t"));
    if (at >= 0) {
      const [head = "", ...rest] = runs[at]!.text.split("\t");
      const number =
        runs
          .slice(0, at)
          .map((r) => r.text)
          .join("") + head;
      const after = [{ ...runs[at]!, text: rest.join("\t") }, ...runs.slice(at + 1)];
      return (
        <p className={`${className} is-hanging`} style={style}>
          <span>{number}</span>
          <span>{typesetRuns(line, after)}</span>
        </p>
      );
    }
  }
  return (
    <p className={className} style={style}>
      {typesetRuns(line)}
    </p>
  );
}

export default function CoverPage({
  matterId,
  facts,
  edits,
  documentPreamble,
  documentTitlePage,
  onSaved,
}: {
  matterId: string;
  facts: MatterFacts;
  edits: FrontMatterEdits;
  /**
   * The front matter the document under review actually carries, as the
   * parser read it. Present for a contract that came in from outside; absent
   * for one being drafted here, which has no words of its own yet.
   */
  documentPreamble?: string | undefined;
  /**
   * Page one as the document sets it — the title, who it was prepared for and
   * by, the date. Separate from the preamble because they are separate things:
   * one is a label, the other is operative wording.
   */
  documentTitlePage?: string | undefined;
  onSaved: () => void;
}) {
  const { workspaceId, D } = useApp();
  /**
   * Whether this contract is being drafted onto the firm's paper.
   *
   * The letterhead belongs to the workspace; whether a given contract is
   * printed on it belongs to the matter. This page only ever asked the first
   * question, so turning the letterhead off in the toolbar changed the file
   * and left the page a lawyer is actually looking at showing the paper.
   */
  const onPaper = D.matter.useLetterhead !== false;
  const qc = useQueryClient();
  const save = useServerFn(saveFrontMatter);
  const setPaper = useServerFn(setMatterLetterhead);
  const [paperBusy, setPaperBusy] = useState(false);
  /**
   * Open on a wide screen, closed on a laptop.
   *
   * At 1400px and up the page sits beside the document preview and costs
   * nothing to leave open. On a MacBook the two stack, and a full sheet of A4
   * above the preview pushes the document off the screen — so there it starts
   * as one line and opens when it is wanted.
   */
  const [open, setOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1400,
  );
  const [draft, setDraft] = useState<FrontMatterEdits>(edits);
  const [recitals, setRecitals] = useState((edits.recitals ?? []).join("\n\n"));
  // The front as this document words it: whatever the lawyer has already
  // edited, else what the document itself said.
  const [coverText, setCoverText] = useState(edits.titlePage ?? documentTitlePage ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  /**
   * What is drawn on the page.
   *
   * The document's own front matter is used the moment it is read, not once
   * somebody has opened the editor and pressed save. Seeding only the textarea
   * left the page showing the firm's form — [Date], [First party address],
   * WHEREAS [Why the parties are contracting] — beside a contract that had
   * already said all of it, which is the thing this was meant to stop.
   * A saved edit still wins over what the document said.
   */
  const front = buildFrontMatter(
    frontMatterSource(facts, {
      ...draft,
      ...(draft.preamble?.trim()
        ? {}
        : documentPreamble?.trim()
          ? { preamble: documentPreamble }
          : {}),
      ...(draft.titlePage?.trim()
        ? {}
        : documentTitlePage?.trim()
          ? { titlePage: documentTitlePage }
          : {}),
    }),
  );
  const cover = groupLines(front.cover);
  const parts = cover.filter((g) => g.part !== "blank").length;
  const coverY = front.coverY ?? 0;
  const placing = editingId === "cover";

  /** The firm's paper, drawn behind page one so the title is placed against it. */
  const paper = useQuery({
    queryKey: ["letterhead-paper", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const all = await listLetterheads(workspaceId!);
      const chosen = all.find((l) => l.isDefault) ?? all[0];
      if (!chosen) return null;
      const signed = async (path: string) => {
        const { data, error: urlError } = await supabase.storage
          .from(LETTERHEAD_BUCKET)
          .createSignedUrl(path, 3600);
        if (urlError || !data)
          throw new Error(urlError?.message ?? "The letterhead could not be read.");
        return data.signedUrl;
      };
      return {
        name: chosen.name,
        kind: chosen.kind,
        url: await signed(chosen.storagePath),
        // The mark the pages after the first carry, when the paper has one,
        // and how far its header and footer artwork reach into the page.
        continuation: chosen.continuationPath ? await signed(chosen.continuationPath) : null,
        widthPx: chosen.widthPx,
        bodyTopPx: chosen.bodyTopPx,
        bodyBottomPx: chosen.bodyBottomPx,
      };
    },
  });

  /** What is drawn behind the pages. The upload controls still use `paper`. */
  const sheet = onPaper ? paper.data : null;

  const commit = async (next: FrontMatterEdits) => {
    setSaving(true);
    setError(null);
    try {
      await save({ data: { matterId, edits: next } });
      setEditingId(null);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The cover page could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const saveBlock = () => {
    const next: FrontMatterEdits = { ...draft };
    const lines = recitals
      .split(/\n{2,}/)
      .map((r) => r.trim())
      .filter(Boolean);
    if (lines.length) next.recitals = lines;
    else delete next.recitals;
    if (coverText.trim()) next.titlePage = coverText;
    else delete next.titlePage;
    void commit(next);
  };

  const cancel = () => {
    setDraft(edits);
    setRecitals((edits.recitals ?? []).join("\n\n"));
    setCoverText(edits.titlePage ?? documentTitlePage ?? "");
    setEditingId(null);
  };

  /**
   * Whether this contract prints on the firm's paper.
   *
   * Asked here, on the page it changes. It used to be asked in the document
   * viewer's toolbar, next to Download — a decision about how page one is set,
   * made on a strip of buttons about exporting, two cards away from the page
   * it applies to. This panel could only point at it: "turn the letterhead
   * back on in the toolbar".
   */
  const togglePaper = async (use: boolean) => {
    setPaperBusy(true);
    setError(null);
    try {
      await setPaper({ data: { matterId, use } });
      await qc.invalidateQueries();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The letterhead could not be changed.");
    } finally {
      setPaperBusy(false);
    }
  };

  const setCoverY = (y: number) =>
    setDraft((d) => ({ ...d, coverY: Math.round(clampY(y) * 100) / 100 }));

  /* ---- placing the title by hand on page one ---- */

  const pageOne = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; grab: number } | null>(null);
  const fractionAt = (clientY: number, grab: number) => {
    const rect = pageOne.current?.getBoundingClientRect();
    if (!rect) return coverY;
    const top = rect.top + (rect.height * MARGIN_PCT.top) / 100;
    const height = (rect.height * TEXT_PCT) / 100;
    return (clientY - grab - top) / height;
  };
  const onGrab = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!placing || event.button !== 0) return;
    const slot = event.currentTarget.getBoundingClientRect();
    drag.current = { pointerId: event.pointerId, grab: event.clientY - slot.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    setCoverY(fractionAt(event.clientY, drag.current.grab));
  };
  const onRelease = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const upload = async (file: File | undefined) => {
    if (!file || !workspaceId) return;
    const problem = letterheadFileProblem(file);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const saved = await uploadLetterhead(workspaceId, file, file.name.replace(/\.[^.]+$/, ""));
      await setDefaultLetterhead(saved.id);
      await qc.invalidateQueries({ queryKey: ["letterhead-paper", workspaceId] });
    } catch (cause) {
      setUploadError(
        cause instanceof Error ? cause.message : "The letterhead could not be uploaded.",
      );
    } finally {
      setUploading(false);
    }
  };

  const nearPreset = (value: number) => Math.abs(coverY - value) < 0.03;

  const form = (spec: PartSpec) => (
    <form
      className="ce-front-form"
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        saveBlock();
      }}
    >
      {spec.prose === "titlePage" ? (
        <label className="ce-front-field ce-front-field-wide">
          <span>Page one, as this document sets it — one line per line, centred</span>
          <textarea
            rows={7}
            autoFocus
            value={coverText}
            placeholder={"BRAND DEVELOPMENT SERVICES AGREEMENT\nPrepared for: …\nPrepared by: …"}
            onChange={(event) => setCoverText(event.target.value)}
          />
        </label>
      ) : spec.recitals ? (
        <label className="ce-front-field ce-front-field-wide">
          <span>Recitals — one per paragraph, leaving a blank line between them</span>
          <textarea
            rows={4}
            autoFocus
            value={recitals}
            placeholder="the Employer wishes to employ the Employee, and the Employee has agreed to accept such employment on the terms set out in this Contract,"
            onChange={(event) => setRecitals(event.target.value)}
          />
        </label>
      ) : (
        <div className="ce-front-fields">
          {spec.fields?.map((f, i) => (
            <label
              key={f.key}
              className={`ce-front-field${f.type === "multiline" ? " ce-front-field-wide" : ""}`}
            >
              <span>{f.label}</span>
              {f.type === "multiline" ? (
                <textarea
                  rows={2}
                  autoFocus={i === 0}
                  value={draft[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(event) => setDraft((d) => ({ ...d, [f.key]: event.target.value }))}
                />
              ) : (
                <input
                  autoFocus={i === 0}
                  {...(f.type === "date" ? { type: "date" } : {})}
                  value={draft[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(event) => setDraft((d) => ({ ...d, [f.key]: event.target.value }))}
                />
              )}
            </label>
          ))}
        </div>
      )}
      {spec.placed && (
        <div className="ce-front-place">
          <span className="ce-front-place-label">Title sits at</span>
          <div className="ce-front-presets" role="group" aria-label="Title position presets">
            {COVER_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className={nearPreset(p.value) ? "is-on" : ""}
                aria-pressed={nearPreset(p.value)}
                onClick={() => setCoverY(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="ce-front-slider">
            <input
              type="range"
              min={0}
              max={Math.round(COVER_Y_MAX * 100)}
              value={Math.round(coverY * 100)}
              aria-label="Title position down the page, per cent"
              onChange={(event) => setCoverY(Number(event.target.value) / 100)}
            />
            <span>{Math.round(coverY * 100)}% down the page — or drag the title on page one</span>
          </label>
          {paperPanel()}
        </div>
      )}
      <div className="ce-front-actions">
        <button className="ce-front-save" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="ce-front-cancel" type="button" disabled={saving} onClick={cancel}>
          Cancel
        </button>
        <span className="ce-front-hint">
          Blank uses what the matter records. Nothing is invented.
        </span>
      </div>
    </form>
  );

  /**
   * The firm's paper: whether this contract is printed on it, and how to put
   * one there when the workspace has none.
   *
   * Drawn on the card itself rather than only inside the edit form. It used to
   * live two clicks deep — select the title block, press Edit, scroll — and a
   * lawyer looking for it reasonably concluded there was no way to use a
   * letterhead at all. It is a decision about the copy that goes out, so it
   * belongs where the copy is.
   */
  const paperPanel = () => (
    <div className="ce-front-paper">
      {paper.data ? (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={onPaper}
            disabled={paperBusy}
            onChange={(event) => void togglePaper(event.target.checked)}
          />
          <span>
            {onPaper ? (
              <>
                Printed on <b>{paper.data.name}</b>.
              </>
            ) : (
              <>
                Printed on plain pages. Tick to place the title against <b>{paper.data.name}</b>.
              </>
            )}
          </span>
        </label>
      ) : paper.isLoading ? (
        <span>Looking for the firm's letterhead…</span>
      ) : (
        <span>No letterhead yet. Upload the firm's Word template, a PDF of it, or an image.</span>
      )}
      <label className={`ce-front-upload${uploading ? " is-busy" : ""}`}>
        <Upload aria-hidden="true" />
        {uploading
          ? "Reading the letterhead…"
          : paper.data
            ? "Change letterhead"
            : "Upload your letterhead"}
        <input
          type="file"
          accept={LETTERHEAD_ACCEPT}
          hidden
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void upload(file);
          }}
        />
      </label>
      {uploadError && (
        <span className="ce-front-upload-error" role="alert">
          {uploadError}
        </span>
      )}
    </div>
  );

  /**
   * The form for whatever part is open for editing.
   *
   * The cover's parts are drawn inside an absolutely positioned slot that
   * clips its overflow, so their form cannot be rendered in place — which is
   * why `partNode` is called with `withForm: false` there. Only the cover
   * title's own form was then rendered beside the sheet, and only while the
   * title was being placed. So on a contract carrying its own page one the
   * Edit button set the state and nothing ever appeared: a button that did
   * nothing at all.
   */
  const editingSpec = (() => {
    const group = cover.find((g) => g.id === editingId);
    if (!group || group.part === "blank") return null;
    const spec = PARTS[group.part];
    return spec.fixed ? null : spec;
  })();

  const partNode = (group: Group, withForm = true) => {
    if (group.part === "blank") return <div key={group.id} className="ce-front-blank" />;
    const spec = PARTS[group.part];
    const editable = !spec.fixed;
    const isSelected = selectedId === group.id;
    const isEditing = editingId === group.id;
    const className = [
      "ce-front-part",
      isSelected ? "is-selected" : "",
      isEditing ? "is-editing" : "",
      editable ? "" : "is-fixed",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <div
        key={group.id}
        className={className}
        data-clause={`cover-${group.id}`}
        role="group"
        aria-label={spec.label}
        onClick={() => setSelectedId(group.id)}
        onDoubleClick={() => editable && setEditingId(group.id)}
      >
        <div className="ce-front-text">
          {group.lines.map((line, i) => (
            <Typeset key={i} line={line} />
          ))}
        </div>
        {/* Shown whenever the part can be edited, not only once it has been
            selected: an affordance that appears after you click the thing it
            is meant to explain is an affordance nobody finds. */}
        {!isEditing && (editable || isSelected) && (
          <div className="ce-front-tools">
            {editable ? (
              <button
                className="ce-front-edit"
                type="button"
                title={`Edit ${spec.label.toLowerCase()}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingId(group.id);
                }}
              >
                <Pencil aria-hidden="true" />
                Edit
              </button>
            ) : (
              <span className="ce-front-fixed" title={spec.fixed}>
                Fixed wording
              </span>
            )}
          </div>
        )}
        {withForm && isEditing && editable && form(spec)}
      </div>
    );
  };

  return (
    <section className="ce-node depth-0 ce-front" data-clause="cover-page">
      <header className="ce-node-header" onClick={() => setOpen((v) => !v)}>
        <button
          className="ce-node-chevron"
          type="button"
          aria-label={`${open ? "Collapse" : "Expand"} the cover page`}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
        </button>
        <span className="ce-node-number">FRONT</span>
        <strong>Cover page</strong>
        <span className="ce-node-meta">
          {parts} PARTS{!open ? " · COLLAPSED" : ""}
        </span>
        <span className="ce-node-space" />
        <span className="ce-section-label">Before clause 1</span>
      </header>

      {open && (
        <div className="ce-front-body">
          {error && (
            <p className="ce-front-error" role="alert">
              {error}
            </p>
          )}
          <div className="ce-front-sheet">
            <div
              ref={pageOne}
              className={`ce-front-page ce-front-page-cover${placing ? " is-placing" : ""}${sheet ? " has-paper" : ""}`}
              style={sheet ? { backgroundImage: `url("${sheet.url}")` } : undefined}
            >
              <span className="ce-front-folio">Page one{sheet ? ` · on ${sheet.name}` : ""}</span>
              {placing && (
                <div className="ce-front-guides" aria-hidden="true">
                  <span style={{ top: `${MARGIN_PCT.top}%` }}>
                    <i>Top margin</i>
                  </span>
                  <span style={{ top: `${MARGIN_PCT.top + TEXT_PCT / 2}%` }}>
                    <i>Middle of the page</i>
                  </span>
                  <span style={{ top: `${100 - MARGIN_PCT.bottom}%` }}>
                    <i>Bottom margin</i>
                  </span>
                </div>
              )}
              <div
                className={`ce-front-cover-slot${placing ? " is-draggable" : ""}`}
                style={{ top: titleTop(coverY) }}
                onPointerDown={onGrab}
                onPointerMove={onDrag}
                onPointerUp={onRelease}
                onPointerCancel={onRelease}
              >
                {placing && (
                  <span className="ce-front-cover-mark" aria-hidden="true">
                    {Math.round(coverY * 100)}%
                  </span>
                )}
                {cover.map((group) => partNode(group, false))}
              </div>
            </div>
            {editingSpec ? form(editingSpec) : placing ? form(PARTS.cover) : null}
          </div>
          {/* The paper this goes out on, in plain sight. Inside the edit form
              it was two clicks and a scroll away, which reads as "you cannot
              use a letterhead here". */}
          {!editingSpec && !placing && paperPanel()}
          <p className="ce-front-note">
            Page one only. The preamble is wording, so it is read and edited in Review with the rest
            of the wording; this page exists so the title can be placed against the firm's
            letterhead before the copies go out.
          </p>
        </div>
      )}
    </section>
  );
}
