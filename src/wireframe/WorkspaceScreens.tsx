/**
 * Sections 1, 2, 3 and 5 of the wireframe as screens, bound to the workspace.
 * Each screen builds a `d` in the fixture's shape from Supabase and hands it
 * to the drawn frame. Empty workspaces stay empty; fixture records never ship.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/store/app";
import { useAuth } from "@/lib/auth";
import { useBoard } from "@/lib/use-board";
import { useOpenMatter } from "@/components/MatterCard";
import { counts, relTime } from "@/lib/home-data";
import { fetchLibrary } from "@/lib/drafting-data";
import { TranscriptImportProvider } from "@/lib/transcript-import";
import UploadTranscript from "@/components/UploadTranscript";
import PasteTranscript from "@/components/PasteTranscript";
import * as F1a from "./frames/F1a";
import * as F2a from "./frames/F2a";
import * as F5a from "./frames/F5a";
import SpeakerMappingPanel from "@/components/SpeakerMappingPanel";
import { useTranscriptImport } from "@/lib/transcript-import";
import { FrameScreen, Modal, type D } from "./screens";
import { WF } from "./data";
import LoadError from "@/components/LoadError";

/* ------------------------------------------------------------------ 1a */
export function Dashboard() {
  const { board, error: boardError, refetch } = useBoard();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const open = useOpenMatter();
  const recent = [...board.matters].sort((a, b) =>
    (b.lastEvent?.at ?? b.updatedAt).localeCompare(a.lastEvent?.at ?? a.updatedAt),
  );
  const resume = recent[0];
  const now = new Date();
  const h = now.getHours();
  const first = (profile?.full_name || "").split(" ")[0];
  const d: D = {
    ...WF,
    greeting: `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}${first ? `, ${first}` : ""}`,
    dateLabel: `${now.toLocaleDateString("en-GB", { weekday: "long" })}, ${now.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`,
    tips: [],
    resume: resume
      ? {
          id: resume.id,
          name: resume.name,
          line: resume.lastEvent
            ? resume.lastEvent.summary
            : `${resume.docs.length} documents · ${counts(resume).open + counts(resume).escalated} open items`,
        }
      : {
          id: "",
          name: "Your next matter starts here",
          line: "Create a matter and bring in the documents you want to work on.",
        },
    review: recent
      .filter((m) => m.clauses.length || m.resolutions.length)
      .map((m) => ({
        id: m.id,
        name: m.name,
        party: m.client || m.counterparty || "No client recorded",
        when: `${counts(m).open + counts(m).escalated} open items`,
      })),
    // Matters with drafting still outstanding, counted the way the rest of
    // the app counts it. An earlier version tested status !== "Accepted",
    // but drafting_status only has Draft, Open and Escalated — there is no
    // Accepted — so every drafting point matched forever and the card could
    // never empty. draftDp is the existing definition; inventing a second
    // one is what caused the bug.
    drafts: recent
      .filter((m) => counts(m).draftDp > 0)
      .map((m) => {
        const open = counts(m).draftDp;
        return {
          id: m.id,
          name: m.name,
          party: m.client || m.counterparty || "internal",
          when: `${open} drafting point${open === 1 ? "" : "s"} open · edited ${relTime(m.updatedAt)}`,
        };
      }),
    on: {
      resume: () =>
        resume ? void open(resume.id) : void navigate({ to: "/matters", search: { new: true } }),
      // A new matter is the legal file, not a contract review.
      startNew: () => void navigate({ to: "/matters", search: { new: true } }),
      viewAll: () => void navigate({ to: "/matters" }),
      openMatter: (row) => void open((row as { id: string }).id),
    },
  };
  return (
    <FrameScreen section="home" frame={F1a} d={d}>
      {/* The dashboard greets you and says your next matter starts here. It
          must not say that because the read failed. */}
      <LoadError what="workspace" error={boardError} onRetry={() => void refetch()} />
    </FrameScreen>
  );
}

