/**
 * Kokoro in a worker: the model is loaded and speech is made off the page's
 * own thread. Run on the page, both froze it: loading for seconds, and every
 * passage for as long as it took to make, so clicks, scrolling and even the
 * play button stopped answering while the voice was working.
 *
 * Messages in:  { id, type: "load" } | { id, type: "speak", text, voice }
 * Messages out: { id, type: "progress", fraction } | { id, type: "ready" }
 *             | { id, type: "audio", blob } | { id, type: "error", message }
 */
import type { KokoroTTS } from "kokoro-js";
import type { KokoroVoice } from "./kokoro";

const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
/** The package's own browser build, pinned (see kokoro.ts for why the CDN). */
const KOKORO_WEB = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";

type In =
  { id: number; type: "load" } | { id: number; type: "speak"; text: string; voice: KokoroVoice };

const post = (message: unknown) => (self as unknown as Worker).postMessage(message);

let loading: Promise<KokoroTTS> | null = null;

function load(id: number): Promise<KokoroTTS> {
  if (!loading) {
    loading = (async () => {
      const { KokoroTTS } = (await import(
        /* @vite-ignore */ KOKORO_WEB
      )) as typeof import("kokoro-js");
      const gpu = "gpu" in navigator;
      const loaded: Record<string, [number, number]> = {};
      const progress_callback = (p: {
        status: string;
        file?: string;
        loaded?: number;
        total?: number;
      }) => {
        if (p.status !== "progress" || !p.file || !p.total) return;
        loaded[p.file] = [p.loaded ?? 0, p.total];
        const [done, total] = Object.values(loaded).reduce(
          ([d, t], [l, n]) => [d + l, t + n],
          [0, 0],
        );
        post({ id, type: "progress", fraction: total ? done / total : 0 });
      };
      try {
        return await KokoroTTS.from_pretrained(KOKORO_MODEL, {
          dtype: gpu ? "fp32" : "q8",
          device: gpu ? "webgpu" : "wasm",
          progress_callback,
        });
      } catch (e) {
        if (!gpu) throw e;
        // A WebGPU adapter that will not start: fall back to WebAssembly.
        return KokoroTTS.from_pretrained(KOKORO_MODEL, {
          dtype: "q8",
          device: "wasm",
          progress_callback,
        });
      }
    })();
    // A failed load may succeed later (network back): do not keep the failure.
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** One passage at a time: the model is not made to work on two at once. */
let queue: Promise<unknown> = Promise.resolve();

self.onmessage = (event: MessageEvent<In>) => {
  const message = event.data;
  const fail = (e: unknown) =>
    post({ id: message.id, type: "error", message: e instanceof Error ? e.message : String(e) });
  if (message.type === "load") {
    load(message.id).then(() => post({ id: message.id, type: "ready" }), fail);
    return;
  }
  queue = queue.then(async () => {
    try {
      const tts = await load(message.id);
      const audio = await tts.generate(message.text, { voice: message.voice });
      post({ id: message.id, type: "audio", blob: audio.toBlob() });
    } catch (e) {
      fail(e);
    }
  });
};
