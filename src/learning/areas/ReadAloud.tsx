/**
 * Read aloud: the page spoken aloud, in a natural voice where the machine can.
 *
 * Two engines behind one bar. Kokoro (see kokoro.ts) is an open voice model
 * run in the browser: natural, and the default. The system voices
 * (speechSynthesis) are the fallback for machines that cannot run it.
 *
 * A study aid only. It never marks anything complete and stores nothing on
 * the server: the chosen voice and speed, and where each item was left, live
 * in this browser. Speech runs one segment at a time (see reader.ts), which is
 * what makes "start from this paragraph" reliable. Kokoro prepares the next
 * segment while one plays, so there is no gap between them.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Pause, Play, SkipBack, SkipForward, SlidersHorizontal, Square } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Block } from "../blocks";
import { KOKORO_VOICES, kokoroAudio, kokoroReady, loadKokoro, type KokoroVoice } from "../kokoro";
import { readingSegments } from "../reader";

const RATES = [0.8, 1, 1.2, 1.5];
const VOICE_KEY = "px.reader.voice";
const RATE_KEY = "px.reader.rate";
/** A voice choice: "kokoro:bf_emma", or "system:<voice name>". */
const DEFAULT_VOICE = "kokoro:bf_emma";
const kokoroId = (choice: string) =>
  choice.startsWith("kokoro:") ? (choice.slice(7) as KokoroVoice) : null;
const posKey = (itemId: string) => `px.reader.pos.${itemId}`;

const stored = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string, value: string | null) => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private window: nothing is remembered */
  }
};

/**
 * System voices not offered: macOS's joke and 1990s voices ("Bubbles",
 * "Zarvox"), and the ones Kwame judged the worst to study with (the
 * "Eloquence" family, Tessa, Rishi and Daniel).
 */
const HIDDEN =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Fred|Good News|Jester|Junior|Kathy|Organ|Ralph|Superstar|Trinoids|Whisper|Wobble|Zarvox|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Tessa|Rishi|Daniel)\b/;

/** English voices, the ones that sound best first, British English before others. */
export function englishVoices(): SpeechSynthesisVoice[] {
  const rank = (v: SpeechSynthesisVoice) =>
    (/premium|enhanced|natural/i.test(v.name) ? 0 : 4) +
    (v.lang === "en-GB" ? 0 : 2) +
    (v.localService ? 0 : 1);
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("en") && !HIDDEN.test(v.name))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

type State = "idle" | "playing" | "paused";

