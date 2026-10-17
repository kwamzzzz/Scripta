/**
 * The punctuation lens, as the screens draw it: every mark in green, a red dot
 * where a mark is certainly missing, an amber one where one probably is.
 *
 * One switch for the whole app, so turning it on in the contract editor also
 * lights up the redline beside it. The button carries the counts, and the
 * counts jump to each dot in turn: a document with no red is a document with
 * nothing certainly missing.
 */
import { Fragment, useRef, useSyncExternalStore, type ReactNode } from "react";
import { SpellCheck } from "lucide-react";
import {
  scanPunctuation,
  summarise,
  type Block,
  type BlockKind,
  type Gap,
  type Scan,
} from "@/lib/punctuation";
import "./punctuation-lens.css";

let lensOn = false;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Whether the lens is on. */
export function usePunctuationLens(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => lensOn,
    () => false,
  );
}

export function setPunctuationLens(on: boolean) {
  lensOn = on;
  listeners.forEach((fn) => fn());
}

/** A block's scan, arranged for drawing it a slice at a time. */
export type Lens = {
  marks: Set<number>;
  /** Marks a gap is about (an orphaned bracket), by the gap's level. */
  bad: Map<number, Gap>;
  /** Gaps by the place they sit. */
  at: Map<number, Gap[]>;
  length: number;
};

export function lensOf(text: string, kind: BlockKind): Lens {
  const scan: Scan = scanPunctuation(text, kind);
  const at = new Map<number, Gap[]>();
  const bad = new Map<number, Gap>();
  for (const g of scan.gaps) {
    at.set(g.at, [...(at.get(g.at) ?? []), g]);
    if (g.mark !== undefined && !bad.has(g.mark)) bad.set(g.mark, g);
  }
  return { marks: new Set(scan.marks), bad, at, length: text.length };
}

function Dot({ gap }: { gap: Gap }) {
  return (
    <span
      className={`pl-gap is-${gap.level}`}
      data-pl-gap={gap.level}
      title={gap.reason}
      role="img"
      aria-label={`${gap.level === "missing" ? "Missing punctuation" : "Check punctuation"}: ${gap.reason}`}
    />
  );
}

/**
 * The slice [from, from + text.length) of a scanned block, drawn with its
 * marks and dots. The last slice of a block also draws the dots that sit at
 * its very end.
 */
export function lensSlice(lens: Lens, text: string, from: number, last: boolean): ReactNode {
  const out: ReactNode[] = [];
  let plain = "";
  const flush = () => {
    if (plain) out.push(plain);
    plain = "";
  };
  const dots = (i: number) => {
    const here = lens.at.get(i);
    if (!here) return;
    flush();
    for (const g of here) out.push(<Dot key={`g${i}-${out.length}`} gap={g} />);
  };
  for (let j = 0; j < text.length; j++) {
    const i = from + j;
    dots(i);
    if (!lens.marks.has(i)) {
      plain += text[j];
      continue;
    }
    flush();
    const gap = lens.bad.get(i);
    out.push(
      <span key={`m${i}`} className={`pl-mark${gap ? ` is-${gap.level}` : ""}`} title={gap?.reason}>
        {text[j]}
      </span>,
    );
  }
  if (last) for (let i = from + text.length; i <= lens.length; i++) dots(i);
  flush();
  return (
    <>{out.map((n, k) => (typeof n === "string" ? <Fragment key={`t${k}`}>{n}</Fragment> : n))}</>
  );
}

/** Only the dots at one place, for a place drawn as something other than text (a line break). */
export function lensDots(lens: Lens, i: number): ReactNode {
  const here = lens.at.get(i);
  return here ? here.map((g, k) => <Dot key={`d${i}-${k}`} gap={g} />) : null;
}

/** A block of plain text under the lens. */
export function LensText({ text, kind }: { text: string; kind: BlockKind }) {
  return <>{lensSlice(lensOf(text, kind), text, 0, true)}</>;
}

/**
 * The switch, for a screen's toolbar. When on it shows how many marks there
 * are, how many are missing and how many to check; the last two step through
 * their dots on the page.
 */
export function PunctuationButton({
  blocks,
  className,
  labelClassName,
}: {
  /** The text the screen shows, read only while the lens is on. */
  blocks: () => Block[];
  className: string;
  labelClassName?: string;
}) {
  const on = usePunctuationLens();
  const step = useRef<Record<string, number>>({});
  const total = on ? summarise(blocks()) : null;

  const jump = (level: Gap["level"]) => {
    const dots = [...document.querySelectorAll<HTMLElement>(`[data-pl-gap="${level}"]`)];
    if (!dots.length) return;
    const i = (step.current[level] ?? -1) + 1;
    const next = i % dots.length;
    step.current[level] = next;
    const dot = dots[next]!;
    // Instant, not smooth: a smooth scroll still moving when the next click lands stops short.
    dot.scrollIntoView({ block: "center" });
    for (const d of document.querySelectorAll(".pl-gap.is-flash")) d.classList.remove("is-flash");
    void dot.offsetWidth;
    dot.classList.add("is-flash");
  };

  return (
    <>
      <button
        type="button"
        className={`${className}${on ? " is-active pl-on" : ""}`}
        aria-pressed={on}
        onClick={() => {
          step.current = {};
          setPunctuationLens(!on);
        }}
        title={
          on
            ? "Hide the punctuation lens"
            : "Show every punctuation mark in green, and a red dot wherever one is missing"
        }
      >
        <SpellCheck />
        <span className={labelClassName}>Punctuation</span>
      </button>
      {total && (
        <span className="pl-summary" role="status">
          <span className="pl-key is-mark">
            <i aria-hidden />
            {total.marks.toLocaleString("en-GB")} marks
          </span>
          <button
            type="button"
            className="pl-key is-missing"
            disabled={!total.missing}
            onClick={() => jump("missing")}
            title={total.missing ? "Go to the next missing mark" : "Nothing is certainly missing"}
          >
            <i aria-hidden />
            {total.missing ? `${total.missing} missing` : "None missing"}
          </button>
          <button
            type="button"
            className="pl-key is-check"
            disabled={!total.check}
            onClick={() => jump("check")}
            title={total.check ? "Go to the next place to check" : "Nothing to check"}
          >
            <i aria-hidden />
            {total.check} to check
          </button>
        </span>
      )}
    </>
  );
}
