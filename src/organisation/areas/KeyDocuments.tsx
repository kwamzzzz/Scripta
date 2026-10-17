/**
 * Key documents: the organisation's own records.
 *
 * Constitutions, certificates, registers, resolutions, policies and licences
 * the firm holds for the client, on one shelf grouped the way a company
 * secretary files them. Each document says which records it evidences, so the
 * shelf and the registers point at each other. Documents on the client's
 * matters are not repeated here: they stay on those matters, under that
 * matter's confidentiality.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { quickAdd } from "@/lib/tasks/data";
import type { AreaProps } from "../area";
import {
  binClientDocument,
  linkDocument,
  setDocumentCategoryOrder,
  updateClientDocument,
} from "../db";
import {
  ORG_CATEGORY_LABEL,
  categoryLabel,
  KNOWN_CATEGORIES,
  shelfOrder,
  entityLabel,
  formatDay,
  liveEntities,
  type OrgCategory,
  type OrgDocument,
  type Organisation,
  type RecordType,
} from "../model";
import {
  Empty,
  ErrorLine,
  Field,
  OrgDialog,
  OrgPage,
  Panel,
  Select,
  SelectOrOther,
  TextInput,
  count,
  useOrgWrite,
} from "../ui";
import UploadDocumentDialog from "../dialogs/UploadDocumentDialog";
import DocThumb from "@/components/DocThumb";
import DocumentReader from "../components/DocumentReader";
import { documentGaps, recordLabel } from "../processes/documents";
import "../documents.css";

const CATEGORIES = Object.keys(ORG_CATEGORY_LABEL) as OrgCategory[];

const PARSE_LABEL: Record<string, string> = {
  pending: "Waiting to be read",
  parsing: "Being read",
  parsed: "",
  failed: "Could not be read",
};

/** The records a document is kept as evidence for, named. */
function citedBy(org: Organisation, documentId: string) {
  return org.recordDocuments
    .filter((l) => l.documentId === documentId)
    .map((l) => ({ link: l, target: recordLabel(org, l.recordType, l.recordId) }))
    .filter((x): x is typeof x & { target: NonNullable<typeof x.target> } => !!x.target);
}

