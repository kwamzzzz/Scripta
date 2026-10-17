/**
 * "Point at it": the page under a crosshair, the thing beneath the pointer
 * outlined, a click to choose it or a drag to box an area. What is chosen is
 * named the way a person would say it, so the report says exactly which part
 * of the screen it is about.
 */
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { describe, selectorFor, type FeedbackTarget } from "@/lib/feedback-capture";

/** The part a person means: the button, not the icon inside it. */
const MEANINGFUL =
  "button, a, input, select, textarea, label, [role], [aria-label], h1, h2, h3, h4, th, td, tr, li, article, img";

function pick(x: number, y: number): Element | null {
  const hit = document
    .elementsFromPoint(x, y)
    .find(
      (e) =>
        !e.closest("[data-feedback-ui]") && e !== document.documentElement && e !== document.body,
    );
  if (!hit) return null;
  const near = hit.closest(MEANINGFUL);
  // Only climb a little way: a whole panel is rarely what was meant.
  if (near && near.contains(hit)) {
    let depth = 0;
    for (let n: Element | null = hit; n && n !== near; n = n.parentElement) depth++;
    if (depth <= 4) return near;
  }
  return hit;
}

const rectOf = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

export default function FeedbackPicker({
  screen,
  onPick,
  onCancel,
}: {
  screen: string;
  onPick: (target: FeedbackTarget) => void;
  onCancel: () => void;
}) {
  const [hover, setHover] = useState<{ rect: FeedbackTarget["rect"]; label: string } | null>(null);
  const [box, setBox] = useState<FeedbackTarget["rect"] | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

  const move = (e: MouseEvent) => {
    if (start.current) {
      const x = Math.min(start.current.x, e.clientX);
      const y = Math.min(start.current.y, e.clientY);
      const width = Math.abs(e.clientX - start.current.x);
      const height = Math.abs(e.clientY - start.current.y);
      if (width > 6 || height > 6) {
        setBox({ x, y, width, height });
        return;
      }
    }
    const el = pick(e.clientX, e.clientY);
    setHover(el ? { rect: rectOf(el), label: describe(el, "") } : null);
  };

  const up = (e: MouseEvent) => {
    const origin = start.current;
    start.current = null;
    if (box && origin) {
      // An area: named by what sits at its middle.
      const middle = pick(box.x + box.width / 2, box.y + box.height / 2);
      onPick({
        kind: "area",
        label: `Area around ${middle ? describe(middle, screen) : `part of ${screen}`}`,
        selector: middle ? selectorFor(middle) : "",
        rect: box,
        viewport: viewport(),
      });
      return;
    }
    const el = pick(e.clientX, e.clientY);
    if (!el) return;
    onPick({
      kind: "element",
      label: describe(el, screen),
      selector: selectorFor(el),
      rect: rectOf(el),
      viewport: viewport(),
    });
  };

  const outline = box ?? hover?.rect ?? null;
  return createPortal(
    <div
      data-feedback-ui
      className="fb-picker"
      onMouseMove={move}
      onMouseDown={(e) => {
        e.preventDefault();
        start.current = { x: e.clientX, y: e.clientY };
        setBox(null);
      }}
      onMouseUp={up}
      role="application"
      aria-label="Point at the part of the screen your feedback is about"
    >
      <div className="fb-picker-hint">
        Click the thing you mean, or drag a box around an area. <kbd>Esc</kbd> to go back.
      </div>
      {outline && (
        <div
          className={`fb-picker-outline${box ? " is-box" : ""}`}
          style={{
            left: outline.x - 3,
            top: outline.y - 3,
            width: outline.width + 6,
            height: outline.height + 6,
          }}
        >
          {!box && hover && (
            <span
              style={outline.x > window.innerWidth * 0.6 ? { left: "auto", right: -2 } : undefined}
            >
              {hover.label}
            </span>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
