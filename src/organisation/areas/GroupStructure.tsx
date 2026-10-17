/**
 * The group structure: what owns what.
 *
 * Entities are the boxes and shareholdings the lines, with the jurisdiction
 * shown by fill. It is a graph, not a tree — a joint venture has two parents
 * and a minority partner holds beside one — and it is never merged with the
 * organogram, which answers a different question.
 *
 * The current structure stays factual. The plan sits beside it as named
 * changes; Target applies them and Compare shows what they add and remove.
 *
 * Edit chart turns the page into a drawing surface: shareholdings are drawn
 * between boxes, companies added from the + buttons, and boxes coloured,
 * labelled and grouped into containers (see `charts/editor`).
 */
import { useCallback, useState } from "react";
import { Button } from "@/components/primitives";
import type { AreaProps } from "../area";
import {
  entitiesIn,
  entityLabel,
  entityStanding,
  formatDay,
  holderLabel,
  holdingsBy,
  holdingsIn,
  localDay,
  ownedThrough,
  percentLabel,
  shareholdersOf,
  structureFlags,
  type Entity,
  type Holding,
  type Organisation,
  type StructureChange,
} from "../model";
import {
  Empty,
  ErrorLine,
  Eyebrow,
  Facts,
  LinkButton,
  OrgPage,
  Panel,
  Pill,
  Segmented,
  count,
} from "../ui";
import EntityDialog from "../dialogs/EntityDialog";
import { useDeleteEntity } from "../dialogs/useDeleteEntity";
import HoldingDialog from "../dialogs/HoldingDialog";
import StructureChangeDialog from "../dialogs/StructureChangeDialog";
import RecordDocuments from "../components/RecordDocuments";
import ChartCanvas, { NOTHING, Swatch } from "../charts/ChartCanvas";
import ExportMenu from "../charts/ExportMenu";
import ChartStyleMenu from "../charts/ChartStyleMenu";
import { setStyle } from "../charts/design";
import { DEFAULT_STYLE } from "../charts/style";
import type { RouteOptions } from "../charts/layout";
import {
  holderNodeId,
  primaryJurisdiction,
  structureLayout,
  type StructureMode,
} from "../charts/build";
import { useChartWorkspace } from "../charts/editor/useChartWorkspace";
import { ownershipAdapter } from "../charts/editor/adapters";
import History from "../charts/History";

type HoldingEdit = {
  holding: Holding | null;
  defaults?: {
    subsidiaryEntityId?: string;
    ownerEntityId?: string;
    proposedChangeId?: string | null;
  };
};

const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  registration_no: "Registration number",
  registrationNo: "Registration number",
  tax_no: "Tax number",
  taxNo: "Tax number",
  incorporated_on: "Incorporated",
  incorporatedOn: "Incorporated",
  registered_office: "Registered office",
  registeredOffice: "Registered office",
  activity: "Objects and activity",
  share_capital: "Share capital",
  shareCapital: "Share capital",
  entity_type: "Type",
  entityType: "Type",
  jurisdiction: "Jurisdiction",
};

