import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isFetchableUrl, parseLinkPreview, type LinkPreview } from "@/lib/link-preview";

const MAX_BYTES = 400_000;
const MAX_REDIRECTS = 3;

/** Read at most `limit` bytes of a response as text: a page's head is near its top. */
async function readCapped(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(total, limit));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.max(0, out.length - at));
    out.set(part, at);
    at += part.length;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(out);
}

/**
 * The picture, title and description a web page offers when shared, for the
 * Library's cards. Signed-in users only, public web addresses only; each
 * redirect is checked again before it is followed, so a public link cannot
 * bounce the server onto a private one.
 */
export const fetchLinkPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) => z.object({ url: z.string().url().max(2000) }).parse(value))
  .handler(async ({ data }): Promise<LinkPreview | null> => {
    let url = data.url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isFetchableUrl(url)) return null;
      let response: Response;
      try {
        response = await fetch(url, {
          redirect: "manual",
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "Mozilla/5.0 (compatible; ScriptaLinkPreview/1.0)",
          },
          signal: AbortSignal.timeout(5_000),
        });
      } catch {
        return null;
      }
      if (response.status >= 300 && response.status < 400) {
        const next = response.headers.get("location");
        await response.body?.cancel().catch(() => {});
        if (!next) return null;
        url = new URL(next, url).toString();
        continue;
      }
      if (!response.ok) return null;
      const type = response.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml/i.test(type)) {
        await response.body?.cancel().catch(() => {});
        return null;
      }
      return parseLinkPreview(await readCapped(response, MAX_BYTES), url);
    }
    return null;
  });
