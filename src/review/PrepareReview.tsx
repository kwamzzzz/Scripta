/**
 * Preparing a review from documents already on the matter.
 *
 * The intake wizard used to be the only way a contract became a clause
 * register, so a contract uploaded to an existing matter could be read but
 * never reviewed. This does the same two things the intake does, on documents
 * that are already filed: split one contract into clauses, or compare a later
 * version against an earlier one and record what changed.
 *
 * Only offered while the matter has no clauses, or when a lawyer asks for the
 * document to be read again. The register is rebuilt from scratch either way;
 * an assessment survives that only where its clause still reads word for word
 * the same, which `extractClauses` works out and reports back here.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/primitives";
import { diffDocuments, extractClauses } from "@/lib/documents.functions";
import type { Doc } from "@/data/legal";

export type Carried = {
  kept: number;
  assessmentsCarried: number;
  renumbered: number;
  toRead: number;
  /** Clauses drafted here, which the document does not contain. */
  drafted: number;
};

export default function PrepareReview({
  matterId,
  docs,
  onPrepared,
  onUpload,
}: {
  matterId: string;
  docs: Doc[];
  /**
   * Done. Given what a re-read managed to keep from the previous reading, so
   * the screen can say so — a re-read that silently kept the review looks
   * exactly like one that silently threw it away.
   */
  onPrepared: (carried?: Carried) => void;
  /** Where documents are added, for a matter that has none that can be read. */
  onUpload: () => void;
}) {
  const qc = useQueryClient();
  const extract = useServerFn(extractClauses);
  const diff = useServerFn(diffDocuments);
  const readable = docs.filter((d) => d.parseStatus === "parsed" && d.rawKind !== "transcript");
  // The likeliest document to review is the latest contract or amendment.
  const preferred =
    [...readable].reverse().find((d) => d.rawKind === "amendment" || d.rawKind === "contract") ??
    readable.at(-1);
  const [documentId, setDocumentId] = useState(preferred?.id ?? "");
  const [compareId, setCompareId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (readable.length === 0)
    return (
      <div className="rv-prepare">
        <p>
          {docs.some((d) => d.parseStatus === "pending" || d.parseStatus === "parsing")
            ? "Scripta is still reading the documents on this matter. The review can be prepared once they are read."
            : "There is no readable document on this matter yet. Upload the contract and the review can be prepared from it."}
        </p>
        <div>
          <Button onClick={onUpload}>Go to Documents</Button>
        </div>
      </div>
    );

  const prepare = async () => {
    if (!documentId || busy) return;
    setBusy(true);
    setError(null);
    try {
      let carried: Carried | undefined;
      if (compareId)
        await diff({ data: { matterId, originalId: compareId, amendmentId: documentId } });
      else {
        const out = await extract({ data: { matterId, documentId } });
        carried = {
          kept: out.kept,
          assessmentsCarried: out.assessmentsCarried,
          renumbered: out.renumbered,
          toRead: out.toRead,
          drafted: out.drafted,
        };
      }
      await qc.invalidateQueries();
      onPrepared(carried);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The review could not be prepared.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rv-prepare">
      <p>
        Choose the contract to review. To see what changed from an earlier version, choose that
        version too.
      </p>
      <label>
        <span>Contract to review</span>
        <select
          className="rv-input"
          value={documentId}
          onChange={(e) => {
            setDocumentId(e.target.value);
            if (e.target.value === compareId) setCompareId("");
          }}
        >
          {readable.map((d) => (
            <option key={d.id} value={d.id}>
              {[d.name, d.ver].filter(Boolean).join(" · ")}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Compare against</span>
        <select
          className="rv-input"
          value={compareId}
          onChange={(e) => setCompareId(e.target.value)}
        >
          <option value="">Nothing — review it on its own</option>
          {readable
            .filter((d) => d.id !== documentId)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {[d.name, d.ver].filter(Boolean).join(" · ")}
              </option>
            ))}
        </select>
      </label>
      {error && (
        <p className="rv-prepare-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <Button variant="primary" disabled={!documentId || busy} onClick={() => void prepare()}>
          {busy ? "Preparing…" : "Prepare the review"}
        </Button>
      </div>
    </div>
  );
}
