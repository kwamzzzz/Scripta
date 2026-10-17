import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import ClientWorkspace from "@/clients/ClientWorkspace";
import { CLIENT_TABS, type ClientTab } from "@/clients/tabs";
import { isOrgArea, type OrgArea } from "@/organisation/model";
import { isMarketingView, type MarketingView } from "@/marketing/model";
import { readHostedFlow, type HostedFlowSearch } from "@/lib/host-frame";
import type { Screen } from "@/store/app";

const title = "Client — Scripta";
const description =
  "One client: its organisation, and the matters, flows, tasks and documents filed under it.";

/**
 * `area` is the part of the organisation on screen, `item` the record selected
 * in it, and `mode` a working view of that area (the chart studio, adding a
 * licence). All three survive a reload and the back button. `view` is the
 * part of the client's marketing on screen, and `item` there is the post open.
 */
export type ClientSearch = HostedFlowSearch & {
  tab?: ClientTab | undefined;
  /** A matter of this client, open inside it; `screen` is where in the matter. */
  matter?: string | undefined;
  screen?: Screen | undefined;
  /** A task of this client, open beside the client's task list. */
  task?: string | undefined;
  area?: OrgArea | undefined;
  item?: string | undefined;
  mode?: string | undefined;
  view?: MarketingView | undefined;
};

/** The parts of a matter a link inside a client may open at. */
const MATTER_SCREENS: Screen[] = ["matter", "flows", "tasks", "documents", "activity", "contract"];

const text = (v: unknown) => (typeof v === "string" && v.length <= 80 ? v : undefined);

export const Route = createFileRoute("/clients/$clientId")({
  validateSearch: (search: Record<string, unknown>): ClientSearch => ({
    tab: CLIENT_TABS.includes(search["tab"] as ClientTab)
      ? (search["tab"] as ClientTab)
      : undefined,
    area: isOrgArea(search["area"]) ? search["area"] : undefined,
    item: text(search["item"]),
    mode: text(search["mode"]),
    view: isMarketingView(search["view"]) ? search["view"] : undefined,
    matter: text(search["matter"]),
    screen: MATTER_SCREENS.includes(search["screen"] as Screen)
      ? (search["screen"] as Screen)
      : undefined,
    task: text(search["task"]),
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
  component: ClientRoute,
});

function ClientRoute() {
  const { clientId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Authed>
      <ClientWorkspace
        key={clientId}
        clientId={clientId}
        tab={search.tab ?? "overview"}
        area={search.area ?? "organogram"}
        item={search.item ?? null}
        mode={search.mode ?? null}
        view={search.view ?? "content"}
        nested={search}
        navigate={(next: ClientSearch, replace = false) =>
          void navigate({ search: (prev: ClientSearch) => ({ ...prev, ...next }), replace })
        }
      />
    </Authed>
  );
}