export function ReadAloud({
  itemId,
  blocks,
  container,
}: {
  itemId: string;
  blocks: Block[];
  /** The page being read: clicks on its blocks start reading there. */
  container: RefObject<HTMLElement | null>;
}) {
  const supported = typeof window !== "undefined";
  const hasSystem = supported && "speechSynthesis" in window;
  const segments = useMemo(() => readingSegments(blocks), [blocks]);
  const [state, setState] = useState<State>("idle");
  const [index, setIndex] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [choice, setChoice] = useState(() => {
    const s = supported ? stored(VOICE_KEY) : null;
    // Before natural voices existed a bare system voice name was stored.
    return s ? (s.includes(":") ? s : `system:${s}`) : DEFAULT_VOICE;
  });
  const [rate, setRate] = useState(() => Number(supported ? stored(RATE_KEY) : null) || 1);
  const [saved, setSaved] = useState(() => Number(supported ? stored(posKey(itemId)) : null) || 0);
  /** Kokoro's first load: the share downloaded, or null when not loading. */
  const [preparing, setPreparing] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** Kokoro is voicing the paragraph about to be read. */
  const [waiting, setWaiting] = useState(false);
  /** Where the progress slider is while it is being dragged. */
  const [drag, setDrag] = useState<number | null>(null);
  // Each start gets a new number; a finished or cancelled segment from an
  // earlier start must not move the reader on.
  const run = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  /** Kokoro audio for this item and voice, by segment: made once, reused. */
  const clips = useRef(new Map<string, Promise<string>>());

  useEffect(() => {
    if (!hasSystem) return;
    const load = () => setVoices(englishVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [hasSystem]);

  const silence = () => {
    run.current++;
    if (hasSystem) window.speechSynthesis.cancel();
    audio.current?.pause();
  };

  // Leaving the item, or the page, stops the voice and frees its audio.
  useEffect(() => {
    setState("idle");
    setIndex(0);
    setSaved(Number(stored(posKey(itemId))) || 0);
    const made = clips.current;
    return () => {
      silence();
      for (const clip of made.values())
        void clip.then(
          (url) => URL.revokeObjectURL(url),
          () => {},
        );
      made.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const kokoro = kokoroId(choice);
  const systemVoice =
    voices.find((v) => `system:${v.name}` === choice) ?? (kokoro ? undefined : voices[0]);
  // Read at speaking time, so a change of voice or speed applies straight away.
  const choiceRef = useRef(choice);
  const rateRef = useRef(rate);
  choiceRef.current = choice;
  rateRef.current = rate;

  const finish = () => {
    setState("idle");
    setIndex(0);
    setSaved(0);
    store(posKey(itemId), null);
  };

  const mark = (i: number) => {
    setIndex(i);
    setSaved(i);
    store(posKey(itemId), String(i));
  };

  const clip = (i: number, voice: KokoroVoice) => {
    const key = `${voice}|${i}`;
    let made = clips.current.get(key);
    if (!made) {
      made = kokoroAudio(segments[i]!.text, voice);
      clips.current.set(key, made);
      made.catch(() => clips.current.delete(key));
    }
    return made;
  };

  /** Read from segment `start`; `notice` explains a change the reader made itself. */
  const speakFrom = (start: number, notice: string | null = null) => {
    silence();
    const token = run.current;
    const first = Math.min(Math.max(start, 0), segments.length - 1);
    setState("playing");
    setProblem(notice);
    const voice = kokoroId(choiceRef.current);

    if (voice) {
      const player = (audio.current ??= new Audio());
      const play = async (i: number) => {
        if (token !== run.current) return;
        if (i >= segments.length) return finish();
        mark(i);
        // The first time, the model is still downloading: read with a system
        // voice meanwhile, and let the natural voice take over when it is in.
        const standin = voices[0];
        if (!kokoroReady() && standin && hasSystem) {
          const u = new SpeechSynthesisUtterance(segments[i]!.text);
          u.voice = standin;
          u.lang = standin.lang;
          u.rate = rateRef.current;
          u.onend = () => void play(i + 1);
          u.onerror = (e) => {
            if (e.error === "canceled" || e.error === "interrupted") return;
            void play(i + 1);
          };
          window.speechSynthesis.speak(u);
          return;
        }
        let url: string;
        setWaiting(true);
        try {
          url = await clip(i, voice);
        } catch {
          setWaiting(false);
          if (token !== run.current) return;
          // The model would not run here: carry on with the system voice, and say so.
          const fallback = voices[0] ? `system:${voices[0].name}` : null;
          if (!fallback) return setState("paused");
          setChoice(fallback);
          choiceRef.current = fallback;
          window.setTimeout(
            () =>
              speakFrom(
                i,
                "The natural voice could not start on this computer, so a system voice is reading.",
              ),
            0,
          );
          return;
        }
        setWaiting(false);
        if (token !== run.current) return;
        // Voice the next two while this one plays, so there is no gap.
        for (const next of [i + 1, i + 2]) {
          if (next < segments.length) void clip(next, voice).catch(() => {});
        }
        player.src = url;
        player.playbackRate = rateRef.current;
        player.onended = () => void play(i + 1);
        try {
          await player.play();
        } catch {
          if (token !== run.current) return;
          setState("paused");
          setProblem("The browser did not start the voice. Press Resume to try again.");
        }
      };
      setPreparing(0);
      void loadKokoro((f) => setPreparing(f))
        .catch(() => {})
        .finally(() => setPreparing(null));
      // Chrome can drop speech queued in the same tick as a cancel.
      window.setTimeout(() => void play(first), 60);
      return;
    }

    if (!hasSystem) return setState("idle");
    const synth = window.speechSynthesis;
    const say = (i: number) => {
      if (token !== run.current) return;
      if (i >= segments.length) return finish();
      mark(i);
      const u = new SpeechSynthesisUtterance(segments[i]!.text);
      const v = voices.find((x) => `system:${x.name}` === choiceRef.current) ?? voices[0];
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
      u.rate = rateRef.current;
      u.onend = () => say(i + 1);
      u.onerror = (e) => {
        // A cancel is ours (pause, stop, a new start). Anything else means the
        // browser would not speak (commonly: no click on the page yet), so stop
        // where we are rather than skip through the page and lose the place.
        if (e.error === "canceled" || e.error === "interrupted") return;
        run.current++;
        setState("paused");
        setProblem("The browser did not start the voice. Press Resume to try again.");
      };
      synth.speak(u);
    };
    // Chrome can drop an utterance queued in the same tick as a cancel.
    window.setTimeout(() => say(first), 60);
  };

  const pause = () => {
    if (kokoro && audio.current && !audio.current.paused) {
      // A recording pauses mid-sentence and resumes where it stopped.
      audio.current.pause();
    } else {
      silence();
    }
    setState("paused");
  };

  const resume = () => {
    const player = audio.current;
    if (
      kokoro &&
      player &&
      player.src &&
      player.paused &&
      !player.ended &&
      player.currentTime > 0
    ) {
      setState("playing");
      setProblem(null);
      player.playbackRate = rate;
      void player.play().catch(() => speakFrom(index));
      return;
    }
    speakFrom(index);
  };

  const stop = () => {
    silence();
    setState("idle");
  };

  /**
   * Move to another paragraph. Playing, it reads from there; paused or
   * stopped, it waits there, so Resume starts from the new place.
   */
  const jump = (to: number) => {
    const target = Math.min(Math.max(to, 0), segments.length - 1);
    if (state === "playing") return speakFrom(target);
    silence();
    const player = audio.current;
    if (player) {
      player.removeAttribute("src");
      player.load();
    }
    mark(target);
    setState("paused");
  };

  /** Back replays the paragraph if it is well under way, else goes to the one before. */
  const back = () => {
    const player = audio.current;
    const underWay = kokoro && player?.src && player.currentTime > 3;
    jump(underWay ? index : index - 1);
  };

  // Highlight the block being read, and keep it on screen.
  const activeBlock = state === "idle" ? null : segments[index]?.blockId;
  useEffect(() => {
    const root = container.current;
    if (!root || !activeBlock) return;
    const el = root.querySelector<HTMLElement>(`[data-block="${CSS.escape(activeBlock)}"]`);
    if (!el) return;
    el.classList.add("lr-reading");
    const r = el.getBoundingClientRect();
    // The bar sticks to the top of the page, so "in view" starts below it.
    const top = (root.querySelector(".lr-reader")?.getBoundingClientRect().bottom ?? 0) + 12;
    if (r.top < top || r.bottom > window.innerHeight - 40) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return () => el.classList.remove("lr-reading");
  }, [activeBlock, container]);

  // While listening, a click on a paragraph starts reading from it.
  useEffect(() => {
    const root = container.current;
    if (!root || state === "idle") return;
    root.classList.add("lr-listening");
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("a, button, input, label, select, textarea, audio, video, summary"))
        return;
      const id = target.closest<HTMLElement>("[data-block]")?.dataset["block"];
      const at = id ? segments.findIndex((s) => s.blockId === id) : -1;
      if (at >= 0) speakFrom(at);
    };
    root.addEventListener("click", onClick);
    return () => {
      root.classList.remove("lr-listening");
      root.removeEventListener("click", onClick);
    };
  });

  if (!supported || segments.length === 0) return null;

  const resuming = state === "idle" && saved > 0 && saved < segments.length;
  const note = problem
    ? problem
    : preparing !== null && state === "playing"
      ? `Reading with a standard voice while the natural voice downloads${preparing > 0 && preparing < 1 ? ` (${Math.round(preparing * 100)}%)` : ""}. It takes over by itself; this happens once per browser.`
      : waiting && state === "playing"
        ? "Preparing this paragraph…"
        : state === "idle"
          ? "Reads this page aloud. Nothing is marked complete by listening."
          : "Click any paragraph to jump there.";
  const shown = drag ?? index;

  return (
    <div className="lr-reader" data-state={state} role="group" aria-label="Read aloud">
      {state !== "idle" ? (
        <button
          type="button"
          className="lr-icon-btn"
          onClick={back}
          aria-label="Back a paragraph"
          title="Back: replay this paragraph, or go to the one before"
        >
          <SkipBack size={16} strokeWidth={2} />
        </button>
      ) : null}
      {state === "playing" ? (
        <button
          type="button"
          className="lr-play-btn"
          onClick={pause}
          aria-label="Pause"
          title="Pause"
        >
          <Pause size={18} fill="currentColor" strokeWidth={0} />
        </button>
      ) : (
        <button
          type="button"
          className="lr-play-btn"
          data-label={state === "idle" ? "true" : undefined}
          onClick={() => (state === "paused" ? resume() : speakFrom(resuming ? saved : 0))}
          aria-label={state === "paused" ? "Resume" : resuming ? "Resume listening" : "Listen"}
          title={state === "paused" ? "Resume" : resuming ? "Resume listening" : "Listen"}
        >
          <Play size={18} fill="currentColor" strokeWidth={0} />
          {state === "idle" ? <span>{resuming ? "Resume listening" : "Listen"}</span> : null}
        </button>
      )}
      {state !== "idle" ? (
        <>
          <button
            type="button"
            className="lr-icon-btn"
            onClick={() => jump(index + 1)}
            disabled={index >= segments.length - 1}
            aria-label="Forward a paragraph"
            title="Forward: the next paragraph"
          >
            <SkipForward size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="lr-icon-btn"
            onClick={stop}
            aria-label="Stop"
            title="Stop"
          >
            <Square size={13} fill="currentColor" strokeWidth={0} />
          </button>
        </>
      ) : resuming ? (
        <button type="button" className="lr-reader-link" onClick={() => speakFrom(0)}>
          From the start
        </button>
      ) : null}
      {/* What the player is doing, in one line beside the controls. */}
      <div className="lr-reader-status" aria-live="polite">
        {state === "playing" ? (
          <span className="lr-eq" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : null}
        {state !== "idle" ? (
          <span className="lr-reader-status-main">
            {state === "paused" ? "Paused" : "Now reading"}
          </span>
        ) : null}
        <span className="lr-reader-status-sub">
          {state === "idle"
            ? `${segments.length} paragraph${segments.length === 1 ? "" : "s"}`
            : `¶${shown + 1} of ${segments.length}`}
        </span>
      </div>
      <span className="lr-reader-space" />
      {/* Speed and voice sit behind one control, so the bar stays a single
          row: what is playing, and how to move through it. */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="lr-reader-settings"
            aria-label="Voice and speed"
            title="Voice and speed"
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
            <span>
              {rate}× ·{" "}
              {(kokoro
                ? (KOKORO_VOICES.find((v) => v.id === kokoro)?.label ?? "Natural")
                : (systemVoice?.name ?? "System voice")
              ).replace(/^Google /, "")}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="lr-reader-pop">
          <label className="lr-reader-field">
            <span>Speed</span>
            <select
              value={rate}
              onChange={(e) => {
                const r = Number(e.target.value);
                setRate(r);
                rateRef.current = r;
                store(RATE_KEY, String(r));
                if (kokoro) {
                  // A recording changes speed in place.
                  if (audio.current) audio.current.playbackRate = r;
                } else if (state === "playing") {
                  window.setTimeout(() => speakFrom(index), 0);
                }
              }}
            >
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </label>
          <label className="lr-reader-field">
            <span>Voice</span>
            <select
              value={kokoro ? choice : systemVoice ? `system:${systemVoice.name}` : choice}
              onChange={(e) => {
                setChoice(e.target.value);
                choiceRef.current = e.target.value;
                store(VOICE_KEY, e.target.value);
                if (state === "playing") window.setTimeout(() => speakFrom(index), 0);
              }}
            >
              <optgroup label="Natural voices (Best quality)">
                {KOKORO_VOICES.map((v) => (
                  <option key={v.id} value={`kokoro:${v.id}`}>
                    {v.label} · British
                  </option>
                ))}
              </optgroup>
              {voices.length ? (
                <optgroup label="This computer's voices">
                  {voices.map((v) => (
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
      {state !== "idle" ? (
        <div className="lr-reader-progress">
          <input
            type="range"
            min={0}
            max={segments.length - 1}
            value={shown}
            style={
              {
                "--p": `${segments.length > 1 ? (shown / (segments.length - 1)) * 100 : 100}%`,
              } as CSSProperties
            }
            aria-label="Position in the page"
            onChange={(e) => setDrag(Number(e.target.value))}
            onPointerUp={(e) => {
              setDrag(null);
              jump(Number((e.target as HTMLInputElement).value));
            }}
            onKeyUp={(e) => {
              setDrag(null);
              jump(Number((e.target as HTMLInputElement).value));
            }}
          />
        </div>
      ) : null}
      <span className="lr-reader-note">{note}</span>
    </div>
  );
}
