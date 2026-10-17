/**
 * Add or edit an entity in the client's group.
 *
 * The facts can be typed, or read from a filing — the certificate of
 * incorporation, the company details form. A value read from a document keeps
 * that document and page as its source. Where a value already came from a
 * different document and the new one disagrees, the recorded value stays and
 * the disagreement is kept as a conflict for the lawyer to resolve.
 */
import { useState } from "react";
import { Button } from "@/components/primitives";
import { insertRecord, linkDocument, setRecordArchived, updateRecord } from "../db";
import {
  ENTITY_STATUS_LABEL,
  type ChangeContext,
  type Entity,
  type EntityStatus,
  type FieldSources,
  type Organisation,
} from "../model";
import {
  ChangeFields,
  ErrorLine,
  Field,
  FieldRow,
  OrgDialog,
  Select,
  TextArea,
  TextInput,
  useOrgWrite,
} from "../ui";
import { DocumentChooser, ProposalList } from "../registers/ReadFromDocument";
import { useReadFields } from "../registers/hooks";
import { acceptProposal, proposalBadge, type Proposal } from "../registers/register";
import { ENTITY_FIELDS, type EntityDraft as Draft } from "../registers/labels";
import { useDeleteEntity } from "./useDeleteEntity";
import "../registers.css";

const draftOf = (e: Entity | null, name = ""): Draft => ({
  name: e?.name ?? name,
  shortName: e?.shortName ?? "",
  entityType: e?.entityType ?? "",
  jurisdiction: e?.jurisdiction ?? "",
  registrationNo: e?.registrationNo ?? "",
  taxNo: e?.taxNo ?? "",
  incorporatedOn: e?.incorporatedOn ?? "",
  registeredOffice: e?.registeredOffice ?? "",
  activity: e?.activity ?? "",
  shareCapital: e?.shareCapital ?? "",
  status: e?.status ?? "active",
  notes: e?.notes ?? "",
});

