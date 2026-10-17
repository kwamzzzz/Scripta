/**
 * What feedback carries besides the words: the thing the sender pointed at,
 * the screen as they saw it, and the context they would never think to type.
 *
 * Everything here runs in the browser at the moment feedback is written. The
 * element helpers take a minimal element shape so they can be tested without
 * a page.
 */

/* ------------------------------------------------------------ the target */

/** Just enough of a DOM element to describe it. */
export type ElementLike = {
  tagName: string;
  id?: string;
  getAttribute(name: string): string | null;
  textContent: string | null;
  parentElement: ElementLike | null;
};

export type FeedbackTarget = {
  /** "area" when the sender dragged a box rather than picking one element. */
  kind: "element" | "area";
  /** Readable: "Button ‘Add source’ in Library". */
  label: string;
  /** Finds the element again for "Open where it happened". */
  selector: string;
  /** Where it sat on the sender's screen, in CSS pixels. */
  rect: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
};

const clean = (s: string | null | undefined, max = 60) => {
  const text = (s ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const ROLE_NAMES: Record<string, string> = {
  button: "Button",
  link: "Link",
  tab: "Tab",
  checkbox: "Checkbox",
  radio: "Option",
  textbox: "Text box",
  combobox: "Dropdown",
  dialog: "Dialog",
  row: "Row",
  cell: "Cell",
  heading: "Heading",
  img: "Picture",
  navigation: "Navigation",
  menuitem: "Menu item",
};

const TAG_NAMES: Record<string, string> = {
  button: "Button",
  a: "Link",
  input: "Field",
  textarea: "Text box",
  select: "Dropdown",
  h1: "Heading",
  h2: "Heading",
  h3: "Heading",
  h4: "Heading",
  img: "Picture",
  table: "Table",
  tr: "Row",
  td: "Cell",
  th: "Column heading",
  li: "List item",
  article: "Card",
  nav: "Navigation",
  aside: "Panel",
  header: "Header",
  footer: "Footer",
  form: "Form",
  label: "Label",
  p: "Text",
  span: "Text",
  svg: "Icon",
};

/** What the element is called, the way a person would say it. */
export function nameOf(el: ElementLike): string {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role") ?? "";
  const kind = ROLE_NAMES[role] ?? TAG_NAMES[tag] ?? "Area";
  const label =
    clean(el.getAttribute("aria-label")) ||
    clean(el.getAttribute("title")) ||
    clean(el.getAttribute("placeholder")) ||
    clean(el.getAttribute("alt")) ||
    clean(el.textContent, 50);
  return label ? `${kind} ‘${label}’` : kind;
}

/** The nearest named region the element sits in: a dialog, a panel, a section. */
export function regionOf(el: ElementLike): string {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const tag = p.tagName.toLowerCase();
    const role = p.getAttribute("role") ?? "";
    const label = clean(p.getAttribute("aria-label"), 40);
    if (
      label &&
      (["dialog", "region", "navigation", "complementary", "group", "tablist"].includes(role) ||
        ["aside", "nav", "section", "form", "article", "dialog"].includes(tag))
    )
      return label;
  }
  return "";
}

export function describe(el: ElementLike, screen: string): string {
  const region = regionOf(el);
  return [nameOf(el), region ? `in ${region}` : "", screen ? `on ${screen}` : ""]
    .filter(Boolean)
    .join(" ");
}

const cssId = (s: string) => s.replace(/([^\w-])/g, "\\$1");

/**
 * A selector that finds this element and no other: it climbs from the
 * element, adding one step at a time (an id, an aria-label, or the tag and
 * its position among its siblings), and stops as soon as the path matches
 * exactly one element on the page. Good for the same build; a redesign may
 * move things, in which case the reviewer is shown where it was instead.
 */
export function selectorFor(el: Element): string {
  const doc = el.ownerDocument;
  const unique = (sel: string) => {
    try {
      return doc.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  };
  const parts: string[] = [];
  let node: Element | null = el;
  for (let depth = 0; node && node !== doc.body && depth < 30; depth++) {
    const tag = node.tagName.toLowerCase();
    if (node.id && !/^:r|radix|headlessui/i.test(node.id)) {
      const anchored = [`#${cssId(node.id)}`, ...parts].join(" > ");
      if (unique(anchored)) return anchored;
    }
    const label = node.getAttribute("aria-label");
    if (label && label.length < 80) {
      const anchored = [`${tag}[aria-label="${label.replace(/"/g, '\\"')}"]`, ...parts].join(" > ");
      if (unique(anchored)) return anchored;
    }
    const parent: Element | null = node.parentElement;
    const same = parent
      ? Array.from(parent.children).filter((c) => c.tagName === node!.tagName)
      : [];
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
    if (unique(parts.join(" > "))) return parts.join(" > ");
    node = parent;
  }
  return ["body", ...parts].join(" > ");
}

/* ----------------------------------------------------- recent history */

type Visit = { at: string; route: string; screen: string };
type Fault = { at: string; message: string };
const visits: Visit[] = [];
const faults: Fault[] = [];
let listening = false;

/** Remember where the sender has been, so a report shows how they got there. */
export function recordVisit(route: string, screen: string) {
  if (visits[visits.length - 1]?.route === route) return;
  visits.push({ at: new Date().toISOString(), route, screen });
  if (visits.length > 8) visits.shift();
}

/** Start keeping the last few errors the app hits. Safe to call more than once. */
export function listenForErrors() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const keep = (message: string) => {
    faults.push({ at: new Date().toISOString(), message: clean(message, 300) });
    if (faults.length > 8) faults.shift();
  };
  window.addEventListener("error", (e) => keep(e.message || String(e.error)));
  window.addEventListener("unhandledrejection", (e) =>
    keep(e.reason instanceof Error ? e.reason.message : String(e.reason)),
  );
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    keep(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
    original(...args);
  };
}

/* ------------------------------------------------------------ context */

/** A readable browser name from a user-agent string: "Chrome 140 on macOS". */
export function browserOf(ua: string): string {
  const os = /Mac OS X/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
      ? "Windows"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  const browser =
    /Edg\/(\d+)/.exec(ua)?.[1] !== undefined
      ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}`
      : /Chrome\/(\d+)/.test(ua)
        ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}`
        : /Firefox\/(\d+)/.test(ua)
          ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`
          : /Version\/(\d+).*Safari/.test(ua)
            ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}`
            : "A browser";
  return os ? `${browser} on ${os}` : browser;
}

