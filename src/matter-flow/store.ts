/**
 * A matter's flow, kept in the database.
 *
 * Every action below takes the whole record and returns a new whole record,
 * which is the right shape to reason about a flow in and the wrong shape to
 * send to a database. So the two are kept apart: actions stay synchronous and
 * work on the record in hand, and a debounced writer works out what actually
 * moved (`flowDiff`) and writes only that. Nothing on screen waits for a round
 * trip to tick a checkbox.
 *
 * A matter that has never had a flow is seeded from its fixture — or, for
 * anyone who used Flow while it lived in browser storage, from the record
 * already in that browser, with ids remapped on the way up.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/store/app";
import { FIXTURES, type FixtureKind } from "./fixtures";
import { applyPresetBody, type ApplyOptions, type PresetBody } from "./presets/model";
import { createFlow, loadFlow, saveFlow, type FlowHead, type FlowKey } from "./flow-db";
import { flowDiff, isEmptyWrite } from "./flow-diff";
import { hasDatabaseIds, withDatabaseIds } from "./flow-import";
import {
  deriveFlow,
  isoDate,
  nextVersionLabel,
  reorderInPhase,
  uid,
  searchableText,
  type Deliverable,
  type EmailDraft,
  type Evidence,
  type ThreadAttachment,
  type ThreadEntry,
  type MatterFlowRecord,
  type Phase,
  type Version,
  type VersionTag,
  type WaitingOn,
} from "./model";

export const flowStorageKey = (matterId: string, fixture: FixtureKind) =>
  `px.flow.${matterId}.${fixture}`;

/** The flow this browser was holding before the tables existed, if any. */
function readLegacyFlow(matterId: string, fixture: FixtureKind): MatterFlowRecord | null {
  try {
    const raw = window.localStorage.getItem(flowStorageKey(matterId, fixture));
    if (!raw || raw === "null") return null;
    const parsed = JSON.parse(raw) as MatterFlowRecord;
    return parsed && parsed.matterId === matterId ? parsed : null;
  } catch {
    return null;
  }
}

/** Local midnight today as an ISO date; refreshed once a minute so a screen left open crosses midnight. */
export function useToday() {
  const [today, setToday] = useState(() => isoDate(new Date()));
  useEffect(() => {
    const tick = window.setInterval(() => setToday(isoDate(new Date())), 60_000);
    return () => window.clearInterval(tick);
  }, []);
  return today;
}

export type NewPhase = Omit<Phase, "id" | "matterId" | "order">;

/** How long a burst of edits is allowed to settle before it is written. */
const SETTLE_MS = 500;

