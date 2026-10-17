/**
 * Navigation safety net: nowhere in Praxis should be a dead end.
 *
 * Every screen mounted through AppShell records where it was, so a detail
 * screen can always offer a truthful "Back to …" control — back to the matter
 * a document was opened from, back to the search results it was found in, or
 * back to the section root when the page was opened cold.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useBlocker, useNavigate, useRouterState } from "@tanstack/react-router";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import "@/components/confirm-delete.css";
import { backTarget, MAX_TRAIL, pushTrail, type Trail } from "./nav-trail";

export type { Trail };

const KEY = "px.nav.trail";

function read(): Trail[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Trail[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(trail: Trail[]) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-MAX_TRAIL)));
  } catch {
    /* private mode: the fallback destination still works */
  }
}

/** Record the screen the user is on. Called once per screen by AppShell. */
export function useTrackLocation(label: string) {
  const href = useRouterState({
    select: (s) => s.location.pathname + s.location.searchStr,
  });
  useEffect(() => {
    if (!label) return;
    write(pushTrail(read(), { href, label }));
  }, [href, label]);
}

/**
 * Where "back" should go: the last different screen this session, else the
 * fallback the caller declares (used on refresh and on direct links).
 */
export function useBack(fallback: Trail) {
  const navigate = useNavigate();
  const href = useRouterState({
    select: (s) => s.location.pathname + s.location.searchStr,
  });
  const target = backTarget(read(), href, fallback);
  const go = useCallback(() => {
    void navigate({ to: target.href as never });
  }, [navigate, target.href]);
  return { label: target.label, href: target.href, go };
}

/** The contextual back control drawn to the left of the breadcrumb. */
export function BackLink({ fallback }: { fallback: Trail }) {
  const back = useBack(fallback);
  return (
    <button
      type="button"
      className="wf-back"
      onClick={back.go}
      title={`Back to ${back.label}`}
      aria-label={`Back to ${back.label}`}
    >
      <span aria-hidden>←</span>
      <span className="wf-back-label">Back to {back.label}</span>
    </button>
  );
}

/**
 * Stop a route change (and a tab close) while an edit is unsaved.
 *
 * This was the last browser confirm in Scripta, and it sat at the worst
 * possible moment: the lawyer is already leaving, and the only thing standing
 * between them and losing the work is a grey box that looks like the browser
 * rather than the app. It also could not say which work — every screen's
 * message went into one generic sentence and the buttons read OK and Cancel,
 * where "OK" means "lose it".
 *
 * The dialog is the app's own now, and the buttons say what they do. Blocking
 * is asynchronous, which the router supports: `shouldBlockFn` may return a
 * promise, so the answer arrives when the lawyer gives it.
 *
 * Render the returned node once anywhere in the screen, as with
 * `useConfirmDelete`.
 */
export function useUnsavedGuard(dirty: boolean, message = "You have unsaved changes."): ReactNode {
  const [asking, setAsking] = useState(false);
  const answer = useRef<(leave: boolean) => void>(() => {});

  useBlocker({
    shouldBlockFn: () =>
      dirty
        ? new Promise<boolean>((resolve) => {
            // The router asks whether to BLOCK, so staying is `true`.
            answer.current = (leave) => resolve(!leave);
            setAsking(true);
          })
        : false,
    enableBeforeUnload: dirty,
  });

  const settle = (leave: boolean) => {
    setAsking(false);
    answer.current(leave);
    answer.current = () => {};
  };

  return (
    <Modal open={asking} onClose={() => settle(false)} label="Unsaved changes">
      <div className="scripta-confirm">
        <div className="scripta-confirm-title">Leave without saving?</div>
        <p className="scripta-confirm-body">{message} Leaving now loses it.</p>
        <div className="scripta-confirm-actions">
          <Button onClick={() => settle(false)}>Keep editing</Button>
          <Button variant="danger" onClick={() => settle(true)}>
            Leave without saving
          </Button>
        </div>
      </div>
    </Modal>
  );
}
