/**
 * Book Review: one manuscript.
 *
 *   Overview   Manuscript integrity: where the review stands, what is open by
 *              kind, and the issues that span the manuscript. The review is
 *              started here, with its scope.
 *   Chapters   Every chapter and its review state; a chapter opens as its own
 *              review workspace.
 *   Findings   Everything raised, filtered.
 *   Style sheet  The manuscript's own conventions.
 *   Map        How the chapters build the argument.
 *   Versions   Each upload; a new one is verified against the last.
 */
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppShell, { Crumbs } from "@/components/AppShell";
import { TabRow } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import ActionError, { attempt } from "@/components/ActionError";
import { Card, Chip, Meter, Stat } from "@/review/ui";
import { useAuth } from "@/lib/auth";
import { relTime } from "@/lib/home-data";
import { buildCleanDocx } from "@/lib/export/docx";
import { DOCX_MIME, downloadBytes } from "@/lib/export/download";
import {
  decideFinding,
  decideFindings,
  deleteRule,
  errorMessage,
  importVersion,
  loadManuscript,
  manuscriptKey,
  saveRule,
  setManuscriptPrivate,
  versionFileUrl,
  type Finding,
  type ManuscriptBundle,
  type StoredNode,
} from "./db";
import { ChapterList, ChapterView } from "./ChaptersPanel";
import FindingsPanel from "./FindingsPanel";
import { NO_FILTER, paragraphRefs, sortFindings } from "./findings";
import FindingCard from "./FindingCard";
import StylePanel from "./StylePanel";
import MapPanel from "./MapPanel";
import { runReview, verifyVersion, type RunProgress } from "./runner";
import { buildEditorialReport } from "./report";
import { parseSentenceKey } from "./sentences";
import {
  CATEGORY_LABEL,
  MANUSCRIPT_KINDS,
  SCOPE_CHOICES,
  type FindingCategory,
  type FindingStatus,
  type ReviewScope,
} from "./model";
import "@/review/review.css";
import "./manuscripts.css";

export const MANUSCRIPT_TABS = [
  "overview",
  "chapters",
  "findings",
  "style",
  "map",
  "versions",
] as const;
export type ManuscriptTab = (typeof MANUSCRIPT_TABS)[number];
const TAB_LABEL: Record<ManuscriptTab, string> = {
  overview: "Overview",
  chapters: "Chapters",
  findings: "Findings",
  style: "Style sheet",
  map: "Chapter map",
  versions: "Versions",
};

export type ManuscriptSearch = {
  tab?: ManuscriptTab | undefined;
  chapter?: string | undefined;
  node?: string | undefined;
};

/** The review in progress, if any. One at a time per screen. */
function useRun(manuscriptId: string, refresh: () => Promise<unknown>) {
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cancelled = useRef(false);
  const lastRefresh = useRef(0);
  const go = async (work: () => Promise<string>) => {
    cancelled.current = false;
    setError(null);
    setNotice(null);
    setProgress({ step: "Starting", done: 0, of: 1 });
    try {
      setNotice(await work());
    } catch (cause) {
      setError(errorMessage(cause, "The review stopped."));
    } finally {
      setProgress(null);
      await refresh();
    }
  };
  const ctl = {
    cancelled: () => cancelled.current,
    onProgress: (p: RunProgress) => {
      setProgress(p);
      // Findings appear while the run goes on, not only at the end — but a
      // book is thousands of atoms, so not after every one of seventy passages.
      if (Date.now() - lastRefresh.current > 10_000) {
        lastRefresh.current = Date.now();
        void refresh();
      }
    },
  };
  return {
    progress,
    error,
    notice,
    clear: () => {
      setError(null);
      setNotice(null);
    },
    cancel: () => {
      cancelled.current = true;
    },
    review: (scope: ReviewScope, chapterKeys: string[] = []) =>
      go(async () => {
        const out = await runReview({ manuscriptId, scope, chapterKeys, ctl });
        return cancelled.current
          ? `Stopped. ${out.added} finding${out.added === 1 ? "" : "s"} were kept.`
          : `Review finished: ${out.added} new finding${out.added === 1 ? "" : "s"}.`;
      }),
    verify: (previousVersionId: string) =>
      go(async () => {
        const out = await verifyVersion({ manuscriptId, previousVersionId, ctl });
        return `Verified against the last version: ${out.fixed} fixed, ${out.remains} still in the text, ${out.introduced} new.`;
      }),
  };
}

