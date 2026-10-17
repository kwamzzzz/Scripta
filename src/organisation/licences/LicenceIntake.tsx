/**
 * Adding a licence, with the document or without it.
 *
 * Both paths produce the same Licence record, so the renewal reminder and the
 * calendar entry follow either way. Read from a document, each value is a
 * proposal with its page and a Read or Check mark, and nothing is taken until
 * it is accepted. Entered by hand, the record is saved unverified with its gaps
 * listed, so the register shows what it does not know instead of looking
 * complete.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/primitives";
import { quickAdd } from "@/lib/tasks/data";
import type { AreaProps } from "../area";
import { insertRecord, linkDocument } from "../db";
import { addDays, entityLabel, formatDay, type FieldSources, type LicenceType } from "../model";
import type { ReadField } from "../read-fields.functions";
import { ErrorLine, Eyebrow, Segmented, useOrgWrite } from "../ui";
import { Badge, DocumentChooser } from "../registers/ReadFromDocument";
import { useReadFields } from "../registers/hooks";
import { matchEntity, proposalBadge, type Proposal } from "../registers/register";
import { LicenceFields } from "./form";
import { draftForType, draftGaps, rowFromDraft, type LicenceDraft } from "./draft";
import "../registers.css";

const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : "");

type Row = Proposal & { accepted: boolean; matchedEntityId: string | null };

export default function LicenceIntake({ org, go }: AreaProps) {
  const types = org.licenceTypes;
  const [typeKey, setTypeKey] = useState(types[0]?.key ?? "other");
  const type: LicenceType | undefined = types.find((t) => t.key === typeKey);
  const [path, setPath] = useState<"document" | "manual">("document");
  const [draft, setDraft] = useState<LicenceDraft>(() => draftForType(type));
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reader = useReadFields();
  const write = useOrgWrite(org.clientId);

  const fields: ReadField[] = useMemo(
    () =>
      (type?.fields ?? []).map((f) => ({ key: f.key, label: f.label, type: f.type, hint: f.hint })),
    [type],
  );
  const gaps = draftGaps(draft, types);

  const chooseType = (key: string) => {
    const next = types.find((t) => t.key === key);
    setTypeKey(key);
    setDraft((d) => ({
      ...draftForType(next),
      // Keep what the lawyer already typed; take the new type's defaults otherwise.
      name:
        d.name !== draftForType(types.find((t) => t.key === d.typeKey)).name
          ? d.name
          : draftForType(next).name,
      entityId: d.entityId,
      authority: d.authority,
      reference: d.reference,
      originalLocation: d.originalLocation,
    }));
    setRows(null);
  };

  /** Apply accepted proposals to the draft, recording where each came from. */
  const apply = (accept: Row[]) => {
    if (!documentId) return;
    let next = { ...draft };
    const sources: FieldSources = { ...next.fieldSources };
    for (const r of accept) {
      const source = { value: r.value, documentId, page: r.page, confidence: r.confidence };
      switch (r.key) {
        case "authority":
          next.authority = r.value;
          break;
        case "reference":
          next.reference = r.value;
          break;
        case "entity":
          if (!r.matchedEntityId) continue;
          next.entityId = r.matchedEntityId;
          break;
        case "issued_on":
          if (isoDate(r.value)) next = { ...next, issuedOn: isoDate(r.value), issuedNote: "" };
          else next.issuedNote = r.value;
          break;
        case "expires_on":
          if (!isoDate(r.value)) continue;
          next.expiresOn = isoDate(r.value);
          break;
        case "permitted":
          next.conditions = next.conditions.includes(r.value)
            ? next.conditions
            : [`Permitted: ${r.value}`, next.conditions].filter(Boolean).join("\n");
          break;
        case "conditions":
          next.conditions = next.conditions.includes(r.value)
            ? next.conditions
            : [next.conditions, r.value].filter(Boolean).join("\n");
          break;
        case "recurring_note":
          next.recurringNote = r.value;
          break;
        default:
          continue;
      }
      sources[r.key] = source;
    }
    next.fieldSources = sources;
    setDraft(next);
    setRows(
      (rs) =>
        rs && rs.map((x) => (accept.some((a) => a.key === x.key) ? { ...x, accepted: true } : x)),
    );
  };

  const read = async () => {
    if (!documentId) return;
    const found = await reader.run(
      org,
      documentId,
      fields,
      `A licence or registration: ${type?.label ?? "licence"}.`,
    );
    if (!found) return;
    setRows(
      found.map((p) => {
        const matched = p.key === "entity" ? matchEntity(org, p.value) : null;
        return { ...p, accepted: false, matchedEntityId: matched?.id ?? null };
      }),
    );
  };

  const save = async (verified: boolean) => {
    if (!draft.name.trim()) return write.setError("Name the licence.");
    let id = "";
    const ok = await write.run(async () => {
      id = await insertRecord(org, "org_licences", rowFromDraft({ ...draft, verified }));
      if (documentId && path === "document") {
        const pages = Object.values(draft.fieldSources)
          .filter((s) => s.documentId === documentId && s.page)
          .map((s) => s.page!);
        await linkDocument(
          org,
          documentId,
          "licence",
          id,
          pages.length ? Math.min(...pages) : null,
        );
      }
    });
    if (ok) go({ area: "licences", item: id, mode: null });
  };

  const requestCopy = async () => {
    if (!draft.name.trim()) return write.setError("Name the licence first.");
    const holder = entityLabel(org.entities.find((e) => e.id === draft.entityId));
    const ok = await write.run(() =>
      quickAdd(org.workspaceId, {
        title: `Request a certified copy of the ${draft.name.trim()}${holder ? ` — ${holder}` : ""}`,
        detail: [
          draft.authority ? `Authority: ${draft.authority}.` : "",
          draft.reference ? `Licence number: ${draft.reference}.` : "Licence number not known.",
          draft.originalLocation ? `Original said to be kept at: ${draft.originalLocation}.` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        clientId: org.clientId,
        priority: "normal",
      }),
    );
    if (ok) setNotice("A task to request a certified copy is in Tasks.");
  };

  const readCount = rows?.filter((r) => proposalBadge(r) === "Read").length ?? 0;

  return (
    <div className="rg-intake">
      <header className="og-page-head">
        <div className="og-page-title">
          <p className="rg-crumb">
            <button type="button" className="org-link" onClick={() => go({ mode: null })}>
              Licences & registrations
            </button>{" "}
            / Add a licence
          </p>
          <h2>Add a licence</h2>
        </div>
        <div className="og-page-actions">
          <Button onClick={() => go({ mode: null })}>Cancel</Button>
          {path === "document" && (
            <Button
              variant="primary"
              disabled={write.busy}
              onClick={() =>
                void save(gaps.length === 0 && Object.keys(draft.fieldSources).length > 0)
              }
            >
              Save licence
            </Button>
          )}
        </div>
      </header>
      <div className="rg-intake-body">
        <nav className="rg-types" aria-label="Licence type">
          <Eyebrow>What are you adding?</Eyebrow>
          {types.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={t.key === typeKey}
              onClick={() => chooseType(t.key)}
            >
              {t.label}
            </button>
          ))}
          {type && (
            <div className="rg-template">
              <Eyebrow>Field template</Eyebrow>
              <p>
                For {type.label.toLowerCase()} Scripta expects{" "}
                {type.fields
                  .filter((f) => f.required)
                  .map((f) => f.label.toLowerCase())
                  .join(", ")}
                {type.hasExpiry
                  ? `, and a renewal lead time (${type.defaultLeadDays} days by default)`
                  : ""}
                .
              </p>
            </div>
          )}
        </nav>
        <div className="rg-intake-main">
          <Segmented
            label="How you are adding it"
            value={path}
            onChange={setPath}
            options={[
              { id: "document", label: "I have the document" },
              { id: "manual", label: "I don't have it yet" },
            ]}
          />
          {path === "document" ? (
            <>
              <section className="og-panel">
                <div className="og-panel-body rg-drop">
                  <DocumentChooser
                    org={org}
                    value={documentId}
                    category="licence"
                    label="The licence, certificate or renewal receipt"
                    onChange={(id) => {
                      setDocumentId(id);
                      setRows(null);
                    }}
                  />
                  <div>
                    <Button
                      variant="primary"
                      disabled={!documentId || reader.state !== "idle"}
                      onClick={() => void read()}
                    >
                      {reader.state === "parsing"
                        ? "Opening the document…"
                        : reader.state === "reading"
                          ? "Reading…"
                          : "Read the licence"}
                    </Button>
                  </div>
                  <ErrorLine error={reader.error} />
                </div>
              </section>
              {rows && (
                <section className="og-panel">
                  <header className="og-panel-head">
                    <h3>
                      Read from{" "}
                      {org.documents.find((d) => d.id === documentId)?.name ?? "the document"}
                    </h3>
                    <span className="og-eyebrow">
                      {rows.length} fields · {rows.length - readCount} uncertain
                    </span>
                  </header>
                  <div className="og-panel-body">
                    {rows.length === 0 ? (
                      <p className="og-muted rg-note">
                        None of this type's fields were found in the document. Enter them below.
                      </p>
                    ) : (
                      <table className="og-table rg-fields">
                        <tbody>
                          {fields
                            .map((f) => ({ f, r: rows.find((x) => x.key === f.key) }))
                            .filter((x): x is { f: ReadField; r: Row } => !!x.r)
                            .map(({ f, r }) => {
                              const badge =
                                r.key === "entity"
                                  ? r.matchedEntityId
                                    ? "Matched"
                                    : "Check"
                                  : proposalBadge(r);
                              return (
                                <tr
                                  key={f.key}
                                  className={badge === "Check" ? "is-check" : undefined}
                                >
                                  <td className="og-muted">{f.label}</td>
                                  <td>
                                    <input
                                      className="rg-field-input"
                                      aria-label={f.label}
                                      value={r.value}
                                      onChange={(e) =>
                                        setRows(
                                          (rs) =>
                                            rs &&
                                            rs.map((x) =>
                                              x.key === r.key
                                                ? {
                                                    ...x,
                                                    value: e.target.value,
                                                    accepted: false,
                                                    matchedEntityId:
                                                      x.key === "entity"
                                                        ? (matchEntity(org, e.target.value)?.id ??
                                                          null)
                                                        : null,
                                                  }
                                                : x,
                                            ),
                                        )
                                      }
                                    />
                                    {r.key === "entity" && !r.matchedEntityId && (
                                      <span className="og-hint">
                                        No recorded entity by that name. Choose the holder below.
                                      </span>
                                    )}
                                    {r.key === "expires_on" && !isoDate(r.value) && (
                                      <span className="og-hint">
                                        Not a full date. Give the expiry below.
                                      </span>
                                    )}
                                  </td>
                                  <td className="og-muted">{r.page ? `p. ${r.page}` : ""}</td>
                                  <td>
                                    <Badge kind={r.accepted ? "Accepted" : badge} />
                                  </td>
                                  <td>
                                    {!r.accepted && (
                                      <button
                                        type="button"
                                        className="org-link"
                                        onClick={() => apply([r])}
                                      >
                                        Accept
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    )}
                    <div className="rg-actions rg-fields-foot">
                      <span className="og-muted">
                        Every field keeps a link to the page it was read from.
                      </span>
                      <Button
                        variant="primary"
                        disabled={!rows.some((r) => !r.accepted && proposalBadge(r) === "Read")}
                        onClick={() =>
                          apply(rows.filter((r) => !r.accepted && proposalBadge(r) === "Read"))
                        }
                      >
                        Accept all read fields
                      </Button>
                    </div>
                  </div>
                </section>
              )}
              <section className="og-panel">
                <header className="og-panel-head">
                  <h3>The licence record</h3>
                  <span className="og-eyebrow">
                    {gaps.length ? `${gaps.length} gap${gaps.length === 1 ? "" : "s"}` : "complete"}
                  </span>
                </header>
                <div className="og-panel-body rg-form">
                  <LicenceFields org={org} draft={draft} onChange={setDraft} />
                </div>
              </section>
              <p className="og-muted rg-note">
                Saving puts the expiry on the compliance calendar and opens the renewal window{" "}
                {draft.expiresOn && Number(draft.renewalLeadDays) >= 0
                  ? `on ${formatDay(addDays(draft.expiresOn, -Number(draft.renewalLeadDays)))}`
                  : "at the renewal lead time before expiry"}
                . It is saved verified only when its required fields are complete and read from the
                document.
              </p>
            </>
          ) : (
            <section className="og-panel">
              <header className="og-panel-head">
                <h3>No document? Enter what you know</h3>
              </header>
              <div className="og-panel-body rg-form">
                <p className="og-muted rg-note">
                  The record is created as unverified. Fields left blank stay visible as gaps.
                </p>
                <LicenceFields org={org} draft={draft} onChange={setDraft} />
                <p className="rg-flag" role="status">
                  Marked <strong>unverified</strong>
                  {gaps.length
                    ? ` · ${gaps.length} gap${gaps.length === 1 ? "" : "s"}: ${gaps.map((g) => g.label.toLowerCase()).join(", ")}`
                    : ""}
                  . Add the document when it is found to verify it.
                </p>
                {notice && (
                  <p className="og-muted rg-note" role="status">
                    {notice}
                  </p>
                )}
                <div className="rg-actions">
                  <Button variant="primary" disabled={write.busy} onClick={() => void save(false)}>
                    Save as unverified
                  </Button>
                  <Button disabled={write.busy} onClick={() => void requestCopy()}>
                    Request copy
                  </Button>
                </div>
              </div>
            </section>
          )}
          <ErrorLine error={write.error} />
        </div>
      </div>
    </div>
  );
}
