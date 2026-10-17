import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/lib/auth";
import AuthScreen from "@/screens/AuthScreen";
import { FLOW_VIEWS, type FlowSearch, type FlowView } from "@/matter-flow/MatterFlowScreen";
import type { FixtureKind } from "@/matter-flow/fixtures";
import { C, sans } from "@/lib/tokens";

const title = "Flow — Scripta";
const description =
  "The scope of services as phases: deliverables, their versions and evidence, and the timeline against every deadline.";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

// The trailing underscore keeps this screen out from under matters.$matterId,
// which renders the workbench without an outlet; both share the URL prefix.
export const Route = createFileRoute("/matters/$matterId_/flow")({
  validateSearch: (search: Record<string, unknown>): FlowSearch => ({
    view: FLOW_VIEWS.includes(search["view"] as FlowView)
      ? (search["view"] as FlowView)
      : undefined,
    phase: str(search["phase"]),
    deliverable: str(search["deliverable"]),
    version: str(search["version"]),
    email: str(search["email"]),
    start: search["start"] === "preset" || search["start"] === "ask" ? search["start"] : undefined,
    fixture:
      search["fixture"] === "document" ||
      search["fixture"] === "action" ||
      search["fixture"] === "blank"
        ? (search["fixture"] as FixtureKind)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FlowRoute,
});

function Gate() {
  const { loading, session } = useAuth();
  const { matterId } = Route.useParams();
  if (loading)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.appBg,
          fontFamily: sans,
          fontSize: 14,
          color: C.muted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Loading…
      </div>
    );
  if (!session) return <AuthScreen />;
  // A matter's flows live inside the matter now: this older address opens
  // the matter's Flows tab, so links and bookmarks to it keep working.
  return (
    <Navigate
      to="/matters/$matterId"
      params={{ matterId }}
      search={{ screen: "flows" } as never}
      replace
    />
  );
}

function FlowRoute() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