function RunBar({ progress, onCancel }: { progress: RunProgress; onCancel: () => void }) {
  return (
    <div className="ms-runbar" role="status">
      <span className="rv-spin" />
      <span>
        {progress.step}
        {progress.of > 1 ? ` · ${progress.done + 1} of ${progress.of}` : ""}
      </span>
      <span className="ms-muted ms-small">Each step is saved as it finishes.</span>
      <span style={{ flex: 1 }} />
      <Button variant="quiet" onClick={onCancel}>
        Stop
      </Button>
    </div>
  );
}

function ReviewLauncher({
  bundle,
  busy,
  onRun,
}: {
  bundle: ManuscriptBundle;
  busy: boolean;
  onRun: (scope: ReviewScope, chapters: string[]) => void;
}) {
  const [scope, setScope] = useState<ReviewScope>("full");
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (k: string) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  return (
    <Card
      title="Review"
      hint="What you review is the target. The whole manuscript is always the context."
    >
      <div className="ms-scopes" role="radiogroup" aria-label="What to review">
        {SCOPE_CHOICES.map((s) => (
          <label key={s.key} className={`ms-scope${scope === s.key ? " is-on" : ""}`}>
            <input
              type="radio"
              name="scope"
              checked={scope === s.key}
              onChange={() => setScope(s.key)}
            />
            <strong>{s.label}</strong>
            <span className="ms-muted ms-small">{s.meaning}</span>
          </label>
        ))}
      </div>
      {scope === "chapters" && (
        <div className="ms-pick">
          {bundle.chapters.map((c) => (
            <label key={c.chapterKey} className="ms-check">
              <input
                type="checkbox"
                checked={picked.includes(c.chapterKey)}
                onChange={() => toggle(c.chapterKey)}
              />
              {[c.number, c.title].filter(Boolean).join(" ")}
            </label>
          ))}
        </div>
      )}
      <div>
        <Button
          variant="primary"
          disabled={busy || !bundle.version || (scope === "chapters" && !picked.length)}
          onClick={() => onRun(scope, picked)}
        >
          {scope === "chapters"
            ? `Review ${picked.length || ""} chapter${picked.length === 1 ? "" : "s"}`
            : `Run ${SCOPE_CHOICES.find((s) => s.key === scope)!.label.toLowerCase()}`}
        </Button>
      </div>
    </Card>
  );
}

const CATEGORY_ORDER: FindingCategory[] = [
  "error",
  "consistency",
  "style",
  "citation",
  "cross_reference",
  "coherence",
  "clarity",
  "query",
  "suggestion",
];

