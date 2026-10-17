import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Tells Synapse Studio which screen is showing.
 *
 * The blueprint board opens a screen here in a named window and keeps a
 * handle on it; this posts the route back the other way, so the card for
 * whatever you are looking at lights up on the board beside you.
 *
 * It does nothing at all unless this window was opened by the board:
 * `window.opener` is null in a tab opened any other way, so a normal visit
 * never posts anything anywhere.
 *
 * The route is sent only to the boards we know, never to `*`. A path here
 * can carry a matter or transcript id, and that is client information — it
 * should not be readable by whatever happens to have opened the window. A
 * post to a target origin that does not match the opener is dropped by the
 * browser without being delivered, so listing several is safe.
 */
const BOARDS = [
  "https://synapse-stu.lovable.app",
  "https://id-preview--c5418a42-5982-4f06-a8cc-57ab0431da3c.lovable.app",
  "http://localhost:8081",
  "http://localhost:8080",
];

export function useLiveLink() {
  const href = useRouterState({ select: (s) => s.location.href });

  useEffect(() => {
    if (!window.opener || window.opener.closed) return;
    const message = {
      source: "synapse-studio-live",
      route: window.location.pathname + window.location.search,
    };
    for (const origin of BOARDS) {
      try {
        window.opener.postMessage(message, origin);
      } catch {
        /* the board went away mid-post; nothing here depends on it */
      }
    }
  }, [href]);
}
