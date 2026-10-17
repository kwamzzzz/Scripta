/**
 * A chart's design, kept for the firm, and the undo history of drawing it.
 *
 * Changes show at once and are written shortly after, as one document per
 * client per chart. The row carries a version: if a colleague saved in
 * between, the changes made here are applied again on top of theirs rather
 * than overwriting them.
 *
 * The first time a chart is opened with no design, the style this browser
 * chose before designs were shared is carried over. Cards moved by hand in
 * that browser are not: they were offsets from a layout that has since changed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Organisation } from "../model";
import {
  EMPTY_DESIGN,
  readDesign,
  type ChartDesign,
  type ChartKind,
  type DesignOp,
} from "./design";
import { legacyStyle } from "./style";

type Row = { design: unknown; version: number } | null;

export const chartDesignKey = (clientId: string, kind: ChartKind) => [
  "org-chart-design",
  clientId,
  kind,
];

export type SaveState = "saved" | "saving" | "error";

async function load(clientId: string, kind: ChartKind): Promise<Row> {
  const { data, error } = await supabase
    .from("org_chart_designs")
    .select("design, version")
    .eq("client_id", clientId)
    .eq("kind", kind)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { design: data.design, version: data.version } : null;
}

export function useChartDesign(
  org: Pick<Organisation, "workspaceId" | "clientId">,
  kind: ChartKind,
) {
  const qc = useQueryClient();
  const key = chartDesignKey(org.clientId, kind);
  const query = useQuery({
    queryKey: key,
    retry: false,
    queryFn: () => load(org.clientId, kind),
  });
  const [design, setDesign] = useState<ChartDesign>(EMPTY_DESIGN);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const current = useRef<ChartDesign>(EMPTY_DESIGN);
  const pending = useRef<DesignOp[]>([]);
  const version = useRef<number | null>(null);
  const timer = useRef<number | null>(null);
  const saving = useRef(false);

  // Take the stored design when it arrives, unless there are changes here not yet written.
  useEffect(() => {
    if (!query.isSuccess || pending.current.length || saving.current) return;
    const row = query.data;
    version.current = row?.version ?? null;
    const next = row
      ? readDesign(row.design)
      : { ...EMPTY_DESIGN, style: legacyStyle(org.clientId, kind) ?? EMPTY_DESIGN.style };
    current.current = next;
    setDesign(next);
    setReady(true);
  }, [query.isSuccess, query.data, org.clientId, kind]);

  const write = useCallback(async () => {
    if (saving.current) return;
    const ops = pending.current.splice(0);
    if (!ops.length) return;
    saving.current = true;
    setState("saving");
    let ok = false;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const doc = current.current;
        const known = version.current;
        if (known === null) {
          const { error: insertError } = await supabase.from("org_chart_designs").insert({
            workspace_id: org.workspaceId,
            client_id: org.clientId,
            kind,
            design: doc as never,
            version: 1,
          });
          if (!insertError) {
            version.current = 1;
            qc.setQueryData(key, { design: doc, version: 1 });
            break;
          }
          if (insertError.code !== "23505") throw new Error(insertError.message);
        } else {
          const { data, error: updateError } = await supabase
            .from("org_chart_designs")
            .update({ design: doc as never, version: known + 1 })
            .eq("client_id", org.clientId)
            .eq("kind", kind)
            .eq("version", known)
            .select("version");
          if (updateError) throw new Error(updateError.message);
          if (data?.length) {
            version.current = known + 1;
            qc.setQueryData(key, { design: doc, version: known + 1 });
            break;
          }
        }
        // Someone saved in between: apply this session's changes to theirs.
        const theirs = await load(org.clientId, kind);
        version.current = theirs?.version ?? null;
        const merged = ops.reduce((d, op) => op(d), readDesign(theirs?.design));
        current.current = merged;
        setDesign(merged);
        if (attempt === 2) throw new Error("The chart was changed elsewhere; try again.");
      }
      ok = true;
      setError(null);
      setState(pending.current.length ? "saving" : "saved");
    } catch (cause) {
      // Keep the changes to write on the next attempt.
      pending.current.unshift(...ops);
      setError(cause instanceof Error ? cause.message : "The chart's design was not saved.");
      setState("error");
    } finally {
      saving.current = false;
      if (ok && pending.current.length) timer.current = window.setTimeout(() => void write(), 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.workspaceId, org.clientId, kind]);

  const schedule = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void write(), 500);
  }, [write]);

  // Write what is waiting before the page goes.
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (pending.current.length) void write();
    },
    [write],
  );

  /** Applies a change to the design; returns the design before and after. */
  const apply = useCallback(
    (op: DesignOp) => {
      const before = current.current;
      const after = op(before);
      if (after === before) return { before, after };
      current.current = after;
      pending.current.push(op);
      setDesign(after);
      setState("saving");
      schedule();
      return { before, after };
    },
    [schedule],
  );

  const retry = useCallback(() => void write(), [write]);

  return {
    design,
    ready,
    loading: query.isLoading,
    loadError: query.isError ? (query.error as Error).message : null,
    state,
    error,
    apply,
    retry,
  };
}

export type Step = {
  label: string;
  undo: () => void | Promise<unknown>;
  redo: () => void | Promise<unknown>;
};

/** Undo and redo for a drawing session: design changes and record changes alike. */
export function useUndo(limit = 100) {
  const past = useRef<Step[]>([]);
  const future = useRef<Step[]>([]);
  const [, bump] = useState(0);
  const [busy, setBusy] = useState(false);
  const refresh = () => bump((n) => n + 1);

  const push = useCallback(
    (step: Step) => {
      past.current = [...past.current.slice(-(limit - 1)), step];
      future.current = [];
      refresh();
    },
    [limit],
  );

  const undo = useCallback(async () => {
    const step = past.current.at(-1);
    if (!step || busy) return;
    setBusy(true);
    try {
      await step.undo();
      past.current = past.current.slice(0, -1);
      future.current = [...future.current, step];
    } finally {
      setBusy(false);
      refresh();
    }
  }, [busy]);

  const redo = useCallback(async () => {
    const step = future.current.at(-1);
    if (!step || busy) return;
    setBusy(true);
    try {
      await step.redo();
      future.current = future.current.slice(0, -1);
      past.current = [...past.current, step];
    } finally {
      setBusy(false);
      refresh();
    }
  }, [busy]);

  return {
    push,
    undo,
    redo,
    busy,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    undoLabel: past.current.at(-1)?.label ?? null,
    redoLabel: future.current.at(-1)?.label ?? null,
  };
}
