/**
 * The documents behind one record.
 *
 * A registration number is worth more with the certificate it was read from
 * one click away, so every record that can cite a document shows its evidence
 * as chips that open it. Adding evidence files a new document to the client
 * and links it; linking reuses one the client already holds. Unlinking leaves
 * the document where it is.
 */
import { useState } from "react";
import { deleteRecord, linkDocument } from "../db";
import {
  ORG_CATEGORY_LABEL,
  categoryLabel,
  documentsFor,
  formatDay,
  type OrgDocument,
  type Organisation,
  type RecordType,
} from "../model";
import { ErrorLine, Select, useOrgWrite } from "../ui";
import UploadDocumentDialog from "../dialogs/UploadDocumentDialog";
import DocumentReader from "./DocumentReader";
import "../documents.css";

export default function RecordDocuments({
  org,
  recordType,
  recordId,
  label,
  readOnly,
}: {
  org: Organisation;
  recordType: RecordType;
  recordId: string;
  label: string;
  /** Hide the add/link action (read-only surfaces). */
  readOnly?: boolean;
}) {
  const [reading, setReading] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);
  const write = useOrgWrite(org.clientId);
  const cited = documentsFor(org, recordType, recordId);
  const citedIds = new Set(cited.map((c) => c.link.documentId));
  const linkable = org.documents.filter((d) => !citedIds.has(d.id) && !d.archivedAt);

  return (
    <div className="dr-record">
      {cited.length === 0 ? (
        <p className="og-hint dr-record-none">No document on file.</p>
      ) : (
        <ul className="dr-record-list">
          {cited.map(({ link, document }) => (
            <li key={link.id}>
              {document ? (
                <button
                  type="button"
                  className="og-chip is-source"
                  onClick={() => setReading(document.id)}
                >
                  {document.name}
                  {link.page ? ` · p. ${link.page}` : ""}
                </button>
              ) : (
                // The link survives but the reader cannot open what it points at.
                <span className="og-chip">Document not available to you</span>
              )}
              {!readOnly && (
                <button
                  type="button"
                  className="dr-unlink"
                  aria-label={`Unlink ${document?.name ?? "document"} from ${label}`}
                  title="Unlink (the document stays with the client)"
                  disabled={write.busy}
                  onClick={() =>
                    void write.run(() => deleteRecord("org_record_documents", link.id))
                  }
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="dr-record-actions">
          <button type="button" className="org-link" onClick={() => setAdding(true)}>
            Add document
          </button>
          {linkable.length > 0 && !linking && (
            <button type="button" className="org-link" onClick={() => setLinking(true)}>
              Link one on file
            </button>
          )}
          {linking && (
            <span className="dr-link-pick">
              <Select
                value=""
                empty="Choose a document…"
                options={linkable.map((d) => ({ value: d.id, label: d.name }))}
                onChange={(id) => {
                  if (!id) return;
                  void write
                    .run(() => linkDocument(org, id, recordType, recordId))
                    .then(() => setLinking(false));
                }}
              />
              <button type="button" className="org-link" onClick={() => setLinking(false)}>
                Cancel
              </button>
            </span>
          )}
        </div>
      )}
      <ErrorLine error={write.error} />
      {adding && (
        <UploadDocumentDialog
          org={org}
          open
          onClose={() => setAdding(false)}
          link={{ recordType, recordId, label }}
          defaultCategory={
            recordType === "licence"
              ? "licence"
              : recordType === "instrument"
                ? "policy"
                : recordType === "entity"
                  ? "certificate"
                  : "other"
          }
        />
      )}
      <DocumentReader documentId={reading} onClose={() => setReading(null)} />
    </div>
  );
}

/**
 * The client's own documents, on the client's Documents tab, above the
 * documents on its matters. Read from the organisation the page already loads.
 */
export function ClientHeldDocuments({
  documents,
  onOpenShelf,
}: {
  documents: OrgDocument[] | null;
  onOpenShelf: () => void;
}) {
  const [reading, setReading] = useState<string | null>(null);
  if (!documents?.length) return null;
  return (
    <section className="dr-held" aria-label="Held for the client">
      <div className="dr-held-head">
        <h3>Held for the client</h3>
        <button type="button" className="org-link" onClick={onOpenShelf}>
          Key documents
        </button>
      </div>
      <ul className="org-list">
        {documents.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => setReading(d.id)}>
              <span className="org-list-title">{d.name}</span>
              <span className="org-list-meta">
                {[
                  d.category ? categoryLabel(d.category) : "",
                  formatDay(d.createdAt.slice(0, 10)),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <h3 className="dr-held-sub">On its matters</h3>
      <DocumentReader documentId={reading} onClose={() => setReading(null)} />
    </section>
  );
}
