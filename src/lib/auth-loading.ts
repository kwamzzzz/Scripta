import type { AuthChangeEvent } from "@supabase/supabase-js";

/**
 * The auth gate's whole decision input.
 *
 * Deliberately keyed on the signed-in *user id* rather than on the session
 * object: Supabase hands us a brand new `Session` (and a brand new
 * `session.user`) on every `TOKEN_REFRESHED`, `USER_UPDATED` and on the
 * `SIGNED_IN` it re-emits when a tab regains focus. Those are all the same
 * person staying signed in, so none of them may re-open the blocking
 * "Loading…" screen — doing so unmounts the entire app tree and throws away
 * whatever the user was typing.
 */
export type AuthBootstrapState = {
  /** The verified initial getSession/getUser check has not finished yet. */
  verifyingSession: boolean;
  /** Signed-in user id, or null when signed out. */
  sessionUserId: string | null;
  /** User whose profile bootstrap has finished, successfully or via fallback. */
  profileLoadedFor: string | null;
};

export const INITIAL_AUTH_BOOTSTRAP: AuthBootstrapState = {
  verifyingSession: true,
  sessionUserId: null,
  profileLoadedFor: null,
};

/**
 * Fold one Supabase auth event into the bootstrap state.
 *
 * `SIGNED_OUT` always tears the session down. Every other event is decided by
 * user identity alone: a different user means a fresh profile bootstrap, the
 * same user means nothing changed and the previous state is returned by
 * reference so React re-renders nothing.
 */
export function applyAuthEvent(
  prev: AuthBootstrapState,
  event: AuthChangeEvent,
  sessionUserId: string | null,
): AuthBootstrapState {
  if (event === "SIGNED_OUT" || sessionUserId === null) {
    if (prev.sessionUserId === null && prev.profileLoadedFor === null) return prev;
    return { ...prev, sessionUserId: null, profileLoadedFor: null };
  }
  if (sessionUserId === prev.sessionUserId) return prev;
  return { ...prev, sessionUserId, profileLoadedFor: null };
}

/** The initial session check finished (whatever its outcome). */
export function markSessionVerified(prev: AuthBootstrapState): AuthBootstrapState {
  if (!prev.verifyingSession) return prev;
  return { ...prev, verifyingSession: false };
}

/**
 * A profile bootstrap finished. Ignored when a different user has signed in
 * since the request went out, so a stale response cannot unblock the gate for
 * the wrong person.
 */
export function markProfileLoaded(prev: AuthBootstrapState, userId: string): AuthBootstrapState {
  if (prev.sessionUserId !== userId) return prev;
  if (prev.profileLoadedFor === userId) return prev;
  return { ...prev, profileLoadedFor: userId };
}

/**
 * Should the gate render the blocking "Loading…" screen?
 *
 * `false` with no `sessionUserId` means "show the sign-in screen", not "show
 * the app" — the gate checks the session separately.
 */
export function shouldShowLoadingScreen(state: AuthBootstrapState): boolean {
  if (state.verifyingSession) return true;
  if (state.sessionUserId === null) return false;
  return state.profileLoadedFor !== state.sessionUserId;
}
