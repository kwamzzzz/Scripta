/**
 * The chart studio: bring in a chart the client already has, check what was
 * read, publish it into the records; and export either chart as a file.
 *
 * One studio for both charts, switched by kind. An import is a proposal until
 * it is published: every box is matched against the people, roles and
 * entities already recorded, anything unreadable is listed, and nothing is
 * written before Publish. Exports draw the recorded chart — never an
 * unpublished import, and never a screenshot.
 */
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useSearch } from "@tanstack/react-router";
import { Button } from "@/components/primitives";
import type { AreaProps } from "../area";
import {
  entityLabel,
  formatDay,
  localDay,
  personName,
  type ChangeContext,
  type Organisation,
} from "../model";
import {
  ChangeFields,
  Empty,
  ErrorLine,
  Eyebrow,
  OrgDialog,
  OrgPage,
  Panel,
  Segmented,
  Select,
  count,
  useOrgWrite,
} from "../ui";
import ChartCanvas, { Swatch } from "../charts/ChartCanvas";
import { organogramLayout, structureLayout } from "../charts/build";
import { chartMeta, downloadChart, type ExportFormat } from "../charts/download";
import { arrange, compose, plain } from "../charts/compose";
import { useChartDesign } from "../charts/useChartDesign";
import type { Paper } from "../charts/export";
import {
  guessColumns,
  importSummary,
  parseCsv,
  parseDrawio,
  parsePptx,
  parseXlsx,
  proposeDecisions,
  rowsToJob,
  type ChartKind,
  type ColumnMap,
  type Decision,
  type ImportJob,
} from "../charts/import";
import { layoutLayered, layoutTree, type ChartLayout, type GraphNode } from "../charts/layout";
import { publishImport, type PublishResult } from "../charts/publish";

type Sheet = { name: string; format: "csv" | "xlsx"; rows: string[][]; map: ColumnMap };

const encode = (d: Decision) =>
  d.kind === "ignore" ? "ignore" : d.kind === "new" ? `new:${d.as}` : `match:${d.as}:${d.id}`;
const decode = (v: string): Decision => {
  const [kind, as, id] = v.split(":");
  if (kind === "match") return { kind: "match", as: as as "role" | "entity" | "person", id: id! };
  if (kind === "new") return { kind: "new", as: as as "role" | "entity" | "outside" };
  return { kind: "ignore" };
};

export default function ChartStudio({ org, client, go }: AreaProps) {
  // The studio is reached from either chart, and the area in the address says
  // which; the studio is only mounted for those two areas.
  const search = useSearch({ strict: false }) as { area?: string };
  const kind: ChartKind = search.area === "structure" ? "ownership" : "reporting";
  return <Studio key={kind} org={org} clientName={client.name} go={go} kind={kind} />;
}

