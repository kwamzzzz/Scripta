import { useMemo, useRef, useState } from "react";
import { C, mono } from "@/lib/tokens";
import { Panel, PanelHeader, SectionLabel } from "@/components/praxis";
import { effectiveAssignments, ROLES, useTranscriptImport } from "@/lib/transcript-import";
import type { SpeakerRole } from "@/lib/transcripts.functions";
import { MEETING_KINDS, MEETING_KIND_LABEL, type MeetingKind } from "@/lib/insights";


const field = {
  fontSize: 13,
  padding: "4px 8px",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  background: "#fff",
  color: C.text,
  width: "100%",
} as const;

const cols = "150px 1fr 190px 140px";

const link = { fontSize: 13, color: C.accent, cursor: "pointer" } as const;

/**
 * Sits between parsing and commit. Otter supplies a name at best — the role is
 * what makes the decision map readable, so it is collected here, once.
 *
 * Caption files with no speaker labels get a turn-assignment table instead: the
 * boundaries are what a user cannot reconstruct by hand, so assigning a row
 * carries forward until the next explicit change.
 */
export default function SpeakerMappingPanel() {
  const {
    draft,
    busy,
    suggesting,
    error,
    setMapping,
    setMeta,
    assign,
    addSpeaker,
    suggest,
    clearSuggestions,
    confirm,
    cancel,
  } = useTranscriptImport();
  const [cursor, setCursor] = useState(0);
  const anchor = useRef<number | null>(null);

  const assignments = useMemo(() => (draft ? effectiveAssignments(draft) : []), [draft]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const k of assignments) m[k] = (m[k] ?? 0) + 1;
    return m;
  }, [assignments]);

  if (!draft) return null;
  const turnMode = draft.turnMode;
  const rosterRows = turnMode
    ? draft.roster.map((key) => ({ key, name: null as string | null, sample: "", count: counts[key] ?? 0 }))
    : draft.speakers;

  const onRowClick = (i: number, key: string, shift: boolean) => {
    const from = shift && anchor.current !== null ? anchor.current : i;
    assign(from, i, key);
    if (!shift) anchor.current = i;
    setCursor(i);
  };


  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.appBg, padding: 22 }}>
      <div style={{ maxWidth: 940, margin: "0 auto", display: "flex", flexDirection: "column", gap: 19 }}>
        <Panel>
          <PanelHeader style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Who was on the call? (optional)</span>
            <span style={{ fontWeight: 400, fontSize: 12, color: C.muted, fontFamily: mono }}>
              {draft.fileName} · {draft.format} · {draft.utteranceCount} utterances · {draft.durationMinutes} min
            </span>
          </PanelHeader>

          <div style={{ padding: "14px 17px", borderBottom: `1px solid ${C.rowRule}`, display: "flex", gap: 16 }}>
            <label style={{ flex: 1 }}>
              <SectionLabel style={{ marginBottom: 4 }}>Meeting title</SectionLabel>
              <input value={draft.title} onChange={(e) => setMeta({ title: e.target.value })} style={field} />
            </label>
            <label style={{ width: 180 }}>
              <SectionLabel style={{ marginBottom: 4 }}>Meeting date</SectionLabel>
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setMeta({ date: e.target.value })}
                style={{ ...field, fontFamily: mono }}
              />
            </label>
            <label style={{ width: 190 }}>
              <SectionLabel style={{ marginBottom: 4 }}>Meeting type</SectionLabel>
              <select
                value={draft.meetingKind}
                onChange={(e) => setMeta({ meetingKind: e.target.value as MeetingKind })}
                style={field}
              >
                {MEETING_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {MEETING_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>


          <div
            style={{
              display: "grid",
              gridTemplateColumns: cols,
              gap: 14,
              padding: "8px 17px",
              borderBottom: `1px solid ${C.rowRule}`,
              fontSize: 11,
              color: C.muted,
            }}
          >
            <div style={{ gridColumn: "1 / -1", textTransform: "none", letterSpacing: 0, fontSize: 12, lineHeight: 1.5, paddingBottom: 6 }}>
              Recorders often mislabel who is speaking. A name here is a hint, not a fact: the distiller
              checks each statement against what was actually said, and asks you only where it matters.
            </div>
            <div>{turnMode ? "Speaker" : "Recorder label"}</div>
            <div>{turnMode ? "Assigned turns" : "Sample utterance"}</div>
            <div>Probably</div>
            <div>Role</div>
          </div>

          {rosterRows.map((s) => {
            const m = draft.mapping[s.key] ?? { name: "", role: "Other" as SpeakerRole };
            return (
              <div
                key={s.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: cols,
                  gap: 14,
                  alignItems: "center",
                  padding: "11px 17px",
                  borderBottom: `1px solid ${C.rowRule}`,
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{s.key}</div>
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: mono }}>
                    {turnMode ? (counts[s.key] ?? 0) : s.count} turns
                  </div>
                </div>
                <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.45 }}>
                  {turnMode ? "" : `“${s.sample}”`}
                </div>
                <input
                  value={m.name}
                  placeholder={s.name ?? "Speaker name"}
                  onChange={(e) => setMapping(s.key, { name: e.target.value })}
                  style={field}
                />
                <select
                  value={m.role}
                  onChange={(e) => setMapping(s.key, { role: e.target.value as SpeakerRole })}
                  style={field}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}

          {turnMode && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "11px 17px",
                  borderBottom: `1px solid ${C.rowRule}`,
                }}
              >
                <SectionLabel style={{ marginBottom: 0 }}>Assign turns</SectionLabel>
                <span style={{ fontSize: 12, color: C.muted }}>
                  This file carries no speaker labels. Click a row to assign a speaker — it carries forward
                  until the next change. Shift-click for a range; ↑ ↓ to move, 1–9 to assign.
                </span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center" }}>
                  <span onClick={addSpeaker} style={link}>
                    + Add speaker
                  </span>
                  <span onClick={() => !suggesting && void suggest()} style={{ ...link, opacity: suggesting ? 0.6 : 1 }}>
                    {suggesting ? "Suggesting…" : "Suggest speakers"}
                  </span>
                  {draft.suggested && (
                    <span onClick={clearSuggestions} style={{ ...link, color: C.muted }}>
                      Clear suggestions
                    </span>
                  )}
                </span>
              </div>

              {draft.suggested && (
                <div
                  style={{
                    padding: "8px 17px",
                    borderBottom: `1px solid ${C.rowRule}`,
                    fontSize: 12,
                    color: C.amber,
                    background: "#f7f0dd",
                  }}
                >
                  Speaker turns below are AI-inferred from conversational cues, not supplied by the file. Check
                  them before importing — nothing is committed until you do.
                </div>
              )}

              <div
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => Math.min(draft.utterances.length - 1, c + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(0, c - 1));
                  } else if (/^[1-9]$/.test(e.key)) {
                    const key = draft.roster[Number(e.key) - 1];
                    if (key) {
                      e.preventDefault();
                      assign(cursor, cursor, key);
                    }
                  }
                }}
                style={{ maxHeight: 380, overflowY: "auto", outline: "none" }}
              >
                {draft.utterances.map((u, i) => {
                  const key = assignments[i] ?? "Speaker 1";
                  const explicit = draft.changes[i] !== undefined;
                  const inferred = !explicit && !!draft.suggested;
                  const on = cursor === i;
                  return (
                    <div
                      key={i}
                      onClick={(e) => onRowClick(i, key, e.shiftKey)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "78px 132px 1fr",
                        gap: 14,
                        alignItems: "baseline",
                        padding: "7px 17px",
                        borderBottom: `1px solid ${C.rowRule}`,
                        background: on ? C.rowSel : "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ fontFamily: mono, fontSize: 12, color: C.muted }}>{u.ts}</span>
                      <select
                        value={key}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          assign(i, i, e.target.value);
                          setCursor(i);
                        }}
                        style={{
                          ...field,
                          fontSize: 12,
                          padding: "2px 6px",
                          borderStyle: inferred ? "dashed" : "solid",
                          color: inferred ? C.amber : C.text,
                        }}
                      >
                        {draft.roster.map((k) => (
                          <option key={k} value={k}>
                            {draft.mapping[k]?.name?.trim() || k}
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: 13, color: C.secondary, lineHeight: 1.45 }}>{u.text}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}


          <div
            style={{
              padding: "13px 17px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              justifyContent: "flex-end",
            }}
          >
            {error && <span style={{ fontSize: 12, color: C.red, marginRight: "auto" }}>{error}</span>}
            <span
              onClick={cancel}
              title="The uploaded file stays saved in Documents"
              style={{ fontSize: 13, color: C.muted, cursor: "pointer" }}
            >
              Close setup (file stays saved)
            </span>
            <span
              onClick={() => !busy && void confirm()}
              style={{
                fontSize: 13,
                padding: "6px 15px",
                borderRadius: 8,
                background: busy ? C.accentTint : C.accent,
                color: busy ? C.accent : "#fff",
                cursor: busy ? "default" : "pointer",
              }}
            >
              {busy ? "Importing…" : "Import transcript"}
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
