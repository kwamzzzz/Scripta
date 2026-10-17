import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Crosshair, X } from "lucide-react";
import { C, mono, radius } from "@/lib/tokens";
import { Button, SectionLabel } from "@/components/primitives";
import {
  FEEDBACK_KINDS,
  FEEDBACK_KIND_LABEL,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_STATUS_LABEL,
  feedbackMessageError,
  type FeedbackKind,
} from "@/lib/feedback";
import { listMyFeedback, submitFeedback } from "@/lib/feedback.functions";
import {
  captureScreen,
  gatherContext,
  listenForErrors,
  recordVisit,
  type FeedbackTarget,
} from "@/lib/feedback-capture";
import FeedbackPicker from "./FeedbackPicker";
import { useApp } from "@/store/app";
import "./feedback.css";

/**
 * The topbar chip on every screen, and what it sends.
 *
 * Feedback is only as useful as it is exact, so the sender points at the part
 * of the screen they mean rather than describing it: "Point at it" puts the
 * page under a crosshair and names what they click. The screen as they saw it
 * goes with it, their pick circled, unless they untick it. So does what they
 * would never think to type: what was open, their window and screen size,
 * their browser, the screens they came through and any errors the app hit.
 * They can see all of it before sending, and the replies to what they sent
 * under "Your feedback".
 *
 * The dialog is portalled to the body: the shell scales its content, and a
 * fixed overlay inside a transformed ancestor is positioned against that
 * ancestor instead of the window.
 */
