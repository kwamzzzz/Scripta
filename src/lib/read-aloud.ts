/**
 * Read aloud for documents: a contract, a memo, a manuscript chapter, read
 * container by container.
 *
 * The same voices as Learning's reader (see learning/kokoro.ts): Kokoro, a
 * natural voice run in the browser, with this computer's voices standing in
 * while it downloads and taking over if it cannot run. The voice and speed a
 * person chose in Learning carry over here. Nothing is sent anywhere.
 *
 * One reader for the whole app. A screen names the containers it shows (a
 * clause, a part, a paragraph) in reading order; the reader speaks one
 * container, then the next, and tells the screen which one it is on so the
 * screen can open it and light it up.
 */
import {
  KOKORO_VOICES,
  kokoroAudio,
  kokoroReady,
  loadKokoro,
  type KokoroVoice,
} from "@/learning/kokoro";
import { chunk, speakable } from "@/learning/reader";
import { englishVoices } from "@/learning/areas/ReadAloud";

/**
 * One container. `label` is spoken before its words ("Clause 3.3"), `name` is
 * how the player shows it when that differs ("1 ¶2" is shown, never said).
 */
export type ReadItem = { id: string; label: string; text: string; name?: string };

type State = "idle" | "playing" | "paused";
export type ReaderSnapshot = {
  state: State;
  items: ReadItem[];
  /** The container being read. */
  item: number;
  rate: number;
  voice: string;
  /** What the reader wants to say about itself ("the natural voice is downloading"). */
  note: string | null;
};

/* Shared with Learning's reader, so one choice of voice and speed serves both. */
const VOICE_KEY = "px.reader.voice";
const RATE_KEY = "px.reader.rate";
const DEFAULT_VOICE = "kokoro:bf_emma";
export const RATES = [0.8, 1, 1.2, 1.5];

const stored = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private window: nothing is remembered */
  }
};
const kokoroId = (choice: string) =>
  choice.startsWith("kokoro:") ? (choice.slice(7) as KokoroVoice) : null;

/** The voice's name as the bar shows it. */
export function voiceName(choice: string): string {
  const k = kokoroId(choice);
  if (k) return KOKORO_VOICES.find((v) => v.id === k)?.label ?? "Natural";
  return choice.replace(/^system:/, "").replace(/^Google /, "");
}

const IDLE: ReaderSnapshot = {
  state: "idle",
  items: [],
  item: 0,
  rate: 1,
  voice: DEFAULT_VOICE,
  note: null,
};
let snap: ReaderSnapshot = IDLE;
const listeners = new Set<() => void>();
const set = (patch: Partial<ReaderSnapshot>) => {
  snap = { ...snap, ...patch };
  listeners.forEach((fn) => fn());
};
export const subscribeReader = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
export const readerSnapshot = () => snap;
export const idleSnapshot = () => IDLE;

/** Utterances, each knowing its container. Short, because browsers drop long ones. */
let segs: { item: number; text: string }[] = [];
let seg = 0;
/** Each start gets a new number; a segment from an earlier start must not move the reader on. */
let run = 0;
let player: HTMLAudioElement | null = null;
/** Kokoro audio by voice and text: made once while reading, freed on stop. */
const clips = new Map<string, Promise<string>>();

const hasSystem = () => typeof window !== "undefined" && "speechSynthesis" in window;

function silence() {
  run++;
  if (hasSystem()) window.speechSynthesis.cancel();
  player?.pause();
}

function freeClips() {
  for (const made of clips.values())
    void made.then(
      (url) => URL.revokeObjectURL(url),
      () => {},
    );
  clips.clear();
}

function clip(text: string, voice: KokoroVoice) {
  const key = `${voice}|${text}`;
  let made = clips.get(key);
  if (!made) {
    made = kokoroAudio(text, voice);
    clips.set(key, made);
    made.catch(() => clips.delete(key));
  }
  return made;
}

function speakSystem(text: string, token: number, then: () => void) {
  const v = englishVoices().find((x) => `system:${x.name}` === snap.voice) ?? englishVoices()[0];
  const u = new SpeechSynthesisUtterance(text);
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  u.rate = snap.rate;
  u.onend = () => token === run && then();
  u.onerror = (e) => {
    // A cancel is ours (pause, stop, a new start). Anything else means the
    // browser would not speak: stop where we are rather than skip on.
    if (e.error === "canceled" || e.error === "interrupted" || token !== run) return;
    run++;
    set({ state: "paused", note: "The browser did not start the voice. Press play to try again." });
  };
  window.speechSynthesis.speak(u);
}

