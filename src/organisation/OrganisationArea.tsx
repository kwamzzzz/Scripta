/**
 * A client's organisation: the list of areas, and the area on screen.
 *
 * The list is headed with the client's own name, because this is that
 * organisation — Neemba Group's, Goldenmark's — and not a feature with a name
 * of its own. The counts beside an area are facts ("2 overdue"), shown only
 * where there is something to count.
 *
 * Only the areas this client carries are listed. An area it does not carry,
 * reached by an old link, says so and offers to turn it on.
 */
import { lazy, Suspense, type ComponentType } from "react";
import { Button } from "@/components/primitives";
import { areaOn, type Client } from "@/lib/clients";
import type { AreaProps, OrgGo } from "./area";
import {
  ORG_AREAS,
  currentRoles,
  licenceStatus,
  liveEntities,
  overdueOccurrences,
  type OrgArea,
  type Organisation,
} from "./model";
import { Empty } from "./ui";

const AREAS: Record<OrgArea, ComponentType<AreaProps>> = {
  organogram: lazy(() => import("./areas/Organogram")),
  structure: lazy(() => import("./areas/GroupStructure")),
  people: lazy(() => import("./areas/People")),
  authority: lazy(() => import("./areas/Authority")),
  entities: lazy(() => import("./areas/Entities")),
  licences: lazy(() => import("./areas/Licences")),
  calendar: lazy(() => import("./areas/Calendar")),
  documents: lazy(() => import("./areas/KeyDocuments")),
  processes: lazy(() => import("./areas/Processes")),
  ask: lazy(() => import("./areas/Ask")),
};

const Studio = lazy(() => import("./areas/ChartStudio"));

/** Short counts only: the list is narrow, and red already says "something is wrong here". */
function counts(
  org: Organisation,
): Partial<Record<OrgArea, { n: string; alert?: boolean; title?: string }>> {
  const overdue = overdueOccurrences(org).length;
  const lapsed = org.licences.filter(
    (l) => !l.archivedAt && ["expired", "lapsed_lodged"].includes(licenceStatus(l).state),
  ).length;
  const roles = currentRoles(org).length;
  const entities = liveEntities(org).length;
  const people = org.people.filter((p) => !p.archivedAt).length;
  const licences = org.licences.filter((l) => !l.archivedAt).length;
  return {
    ...(roles ? { organogram: { n: String(roles) } } : {}),
    ...(entities ? { structure: { n: String(entities) }, entities: { n: String(entities) } } : {}),
    ...(people ? { people: { n: String(people) } } : {}),
    ...(licences
      ? {
          licences: lapsed
            ? { n: String(lapsed), alert: true, title: `${lapsed} lapsed` }
            : { n: String(licences) },
        }
      : {}),
    ...(overdue
      ? { calendar: { n: String(overdue), alert: true, title: `${overdue} overdue` } }
      : {}),
    ...(org.documents.length ? { documents: { n: String(org.documents.length) } } : {}),
    ...(org.processes.filter((p) => !p.archivedAt).length
      ? { processes: { n: String(org.processes.filter((p) => !p.archivedAt).length) } }
      : {}),
  };
}

export default function OrganisationArea({
  org,
  client,
  area,
  item,
  mode,
  go,
  openTab,
  onManageAreas,
}: {
  org: Organisation;
  client: Client;
  area: OrgArea;
  item: string | null;
  mode: string | null;
  go: OrgGo;
  openTab: AreaProps["openTab"];
  /** Open the client's settings, where its corporate-services areas are chosen. */
  onManageAreas: () => void;
}) {
  const shown = counts(org);
  const on = (a: OrgArea) => areaOn(client, a);
  const studio = mode === "studio" && (area === "organogram" || area === "structure");
  const Area = studio ? Studio : AREAS[area];
  const label = ORG_AREAS.find((a) => a.id === area)?.label ?? "This area";
  return (
    <div className="og-area">
      <nav className="og-nav" aria-label={`${client.name} organisation`}>
        <div className="og-nav-head">{client.name}</div>
        <div className="og-nav-list">
          {ORG_AREAS.filter((a) => on(a.id)).map((a) => (
            <button
              key={a.id}
              type="button"
              aria-current={a.id === area ? "page" : undefined}
              onClick={() => go({ area: a.id, item: null, mode: null })}
            >
              <span>{a.label}</span>
              {shown[a.id] && (
                <span
                  className={`og-nav-count${shown[a.id]!.alert ? " is-alert" : ""}`}
                  title={shown[a.id]!.title}
                >
                  {shown[a.id]!.n}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="og-nav-foot">
          <Button
            onClick={() =>
              go({
                area: area === "structure" ? "structure" : "organogram",
                item: null,
                mode: "studio",
              })
            }
          >
            Chart studio
          </Button>
          <Button variant="quiet" onClick={onManageAreas}>
            Manage areas
          </Button>
        </div>
      </nav>
      {on(area) ? (
        <Suspense fallback={<Empty title="Loading…" />}>
          <Area
            org={org}
            client={client}
            item={item}
            mode={mode}
            go={go}
            openTab={openTab}
            on={on}
          />
        </Suspense>
      ) : (
        <Empty
          title={`${label} is not part of ${client.name}’s file`}
          body="It is one of the full corporate-services areas. Anything already recorded in it is kept."
          action={<Button onClick={onManageAreas}>Manage areas</Button>}
        />
      )}
    </div>
  );
}
