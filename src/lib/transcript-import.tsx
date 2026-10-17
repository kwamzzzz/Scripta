import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useApp } from "@/store/app";
import { extOf, fileTypeError } from "@/lib/parsing/mime";
import { resolveTranscriptTarget, type TranscriptTargetOverride } from "@/lib/transcript-target";
import {
  commitTranscript,
  parseTranscript,
  suggestSpeakers,
  type Attribution,
  type SpeakerMapping,
  type SpeakerRole,
} from "@/lib/transcripts.functions";
import type { MeetingKind } from "@/lib/insights";

export const ROLES: SpeakerRole[] = ["Client", "Vendor", "Legal", "Security", "Other"];

export type DetectedSpeaker = { key: string; name: string | null; sample: string; count: number };
export type DraftUtterance = {
  speakerKey: string;
  speakerName: string | null;
  ts: string;
  text: string;
};

type Draft = {
  documentId: string;
  fileName: string;
  format: string;
  speakers: DetectedSpeaker[];
  utterances: DraftUtterance[];
  utteranceCount: number;
  durationMinutes: number;
  mapping: SpeakerMapping;
  title: string;
  date: string;
  /** What kind of meeting this was — drives how the extraction reads it. */
  meetingKind: MeetingKind;
  /** True when the text was pasted rather than uploaded as a file. */
  pasted: boolean;
  /** Caption source that yielded a single unnamed speaker — the mapping panel alone isn't enough. */
  turnMode: boolean;
  /** Speaker keys available for assignment. */
  roster: string[];
  /** Explicit per-row assignments; each carries forward until the next one. */
  changes: Record<number, string>;
  /** AI-proposed assignments, held separately so they stay visibly inferred and clearable. */
  suggested: string[] | null;
};

/** Resolve the per-utterance speaker keys the commit will use. */
export function effectiveAssignments(draft: Draft): string[] {
  const base = draft.suggested ?? draft.utterances.map((u) => u.speakerKey);
  let cur: string | null = null;
  return draft.utterances.map((_, i) => {
    const change = draft.changes[i];
    if (change) cur = change;
    return cur ?? base[i] ?? "Speaker 1";
  });
}

type ImportState = {
  draft: Draft | null;
  busy: boolean;
  suggesting: boolean;
  error: string | null;
  /** Upload a file and parse it — leaves the flow at the speaker mapping step. */
  start: (file: File, target?: TranscriptTargetOverride) => Promise<void>;
  /** Paste a transcript straight in — same pipeline, no file needed. */
  startPaste: (text: string, title?: string) => Promise<void>;
  setMapping: (key: string, patch: Partial<{ name: string; role: SpeakerRole }>) => void;
  setMeta: (patch: Partial<{ title: string; date: string; meetingKind: MeetingKind }>) => void;
  assign: (from: number, to: number, key: string) => void;
  addSpeaker: () => void;
  suggest: () => Promise<void>;
  clearSuggestions: () => void;
  confirm: () => Promise<void>;
  cancel: () => void;
};

const Ctx = createContext<ImportState | null>(null);

const GENERIC = /^speaker\s*\d+$/i;

