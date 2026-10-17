/**
 * Read aloud, as the document screens show it: a faint speaker on each
 * container's header (it shows when the pointer is on that container), and a
 * small player at the foot of the screen while something is being read.
 *
 * The screen names its containers in reading order with useReadSource, marks
 * each container element with data-read-id, and opens a container while
 * useReadingId says it is being read. The reader (lib/read-aloud.ts) does the
 * rest.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Square,
  Volume2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { KOKORO_VOICES } from "@/learning/kokoro";
import { englishVoices } from "@/learning/areas/ReadAloud";
import {
  RATES,
  idleSnapshot,
  nextContainer,
  pauseReading,
  previousContainer,
  readerSnapshot,
  resumeReading,
  setReadingRate,
  setReadingVoice,
  startReading,
  stopReading,
  subscribeReader,
  voiceName,
  type ReadItem,
  type ReaderSnapshot,
} from "@/lib/read-aloud";
import "./doc-reader.css";

export function useReader(): ReaderSnapshot {
  return useSyncExternalStore(subscribeReader, readerSnapshot, idleSnapshot);
}

const readingIdOf = (r: ReaderSnapshot) =>
  r.state === "idle" ? null : (r.items[r.item]?.id ?? null);

/**
 * The container being read, or null. Only this value is watched, so a screen's
 * containers redraw when the reader moves, not on every change inside it.
 */
export function useReadingId(): string | null {
  return useSyncExternalStore(
    subscribeReader,
    () => readingIdOf(readerSnapshot()),
    () => null,
  );
}

let source: (() => ReadItem[]) | null = null;

/**
 * The screen's containers, in reading order, read when a speaker is pressed.
 * Leaving the screen stops the voice.
 */
export function useReadSource(items: () => ReadItem[]) {
  const latest = useRef(items);
  latest.current = items;
  useEffect(() => {
    source = () => latest.current();
    return () => {
      source = null;
      stopReading();
    };
  }, []);
}

/** The speaker on a container's header: read from here, or pause and resume it. */
export function ReadButton({ id, what }: { id: string; what: string }) {
  // Only whether this container is the one being read, and how: every speaker
  // on an 83-clause contract must not redraw each time the reader moves.
  const mine = useSyncExternalStore(
    subscribeReader,
    () => {
      const r = readerSnapshot();
      return readingIdOf(r) === id ? r.state : "off";
    },
    () => "off",
  );
  const here = mine !== "off";
  const playing = mine === "playing";
  return (
    <button
      type="button"
      className={`ra-btn${here ? " is-on" : ""}`}
      aria-label={playing ? `Pause reading ${what}` : `Read ${what} aloud`}
      title={playing ? "Pause" : here ? "Resume" : "Read aloud from here"}
      onClick={(e) => {
        e.stopPropagation();
        if (playing) pauseReading();
        else if (here) resumeReading();
        else if (source) startReading(source(), id);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {playing ? <Pause /> : <Volume2 />}
    </button>
  );
}

/** The player: only there while something is being read. */
export function ReaderBar() {
  const r = useReader();
  const current = r.state === "idle" ? null : r.items[r.item];

  // Light up the container being read and keep it on screen. It may only just
  // have been opened, so look for it once the screen has drawn it.
  const id = current?.id ?? null;
  useEffect(() => {
    if (!id) return;
    let el: HTMLElement | null = null;
    // A timer rather than an animation frame: frames stop in a background tab,
    // and the voice (and so the highlight) carries on there.
    const t = window.setTimeout(() => {
      el = document.querySelector<HTMLElement>(`[data-read-id="${CSS.escape(id)}"]`);
      if (!el) return;
      el.classList.add("ra-reading");
      const box = el.getBoundingClientRect();
      if (box.top < 80 || box.top > window.innerHeight - 160)
        el.scrollIntoView({ block: box.height > window.innerHeight * 0.6 ? "start" : "center" });
    }, 30);
    return () => {
      window.clearTimeout(t);
      el?.classList.remove("ra-reading");
    };
  }, [id]);

  if (!current) return null;
  const name = current.name ?? current.label ?? "";
  // On the page itself, so no scrolling pane or transformed parent can move it.
  return createPortal(
    <div className="ra-bar" role="group" aria-label="Read aloud" data-state={r.state}>
      <button
        type="button"
        className="ra-bar-btn"
        onClick={previousContainer}
        title="Back: this one again, or the one before"
        aria-label="Back"
      >
        <SkipBack />
      </button>
      {r.state === "playing" ? (
        <button
          type="button"
          className="ra-bar-btn is-main"
          onClick={pauseReading}
          title="Pause"
          aria-label="Pause"
        >
          <Pause />
        </button>
      ) : (
        <button
          type="button"
          className="ra-bar-btn is-main"
          onClick={resumeReading}
          title="Resume"
          aria-label="Resume"
        >
          <Play />
        </button>
      )}
      <button
        type="button"
        className="ra-bar-btn"
        onClick={nextContainer}
        disabled={r.item >= r.items.length - 1}
        title="Next"
        aria-label="Next"
      >
        <SkipForward />
      </button>
      <span className="ra-bar-status" aria-live="polite">
        <b>{r.state === "paused" ? "Paused" : "Reading"}</b>
        {name ? ` ${name}` : ""}
        <i>
          {r.item + 1} of {r.items.length}
        </i>
      </span>
      <ReaderSettings rate={r.rate} voice={r.voice} />
      <button
        type="button"
        className="ra-bar-btn"
        onClick={stopReading}
        title="Stop"
        aria-label="Stop"
      >
        <Square />
      </button>
      {r.note && <span className="ra-bar-note">{r.note}</span>}
    </div>,
    document.body,
  );
}

/** Speed and voice, behind one small control that says what is set. */
function ReaderSettings({ rate, voice }: { rate: number; voice: string }) {
  const [system, setSystem] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setSystem(englishVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ra-bar-rate"
          title="Voice and speed"
          aria-label="Voice and speed"
        >
          <SlidersHorizontal />
          {rate}× · {voiceName(voice)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" sideOffset={10} className="ra-pop">
        <label className="ra-field">
          <span>Speed</span>
          <select value={rate} onChange={(e) => setReadingRate(Number(e.target.value))}>
            {RATES.map((x) => (
              <option key={x} value={x}>
                {x}×
              </option>
            ))}
          </select>
        </label>
        <label className="ra-field">
          <span>Voice</span>
          <select value={voice} onChange={(e) => setReadingVoice(e.target.value)}>
            <optgroup label="Natural voices (best quality)">
              {KOKORO_VOICES.map((v) => (
                <option key={v.id} value={`kokoro:${v.id}`}>
                  {v.label} · British
                </option>
              ))}
            </optgroup>
            {system.length ? (
              <optgroup label="This computer's voices">
                {system.map((v) => (
                  <option key={v.name} value={`system:${v.name}`}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
      </PopoverContent>
    </Popover>
  );
}
