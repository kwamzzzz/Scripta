/**
 * The redraft session for a structured document, in the editor's side panel
 * so the document stays in view. The lawyer's instructions are restated as one
 * message; Scripta answers with proposed wording per part, which lands on the
 * document as suggestions to accept or reject, plus any questions it needs
 * answered. Nothing is written until the lawyer accepts a proposal.
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import GeminiMark from "@/components/GeminiMark";
import { proposeRedraft, type RedraftReply } from "./redraft.functions";
import type { EditorPart } from "./model";
import type { Instruction } from "@/wireframe/InstructionModals";
import { partText } from "./model";

type Turn =
  | { role: "you"; text: string; bullets: string[] }
  | { role: "assistant"; reply: RedraftReply }
  | { role: "error"; text: string };

export default function RedraftPanel({
  kind,
  title,
  matterId,
  parts,
  instructions,
  onProposals,
  onClose,
}: {
  kind: string;
  title: string;
  matterId: string | null;
  parts: EditorPart[];
  instructions: Instruction[];
  onProposals: (proposals: RedraftReply["proposals"]) => void;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  const historyOf = (list: Turn[]) =>
    list
      .filter((t) => t.role !== "error")
      .map((t) =>
        t.role === "you"
          ? { role: "user" as const, text: [t.text, ...t.bullets].join("\n") }
          : {
              role: "assistant" as const,
              text: [
                t.reply.intro,
                ...t.reply.proposals.map((p) => `Proposed for part ${p.partId}: ${p.text}`),
                ...t.reply.questions,
              ].join("\n"),
            },
      );

  const ask = async (list: Turn[], answer?: string) => {
    setBusy(true);
    try {
      const res = await proposeRedraft({
        data: {
          documentKind: kind,
          title,
          matterId,
          parts: parts.map((p) => ({ id: p.id, num: p.num, title: p.title, text: partText(p) })),
          instructions: instructions.map((i) => ({
            partId: i.clauseId ?? "",
            anchor: i.anchor,
            title: i.title,
            summary: i.summary,
          })),
          history: historyOf(list),
          ...(answer ? { answer } : {}),
        },
      });
      if (res.ok) {
        setTurns([...list, { role: "assistant", reply: res.reply }]);
        if (res.reply.proposals.length) onProposals(res.reply.proposals);
      } else setTurns([...list, { role: "error", text: res.error }]);
    } catch (e) {
      setTurns([
        ...list,
        { role: "error", text: (e as Error).message || "Scripta is unavailable." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const first: Turn = {
      role: "you",
      text: "Please redraft the following:",
      bullets: instructions.map((i) => `${i.anchor} · ${i.title} — ${i.summary}`),
    };
    setTurns([first]);
    void ask([first]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, busy]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    const next: Turn[] = [...turns, { role: "you", text, bullets: [] }];
    setTurns(next);
    setDraft("");
    void ask(next, text);
  };

  return (
    <aside className="ce-instructions-panel se-redraft" aria-label="Redraft with Scripta">
      <header>
        <div>
          <strong>Redraft with Scripta</strong>
          <span>
            {instructions.length} instruction{instructions.length === 1 ? "" : "s"} · proposals land
            on the document to accept or reject
          </span>
        </div>
        <button type="button" aria-label="Close redraft" onClick={onClose}>
          <X />
        </button>
      </header>
      <div className="ce-instructions-list se-thread" ref={thread}>
        {turns.map((t, i) =>
          t.role === "you" ? (
            <div key={i} className="se-turn is-you">
              <div className="se-turn-label">YOU</div>
              <div>{t.text}</div>
              {t.bullets.length > 0 && (
                <ul>
                  {t.bullets.map((b, k) => (
                    <li key={k}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : t.role === "assistant" ? (
            <div key={i} className="se-turn">
              <div className="se-turn-label">
                <GeminiMark size={12} /> SCRIPTA · AI-PROPOSED
              </div>
              {t.reply.intro && <div>{t.reply.intro}</div>}
              {t.reply.proposals.length > 0 && (
                <div className="se-turn-note">
                  {t.reply.proposals.length} proposal{t.reply.proposals.length === 1 ? "" : "s"}{" "}
                  placed on the document — accept or reject each where it sits.
                </div>
              )}
              {t.reply.questions.length > 0 && (
                <ul>
                  {t.reply.questions.map((q, k) => (
                    <li key={k}>{q}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div key={i} className="se-turn is-error">
              <div className="se-turn-label">SCRIPTA · NOT AVAILABLE</div>
              <div>{t.text}</div>
            </div>
          ),
        )}
        {busy && (
          <div className="se-turn">
            <div className="se-turn-label">SCRIPTA · WORKING</div>
            <div className="se-turn-note">Reading the document and drafting the wording…</div>
          </div>
        )}
      </div>
      <footer>
        <textarea
          aria-label="Answer Scripta or ask for changes"
          placeholder="Answer the questions, or ask for changes…"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="ce-note-actions">
          <span>⌘+ENTER TO SEND</span>
          <button type="button" disabled={!draft.trim() || busy} onClick={send}>
            Send
          </button>
        </div>
      </footer>
    </aside>
  );
}
