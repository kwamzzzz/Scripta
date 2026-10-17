/**
 * The bell, and the panel behind it.
 *
 * A quiet dot, never a number that climbs. A compact panel, never a route and
 * never a page. Every entry goes somewhere specific — the clause, the thread,
 * the task, the review — because an entry you cannot act on from is noise, and
 * because "open the matter and hunt" is exactly what this replaces.
 *
 * The restraint is the specification. The moment this grows preferences,
 * filters, per-event read state or a count, it has become the inbox we refused
 * to build.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import {
  describe,
  linkFor,
  useAwareness,
  useMarkAwarenessSeen,
  type AwarenessEvent,
} from "@/lib/awareness";
import { C, mono, radius } from "@/lib/tokens";

const when = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export default function AwarenessBell() {
  const [open, setOpen] = useState(false);
  const events = useAwareness();
  const markSeen = useMarkAwarenessSeen();
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement | null>(null);

  const items = events.data ?? [];
  const unseen = items.some((event) => event.isNew);

  // Opening it is being told. Closing marks them seen, so the dot reflects
  // "something arrived since you last looked" rather than "you clicked".
  useEffect(() => {
    if (open || !unseen) return;
    return;
  }, [open, unseen]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        setOpen(false);
        if (unseen) markSeen.mutate();
      }
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open, unseen, markSeen]);

  const go = (event: AwarenessEvent) => {
    const href = linkFor(event);
    setOpen(false);
    if (unseen) markSeen.mutate();
    if (href) void navigate({ to: href as never });
  };

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={unseen ? "Recent collaboration, with something new" : "Recent collaboration"}
        aria-expanded={open}
        onClick={() => {
          setOpen((was) => {
            if (was && unseen) markSeen.mutate();
            return !was;
          });
        }}
        style={{
          position: "relative",
          border: 0,
          background: "transparent",
          color: C.secondary,
          cursor: "pointer",
          padding: 6,
          display: "inline-flex",
          borderRadius: radius.md,
        }}
      >
        <Bell size={16} />
        {unseen && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 6,
              height: 6,
              borderRadius: 999,
              background: C.accent,
            }}
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Recent collaboration"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            width: 340,
            maxHeight: 420,
            overflowY: "auto",
            border: `1px solid ${C.border}`,
            borderRadius: radius.lg,
            background: C.panel,
            boxShadow: "0 10px 28px rgba(0,0,0,.12)",
            zIndex: 60,
            padding: 6,
          }}
        >
          <div
            style={{
              padding: "7px 9px 9px",
              color: C.faint,
              font: `500 10px ${mono}`,
              letterSpacing: ".08em",
            }}
          >
            WHAT HAPPENED
          </div>

          {items.length === 0 ? (
            <p style={{ margin: 0, padding: "4px 9px 12px", color: C.muted, fontSize: 12.5 }}>
              Nothing involving you yet. This is not a feed of everything — only what you were part
              of.
            </p>
          ) : (
            items.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => go(event)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: 0,
                  borderRadius: radius.md,
                  background: event.isNew ? C.accentTint : "transparent",
                  cursor: "pointer",
                  font: "inherit",
                  padding: "8px 9px",
                }}
              >
                <div style={{ color: C.text, fontSize: 12.5, fontWeight: 500 }}>
                  {describe(event)}
                </div>
                <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{event.summary}</div>
                <div style={{ color: C.faint, fontSize: 11, marginTop: 3 }}>{when(event.at)}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
