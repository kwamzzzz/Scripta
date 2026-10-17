/**
 * Did that save actually happen?
 *
 * Scripta writes as you work — on blur, after a pause, when a checkbox moves.
 * There is no Save button to press and therefore no moment where the app is
 * obliged to tell you whether the write succeeded. Every screen was left to
 * report its own failures, and screens that forgot were indistinguishable from
 * screens with nothing to report: a flow's phases could be typed for an hour
 * into something that was never going to keep them, and the screen looked
 * exactly as it does when everything is fine.
 *
 * So this does not trust screens to notice. Every request the app makes to the
 * database passes through `fetch`, so a failed write is caught here, once, no
 * matter which screen made it or whether that screen bothered to handle it.
 * New code is covered the day it is written, including code that forgets.
 *
 * Only writes. A read that fails is usually visible — the thing you asked for
 * is not on screen — but a write that fails looks exactly like one that
 * worked, which is the failure worth shouting about.
 *
 * This is a safety net, not a substitute for a screen handling its own errors:
 * a screen that knows what it was trying to do can say something far more
 * useful than "a change could not be saved".
 */

export type WriteFailure = {
  /** What was being written: the table, when the URL names one. */
  what: string;
  /** The database's own words, where it gave any. */
  detail: string;
  status: number;
  at: number;
};

let current: WriteFailure | null = null;
const listeners = new Set<(failure: WriteFailure | null) => void>();

const announce = () => listeners.forEach((fn) => fn(current));

export function subscribeWriteHealth(fn: (failure: WriteFailure | null) => void) {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}

export const lastWriteFailure = () => current;

export function clearWriteFailure() {
  if (!current) return;
  current = null;
  announce();
}

/** Exported for the tests, and for anything that writes outside `fetch`. */
export function reportWriteFailure(failure: WriteFailure) {
  current = failure;
  announce();
}

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** "matter_flows" out of "https://x.supabase.co/rest/v1/matter_flows?id=eq.1". */
export function tableOf(url: string): string {
  const match = /\/rest\/v1\/([^/?#]+)/.exec(url);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

/**
 * Whether this request is one whose failure a person needs to know about.
 *
 * Storage and auth are deliberately included — an upload that failed and a
 * session that could not be refreshed both lose work just as surely — but
 * reads, and the token refresh that runs on a timer, are not.
 *
 * ---------------------------------------------------------------------------
 * AND NOT RPC, WHICH THIS NET CANNOT READ
 * ---------------------------------------------------------------------------
 *
 * A POST to `/rest/v1/rpc/<fn>` is a function call, and the net has no way to
 * know whether that function writes anything. Many of them plainly do not:
 * `events_involving_me`, `clause_context`, `thread_context` and
 * `clause_revision_list` are reads that PostgREST happens to require a POST
 * for. Announcing "a change could not be saved" when a bell failed to refresh
 * is telling somebody they have lost work they never did.
 *
 * It is also unable to name them. `tableOf` pulls "rpc" out of the URL, so the
 * message read "A change to “rpc” was not saved" — which tells a lawyer
 * nothing at all.
 *
 * And it was actively dangerous. Phase 5's editor holds unsaved wording on
 * purpose: when the database refuses a save because a colleague has the
 * clause, the whole point is that the words stay on screen. The net fired
 * alongside that refusal and offered RELOAD — the one action that throws the
 * sentence away — directly under a message promising it was safe.
 *
 * Found in the Phase 5 browser acceptance, on the refusal the lease rule
 * exists to produce.
 *
 * This does not leave RPC writes unwatched so much as acknowledge where the
 * watching belongs. Every RPC that writes — `save_clause_doc`,
 * `request_review`, `take_clause`, `break_clause_lease`,
 * `restore_clause_revision` — is called from a screen that reports its own
 * failure, because each of them refuses for a REASON the caller must show:
 * who holds the clause, whose wording it is, what going back would discard.
 * "A change could not be saved" is strictly worse than any of those sentences.
 */
export function isWatchedWrite(url: string, method: string): boolean {
  if (!WRITE_METHODS.has(method.toUpperCase())) return false;
  if (/\/auth\/v1\/token/.test(url)) return false;
  if (/\/rest\/v1\/rpc\//.test(url)) return false;
  return /\/rest\/v1\//.test(url) || /\/storage\/v1\/object/.test(url);
}

/** The most useful sentence available from a PostgREST error body. */
export function describeFailure(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; details?: string; hint?: string };
    const message = parsed.message?.trim();
    const hint = parsed.hint?.trim();
    if (message) return hint ? `${message} (${hint})` : message;
  } catch {
    // Not JSON — some proxies answer in HTML. The status is still worth having.
  }
  if (status === 401 || status === 403)
    return "You are not signed in, or no longer have permission to make this change.";
  if (status === 0) return "The database could not be reached.";
  return `The database refused the change (HTTP ${status}).`;
}

let installed = false;

/**
 * Watch every write the browser makes. Idempotent, and a no-op on the server,
 * where there is nobody to show a banner to.
 */
export function watchWrites() {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const method =
      init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");

    if (!isWatchedWrite(url, method ?? "GET")) return original(input as never, init);

    let response: Response;
    try {
      response = await original(input as never, init);
    } catch (cause) {
      // The request never landed: offline, DNS, a dropped connection.
      reportWriteFailure({
        what: tableOf(url),
        detail: cause instanceof Error ? cause.message : "The database could not be reached.",
        status: 0,
        at: Date.now(),
      });
      throw cause;
    }

    if (!response.ok) {
      // Read the body from a clone so the caller still gets an unread one.
      const body = await response
        .clone()
        .text()
        .catch(() => "");
      reportWriteFailure({
        what: tableOf(url),
        detail: describeFailure(response.status, body),
        status: response.status,
        at: Date.now(),
      });
    }
    return response;
  };
}
