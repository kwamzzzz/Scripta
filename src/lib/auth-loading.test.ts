import { describe, expect, it } from "vitest";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import {
  INITIAL_AUTH_BOOTSTRAP,
  applyAuthEvent,
  markProfileLoaded,
  markSessionVerified,
  shouldShowLoadingScreen,
  type AuthBootstrapState,
} from "@/lib/auth-loading";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

/** The state of a tab that has finished booting and is showing the workbench. */
function settled(userId = USER): AuthBootstrapState {
  return { verifyingSession: false, sessionUserId: userId, profileLoadedFor: userId };
}

/** Events Supabase emits for a user who is already signed in and stays signed in. */
const BENIGN_EVENTS: AuthChangeEvent[] = [
  "TOKEN_REFRESHED",
  "SIGNED_IN",
  "USER_UPDATED",
  "INITIAL_SESSION",
  "MFA_CHALLENGE_VERIFIED",
];

describe("shouldShowLoadingScreen", () => {
  it("blocks while the initial session check is still running", () => {
    expect(shouldShowLoadingScreen(INITIAL_AUTH_BOOTSTRAP)).toBe(true);
  });

  it("blocks while the signed-in user's profile is still bootstrapping", () => {
    expect(
      shouldShowLoadingScreen({
        verifyingSession: false,
        sessionUserId: USER,
        profileLoadedFor: null,
      }),
    ).toBe(true);
  });

  it("does not block a signed-out visitor: they get the sign-in screen", () => {
    expect(
      shouldShowLoadingScreen({
        verifyingSession: false,
        sessionUserId: null,
        profileLoadedFor: null,
      }),
    ).toBe(false);
  });

  it("does not block once the profile for the current user has loaded", () => {
    expect(shouldShowLoadingScreen(settled())).toBe(false);
  });

  it("blocks again when the profile on hand belongs to a different user", () => {
    expect(
      shouldShowLoadingScreen({
        verifyingSession: false,
        sessionUserId: OTHER,
        profileLoadedFor: USER,
      }),
    ).toBe(true);
  });
});

describe("applyAuthEvent — regression: the app tree must not remount", () => {
  it.each(BENIGN_EVENTS)("%s for the same user never re-opens the loading screen", (event) => {
    const before = settled();
    const after = applyAuthEvent(before, event, USER);
    expect(shouldShowLoadingScreen(after)).toBe(false);
    // Returned by reference, so React re-renders nothing at all.
    expect(after).toBe(before);
  });

  it("a whole refresh/focus storm leaves the gate open throughout", () => {
    let state = settled();
    for (let i = 0; i < 25; i += 1) {
      for (const event of BENIGN_EVENTS) {
        state = applyAuthEvent(state, event, USER);
        expect(shouldShowLoadingScreen(state)).toBe(false);
      }
    }
    expect(state).toEqual(settled());
  });

  it("does not re-open the loading screen mid-bootstrap either", () => {
    const mid: AuthBootstrapState = {
      verifyingSession: false,
      sessionUserId: USER,
      profileLoadedFor: USER,
    };
    expect(shouldShowLoadingScreen(applyAuthEvent(mid, "TOKEN_REFRESHED", USER))).toBe(false);
  });
});

describe("applyAuthEvent — sign-out and account switching still work", () => {
  it("SIGNED_OUT clears the session so the gate falls through to sign-in", () => {
    const after = applyAuthEvent(settled(), "SIGNED_OUT", null);
    expect(after).toEqual({
      verifyingSession: false,
      sessionUserId: null,
      profileLoadedFor: null,
    });
    expect(shouldShowLoadingScreen(after)).toBe(false);
  });

  it("SIGNED_OUT wins even if a stale session object rides along", () => {
    const after = applyAuthEvent(settled(), "SIGNED_OUT", USER);
    expect(after.sessionUserId).toBeNull();
    expect(after.profileLoadedFor).toBeNull();
  });

  it("any event arriving without a session signs the tab out", () => {
    const after = applyAuthEvent(settled(), "TOKEN_REFRESHED", null);
    expect(after.sessionUserId).toBeNull();
  });

  it("repeated SIGNED_OUT is idempotent by reference", () => {
    const out = applyAuthEvent(settled(), "SIGNED_OUT", null);
    expect(applyAuthEvent(out, "SIGNED_OUT", null)).toBe(out);
  });

  it("a different user signing in re-blocks until their profile loads", () => {
    const after = applyAuthEvent(settled(), "SIGNED_IN", OTHER);
    expect(after).toEqual({
      verifyingSession: false,
      sessionUserId: OTHER,
      profileLoadedFor: null,
    });
    expect(shouldShowLoadingScreen(after)).toBe(true);
    expect(shouldShowLoadingScreen(markProfileLoaded(after, OTHER))).toBe(false);
  });

  it("signing in after a sign-out blocks until the profile loads", () => {
    const out = applyAuthEvent(settled(), "SIGNED_OUT", null);
    const back = applyAuthEvent(out, "SIGNED_IN", USER);
    expect(shouldShowLoadingScreen(back)).toBe(true);
  });
});

describe("markProfileLoaded / markSessionVerified", () => {
  it("ignores a response that lands after a different user signed in", () => {
    const state: AuthBootstrapState = {
      verifyingSession: false,
      sessionUserId: OTHER,
      profileLoadedFor: null,
    };
    expect(markProfileLoaded(state, USER)).toBe(state);
    expect(shouldShowLoadingScreen(markProfileLoaded(state, USER))).toBe(true);
  });

  it("is idempotent by reference", () => {
    const state = settled();
    expect(markProfileLoaded(state, USER)).toBe(state);
    expect(markSessionVerified(state)).toBe(state);
  });

  it("verifying the session alone does not unblock a signed-in user", () => {
    const state = markSessionVerified({
      verifyingSession: true,
      sessionUserId: USER,
      profileLoadedFor: null,
    });
    expect(state.verifyingSession).toBe(false);
    expect(shouldShowLoadingScreen(state)).toBe(true);
  });
});

describe("full boot sequence", () => {
  it("blocks once, then stays open across refreshes, then signs out", () => {
    const seen: boolean[] = [];
    let state = INITIAL_AUTH_BOOTSTRAP;
    seen.push(shouldShowLoadingScreen(state));

    state = applyAuthEvent(state, "INITIAL_SESSION", USER);
    seen.push(shouldShowLoadingScreen(state));
    state = markSessionVerified(state);
    seen.push(shouldShowLoadingScreen(state));
    state = markProfileLoaded(state, USER);
    seen.push(shouldShowLoadingScreen(state));

    state = applyAuthEvent(state, "TOKEN_REFRESHED", USER);
    seen.push(shouldShowLoadingScreen(state));
    state = applyAuthEvent(state, "SIGNED_IN", USER);
    seen.push(shouldShowLoadingScreen(state));

    // true only for the initial bootstrap; never again once the app is up.
    expect(seen).toEqual([true, true, true, false, false, false]);

    state = applyAuthEvent(state, "SIGNED_OUT", null);
    expect(shouldShowLoadingScreen(state)).toBe(false);
    expect(state.sessionUserId).toBeNull();
  });
});