function Studio({
  org,
  clientName,
  go,
  kind,
}: {
  org: Organisation;
  clientName: string;
  go: AreaProps["go"];
  kind: ChartKind;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [over, setOver] = useState(false);
  const [paper, setPaper] = useState<Paper>("A3");
  const input = useRef<HTMLInputElement>(null);
  const [accept, setAccept] = useState(".csv,.xlsx,.drawio,.xml,.pptx");

  const today = localDay();
  const chartTitle =
    kind === "reporting" ? `Organogram — ${clientName}` : `${clientName} — group structure`;
  // The recorded chart as the firm has drawn it, so an export matches the chart page.
  const { design } = useChartDesign(org, kind);
  const recorded = useMemo(
    () =>
      compose(
        arrange(
          (route) =>
            kind === "reporting"
              ? organogramLayout(org, "reporting", today, route)
              : structureLayout(org, "current", today, route),
          design,
          kind === "reporting" ? "reporting" : "current",
        ),
        design,
        kind,
      ),
    [org, kind, today, design],
  );
  const preview = useMemo(() => (job ? plain(jobLayout(job, decisions)) : null), [job, decisions]);
  const summary = job ? importSummary(job, decisions) : null;

  const switchKind = (next: ChartKind) => {
    setSheet(null);
    setJob(null);
    setResult(null);
    setError(null);
    go({ area: next === "reporting" ? "organogram" : "structure", mode: "studio", item: null });
  };

  const startJob = (next: ImportJob) => {
    setJob(next);
    setResult(null);
    setDecisions(
      proposeDecisions(next, {
        roles: org.roles.map((r) => ({
          id: r.id,
          title: r.title,
          holder: personName(org, r.holderPersonId),
        })),
        entities: org.entities
          .filter((e) => !e.archivedAt)
          .map((e) => ({ id: e.id, name: e.name, shortName: e.shortName })),
        people: org.people
          .filter((p) => !p.archivedAt)
          .map((p) => ({ id: p.id, fullName: p.fullName })),
      }),
    );
  };

  const read = async (file: File) => {
    setError(null);
    setResult(null);
    setReading(true);
    try {
      const ext = /\.[a-z0-9]+$/i.exec(file.name)?.[0].toLowerCase() ?? "";
      if (ext === ".csv" || ext === ".xlsx") {
        const rows =
          ext === ".csv" ? parseCsv(await file.text()) : await parseXlsx(await file.arrayBuffer());
        if (rows.length < 2)
          throw new Error("The sheet needs a header row and at least one row below it.");
        setJob(null);
        setSheet({
          name: file.name,
          format: ext === ".csv" ? "csv" : "xlsx",
          rows,
          map: guessColumns(rows[0]!),
        });
      } else if (ext === ".drawio" || ext === ".xml") {
        setSheet(null);
        startJob(await parseDrawio(await file.text(), kind, file.name));
      } else if (ext === ".pptx") {
        setSheet(null);
        startJob(await parsePptx(await file.arrayBuffer(), kind, file.name));
      } else if (ext === ".vsdx" || ext === ".pdf" || /^\.(png|jpe?g|gif|webp|tiff?)$/.test(ext)) {
        throw new Error(
          "Visio files, PDFs and images cannot be read into a chart yet. Export the chart from its app as PowerPoint, draw.io or a spreadsheet.",
        );
      } else {
        throw new Error("Choose a CSV or Excel sheet, a draw.io diagram or a PowerPoint file.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That file could not be read.");
    } finally {
      setReading(false);
    }
  };

  const pick = (types: string) => {
    setAccept(types);
    // Let the accept attribute settle before the picker opens.
    setTimeout(() => input.current?.click(), 0);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void read(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void read(file);
  };

  const discard = () => {
    setJob(null);
    setSheet(null);
    setDecisions({});
    setError(null);
  };

  const exportAs = (format: ExportFormat) =>
    downloadChart(recorded, chartMeta(chartTitle, today), today, format, paper);

  const exportSheet = (
    <>
      <div className="og-aside-head">
        <h3>Export</h3>
        <p>
          {kind === "reporting" ? "Organogram" : "Group structure"} ·{" "}
          {count(recorded.nodes.filter((n) => n.kind !== "group").length, "box", "boxes")} · as at{" "}
          {formatDay(today, "long")}
        </p>
      </div>
      <div className="oc-export is-lead">
        <header>
          <Eyebrow>PowerPoint</Eyebrow>
          <span className="og-mono">.pptx</span>
        </header>
        <p>
          Native shapes and connectors, editable in PowerPoint. Text stays text; lines stay attached
          when a box is moved.
        </p>
      </div>
      <div className="oc-export">
        <header>
          <Eyebrow>PDF</Eyebrow>
          <span className="og-mono">.pdf</span>
        </header>
        <p>Vector, one landscape page, scaled to fit, with the as-at date in the footer.</p>
      </div>
      <label className="org-field">
        <span className="org-label">Paper</span>
        <Select<Paper>
          value={paper}
          onChange={(v) => setPaper((v || "A3") as Paper)}
          options={[
            { value: "A3", label: "A3 landscape" },
            { value: "A4", label: "A4 landscape" },
          ]}
        />
      </label>
      <div className="oc-export">
        <Eyebrow>Also available</Eyebrow>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => exportAs("svg")} disabled={!recorded.nodes.length}>
            SVG
          </Button>
          <Button onClick={() => exportAs("csv")} disabled={!recorded.nodes.length}>
            CSV of boxes and lines
          </Button>
        </div>
      </div>
      <Button variant="primary" onClick={() => exportAs("pptx")} disabled={!recorded.nodes.length}>
        Export PowerPoint
      </Button>
      <Button onClick={() => exportAs("pdf")} disabled={!recorded.nodes.length}>
        Export PDF
      </Button>
      <p className="og-muted" style={{ fontSize: 12, margin: 0 }}>
        {job
          ? "Exports draw the recorded chart; publish the import first to include it."
          : "Exports draw the recorded chart and carry its as-at date."}
      </p>
    </>
  );

  return (
    <OrgPage
      title="Chart studio"
      subtitle={`${kind === "reporting" ? "Organogram" : "Group structure"} · ${clientName}`}
      actions={
        <>
          <Segmented<ChartKind>
            label="Chart"
            value={kind}
            onChange={switchKind}
            options={[
              { id: "reporting", label: "Reporting chart" },
              { id: "ownership", label: "Ownership chart" },
            ]}
          />
          <Button onClick={() => go({ mode: null })}>Back to the chart</Button>
          {job && (
            <>
              <Button variant="quiet" onClick={discard}>
                Discard import
              </Button>
              <Button
                variant="primary"
                onClick={() => setPublishing(true)}
                disabled={!job.nodes.length}
              >
                Publish to {kind === "reporting" ? "organogram" : "group structure"}
              </Button>
            </>
          )}
        </>
      }
      aside={exportSheet}
      wide
    >
      <div className="oc-studio">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Eyebrow>Start from</Eyebrow>
          <div
            className={`oc-drop${over ? " is-over" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => pick(".csv,.xlsx,.drawio,.xml,.pptx")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pick(".csv,.xlsx,.drawio,.xml,.pptx");
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <strong>
              {reading ? "Reading…" : `Import ${kind === "reporting" ? "a chart" : "a structure"}`}
            </strong>
            <span>Drop a file, or choose a source below</span>
          </div>
          <input ref={input} type="file" accept={accept} hidden onChange={onFile} />
          <div className="oc-sources">
            <button type="button" className="oc-source" onClick={() => pick(".pptx")}>
              <code>PPTX</code>PowerPoint shapes and connectors
            </button>
            <button type="button" className="oc-source" onClick={() => pick(".drawio,.xml")}>
              <code>DRAWIO</code>draw.io or diagrams.net
            </button>
            <button type="button" className="oc-source" onClick={() => pick(".csv,.xlsx")}>
              <code>XLSX</code>
              {kind === "reporting"
                ? "Staff list: title, name, reports to"
                : "Shareholding list: holder, entity, %"}
            </button>
            <button type="button" className="oc-source" onClick={discard}>
              <code>REG</code>Build from the records
            </button>
            <button type="button" className="oc-source" disabled title="Not supported yet">
              <code>PDF</code>Scan or image — not read yet
            </button>
            <button type="button" className="oc-source" disabled title="Not supported yet">
              <code>VSDX</code>Visio — export as PowerPoint first
            </button>
          </div>
          {job && summary && (
            <Panel
              title={job.sourceName}
              hint={`${job.format.toUpperCase()} · ${count(job.nodes.length, "box", "boxes")} read`}
            >
              <div className="oc-summary">
                <div>
                  <span>Boxes matched to records</span>
                  <span>
                    {summary.matched} of {summary.nodes}
                  </span>
                </div>
                {kind === "ownership" && (
                  <div>
                    <span>Shares read from labels</span>
                    <span>
                      {summary.percentRead} of {summary.edges}
                    </span>
                  </div>
                )}
                <div className={summary.needsConfirmation ? "is-warn" : undefined}>
                  <span>Needs your confirmation</span>
                  <span>{summary.needsConfirmation}</span>
                </div>
              </div>
            </Panel>
          )}
          <Panel tone="note">
            An imported chart stays a proposal: boxes become candidates, lines become{" "}
            {kind === "reporting" ? "reporting lines" : "holdings"}, and each candidate is matched
            against what is already recorded. Nothing is written until you publish.
          </Panel>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <ErrorLine error={error} />
          {result && (
            <Panel tone={result.skipped.length ? "warning" : "note"} title="Published">
              <p style={{ margin: 0 }}>
                {count(result.created, "record")} created, {count(result.updated, "record")}{" "}
                updated.
              </p>
              {result.skipped.length > 0 && (
                <ul className="og-rows">
                  {result.skipped.map((s) => (
                    <li key={s} style={{ padding: "4px 0" }}>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          {sheet && (
            <ColumnMapper
              sheet={sheet}
              kind={kind}
              onChange={setSheet}
              onRead={(j) => startJob(j)}
            />
          )}
          {job ? (
            <>
              <ChartCanvas
                label={`Preview of ${job.sourceName}`}
                composition={preview!}
                selectedId={null}
                onSelect={() => {}}
                height={420}
                emptyNote={<Empty title="Nothing in the file could be drawn" />}
                legend={
                  <>
                    <Eyebrow>Import preview</Eyebrow>
                    <Swatch tone={kind === "reporting" ? "role" : "home"}>Matched</Swatch>
                    <Swatch tone="proposed">New</Swatch>
                    {job.edges.some((e) => e.inferred) && (
                      <Swatch line="dotted">Worked out from position</Swatch>
                    )}
                  </>
                }
              />
              <ReviewTable org={org} job={job} decisions={decisions} onChange={setDecisions} />
              {job.unresolved.length > 0 && (
                <Panel title={`Could not read · ${job.unresolved.length}`} tone="warning">
                  <ul className="og-rows">
                    {job.unresolved.map((u, i) => (
                      <li key={i} style={{ padding: "4px 0" }}>
                        {u}
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </>
          ) : (
            !sheet && (
              <ChartCanvas
                label={chartTitle}
                composition={recorded}
                selectedId={null}
                onSelect={() => {}}
                height={520}
                emptyNote={
                  <Empty
                    title={
                      kind === "reporting" ? "No roles recorded yet" : "No entities recorded yet"
                    }
                    body="Import a chart to start from what the client already has."
                  />
                }
                legend={<Eyebrow>{`Recorded chart · as at ${formatDay(today, "long")}`}</Eyebrow>}
              />
            )
          )}
        </div>
      </div>

      {publishing && job && (
        <PublishDialog
          org={org}
          job={job}
          decisions={decisions}
          onClose={() => setPublishing(false)}
          onDone={(r) => {
            setPublishing(false);
            setJob(null);
            setSheet(null);
            if (r.skipped.length) setResult(r);
            else go({ mode: null });
          }}
        />
      )}
    </OrgPage>
  );
}

/** Which column is which, confirmed before any row is read. */
function ColumnMapper({
  sheet,
  kind,
  onChange,
  onRead,
}: {
  sheet: Sheet;
  kind: ChartKind;
  onChange: (s: Sheet) => void;
  onRead: (job: ImportJob) => void;
}) {
  const header = sheet.rows[0]!;
  const columns = header.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }));
  const field = (key: keyof ColumnMap, label: string) => (
    <label className="org-field">
      <span className="org-label">{label}</span>
      <Select
        value={sheet.map[key] === null ? "" : String(sheet.map[key])}
        onChange={(v) =>
          onChange({ ...sheet, map: { ...sheet.map, [key]: v === "" ? null : Number(v) } })
        }
        options={columns}
        empty="Not in this sheet"
      />
    </label>
  );
  return (
    <Panel
      title={`Columns in ${sheet.name}`}
      hint={`${count(sheet.rows.length - 1, "row")} below the header. Say which column holds what.`}
    >
      <div className="oc-map">
        {kind === "reporting" ? (
          <>
            {field("title", "Role title")}
            {field("name", "Person's name")}
            {field("reportsTo", "Reports to")}
          </>
        ) : (
          <>
            {field("parent", "Holder")}
            {field("child", "Entity held")}
            {field("percent", "Share %")}
          </>
        )}
      </div>
      <table className="og-table" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i}>{h || `Column ${i + 1}`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.slice(1, 4).map((row, r) => (
            <tr key={r}>
              {header.map((_, i) => (
                <td key={i}>{row[i] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 10 }}>
        <Button
          variant="primary"
          onClick={() => onRead(rowsToJob(sheet.rows, kind, sheet.map, sheet.name, sheet.format))}
        >
          Read the rows
        </Button>
      </div>
    </Panel>
  );
}

function ReviewTable({
  org,
  job,
  decisions,
  onChange,
}: {
  org: Organisation;
  job: ImportJob;
  decisions: Record<string, Decision>;
  onChange: (d: Record<string, Decision>) => void;
}) {
  const options =
    job.kind === "reporting"
      ? [
          { value: "new:role", label: "New role" },
          ...org.roles.map((r) => ({
            value: `match:role:${r.id}`,
            label: `Is: ${r.title}${r.holderPersonId ? ` — ${personName(org, r.holderPersonId)}` : ""}`,
          })),
          { value: "ignore", label: "Leave out" },
        ]
      : [
          { value: "new:entity", label: "New entity" },
          { value: "new:outside", label: "Holder outside the group" },
          ...org.entities
            .filter((e) => !e.archivedAt)
            .map((e) => ({ value: `match:entity:${e.id}`, label: `Is: ${entityLabel(e)}` })),
          ...org.people
            .filter((p) => !p.archivedAt)
            .map((p) => ({ value: `match:person:${p.id}`, label: `Is: ${p.fullName}` })),
          { value: "ignore", label: "Leave out" },
        ];
  const title = new Map(job.nodes.map((n) => [n.key, n.title]));
  const parentOf = (key: string) => job.edges.filter((e) => e.to === key);
  return (
    <Panel
      title="Review matches"
      hint="Scripta matched boxes by name. Check each one; a wrong match would move a record that already exists."
    >
      <table className="og-table oc-review">
        <thead>
          <tr>
            <th>In the file</th>
            <th>{job.kind === "reporting" ? "Reports to" : "Held by"}</th>
            <th>Record</th>
          </tr>
        </thead>
        <tbody>
          {job.nodes.map((n) => {
            const d = decisions[n.key] ?? { kind: "ignore" };
            const lines = parentOf(n.key);
            return (
              <tr key={n.key}>
                <td>
                  <div className="og-strong">{n.title}</div>
                  {n.subtitle && <div className="og-muted">{n.subtitle}</div>}
                </td>
                <td>
                  {lines.length
                    ? lines
                        .map(
                          (e) =>
                            `${title.get(e.from) ?? ""}${e.label ? ` ${e.label}` : ""}${e.inferred ? " (from position)" : ""}`,
                        )
                        .join("; ")
                    : "—"}
                </td>
                <td>
                  <select
                    aria-label={`Record for ${n.title}`}
                    value={encode(d)}
                    onChange={(e) => onChange({ ...decisions, [n.key]: decode(e.target.value) })}
                  >
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function PublishDialog({
  org,
  job,
  decisions,
  onClose,
  onDone,
}: {
  org: Organisation;
  job: ImportJob;
  decisions: Record<string, Decision>;
  onClose: () => void;
  onDone: (r: PublishResult) => void;
}) {
  const write = useOrgWrite(org.clientId);
  const [change, setChange] = useState<ChangeContext>({ ref: job.sourceName });
  const included = job.nodes.filter((n) => decisions[n.key]?.kind !== "ignore");
  const created = included.filter((n) => decisions[n.key]?.kind === "new").length;
  const matched = included.length - created;
  return (
    <OrgDialog
      open
      title={`Publish to the ${job.kind === "reporting" ? "organogram" : "group structure"}`}
      blurb={`${count(matched, "matched record")} will be updated where the file differs, ${count(created, "new record")} will be created, and ${count(
        job.nodes.length - included.length,
        "box",
        "boxes",
      )} left out.`}
      onClose={onClose}
      onSubmit={async () => {
        let result: PublishResult | null = null;
        const ok = await write.run(async () => {
          result = await publishImport(org, job, decisions, change);
        });
        if (ok && result) onDone(result);
      }}
      submitLabel="Publish"
      busy={write.busy}
      error={write.error}
    >
      <ChangeFields value={change} onChange={setChange} prompt="What the imported chart records" />
    </OrgDialog>
  );
}

/** A preview of the import: matched boxes as records, new ones dashed, left-out ones faded. */
function jobLayout(job: ImportJob, decisions: Record<string, Decision>): ChartLayout {
  const node = (n: ImportJob["nodes"][number]): GraphNode => {
    const d = decisions[n.key];
    const isNew = d?.kind === "new";
    return {
      id: n.key,
      kind:
        job.kind === "reporting"
          ? "role"
          : d?.kind === "match" && d.as === "person"
            ? "person"
            : d?.kind === "new" && d.as === "outside"
              ? "outside"
              : "entity",
      title: n.title,
      subtitle: n.subtitle,
      tone: isNew
        ? "proposed"
        : job.kind === "reporting"
          ? "role"
          : d?.kind === "match" && d.as === "person"
            ? "holder"
            : "home",
      dashed: isNew,
      state: d?.kind === "ignore" ? "muted" : null,
    };
  };
  if (job.kind === "reporting") {
    const first = new Map<string, string>();
    const lines: { id: string; from: string; to: string; style: "dotted" }[] = [];
    // As when publishing: the first line into a box is its reporting line, any other a dotted one.
    job.edges.forEach((e, i) => {
      if (!first.has(e.to)) first.set(e.to, e.from);
      else lines.push({ id: `extra-${i}`, from: e.to, to: e.from, style: "dotted" });
    });
    return layoutTree({
      nodes: job.nodes.map((n) => ({ ...node(n), parentId: first.get(n.key) ?? null })),
      lines,
    });
  }
  return layoutLayered({
    nodes: job.nodes.map(node),
    edges: job.edges.map((e, i) => ({
      id: `e-${i}`,
      from: e.from,
      to: e.to,
      label: e.label,
      style: e.inferred ? "dotted" : "solid",
    })),
  });
}