export function TranscriptImportProvider({ children }: { children: ReactNode }) {
  const { matterId, workspaceId, set } = useApp();
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const parse = useServerFn(parseTranscript);
  const commit = useServerFn(commitTranscript);
  const navigate = useNavigate();
  const suggestFn = useServerFn(suggestSpeakers);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (file: File, override?: TranscriptTargetOverride) => {
      let target;
      try {
        target = resolveTranscriptTarget({ matterId, workspaceId }, override);
      } catch (e) {
        const failure =
          e instanceof Error ? e : new Error("Could not choose where to import the transcript");
        setError(failure.message);
        throw failure;
      }
      const typeError = fileTypeError(file);
      if (typeError) {
        setError(typeError);
        throw new Error(typeError);
      }
      setBusy(true);
      setError(null);
      try {
        const path = `${target.workspaceId}/${target.matterId}/${crypto.randomUUID()}${extOf(file.name)}`;
        const up = await supabase.storage
          .from("matter-documents")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (up.error) throw new Error(up.error.message);

        const name = file.name.replace(/\.[^.]+$/, "");
        const { data: row, error: insErr } = await supabase
          .from("documents")
          .insert({
            matter_id: target.matterId,
            name,
            kind: "transcript",
            doc_date: new Date().toISOString().slice(0, 10),
            storage_path: path,
            mime_type: file.type || null,
            byte_size: file.size,
            uploaded_by: user?.id ?? null,
            parse_status: "pending",
          })
          .select("id")
          .single();
        if (insErr || !row) throw new Error(insErr?.message ?? "Could not record the transcript");

        await qc.invalidateQueries({ queryKey: ["matter-data", target.matterId] });
        const res = await parse({ data: { documentId: row.id } });
        if (!res.ok) throw new Error(res.error);

        const mapping: SpeakerMapping = {};
        for (const s of res.speakers) {
          // A generic label means nothing outside its own recording: "Speaker 1"
          // here is not "Speaker 1" of an earlier meeting, so only a real name
          // carries over.
          const known = GENERIC.test(s.key) ? undefined : res.known[s.key];
          const suggested = s.name && !GENERIC.test(s.name) ? s.name : "";
          mapping[s.key] = { name: known?.name ?? suggested, role: known?.role ?? "Other" };
        }
        const captionSource = res.format === "srt" || res.format === "vtt";
        // Captions with no names at all: the mapping panel alone can't split turns.
        const turnMode = captionSource && res.speakers.every((s) => !s.name);
        const roster = turnMode
          ? Array.from(
              new Set([...res.speakers.map((s) => s.key), "Speaker 1", "Speaker 2"]),
            ).sort()
          : res.speakers.map((s) => s.key);
        setDraft({
          documentId: row.id,
          fileName: file.name,
          format: res.format,
          speakers: res.speakers,
          utterances: res.utterances,
          utteranceCount: res.utteranceCount,
          durationMinutes: res.durationMinutes,
          mapping,
          title: res.suggestedTitle || name,
          date: res.suggestedDate || new Date().toISOString().slice(0, 10),
          meetingKind: "negotiation",
          pasted: file.name.startsWith("Pasted transcript"),
          turnMode,
          roster,

          changes: {},
          suggested: null,
        });

        set({ screen: "transcript" });
      } catch (e) {
        const failure = e instanceof Error ? e : new Error("Could not import the transcript");
        setError(failure.message);
        throw failure;
      } finally {
        await qc.invalidateQueries({ queryKey: ["matter-data", target.matterId] });
        setBusy(false);
      }
    },
    [matterId, workspaceId, parse, qc, set, user],
  );

  const value = useMemo<ImportState>(
    () => ({
      draft,
      busy,
      startPaste: async (text, title) => {
        const clean = text.trim();
        if (!clean) {
          const failure = new Error("Paste the transcript text first.");
          setError(failure.message);
          throw failure;
        }
        const name = (title?.trim() || "Pasted transcript") + ".txt";
        await start(new File([clean], name, { type: "text/plain" }));
      },
      suggesting,
      error,
      start,
      setMapping: (key, patch) =>
        setDraft((d) =>
          d
            ? {
                ...d,
                mapping: {
                  ...d.mapping,
                  [key]: { ...(d.mapping[key] ?? { name: "", role: "Other" }), ...patch },
                },
              }
            : d,
        ),
      setMeta: (patch) => setDraft((d) => (d ? { ...d, ...patch } : d)),
      assign: (from, to, key) =>
        setDraft((d) => {
          if (!d) return d;
          const lo = Math.min(from, to);
          const hi = Math.max(from, to);
          const changes = { ...d.changes };
          for (let i = lo; i <= hi; i += 1) changes[i] = key;
          // The row after the block keeps whatever it had, so the assignment
          // carries forward only until the next explicit change.
          const next = hi + 1;
          if (next < d.utterances.length && !changes[next]) {
            const before = effectiveAssignments(d)[next];
            if (before && before !== key) changes[next] = before;
          }
          return { ...d, changes };
        }),
      addSpeaker: () =>
        setDraft((d) => {
          if (!d) return d;
          const key = `Speaker ${d.roster.length + 1}`;
          return {
            ...d,
            roster: [...d.roster, key],
            mapping: { ...d.mapping, [key]: d.mapping[key] ?? { name: "", role: "Other" } },
          };
        }),
      suggest: async () => {
        if (!draft) return;
        setSuggesting(true);
        setError(null);
        try {
          const res = await suggestFn({ data: { documentId: draft.documentId } });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setDraft((d) => {
            if (!d) return d;
            const roster = Array.from(
              new Set([
                ...d.roster,
                ...Array.from({ length: res.speakerCount }, (_, i) => `Speaker ${i + 1}`),
              ]),
            );
            return { ...d, suggested: res.assignments, changes: {}, roster };
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not suggest speakers");
        } finally {
          setSuggesting(false);
        }
      },
      clearSuggestions: () => setDraft((d) => (d ? { ...d, suggested: null, changes: {} } : d)),
      confirm: async () => {
        if (!draft || !matterId) return;
        setBusy(true);
        setError(null);
        try {
          const assignments = effectiveAssignments(draft);
          const keys = Array.from(
            new Set([...draft.speakers.map((s) => s.key), ...draft.roster, ...assignments]),
          );
          const mapping: SpeakerMapping = {};
          for (const key of keys) {
            const detected = draft.speakers.find((s) => s.key === key);
            const m = draft.mapping[key] ?? { name: "", role: "Other" as SpeakerRole };
            mapping[key] = { name: m.name.trim() || detected?.name || key, role: m.role };
          }
          const attribution: Attribution = draft.turnMode
            ? Object.keys(draft.changes).length > 0
              ? "manual"
              : draft.suggested
                ? "inferred"
                : "manual"
            : "file";
          const saved = await commit({
            data: {
              documentId: draft.documentId,
              matterId,
              meetingTitle: draft.title,
              meetingDate: draft.date,
              meetingKind: draft.meetingKind,
              mapping,
              assignments,
              attribution,
            },
          });
          await qc.invalidateQueries({ queryKey: ["matter-data", matterId] });
          await qc.invalidateQueries({ queryKey: ["board"] });
          setDraft(null);
          if (saved?.transcriptId)
            void navigate({
              to: "/transcripts/$transcriptId",
              params: { transcriptId: saved.transcriptId },
            });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save the transcript");
        } finally {
          setBusy(false);
        }
      },
      cancel: () => {
        setDraft(null);
        setError(null);
      },
    }),
    [draft, busy, suggesting, error, start, commit, suggestFn, matterId, qc, navigate],
  );

  // `profile` is only read for parity with other mutations; kept out of deps on purpose.
  void profile;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTranscriptImport() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTranscriptImport must be used inside TranscriptImportProvider");
  return ctx;
}