export default function GroupStructure({ org, client, item, mode: pageMode, go }: AreaProps) {
  const [mode, setMode] = useState<StructureMode>("current");
  const editing = pageMode === "edit";
  const [entityEdit, setEntityEdit] = useState<{
    entity: Entity | null;
    proposedChangeId?: string | null;
  } | null>(null);
  const [holdingEdit, setHoldingEdit] = useState<HoldingEdit | null>(null);
  const [changeEdit, setChangeEdit] = useState<{ change: StructureChange | null } | null>(null);

  const today = localDay();
  const deleting = useDeleteEntity(org);
  const build = useCallback(
    (route: RouteOptions) => structureLayout(org, mode, today, route),
    [org, mode, today],
  );
  const workspace = useChartWorkspace({
    org,
    kind: "ownership",
    view: mode,
    build,
    turnable: true,
    editing,
    adapter: (ctx) =>
      ownershipAdapter(ctx, {
        mode,
        openHolding: (id) => {
          const holding = org.holdings.find((h) => h.id === id);
          if (holding) setHoldingEdit({ holding });
        },
        openEntity: (id) => go({ area: "entities", item: id, mode: null }),
        openPerson: (id) => go({ area: "people", item: id, mode: null }),
        deleteEntity: (entity) =>
          void deleting.remove(entity).then((gone) => gone && ctx.select(NOTHING)),
      }),
  });
  const design = workspace.design;
  const applyStyle = (patch: Partial<typeof DEFAULT_STYLE>) =>
    workspace.change(setStyle(patch), "Change chart style");
  const current = entitiesIn(org, "current");
  const jurisdictions = new Set(current.map((e) => e.jurisdiction.trim()).filter(Boolean));
  const home = primaryJurisdiction(current);
  const title = `${client.name} — group structure`;
  const planned = org.changes.filter((c) => c.status === "planned");
  const flags = structureFlags(org);
  const history = org.history.filter((h) =>
    ["holdings", "structure_changes", "entities"].includes(h.recordType),
  );

  const selectedEntity = org.entities.find((e) => e.id === item) ?? null;
  const selectedHolder =
    !selectedEntity && item && (item.startsWith("p:") || item.startsWith("o:")) ? item : null;

  const aside = editing ? (
    workspace.panel
  ) : selectedEntity ? (
    <EntityAside
      org={org}
      entity={selectedEntity}
      onClose={() => go({ item: null })}
      go={go}
      onEditHolding={(holding) => setHoldingEdit({ holding })}
      onAddShareholder={() =>
        setHoldingEdit({ holding: null, defaults: { subsidiaryEntityId: selectedEntity.id } })
      }
      onAddHolding={() =>
        setHoldingEdit({ holding: null, defaults: { ownerEntityId: selectedEntity.id } })
      }
    />
  ) : selectedHolder ? (
    <HolderAside
      org={org}
      nodeId={selectedHolder}
      onClose={() => go({ item: null })}
      go={go}
      onEditHolding={(holding) => setHoldingEdit({ holding })}
    />
  ) : undefined;

  return (
    <OrgPage
      wide
      className={workspace.fullScreen ? "is-fullscreen" : undefined}
      title={title}
      subtitle={
        current.length
          ? `Ownership · ${count(current.length, "entity", "entities")}${jurisdictions.size ? ` · ${count(jurisdictions.size, "jurisdiction")}` : ""} · as at ${formatDay(today, "long")}`
          : "Ownership"
      }
      actions={
        <>
          <Segmented<StructureMode>
            label="Structure view"
            value={mode}
            onChange={setMode}
            options={[
              { id: "current", label: "Current" },
              { id: "target", label: "Target" },
              { id: "compare", label: "Compare" },
            ]}
          />
          {!editing && (
            <>
              <Button onClick={() => go({ mode: "studio", item: null })}>Chart studio</Button>
              <ChartStyleMenu
                style={design.style}
                onChange={applyStyle}
                onReset={() => applyStyle(DEFAULT_STYLE)}
                ownership={true}
              />
            </>
          )}
          <ExportMenu
            chart={workspace.composition}
            title={
              mode === "current"
                ? title
                : `${title} (${mode === "target" ? "target" : "current against target"})`
            }
            asAt={today}
          />
          {editing ? (
            <Button variant="primary" onClick={() => go({ mode: null, item: null })}>
              Done editing
            </Button>
          ) : (
            <>
              <Button
                onClick={() => setHoldingEdit({ holding: null })}
                disabled={!org.entities.length}
              >
                Add holding
              </Button>
              <Button onClick={() => setEntityEdit({ entity: null })}>Add entity</Button>
              <Button variant="primary" onClick={() => go({ mode: "edit", item: null })}>
                Edit chart
              </Button>
            </>
          )}
        </>
      }
      aside={aside}
    >
      {!editing && !org.entities.filter((e) => !e.archivedAt).length ? (
        <Empty
          title="No entities recorded yet"
          body="Add the companies in the group and who holds their shares, or import a structure chart the client already has and confirm what Scripta reads from it."
          action={
            <>
              <Button variant="primary" onClick={() => setEntityEdit({ entity: null })}>
                Add entity
              </Button>
              <Button onClick={() => go({ mode: "edit", item: null })}>Draw it on the chart</Button>
              <Button onClick={() => go({ mode: "studio", item: null })}>Import a structure</Button>
            </>
          }
        />
      ) : (
        <>
          {workspace.toolbar}
          <ErrorLine error={workspace.notice ?? workspace.saveError} />
          <ChartCanvas
            {...workspace.canvasProps}
            label={`${title}, ${mode}`}
            selectedId={item}
            onSelect={(id) => go({ item: id })}
            height={editing ? 640 : Math.min(620, Math.max(300, workspace.composition.height + 60))}
            emptyNote={<Empty title="Nothing to draw in this view" />}
            legend={
              design.legend.show ? undefined : (
                <>
                  <Eyebrow>
                    {mode === "current"
                      ? "Current structure · as is"
                      : mode === "target"
                        ? "Target structure · to be"
                        : "Current against target"}
                  </Eyebrow>
                  <Swatch tone="home">{home ? `${home} entity` : "Entity"}</Swatch>
                  {jurisdictions.size > 1 && <Swatch tone="foreign">Other jurisdictions</Swatch>}
                  <Swatch tone="holder">Shareholder</Swatch>
                  {mode !== "current" && <Swatch tone="proposed">Proposed</Swatch>}
                  {mode === "compare" && (
                    <>
                      <Swatch line="added">Added</Swatch>
                      <Swatch line="removed">Removed</Swatch>
                    </>
                  )}
                </>
              )
            }
          />
          {!workspace.fullScreen && (
            <>
              <Panel
                title="Target structure · to be"
                right={
                  <>
                    {planned.length > 0 && (
                      <span>{count(planned.length, "change")} to get there</span>
                    )}
                    {planned.length > 0 && mode !== "compare" && (
                      <LinkButton onClick={() => setMode("compare")}>Open comparison</LinkButton>
                    )}
                    <LinkButton onClick={() => setChangeEdit({ change: null })}>
                      Plan a change
                    </LinkButton>
                  </>
                }
              >
                {org.changes.length ? (
                  <div className="oc-band">
                    {org.changes.map((c) => (
                      <ChangeCard
                        key={c.id}
                        org={org}
                        change={c}
                        onEdit={() => setChangeEdit({ change: c })}
                        onAddHolding={() =>
                          setHoldingEdit({ holding: null, defaults: { proposedChangeId: c.id } })
                        }
                        onAddEntity={() => setEntityEdit({ entity: null, proposedChangeId: c.id })}
                        onEditHolding={(holding) => setHoldingEdit({ holding })}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="og-muted" style={{ margin: 0 }}>
                    No restructuring planned. A planned change holds the entities and holdings it
                    would add or remove, and the current chart stays as it is until it is done.
                  </p>
                )}
              </Panel>
              <div className="og-grid-2">
                <Panel
                  title={`Structure flags · ${flags.length}`}
                  {...(flags.length ? { tone: "warning" as const } : {})}
                >
                  {flags.length ? (
                    <ul className="og-rows">
                      {flags.map((f) => (
                        <li key={f.key}>
                          <span className="og-dot is-warning" />
                          <div className="og-row-main">
                            {f.entityId ? (
                              <LinkButton onClick={() => go({ item: f.entityId })}>
                                {f.text}
                              </LinkButton>
                            ) : (
                              f.text
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="og-muted" style={{ margin: 0 }}>
                      Recorded shareholdings are consistent.
                    </p>
                  )}
                </Panel>
                <History
                  title="Last change"
                  events={history}
                  empty="No changes to the structure recorded yet."
                />
              </div>
            </>
          )}
        </>
      )}

      <EntityDialog
        org={org}
        entity={entityEdit?.entity ?? null}
        open={!!entityEdit}
        onClose={() => setEntityEdit(null)}
        onSaved={(id) => go({ item: id })}
        {...(entityEdit?.proposedChangeId
          ? { defaults: { proposedChangeId: entityEdit.proposedChangeId } }
          : {})}
      />
      <HoldingDialog
        org={org}
        holding={holdingEdit?.holding ?? null}
        open={!!holdingEdit}
        onClose={() => setHoldingEdit(null)}
        {...(holdingEdit?.defaults ? { defaults: holdingEdit.defaults } : {})}
      />
      <StructureChangeDialog
        org={org}
        change={changeEdit?.change ?? null}
        open={!!changeEdit}
        onClose={() => setChangeEdit(null)}
      />
      {deleting.confirmDialog}
    </OrgPage>
  );
}

function holdingLine(org: Organisation, h: Holding) {
  const sub = org.entities.find((e) => e.id === h.subsidiaryEntityId);
  return `${holderLabel(org, h)} → ${entityLabel(sub)} ${h.percent !== null ? percentLabel(h.percent) : ""}`.trim();
}

function ChangeCard({
  org,
  change,
  onEdit,
  onAddHolding,
  onAddEntity,
  onEditHolding,
}: {
  org: Organisation;
  change: StructureChange;
  onEdit: () => void;
  onAddHolding: () => void;
  onAddEntity: () => void;
  onEditHolding: (h: Holding) => void;
}) {
  const adds = org.holdings.filter((h) => h.proposedChangeId === change.id);
  const removes = org.holdings.filter((h) => h.removedByChangeId === change.id);
  const entities = org.entities.filter((e) => e.proposedChangeId === change.id);
  const planned = change.status === "planned";
  return (
    <div className={`oc-change is-${change.status}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong>{change.title}</strong>
        {!planned && (
          <Pill tone={change.status === "done" ? "good" : "retired"}>
            {change.status === "done" ? "Done" : "Dropped"}
          </Pill>
        )}
      </div>
      {change.detail && <p>{change.detail}</p>}
      {(entities.length > 0 || adds.length > 0 || removes.length > 0) && (
        <ul className="og-rows" style={{ fontSize: 12 }}>
          {entities.map((e) => (
            <li key={e.id} style={{ padding: "4px 0" }}>
              New entity: {entityLabel(e)}
            </li>
          ))}
          {adds.map((h) => (
            <li key={h.id} style={{ padding: "4px 0" }}>
              <LinkButton onClick={() => onEditHolding(h)}>Adds {holdingLine(org, h)}</LinkButton>
            </li>
          ))}
          {removes.map((h) => (
            <li key={h.id} style={{ padding: "4px 0" }}>
              <LinkButton onClick={() => onEditHolding(h)}>Ends {holdingLine(org, h)}</LinkButton>
            </li>
          ))}
        </ul>
      )}
      <div className="oc-change-actions">
        <LinkButton onClick={onEdit}>{planned ? "Edit or mark done" : "Edit"}</LinkButton>
        {planned && <LinkButton onClick={onAddHolding}>Add a holding to it</LinkButton>}
        {planned && <LinkButton onClick={onAddEntity}>Add a new entity to it</LinkButton>}
      </div>
    </div>
  );
}

function EntityAside({
  org,
  entity,
  onClose,
  go,
  onEditHolding,
  onAddShareholder,
  onAddHolding,
}: {
  org: Organisation;
  entity: Entity;
  onClose: () => void;
  go: AreaProps["go"];
  onEditHolding: (h: Holding) => void;
  onAddShareholder: () => void;
  onAddHolding: () => void;
}) {
  const standing = entityStanding(org, entity.id);
  const deleting = useDeleteEntity(org);
  const shareholders = entity.proposedChangeId
    ? holdingsIn(org, "target").filter((h) => h.subsidiaryEntityId === entity.id)
    : shareholdersOf(org, entity.id);
  const direct = holdingsBy(org, entity.id);
  const indirect = ownedThrough(org, entity.id).filter((x) => x.path.length > 1);
  const byId = new Map(org.entities.map((e) => [e.id, e]));
  const conflicts = Object.entries(entity.fieldSources).filter(([, s]) => s.conflicts?.length);
  const docName = (id: string | null) =>
    id ? (org.documents.find((d) => d.id === id)?.name ?? "a document") : "an earlier entry";

  return (
    <>
      <div className="og-aside-head">
        <Eyebrow>{entity.proposedChangeId ? "Proposed entity" : "Selected in the chart"}</Eyebrow>
        <h3>{entity.name}</h3>
        <p style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
          <Pill
            tone={
              standing.tone === "good"
                ? "good"
                : standing.tone === "danger"
                  ? "danger"
                  : standing.tone === "warning"
                    ? "warning"
                    : "neutral"
            }
          >
            {standing.label}
          </Pill>
          {entity.jurisdiction}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button
          variant="primary"
          onClick={() => go({ area: "entities", item: entity.id, mode: null })}
        >
          Open in Entities
        </Button>
        <Button onClick={onAddHolding}>Add holding</Button>
        <Button variant="quiet" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="quiet"
          disabled={deleting.busy}
          onClick={() => void deleting.remove(entity).then((gone) => gone && onClose())}
        >
          Delete
        </Button>
      </div>
      <ErrorLine error={deleting.error} />
      {deleting.confirmDialog}
      <Panel title="Key facts">
        <Facts
          rows={[
            ["Reg. no.", entity.registrationNo],
            ["Tax no.", entity.taxNo],
            ["Incorporated", formatDay(entity.incorporatedOn)],
            ["Type", entity.entityType],
            ["Activity", entity.activity],
            ["Share capital", entity.shareCapital],
          ]}
        />
        {!entity.registrationNo && !entity.incorporatedOn && !entity.entityType && (
          <p className="og-muted" style={{ margin: 0 }}>
            No registration details recorded.
          </p>
        )}
        {standing.reasons.length > 0 && (
          <ul className="og-rows" style={{ marginTop: 8 }}>
            {standing.reasons.map((r) => (
              <li key={r} style={{ padding: "4px 0", fontSize: 12 }}>
                <span
                  className={`og-dot is-${standing.tone === "danger" ? "danger" : "warning"}`}
                />
                {r}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Shareholders" right={<LinkButton onClick={onAddShareholder}>Add</LinkButton>}>
        {shareholders.length ? (
          <ul className="og-rows">
            {shareholders.map((h) => (
              <li key={h.id}>
                <div className="og-row-main">
                  <span className="og-row-title">{holderLabel(org, h)}</span>
                  <span className="og-row-meta">
                    {[
                      h.instrument,
                      h.effectiveFrom ? `since ${formatDay(h.effectiveFrom)}` : "",
                      h.proposedChangeId ? "proposed" : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="og-row-side">
                  <span className="og-mono">{percentLabel(h.percent)}</span>
                  <LinkButton onClick={() => onEditHolding(h)}>Edit</LinkButton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="og-muted" style={{ margin: 0 }}>
            No shareholders recorded.
          </p>
        )}
      </Panel>
      {(direct.length > 0 || indirect.length > 0) && (
        <Panel title="What it owns">
          <ul className="og-rows">
            {direct.map((h) => (
              <li key={h.id}>
                <div className="og-row-main">
                  <LinkButton onClick={() => go({ item: h.subsidiaryEntityId })}>
                    {entityLabel(byId.get(h.subsidiaryEntityId))}
                  </LinkButton>
                  <span className="og-row-meta">Directly</span>
                </div>
                <div className="og-row-side">
                  <span className="og-mono">{percentLabel(h.percent)}</span>
                </div>
              </li>
            ))}
            {indirect.map((x) => (
              <li key={x.entityId}>
                <div className="og-row-main">
                  <LinkButton onClick={() => go({ item: x.entityId })}>
                    {entityLabel(byId.get(x.entityId))}
                  </LinkButton>
                  <span className="og-row-meta">
                    Through{" "}
                    {x.path
                      .slice(0, -1)
                      .map((id) => entityLabel(byId.get(id)))
                      .join(" › ")}
                  </span>
                </div>
                <div className="og-row-side">
                  <span className="og-mono" title="Effective share">
                    {x.effective === null ? "—" : percentLabel(x.effective)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title="Source documents">
        <RecordDocuments org={org} recordType="entity" recordId={entity.id} label={entity.name} />
      </Panel>
      {conflicts.map(([field, source]) => (
        <Panel key={field} tone="warning">
          {FIELD_LABEL[field] ?? field} is recorded as “{source.value}”, but{" "}
          {source.conflicts!.map((c, i) => (
            <span key={i}>
              {i > 0 && "; "}
              {docName(c.documentId)}
              {c.page ? ` (page ${c.page})` : ""} gives “{c.value}”
            </span>
          ))}
          . Confirm which is current.
        </Panel>
      ))}
    </>
  );
}

function HolderAside({
  org,
  nodeId,
  onClose,
  go,
  onEditHolding,
}: {
  org: Organisation;
  nodeId: string;
  onClose: () => void;
  go: AreaProps["go"];
  onEditHolding: (h: Holding) => void;
}) {
  const holdings = org.holdings.filter((h) => !h.ownerEntityId && holderNodeId(h) === nodeId);
  const personId = nodeId.startsWith("p:") ? nodeId.slice(2) : null;
  const name = personId
    ? (org.people.find((p) => p.id === personId)?.fullName ?? "")
    : nodeId.slice(2);
  const byId = new Map(org.entities.map((e) => [e.id, e]));
  return (
    <>
      <div className="og-aside-head">
        <Eyebrow>{personId ? "Shareholder" : "Shareholder outside the group"}</Eyebrow>
        <h3>{name}</h3>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {personId && (
          <Button onClick={() => go({ area: "people", item: personId, mode: null })}>
            Open in People
          </Button>
        )}
        <Button variant="quiet" onClick={onClose}>
          Close
        </Button>
      </div>
      <Panel title="Holds">
        {holdings.length ? (
          <ul className="og-rows">
            {holdings.map((h) => (
              <li key={h.id}>
                <div className="og-row-main">
                  <LinkButton onClick={() => go({ item: h.subsidiaryEntityId })}>
                    {entityLabel(byId.get(h.subsidiaryEntityId))}
                  </LinkButton>
                  <span className="og-row-meta">
                    {[
                      h.instrument,
                      h.proposedChangeId ? "proposed" : "",
                      h.removedByChangeId ? "ends under a planned change" : "",
                      h.effectiveTo ? `until ${formatDay(h.effectiveTo)}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="og-row-side">
                  <span className="og-mono">{percentLabel(h.percent)}</span>
                  <LinkButton onClick={() => onEditHolding(h)}>Edit</LinkButton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="og-muted" style={{ margin: 0 }}>
            No holdings recorded.
          </p>
        )}
      </Panel>
    </>
  );
}
