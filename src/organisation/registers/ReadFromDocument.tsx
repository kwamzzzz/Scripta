/**
 * Read facts from a document the client holds.
 *
 * Pick a document already on file or add one, and Scripta proposes values with
 * the page each came from. Nothing is written until the lawyer accepts a value;
 * a value read uncertainly is marked Check rather than Read.
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import { organisationKey, uploadClientDocument } from "../db";
import type { OrgCategory, Organisation } from "../model";
import type { ReadField } from "../read-fields.functions";
import { ErrorLine, Field, Select } from "../ui";
import { proposalBadge, type Proposal } from "./register";

/** Choose a client document, or add one, for reading. */
export function DocumentChooser({
  org,
  value,
  onChange,
  category,
  label = "Read from",
}: {
  org: Organisation;
  value: string | null;
  onChange: (documentId: string | null) => void;
  category: OrgCategory;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const docs = org.documents.map((d) => ({ value: d.id, label: d.name }));
  return (
    <div className="rg-chooser">
      <Field label={label}>
        <Select
          value={value ?? ""}
          onChange={(v) => onChange(v || null)}
          options={docs}
          empty="Choose a document on file"
        />
      </Field>
      <input
        ref={input}
        type="file"
        hidden
        accept=".pdf,.docx,.txt,.md"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            const id = await uploadClientDocument(org, file, category);
            await qc.invalidateQueries({ queryKey: organisationKey(org.clientId) });
            onChange(id);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "The document was not added.");
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button onClick={() => input.current?.click()} disabled={busy}>
        {busy ? "Adding…" : "Add a document"}
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}

export function Badge({ kind }: { kind: "Read" | "Check" | "Matched" | "Conflict" | "Accepted" }) {
  return <span className={`rg-badge is-${kind.toLowerCase()}`}>{kind}</span>;
}

/** Proposed values with Accept actions. */
export function ProposalList({
  fields,
  proposals,
  accepted,
  onAccept,
  onAcceptAll,
  display,
}: {
  fields: ReadField[];
  proposals: Proposal[];
  accepted: Set<string>;
  onAccept: (p: Proposal) => void;
  onAcceptAll: () => void;
  display?: (p: Proposal) => string;
}) {
  if (!proposals.length)
    return (
      <p className="og-muted rg-note">Nothing matching these facts was found in the document.</p>
    );
  const read = proposals.filter((p) => proposalBadge(p) === "Read");
  return (
    <div className="rg-proposals">
      <div className="rg-proposals-head">
        <span className="og-eyebrow">
          {proposals.length} found · {proposals.length - read.length} uncertain
        </span>
        <Button onClick={onAcceptAll} disabled={read.every((p) => accepted.has(p.key))}>
          Accept all read values
        </Button>
      </div>
      <ul className="og-rows">
        {proposals.map((p) => {
          const field = fields.find((f) => f.key === p.key);
          const done = accepted.has(p.key);
          return (
            <li key={p.key}>
              <div className="og-row-main">
                <span className="og-row-meta">{field?.label ?? p.key}</span>
                <span className="og-row-title">{display ? display(p) : p.value}</span>
                <span className="og-row-meta">
                  {p.page ? `Page ${p.page}` : "Page not identified"}
                </span>
              </div>
              <div className="og-row-side">
                <Badge kind={done ? "Accepted" : proposalBadge(p)} />
                {!done && <Button onClick={() => onAccept(p)}>Accept</Button>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="og-muted rg-note">
        Every accepted value keeps a link to the page it was read from.
      </p>
    </div>
  );
}
