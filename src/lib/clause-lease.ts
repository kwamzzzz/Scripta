/**
 * Who is in this clause.
 *
 * ---------------------------------------------------------------------------
 * A LEASE IS NEVER A PERMISSION
 * ---------------------------------------------------------------------------
 *
 * Nothing in this file grants anybody anything. Holding a clause does not make
 * you able to write it — `can_write_matter` decides that, on the server, on
 * every save, whether or not a lease exists. A lease answers one question only:
 * is somebody else at the keyboard right now.
 *
 * The consequence to keep in mind while reading the components: a control is
 * never enabled BECAUSE the lease was taken. The lease is a reason to warn, and
 * a reason to refuse, and never a reason to allow.
 *
 * ---------------------------------------------------------------------------
 * WHY EXPIRY IS POLLED AND ARRIVAL IS PUSHED
 * ---------------------------------------------------------------------------
 *
 * A lease lapses on a clock. Nobody writes a row when it does, so there is no
 * change to publish and no push that could carry it — an expiry is not an
 * event, it is the absence of one. So presence is refetched on a short timer,
 * which is the mechanism that actually matches the fact.
 *
 * Somebody ARRIVING is a row, so that comes through realtime and lands at once.
 * The two together are what make the strip feel immediate without ever showing
 * a colleague as present three minutes after they closed the laptop.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

/** Well inside the two-minute lease, so one dropped beat is not a lost clause. */
const HEARTBEAT_MS = 45_000;
const PRESENCE_MS = 15_000;

export type Lease = {
  holder: string;
  holderName: string;
  since: string;
  expiresAt: string;
  isMine: boolean;
};

export type Holding =
  | { state: "idle" }
  | { state: "held"; until: string }
  /** Somebody else has it. You may read; you may not save. */
  | { state: "occupied"; by: string; byName: string; until: string }
  /** You had it and it went — expired, or the Lead took it. */
  | { state: "lost"; byName: string | null };

export type Present = {
  userId: string;
  name: string;
  clauseId: string;
  clauseNum: string | null;
  since: string;
};

const asLease = (row: Record<string, unknown>): Lease => ({
  holder: String(row["holder"]),
  holderName: String(row["holder_name"] ?? "Somebody"),
  since: String(row["since"] ?? ""),
  expiresAt: String(row["expires_at"] ?? ""),
  isMine: row["is_mine"] === true,
});

/** The current lease on one clause, or null. Read-only; takes nothing. */
export function useClauseLease(clauseId: string | null | undefined) {
  return useQuery({
    queryKey: ["clause-lease", clauseId],
    enabled: !!clauseId,
    refetchInterval: PRESENCE_MS,
    queryFn: async (): Promise<Lease | null> => {
      const { data, error } = await db.rpc("clause_lease", { _clause: clauseId });
      if (error) return null;
      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      return row ? asLease(row) : null;
    },
  });
}

/**
 * Hold a clause while you are working in it.
 *
 * Takes on open, beats while you stay, releases when you leave. The heartbeat
 * deliberately cannot acquire: `refresh_clause` extends a lease you still hold
 * and returns null otherwise, so a client that lost the clause can never creep
 * back into it the moment the new holder's lease lapses.
 *
 * When you lose it the state says so and the caller keeps whatever is on the
 * screen. Losing a lease must never cost anybody a sentence they typed.
 */
export function useHoldClause(clauseId: string | null | undefined, enabled: boolean) {
  const [holding, setHolding] = useState<Holding>({ state: "idle" });
  const qc = useQueryClient();
  const held = useRef(false);

  const take = useCallback(async () => {
    if (!clauseId) return;
    const { data, error } = await db.rpc("take_clause", { _clause: clauseId });
    if (error) {
      // Refused — a Reader, or a matter that is not yours. Not an occupancy,
      // and not something to dress up as one.
      setHolding({ state: "idle" });
      return;
    }
    const row = (data ?? [])[0] as Record<string, unknown> | undefined;
    if (!row) return;
    if (row["taken"] === true) {
      held.current = true;
      setHolding({ state: "held", until: String(row["expires_at"]) });
    } else {
      held.current = false;
      setHolding({
        state: "occupied",
        by: String(row["holder"]),
        byName: String(row["holder_name"] ?? "another lawyer"),
        until: String(row["expires_at"]),
      });
    }
    void qc.invalidateQueries({ queryKey: ["clause-lease", clauseId] });
  }, [clauseId, qc]);

  useEffect(() => {
    if (!clauseId || !enabled) {
      setHolding({ state: "idle" });
      return;
    }
    let alive = true;
    void take();

    const beat = window.setInterval(() => {
      if (!held.current) return;
      void (async () => {
        const { data } = await db.rpc("refresh_clause", { _clause: clauseId });
        if (!alive) return;
        if (data) {
          setHolding({ state: "held", until: String(data) });
        } else {
          // It went. Say so; change nothing else.
          held.current = false;
          setHolding({ state: "lost", byName: null });
          void qc.invalidateQueries({ queryKey: ["clause-lease", clauseId] });
        }
      })();
    }, HEARTBEAT_MS);

    return () => {
      alive = false;
      window.clearInterval(beat);
      if (held.current) {
        held.current = false;
        void db.rpc("release_clause", { _clause: clauseId });
      }
    };
  }, [clauseId, enabled, take, qc]);

  return { holding, retake: take };
}

/**
 * Take a clause out of a colleague's hands.
 *
 * Lead only, and the server is what says so — this mutation exists so the
 * control has something to call, not so the interface can decide who may. It is
 * audited, and the interrupted lawyer is told through the awareness layer.
 */
export function useBreakLease(clauseId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("break_clause_lease", { _clause: clauseId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clause-lease", clauseId] });
      void qc.invalidateQueries({ queryKey: ["presence"] });
    },
  });
}

/** Everybody else currently in a clause on this matter. Never yourself. */
export function useMatterPresence(matterId: string | null | undefined) {
  return useQuery({
    queryKey: ["presence", matterId],
    enabled: !!matterId,
    refetchInterval: PRESENCE_MS,
    queryFn: async (): Promise<Present[]> => {
      const { data, error } = await db.rpc("matter_presence", { _matter: matterId });
      /* Knowing who is in the document is a courtesy. A screen must not fail
         because a courtesy could not be computed. */
      if (error) return [];
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        userId: String(row["user_id"]),
        name: String(row["name"] ?? "Somebody"),
        clauseId: String(row["clause_id"]),
        clauseNum: (row["clause_num"] as string | null) ?? null,
        since: String(row["since"] ?? ""),
      }));
    },
  });
}
