import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppProvider } from "@/store/app";
import { AuthProvider, useAuth } from "@/lib/auth";
import AuthScreen from "@/screens/AuthScreen";
import MatterFlowScreen, {
  FLOW_VIEWS,
  type FlowSearch,
  type FlowView,
} from "@/matter-flow/MatterFlowScreen";
import { C, sans } from "@/lib/tokens";

const title = "Flow — Scripta";
const description =
  "A piece of work as phases: deliverables, their versions and evidence, and the timeline against every deadline.";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/**
 * A flow by its own id, wherever it is filed.
 *
 * A matter's flow is still reachable at /matters/:id/flow. This is the address
 * every flow has, including one filed to no matter, and the one that keeps
 * working when a flow is later filed somewhere — filing changes a link on the
 * flow, never its id.
 */
export const Route = createFileRoute("/flows/$flowId")({
  validateSearch: (search: Record<string, unknown>): FlowSearch => ({
    view: FLOW_VIEWS.includes(search["view"] as FlowView)
      ? (search["view"] as FlowView)
      : undefined,
    phase: str(search["phase"]),
    deliverable: str(search["deliverable"]),
    version: str(search["version"]),
    email: str(search["email"]),
    start: search["start"] === "preset" || search["start"] === "ask" ? search["start"] : undefined,
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

const loading = (
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

function Gate() {
  const { loading: authLoading, session } = useAuth();
  const { flowId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  // Which matter the flow is filed to, so the workspace and the matter the
  // shell and Scripta read are this flow's. Null for a flow filed to none.
  const filing = useQuery({
    queryKey: ["flow-filing", flowId],
    enabled: !!session,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matter_flows")
        .select("matter_id, client_id")
        .eq("id", flowId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return {
        matterId: (data?.matter_id as string | null | undefined) ?? null,
        clientId: (data?.client_id as string | null | undefined) ?? null,
      };
    },
  });
  if (authLoading) return loading;
  if (!session) return <AuthScreen />;
  if (filing.isLoading) return loading;
  // A flow filed to a matter or a client lives there, and opens there: this
  // address stays the one every link can use, and sends it home.
  const hosted = {
    flow: flowId,
    fview: search.view,
    phase: search.phase,
    deliverable: search.deliverable,
    version: search.version,
    email: search.email,
    start: search.start,
  };
  if (filing.data?.matterId)
    return (
      <Navigate
        to="/matters/$matterId"
        params={{ matterId: filing.data.matterId }}
        search={{ screen: "flows", ...hosted } as never}
        replace
      />
    );
  if (filing.data?.clientId)
    return (
      <Navigate
        to="/clients/$clientId"
        params={{ clientId: filing.data.clientId }}
        search={{ tab: "flows", ...hosted } as never}
        replace
      />
    );
  return (
    <AppProvider {...(filing.data?.matterId ? { matterId: filing.data.matterId } : {})}>
      <MatterFlowScreen
        key={flowId}
        flowKey={{ flowId }}
        search={search}
        setSearch={(patch) =>
          void navigate({
            search: (prev: FlowSearch) => ({ ...prev, ...patch }),
            replace: true,
          })
        }
      />
    </AppProvider>
  );
}

function FlowRoute() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