/* ------------------------------------------------------------------ 2a / 2b */
function MandateSelect() {
  const { matters, matterId, set } = useApp();
  return (
    <select
      value={matterId ?? ""}
      onChange={(e) => set({ matterId: e.target.value || null })}
      style={{
        border: 0,
        background: "transparent",
        font: "inherit",
        color: "#232323",
        flex: 1,
        outline: "none",
      }}
    >
      <option value="">New mandate from this transcript</option>
      {matters.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

function RecentDistillations() {
  const { board } = useBoard();
  const navigate = useNavigate();
  if (!board.transcripts.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
      <div
        style={{
          font: "500 10px 'Geist',sans-serif",
          color: "#6f6f6f",
          letterSpacing: ".06em",
        }}
      >
        RECENT DISTILLATIONS
      </div>
      {board.transcripts.slice(0, 6).map((t) => (
        <div
          key={t.id}
          className="wf-frame-link"
          onClick={() =>
            void navigate({ to: "/transcripts/$transcriptId", params: { transcriptId: t.id } })
          }
          style={{
            border: "1px solid #e4e4e4",
            borderRadius: 6,
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div>{t.title}</div>
          <div style={{ display: "flex", gap: 8, color: "#6f6f6f", fontSize: 11.5 }}>
            <span>{board.matters.find((m) => m.id === t.matterId)?.name ?? "Mandate"}</span>
            <span>·</span>
            <span>
              {t.durationMinutes ? `${t.durationMinutes} min` : t.source}
              {t.speakers ? ` · ${t.speakers} speakers` : ""}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function IntakeBody() {
  const { draft } = useTranscriptImport();
  const d: D = {
    ...WF,
    slots: {
      chooseFile: <UploadTranscript label="Choose file" />,
      paste: <PasteTranscript label="Paste transcript" />,
      mandate: <MandateSelect />,
      recent: <RecentDistillations />,
    },
  };
  return (
    <FrameScreen
      section="transcripts"
      frame={F2a}
      d={d}
      back={{ label: "Transcript distiller", href: "/transcripts" }}
    >
      {draft && (
        <Modal open onClose={() => {}}>
          <div
            style={{
              width: 720,
              maxWidth: "90vw",
              background: "#fcfcfc",
              border: "1px solid #dedede",
              borderRadius: 10,
              boxShadow: "0 6px 18px rgba(0,0,0,.07)",
              overflow: "auto",
              maxHeight: "85vh",
            }}
          >
            <SpeakerMappingPanel />
          </div>
        </Modal>
      )}
    </FrameScreen>
  );
}

export function DistillerIntake() {
  return (
    <TranscriptImportProvider>
      <IntakeBody />
    </TranscriptImportProvider>
  );
}

/* ------------------------------------------------------------------ 5a / 5b */
function useLibrary() {
  const { workspaceId } = useApp();
  return useQuery({
    queryKey: ["wf-library", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchLibrary(workspaceId!),
  });
}

export function PrecedentsBank() {
  const lib = useLibrary();
  const navigate = useNavigate();
  const precedents = (lib.data ?? []).filter((i) => i.kind === "precedent");
  const clauses = (lib.data ?? []).filter((i) => i.kind === "playbook");
  const live = (lib.data?.length ?? 0) > 0;
  const d: D = {
    ...WF,
    precedents: live
      ? precedents.map((p) => ({
          id: p.id,
          name: p.title,
          type: p.agreementType || "Precedent",
          side: p.sector || "—",
          juris: p.jurisdiction || "—",
          date: "Saved to the bank",
          tags: p.clauseCategory || p.meta,
          state: p.approved ? "Firm approved" : "Needs review",
          uses: "",
        }))
      : [],
    precClauses: live
      ? clauses.slice(0, 8).map((c) => ({
          name: c.title,
          from: c.meta,
          note: c.body.slice(0, 80),
          flag: c.riskPosition || "Preferred",
        }))
      : [],
    precedentHead: live
      ? {
          shown: `${precedents.length} OF ${precedents.length} SHOWN`,
          bank: `${clauses.length} in bank`,
        }
      : { shown: "0 OF 0 SHOWN", bank: "0 in bank" },
    on: {
      openPrecedent: (p) =>
        void navigate({
          to: "/knowledge/$precedentId",
          params: { precedentId: (p as { id: string }).id },
        }),
    },
  };
  return <FrameScreen section="knowledge" frame={F5a} d={d} />;
}
