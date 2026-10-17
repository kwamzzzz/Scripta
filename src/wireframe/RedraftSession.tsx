/**
 * Wireframe 1e — the instruction assimilator. The redraft conversation takes
 * over the document column: the lawyer's instruction list restated as one
 * message, Scripta answering with clarifying questions per instruction, then
 * an explicit exit pair. Session state lives apart from the document; nothing
 * is written until the lawyer finalises.
 */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { redraftTurn, type SessionReply } from "@/lib/assistant.functions";
import { draftEdits, type DraftedEdit } from "@/review/edits.functions";
import EditsReview from "@/review/EditsReview";
import type { Instruction } from "./InstructionModals";

export type SessionTurn =
  | { role: "you"; text: string; bullets: string[]; tail?: string }
  | { role: "assistant"; reply: SessionReply }
  | { role: "error"; text: string };

export type RedraftSessionState = {
  matterId: string;
  instructions: Instruction[];
  turns: SessionTurn[];
};

const card = {
  you: {
    border: "1px solid #dedede",
    borderRadius: 8,
    background: "#f5f5f5",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  assistant: {
    border: "1px solid #e4e4e4",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 1px 2px rgba(0,0,0,.04)",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 9,
  },
};
const label = (color: string) => ({
  font: "500 10px 'Geist',sans-serif",
  color,
  letterSpacing: ".06em",
});

function Bullets({ items }: { items: string[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        paddingLeft: 4,
        lineHeight: 1.55,
        color: "#333",
      }}
    >
      {items.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 9 }}>
          <span style={{ color: "#6b6b6b" }}>·</span>
          <span>{t}</span>
        </div>
      ))}
    </div>
  );
}

