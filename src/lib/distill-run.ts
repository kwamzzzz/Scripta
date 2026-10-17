/**
 * Running a distillation from the browser: start a run, read its windows a
 * few at a time (each is one short request), then finish it. A window that
 * fails is tried once more; if the run cannot finish it is taken back out and
 * the previous distillation stands.
 */
import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  abandonDistillation,
  distilWindow,
  finaliseDistillation,
  startDistillation,
} from "@/lib/distiller.functions";

export type RunProgress = { done: number; total: number; phase: "reading" | "finishing" };

const AT_ONCE = 3;

export function useDistillRun(transcriptId: string, onChange: () => void) {
  const start = useServerFn(startDistillation);
  const readWindow = useServerFn(distilWindow);
  const finalise = useServerFn(finaliseDistillation);
  const abandon = useServerFn(abandonDistillation);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    let runId: string | null = null;
    try {
      const started = await start({ data: { transcriptId } });
      runId = started.runId;
      const total = started.windows.length;
      setProgress({ done: 0, total, phase: "reading" });
      onChange();
      let next = 0;
      let done = 0;
      const worker = async () => {
        while (next < total) {
          const index = next++;
          const once = () => readWindow({ data: { transcriptId, runId: runId!, index } });
          await once().catch(once);
          done += 1;
          setProgress({ done, total, phase: "reading" });
        }
      };
      await Promise.all(Array.from({ length: Math.min(AT_ONCE, total) }, worker));
      setProgress({ done, total, phase: "finishing" });
      const finish = () => finalise({ data: { transcriptId, runId: runId! } });
      await finish().catch(finish);
    } catch (e) {
      const message = e instanceof Error ? e.message : "The distillation did not finish.";
      setError(message);
      if (runId)
        await abandon({ data: { transcriptId, runId, error: message.slice(0, 500) } }).catch(
          () => {},
        );
    } finally {
      running.current = false;
      setProgress(null);
      onChange();
    }
  }, [transcriptId, start, readWindow, finalise, abandon, onChange]);

  return { run, progress, error, clearError: () => setError(null) };
}
