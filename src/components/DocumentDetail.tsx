import { useEffect, useMemo, useRef, useState } from "react";
import { useUnsavedGuard } from "@/lib/nav";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/primitives";
import { useConfirm } from "@/components/Confirm";
import { useAuth } from "@/lib/auth";
import { useApp } from "@/store/app";
import Thread from "@/components/Thread";
import { useBoard } from "@/lib/use-board";
import { parseDocument } from "@/lib/documents.functions";
import { ACCEPT_ATTR } from "@/lib/parsing/mime";
import { buildCleanDocx } from "@/lib/export/docx";
import { fileSize, longDate, relTime, type BoardDoc } from "@/lib/home-data";
import {
  CONFIDENTIALITY,
  listVersions,
  moveDocument,
  restoreVersion,
  saveDocumentMeta,
  setArchived,
  signedUrl,
  uploadNewVersion,
  type DocMeta,
  type DocVersion,
} from "@/lib/documents-library";

import "./documents-screen.css";

const KIND_LABEL: Record<BoardDoc["kind"], string> = {
  contract: "Contract",
  amendment: "Amendment",
  transcript: "Transcript",
  playbook: "Playbook",
  letter: "Letter",
  resolution: "Resolution",
  minutes: "Minutes",
  proposal: "Proposal",
  research: "Research",
  reference: "Reference",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="scripta-document-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

const metaOf = (d: BoardDoc): DocMeta => ({
  name: d.name,
  kind: d.kind,
  versionLabel: d.ver,
  docDate: d.date,
  jurisdiction: d.jurisdiction ?? "",
  effectiveDate: d.effectiveDate ?? "",
  parties: d.parties ?? [],
  tags: d.tags ?? [],
  confidentiality: d.confidentiality ?? "",
  notes: d.notes ?? "",
});

/** The document workspace: metadata, processing, version history and export. */
export default function DocumentDetail({
  doc,
  onOpenMatter,
  onChanged,
}: {
  doc: BoardDoc;
  onOpenMatter: () => void;
  onChanged: () => void;
}) {
  const { user, profile } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const { workspaceId } = useApp();
  const { board } = useBoard();
  const qc = useQueryClient();
  const reparse = useServerFn(parseDocument);
  const actor = useMemo(
    () => ({ id: user?.id ?? null, name: profile?.full_name ?? profile?.email ?? "Unknown" }),
    [user, profile],
  );

  const [meta, setMeta] = useState<DocMeta>(() => metaOf(doc));
  const [dirty, setDirty] = useState(false);
  const unsavedDialog = useUnsavedGuard(dirty, "This document has unsaved details.");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<DocVersion[] | null>(null);
  const [versionLabel, setVersionLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMeta(metaOf(doc));
    setDirty(false);
    setStatus(null);
    setError(null);
  }, [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    setVersions(null);
    listVersions(doc)
      .then((v) => live && setVersions(v))
      .catch(
        (e: unknown) =>
          live && setError(e instanceof Error ? e.message : "Could not load versions"),
      );
    return () => {
      live = false;
    };
  }, [doc.id, doc.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (patch: Partial<DocMeta>) => {
    setMeta((m) => ({ ...m, ...patch }));
    setDirty(true);
    setStatus(null);
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setStatus(label);
    try {
      await fn();
      await qc.invalidateQueries();
      onChanged();
      setStatus("Saved");
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const download = async (path: string | null, name: string) => {
    if (!path) {
      setError("No stored file for this version.");
      return;
    }
    try {
      window.open(await signedUrl(path, name), "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a download link");
    }
  };

  const exportDocx = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from("documents")
        .select("parsed_text")
        .eq("id", doc.id)
        .single();
      if (qErr) throw new Error(qErr.message);
      const text = (data?.parsed_text ?? "").trim();
      if (!text) throw new Error("No extracted text yet — parse the document first.");
      const bytes = buildCleanDocx({
        title: doc.name,
        ...(doc.ver ? { subtitle: doc.ver } : {}),
        author: actor.name,
        clauses: text
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((p, i) => ({ num: String(i + 1), title: "", segs: [{ t: p, k: "n" as const }] })),
      });
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.name}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export");
    } finally {
      setBusy(false);
    }
  };

  const archived = !!doc.archivedAt;

  return (
    <div className="scripta-document-detail">
      <header>
        <h2>{doc.name}</h2>
        <p>
          {board.matters.find((m) => m.id === doc.matterId)?.name ?? "—"}
          {archived ? " · Archived" : ""}
        </p>
      </header>
      <div className="scripta-document-actions">
        <Button variant="primary" onClick={onOpenMatter}>
          Open matter
        </Button>
        <Button onClick={() => void download(doc.storagePath, doc.name)}>Download original</Button>
        <Button onClick={() => void exportDocx()} disabled={busy}>
          Export .docx
        </Button>
      </div>
      {error && (
        <div className="scripta-document-feedback is-error" role="alert">
          {error}
        </div>
      )}
      {status && !error && (
        <div className="scripta-document-feedback is-success" role="status">
          {status}
        </div>
      )}

      <section className="scripta-document-section scripta-document-fields">
        <h3>Details</h3>
        <Row label="Title">
          <input value={meta.name} onChange={(e) => edit({ name: e.target.value })} />
        </Row>
        <div className="scripta-document-field-row">
          <Row label="Type">
            <select
              value={meta.kind}
              onChange={(e) => edit({ kind: e.target.value as BoardDoc["kind"] })}
            >
              {(Object.keys(KIND_LABEL) as BoardDoc["kind"][]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Version label">
            <input
              value={meta.versionLabel}
              onChange={(e) => edit({ versionLabel: e.target.value })}
            />
          </Row>
        </div>
        <div className="scripta-document-field-row">
          <Row label="Document date">
            <input
              type="date"
              value={meta.docDate ?? ""}
              onChange={(e) => edit({ docDate: e.target.value })}
            />
          </Row>
          <Row label="Effective date">
            <input
              type="date"
              value={meta.effectiveDate ?? ""}
              onChange={(e) => edit({ effectiveDate: e.target.value })}
            />
          </Row>
        </div>
        <div className="scripta-document-field-row">
          <Row label="Jurisdiction">
            <input
              value={meta.jurisdiction ?? ""}
              onChange={(e) => edit({ jurisdiction: e.target.value })}
            />
          </Row>
          <Row label="Confidentiality">
            <select
              value={meta.confidentiality ?? ""}
              onChange={(e) => edit({ confidentiality: e.target.value })}
            >
              <option value="">Not classified</option>
              {CONFIDENTIALITY.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Row>
        </div>
        <Row label="Parties (comma separated)">
          <input
            value={(meta.parties ?? []).join(", ")}
            onChange={(e) =>
              edit({
                parties: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </Row>
        <Row label="Tags (comma separated)">
          <input
            value={(meta.tags ?? []).join(", ")}
            onChange={(e) =>
              edit({
                tags: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </Row>
        <Row label="Notes">
          <textarea value={meta.notes ?? ""} onChange={(e) => edit({ notes: e.target.value })} />
        </Row>
        <div className="scripta-document-actions">
          <Button
            variant="primary"
            disabled={!dirty || busy}
            onClick={() =>
              void run("Saving…", async () => {
                await saveDocumentMeta(doc, meta, actor);
                setDirty(false);
              })
            }
          >
            {busy ? "Saving…" : "Save details"}
          </Button>
          {dirty && (
            <span className="scripta-document-unsaved" role="status">
              Unsaved changes
            </span>
          )}
        </div>
      </section>

      {/* A document carries no responsible person on the row, so entity_owner()
          returns null here and resolution narrows to the raiser and the Lead.
          That is the correct answer rather than a gap — see O08 in the step 1
          suite. */}
      <section className="scripta-document-section">
        <Thread
          kind="document"
          entityId={doc.id}
          workspaceId={workspaceId}
          title="Discussion"
          blurb="Questions and decisions about this document, kept with it."
          reviewLabel={`Review: ${doc.name}`}
        />
      </section>

      <section className="scripta-document-section">
        <h3>Text extraction</h3>
        <p className="scripta-document-processing-status">
          {doc.parseStatus === "parsed"
            ? "Text extracted"
            : doc.parseStatus === "failed"
              ? "Extraction failed"
              : doc.parseStatus === "parsing"
                ? "Extracting…"
                : "Queued"}
        </p>
        {doc.parseError && (
          <div className="scripta-document-feedback is-error" role="alert">
            {doc.parseError}
          </div>
        )}
        <Button
          disabled={busy}
          onClick={() =>
            void run("Re-parsing…", async () => {
              await reparse({ data: { documentId: doc.id } });
            })
          }
        >
          Re-run extraction
        </Button>
      </section>

      <section className="scripta-document-section">
        <h3>Version history</h3>
        <div className="scripta-document-version-upload">
          <Row label="New version label">
            <input
              placeholder="e.g. v3 counterparty markup"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
            />
          </Row>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_ATTR}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || !workspaceId) return;
              void run("Uploading version…", async () => {
                await uploadNewVersion(doc, file, versionLabel, "", workspaceId, actor);
                setVersionLabel("");
                await reparse({ data: { documentId: doc.id } });
              });
            }}
          />
          <Button disabled={busy || !workspaceId} onClick={() => fileRef.current?.click()}>
            Upload new version
          </Button>
        </div>
        {versions === null && (
          <p className="scripta-document-note" role="status">
            Loading history…
          </p>
        )}
        <ul className="scripta-document-history">
          {versions?.map((v) => (
            <li key={v.id}>
              <header>
                <strong>{v.label || "Unlabelled version"}</strong>
                {v.current && <span>Current file</span>}
              </header>
              {!v.current && v.note && <p>{v.note}</p>}
              <p>
                {relTime(v.createdAt)} · {fileSize(v.bytes)}
              </p>
              <div className="scripta-document-actions">
                <Button
                  variant="quiet"
                  onClick={() =>
                    void download(v.storagePath, `${doc.name}-${v.label || "version"}`)
                  }
                >
                  Download
                </Button>
                {!v.current && (
                  <Button
                    variant="quiet"
                    onClick={async () => {
                      if (
                        !(await confirm({
                          title: "Restore this version?",
                          body: "It becomes the current file and is read again from scratch. The version it replaces stays in the history.",
                          confirmLabel: "Restore this version",
                          danger: false,
                        }))
                      )
                        return;
                      void run("Restoring…", async () => {
                        await restoreVersion(doc, v, actor);
                        await reparse({ data: { documentId: doc.id } });
                      });
                    }}
                  >
                    Restore
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="scripta-document-section">
        <h3>Location</h3>
        <Row label="Move to matter">
          <select
            value={doc.matterId}
            onChange={(e) => void run("Moving…", () => moveDocument(doc, e.target.value, actor))}
          >
            {board.matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Row>
        <p className="scripta-document-note">
          Changing the matter moves this document immediately.
        </p>
      </section>

      <section className="scripta-document-section">
        <h3>Document record</h3>
        <dl className="scripta-document-record">
          <dt>Uploaded</dt>
          <dd>{relTime(doc.createdAt)}</dd>
          <dt>Uploaded by</dt>
          <dd>{doc.uploadedBy || "Not recorded"}</dd>
          {doc.lastEditedAt && (
            <>
              <dt>Last edited</dt>
              <dd>{relTime(doc.lastEditedAt)}</dd>
            </>
          )}
          {doc.date && (
            <>
              <dt>Document date</dt>
              <dd>{longDate(doc.date)}</dd>
            </>
          )}
        </dl>
        <Button
          disabled={busy}
          onClick={() =>
            void run(archived ? "Restoring…" : "Archiving…", () =>
              setArchived(doc, !archived, actor),
            )
          }
        >
          {archived ? "Restore" : "Archive"}
        </Button>
      </section>
      {unsavedDialog}
      {confirmDialog}
    </div>
  );
}
