/**
 * The other half of "Open where it happened": once the reviewer lands on the
 * screen, the thing the sender pointed at is found, scrolled into view and
 * ringed for a few seconds. If it cannot be found (the screen has changed
 * since), the spot where it was is ringed instead.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { nameOf, takeHighlight } from "@/lib/feedback-capture";

type Mark = { x: number; y: number; width: number; height: number; label: string };

export default function FeedbackHighlighter() {
  const [mark, setMark] = useState<Mark | null>(null);

  useEffect(() => {
    const wanted = takeHighlight();
    if (!wanted) return;
    let done = false;
    const show = (el: Element | null) => {
      if (done) return;
      done = true;
      if (el) {
        el.scrollIntoView({ block: "center", inline: "nearest" });
        // The screen is still settling as it loads: the ring follows the
        // element for as long as it is shown, rather than where it first was.
        const until = Date.now() + 6000;
        const follow = () => {
          if (Date.now() > until || !el.isConnected) return setMark(null);
          const r = el.getBoundingClientRect();
          setMark({ x: r.left, y: r.top, width: r.width, height: r.height, label: wanted.label });
          requestAnimationFrame(follow);
        };
        follow();
      } else {
        setMark({ ...wanted.rect, label: `${wanted.label} (was here)` });
        window.setTimeout(() => setMark(null), 6000);
      }
    };
    // The selector may match more than one thing (older reports kept a
    // shorter one): the match whose name is the one the sender saw wins.
    const find = () => {
      try {
        const all = wanted.selector ? Array.from(document.querySelectorAll(wanted.selector)) : [];
        return all.find((el) => wanted.label.startsWith(nameOf(el))) ?? all[0] ?? null;
      } catch {
        return null;
      }
    };
    // Screens load their data after they appear: wait for the thing to arrive.
    const found = find();
    if (found) return show(found);
    const watch = new MutationObserver(() => {
      const el = find();
      if (el) {
        watch.disconnect();
        show(el);
      }
    });
    watch.observe(document.body, { childList: true, subtree: true });
    const giveUp = window.setTimeout(() => {
      watch.disconnect();
      show(null);
    }, 6000);
    return () => {
      watch.disconnect();
      window.clearTimeout(giveUp);
    };
  }, []);

  if (!mark) return null;
  return createPortal(
    <div
      className="fb-highlight"
      style={{
        left: mark.x - 5,
        top: mark.y - 5,
        width: mark.width + 10,
        height: mark.height + 10,
      }}
    >
      {/* Near the right edge the label hangs leftwards, so it stays on screen. */}
      <span style={mark.x > window.innerWidth * 0.6 ? { left: "auto", right: -3 } : undefined}>
        {mark.label}
      </span>
    </div>,
    document.body,
  );
}
