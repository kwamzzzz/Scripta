/**
 * Add a document the client holds.
 *
 * It goes into Scripta's one document repository, filed to the client rather
 * than to a matter, and — when it is opened from a record — is linked to that
 * record as its evidence in the same step. Reading the text happens after the
 * dialog closes: a slow parse must not hold the lawyer at a spinner.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { parseDocument } from "@/lib/documents.functions";
import { ACCEPT_ATTR, fileTypeError } from "@/lib/parsing/mime";
import { linkDocument, organisationKey, updateClientDocument, uploadClientDocument } from "../db";
import {
  categoryLabel,
  KNOWN_CATEGORIES,
  type OrgCategory,
  type Organisation,
  type RecordType,
} from "../model";
import { Field, OrgDialog, SelectOrOther, TextInput } from "../ui";
import "../documents.css";

/** Categories this client already uses, so a word typed once is offered next time. */
const usedCategories = (org: Organisation): OrgCategory[] => [
  ...new Set(org.documents.map((d) => d.category).filter((c): c is OrgCategory => !!c)),
];

const CATEGORY_OPTIONS = KNOWN_CATEGORIES.map((value) => ({
  value: value as OrgCategory,
  label: categoryLabel(value),
}));

export default function UploadDocumentDialog({
  org,
  open,
  onClose,
  defaultCategory,
  link,
  onUploaded,
}: {
  org: Organisation;
  open: boolean;
  onClose: () => void;
  defaultCategory?: OrgCategory;
  link?: { recordType: RecordType; recordId: string; label: string };
  onUploaded?: (documentId: string) => void;
}) {
  const qc = useQueryClient();
  const parse = useServerFn(parseDocument);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<OrgCategory>(defaultCategory ?? "other");
  /** A shelf of the client's own naming; null while one from the list is in use. */
  const [ownCategory, setOwnCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const choose = (next: File | null) => {
    setError(null);
    if (!next) return setFile(null);
    const problem = fileTypeError(next);
    if (problem) {
      setFile(null);
      setError(problem);
      return;
    }
    setFile(next);
  };

  const submit = async () => {
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const filed = (ownCategory ?? "").trim() || category;
      const id = await uploadClientDocument(org, file, filed);
      if (name.trim() && name.trim() !== file.name.replace(/\.[^.]+$/, ""))
        await updateClientDocument(id, { name: name.trim() });
      if (link) await linkDocument(org, id, link.recordType, link.recordId);
      await qc.invalidateQueries({ queryKey: organisationKey(org.clientId) });
      onUploaded?.(id);
      onClose();
      // Read the text in the background; the document is already filed.
      void parse({ data: { documentId: id } })
        .catch(() => undefined)
        .finally(() => void qc.invalidateQueries({ queryKey: organisationKey(org.clientId) }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document was not added.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <OrgDialog
      open={open}
      title="Add a document"
      blurb={
        link
          ? `Filed to the client and kept as evidence for ${link.label}.`
          : "Filed to the client, not to a matter. Everyone in the workspace can read it."
      }
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Add document"
      busy={busy}
      error={error}
    >
      <label
        className={`dr-drop${dragging ? " is-over" : ""}${file ? " has-file" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files[0] ?? null);
        }}
      >
        <input
          type="file"
          accept={ACCEPT_ATTR}
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
        />
        <strong>{file ? file.name : "Drop the file here, or choose one"}</strong>
        <span>
          {file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : "PDF, Word or text"}
        </span>
      </label>
      {/* The eleven shelves are offered; the last choice is the client's own
          words, because a shelf you cannot label is somebody else's shelf. */}
      <Field label="Category">
        <SelectOrOther
          value={category}
          onChange={(v) => v && setCategory(v)}
          options={[
            ...CATEGORY_OPTIONS,
            ...usedCategories(org).map((c) => ({ value: c, label: categoryLabel(c) })),
          ].filter((o, at, all) => all.findIndex((x) => x.value === o.value) === at)}
          custom={ownCategory}
          onCustomChange={setOwnCategory}
          otherLabel="Something else…"
          placeholder="e.g. Trust deeds"
        />
      </Field>
      <Field label="Name" hint="Leave blank to use the file name">
        <TextInput
          value={name}
          onChange={setName}
          placeholder={file?.name.replace(/\.[^.]+$/, "") ?? ""}
        />
      </Field>
    </OrgDialog>
  );
}
