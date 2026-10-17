/**
 * The time written up against this file.
 *
 * The clock in the header measures; this is what was said about it. Every row
 * is a statement a lawyer confirmed — a day, a figure in the firm's units, the
 * narrative a client will read, an activity code and whether it is billable —
 * and it is here rather than in a separate system because the questions it
 * answers are asked while looking at the file: how long has this taken, what
 * have we written off, is there a day missing.
 *
 * Totals are computed, never stored. Billable and non-billable are shown apart
 * because a total that mixes them is the number nobody wanted.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { Card } from "@/review/ui";
import { loadTimeEntries, unrecordTime, type TimeEntry } from "@/lib/time.functions";
import { ACTIVITY_CODES, UNIT_MINUTES, formatUnits } from "@/lib/time-spent";
import { C } from "@/lib/tokens";

const day = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

const codeLabel = (code: string) => ACTIVITY_CODES.find((a) => a.code === code)?.label ?? code;

export default function TimeRecord({ matterId }: { matterId: string | null }) {
  const qc = useQueryClient();
  const load = useServerFn(loadTimeEntries);
  const drop = useServerFn(unrecordTime);

  const record = useQuery({
    queryKey: ["time-entries", matterId],
    queryFn: () => load({ data: { matterId: matterId! } }),
    enabled: !!matterId,
    retry: false,
  });

  const take = useMutation({
    mutationFn: (id: string) => drop({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries(),
  });

  /* Steady between renders, so the totals below are not recomputed for a list
     that has not changed. */
  const entries: TimeEntry[] = useMemo(() => record.data?.entries ?? [], [record.data]);
  const totals = useMemo(() => {
    const billable = entries.filter((e) => e.billable).reduce((n, e) => n + e.minutes, 0);
    const written = entries.filter((e) => !e.billable).reduce((n, e) => n + e.minutes, 0);
    return { billable, written };
  }, [entries]);

  if (!matterId || record.isError) return null;

  return (
    <Card
      title="Time on this file"
      hint={
        entries.length
          ? "What you have written up. The clock in the header measures; this is what you said about it."
          : undefined
      }
      right={
        entries.length ? (
          <span className="rv-time-total">
            <b>{formatUnits(totals.billable / UNIT_MINUTES)}</b> billable
            {totals.written > 0 && (
              <span> · {formatUnits(totals.written / UNIT_MINUTES)} written off</span>
            )}
          </span>
        ) : null
      }
    >
      {!entries.length ? (
        <p className="rv-time-empty">
          Nothing written up yet. Start the clock in the header and press Record when you finish.
        </p>
      ) : (
        <ul className="rv-time-list">
          {entries.map((entry) => (
            <li key={entry.id} className={entry.billable ? "" : "is-written-off"}>
              <span className="rv-time-day">{day(entry.workedOn)}</span>
              <span className="rv-time-hours" title={`${entry.minutes} minutes`}>
                {formatUnits(entry.minutes / UNIT_MINUTES)}
              </span>
              <span className="rv-time-what">
                {entry.narrative}
                <small>
                  {entry.activityCode} · {codeLabel(entry.activityCode)}
                  {entry.billable ? "" : " · written off"}
                </small>
              </span>
              <button
                type="button"
                title="Take this entry back — the time returns to the clock"
                aria-label="Take this entry back"
                disabled={take.isPending}
                onClick={() => take.mutate(entry.id)}
                style={{
                  border: 0,
                  background: "transparent",
                  color: C.muted,
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                }}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
