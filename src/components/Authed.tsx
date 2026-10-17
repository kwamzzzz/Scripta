import type { ReactNode } from "react";
import { AppProvider } from "@/store/app";
import { AuthProvider, useAuth } from "@/lib/auth";
import AuthScreen from "@/screens/AuthScreen";
import { identity, sans } from "@/lib/tokens";

function Gate({ children }: { children: ReactNode }) {
  const { sessionReady, session } = useAuth();
  // Only the initial session check may show "Loading…". The profile arrives
  // behind the app frame rather than in front of it, so the shell and its data
  // start drawing straight away. Signed-out visitors fall through to the
  // email/password screen.
  if (!sessionReady)
    return (
      <div
        role="status"
        style={{
          minHeight: "100dvh",
          background: identity.paper,
          fontFamily: sans,
          fontSize: 14,
          color: identity.muted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Loading…
      </div>
    );
  if (!session) return <AuthScreen />;
  return <AppProvider>{children}</AppProvider>;
}

/** Auth gate + workspace-scoped store for every non-matter route. */
export default function Authed({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