function Overview({
  bundle,
  nodes,
  chapters,
  busy,
  onRun,
  onFilter,
  onDecide,
  onOpenPlace,
  refs,
}: {
  bundle: ManuscriptBundle;
  refs: Map<string, string>;
  nodes: Map<string, StoredNode>;
  chapters: Map<string, ManuscriptBundle["chapters"][number]>;
  busy: boolean;
  onRun: (scope: ReviewScope, chapters: string[]) => void;
  onFilter: (category: FindingCategory) => void;
  onDecide: (f: Finding, s: FindingStatus) => void;
  onOpenPlace: (nodeKey: string) => void;
}) {
  const { findings, version } = bundle;
  const open = findings.filter((f) => f.status === "open");
  const serious = open.filter((f) => f.severity !== "minor");
  const reviewed = bundle.chapters.filter((c) => c.state === "reviewed").length;
  const count = (c: FindingCategory) => open.filter((f) => f.category === c).length;
  const wide = sortFindings(
    open.filter(
      // Spans chapters, or is a judgment about the argument as a whole. A
      // one-chapter consistency finding from the exact checks is not.
      (f) =>
        f.chapterKeys.length > 1 ||
        (f.source === "ai" && (f.pass === "coherence" || f.pass === "consistency")),
    ),
  ).slice(0, 8);
  const lastRun = bundle.runs[0];
  const active = bundle.rules.filter((r) => r.active).length;
  return (
    <div className="rv-cols">
      <div className="ms-col">
        <Card title="Manuscript integrity">
          <Meter
            fraction={bundle.chapters.length ? reviewed / bundle.chapters.length : 0}
            label={`${reviewed} of ${bundle.chapters.length} chapters reviewed`}
          />
          <div className="rv-stats">
            <Stat n={open.length} label="Open findings" tone={open.length ? "high" : "ok"} />
            <Stat
              n={serious.length}
              label="Material or critical"
              tone={serious.length ? "critical" : "ok"}
            />
            <Stat
              n={open.filter((f) => f.action === "query").length}
              label="Author queries"
              tone="info"
            />
            <Stat n={active} label="Style sheet rules" tone="quiet" />
          </div>
          <table className="ms-integrity">
            <tbody>
              {CATEGORY_ORDER.map((c) => {
                const n = count(c);
                return (
                  <tr key={c}>
                    <th>{CATEGORY_LABEL[c]}</th>
                    <td>
                      {n ? (
                        <button type="button" className="ms-place" onClick={() => onFilter(c)}>
                          {n} open
                        </button>
                      ) : (
                        <span className="ms-muted">{reviewed ? "None open" : "—"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {lastRun && (
            <p className="ms-muted ms-small">
              Last review:{" "}
              {SCOPE_CHOICES.find((s) => s.key === lastRun.scope)?.label ?? "Verification"}
              {", "}
              {relTime(lastRun.startedAt)}
              {lastRun.status === "failed" && lastRun.error ? `. It stopped: ${lastRun.error}` : ""}
              {lastRun.status === "cancelled" ? ". It was stopped part-way." : ""}
            </p>
          )}
        </Card>
        <Card
          title="Manuscript-wide issues"
          hint="Problems that only show when chapters are read against each other."
        >
          {wide.length === 0 ? (
            <p className="ms-quiet">
              {reviewed
                ? "None open."
                : "Run a full review or a final consistency review to look for them."}
            </p>
          ) : (
            wide.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                nodes={nodes}
                chapters={chapters}
                onDecide={(s) => onDecide(f, s)}
                onOpenPlace={onOpenPlace}
                refs={refs}
              />
            ))
          )}
        </Card>
      </div>
      <div className="ms-col">
        <ReviewLauncher bundle={bundle} busy={busy} onRun={onRun} />
        {version && version.warnings.length > 0 && (
          <Card title="How the file was read">
            <ul className="ms-plain">
              {version.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="Chapters">
          <ol className="ms-mini-chapters">
            {bundle.chapters.map((c) => {
              const n = open.filter((f) => f.chapterKeys.includes(c.chapterKey)).length;
              return (
                <li key={c.chapterKey}>
                  <button
                    type="button"
                    className="ms-place"
                    onClick={() => onOpenPlace(c.chapterKey)}
                  >
                    {[c.number, c.title].filter(Boolean).join(" ")}
                  </button>
                  <span className="ms-muted ms-small">
                    {c.state === "reviewed"
                      ? n
                        ? `${n} open`
                        : "Reviewed"
                      : c.state === "reviewing"
                        ? "Reviewing"
                        : "Not reviewed"}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </div>
  );
}

function Versions({
  bundle,
  busy,
  onUpload,
  onVerify,
}: {
  bundle: ManuscriptBundle;
  busy: boolean;
  onUpload: (file: File) => void;
  onVerify: (previousVersionId: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const current = bundle.version;
  const previous = bundle.versions.find((v) => current && v.versionNo < current.versionNo);
  const fixed = bundle.findings.filter((f) => f.verification === "fixed").length;
  const remains = bundle.findings.filter((f) => f.verification === "remains").length;
  const introduced = bundle.findings.filter((f) => f.verification === "introduced").length;
  return (
    <div className="rv-cols">
      <div className="ms-col">
        <Card
          title="Upload the amended manuscript"
          hint="After the author's changes. Every finding on the last version is carried across and checked: fixed, still in the text, or new."
        >
          <input
            type="file"
            accept=".docx,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div>
            <Button
              variant="primary"
              disabled={!file || busy}
              onClick={() => file && onUpload(file)}
            >
              Upload and verify
            </Button>
          </div>
        </Card>
        {current && previous && (
          <Card title={`Version ${current.versionNo} against version ${previous.versionNo}`}>
            {current.verifiedAt ? (
              <div className="rv-stats">
                <Stat n={fixed} label="Fixed" tone="ok" />
                <Stat n={remains} label="Still in the text" tone="quiet" />
                <Stat
                  n={introduced}
                  label="New in this version"
                  tone={introduced ? "medium" : "ok"}
                />
              </div>
            ) : (
              <>
                <p className="ms-quiet">Not verified yet.</p>
                <div>
                  <Button disabled={busy} onClick={() => onVerify(previous.id)}>
                    Verify against version {previous.versionNo}
                  </Button>
                </div>
              </>
            )}
          </Card>
        )}
      </div>
      <div className="ms-col">
        <Card title="Versions">
          <ol className="ms-versions">
            {bundle.versions.map((v) => (
              <li key={v.id}>
                <strong>Version {v.versionNo}</strong>
                {v.id === current?.id && <Chip tone="info">Current</Chip>}
                <span className="ms-muted ms-small">
                  {v.fileName} · {v.wordCount.toLocaleString("en-GB")} words ·{" "}
                  {relTime(v.createdAt)}
                  {v.verifiedAt ? " · verified" : ""}
                </span>
                {v.storagePath && (
                  <Button
                    variant="quiet"
                    onClick={async () => {
                      const url = await versionFileUrl(v);
                      if (url) window.open(url, "_blank", "noopener");
                    }}
                  >
                    Open file
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

export default function ManuscriptScreen({
  manuscriptId,
  search,
}: {
  manuscriptId: string;
  search: ManuscriptSearch;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = manuscriptKey(manuscriptId);
  const query = useQuery({
    queryKey: key,
    retry: false,
    queryFn: () => loadManuscript(manuscriptId),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const run = useRun(manuscriptId, refresh);
  const [error, setError] = useState<string | null>(null);
  const [findingFilter, setFindingFilter] = useState(NO_FILTER);
  const tab: ManuscriptTab = search.tab ?? "overview";
  const bundle = query.data;

  const nodes = useMemo(
    () => new Map((bundle?.nodes ?? []).map((n) => [n.key, n])),
    [bundle?.nodes],
  );
  const chapterMap = useMemo(
    () => new Map((bundle?.chapters ?? []).map((c) => [c.chapterKey, c])),
    [bundle?.chapters],
  );
  const refs = useMemo(
    () => paragraphRefs(bundle?.nodes ?? [], chapterMap),
    [bundle?.nodes, chapterMap],
  );

  const go = (next: ManuscriptSearch) =>
    void navigate({
      to: "/manuscripts/$manuscriptId",
      params: { manuscriptId },
      search: next as never,
    });
  /** A place is a paragraph ("n29") or one of its sentences ("n29.2"). */
  const openPlace = (place: string) => {
    const n = nodes.get(parseSentenceKey(place).nodeKey);
    const chapter = n?.kind === "chapter" ? n.key : n?.chapterKey;
    if (chapter) go({ tab: "chapters", chapter, node: place });
  };
  const decide = (f: Finding, s: FindingStatus) =>
    void attempt(
      "The finding could not be updated",
      async () => {
        await decideFinding(f.id, s);
        await refresh();
      },
      setError,
    );
  const decideMany = (ids: string[], s: FindingStatus) =>
    void attempt(
      "The findings could not be updated",
      async () => {
        await decideFindings(ids, s);
        await refresh();
      },
      setError,
    );

  const exportReport = () => {
    if (!bundle?.version) return;
    const report = buildEditorialReport({
      title: bundle.manuscript.title,
      versionNo: bundle.version.versionNo,
      findings: bundle.findings,
      nodes,
      chapters: bundle.chapters,
      refs,
    });
    const bytes = buildCleanDocx({ ...report, numbering: "literal" });
    downloadBytes(bytes, `${bundle.manuscript.title} - editorial report.docx`, DOCX_MIME);
  };

  const uploadAndVerify = async (file: File) => {
    if (!bundle || !user) return;
    const previous = bundle.version;
    setError(null);
    try {
      const { parseManuscript } = await import("./parse");
      const parsed = await parseManuscript(file);
      await importVersion({ manuscript: bundle.manuscript, userId: user.id, file, parsed });
      await refresh();
      if (previous) await run.verify(previous.id);
    } catch (cause) {
      setError(errorMessage(cause, "The new version could not be read."));
    }
  };

  const busy = !!run.progress;
  const m = bundle?.manuscript;
  const kind = MANUSCRIPT_KINDS.find((k) => k.key === m?.kind)?.label ?? "Manuscript";
  const openChapter = search.chapter ? chapterMap.get(search.chapter) : undefined;

  return (
    <AppShell
      section="manuscripts"
      back={{ label: "Manuscripts", href: "/manuscripts" }}
      trackLabel={m?.title ?? "Manuscript"}
      breadcrumb={
        <Crumbs
          items={[
            { label: "Manuscripts", to: "/manuscripts" },
            { label: m?.title ?? "Manuscript" },
          ]}
        />
      }
      scroll
      tabs={
        <TabRow
          tabs={MANUSCRIPT_TABS.map((id) => ({ id, label: TAB_LABEL[id] }))}
          active={tab}
          onChange={(id) => go({ tab: id })}
          right={
            bundle?.version && (
              <Button
                variant="quiet"
                onClick={exportReport}
                title="Open and accepted findings, author queries first, as a Word document"
              >
                Editorial report
              </Button>
            )
          }
        />
      }
      assistant={{
        key: `manuscript.${manuscriptId}`,
        screen: "Book Review",
        label: m?.title ?? "Manuscript",
        intro: "Ask about this manuscript's chapters, findings or style sheet.",
      }}
    >
      <div className="rv ms-screen">
        <ActionError error={error ?? run.error} onDismiss={() => (setError(null), run.clear())} />
        {query.isError && (
          <p role="alert" className="ms-error">
            {(query.error as Error).message}
          </p>
        )}
        {m && (
          <header className="ms-head">
            <div>
              <h1>{m.title}</h1>
              <p className="ms-muted">
                {[
                  kind,
                  m.author,
                  bundle?.version
                    ? `${bundle.version.wordCount.toLocaleString("en-GB")} words`
                    : "",
                  bundle?.version ? `version ${bundle.version.versionNo}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {m.private ? " · private to you" : ""}
              </p>
            </div>
            {m.createdBy === user?.id && (
              <Button
                variant="quiet"
                onClick={() =>
                  void attempt(
                    "Could not change who sees it",
                    async () => {
                      await setManuscriptPrivate(m, !m.private);
                      await refresh();
                    },
                    setError,
                  )
                }
              >
                {m.private ? "Share with the firm" : "Make private"}
              </Button>
            )}
          </header>
        )}
        {run.progress && <RunBar progress={run.progress} onCancel={run.cancel} />}
        {run.notice && !run.progress && (
          <p className="ms-notice" role="status">
            {run.notice}
          </p>
        )}
        {query.isLoading && <p role="status">Loading the manuscript…</p>}
        {bundle && tab === "overview" && (
          <Overview
            bundle={bundle}
            nodes={nodes}
            chapters={chapterMap}
            busy={busy}
            onRun={(scope, keys) => void run.review(scope, keys)}
            onFilter={(category) => {
              setFindingFilter({ ...NO_FILTER, category });
              go({ tab: "findings" });
            }}
            onDecide={decide}
            onOpenPlace={openPlace}
            refs={refs}
          />
        )}
        {bundle && tab === "chapters" && !openChapter && (
          <ChapterList
            chapters={bundle.chapters}
            findings={bundle.findings}
            busy={busy}
            onOpen={(k) => go({ tab: "chapters", chapter: k })}
            onReview={(k) => void run.review("chapters", [k])}
          />
        )}
        {bundle && tab === "chapters" && openChapter && (
          <ChapterView
            chapter={openChapter}
            nodes={bundle.nodes.filter(
              (n) => n.chapterKey === openChapter.chapterKey || n.key === openChapter.chapterKey,
            )}
            allNodes={nodes}
            chapters={chapterMap}
            findings={bundle.findings}
            focus={search.node ?? null}
            busy={busy}
            onBack={() => go({ tab: "chapters" })}
            onReview={() => void run.review("chapters", [openChapter.chapterKey])}
            onDecide={decide}
            onDecideMany={decideMany}
            onOpenPlace={openPlace}
            refs={refs}
          />
        )}
        {bundle && tab === "findings" && (
          <FindingsPanel
            key={JSON.stringify(findingFilter)}
            findings={bundle.findings}
            nodes={nodes}
            chapters={chapterMap}
            onDecide={decide}
            onDecideMany={decideMany}
            onOpenPlace={openPlace}
            initial={findingFilter}
            refs={refs}
          />
        )}
        {bundle && tab === "style" && (
          <StylePanel
            rules={bundle.rules}
            onSave={async (d) => {
              await attempt(
                "The rule could not be saved",
                () => saveRule(manuscriptId, d),
                setError,
              );
              await refresh();
            }}
            onDelete={async (id) => {
              await attempt("The rule could not be deleted", () => deleteRule(id), setError);
              await refresh();
            }}
          />
        )}
        {bundle && tab === "map" && (
          <MapPanel
            manuscript={bundle.manuscript}
            chapters={bundle.chapters}
            busy={busy}
            onOpenChapter={(k) => go({ tab: "chapters", chapter: k })}
            onMap={() => void run.review("consistency")}
          />
        )}
        {bundle && tab === "versions" && (
          <Versions
            bundle={bundle}
            busy={busy}
            onUpload={(file) => void uploadAndVerify(file)}
            onVerify={(prev) => void run.verify(prev)}
          />
        )}
      </div>
    </AppShell>
  );
}
