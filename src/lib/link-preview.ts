/**
 * What a web page offers to show when it is shared: its picture, title and
 * description, read from the Open Graph and Twitter tags most sites carry.
 * Pure, so the server function that fetches the page stays small.
 */

export type LinkPreview = {
  /** The page's own preview picture, absolute; null when it names none. */
  image: string | null;
  title: string;
  description: string;
  /** The site's name, or its host. */
  site: string;
};

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

/** The content of the first <meta> naming any of `keys`, by property or name. */
function meta(html: string, keys: string[]): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (!key || !keys.includes(key)) continue;
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (content?.trim()) return decode(content);
  }
  return "";
}

/** A link a page gives, made absolute against the page; only http(s) survives. */
export function absoluteHttpUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseLinkPreview(html: string, pageUrl: string): LinkPreview {
  const head = html.slice(0, 200_000);
  const image = meta(head, [
    "og:image",
    "og:image:url",
    "og:image:secure_url",
    "twitter:image",
    "twitter:image:src",
  ]);
  const title =
    meta(head, ["og:title", "twitter:title"]) ||
    decode(/<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1] ?? "");
  let host = "";
  try {
    host = new URL(pageUrl).host.replace(/^www\./, "");
  } catch {
    host = "";
  }
  return {
    image: image ? absoluteHttpUrl(image, pageUrl) : null,
    title: title.slice(0, 300),
    description: meta(head, ["og:description", "twitter:description", "description"]).slice(0, 400),
    site: meta(head, ["og:site_name"]) || host,
  };
}

/**
 * Whether the server may fetch a link at all: http or https, a real host name
 * or public address, never this machine or a private network.
 */
export function isFetchableUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local"))
    return false;
  if (host.endsWith(".internal")) return false;
  // IPv6 literals: loopback, link-local, unique-local.
  if (host.includes(":")) return !/^(::1?$|fe8|fe9|fea|feb|fc|fd)/.test(host);
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  return true;
}
