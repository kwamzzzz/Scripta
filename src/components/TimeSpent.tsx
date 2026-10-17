/**
 * The clock, on screen. One pill, reusable by every workflow tool.
 *
 *     <TimeSpent subject={{ kind: "matter", id: matter.id, label: matter.name }} />
 *
 * That is the whole integration. The pill finds the workspace itself, reads
 * the record for that subject, runs the clock, keeps the heartbeat going and
 * writes the sitting. A tool that wants to be timed adds this line and nothing
 * else — no column, no migration, no second timer. The kinds that can be timed
 * are `TIME_SUBJECTS` in `time-spent.ts`.
 *
 * ---------------------------------------------------------------------------
 * IT IS OFF UNTIL IT IS ASKED FOR
 * ---------------------------------------------------------------------------
 *
 * Nothing starts on its own. A timer that runs whenever a screen is open
 * records the tab a lawyer forgot about, which makes every number it ever
 * shows worthless. Pressing Start is the act that says "I am working on this",
 * and while it runs the only thing that keeps it running is this pill saying
 * so every twenty seconds. Close the tab, close the laptop, and the sitting is
 * settled at the last beat — see `countedIn`.
 *
 * Pause keeps the sitting, so five minutes away does not split a morning in
 * two. Stop closes it, so the next start is a new sitting on the record.
 */
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Pause, Play, RotateCcw, Square, Timer } from "lucide-react";
import { useApp } from "@/store/app";
import {
  beatTiming,
  loadTimeSpent,
  pauseTiming,
  proposeTimeNarrative,
  recordTime,
  resetTiming,
  startTiming,
} from "@/lib/time.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import {
  ACTIVITY_CODES,
  BEAT_EVERY,
  formatSpan,
  formatUnits,
  formatUnitSpan,
  formatWorked,
  isRunning,
  totalOf,
  unitsFor,
  UNIT_MINUTES,
  type Sitting,
  type TimeSubject,
} from "@/lib/time-spent";
import { C } from "@/lib/tokens";