export function useMatterFlow(key: FlowKey, fixture: FixtureKind) {
  const { workspaceId: currentWorkspaceId } = useApp();
  const queryClient = useQueryClient();
  const flowKeyId = "flowId" in key ? key.flowId : null;
  const matterKeyId = "matterId" in key ? key.matterId : null;
  // What this browser had before Flow moved server-side. Read once, to carry
  // up; never written back, so the stale copy cannot drift or be re-imported.
  // Only a matter's flow ever lived there.
  const legacy = useMemo(
    () => (matterKeyId ? readLegacyFlow(matterKeyId, fixture) : null),
    [matterKeyId, fixture],
  );
  const queryKey = useMemo(
    () => ["flow", currentWorkspaceId, flowKeyId ?? `matter:${matterKeyId}`],
    [currentWorkspaceId, flowKeyId, matterKeyId],
  );

  const server = useQuery({
    queryKey,
    enabled: !!currentWorkspaceId && !!(flowKeyId || matterKeyId),
    retry: false,
    queryFn: () =>
      loadFlow(currentWorkspaceId!, flowKeyId ? { flowId: flowKeyId } : { matterId: matterKeyId! }),
  });

  const [local, setLocal] = useState<MatterFlowRecord | null>(null);
  const flowId = useRef<string | null>(null);
  /** Where the flow is filed. Rows are written into the flow's own workspace. */
  const [head, setHead] = useState<FlowHead | null>(null);
  const workspaceId = head?.workspaceId ?? currentWorkspaceId;
  /** The record as the database last had it, to diff the next write against. */
  const written = useRef<MatterFlowRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  // First load: adopt what the server has, or put this matter's first flow there.
  const seeding = useRef(false);
  useEffect(() => {
    if (!currentWorkspaceId || !server.isSuccess) return;
    if (server.data) {
      // Where it is filed can change under an open screen (filing it into a
      // matter); what is in it is this screen's to keep.
      setHead(server.data.head);
      if (local) return;
      flowId.current = server.data.flowId;
      written.current = server.data.record;
      setLocal(server.data.record);
      return;
    }
    // A flow asked for by id that does not come back is unavailable. Nothing
    // is seeded in its place: making a new one would quietly hand the lawyer
    // an empty flow with the same address as the one they could not open.
    if (local || !matterKeyId || seeding.current) return;
    seeding.current = true;
    const carried = legacy ?? FIXTURES[fixture](matterKeyId);
    const seed = hasDatabaseIds(carried) ? carried : withDatabaseIds(carried);
    void (async () => {
      try {
        const id = await createFlow(currentWorkspaceId, seed, flowDiff(null, seed), orderOf(seed));
        flowId.current = id;
        written.current = seed;
        setLocal(seed);
        await queryClient.invalidateQueries({ queryKey });
      } catch (cause) {
        setError((cause as Error).message);
        // Still usable: the flow works, it just is not being kept yet.
        setLocal(seed);
      } finally {
        seeding.current = false;
      }
    })();
  }, [
    currentWorkspaceId,
    server.isSuccess,
    server.data,
    local,
    legacy,
    matterKeyId,
    fixture,
    queryClient,
    queryKey,
  ]);

  const seedMatterId = matterKeyId ?? head?.matterId ?? null;
  const record = local ?? FIXTURES.blank(seedMatterId ?? "");
  const today = useToday();
  const flow = useMemo(() => deriveFlow(record, today), [record, today]);

  // Write what moved, once the typing stops.
  const pending = useRef<number | null>(null);
  useEffect(() => {
    if (!workspaceId || !flowId.current || !local || !written.current) return;
    const write = flowDiff(written.current, local);
    if (isEmptyWrite(write)) return;
    if (pending.current) window.clearTimeout(pending.current);
    const snapshot = local;
    pending.current = window.setTimeout(() => {
      void (async () => {
        try {
          await saveFlow(workspaceId, flowId.current!, write, orderOf(snapshot));
          written.current = snapshot;
          setError(null);
        } catch (cause) {
          setError((cause as Error).message);
        }
      })();
    }, SETTLE_MS);
    return () => {
      if (pending.current) window.clearTimeout(pending.current);
    };
  }, [local, workspaceId]);

  const update = useCallback(
    (fn: (r: MatterFlowRecord) => MatterFlowRecord) =>
      setLocal((current) => fn(current ?? FIXTURES.blank(seedMatterId ?? ""))),
    [seedMatterId],
  );

  const patchDeliverable = useCallback(
    (id: string, patch: Partial<Deliverable>) =>
      update((r) => ({
        ...r,
        deliverables: r.deliverables.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      })),
    [update],
  );

  /** Start again from the seed: the stored flow goes, and a fresh one is made. */
  const setStored = useCallback(
    async (_: null) => {
      if (!workspaceId || !flowId.current || !matterKeyId) return;
      const seed = withDatabaseIds(FIXTURES[fixture](matterKeyId));
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        await supabase.from("matter_flows").delete().eq("id", flowId.current);
        const id = await createFlow(workspaceId, seed, flowDiff(null, seed), orderOf(seed));
        flowId.current = id;
        written.current = seed;
        setLocal(seed);
        await queryClient.invalidateQueries({ queryKey });
      } catch (cause) {
        setError((cause as Error).message);
      }
    },
    [workspaceId, fixture, matterKeyId, queryClient, queryKey],
  );

  const actions = useMemo(
    () => ({
      /* ------------------------------------------------------- phases */

      /**
       * What this matter calls its phases. Blank puts it back to the default
       * rather than leaving the bar with no heading at all.
       */
      setPhasesTitle: (title: string) => update((r) => ({ ...r, phasesTitle: title.trim() })),

      /** A new scope-of-services item at the end of the bar. Returns its id. */
      addPhase: (input: NewPhase) => {
        const id = uid("ph");
        update((r) => ({
          ...r,
          phases: [
            ...r.phases,
            {
              ...input,
              id,
              matterId: r.matterId,
              order: Math.max(0, ...r.phases.map((p) => p.order)) + 1,
            },
          ],
        }));
        return id;
      },

      updatePhase: (id: string, patch: Partial<NewPhase>) =>
        update((r) => ({
          ...r,
          phases: r.phases.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      /** Removes the phase and everything under it. */
      removePhase: (id: string) =>
        update((r) => {
          const gone = new Set(r.deliverables.filter((d) => d.phaseId === id).map((d) => d.id));
          return {
            ...r,
            phases: r.phases.filter((p) => p.id !== id),
            deliverables: r.deliverables.filter((d) => d.phaseId !== id),
            versions: r.versions.filter((v) => !gone.has(v.deliverableId)),
            evidence: r.evidence.filter((e) => !gone.has(e.deliverableId)),
            emails: (r.emails ?? []).filter((e) => !gone.has(e.deliverableId)),
            threads: (r.threads ?? []).filter((t) => !gone.has(t.deliverableId)),
          };
        }),

      /** Swap a phase with its neighbour on the bar. */
      movePhase: (id: string, delta: -1 | 1) =>
        update((r) => {
          const sorted = [...r.phases].sort((a, b) => a.order - b.order);
          const index = sorted.findIndex((p) => p.id === id);
          const other = sorted[index + delta];
          if (index < 0 || !other) return r;
          const me = sorted[index]!;
          return {
            ...r,
            phases: r.phases.map((p) =>
              p.id === me.id
                ? { ...p, order: other.order }
                : p.id === other.id
                  ? { ...p, order: me.order }
                  : p,
            ),
          };
        }),

      /* -------------------------------------------------- deliverables */

      /** The lawyer's tick. Completion is still derived from the final version / evidence. */
      /** Ticking records when, so a day can be asked what it finished. */
      setTicked: (id: string, ticked: boolean) =>
        patchDeliverable(id, { ticked, tickedAt: ticked ? new Date().toISOString() : null }),

      addDeliverable: (input: Omit<Deliverable, "id" | "ticked">) =>
        update((r) => ({
          ...r,
          deliverables: [...r.deliverables, { ...input, id: uid("del"), ticked: false }],
        })),

      updateDeliverable: (id: string, patch: Partial<Omit<Deliverable, "id">>) =>
        patchDeliverable(id, patch),

      /** Put a phase's deliverables in the order the lawyer dragged them into. */
      reorderDeliverables: (phaseId: string, ids: string[]) =>
        update((r) => ({ ...r, deliverables: reorderInPhase(r.deliverables, phaseId, ids) })),

      removeDeliverable: (id: string) =>
        update((r) => ({
          ...r,
          deliverables: r.deliverables.filter((d) => d.id !== id),
          versions: r.versions.filter((v) => v.deliverableId !== id),
          evidence: r.evidence.filter((e) => e.deliverableId !== id),
          emails: (r.emails ?? []).filter((e) => e.deliverableId !== id),
          threads: (r.threads ?? []).filter((t) => t.deliverableId !== id),
        })),

      /** A dropped or chosen file becomes a new version of this deliverable — never a loose file. */
      attachVersion: (deliverableId: string, input: Partial<Omit<Version, "deliverableId">>) =>
        update((r) => {
          const own = r.versions.filter((v) => v.deliverableId === deliverableId);
          const created: Version = {
            id: input.id ?? uid("ver"),
            deliverableId,
            fileRef: input.fileRef ?? null,
            label: input.label ?? nextVersionLabel(own),
            createdAt: input.createdAt ?? new Date().toISOString(),
            isFinal: input.isFinal ?? false,
            // Whatever is attached is a draft until a lawyer says what it is.
            tag: input.tag ?? "draft",
            thumbnailRef: input.thumbnailRef ?? null,
            ...(input.pages !== undefined ? { pages: input.pages } : {}),
            ...(input.by !== undefined ? { by: input.by } : {}),
            ...(input.note !== undefined ? { note: input.note } : {}),
          };
          const versions = created.isFinal
            ? [
                ...r.versions.map((v) =>
                  v.deliverableId === deliverableId ? { ...v, isFinal: false } : v,
                ),
                created,
              ]
            : [...r.versions, created];
          // A final version ticks the checklist (6b note).
          const deliverables = created.isFinal
            ? r.deliverables.map((d) =>
                d.id === deliverableId
                  ? { ...d, ticked: true, tickedAt: new Date().toISOString() }
                  : d,
              )
            : r.deliverables;
          return { ...r, versions, deliverables };
        }),

      /** Only one version of a deliverable is final; marking it final ticks the deliverable. */
      setFinal: (versionId: string, isFinal: boolean) =>
        update((r) => {
          const target = r.versions.find((v) => v.id === versionId);
          if (!target) return r;
          const versions = r.versions.map((v) =>
            v.id === versionId
              ? { ...v, isFinal }
              : isFinal && v.deliverableId === target.deliverableId
                ? { ...v, isFinal: false }
                : v,
          );
          const deliverables = isFinal
            ? r.deliverables.map((d) =>
                d.id === target.deliverableId
                  ? { ...d, ticked: true, tickedAt: new Date().toISOString() }
                  : d,
              )
            : r.deliverables;
          return { ...r, versions, deliverables };
        }),

      /** What kind of document this version is. One tag, changed at will. */
      setVersionTag: (versionId: string, tag: VersionTag) =>
        update((r) => ({
          ...r,
          versions: r.versions.map((v) => (v.id === versionId ? { ...v, tag } : v)),
        })),

      setThumbnail: (versionId: string, thumbnailRef: string | null) =>
        update((r) => ({
          ...r,
          versions: r.versions.map((v) => (v.id === versionId ? { ...v, thumbnailRef } : v)),
        })),

      /** Evidence is what makes an action count as done: adding it ticks the action. */
      addEvidence: (
        deliverableId: string,
        input: Omit<Evidence, "id" | "deliverableId" | "createdAt"> & { id?: string },
      ) =>
        update((r) => ({
          ...r,
          evidence: [
            ...r.evidence,
            {
              ...input,
              id: input.id ?? uid("ev"),
              deliverableId,
              createdAt: new Date().toISOString(),
            },
          ],
          deliverables: r.deliverables.map((d) =>
            d.id === deliverableId
              ? { ...d, ticked: true, tickedAt: new Date().toISOString(), waitingOn: null }
              : d,
          ),
        })),

      setWaiting: (id: string, waitingOn: WaitingOn | null) => patchDeliverable(id, { waitingOn }),

      scheduleFollowUp: (id: string, followUpAt: string) =>
        update((r) => ({
          ...r,
          deliverables: r.deliverables.map((d) =>
            d.id === id && d.waitingOn ? { ...d, waitingOn: { ...d.waitingOn, followUpAt } } : d,
          ),
        })),

      redate: (id: string, start: string, deadline: string) =>
        patchDeliverable(id, { start, deadline }),

      /* ------------------------------------------------ email threads */

      /** The draft of an email deliverable. Saving is all Scripta does: it never sends. */
      saveEmailDraft: (
        deliverableId: string,
        patch: Partial<Pick<EmailDraft, "to" | "subject" | "body">>,
      ) =>
        update((r) => {
          const emails = r.emails ?? [];
          const existing = emails.find((e) => e.deliverableId === deliverableId);
          const next: EmailDraft = {
            deliverableId,
            to: patch.to ?? existing?.to ?? "",
            subject: patch.subject ?? existing?.subject ?? "",
            body: patch.body ?? existing?.body ?? "",
            updatedAt: new Date().toISOString(),
          };
          return {
            ...r,
            emails: existing
              ? emails.map((e) => (e.deliverableId === deliverableId ? next : e))
              : [...emails, next],
          };
        }),

      /** A reply, pasted in. Its wording is kept as given; only the search copy is derived. */
      addThreadEntry: (
        deliverableId: string,
        input: { author: string; text: string; receivedAt?: string | undefined },
      ) => {
        const id = uid("thr");
        update((r) => ({
          ...r,
          threads: [
            ...(r.threads ?? []),
            {
              id,
              deliverableId,
              author: input.author.trim(),
              ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
              text: input.text,
              searchText: searchableText(input.text),
              attachments: [],
              createdAt: new Date().toISOString(),
            },
          ],
        }));
        return id;
      },

      updateThreadEntry: (
        id: string,
        patch: { author?: string; text?: string; receivedAt?: string | undefined },
      ) =>
        update((r) => ({
          ...r,
          threads: (r.threads ?? []).map((t) => {
            if (t.id !== id) return t;
            const text = patch.text ?? t.text;
            const next: ThreadEntry = {
              ...t,
              ...(patch.author !== undefined ? { author: patch.author.trim() } : {}),
              text,
              searchText: searchableText(text),
            };
            if (patch.receivedAt !== undefined) {
              if (patch.receivedAt) next.receivedAt = patch.receivedAt;
              else delete next.receivedAt;
            }
            return next;
          }),
        })),

      removeThreadEntry: (id: string) =>
        update((r) => ({ ...r, threads: (r.threads ?? []).filter((t) => t.id !== id) })),

      /** A file that came with the reply, kept against that reply. */
      addThreadAttachment: (threadId: string, attachment: ThreadAttachment) =>
        update((r) => ({
          ...r,
          threads: (r.threads ?? []).map((t) =>
            t.id === threadId ? { ...t, attachments: [...t.attachments, attachment] } : t,
          ),
        })),

      removeThreadAttachment: (threadId: string, attachmentId: string) =>
        update((r) => ({
          ...r,
          threads: (r.threads ?? []).map((t) =>
            t.id === threadId
              ? { ...t, attachments: t.attachments.filter((a) => a.id !== attachmentId) }
              : t,
          ),
        })),

      /** Lay a preset's structure onto this matter, after whatever is already here. */
      applyPreset: (body: PresetBody, options: ApplyOptions) =>
        update((r) => applyPresetBody(r, body, options)),

      /** Back to the seed for this matter (sample data, or an empty flow). */
      reset: () => void setStored(null),
    }),
    [update, patchDeliverable, setStored],
  );

  return {
    record,
    flow,
    today,
    /** Where the flow is filed, once read. Null while loading. */
    head,
    /** The flow's id, once it has a row. */
    flowId: flowId.current,
    /** Read where it is filed again, after filing it somewhere. */
    refreshHead: () => queryClient.invalidateQueries({ queryKey }),
    /** Asked for by id and not there — or not this person's to open. */
    unavailable: !!flowKeyId && server.isSuccess && !server.data,
    /** Null until the flow has been read; screens may render from the seed meanwhile. */
    loading: server.isLoading || (!local && !server.isError),
    /** Set when the flow could not be read or kept. The screen stays usable. */
    error: error ?? (server.error ? (server.error as Error).message : null),
    /**
     * Whether what is on screen is actually being written anywhere.
     *
     * False while the flow has no row yet — which is the ordinary state for a
     * second or two on first load, and a permanent one when the read failed:
     * the seeding effect waits on `server.isSuccess`, so a failed read means
     * no row is ever created and every later edit is diffed against nothing.
     * The screen looked identical either way, which is how a whole afternoon's
     * work could be typed into something that was never going to keep it.
     */
    persisted: !!flowId.current,
    ...actions,
  };
}

/** Row order as the screen has it, so the database keeps the same sequence. */
function orderOf(record: MatterFlowRecord) {
  return {
    phases: [...record.phases].sort((a, b) => a.order - b.order).map((p) => p.id),
    deliverables: record.deliverables.map((d) => d.id),
  };
}

export type MatterFlowStore = ReturnType<typeof useMatterFlow>;