const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export default function EntityDialog({
  org,
  entity,
  open,
  onClose,
  onSaved,
  onDeleted,
  defaults,
}: {
  org: Organisation;
  entity: Entity | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  onDeleted?: () => void;
  defaults?: { proposedChangeId?: string | null; name?: string };
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(entity, defaults?.name ?? ""));
  const [sources, setSources] = useState<FieldSources>(() => entity?.fieldSources ?? {});
  const [change, setChange] = useState<ChangeContext>({});
  const [reading, setReading] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [conflicts, setConflicts] = useState<string[]>([]);
  const write = useOrgWrite(org.clientId);
  const reader = useReadFields();
  const deleting = useDeleteEntity(org);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // Folds several acceptances into one state update, so "accept all" does not
  // read the same stale sources for every field.
  const acceptAll = (list: Proposal[]) => {
    if (!documentId || !list.length) return;
    let nextDraft = draft;
    let nextSources = sources;
    const clashed: string[] = [];
    for (const p of list) {
      const key = p.key as keyof Draft;
      if (key === "status") continue;
      const value = key === "incorporatedOn" ? isoDate(p.value) || p.value : p.value;
      const result = acceptProposal(
        String(nextDraft[key] ?? ""),
        nextSources,
        { ...p, value },
        documentId,
      );
      nextSources = result.sources;
      if (result.conflict) clashed.push(ENTITY_FIELDS.find((f) => f.key === key)?.label ?? key);
      else if (key !== "incorporatedOn" || isoDate(value))
        nextDraft = { ...nextDraft, [key]: value };
    }
    setDraft(nextDraft);
    setSources(nextSources);
    if (clashed.length) setConflicts((c) => [...c.filter((x) => !clashed.includes(x)), ...clashed]);
    setAccepted((a) => {
      const next = new Set(a);
      list.forEach((p) => next.add(p.key));
      return next;
    });
  };

  const save = async () => {
    if (!draft.name.trim()) {
      write.setError("An entity needs a name.");
      return;
    }
    const row = {
      name: draft.name.trim(),
      short_name: draft.shortName.trim(),
      entity_type: draft.entityType.trim(),
      jurisdiction: draft.jurisdiction.trim(),
      registration_no: draft.registrationNo.trim(),
      tax_no: draft.taxNo.trim(),
      incorporated_on: draft.incorporatedOn || null,
      registered_office: draft.registeredOffice.trim(),
      activity: draft.activity.trim(),
      share_capital: draft.shareCapital.trim(),
      status: draft.status,
      notes: draft.notes,
      field_sources: sources,
    };
    let id = entity?.id ?? "";
    const ok = await write.run(async () => {
      if (entity) await updateRecord("org_entities", entity.id, row, change);
      else
        id = await insertRecord(
          org,
          "org_entities",
          { ...row, proposed_change_id: defaults?.proposedChangeId ?? null },
          change,
        );
      // A document facts were read from is evidence for the entity.
      const read = new Map<string, number | null>();
      for (const src of Object.values(sources))
        if (src.documentId && !read.has(src.documentId)) read.set(src.documentId, src.page);
      for (const [docId, page] of read) await linkDocument(org, docId, "entity", id, page);
    });
    if (ok) {
      onSaved?.(id);
      onClose();
    }
  };

  const toggleArchive = async () => {
    if (!entity) return;
    const ok = await write.run(() =>
      setRecordArchived("org_entities", entity.id, !entity.archivedAt),
    );
    if (ok) onClose();
  };

  return (
    <>
      {deleting.confirmDialog}
      <OrgDialog
        open={open}
        width={640}
        title={
          entity
            ? `Edit ${entity.name}`
            : defaults?.proposedChangeId
              ? "Add a proposed entity"
              : "Add an entity"
        }
        blurb={
          defaults?.proposedChangeId && !entity
            ? "Part of the target structure only. It does not appear in the current structure or the register."
            : undefined
        }
        onClose={onClose}
        onSubmit={save}
        submitLabel={entity ? "Save" : "Add entity"}
        busy={write.busy || reader.state !== "idle"}
        error={write.error ?? deleting.error}
        extra={
          entity && (
            <>
              <Button variant="quiet" onClick={() => void toggleArchive()}>
                {entity.archivedAt ? "Restore" : "Archive"}
              </Button>
              <Button
                variant="quiet"
                disabled={deleting.busy}
                onClick={() =>
                  void deleting.remove(entity).then((gone) => {
                    if (!gone) return;
                    onClose();
                    onDeleted?.();
                  })
                }
              >
                Delete
              </Button>
            </>
          )
        }
      >
        <div className="rg-read">
          {!reading ? (
            <button type="button" className="org-link" onClick={() => setReading(true)}>
              Read facts from a filing
            </button>
          ) : (
            <div className="rg-read-body">
              <DocumentChooser
                org={org}
                value={documentId}
                category="certificate"
                onChange={(id) => {
                  setDocumentId(id);
                  setProposals(null);
                  setAccepted(new Set());
                }}
              />
              <div>
                <Button
                  disabled={!documentId || reader.state !== "idle"}
                  onClick={async () => {
                    if (!documentId) return;
                    const found = await reader.run(
                      org,
                      documentId,
                      ENTITY_FIELDS,
                      "A company filing: certificate of incorporation, registration form or annual return.",
                    );
                    if (found) setProposals(found);
                  }}
                >
                  {reader.state === "parsing"
                    ? "Opening the document…"
                    : reader.state === "reading"
                      ? "Reading…"
                      : "Read facts"}
                </Button>
              </div>
              <ErrorLine error={reader.error} />
              {proposals && (
                <ProposalList
                  fields={ENTITY_FIELDS}
                  proposals={proposals}
                  accepted={accepted}
                  onAccept={(p) => acceptAll([p])}
                  onAcceptAll={() =>
                    acceptAll(
                      proposals.filter((p) => proposalBadge(p) === "Read" && !accepted.has(p.key)),
                    )
                  }
                />
              )}
              {conflicts.length > 0 && (
                <p className="rg-flag" role="status">
                  Kept the recorded value for {conflicts.join(", ")}: this document disagrees with
                  the one it came from. The disagreement is saved on the record.
                </p>
              )}
            </div>
          )}
        </div>
        <Field label="Registered name">
          <TextInput value={draft.name} onChange={(v) => set("name", v)} autoFocus={!entity} />
        </Field>
        <FieldRow>
          <Field label="Short name" hint="Used on charts, e.g. Nexis GH">
            <TextInput value={draft.shortName} onChange={(v) => set("shortName", v)} />
          </Field>
          <Field label="Type">
            <TextInput
              value={draft.entityType}
              onChange={(v) => set("entityType", v)}
              placeholder="Private limited"
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Jurisdiction">
            <TextInput
              value={draft.jurisdiction}
              onChange={(v) => set("jurisdiction", v)}
              placeholder="Ghana"
            />
          </Field>
          <Field label="Status">
            <Select
              value={draft.status}
              onChange={(v) => set("status", (v || "active") as EntityStatus)}
              options={(Object.keys(ENTITY_STATUS_LABEL) as EntityStatus[]).map((k) => ({
                value: k,
                label: ENTITY_STATUS_LABEL[k],
              }))}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Registration no.">
            <TextInput value={draft.registrationNo} onChange={(v) => set("registrationNo", v)} />
          </Field>
          <Field label="Tax no. (TIN)">
            <TextInput value={draft.taxNo} onChange={(v) => set("taxNo", v)} />
          </Field>
          <Field label="Incorporated">
            <TextInput
              type="date"
              value={draft.incorporatedOn}
              onChange={(v) => set("incorporatedOn", v)}
            />
          </Field>
        </FieldRow>
        <Field label="Registered office">
          <TextArea
            rows={2}
            value={draft.registeredOffice}
            onChange={(v) => set("registeredOffice", v)}
          />
        </Field>
        <Field label="Objects & activity">
          <TextArea rows={2} value={draft.activity} onChange={(v) => set("activity", v)} />
        </Field>
        <Field label="Share capital">
          <TextInput value={draft.shareCapital} onChange={(v) => set("shareCapital", v)} />
        </Field>
        <Field label="Notes">
          <TextArea rows={2} value={draft.notes} onChange={(v) => set("notes", v)} />
        </Field>
        <ChangeFields value={change} onChange={setChange} />
      </OrgDialog>
    </>
  );
}
