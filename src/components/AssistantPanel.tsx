import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, PanelRightClose } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { askAssistant } from "@/lib/assistant.functions";
import {
  ASSISTANT_INTRO,
  type AssistantAction,
  type AssistantMessage,
  type AssistantScope,
} from "@/lib/assistant";
import GeminiMark from "@/components/GeminiMark";
import ScriptaLogo from "@/components/ScriptaLogo";

/** Conversation kept for the tab session, per thread key, so it survives navigation. */
function useThread(key: string) {
  const storageKey = `px.assistant.thread.${key}`;
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      setMessages(raw ? (JSON.parse(raw) as AssistantMessage[]) : []);
    } catch {
      setMessages([]);
    }
    setReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (!ready) return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      /* ignore quota errors */
    }
  }, [messages, ready, storageKey]);
  return [messages, setMessages] as const;
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * The Scripta Dialogue from the wireframe: a 296px column on the right of
 * every screen. Empty threads show the screen's intro and prompts; answers
 * arrive as labelled analysis cards, visibly AI-proposed, with the reasoning
 * folded under "Show detailed analysis".
 */
export default function AssistantPanel({
  scope,
  onClose,
}: {
  scope: AssistantScope;
  onClose: () => void;
}) {
  const [messages, setMessages] = useThread(scope.key);
  const { profile } = useAuth();
  const initials = (profile?.full_name || profile?.email || "P")
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * Which half of the panel the column is given to.
   *
   * With a clause reading above it and a composer below it, the conversation
   * was left a few lines deep in a 296px column: an answer about a payment
   * clause arrived clipped at "The USD 1,350 advance applies exclusively to
   * the Website Work and does…", and the only way to read it was to scroll a
   * box smaller than the text in it. Both halves are worth the whole column
   * and neither is worth half of one, so they take turns.
   *
   * The reading comes first, because it is what the screen is for. Asking a
   * question moves to the answer, since a question is a request to read one.
   */
  const [view, setView] = useState<"brief" | "chat">("brief");
  /* No reading to show means there is nothing to take turns with. */
  const showBrief = !!scope.brief && view === "brief";
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!scope.composerRequest) return;
    setDraft(scope.composerRequest.text);
    inputRef.current?.focus();
  }, [scope.composerRequest]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setView("chat");
    const history = messages
      .filter((m) => m.role !== "error")
      .map((m) =>
        m.role === "user"
          ? { role: "user" as const, text: m.text }
          : { role: "assistant" as const, text: m.reply.summary },
      );
    setMessages((ms) => [
      ...ms,
      { id: uid(), role: "user", text: q, at: new Date().toISOString() },
    ]);
    setDraft("");
    setBusy(true);
    try {
      const res = await askAssistant({
        data: {
          question: q,
          screen: scope.screen,
          label: scope.label,
          matterId: scope.matterId ?? null,
          clauseId: scope.clauseId ?? null,
          history,
        },
      });
      setMessages((ms) => [
        ...ms,
        res.ok
          ? { id: uid(), role: "assistant", reply: res.reply, at: new Date().toISOString() }
          : { id: uid(), role: "error", text: res.error, at: new Date().toISOString() },
      ]);
    } catch (e) {
      setMessages((ms) => [
        ...ms,
        {
          id: uid(),
          role: "error",
          text: (e as Error).message || "The assistant is unavailable right now.",
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };

  const empty = messages.length === 0 && !busy;

  return (
    <aside className={`wf-assistant${showBrief ? " has-brief" : ""}`} aria-label="Scripta assistant">
      <header className="wf-assistant-head">
        <div className="wf-assistant-brand">
          <ScriptaLogo />
          <div className="wf-assistant-sub" title={scope.label}>
            {scope.label}
          </div>
        </div>
        <button
          type="button"
          className="wf-assistant-square"
          title="Hide assistant (⌘J)"
          aria-label="Hide assistant"
          onClick={onClose}
        >
          <PanelRightClose size={14} strokeWidth={1.5} />
        </button>
      </header>

      {/* One at a time, each over the whole column. */}
      {scope.brief && (
        <div className="wf-assistant-views" role="tablist" aria-label="What this panel shows">
          <button
            type="button"
            role="tab"
            aria-selected={view === "brief"}
            className={view === "brief" ? "is-on" : ""}
            title="What this clause does, what it means for the client, and what to do about it"
            onClick={() => setView("brief")}
          >
            Clause
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "chat"}
            className={view === "chat" ? "is-on" : ""}
            title="Ask Scripta about this clause, and read the answer in full"
            onClick={() => setView("chat")}
          >
            Chat
            {messages.length > 0 && <span>{messages.filter((m) => m.role === "user").length}</span>}
          </button>
        </div>
      )}

      {showBrief && <div className="wf-assistant-brief">{scope.brief}</div>}

      {showBrief ? null : empty ? (
        <div className="wf-assistant-empty">
          <div className="wf-assistant-note">{scope.intro || ASSISTANT_INTRO}</div>
          {!!scope.suggestions?.length && (
            <div className="wf-assistant-chips">
              {scope.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="wf-assistant-chip"
                  onClick={() => void ask(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="wf-assistant-body" ref={bodyRef}>
          <div className="wf-assistant-thread-bar">
            <span />
            <button
              type="button"
              className="wf-text-action"
              onClick={() => setMessages([])}
              disabled={busy}
            >
              New chat
            </button>
          </div>
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="wf-scripta-you">
                <div className="wf-scripta-you-head">
                  <span className="wf-scripta-avatar">{initials}</span>
                  <span className="wf-scripta-eyebrow">YOU · ASKED</span>
                </div>
                {m.text}
              </div>
            ) : m.role === "assistant" ? (
              <ScriptaCard
                key={m.id}
                label={m.reply.label}
                summary={m.reply.summary}
                detail={m.reply.detail}
                sources={m.reply.sources}
                actions={m.reply.actions ?? []}
                onAction={(action) =>
                  scope.onAction ? scope.onAction(action) : void ask(action.label)
                }
              />
            ) : (
              <div key={m.id} className="wf-scripta-card is-error">
                <div className="wf-scripta-head">
                  <span className="wf-scripta-mark">
                    <GeminiMark size={16} />
                  </span>
                  <b>Scripta</b>
                  <span className="wf-scripta-eyebrow">NOT AVAILABLE</span>
                </div>
                <div className="wf-scripta-summary">{m.text}</div>
              </div>
            ),
          )}
          {busy && (
            <div className="wf-scripta-card is-pending" role="status">
              <div className="wf-scripta-head">
                <span className="wf-scripta-mark">
                  <GeminiMark size={16} />
                </span>
                <b>Scripta</b>
                <span className="wf-scripta-eyebrow">WORKING</span>
              </div>
              <div className="wf-scripta-summary wf-muted">
                Reading the matter and drafting an answer…
              </div>
            </div>
          )}
        </div>
      )}

      <form className="wf-assistant-foot" onSubmit={submit}>
        {scope.screen === "Contract Editor" ? (
          <textarea
            ref={(el) => {
              inputRef.current = el;
            }}
            rows={3}
            style={{ resize: "vertical", minHeight: 72 }}
            className="wf-assistant-input"
            placeholder="Ask Scripta…"
            aria-label="Ask Scripta"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void ask(draft);
              }
            }}
          />
        ) : (
          <input
            ref={(el) => {
              inputRef.current = el;
            }}
            className="wf-assistant-input"
            placeholder="Ask Scripta…"
            aria-label="Ask Scripta"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
          />
        )}
        <button
          type="submit"
          className="wf-assistant-send"
          aria-label="Send"
          title="Send"
          disabled={busy || !draft.trim()}
        >
          <ArrowUp size={14} strokeWidth={2} />
        </button>
      </form>
    </aside>
  );
}

