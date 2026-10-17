/**
 * Running the review over a whole document.
 *
 * Clauses go up in small batches so a long contract shows progress instead of a
 * spinner, and every clause is written as it finishes — a failure on clause 40
 * never discards the first thirty-nine. The run keeps going after a clause
 * fails; only a payment or permission refusal from the gateway stops it, because
 * the next clause would fail the same way.
 */
import { useCallback, useRef, useState } from "react";
import { finishReviewRun, reviewClauses } from "./functions";
import { checkScheduleConformity } from "./conformity.functions";

const BATCH = 4;

export type RunState = { done: number; of: number } | null;

export function useReviewRun(onProgress: () => void) {
  const [state, setState] = useState<RunState>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const run = useCallback(
    async (matterId: string, clauseIds: string[]) => {
      if (clauseIds.length === 0) return;
      cancelled.current = false;
      setError(null);
      setState({ done: 0, of: clauseIds.length });
      let reviewed = 0;
      let failed = 0;
      let issues = 0;
      let stopped = false;
      try {
        for (let i = 0; i < clauseIds.length && !cancelled.current; i += BATCH) {
          const batch = clauseIds.slice(i, i + BATCH);
          const out = await reviewClauses({ data: { matterId, clauseIds: batch } });
          for (const r of out.results) {
            if (r.ok) {
              reviewed += 1;
              issues += r.issues ?? 0;
            } else {
              failed += 1;
              if (!r.retryable) {
                setError(r.error ?? "The review could not continue.");
                stopped = true;
              }
            }
          }
          setState({ done: Math.min(i + batch.length, clauseIds.length), of: clauseIds.length });
          onProgress();
          if (stopped) break;
        }
        // Then the contract as a whole: does the agreement agree with its
        // schedules? A failure here costs the conformity findings only, never
        // the clause review that has just been written.
        if (!stopped && !cancelled.current)
          await checkScheduleConformity({ data: { matterId } }).catch((e: unknown) =>
            setError(
              `The clauses were reviewed, but the check against the schedules did not run: ${e instanceof Error ? e.message : "unknown error"}`,
            ),
          );
        await finishReviewRun({
          data: { matterId, reviewed, failed: failed + (stopped ? 1 : 0), issues },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "The review failed.");
      } finally {
        setState(null);
        onProgress();
      }
      return { reviewed, failed, issues };
    },
    [onProgress],
  );

  return {
    run,
    state,
    error,
    cancel: () => (cancelled.current = true),
    clearError: () => setError(null),
  };
}