export default function RedraftSession({
  session,
  onChange,
  onBack,
  onOpenRedline,
}: {
  session: RedraftSessionState;
  onChange: (next: RedraftSessionState) => void;
  onBack: () => void;
  /** Where the edits, once put in, are accepted or rejected. Ends the session. */
  onOpenRedline: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const draftFn = useServerFn(draftEdits);
  const [fix, setFix] = useState<{ edits: DraftedEdit[]; note: string } | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  const historyOf = (turns: SessionTurn[]) =>
    turns
      .filter((t) => t.role !== "error")
      .map((t) =>
        t.role === "you"
          ? { role: "user" as const, text: [t.text, ...t.bullets, t.tail ?? ""].join("\n") }
          : {
              role: "assistant" as const,
              text: [
                (t as { reply: SessionReply }).reply.intro,
                ...(t as { reply: SessionReply }).reply.items.map(
                  (i) => `${i.heading}\n${i.points.join("\n")}`,
                ),
              ].join("\n"),
            },
      );

  /* What was settled goes into the contract as pinpointed edits, shown here
     first. Before this the session ended with nothing written at all. */
  const startFix = async () => {
    setDrafting(true);
    setFixError(null);
    try {
      setFix(
        await draftFn({
          data: {
            matterId: session.matterId,
            instructions: session.instructions.map((i) => ({
              anchor: i.anchor,
              title: i.title,
              summary: i.summary,
            })),
            history: historyOf(session.turns).slice(-40),
          },
        }),
      );
    } catch (e) {
      setFixError((e as Error).message || "Scripta could not draft the edits.");
    } finally {
      setDrafting(false);
    }
  };

  const ask = async (turns: SessionTurn[], answer?: string) => {
    setBusy(true);
    try {
      const res = await redraftTurn({
        data: {
          matterId: session.matterId,
          instructions: session.instructions.map((i) => ({
            anchor: i.anchor,
            title: i.title,
            summary: i.summary,
            scope: i.scope,
          })),
          history: historyOf(turns),
          answer,
        },
      });
      onChange({
        ...session,
        turns: [
          ...turns,
          res.ok ? { role: "assistant", reply: res.reply } : { role: "error", text: res.error },
        ],
      });
    } catch (e) {
      onChange({
        ...session,
        turns: [
          ...turns,
          { role: "error", text: (e as Error).message || "Scripta is unavailable." },
        ],
      });
    } finally {
      setBusy(false);
    }
  };

  // Open the session: restate the instructions as one message, then Scripta answers.
  useEffect(() => {
    if (opened.current || session.turns.length) return;
    opened.current = true;
    const first: SessionTurn = {
      role: "you",
      text: "I have the following instructions for you:",
      bullets: session.instructions.map((i) => `${i.title} — ${i.summary}`),
      tail: "Please add these to the contract and ask me any follow-up questions you need before implementing them.",
    };
    const turns = [first];
    onChange({ ...session, turns });
    void ask(turns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.turns, busy]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    const turns: SessionTurn[] = [...session.turns, { role: "you", text, bullets: [] }];
    onChange({ ...session, turns });
    setDraft("");
    void ask(turns, text);
  };

  return (
    <div
      data-frame="1e"
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        padding: "18px 22px",
        gap: 12,
        fontSize: 13,
        color: "#232323",
        background: "#fcfcfc",
      }}
    >
      <div
        ref={thread}
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflow: "auto",
        }}
      >
        {session.turns.map((t, i) =>
          t.role === "you" ? (
            <div key={i} style={card.you}>
              <div style={label("#6f6f6f")}>YOU</div>
              <div>{t.text}</div>
              {t.bullets.length > 0 && <Bullets items={t.bullets} />}
              {t.tail && <div style={{ color: "#545454", lineHeight: 1.55 }}>{t.tail}</div>}
            </div>
          ) : t.role === "assistant" ? (
            <div key={i} style={card.assistant}>
              <div style={label("#333")}>ASSISTANT</div>
              {t.reply.intro && (
                <div style={{ lineHeight: 1.6, color: "#333" }}>{t.reply.intro}</div>
              )}
              {t.reply.items.map((item, k) => (
                <div key={k} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ lineHeight: 1.6 }}>{item.heading}</div>
                  <Bullets items={item.points} />
                </div>
              ))}
            </div>
          ) : (
            <div
              key={i}
              style={{ ...card.assistant, borderColor: "#f3c0bb", background: "#fdecea" }}
            >
              <div style={label("#c5221f")}>SCRIPTA · NOT AVAILABLE</div>
              <div style={{ lineHeight: 1.6, color: "#333" }}>{t.text}</div>
            </div>
          ),
        )}
        {drafting && (
          <div style={card.assistant}>
            <div style={label("#6f6f6f")}>SCRIPTA · WORKING</div>
            <div style={{ color: "#6b6b6b", lineHeight: 1.6 }}>
              Finding the exact words in the contract to change…
            </div>
          </div>
        )}
        {fixError && (
          <div style={{ ...card.assistant, borderColor: "#f3c0bb", background: "#fdecea" }}>
            <div style={label("#c5221f")}>SCRIPTA · NOT AVAILABLE</div>
            <div style={{ lineHeight: 1.6, color: "#333" }}>{fixError}</div>
          </div>
        )}
        {fix && (
          <EditsReview
            matterId={session.matterId}
            edits={fix.edits}
            note={fix.note}
            onDiscard={() => setFix(null)}
            onOpenRedline={onOpenRedline}
          />
        )}
        {busy && (
          <div style={card.assistant}>
            <div style={label("#6f6f6f")}>ASSISTANT · WORKING</div>
            <div style={{ color: "#6b6b6b", lineHeight: 1.6 }}>
              Reading the clauses and preparing questions…
            </div>
          </div>
        )}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Answer the questions, or ask for changes…"
        aria-label="Answer the questions, or ask for changes"
        disabled={busy}
        rows={1}
        style={{
          border: "1px solid #d4d4d4",
          borderRadius: 8,
          padding: "11px 12px",
          color: "#333",
          background: "#fff",
          font: "inherit",
          resize: "none",
          minHeight: 40,
          lineHeight: 1.4,
        }}
      />
      <div style={{ display: "flex", gap: 12 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            flex: 1,
            border: "1px solid #d4d4d4",
            borderRadius: 6,
            padding: "9px 0",
            textAlign: "center",
            fontSize: 12,
            color: "#545454",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Back to editor
        </button>
        <button
          type="button"
          onClick={draft.trim() ? send : () => void startFix()}
          disabled={busy || drafting || (!draft.trim() && !!fix)}
          title={
            draft.trim()
              ? undefined
              : "Scripta turns what you agreed into exact edits and shows them to you before anything goes into the contract"
          }
          style={{
            flex: 1,
            border: "1px solid #0b57d0",
            background: "#0b57d0",
            color: "#fff",
            borderRadius: 6,
            padding: "9px 0",
            textAlign: "center",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {draft.trim() ? "Send answer" : "Put the agreed wording into the contract"}
        </button>
      </div>
    </div>
  );
}