export default function FeedbackChip({ screen }: { screen: string }) {
  const { workspace } = useApp();
  const route = useRouterState({ select: (s) => s.location.pathname + s.location.searchStr });
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"send" | "mine">("send");
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [expected, setExpected] = useState("");
  const [target, setTarget] = useState<FeedbackTarget | null>(null);
  const [picking, setPicking] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const [attachShot, setAttachShot] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where the sender has been, and what went wrong on the way, kept quietly
  // so a report can show how they got here.
  useEffect(() => listenForErrors(), []);
  useEffect(() => recordVisit(route, screen), [route, screen]);

  const mine = useQuery({
    queryKey: ["my-feedback"],
    enabled: open && tab === "mine",
    queryFn: async () => (await listMyFeedback()).items,
  });

  const reset = () => {
    setSent(false);
    setError(null);
    setMessage("");
    setExpected("");
    setTarget(null);
    setShot(null);
    setAttachShot(true);
    setKind("bug");
    setTab("send");
  };
  const close = () => {
    if (sending) return;
    setOpen(false);
    reset();
  };

  /** The part picked, then the screen as it stands with the pick marked. */
  const picked = async (t: FeedbackTarget) => {
    setPicking(false);
    setTarget(t);
    setShooting(true);
    setShot(await captureScreen(t));
    setShooting(false);
  };

  const composed = () =>
    [message.trim(), expected.trim() ? `What it should do instead: ${expected.trim()}` : ""]
      .filter(Boolean)
      .join("\n\n");

  const send = async () => {
    const body = composed();
    const invalid = feedbackMessageError(body);
    if (invalid) return setError(invalid);
    if (!workspace)
      return setError("No workspace is open yet. Wait for it to load, then send this again.");
    setSending(true);
    setError(null);
    try {
      // With nothing pointed at, the screen is taken now, the form left out.
      const picture = attachShot ? (shot ?? (await captureScreen(null))) : null;
      await submitFeedback({
        data: {
          workspaceId: workspace.id,
          kind,
          message: body,
          route,
          screen,
          target,
          context: gatherContext() as unknown as Record<string, unknown>,
          screenshot: picture,
        },
      });
      setSent(true);
    } catch (cause) {
      // Never swallowed: the dialog stays open with the text intact.
      setError(
        cause instanceof Error
          ? `That did not send: ${cause.message}`
          : "That did not send. Your message is still here — try again.",
      );
    } finally {
      setSending(false);
    }
  };

  const remaining = FEEDBACK_MAX_LENGTH - composed().length;
  const context = open ? gatherContext() : null;

  const form = (
    <>
      <div className="fb-where">
        <div>
          <SectionLabel>Screen</SectionLabel>
          <div className="fb-where-screen">{context?.trail || screen}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <SectionLabel>Page address</SectionLabel>
          <div className="fb-where-route" style={{ fontFamily: mono }}>
            {route}
          </div>
        </div>
      </div>

      <div role="radiogroup" aria-label="What kind of feedback is this?" className="fb-kinds">
        {FEEDBACK_KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            role="radio"
            aria-checked={kind === k.key}
            title={k.hint}
            className={kind === k.key ? "is-on" : undefined}
            onClick={() => setKind(k.key)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="fb-field">
        <SectionLabel>Which part of the screen</SectionLabel>
        {target ? (
          <div className="fb-target">
            <Crosshair size={14} aria-hidden />
            <span>{target.label}</span>
            <button type="button" className="fb-link" onClick={() => setPicking(true)}>
              Point again
            </button>
            <button
              type="button"
              className="fb-icon"
              aria-label="Clear what was pointed at"
              onClick={() => {
                setTarget(null);
                setShot(null);
              }}
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button type="button" className="fb-point" onClick={() => setPicking(true)}>
            <Crosshair size={15} aria-hidden /> Point at it
            <em>Click the button, card or area you mean, or drag a box around it</em>
          </button>
        )}
      </div>

      <label className="fb-field">
        <SectionLabel>{kind === "idea" ? "What would you change" : "What happened"}</SectionLabel>
        <textarea
          value={message}
          autoFocus
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            kind === "idea"
              ? "Describe the change you would like to see here."
              : "What you did, and what the screen did in response."
          }
          rows={4}
        />
      </label>

      <label className="fb-field">
        <SectionLabel>What it should do instead (optional)</SectionLabel>
        <textarea
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
          placeholder="The behaviour or wording you expected."
          rows={2}
        />
      </label>

      <div className="fb-shot">
        <label className="fb-check">
          <input
            type="checkbox"
            checked={attachShot}
            onChange={(e) => setAttachShot(e.target.checked)}
          />
          <span>
            Attach a picture of the screen
            <em>
              {target
                ? "With what you pointed at circled. Untick it if anything on screen is confidential."
                : "Taken as you send, without this form. Untick it if anything on screen is confidential."}
            </em>
          </span>
        </label>
        {attachShot && (shooting || shot) && (
          <div className="fb-shot-preview">
            {shooting ? (
              <span>Taking the picture…</span>
            ) : (
              <img src={shot!} alt="What will be sent" />
            )}
          </div>
        )}
      </div>

      <details className="fb-auto">
        <summary>Also sent automatically</summary>
        {context && (
          <dl>
            <dt>Where</dt>
            <dd>{context.trail || screen}</dd>
            <dt>Window</dt>
            <dd>
              {context.window.width} × {context.window.height} on a {context.screen.width} ×{" "}
              {context.screen.height} screen
            </dd>
            <dt>Browser</dt>
            <dd>{context.browser}</dd>
            <dt>Came from</dt>
            <dd>
              {context.visits.length > 1
                ? context.visits
                    .slice(-4, -1)
                    .map((v) => v.screen || v.route)
                    .join(" → ")
                : "Opened here"}
            </dd>
            <dt>Recent errors</dt>
            <dd>{context.errors.length ? `${context.errors.length} recorded` : "None"}</dd>
          </dl>
        )}
      </details>

      <div className="fb-foot">
        <div style={{ flex: 1, fontSize: 12, color: error ? C.red : C.muted }}>
          {error ?? (remaining < 200 ? `${remaining} characters left` : "")}
        </div>
        <Button onClick={close} disabled={sending}>
          Cancel
        </Button>
        <Button variant="primary" disabled={sending || !message.trim()} onClick={() => void send()}>
          {sending ? "Sending…" : "Send feedback"}
        </Button>
      </div>
    </>
  );

  const history = (
    <div className="fb-mine">
      {mine.isLoading ? (
        <p className="fb-muted">Loading…</p>
      ) : mine.isError ? (
        <p className="fb-muted" style={{ color: C.red }}>
          {(mine.error as Error).message}
        </p>
      ) : !mine.data?.length ? (
        <p className="fb-muted">You have not sent any feedback yet.</p>
      ) : (
        mine.data.map((item) => (
          <article key={item.id}>
            <header>
              <span>{FEEDBACK_KIND_LABEL[item.kind]}</span>
              <span className={`fb-status is-${item.status}`}>
                {FEEDBACK_STATUS_LABEL[item.status]}
              </span>
              <span className="fb-muted">
                {new Date(item.createdAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}{" "}
                · {item.screen}
              </span>
            </header>
            {item.target && <p className="fb-mine-target">{item.target.label}</p>}
            <p>{item.message}</p>
            {item.reply && (
              <blockquote>
                <SectionLabel>Reply</SectionLabel>
                {item.reply}
              </blockquote>
            )}
          </article>
        ))
      )}
    </div>
  );

  const dialog = (
    <div data-feedback-ui className="fb-backdrop" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share your feedback"
        className="fb-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.panel, borderRadius: radius.lg }}
      >
        <div className="fb-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "send"}
            onClick={() => setTab("send")}
          >
            Share your feedback
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "mine"}
            onClick={() => setTab("mine")}
          >
            Your feedback
          </button>
        </div>
        {tab === "mine" ? (
          history
        ) : sent ? (
          <>
            <p className="fb-sent">
              Sent. It goes to the people who review feedback, with the screen and what you pointed
              at. Replies appear under "Your feedback".
            </p>
            <div className="fb-foot">
              <span style={{ flex: 1 }} />
              <Button onClick={() => setTab("mine")}>See your feedback</Button>
              <Button variant="primary" onClick={close}>
                Done
              </Button>
            </div>
          </>
        ) : (
          form
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className="wf-top-chip fb-chip"
        aria-label="Share your feedback"
        onClick={() => setOpen(true)}
      >
        <span className="fb-chip-long">Share your feedback</span>
        <span className="fb-chip-short">Feedback</span>
      </button>
      {picking && (
        <FeedbackPicker
          screen={screen}
          onPick={(t) => void picked(t)}
          onCancel={() => setPicking(false)}
        />
      )}
      {open && !picking && typeof document !== "undefined"
        ? createPortal(dialog, document.body)
        : null}
    </>
  );
}
