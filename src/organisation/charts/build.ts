/**
 * From records to chart input. The organogram reads roles only; the group
 * structure reads entities and holdings only. Nothing here crosses the two.
 */
import {
  currentRoles,
  entitiesIn,
  entityLabel,
  holdingsIn,
  localDay,
  organogramFlags,
  percentLabel,
  personName,
  type Day,
  type Entity,
  type Holding,
  type Organisation,
  type Role,
  type StructureView,
} from "../model";
import {
  layoutColumns,
  layoutLayered,
  layoutTree,
  type ChartLayout,
  type GraphEdge,
  type GraphNode,
  type NodeTone,
  type RouteOptions,
} from "./layout";

/** Fill and edge per tone, in the Scripta identity. Shared by screen and files. */
export const TONE_COLOURS: Record<NodeTone, { fill: string; stroke: string; ink: string }> = {
  leadership: { fill: "#EEF2F7", stroke: "#B9C6D6", ink: "#123247" },
  head: { fill: "#FFFFFF", stroke: "#B8BEB9", ink: "#123247" },
  role: { fill: "#FFFFFF", stroke: "#D3D7D1", ink: "#123247" },
  vacant: { fill: "#FDF6EA", stroke: "#C9822B", ink: "#85601D" },
  home: { fill: "#EAF2EF", stroke: "#9FC3BC", ink: "#123247" },
  foreign: { fill: "#EEF2F7", stroke: "#B9C6D6", ink: "#123247" },
  holder: { fill: "#FFFFFF", stroke: "#8E999C", ink: "#123247" },
  proposed: { fill: "#FFFFFF", stroke: "#8E999C", ink: "#4D585C" },
  group: { fill: "#F4F6F4", stroke: "#DEE0D9", ink: "#123247" },
};

export const EDGE_COLOURS = {
  solid: "#9AA3A0",
  dotted: "#247A78",
  added: "#247A78",
  removed: "#B4483A",
} as const;

export type OrganogramView = "reporting" | "function" | "gaps";

const roleNode = (org: Organisation, r: Role, flagged: Set<string> | null): GraphNode => {
  const holder = personName(org, r.holderPersonId);
  const vacant = !r.holderPersonId;
  const state = flagged ? (flagged.has(r.id) ? "flagged" : "muted") : null;
  return {
    id: r.id,
    kind: "role",
    title: r.title,
    subtitle: vacant ? "Vacant" : holder,
    tone: vacant
      ? "vacant"
      : r.kind === "leadership"
        ? "leadership"
        : r.kind === "head"
          ? "head"
          : "role",
    dashed: vacant,
    state,
    ...(r.acting && !vacant ? { badge: "Acting" } : {}),
  };
};

export function organogramLayout(
  org: Organisation,
  view: OrganogramView,
  on: Day = localDay(),
  route: RouteOptions = {},
): ChartLayout {
  const roles = currentRoles(org, on);
  const inForce = new Set(roles.map((r) => r.id));
  const flagged = view === "gaps" ? new Set(organogramFlags(org, on).map((f) => f.roleId)) : null;
  if (view === "function") {
    const groups = new Map<string, Role[]>();
    for (const r of roles) {
      const key = r.functionName.trim() || "";
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const rank = { leadership: 0, head: 1, role: 2 } as const;
    return layoutColumns(
      [...groups.entries()]
        .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
        .map(([key, list]) => ({
          id: key || "none",
          title: key || "No function recorded",
          nodes: list
            .sort(
              (a, b) =>
                rank[a.kind] - rank[b.kind] ||
                a.position - b.position ||
                a.title.localeCompare(b.title),
            )
            .map((r) => roleNode(org, r, null)),
        })),
      route,
    );
  }
  return layoutTree(
    {
      nodes: roles.map((r) => ({
        ...roleNode(org, r, flagged),
        parentId: r.parentRoleId && inForce.has(r.parentRoleId) ? r.parentRoleId : null,
        order: r.position,
      })),
      lines: org.lines
        .filter((l) => inForce.has(l.roleId) && inForce.has(l.toRoleId))
        .map((l) => ({
          id: `line-${l.id}`,
          from: l.roleId,
          to: l.toRoleId,
          label: l.note,
          style: "dotted" as const,
        })),
    },
    route,
  );
}

/** The jurisdiction most of the group sits in, which the chart treats as home. */
export const primaryJurisdiction = (entities: Entity[]) => {
  const count = new Map<string, number>();
  for (const e of entities) {
    const j = e.jurisdiction.trim();
    if (j) count.set(j, (count.get(j) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
};

export const holderNodeId = (h: Holding) =>
  h.ownerEntityId ?? (h.ownerPersonId ? `p:${h.ownerPersonId}` : `o:${(h.ownerName ?? "").trim()}`);

export type StructureMode = StructureView | "compare";

export function structureLayout(
  org: Organisation,
  mode: StructureMode,
  on: Day = localDay(),
  route: RouteOptions = {},
): ChartLayout {
  const current = holdingsIn(org, "current", on);
  const target = holdingsIn(org, "target", on);
  const currentIds = new Set(current.map((h) => h.id));
  const targetIds = new Set(target.map((h) => h.id));
  const holdings =
    mode === "current"
      ? current
      : mode === "target"
        ? target
        : [...current, ...target.filter((h) => !currentIds.has(h.id))];
  const entities =
    mode === "current"
      ? entitiesIn(org, "current")
      : [
          ...entitiesIn(org, "current"),
          ...entitiesIn(org, "target").filter((e) => e.proposedChangeId),
        ];
  const home = primaryJurisdiction(entitiesIn(org, "current"));
  const nodes: GraphNode[] = entities.map((e) => ({
    id: e.id,
    kind: "entity",
    title: entityLabel(e),
    subtitle: e.jurisdiction || e.entityType,
    tone: e.proposedChangeId
      ? "proposed"
      : !home || e.jurisdiction.trim() === home
        ? "home"
        : "foreign",
    dashed: !!e.proposedChangeId,
    state: mode === "compare" && e.proposedChangeId ? "added" : null,
  }));
  const present = new Set(nodes.map((n) => n.id));
  const holders = new Map<string, GraphNode>();
  for (const h of holdings) {
    const id = holderNodeId(h);
    if (present.has(id) || holders.has(id)) continue;
    if (h.ownerEntityId) continue; // an entity not in this view: its edge is dropped below
    const person = h.ownerPersonId ? org.people.find((p) => p.id === h.ownerPersonId) : null;
    holders.set(id, {
      id,
      kind: h.ownerPersonId ? "person" : "outside",
      title: person ? person.fullName : (h.ownerName ?? ""),
      subtitle: person ? person.location || "Shareholder" : "Outside the group",
      tone: "holder",
    });
  }
  const edges: GraphEdge[] = holdings
    .map((h) => ({
      id: h.id,
      from: holderNodeId(h),
      to: h.subsidiaryEntityId,
      label: percentLabel(h.percent) === "—" ? "" : percentLabel(h.percent),
      style:
        mode !== "compare"
          ? ("solid" as const)
          : !currentIds.has(h.id)
            ? ("added" as const)
            : !targetIds.has(h.id)
              ? ("removed" as const)
              : ("solid" as const),
    }))
    .filter((e) => present.has(e.to) && (present.has(e.from) || holders.has(e.from)));
  return layoutLayered({ nodes: [...holders.values(), ...nodes], edges }, route);
}