export type FeedbackContext = {
  /** The breadcrumb as the sender read it: "Clients / Bugatti / Pitch Deck". */
  trail: string;
  title: string;
  window: { width: number; height: number };
  screen: { width: number; height: number; pixelRatio: number };
  browser: string;
  timeZone: string;
  sentAt: string;
  visits: Visit[];
  errors: Fault[];
};

export function gatherContext(): FeedbackContext {
  const trail = clean(
    document.querySelector('nav[aria-label="Breadcrumb"]')?.textContent?.replace(/\//g, " / "),
    200,
  );
  return {
    trail,
    title: clean(document.title, 120),
    window: { width: window.innerWidth, height: window.innerHeight },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      pixelRatio: window.devicePixelRatio || 1,
    },
    browser: browserOf(navigator.userAgent),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sentAt: new Date().toISOString(),
    visits: [...visits],
    errors: [...faults],
  };
}

/* ---------------------------------------------------------- screenshot */

const MAX_WIDTH = 1600;
const MAX_CHARS = 1_400_000;

/**
 * The screen as the sender sees it, with the target circled, as a JPEG data
 * URL. Anything marked `data-feedback-ui` (the feedback form itself) is left
 * out. Null when the page cannot be drawn.
 */
export async function captureScreen(target: FeedbackTarget | null): Promise<string | null> {
  try {
    const { domToCanvas } = await import("modern-screenshot");
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scale = Math.min(1, MAX_WIDTH / width);
    const canvas = await domToCanvas(document.body, {
      width,
      height,
      scale,
      backgroundColor: "#ffffff",
      filter: (node) => !(node instanceof Element && node.closest("[data-feedback-ui]")),
    });
    const ctx = canvas.getContext("2d");
    if (ctx && target) {
      const s = canvas.width / width;
      const pad = 6;
      const x = (target.rect.x - pad) * s;
      const y = (target.rect.y - pad) * s;
      const w = (target.rect.width + pad * 2) * s;
      const h = (target.rect.height + pad * 2) * s;
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      // Dim everything but the target, then ring it.
      ctx.fillRect(0, 0, canvas.width, y);
      ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
      ctx.fillRect(0, y, x, h);
      ctx.fillRect(x + w, y, canvas.width - x - w, h);
      ctx.lineWidth = Math.max(3, 3 * s);
      ctx.strokeStyle = "#e8710a";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8 * s);
      ctx.stroke();
      ctx.restore();
    }
    for (const quality of [0.72, 0.55, 0.4]) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= MAX_CHARS) return url;
    }
    return null;
  } catch {
    return null;
  }
}

/* ----------------------------------------------- open where it happened */

const HIGHLIGHT_KEY = "px.feedback.highlight";

/** Ask the next screen to show the reviewer the thing the sender pointed at. */
export function requestHighlight(target: FeedbackTarget) {
  try {
    window.sessionStorage.setItem(
      HIGHLIGHT_KEY,
      JSON.stringify({
        selector: target.selector,
        label: target.label,
        rect: target.rect,
        at: Date.now(),
      }),
    );
  } catch {
    // Without storage the reviewer still lands on the right screen.
  }
}

export function takeHighlight(): {
  selector: string;
  label: string;
  rect: FeedbackTarget["rect"];
} | null {
  try {
    const raw = window.sessionStorage.getItem(HIGHLIGHT_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(HIGHLIGHT_KEY);
    const value = JSON.parse(raw);
    return Date.now() - value.at < 60_000 ? value : null;
  } catch {
    return null;
  }
}