export default function TimeSpent({
  subject,
  /** The file the time is billed to, where the subject is not itself a matter. */
  matterId,
}: {
  subject: TimeSubject;
  matterId?: string | null;
}) {
  const { workspaceId } = useApp();
  const qc = useQueryClient();
  const load = useServerFn(loadTimeSpent);
  const start = useServerFn(startTiming);
  const beat = useServerFn(beatTiming);
  const putDown = useServerFn(pauseTiming);
  const write = useServerFn(recordTime);
  const discard = useServerFn(resetTiming);
  const draftNarrative = useServerFn(proposeTimeNarrative);
  const key = ["time-spent", subject.kind, subject.id];
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  /**
   * Writing the time up.
   *
   * The clock is evidence; the entry is a statement somebody signs. So it is
   * never written by pressing stop: the figure, the narrative, the code and
   * whether it is billable are all in front of the lawyer, and all editable,
   * before anything is recorded.
   */
  const [writing, setWriting] = useState(false);
  const [units, setUnits] = useState(0);
  const [narrative, setNarrative] = useState("");
  const [code, setCode] = useState<string>(ACTIVITY_CODES[0].code);
  const [billable, setBillable] = useState(true);
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const record = useQuery({
    queryKey: key,
    queryFn: () => load({ data: { subjectKind: subject.kind, subjectId: subject.id } }),
    enabled: !!subject.id,
    retry: false,
  });

  /* The second hand. Only while the clock runs, so a screen with a stopped
     timer on it is not re-rendering once a second for nothing. */
  const [, tick] = useState(0);
  const sittings: Sitting[] = record.data?.sittings ?? [];
  const open = record.data?.open ?? null;
  const running = isRunning(open, Date.now());

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  /* The heartbeat. This is what tells the record the app is still here, and
     its absence is what ends a sitting when the app has gone. */
  const openId = open?.id ?? null;
  useEffect(() => {
    if (!running || !openId) return;
    const id = window.setInterval(() => {
      void beat({ data: { id: openId } }).then(() => qc.invalidateQueries({ queryKey: key }));
    }, BEAT_EVERY * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, openId]);

  /**
   * A tab closing is the common way a sitting ends, and waiting for the
   * heartbeat to lapse would throw away up to a beat of real work. This gives
   * the server the last word on the way out; if the browser refuses to send
   * it, the heartbeat rule still settles the sitting honestly.
   */
  useEffect(() => {
    if (!running || !openId) return;
    const leaving = () => void beat({ data: { id: openId } }).catch(() => {});
    window.addEventListener("pagehide", leaving);
    return () => window.removeEventListener("pagehide", leaving);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, openId]);

  const act = useMutation({
    mutationFn: async (what: "start" | "pause" | "stop") => {
      if (what === "start") {
        if (!workspaceId) return null;
        return start({
          data: {
            workspaceId,
            subjectKind: subject.kind,
            subjectId: subject.id,
            label: subject.label,
          },
        });
      }
      if (!openId) return null;
      return putDown({ data: { id: openId, ...(what === "stop" ? { stop: true } : {}) } });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const total = totalOf(sittings, Date.now());

  /**
   * Opening the form stops the clock, because time being written up is not
   * time being worked, and offers the clock's reading rounded up to the
   * firm's unit. Scripta drafts the narrative from what the sitting actually
   * did — see `proposeTimeNarrative` — and the lawyer edits it.
   */
  const startWriting = async (open: boolean) => {
    setWriting(open);
    setProblem(null);
    if (!open) return;
    if (running && openId) {
      await putDown({ data: { id: openId } });
      await qc.invalidateQueries({ queryKey: key });
    }
    setUnits(Math.max(1, unitsFor(total)));
    setDay(new Date().toISOString().slice(0, 10));
    setNarrative("Reading what was done…");
    try {
      const drafted = await draftNarrative({
        data: {
          matterId: matterId ?? (subject.kind === "matter" ? subject.id : null),
          subjectKind: subject.kind,
          subjectId: subject.id,
          label: subject.label,
        },
      });
      setNarrative(drafted.narrative);
    } catch {
      setNarrative(`Reviewing ${subject.label}.`);
    }
  };

  const save = async () => {
    if (saving || !workspaceId) return;
    setSaving(true);
    setProblem(null);
    try {
      await write({
        data: {
          workspaceId,
          matterId: matterId ?? (subject.kind === "matter" ? subject.id : null),
          subjectKind: subject.kind,
          subjectId: subject.id,
          minutes: units * UNIT_MINUTES,
          narrative,
          activityCode: code,
          billable,
          workedOn: day,
        },
      });
      await qc.invalidateQueries();
      setWriting(false);
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "The time could not be recorded.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    const yes = await confirmDelete({
      // In the unit a lawyer thinks in, and reading properly after "Delete".
      what: `the ${formatUnits(unitsFor(total))} hours on the clock for ${subject.label}`,
      count: 1,
      consequence: "The clock goes back to zero. Time you have already written up is not affected.",
      archivable: false,
      binned: false,
    });
    if (!yes) return;
    await discard({ data: { subjectKind: subject.kind, subjectId: subject.id } });
    await qc.invalidateQueries({ queryKey: key });
  };
  const closed = sittings.filter((s) => s.endedAt).length;
  const press = useCallback(
    (what: "start" | "pause" | "stop") => () => act.mutate(what),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openId, subject.id],
  );

  /* Without a workspace there is nowhere to file a sitting, and a subject with
     no id is a screen still loading. Either way there is nothing to time yet. */
  if (!subject.id || !workspaceId || record.isError) return null;

  const button = (
    label: string,
    hint: string,
    icon: React.ReactNode,
    on: () => void,
    strong = false,
  ) => (
    <button
      type="button"
      title={hint}
      aria-label={label}
      onClick={on}
      disabled={act.isPending}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        border: 0,
        background: "transparent",
        color: strong ? C.accent : C.muted,
        borderRadius: 5,
        padding: "2px 4px",
        cursor: act.isPending ? "default" : "pointer",
        font: "inherit",
        lineHeight: 1,
      }}
    >
      {icon}
    </button>
  );

  return (
    <span
      title={
        total > 0
          ? `Time on ${subject.label}: ${formatWorked(total)}${
              closed ? ` across ${closed + (open ? 1 : 0)} sittings` : ""
            }. Nothing is counted while the app is closed.`
          : `No time recorded on ${subject.label} yet. Press start when you begin work on it.`
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        border: `1px solid ${running ? C.accentEdge : C.border}`,
        borderRadius: 999,
        background: running ? "#fff" : "transparent",
        fontSize: 12,
        color: C.text,
      }}
    >
      <Timer size={13} strokeWidth={1.6} color={running ? C.accent : C.muted} />
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          minWidth: 38,
          textAlign: "right",
          color: total ? C.text : C.muted,
        }}
      >
        {formatSpan(total)}
      </span>
      {running
        ? button(
            "Pause the timer",
            "Pause — the sitting stays open",
            <Pause size={13} />,
            press("pause"),
            true,
          )
        : button(
            "Start the timer",
            open ? "Continue this sitting" : "Start timing your work on this",
            <Play size={13} />,
            press("start"),
            true,
          )}
      {open &&
        button(
          "Stop the timer",
          "Stop — closes the sitting, so the next start is a new one",
          <Square size={12} />,
          press("stop"),
        )}

      {total > 0 && (
        <>
          {button(
            "Discard the time on the clock",
            "Discard — puts the clock back to zero. Time already written up is not affected.",
            <RotateCcw size={12} />,
            () => void reset(),
          )}

          <Popover open={writing} onOpenChange={(next) => void startWriting(next)}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Done — write this time up against the file"
                aria-label="Record this time"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  border: `1px solid ${C.accentEdge}`,
                  background: "#fff",
                  color: C.accent,
                  borderRadius: 999,
                  padding: "1px 8px",
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 11,
                  lineHeight: 1.7,
                }}
              >
                <Check size={11} />
                Record
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="tm-record">
              <header>
                <strong>Record {formatUnits(units)} hours</strong>
                <span>
                  the clock read {formatWorked(total)} · {UNIT_MINUTES}-minute units, rounded up
                </span>
              </header>

              <div className="tm-row">
                <label>
                  Time
                  <span className="tm-units">
                    <button
                      type="button"
                      aria-label="Less"
                      onClick={() => setUnits((u) => Math.max(1, u - 1))}
                    >
                      −
                    </button>
                    <b title={formatUnitSpan(units)}>{formatUnits(units)}</b>
                    <button type="button" aria-label="More" onClick={() => setUnits((u) => u + 1)}>
                      +
                    </button>
                  </span>
                </label>
                <label>
                  Date
                  <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
                </label>
              </div>

              <label>
                Narrative <i>what the client reads</i>
                <textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} />
              </label>

              <div className="tm-row">
                <label>
                  Activity
                  <select value={code} onChange={(e) => setCode(e.target.value)}>
                    {ACTIVITY_CODES.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} · {a.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tm-billable">
                  <input
                    type="checkbox"
                    checked={billable}
                    onChange={(e) => setBillable(e.target.checked)}
                  />
                  Billable
                </label>
              </div>

              {problem && (
                <p className="tm-problem" role="alert">
                  {problem}
                </p>
              )}

              <footer>
                <span>Written to this file&rsquo;s time record</span>
                <button type="button" disabled={saving} onClick={() => void save()}>
                  {saving ? "Recording…" : "Record time"}
                </button>
              </footer>
            </PopoverContent>
          </Popover>
        </>
      )}
      {confirmDialog}
    </span>
  );
}
