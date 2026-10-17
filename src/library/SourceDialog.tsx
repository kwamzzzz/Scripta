/**
 * Add a source to the Library, or edit one.
 *
 * The fields follow the kind: a case is decided by a court and reported in a
 * law report, a book has an author and a publisher, a website a site. Status
 * and weight appear only where they mean something (legislation, cases,
 * treaties, guidance). A source may carry a link, a file, or both.
 */
import { useMemo, useRef, useState } from "react";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import { fmtBytes, MAX_ATTACHMENT_BYTES } from "@/lib/correspondence";
import {
  SOURCE_KINDS,
  SOURCE_STATUSES,
  SOURCE_WEIGHTS,
  STATUS_NAME,
  WEIGHT_NAME,
  emptyDraft,
  kindInfo,
  parseTopics,
  type LibraryCollection,
  type LibrarySource,
  type SourceDraft,
  type SourceKind,
  type SourceStatus,
  type SourceWeight,
} from "@/lib/library";
import "@/components/organise.css";

export default function SourceDialog({
  source,
  collections,
  jurisdictions,
  topics,
  defaultCollectionIds,
  onClose,
  onSave,
}: {
  source: LibrarySource | null;
  collections: LibraryCollection[];
  /** Jurisdictions and topics already used, offered as the writer types. */
  jurisdictions: string[];
  topics: string[];
  defaultCollectionIds: string[];
  onClose: () => void;
  onSave: (draft: SourceDraft, file: File | null, removeFile: boolean) => Promise<void>;
}) {
  const [draft, setDraft] = useState<SourceDraft>(() =>
    source
      ? {
          kind: source.kind,
          kindLabel: source.kindLabel,
          title: source.title,
          citation: source.citation,
          authors: source.authors,
          publisher: source.publisher,
          jurisdiction: source.jurisdiction,
          issued: source.issued,
          status: source.status,
          weight: source.weight,
          url: source.url,
          topics: source.topics,
          notes: source.notes,
          private: source.private,
          collectionIds: source.collectionIds,
        }
      : emptyDraft(defaultCollectionIds),
  );
  const [topicText, setTopicText] = useState(draft.topics.join(", "));
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const info = kindInfo(draft.kind);
  // "Citation, e.g. Act 992" is a label and its example; "Volume, issue, pages" is all label.
  const [citeLabel, citeHint = ""] = info.citation.split(", e.g. ");
  const set = (patch: Partial<SourceDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const liveCollections = collections.filter(
    (c) => !c.archivedAt || draft.collectionIds.includes(c.id),
  );
  const unusedTopics = useMemo(() => {
    const chosen = new Set(parseTopics(topicText).map((t) => t.toLowerCase()));
    return topics.filter((t) => !chosen.has(t.toLowerCase())).slice(0, 12);
  }, [topics, topicText]);
  // Only the author changes whether a source is private.
  const canTogglePrivate = !source || source.mine;
  const hasFile = (source?.file && !removeFile) || file;

  const save = async () => {
    if (!draft.title.trim()) {
      setError("Give the source a title.");
      return;
    }
    if (draft.kind === "other" && !draft.kindLabel.trim()) {
      setError("Say what kind of source this is, or choose one of the types.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...draft, topics: parseTopics(topicText) }, file, removeFile);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} label={source ? "Edit source" : "Add a source"}>
      <form
        className="org-dialog lib-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2>{source ? "Edit source" : "Add a source"}</h2>

        <div className="lib-kinds" role="radiogroup" aria-label="Type of source">
          {SOURCE_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={draft.kind === k.id}
              className={draft.kind === k.id ? "is-on" : undefined}
              onClick={() => set({ kind: k.id as SourceKind })}
            >
              {k.id === "other" ? "Something else" : k.label}
            </button>
          ))}
        </div>
        {draft.kind === "other" && (
          <label className="org-field">
            <span className="org-label">What kind of source</span>
            <input
              value={draft.kindLabel}
              autoFocus
              placeholder="e.g. Speech, Thesis, Policy paper"
              onChange={(e) => set({ kindLabel: e.target.value })}
            />
          </label>
        )}

        <label className="org-field">
          <span className="org-label">Title</span>
          <input
            value={draft.title}
            autoFocus={draft.kind !== "other"}
            placeholder={
              draft.kind === "case"
                ? "e.g. Republic v High Court, ex parte Attorney-General"
                : draft.kind === "statute"
                  ? "e.g. Companies Act, 2019"
                  : "Title"
            }
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>

        <div className="lib-row">
          <label className="org-field">
            <span className="org-label">{citeLabel}</span>
            <input
              value={draft.citation}
              placeholder={citeHint ? `e.g. ${citeHint}` : ""}
              onChange={(e) => set({ citation: e.target.value })}
            />
          </label>
          <label className="org-field">
            <span className="org-label">Jurisdiction</span>
            <input
              list="lib-jurisdictions"
              value={draft.jurisdiction}
              placeholder="e.g. Ghana, OHADA, UAE"
              onChange={(e) => set({ jurisdiction: e.target.value })}
            />
            <datalist id="lib-jurisdictions">
              {jurisdictions.map((j) => (
                <option key={j} value={j} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="lib-row">
          <label className="org-field">
            <span className="org-label">{info.authors}</span>
            <input value={draft.authors} onChange={(e) => set({ authors: e.target.value })} />
          </label>
          <label className="org-field">
            <span className="org-label">{info.publisher}</span>
            <input value={draft.publisher} onChange={(e) => set({ publisher: e.target.value })} />
          </label>
        </div>

        <div className="lib-row">
          <label className="org-field">
            <span className="org-label">{info.issued}</span>
            <input
              value={draft.issued}
              placeholder="e.g. 2019, or 14 May 2019"
              onChange={(e) => set({ issued: e.target.value })}
            />
          </label>
          {info.legal ? (
            <div className="lib-row lib-tight">
              <label className="org-field">
                <span className="org-label">Status</span>
                <select
                  value={draft.status ?? ""}
                  onChange={(e) => set({ status: (e.target.value || null) as SourceStatus | null })}
                >
                  <option value="">Not stated</option>
                  {SOURCE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_NAME[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="org-field">
                <span className="org-label">Weight</span>
                <select
                  value={draft.weight ?? ""}
                  onChange={(e) => set({ weight: (e.target.value || null) as SourceWeight | null })}
                >
                  <option value="">Not stated</option>
                  {SOURCE_WEIGHTS.map((w) => (
                    <option key={w} value={w}>
                      {WEIGHT_NAME[w]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <span />
          )}
        </div>

        <label className="org-field">
          <span className="org-label">Link</span>
          <input
            value={draft.url}
            inputMode="url"
            placeholder="Where it can be read online, if anywhere"
            onChange={(e) => set({ url: e.target.value })}
          />
        </label>

        <div className="org-field">
          <span className="org-label">File</span>
          <input
            ref={fileInput}
            type="file"
            hidden
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (picked && picked.size > MAX_ATTACHMENT_BYTES) {
                setError(`${picked.name} is over ${fmtBytes(MAX_ATTACHMENT_BYTES)}.`);
                return;
              }
              setFile(picked);
              setRemoveFile(false);
            }}
          />
          <div className="lib-file">
            {hasFile ? (
              <>
                <span>
                  {file ? file.name : source!.file!.name}
                  <em>{fmtBytes(file ? file.size : source!.file!.bytes)}</em>
                </span>
                <button
                  type="button"
                  className="org-link"
                  onClick={() => fileInput.current?.click()}
                >
                  Replace
                </button>
                <button
                  type="button"
                  className="org-link"
                  onClick={() => {
                    setFile(null);
                    setRemoveFile(!!source?.file);
                  }}
                >
                  Remove
                </button>
              </>
            ) : (
              <button type="button" className="lib-drop" onClick={() => fileInput.current?.click()}>
                Attach a copy (PDF, Word, anything up to {fmtBytes(MAX_ATTACHMENT_BYTES)})
              </button>
            )}
          </div>
        </div>

        <label className="org-field">
          <span className="org-label">Topics</span>
          <input
            value={topicText}
            placeholder="Separate with commas, e.g. tax, VAT, free zones"
            onChange={(e) => setTopicText(e.target.value)}
          />
          {unusedTopics.length > 0 && (
            <span className="lib-suggest">
              {unusedTopics.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setTopicText((v) => (v.trim() ? `${v.replace(/[,\s]+$/, "")}, ${t}` : t))
                  }
                >
                  + {t}
                </button>
              ))}
            </span>
          )}
        </label>

        {liveCollections.length > 0 && (
          <div className="org-field">
            <span className="org-label">Collections</span>
            <div className="lib-chips">
              {liveCollections.map((c) => {
                const on = draft.collectionIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    className={on ? "is-on" : undefined}
                    onClick={() =>
                      set({
                        collectionIds: on
                          ? draft.collectionIds.filter((id) => id !== c.id)
                          : [...draft.collectionIds, c.id],
                      })
                    }
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="org-field">
          <span className="org-label">Notes</span>
          <textarea
            rows={3}
            value={draft.notes}
            placeholder="What it is good for, the provisions that matter, anything to watch"
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>

        <label
          className="lib-private"
          title={canTogglePrivate ? undefined : "Only the person who added it can change this"}
        >
          <input
            type="checkbox"
            checked={draft.private}
            disabled={!canTogglePrivate}
            onChange={(e) => set({ private: e.target.checked })}
          />
          <span>
            Private to me
            <em>
              {draft.private
                ? "Only you will see this source and its file."
                : "Everyone in the workspace can find and use it."}
            </em>
          </span>
        </label>

        {error && (
          <p className="org-error" role="alert">
            {error}
          </p>
        )}
        <div className="org-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : source ? "Save" : "Add to Library"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
