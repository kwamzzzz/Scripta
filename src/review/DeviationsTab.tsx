/**
 * Deviations: the schedule a bidder returns with its tender.
 *
 * A buyer sends a form of agreement and a blank schedule of deviations. The
 * bidder marks the agreement up and is asked to list, clause by clause, what
 * it changed and why. Doing that by hand on a contract with several hundred
 * tracked changes takes a day and is the kind of work where one missed
 * deletion is the whole problem.
 *
 * Both files are zips, so the entire read happens in this browser. Nothing is
 * uploaded to produce the schedule, which matters: the redline is privileged
 * and the tender is confidential.
 */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileSpreadsheet, FileText, Check, PenLine, X } from "lucide-react";
import { Button } from "@/components/primitives";
import { identity, space } from "@/lib/tokens";
import { Card, Empty, Eyebrow } from "./ui";
import {
  checkSchedule,
  describeAll,
  fillSchedule,
  buildDeviationsDocx,
  buildDeviationsXlsx,
  mergeJustifications,
  readRedline,
  type ExportFormat,
  type Check as ScheduleCheck,
  type ReadRedline,
} from "@/lib/deviations";
import { draftJustifications, justificationProvider } from "@/lib/deviations/justify.functions";

const DEFAULT_BIDDER = "";

const field: React.CSSProperties = {
  border: `1px solid ${identity.inputEdge}`,
  borderRadius: 4,
  padding: "8px 10px",
  fontSize: 13,
  color: identity.ink,
  background: identity.paper,
};

/** The template asks the bidder to date the justification column's heading. */
const today = () =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function Drop({
  label,
  hint,
  accept,
  file,
  onPick,
  icon,
}: {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onPick: (file: File) => void;
  icon: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped) onPick(dropped);
      }}
      onClick={() => input.current?.click()}
      style={{
        border: `1px ${file ? "solid" : "dashed"} ${over ? identity.teal : file ? identity.teal : identity.inputEdge}`,
        background: file ? identity.tealTint : over ? identity.tealTint : identity.paper,
        borderRadius: 6,
        padding: `${space.lg}px`,
        cursor: "pointer",
        display: "flex",
        gap: space.md,
        alignItems: "center",
        minHeight: 72,
      }}
    >
      <span style={{ color: file ? identity.teal : identity.muted, flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: identity.ink }}>
          {file ? file.name : label}
        </span>
        <span style={{ display: "block", fontSize: 12, color: identity.muted, marginTop: 2 }}>
          {file ? `${(file.size / 1024).toFixed(0)} KB — click to replace` : hint}
        </span>
      </span>
      <input
        ref={input}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onPick(picked);
        }}
      />
    </div>
  );
}

