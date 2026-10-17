/**
 * The Daily Work Report.
 *
 * One question: what did I actually get done today, and what did I produce?
 *
 * The day is read from work already recorded, so it is correct whether or not
 * anybody was here at half past five. Once the day has closed it is frozen into
 * a record that stops moving — rename a task next week and last Tuesday still
 * says what you did last Tuesday. Any past day can be generated on request.
 *
 * The lawyer can correct a line, add context, or take an entry out. Nothing is
 * written on their behalf beyond what the work itself already said.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppShell, { Crumbs } from "@/components/AppShell";
import { Button } from "@/components/primitives";
import ActionError, { attempt } from "@/components/ActionError";
import { useApp } from "@/store/app";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/tokens";
import { longDate } from "@/lib/home-data";
import { listSaved, readDay, saveDay } from "@/lib/work-report/data";
import { exportWorkReport } from "@/lib/work-report/export.functions";
import { reportText } from "@/lib/work-report/export";
import { downloadBytes } from "@/lib/export/download";
import { useServerFn } from "@tanstack/react-start";
import {
  dayHasClosed,
  groupByMatter,
  localDay,
  reportSearchText,
  summarise,
  type WorkEntry,
} from "@/lib/work-report/model";
import "./work-report.css";

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export default function WorkReportScreen() {
  const { workspaceId } = useApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  const [day, setDay] = useState(() => localDay());
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [note, setNote] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const report = useQuery({
    queryKey: ["work-report", workspaceId, userId, day],
    enabled: !!workspaceId && !!userId,
    retry: false,
    queryFn: () => readDay(workspaceId!, userId!, day),
  });

  const history = useQuery({
    queryKey: ["work-reports", workspaceId, userId],
    enabled: !!workspaceId && !!userId,
    retry: false,
    queryFn: () => listSaved(workspaceId!, userId!),
  });

  // The day on screen is the day that was read. Editing changes this copy;
  // saving is what makes it the record.
  useEffect(() => {
    if (!report.data) return;
    setEntries(report.data.entries);
    setNote(report.data.note);
    setSavedAt(report.data.savedAt);
  }, [report.data]);

  const groups = useMemo(() => groupByMatter(entries), [entries]);
  const shown = entries.filter((e) => !e.excluded);
  const closed = dayHasClosed(day);
  const dirty =
    !!report.data &&
    (note !== report.data.note || JSON.stringify(entries) !== JSON.stringify(report.data.entries));

  /**
   * Freeze a day.
   *
   * What is written is passed in rather than read from state, because the
   * automatic freeze below fires the moment the day's data arrives — at which
   * point the state copy may not have caught up, and an empty report would be
   * written over a day that had four things in it. That is precisely what
   * happened the first time this ran.
   */
  const save = async (what: { entries: WorkEntry[]; note: string }) => {
    if (!workspaceId || !userId) return;
    setBusy(true);
    setActionError(null);
    const done = await attempt(
      `The report for ${day} could not be saved`,
      () => saveDay(workspaceId, userId, day, what),
      setActionError,
    );
    setBusy(false);
    if (!done) return;
    await queryClient.invalidateQueries({ queryKey: ["work-report", workspaceId, userId, day] });
    await queryClient.invalidateQueries({ queryKey: ["work-reports", workspaceId, userId] });
  };

  /**
   * A closed day that has never been frozen is frozen the moment it is looked
   * at, which is what "generated at half past five" means without a scheduled
   * job that can fail quietly. It only ever happens once per day.
   */
  useEffect(() => {
    if (!report.data || report.data.savedAt || !closed || busy) return;
    // A day with nothing in it is not frozen: there is nothing to preserve, and
    // work finished later would then be locked out by an empty record.
    if (!report.data.entries.length) return;
    void save({ entries: report.data.entries, note: report.data.note });
    // The report is the trigger; re-running on every edit would overwrite the
    // lawyer's own changes with a fresh derivation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.data, closed]);

  /**
   * The day as a file.
   *
   * What is sent up is what is on screen — corrections, added context and the
   * entries left out — so the document cannot disagree with the report it came
   * from. It is built on the server because that is where the firm's paper
   * lives, and a day's work should look like something the firm produced.
   */
  const exportFn = useServerFn(exportWorkReport);
  const [copied, setCopied] = useState(false);

  const download = async (format: "docx" | "pdf") => {
    if (!workspaceId) return;
    setBusy(true);
    setActionError(null);
    await attempt(
      `The report could not be exported`,
      async () => {
        const file = await exportFn({
          data: { workspaceId, day, format, entries: shown, note },
        });
        const binary = atob(file.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        downloadBytes(bytes, file.filename, file.mime);
      },
      setActionError,
    );
    setBusy(false);
  };

  /** Far the commonest thing a day gets used for: pasted into an email. */
  const copy = async () => {
    await attempt(
      "The report could not be copied",
      async () => {
        await navigator.clipboard.writeText(reportText(day, shown, note));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      setActionError,
    );
  };

  const patch = (id: string, change: Partial<WorkEntry>) =>
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...change } : e)));

  const regenerate = async () => {
    if (!workspaceId || !userId) return;
    setBusy(true);
    setActionError(null);
    const fresh = await attempt(
      `The report for ${day} could not be rebuilt`,
      async () => {
        const { deriveDay } = await import("@/lib/work-report/data");
        const list = await deriveDay(workspaceId, userId, day);
        // Notes and exclusions survive a rebuild: they are the lawyer's, and
        // rebuilding is asking Scripta to look again, not to forget.
        const kept = new Map(entries.map((e) => [e.id, e]));
        setEntries(
          list.map((e) => {
            const before = kept.get(e.id);
            return before ? { ...e, note: before.note, excluded: before.excluded } : e;
          }),
        );
      },
      setActionError,
    );
    setBusy(false);
    void fresh;
  };

  const matches = history.data?.filter(
    (r) =>
      !search.trim() || reportSearchText(r).toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <AppShell
      section="tasks"
      breadcrumb={
        <Crumbs items={[{ label: "Tasks", to: "/tasks" }, { label: "Daily Work Report" }]} />
      }
      assistant={{
        key: "work-report",
        screen: "Daily Work Report",
        suggestions: ["What did I finish this week?", "Which matters did I work on today?"],
      }}
    >
      <ActionError error={actionError} onDismiss={() => setActionError(null)} />
      <div className="wr-page">
        <div className="wr-main">
          <header className="wr-head">
            <div>
              <h1>{day === localDay() ? "Today" : longDate(day)}</h1>
              {/* A day is in one of three states and the difference matters:
                  kept means this is the record; read just now means nothing is
                  stored yet and leaving will not lose it, because it can always
                  be read again; still open means more may land before 5.30. */}
              <p>
                {day === localDay() ? `${longDate(day)} · ` : ""}
                {savedAt
                  ? `Kept at ${timeOf(savedAt)}`
                  : closed
                    ? "Read just now — keep it to make it the record"
                    : "Still open · kept automatically after 5.30pm"}
              </p>
            </div>
            <div className="wr-day-pick">
              <label>
                <span className="sr-only">Day</span>
                <input
                  type="date"
                  value={day}
                  max={localDay()}
                  onChange={(e) => e.target.value && setDay(e.target.value)}
                />
              </label>
              <Button onClick={() => void regenerate()} disabled={busy}>
                {busy ? "Working…" : "Rebuild"}
              </Button>
              <Button
                variant="primary"
                onClick={() => void save({ entries, note })}
                disabled={busy || !dirty}
              >
                {savedAt ? "Save changes" : "Keep this day"}
              </Button>
            </div>
          </header>

          {report.isLoading ? (
            <p role="status">Reading the day…</p>
          ) : report.isError ? (
            <p role="alert" style={{ color: C.red }}>
              {(report.error as Error).message}
            </p>
          ) : shown.length === 0 ? (
            <div className="wr-empty">
              <h2>Nothing completed on this day</h2>
              <p>
                The report lists the tasks you completed, with the matter each was filed to and what
                it produced. Work in progress does not appear, and neither does anything you opened,
                edited or read.
              </p>
            </div>
          ) : (
            <>
              <div className="wr-summary-row">
                <p className="wr-summary">{summarise(entries)}</p>
                {/* Word for the supervision note, PDF for the file, and the
                    clipboard for the thing a day is most often used for. */}
                <div className="wr-export">
                  <button type="button" onClick={() => void copy()}>
                    {copied ? "Copied" : "Copy for email"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => void download("docx")}>
                    Word
                  </button>
                  <button type="button" disabled={busy} onClick={() => void download("pdf")}>
                    PDF
                  </button>
                </div>
              </div>
              {groups.map((group) => (
                <section key={group.matterId ?? "none"} className="wr-group">
                  <h2>
                    {group.matterId ? (
                      <Link to="/matters/$matterId" params={{ matterId: group.matterId }}>
                        {group.matterName}
                      </Link>
                    ) : (
                      group.matterName
                    )}
                    <span>{group.entries.length}</span>
                  </h2>
                  {group.entries.map((entry) => (
                    <article key={entry.id} className="wr-entry">
                      <div className="wr-entry-head">
                        <input
                          className="wr-title"
                          value={entry.title}
                          aria-label="What was completed"
                          onChange={(e) => patch(entry.id, { title: e.target.value })}
                        />
                        <span className="wr-time">{timeOf(entry.at)}</span>
                      </div>
                      {(entry.tool || entry.output) && (
                        <div className="wr-facts">
                          {entry.tool && <span>{entry.tool}</span>}
                          {entry.output && <span className="wr-output">{entry.output}</span>}
                        </div>
                      )}
                      <textarea
                        className="wr-note"
                        rows={1}
                        value={entry.note ?? ""}
                        placeholder="Add context — what it was for, what it settled"
                        aria-label={`Context for ${entry.title}`}
                        onChange={(e) => patch(entry.id, { note: e.target.value })}
                      />
                      <footer>
                        {entry.href && (
                          <Link to={entry.href as never} className="wr-open">
                            Open the work
                          </Link>
                        )}
                        <button type="button" onClick={() => patch(entry.id, { excluded: true })}>
                          Leave out
                        </button>
                      </footer>
                    </article>
                  ))}
                </section>
              ))}

              {entries.some((e) => e.excluded) && (
                <section className="wr-left-out">
                  <h2>Left out of this report</h2>
                  {entries
                    .filter((e) => e.excluded)
                    .map((e) => (
                      <div key={e.id}>
                        <span>{e.title}</span>
                        <button type="button" onClick={() => patch(e.id, { excluded: false })}>
                          Put back
                        </button>
                      </div>
                    ))}
                </section>
              )}

              <section className="wr-day-note">
                <h2>Anything else about the day</h2>
                <textarea
                  rows={3}
                  value={note}
                  placeholder="Context that is not in the work itself — a call that moved something, a decision taken."
                  aria-label="Note on the day"
                  onChange={(e) => setNote(e.target.value)}
                />
              </section>
            </>
          )}
        </div>

        <aside className="wr-history" aria-label="Previous reports">
          <h2>Work history</h2>
          <input
            type="search"
            value={search}
            placeholder="Search your days"
            aria-label="Search previous reports"
            onChange={(e) => setSearch(e.target.value)}
          />
          {history.isLoading ? (
            <p role="status">Loading…</p>
          ) : !matches?.length ? (
            <p className="wr-history-empty">
              {search.trim()
                ? "No day matches that."
                : "Days are kept here once they close. Nothing yet."}
            </p>
          ) : (
            matches.map((r) => (
              <button
                key={r.day}
                type="button"
                className={`wr-history-row${r.day === day ? " is-open" : ""}`}
                onClick={() => setDay(r.day)}
              >
                <strong>{longDate(r.day)}</strong>
                <span>{summarise(r.entries)}</span>
              </button>
            ))
          )}
        </aside>
      </div>
    </AppShell>
  );
}
