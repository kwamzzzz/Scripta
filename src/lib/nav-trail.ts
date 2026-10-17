/**
 * The trail behind the back button.
 *
 * The rule that matters here is that a *screen* appears once, not a URL. The
 * trail used to record every distinct href, and a tab or a filter is part of
 * the href — so moving between tabs inside a matter pushed a second and third
 * entry for the same matter. "Back" then walked you through the tabs you had
 * just been on instead of leaving, and the only real way out was the nav rail.
 *
 * Two rules, both about the same thing:
 *  - arriving at a screen already in the trail truncates back to it, so
 *    A → B → A leaves [A] rather than a loop to ping-pong along;
 *  - "back" skips any entry for the screen you are on, whatever its search.
 *
 * A screen is normally its path, but two paths are sometimes one screen: a
 * create route that replaces itself with the record it just made is the same
 * screen at a second URL. Left to the path rule, "back" from the saved record
 * returns to the blank create route — labelled as the library it is not.
 *
 * Identity is therefore a property of the URL, declared in ONE_SCREEN below,
 * and not something a component passes in. It has to be: the shell that is
 * leaving re-renders with the destination href before it unmounts, so a URL
 * gets written by a component that does not own it. Anything keyed on the
 * writer produces two entries for one screen — the tagged one and an untagged
 * twin — and "back" walks into the twin.
 */

export type Trail = { href: string; label: string };

export const MAX_TRAIL = 12;

/**
 * URLs that are one screen. Add a pattern only where a single screen genuinely
 * lives at more than one path — not to group a library with its records, which
 * are different screens and must stay that way.
 */
const ONE_SCREEN: { pattern: RegExp; id: string }[] = [
  {
    // The contract wizard. /new replaces itself with /$draftId on first save.
    // Requires a segment after the section, so the library itself never matches.
    pattern: /^\/matters\/contract-drafting\/[^/]+$/,
    id: "contract-drafting-wizard",
  },
];

/** A screen's identity is its path. Everything after "?" is state within it. */
export const screenOf = (href: string): string => {
  const path = href.split("?")[0] ?? href;
  return ONE_SCREEN.find((s) => s.pattern.test(path))?.id ?? path;
};

/**
 * Record arriving at a screen.
 *
 * The newest entry keeps the full href, so returning to a matter returns to
 * the tab you left it on; it is only the trail's shape that ignores search.
 */
export function pushTrail(trail: Trail[], entry: Trail): Trail[] {
  const screen = screenOf(entry.href);
  const at = trail.findIndex((t) => screenOf(t.href) === screen);
  const kept = at === -1 ? trail : trail.slice(0, at);
  return [...kept, entry].slice(-MAX_TRAIL);
}

/**
 * Where back goes from `href`: the last entry for a different screen, or the
 * fallback the caller declares — used on a refresh and on a link opened cold.
 */
export function backTarget(trail: Trail[], href: string, fallback: Trail): Trail {
  const screen = screenOf(href);
  for (let i = trail.length - 1; i >= 0; i--) {
    const entry = trail[i]!;
    if (screenOf(entry.href) !== screen) return entry;
  }
  return fallback;
}