/** The three ways out, as a segmented control. */
function FormatChoice({
  value,
  onChange,
  hasTemplate,
}: {
  value: ExportFormat;
  onChange: (next: ExportFormat) => void;
  hasTemplate: boolean;
}) {
  const options: { id: ExportFormat; label: string; hint: string; ready: boolean }[] = [
    {
      id: "xlsx",
      label: "Excel",
      hint: "A workbook Scripta lays out itself",
      ready: true,
    },
    {
      id: "docx",
      label: "Word",
      hint: "A landscape table for a covering letter",
      ready: true,
    },
    {
      id: "template",
      label: "Buyer's schedule",
      hint: hasTemplate ? "Their appendix, filled in place" : "Add their .xlsx above to use this",
      ready: hasTemplate,
    },
  ];
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <Eyebrow>Export as</Eyebrow>
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
        {options.map((option) => {
          const chosen = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={!option.ready}
              onClick={() => onChange(option.id)}
              title={option.hint}
              style={{
                textAlign: "left",
                padding: "8px 12px",
                borderRadius: 4,
                cursor: option.ready ? "pointer" : "not-allowed",
                opacity: option.ready ? 1 : 0.5,
                border: `1px solid ${chosen ? identity.teal : identity.border}`,
                background: chosen ? identity.tealTint : identity.paper,
                minWidth: 150,
              }}
            >
              <span
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  color: chosen ? identity.teal : identity.ink,
                }}
              >
                {option.label}
              </span>
              <span style={{ display: "block", fontSize: 11, color: identity.muted }}>
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CheckLine({ check }: { check: ScheduleCheck }) {
  return (
    <li style={{ display: "flex", gap: space.sm, alignItems: "flex-start", padding: "6px 0" }}>
      <span style={{ color: check.passed ? identity.teal : "#B3261E", flexShrink: 0, marginTop: 1 }}>
        {check.passed ? <Check size={15} /> : <X size={15} />}
      </span>
      <span>
        <span style={{ fontSize: 13, color: identity.ink, fontWeight: 500 }}>{check.name}</span>
        <span style={{ display: "block", fontSize: 12, color: identity.muted }}>{check.detail}</span>
      </span>
    </li>
  );
}

/** The proposed column, shown the way the workbook will show it. */
function Proposed({ row }: { row: ReadRedline["rows"][number] }) {
  return (
    <span style={{ fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
      {row.proposed.map((segment, at) =>
        segment.kind === "insert" ? (
          <span key={at} style={{ color: "#C0261A" }}>{segment.text}</span>
        ) : segment.kind === "delete" ? (
          <span key={at} style={{ color: "#C0261A", textDecoration: "line-through" }}>{segment.text}</span>
        ) : (
          <span key={at} style={segment.kind === "label" ? { color: identity.muted } : undefined}>
            {segment.text}
          </span>
        ),
      )}
    </span>
  );
}

export default function DeviationsTab() {
  const [redline, setRedline] = useState<File | null>(null);
  const [template, setTemplate] = useState<File | null>(null);
  const [bidder, setBidder] = useState(DEFAULT_BIDDER);
  const [result, setResult] = useState<ReadRedline | null>(null);
  const [checks, setChecks] = useState<ScheduleCheck[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseDate, setResponseDate] = useState(today());
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [reasons, setReasons] = useState<string[] | null>(null);
  const [drafting, setDrafting] = useState(false);
  const draft = useServerFn(draftJustifications);
  const askProvider = useServerFn(justificationProvider);
  // null = still asking, "" = none configured, otherwise the model's name.
  const [provider, setProvider] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void askProvider({})
      .then((r) => live && setProvider(r.provider ?? ""))
      .catch(() => live && setProvider(""));
    return () => {
      live = false;
    };
  }, [askProvider]);
  const noModel = provider === "";

  async function run() {
    if (!redline) return;
    setBusy(true);
    setError(null);
    try {
      const read = await readRedline(await redline.arrayBuffer());
      setResult(read);
      setChecks(checkSchedule(read));
      setReasons(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!result) return;
    if (format === "template" && !template) return;
    setBusy(true);
    setError(null);
    try {
      const shared = {
        rows: result.rows,
        justifications: reasons ?? describeAll(result.rows),
        bidder: bidder.trim() || "[Bidder name]",
        ...(responseDate.trim() ? { responseDate: responseDate.trim() } : {}),
      };
      const made =
        format === "template" && template
          ? {
              blob: await fillSchedule(
                await template.arrayBuffer(),
                result,
                shared.bidder,
                shared.justifications,
                shared.responseDate,
              ),
              name: `${template.name.replace(/\.xlsx$/i, "")} (populated).xlsx`,
            }
          : format === "docx"
            ? {
                blob: new Blob(
                  [
                    buildDeviationsDocx({
                      ...shared,
                      ...(redline ? { agreement: redline.name.replace(/\.docx$/i, "") } : {}),
                    }) as BlobPart,
                  ],
                  {
                    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  },
                ),
                name: "Schedule of Deviations.docx",
              }
            : {
                blob: new Blob([buildDeviationsXlsx(shared) as BlobPart], {
                  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                }),
                name: "Schedule of Deviations.xlsx",
              };

      const url = URL.createObjectURL(made.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = made.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Ask the model for the justification column.
   *
   * Sent in one request and batched server-side. A row the model skips keeps
   * its placeholder rather than borrowing its neighbour's reasoning, so a
   * partial answer is still worth having.
   */
  async function writeReasons() {
    if (!result) return;
    setDrafting(true);
    setError(null);
    try {
      const answer = await draft({
        data: {
          bidder: bidder.trim(),
          rows: result.rows.map((row, at) => ({
            id: at,
            reference: row.reference,
            original: row.original.slice(0, 6000),
            proposed: row.proposed
              .map((s) =>
                s.kind === "insert" ? `{+${s.text}+}` : s.kind === "delete" ? `[-${s.text}-]` : s.text,
              )
              .join("")
              .slice(0, 8000),
            isNew: row.isNew,
            isDeleted: row.isDeleted,
          })),
        },
      });
      setReasons(mergeJustifications(result.rows, answer.justifications));
      if (answer.error) setError(answer.error);
      else if (!answer.drafted)
        setError("No justifications came back. The schedule will use the short placeholders.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDrafting(false);
    }
  }

  const written = reasons?.filter((r) => r && !/^(New provision proposed|This provision is|The wording of this|Wording is)/.test(r)).length ?? 0;

  return (
    <div style={{ display: "grid", gap: space.lg }}>
      <Card
        title="Schedule of deviations"
        hint="Drop in the marked-up agreement and the buyer's blank schedule. Both are read in this browser; neither is uploaded."
      >
        <div style={{ display: "grid", gap: space.md }}>
          <div style={{ display: "grid", gap: space.md, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <Drop
              label="Marked-up agreement (.docx)"
              hint="The redline, with tracked changes still in it"
              accept=".docx"
              file={redline}
              onPick={(f) => { setRedline(f); setResult(null); }}
              icon={<FileText size={20} />}
            />
            <Drop
              label="Buyer's schedule (.xlsx) — optional"
              hint="Their blank appendix, filled in place. Leave empty and Scripta draws its own."
              accept=".xlsx"
              file={template}
              onPick={(f) => {
                setTemplate(f);
                setFormat("template");
              }}
              icon={<FileSpreadsheet size={20} />}
            />
          </div>

          <div style={{ display: "grid", gap: space.md, gridTemplateColumns: "2fr 1fr" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <Eyebrow>Bidder name</Eyebrow>
              <input
                value={bidder}
                onChange={(e) => setBidder(e.target.value)}
                placeholder="The name to enter in every row of the Bidder column"
                style={field}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <Eyebrow>Date of response</Eyebrow>
              <input
                value={responseDate}
                onChange={(e) => setResponseDate(e.target.value)}
                placeholder="Dates the justification column heading"
                style={field}
              />
            </label>
          </div>

          <FormatChoice value={format} onChange={setFormat} hasTemplate={!!template} />

          <div style={{ display: "flex", gap: space.sm, alignItems: "center" }}>
            <Button onClick={run} disabled={!redline || busy}>
              {busy ? "Reading…" : "Read the redline"}
            </Button>
            {result && (
              <Button onClick={writeReasons} disabled={drafting || busy || noModel}>
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <PenLine size={14} />
                  {drafting ? "Drafting…" : reasons ? "Redraft justifications" : "Draft justifications"}
                </span>
              </Button>
            )}
            {result && (
              <Button
                variant={reasons && written ? "primary" : "secondary"}
                onClick={download}
                disabled={busy || (format === "template" && !template)}
              >
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Download size={14} />
                  {reasons && written
                    ? "Download the schedule"
                    : "Download with Column F to complete"}
                </span>
              </Button>
            )}
            {result && format === "template" && !template && (
              <span style={{ fontSize: 12, color: identity.muted }}>
                Add the buyer's .xlsx, or export as Excel or Word instead.
              </span>
            )}
          </div>

          {noModel && (
            <p
              style={{
                fontSize: 12,
                margin: 0,
                padding: "8px 10px",
                borderRadius: 4,
                background: "#FDF6E3",
                border: "1px solid #E0C987",
                color: "#6B5415",
              }}
            >
              No AI model is configured, so the justification column cannot be drafted. Everything
              else works: the schedule will generate with a one-line note in Column F for you to
              complete. To draft it, set GEMINI_API_KEY or ANTHROPIC_API_KEY and restart the server.
            </p>
          )}

          {result && (
            <p style={{ fontSize: 12, color: identity.muted, margin: 0 }}>
              {!reasons
                ? noModel
                  ? `${result.rows.length} deviations ready. Column F will carry a one-line note for you to complete.`
                  : "Draft the justifications before downloading, or Column F carries a one-line note only."
                : written === 0
                  ? "No justifications were drafted. The schedule will carry the one-line placeholders in Column F."
                  : `${written} of ${result.rows.length} justifications drafted${
                      written < result.rows.length ? "; the rest keep their placeholder" : ""
                    }. Review and edit them in the workbook before sending.`}
            </p>
          )}

          {error && <p style={{ fontSize: 13, color: "#B3261E", margin: 0 }}>{error}</p>}
        </div>
      </Card>

      {result && (
        <Card
          title="What the redline contains"
          right={<Eyebrow>{result.rows.length} deviations</Eyebrow>}
        >
          <div style={{ display: "flex", gap: space.xl, flexWrap: "wrap", marginBottom: space.md }}>
            {[
              ["Insertions", result.tally.insertions],
              ["Deletions", result.tally.deletions],
              ["Paragraphs amended", result.tally.captured],
              ["Set aside", result.tally.setAside],
            ].map(([label, value]) => (
              <span key={String(label)}>
                <Eyebrow>{String(label)}</Eyebrow>
                <span style={{ display: "block", fontSize: 22, color: identity.ink }}>{value}</span>
              </span>
            ))}
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: `1px solid ${identity.rule}` }}>
            {checks.map((check) => <CheckLine key={check.name} check={check} />)}
          </ul>
        </Card>
      )}

      {result && (
        <Card title="The schedule" hint="Additions in red, deletions struck through — as they will appear in the workbook.">
          {result.rows.length === 0 ? (
            <Empty title="No tracked changes">This document has no revisions to report.</Empty>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    {["Clause Ref.", "Original Clause", "The Bidder's Proposed Clause", "Justification"].map((head, at) => (
                      <th
                        key={head}
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          borderBottom: `1px solid ${identity.border}`,
                          fontSize: 11,
                          color: identity.muted,
                          width: at === 0 ? "14%" : at === 3 ? "24%" : "31%",
                        }}
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, at) => (
                    <tr key={row.paragraphs.join(",")} style={{ verticalAlign: "top" }}>
                      <td style={{ padding: "10px", borderBottom: `1px solid ${identity.rule}`, fontSize: 12, color: identity.ink, fontWeight: 500 }}>
                        {row.reference}
                      </td>
                      <td style={{ padding: "10px", borderBottom: `1px solid ${identity.rule}`, fontSize: 12, color: identity.muted, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                        {row.original}
                      </td>
                      <td style={{ padding: "10px", borderBottom: `1px solid ${identity.rule}` }}>
                        <Proposed row={row} />
                      </td>
                      <td style={{ padding: "10px", borderBottom: `1px solid ${identity.rule}`, fontSize: 12, color: identity.ink, lineHeight: 1.55 }}>
                        {reasons?.[at] ?? describeAll([row])[0]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
