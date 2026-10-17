import { createFileRoute } from "@tanstack/react-router";
import { AppProvider, type Screen } from "@/store/app";
import { AuthProvider, useAuth } from "@/lib/auth";
import AuthScreen from "@/screens/AuthScreen";
import Workbench from "@/screens/Workbench";
import { readHostedFlow, type HostedFlowSearch } from "@/lib/host-frame";
import { C, sans } from "@/lib/tokens";

const title = "Matter workbench — Scripta";
const description =
  "Review clause diffs, trace meeting resolutions to drafting points and check every position against the playbook.";

const SCREENS: Screen[] = [
  "matter",
  "flows",
  "tasks",
  "documents",
  "activity",
  "contract",
  "review",
  "issues",
  "redline",
  "transcript",
  "playbook",
  "messages",
  "notes",
  "final",
];

type Search = HostedFlowSearch & {
  screen?: Screen | undefined;
  clause?: string | undefined;
  res?: string | undefined;
  rule?: string | undefined;
};

export const Route = createFileRoute("/matters/$matterId")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    screen: SCREENS.includes(search["screen"] as Screen) ? (search["screen"] as Screen) : undefined,
    clause: typeof search["clause"] === "string" ? search["clause"] : undefined,
    res: typeof search["res"] === "string" ? search["res"] : undefined,
    rule: typeof search["rule"] === "string" ? search["rule"] : undefined,
    ...readHostedFlow(search),
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
  component: MatterRoute,
});

function Gate() {
  const { loading, session } = useAuth();
  const { matterId } = Route.useParams();
  const search = Route.useSearch();
  const { screen, clause, res, rule } = search;
  const navigate = Route.useNavigate();

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
  // A genuine sign-out empties the session: send the visitor to sign-in rather
  // than leaving them on a loading screen that never resolves.
  if (!session) return <AuthScreen />;

  return (
    <AppProvider
      matterId={matterId}
      initial={{
        // A matter opens as its file. A link that means a tool names the tool.
        screen: screen ?? "matter",
        selClause: clause ?? "",
        selRule: rule ?? "",
        selRes: res ?? null,
      }}
    >
      <Workbench
        hostedFlow={{
          search,
          setSearch: (patch) =>
            // Opening or leaving a flow is a step Back should undo; moving
            // around inside one is not.
            void navigate({
              search: (prev: Search) => ({ ...prev, ...patch }),
              replace: !("flow" in patch),
            }),
        }}
      />
    </AppProvider>
  );
}

function MatterRoute() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
