/**
 * Natural voices for read aloud: Kokoro, an open model (Apache 2.0) that runs
 * in the browser. Nothing is sent anywhere: the model (about 86 MB) is fetched
 * once from Hugging Face, cached by the browser, and the text is turned into
 * speech on this machine. Loaded only when someone first picks one of these
 * voices, so the rest of the app never pays for it.
 */
/*
 * The model loads from the package's own browser build on a CDN, pinned, in
 * kokoro.worker.ts. The npm entry resolves to the Node build under Vite, whose
 * phonemiser has no language data in a browser ("Invalid language
 * identifier"), and the browser build is not exported. Loading it from the CDN
 * also keeps its 20 MB runtime out of the app bundle.
 */

/** Kokoro's British English voices. Every one of them beats the system voices. */
export const KOKORO_VOICES = [
  { id: "bf_emma", label: "Emma" },
  { id: "bf_isabella", label: "Isabella" },
  { id: "bm_george", label: "George" },
  { id: "bm_lewis", label: "Lewis" },
  { id: "bf_alice", label: "Alice" },
  { id: "bf_lily", label: "Lily" },
  { id: "bm_daniel", label: "Daniel" },
  { id: "bm_fable", label: "Fable" },
] as const;

export type KokoroVoice = (typeof KOKORO_VOICES)[number]["id"];

let ready = false;

/** True once the model is loaded and speech can be made at once. */
export const kokoroReady = () => ready;

/*
 * The model runs in a worker (kokoro.worker.ts), so neither loading it nor
 * making speech freezes the page. One worker per page, started on first use.
 */
type Reply =
  | { id: number; type: "progress"; fraction: number }
  | { id: number; type: "ready" }
  | { id: number; type: "audio"; blob: Blob }
  | { id: number; type: "error"; message: string };

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<
  number,
  { resolve: (r: Reply) => void; reject: (e: Error) => void; progress?: (f: number) => void }
>();

function ask(message: Record<string, unknown>, progress?: (f: number) => void): Promise<Reply> {
  if (!worker) {
    worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data;
      const pending = waiting.get(reply.id);
      if (!pending) return;
      if (reply.type === "progress") return pending.progress?.(reply.fraction);
      waiting.delete(reply.id);
      if (reply.type === "error") pending.reject(new Error(reply.message));
      else pending.resolve(reply);
    };
    // The worker itself would not start or died: fail everything waiting on it,
    // and start a fresh one next time.
    worker.onerror = (event) => {
      event.preventDefault();
      for (const pending of waiting.values())
        pending.reject(new Error(event.message || "The voice worker stopped."));
      waiting.clear();
      worker?.terminate();
      worker = null;
      loading = null;
      ready = false;
    };
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, ...(progress ? { progress } : {}) });
    worker!.postMessage({ id, ...message });
  });
}

let loading: Promise<void> | null = null;

/**
 * The model, loaded once per page. WebGPU where the browser has it (fast),
 * otherwise the quantised model on WebAssembly (slower, still usable).
 */
export function loadKokoro(onProgress?: (fraction: number) => void): Promise<void> {
  if (!loading) {
    loading = ask({ type: "load" }, onProgress).then(() => {
      ready = true;
    });
    // A failed load may succeed later (network back): do not cache the failure.
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** One passage as a playable audio URL. The caller revokes it when done. */
export async function kokoroAudio(text: string, voice: KokoroVoice): Promise<string> {
  await loadKokoro();
  const reply = await ask({ type: "speak", text, voice });
  if (reply.type !== "audio") throw new Error("The voice sent nothing back.");
  return URL.createObjectURL(reply.blob);
}