/** The reference's "Scripta RESPONDED" card: summary, labelled analysis, detail folded. */
function ScriptaCard({
  label,
  summary,
  detail,
  sources,
  actions = [],
  onAction,
}: {
  label: string;
  summary: string;
  detail: string;
  sources: string[];
  actions?: AssistantAction[];
  onAction?: (action: AssistantAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const paragraphs = detail.split(/\n{2,}/).filter((p) => p.trim());
  const lead = paragraphs[0] ?? "";
  const rest = paragraphs.slice(1);
  const more = rest.length > 0 || sources.length > 0;
  return (
    <div className="wf-scripta-card">
      <div className="wf-scripta-head">
        <span className="wf-scripta-mark">
          <GeminiMark size={16} />
        </span>
        <b>Scripta</b>
        <span className="wf-scripta-eyebrow">RESPONDED</span>
      </div>
      {summary && <div className="wf-scripta-summary">{summary}</div>}
      {actions.length > 0 && (
        <div className="wf-assistant-chips" style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="wf-assistant-chip"
              style={action.kind === "primary" ? { fontWeight: 600 } : undefined}
              onClick={() => onAction?.(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      {(lead || more) && (
        <>
          <div className="wf-scripta-label">
            <span>{label}</span>
            <i aria-hidden>✓</i>
          </div>
          <div className="wf-scripta-analysis">
            {lead && <div className="wf-scripta-text">{lead}</div>}
            {more && (
              <button
                type="button"
                className="wf-scripta-toggle"
                onClick={() => setOpen((v) => !v)}
              >
                <span>{open ? "▾" : "▸"}</span>
                <b>{open ? "Hide detailed analysis" : "Show detailed analysis"}</b>
              </button>
            )}
            {open && more && (
              <div className="wf-scripta-detail">
                {rest.map((p, i) => (
                  <div key={i} className="wf-scripta-text is-detail">
                    {p}
                  </div>
                ))}
                <div className="wf-scripta-eyebrow">
                  {sources.length ? `SOURCES: ${sources.join(" · ")} · ` : "SOURCES SHOWN · "}VERIFY
                  BEFORE RELIANCE
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