function speakFrom(start: number, note: string | null = null) {
  silence();
  const token = run;
  if (!segs.length) return set({ state: "idle" });
  const first = Math.min(Math.max(start, 0), segs.length - 1);
  set({ state: "playing", note });
  const voice = kokoroId(snap.voice);

  const next = (i: number) => {
    if (token !== run) return;
    if (i >= segs.length) {
      set({ state: "idle", note: null });
      return;
    }
    seg = i;
    if (snap.item !== segs[i]!.item) set({ item: segs[i]!.item });
    void say(i);
  };

  const say = async (i: number) => {
    const text = segs[i]!.text;
    // The first time, the natural voice is still downloading: a system voice
    // reads meanwhile, and the natural one takes over when it is in.
    if (!voice || (!kokoroReady() && hasSystem())) {
      if (!hasSystem()) return set({ state: "idle" });
      speakSystem(text, token, () => next(i + 1));
      return;
    }
    let url: string;
    try {
      const made = clip(text, voice);
      // Not ready within a moment (the first passage, or a jump ahead): say so,
      // so a short silence does not look like a fault.
      const quick = await Promise.race([
        made,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 150)),
      ]);
      if (quick === null) {
        if (token === run) set({ note: "Preparing the voice…" });
        url = await made;
        if (token === run && snap.note === "Preparing the voice…") set({ note: null });
      } else url = quick;
    } catch {
      if (token !== run) return;
      const fallback = englishVoices()[0];
      if (!fallback)
        return set({ state: "paused", note: "No voice could start on this computer." });
      set({ voice: `system:${fallback.name}` });
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
    if (token !== run) return;
    // Voice the next two while this one plays, so there is no gap between them.
    for (const n of [i + 1, i + 2])
      if (n < segs.length) void clip(segs[n]!.text, voice).catch(() => {});
    const p = (player ??= new Audio());
    p.src = url;
    p.playbackRate = snap.rate;
    p.onended = () => next(i + 1);
    try {
      await p.play();
    } catch {
      if (token !== run) return;
      set({
        state: "paused",
        note: "The browser did not start the voice. Press play to try again.",
      });
    }
  };

  if (voice && !kokoroReady()) {
    set({
      note: "Reading with a standard voice while the natural voice downloads. It takes over by itself.",
    });
    void loadKokoro()
      .then(() => token === run && set({ note: null }))
      .catch(() => {});
  }
  // Chrome can drop speech queued in the same tick as a cancel.
  window.setTimeout(() => next(first), 60);
}

/** Read `items` aloud, starting at the container `fromId`. */
export function startReading(items: ReadItem[], fromId: string) {
  // Chrome lists its voices only once asked, and a moment later: ask now, so
  // they are there if the natural voice cannot run.
  if (hasSystem()) window.speechSynthesis.getVoices();
  const readable = items.map((it) => ({ ...it, text: speakable(it.text) })).filter((it) => it.text);
  const s = stored(VOICE_KEY);
  set({
    items: readable,
    item: 0,
    rate: Number(stored(RATE_KEY)) || 1,
    voice: s ? (s.includes(":") ? s : `system:${s}`) : DEFAULT_VOICE,
  });
  freeClips();
  segs = readable.flatMap((it, i) =>
    chunk(it.label ? `${speakable(it.label).replace(/[.:]?$/, ".")} ${it.text}` : it.text).map(
      (text) => ({ item: i, text }),
    ),
  );
  const at = Math.max(
    0,
    readable.findIndex((it) => it.id === fromId),
  );
  speakFrom(
    Math.max(
      0,
      segs.findIndex((x) => x.item === at),
    ),
  );
}

export function pauseReading() {
  if (player && !player.paused && player.src) player.pause();
  else silence();
  set({ state: "paused" });
}

export function resumeReading() {
  const p = player;
  if (kokoroId(snap.voice) && p?.src && p.paused && !p.ended && p.currentTime > 0) {
    set({ state: "playing", note: null });
    p.playbackRate = snap.rate;
    void p.play().catch(() => speakFrom(seg));
    return;
  }
  speakFrom(seg);
}

export function stopReading() {
  if (snap.state === "idle" && !snap.items.length) return;
  silence();
  if (player) {
    player.removeAttribute("src");
    player.load();
  }
  freeClips();
  segs = [];
  seg = 0;
  set(IDLE);
}

/** The first utterance of container `item`. */
const startOf = (item: number) => segs.findIndex((x) => x.item === item);

/** Move to another container: playing, read from there; paused, wait there. */
function moveTo(item: number) {
  const target = Math.min(Math.max(item, 0), snap.items.length - 1);
  const at = startOf(target);
  if (at < 0) return;
  if (snap.state === "playing") return speakFrom(at);
  silence();
  if (player) {
    player.removeAttribute("src");
    player.load();
  }
  seg = at;
  set({ item: target, state: "paused" });
}

export const nextContainer = () => moveTo(snap.item + 1);

/** Back replays this container if it is under way, else goes to the one before. */
export function previousContainer() {
  const underWay = seg > startOf(snap.item) || (player?.currentTime ?? 0) > 3;
  moveTo(underWay ? snap.item : snap.item - 1);
}

/** Change the speed. A recording changes in place; a system voice restarts the sentence. */
export function setReadingRate(rate: number) {
  store(RATE_KEY, String(rate));
  set({ rate });
  if (player && !player.paused) player.playbackRate = rate;
  else if (snap.state === "playing") speakFrom(seg);
}

/** Change the voice ("kokoro:bf_emma" or "system:<name>"), remembered for next time. */
export function setReadingVoice(voice: string) {
  store(VOICE_KEY, voice);
  set({ voice, note: null });
  if (snap.state === "playing") speakFrom(seg);
}
