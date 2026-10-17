import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  INITIAL_AUTH_BOOTSTRAP,
  applyAuthEvent,
  markProfileLoaded,
  markSessionVerified,
  shouldShowLoadingScreen,
  type AuthBootstrapState,
} from "@/lib/auth-loading";
import { clearPraxisClientData, migratePraxisClientData } from "@/lib/client-data";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type AuthValue = {
  loading: boolean;
  /**
   * The initial session check has finished. True as soon as we know whether
   * somebody is signed in — the profile may still be on its way. The app frame
   * renders from here, so nothing waits behind a blank "Loading…" for data it
   * does not need to draw itself.
   */
  sessionReady: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  updateProfile: (fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

// Kept on globalThis so a hot reload of this module reuses the same context
// object. Without this, a refreshed module creates a new context while the
// already-mounted provider still holds the old one, and every consumer throws
// "useAuth must be used inside AuthProvider" until a full page reload.
const globalScope = globalThis as typeof globalThis & {
  __praxisAuthCtx?: Context<AuthValue | null>;
};
const Ctx: Context<AuthValue | null> =
  globalScope.__praxisAuthCtx ?? createContext<AuthValue | null>(null);
globalScope.__praxisAuthCtx = Ctx;

/**
 * Sign-in state, set up once for the whole app.
 *
 * The root layout provides it, so moving between screens keeps the session
 * and profile that were already verified. Screens still wrap themselves in an
 * AuthProvider (they did before there was one at the root); inside the root
 * one that is a pass-through. Before this, every screen verified the session
 * with Auth and re-read the profile on every visit, behind a "Loading…" gate.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const outer = useContext(Ctx);
  return outer ? <>{children}</> : <AuthRoot>{children}</AuthRoot>;
}

const readProfile = (userId: string) =>
  supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .eq("id", userId)
    .maybeSingle();

function AuthRoot({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bootstrap, setBootstrap] = useState<AuthBootstrapState>(INITIAL_AUTH_BOOTSTRAP);

  useEffect(() => {
    migratePraxisClientData();
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Token refreshes, focus-triggered SIGNED_IN and USER_UPDATED all arrive
      // with a fresh session object for the same person. applyAuthEvent keeps
      // the bootstrap state untouched for those, so the gate never re-shows
      // "Loading…" and the tree below it stays mounted.
      setBootstrap((prev) => applyAuthEvent(prev, event, s?.user.id ?? null));
      if (!s) setProfile(null);
    });
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          setSession(null);
          setBootstrap((prev) => applyAuthEvent(prev, "SIGNED_OUT", null));
          return;
        }
        /*
         * The stored session is trusted for the first render and verified
         * beside it, not before it.
         *
         * getUser() is a round trip to Auth, and it used to sit in front of
         * everything: the profile read, the workspaces, the board — all of
         * which need only the user id the stored token already carries. Cold
         * opens paid for that trip twice over. It now runs in parallel, and a
         * revoked or deleted account is signed out the moment it answers, so
         * nothing unverified survives past that point.
         */
        setSession(sessionData.session);
        setBootstrap((prev) =>
          applyAuthEvent(prev, "INITIAL_SESSION", sessionData.session.user.id),
        );
        void (async () => {
          try {
            const { data: userData, error } = await supabase.auth.getUser();
            if (!error && userData.user) return;
          } catch (verifyError) {
            console.error("[praxis] session verification failed", verifyError);
          }
          await supabase.auth.signOut({ scope: "local" });
          clearPraxisClientData();
          setSession(null);
          setBootstrap((prev) => applyAuthEvent(prev, "SIGNED_OUT", null));
        })();
      } catch (err) {
        console.error("[praxis] session restore failed", err);
        await supabase.auth.signOut({ scope: "local" });
        clearPraxisClientData();
        setSession(null);
        setBootstrap((prev) => applyAuthEvent(prev, "SIGNED_OUT", null));
      } finally {
        setBootstrap(markSessionVerified);
      }
    })();
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  // The profile bootstrap keys off the user id only. It reads the current user
  // object through a ref so a refreshed token — same person, new object — does
  // not re-run it.
  const userRef = useRef<User | null>(null);
  useEffect(() => {
    userRef.current = session?.user ?? null;
  }, [session]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        /*
         * Two requests, not a queue of two.
         *
         * `bootstrap_current_user` is an idempotent safety net: it guarantees a
         * profile and an empty personal workspace for an account whose signup
         * trigger has not landed. Awaiting it before reading the profile put it
         * in front of the one request the app is actually waiting for, and the
         * whole app is behind this — the gate holds "Loading…" until the
         * profile arrives. For everybody who signed up more than a moment ago
         * the safety net has nothing to do, so it goes out beside the read
         * rather than ahead of it, and only a profile that comes back missing
         * waits for it and reads again.
         */
        const safetyNet = supabase.rpc("bootstrap_current_user");
        const { data, error } = await readProfile(userId);
        if (error) throw error;
        let row = data;
        if (!row) {
          const { error: bootstrapError } = await safetyNet;
          if (bootstrapError) throw bootstrapError;
          const second = await readProfile(userId);
          if (second.error) throw second.error;
          row = second.data;
        } else {
          // Nothing waits on it, but a failure should not pass in silence.
          void safetyNet.then(({ error: bootstrapError }) => {
            if (bootstrapError) console.error("[praxis] bootstrap failed", bootstrapError);
          });
        }
        if (!cancelled) setProfile(row ?? null);
      } catch (error) {
        console.error("[praxis] profile bootstrap failed", error);
        if (!cancelled) {
          const user = userRef.current;
          setProfile(
            user
              ? {
                  id: user.id,
                  email: user.email ?? null,
                  full_name:
                    (user.user_metadata["full_name"] as string | undefined) ??
                    (user.user_metadata["name"] as string | undefined) ??
                    null,
                  avatar_url: (user.user_metadata["avatar_url"] as string | undefined) ?? null,
                }
              : null,
          );
        }
      } finally {
        if (!cancelled) setBootstrap((prev) => markProfileLoaded(prev, userId));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value = useMemo<AuthValue>(
    () => ({
      loading: shouldShowLoadingScreen(bootstrap),
      sessionReady: !bootstrap.verifyingSession,
      session,
      user: session?.user ?? null,
      profile,
      updateProfile: async (fullName) => {
        const name = fullName.trim();
        if (!session?.user || !name) throw new Error("Enter your full name.");
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ full_name: name })
          .eq("id", session.user.id);
        if (profileError) throw profileError;
        const { error: authError } = await supabase.auth.updateUser({ data: { full_name: name } });
        if (authError) throw authError;
        setProfile((current) =>
          current
            ? { ...current, full_name: name }
            : {
                id: session.user.id,
                full_name: name,
                email: session.user.email ?? null,
                avatar_url: null,
              },
        );
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        clearPraxisClientData();
        if (error) throw error;
      },
    }),
    [bootstrap, profile, session],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