export default function KeyDocuments({ org, client, go, openTab }: AreaProps) {
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<OrgCategory | "">("");
  const [open, setOpen] = useState<OrgCategory | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  /**
   * How the shelf is read.
   *
   * "Shelf" is the client's own order — the one they dragged, or the firm's
   * order where they have not — because the order a company secretary keeps is
   * a judgement about the client. The other two answer the questions a shelf
   * gets asked: where is the thing called X, and what came in last.
   */
  const [sort, setSort] = useState<"shelf" | "name" | "newest">("shelf");
  /** The group being dragged, while it is being dragged. */
  const [dragging, setDragging] = useState<string | null>(null);
  const [editing, setEditing] = useState<OrgDocument | null>(null);
  const [raised, setRaised] = useState<Set<string>>(new Set());
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const docs = org.documents.filter((d) => !filter || d.category === filter);
  /** Every shelf in use, the built-in ones and the client's own. */
  const inUse = useMemo(
    () => [...new Set(org.documents.map((d) => d.category ?? "other"))],
    [org.documents],
  );
  const grouped = useMemo(() => {
    const out = new Map<OrgCategory, OrgDocument[]>();
    for (const d of docs) {
      const c = d.category ?? "other";
      out.set(c, [...(out.get(c) ?? []), d]);
    }
    /* The client's order first, then the firm's, then anything else they have
       named, alphabetically — so a new shelf appears somewhere sensible rather
       than at the top. */
    const ordered = shelfOrder(org.categoryOrder, inUse);
    const groups = ordered
      .filter((c) => out.has(c))
      .map((c) => ({ category: c, docs: out.get(c)! }));
    if (sort === "name")
      return [...groups]
        .map((g) => ({ ...g, docs: [...g.docs].sort((a, b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => categoryLabel(a.category).localeCompare(categoryLabel(b.category)));
    if (sort === "newest") {
      const newest = (g: { docs: OrgDocument[] }) =>
        g.docs
          .map((d) => d.createdAt)
          .sort()
          .at(-1) ?? "";
      return [...groups]
        .map((g) => ({
          ...g,
          docs: [...g.docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        }))
        .sort((a, b) => newest(b).localeCompare(newest(a)));
    }
    return groups;
  }, [docs, inUse, org.categoryOrder, sort]);

  /** Drop a dragged shelf where it was let go, and remember the order. */
  const reorder = async (moved: OrgCategory, before: OrgCategory) => {
    if (moved === before) return;
    const current = shelfOrder(org.categoryOrder, inUse);
    const without = current.filter((c) => c !== moved);
    const at = without.indexOf(before);
    const next = [
      ...without.slice(0, at < 0 ? without.length : at),
      moved,
      ...without.slice(at < 0 ? without.length : at),
    ];
    await write.run(() => setDocumentCategoryOrder(org.clientId, next));
  };
  const gaps = documentGaps(org);

  // One line per entity rather than one per missing paper: the facts, stated
  // once, with one action that asks for whatever is missing.
  const byEntity = [...new Set(gaps.map((g) => g.entityId))].map((entityId) => ({
    entityId,
    entity: org.entities.find((e) => e.id === entityId),
    missing: gaps.filter((g) => g.entityId === entityId),
  }));
  const paper = (category: "constitution" | "certificate") =>
    category === "constitution" ? "constitution" : "certificate of incorporation";

  const requestTask = async (group: (typeof byEntity)[number]) => {
    const papers = group.missing.map((g) => paper(g.category)).join(" and ");
    const ok = await write.run(() =>
      quickAdd(org.workspaceId, {
        title: `Request the ${papers} of ${entityLabel(group.entity)} from the registrar`,
        detail: `${client.name}: no ${papers} is on file for ${group.entity?.name ?? "this entity"}.`,
        clientId: org.clientId,
      }),
    );
    if (ok) setRaised((prev) => new Set(prev).add(group.entityId));
  };

  const remove = async (d: OrgDocument) => {
    const links = citedBy(org, d.id).length;
    const confirmed = await confirmDelete({
      what: `“${d.name}”`,
      archivable: false,
      ...(links ? { consequence: `It stops being evidence for ${count(links, "record")}.` } : {}),
    });
    if (confirmed) await write.run(() => binClientDocument(d.id));
  };

  return (
    <OrgPage
      title="Key documents"
      subtitle={org.documents.length ? count(org.documents.length, "file") : "Nothing on file yet"}
      actions={
        <>
          {org.documents.length > 0 && (
            <>
              <Select
                value={filter}
                onChange={(v) => setFilter(v)}
                empty="All categories"
                /* Every shelf in use, the firm's and the client's own. */
                options={shelfOrder(org.categoryOrder, inUse)
                  .filter((c) => inUse.includes(c))
                  .map((c) => ({ value: c, label: categoryLabel(c) }))}
              />
              <Select
                value={sort}
                onChange={(v) => v && setSort(v)}
                options={[
                  { value: "shelf" as const, label: "In shelf order" },
                  { value: "name" as const, label: "By name" },
                  { value: "newest" as const, label: "Newest first" },
                ]}
              />
            </>
          )}
          <Button variant="primary" onClick={() => setUploading(true)}>
            Upload
          </Button>
        </>
      }
    >
      <ErrorLine error={write.error} />
      {org.documents.length === 0 ? (
        <Empty
          title="No documents on file for this client"
          body="Certificates of incorporation, constitutions, statutory registers, board minutes, policies and licences belong here. Each can be linked to the entity or licence it evidences."
          action={
            <Button variant="primary" onClick={() => setUploading(true)}>
              Upload a document
            </Button>
          }
        />
      ) : (
        <div className="dr-shelf">
          {grouped.map(({ category, docs: inCategory }) => {
            const newest = [...inCategory].sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt),
            )[0]!;
            const latest = newest.createdAt ?? "";
            const expanded = open === category || !!filter;
            return (
              <section
                key={category}
                className={`dr-shelf-group${expanded ? " is-open" : ""}${
                  dragging === category ? " is-dragging" : ""
                }`}
                /* Dragging is offered only in shelf order: in "by name" or
                   "newest" the order on screen is not the order being kept,
                   and a drag that appears to do nothing is worse than none. */
                draggable={sort === "shelf" && !filter}
                onDragStart={(event) => {
                  setDragging(category);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDragging(null)}
                onDragOver={(event) => dragging && event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const moved = dragging;
                  setDragging(null);
                  if (moved) void reorder(moved, category);
                }}
              >
                <button
                  type="button"
                  className="dr-tile"
                  aria-expanded={expanded}
                  onClick={() => setOpen(open === category ? null : category)}
                  title={
                    sort === "shelf" && !filter
                      ? "Drag to put this shelf where you keep it"
                      : undefined
                  }
                >
                  {/* The shelf wears its newest paper, so a closed shelf is
                      still recognisable. */}
                  <DocThumb
                    file={{ id: newest.id, fileRef: newest.storagePath }}
                    name={newest.name}
                    size={38}
                  />
                  <span className="dr-tile-text">
                    <strong>{categoryLabel(category)}</strong>
                    <span>
                      {count(inCategory.length, "file")}
                      {latest ? ` · latest ${formatDay(latest.slice(0, 10))}` : ""}
                    </span>
                  </span>
                </button>
                {expanded && (
                  <ul className="og-rows dr-doc-rows">
                    {inCategory.map((d) => {
                      const cited = citedBy(org, d.id);
                      return (
                        <li key={d.id}>
                          {/* Page one, small. A row of similar names is read by
                              its paper: the client's letterhead, a stamp, a
                              signature block. */}
                          <button
                            type="button"
                            className="dr-doc-thumb"
                            onClick={() => setReading(d.id)}
                            aria-label={`Open ${d.name}`}
                          >
                            {/* Big enough to recognise the paper — a letterhead,
                                a stamp, a table of figures — which is the whole
                                point of showing it. */}
                            <DocThumb
                              file={{ id: d.id, fileRef: d.storagePath }}
                              name={d.name}
                              meta={`Added ${formatDay(d.createdAt.slice(0, 10))}${
                                d.pageCount ? ` · ${count(d.pageCount, "page")}` : ""
                              }`}
                              size={58}
                            />
                          </button>
                          <div className="og-row-main">
                            <button
                              type="button"
                              className="dr-doc-name"
                              onClick={() => setReading(d.id)}
                            >
                              {d.name}
                            </button>
                            <span className="og-row-meta">
                              Added {formatDay(d.createdAt.slice(0, 10))}
                              {d.pageCount ? ` · ${count(d.pageCount, "page")}` : ""}
                              {PARSE_LABEL[d.parseStatus] ? ` · ${PARSE_LABEL[d.parseStatus]}` : ""}
                            </span>
                            {cited.length > 0 ? (
                              <span className="og-chips">
                                {cited.map(({ link, target }) => (
                                  <button
                                    key={link.id}
                                    type="button"
                                    className="og-chip"
                                    onClick={() =>
                                      go({ area: target.area, item: link.recordId, mode: null })
                                    }
                                  >
                                    {target.label}
                                    {link.page ? ` · p. ${link.page}` : ""}
                                  </button>
                                ))}
                              </span>
                            ) : (
                              <span className="og-row-meta">Not linked to a record</span>
                            )}
                          </div>
                          <div className="og-row-side">
                            <button
                              type="button"
                              className="org-link"
                              onClick={() => setEditing(d)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="org-link"
                              onClick={() => void remove(d)}
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {byEntity.length > 0 && (
        <Panel title="Not on file">
          <ul className="og-rows">
            {byEntity.map((group) => (
              <li key={group.entityId}>
                <div className="og-row-main">
                  <span className="og-row-title">{entityLabel(group.entity)}</span>
                  <span className="og-row-meta">
                    No {group.missing.map((g) => paper(g.category)).join(" or ")} linked
                  </span>
                </div>
                <div className="og-row-side">
                  {raised.has(group.entityId) ? (
                    <span className="og-row-meta" role="status">
                      Task added
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="org-link"
                      disabled={write.busy}
                      onClick={() => void requestTask(group)}
                    >
                      Create task
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <p className="og-hint">
        Documents on {client.name}’s matters stay on those matters, where the matter decides who
        reads them.{" "}
        <button type="button" className="org-link" onClick={() => openTab("documents")}>
          Matter documents
        </button>
      </p>

      {uploading && <UploadDocumentDialog org={org} open onClose={() => setUploading(false)} />}
      {editing && <EditDocumentDialog org={org} doc={editing} onClose={() => setEditing(null)} />}
      <DocumentReader documentId={reading} onClose={() => setReading(null)} />
      {confirmDialog}
    </OrgPage>
  );
}

type LinkTarget = `${RecordType}:${string}`;

/** Rename, recategorise, and link to a record the document evidences. */
function EditDocumentDialog({
  org,
  doc,
  onClose,
}: {
  org: Organisation;
  doc: OrgDocument;
  onClose: () => void;
}) {
  const [name, setName] = useState(doc.name);
  const [category, setCategory] = useState<OrgCategory>(doc.category ?? "other");
  /** The client's own words for a shelf; null while one from the list is in use. */
  const [ownCategory, setOwnCategory] = useState<string | null>(
    doc.category && !KNOWN_CATEGORIES.includes(doc.category as never) ? doc.category : null,
  );
  const [target, setTarget] = useState<LinkTarget | "">("");
  const [page, setPage] = useState("");
  const write = useOrgWrite(org.clientId);

  const targets: { value: LinkTarget; label: string }[] = [
    ...liveEntities(org).map((e) => ({
      value: `entity:${e.id}` as LinkTarget,
      label: `Entity · ${entityLabel(e)}`,
    })),
    ...org.licences
      .filter((l) => !l.archivedAt)
      .map((l) => ({ value: `licence:${l.id}` as LinkTarget, label: `Licence · ${l.name}` })),
    ...org.instruments.map((i) => ({
      value: `instrument:${i.id}` as LinkTarget,
      label: `Authority · ${i.title}`,
    })),
    ...org.processes
      .filter((p) => !p.archivedAt)
      .map((p) => ({ value: `process:${p.id}` as LinkTarget, label: `Process · ${p.name}` })),
    ...org.obligations
      .filter((o) => !o.archivedAt)
      .map((o) => ({
        value: `obligation:${o.id}` as LinkTarget,
        label: `Obligation · ${o.title}`,
      })),
  ];

  const submit = async () => {
    if (!name.trim()) {
      write.setError("A document needs a name.");
      return;
    }
    const ok = await write.run(async () => {
      if (name.trim() !== doc.name || category !== doc.category)
        await updateClientDocument(doc.id, {
          name: name.trim(),
          org_category: (ownCategory ?? "").trim() || category,
        });
      if (target) {
        const [recordType, recordId] = target.split(":") as [RecordType, string];
        const n = Number.parseInt(page, 10);
        await linkDocument(
          org,
          doc.id,
          recordType,
          recordId,
          Number.isFinite(n) && n > 0 ? n : null,
        );
      }
    });
    if (ok) onClose();
  };

  return (
    <OrgDialog
      open
      title="Edit document"
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Save"
      busy={write.busy}
      error={write.error}
    >
      <Field label="Name">
        <TextInput value={name} onChange={setName} autoFocus />
      </Field>
      <Field label="Category">
        <SelectOrOther
          value={category}
          onChange={(v) => v && setCategory(v)}
          options={CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
          custom={ownCategory}
          onCustomChange={setOwnCategory}
          otherLabel="Something else…"
          placeholder="e.g. Trust deeds"
        />
      </Field>
      <Field label="Keep as evidence for" hint="Optional. A document can evidence several records.">
        <Select value={target} onChange={setTarget} empty="No new link" options={targets} />
      </Field>
      {target && (
        <Field label="Page" hint="Where the fact is found, if it matters">
          <TextInput type="number" value={page} onChange={setPage} />
        </Field>
      )}
    </OrgDialog>
  );
}
