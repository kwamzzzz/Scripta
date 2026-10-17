/**
 * What a reviewer needs beside a piece of feedback's words: the screen as the
 * sender saw it with their pick circled, what they pointed at, what was open
 * and how it was seen, a way back to the same spot with the same thing
 * highlighted, and a reply the sender will read. Used by the admin portal and
 * by Settings › Feedback, so both show the same thing.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { Crosshair, ExternalLink } from "lucide-react";
import { Button, SectionLabel } from "@/components/primitives";
import {
  getFeedbackScreenshot,
  setFeedbackReply,
  type FeedbackItem,
} from "@/lib/feedback.functions";
import { requestHighlight } from "@/lib/feedback-capture";
import "./feedback.css";

export default function FeedbackReview({
  item,
  onReplied,
}: {
  item: FeedbackItem;
  onReplied: () => void;
}) {
  const navigate = useNavigate();
  const [shot, setShot] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [reply, setReply] = useState(item.reply ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = item.context;

  useEffect(() => {
    if (!item.hasScreenshot) return;
    let live = true;
    getFeedbackScreenshot({ data: { id: item.id } })
      .then((r) => live && setShot(r.screenshot))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [item.id, item.hasScreenshot]);

  const openWhere = () => {
    if (item.target) requestHighlight(item.target);
    void navigate({ href: item.route || "/" });
  };

  const saveReply = async () => {
    setSaving(true);
    setError(null);
    try {
      await setFeedbackReply({ data: { id: item.id, reply: reply.trim() || null } });
      onReplied();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const facts: [string, string][] = [
    ["Where", c.trail || item.screen],
    [
      "Window",
      c.window
        ? `${c.window.width} × ${c.window.height}${c.screen ? ` on a ${c.screen.width} × ${c.screen.height} screen` : ""}`
        : "",
    ],
    ["Browser", c.browser ?? ""],
    [
      "Came from",
      c.visits && c.visits.length > 1
        ? c.visits
            .slice(-4, -1)
            .map((v) => v.screen || v.route)
            .join(" → ")
        : "",
    ],
    ["Time zone", c.timeZone ?? ""],
  ];

  return (
    <div className="fb-review">
      <div>
        {item.target && (
          <p className="fb-target" style={{ margin: "0 0 8px" }}>
            <Crosshair size={14} aria-hidden />
            <span>{item.target.label}</span>
          </p>
        )}
        <dl>
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          {c.errors && c.errors.length > 0 && (
            <>
              <dt>Errors before</dt>
              <dd>
                {c.errors.map((e, i) => (
                  <div
                    key={i}
                    style={{ fontFamily: "var(--scripta-font-mono, monospace)", fontSize: 11.5 }}
                  >
                    {e.message}
                  </div>
                ))}
              </dd>
            </>
          )}
        </dl>
        <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
          <Button onClick={openWhere}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ExternalLink size={13} aria-hidden /> Open where it happened
            </span>
          </Button>
        </div>
        <label style={{ display: "block" }}>
          <SectionLabel>Reply to the sender</SectionLabel>
          <textarea
            rows={2}
            value={reply}
            placeholder="They will see this under their own feedback."
            onChange={(e) => setReply(e.target.value)}
          />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <Button
            disabled={saving || reply.trim() === (item.reply ?? "")}
            onClick={() => void saveReply()}
          >
            {saving ? "Saving…" : item.reply ? "Update reply" : "Send reply"}
          </Button>
          {error && <span style={{ color: "#b4483a", fontSize: 12 }}>{error}</span>}
        </div>
      </div>
      <div>
        {item.hasScreenshot ? (
          shot ? (
            <button
              type="button"
              className="fb-review-shot"
              aria-label="Enlarge the screenshot"
              onClick={() => setZoom(true)}
            >
              <img src={shot} alt="The screen as the sender saw it" />
            </button>
          ) : (
            <p style={{ fontSize: 12, color: "#626c70" }}>Loading the screenshot…</p>
          )
        ) : (
          <p style={{ fontSize: 12, color: "#626c70" }}>No screenshot was attached.</p>
        )}
      </div>
      {zoom &&
        shot &&
        createPortal(
          <div
            className="fb-zoom"
            onClick={() => setZoom(false)}
            role="dialog"
            aria-label="Screenshot"
          >
            <img src={shot} alt="The screen as the sender saw it" />
          </div>,
          document.body,
        )}
    </div>
  );
}
