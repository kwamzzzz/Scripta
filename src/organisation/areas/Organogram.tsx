/**
 * The organogram: who reports to whom, and nothing else.
 *
 * Roles are the boxes, not people: a vacancy is a role with no holder, and a
 * change of holder moves no line. Ownership lives in the group structure,
 * which is a separate chart over separate records.
 *
 * Dragging a box onto another moves the reporting line. Because a reporting
 * line is a fact with a date and usually a board minute behind it, the move
 * asks for both before it is written, and the change joins the history below.
 *
 * Edit chart turns the page into a drawing surface: reporting lines are drawn
 * from manager to report, roles added from the + buttons, and boxes coloured,
 * labelled and grouped into containers (see `charts/editor`).
 */
import { useCallback, useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import type { AreaProps } from "../area";
import { deleteRecord, updateRecord } from "../db";
import {
  bandLabel,
  canReportTo,
  currentRoles,
  entityLabel,
  formatDay,
  localDay,
  organogramFlags,
  personName,
  reportingChain,
  roleKindName,
  type ChangeContext,
  type Organisation,
  type Role,
} from "../model";
import {
  ChangeFields,
  Empty,
  ErrorLine,
  Eyebrow,
  Facts,
  LinkButton,
  OrgDialog,
  OrgPage,
  Panel,
  Segmented,
  count,
  useOrgWrite,
} from "../ui";
import RoleDialog from "../dialogs/RoleDialog";
import ChartCanvas, { NOTHING, Swatch } from "../charts/ChartCanvas";
import ExportMenu from "../charts/ExportMenu";
import ChartStyleMenu from "../charts/ChartStyleMenu";
import { setStyle } from "../charts/design";
import { DEFAULT_STYLE } from "../charts/style";
import type { RouteOptions } from "../charts/layout";
import { organogramLayout, type OrganogramView } from "../charts/build";
import { useChartWorkspace } from "../charts/editor/useChartWorkspace";
import { reportingAdapter } from "../charts/editor/adapters";
import History from "../charts/History";

const STEP_VERB = { recommend: "Recommends", approve: "Approves", sign: "Signs" } as const;

export default function Organogram({ org, client, item, mode, go }: AreaProps) {
  const drawing = mode === "edit";
  const [view, setView] = useState<OrganogramView>("reporting");
  const [asAt, setAsAt] = useState(localDay());
  const [editing, setEditing] = useState<{
    role: Role | null;
    parentRoleId?: string | null;
  } | null>(null);
  const [moving, setMoving] = useState<{ roleId: string; parentId: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const today = localDay();
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const build = useCallback(
    (route: RouteOptions) => organogramLayout(org, view, asAt, route),
    [org, view, asAt],
  );
  const workspace = useChartWorkspace({
    org,
    kind: "reporting",
    view,
    build,
    turnable: view !== "function",
    editing: drawing,
    adapter: (ctx) =>
      reportingAdapter(ctx, {
        openRole: (id) => {
          const role = org.roles.find((r) => r.id === id);
          if (role) setEditing({ role });
        },
        deleteRole: (role) =>
          void (async () => {
            const below = org.roles.filter((r) => r.parentRoleId === role.id).length;
            const confirmed = await confirmDelete({
              what: `the role “${role.title}”`,
              binned: false,
              archivable: false,
              consequence:
                (below
                  ? `${below} role${below === 1 ? "" : "s"} reporting to it will have no manager. `
                  : "") + "To keep it in the history, end the role instead.",
            });
            if (!confirmed) return;
            const ok = await write.run(() => deleteRecord("org_roles", role.id));
            if (ok) ctx.select(NOTHING);
            else ctx.notice(write.error);
          })(),
      }),
  });
  const design = workspace.design;
  const applyStyle = (patch: Partial<typeof DEFAULT_STYLE>) =>
    workspace.change(setStyle(patch), "Change chart style");
  const roles = currentRoles(org, asAt);
  const flags = organogramFlags(org, asAt);
  const selected = org.roles.find((r) => r.id === item) ?? null;
  const title = `Organogram — ${client.name}`;
  const vacant = roles.filter((r) => !r.holderPersonId).length;

  const select = (id: string | null) =>
    go({ item: id && org.roles.some((r) => r.id === id) ? id : null });

  const requestMove = (roleId: string, parentId: string | null) => {
    setNotice(null);
    const role = org.roles.find((r) => r.id === roleId);
    if (!role || role.parentRoleId === parentId) return;
    if (!canReportTo(org, roleId, parentId)) {
      const target = org.roles.find((r) => r.id === parentId);
      setNotice(
        `${role.title} cannot report to ${target?.title ?? "that role"}, which already reports up to ${role.title}.`,
      );
      return;
    }
    setMoving({ roleId, parentId });
  };

  const history = org.history.filter(
    (h) => h.recordType === "roles" || h.recordType === "role_lines",
  );

  const aside = drawing ? (
    workspace.panel
  ) : selected ? (
    <RoleAside
      org={org}
      role={selected}
      onEdit={() => setEditing({ role: selected })}
      onAddBelow={() => setEditing({ role: null, parentRoleId: selected.id })}
      onClose={() => select(null)}
      go={go}
    />
  ) : undefined;

  return (
    <OrgPage
      wide
      className={workspace.fullScreen ? "is-fullscreen" : undefined}
      title={title}
      subtitle={
        roles.length
          ? `Reporting lines · ${count(roles.length, "role")}${vacant ? ` · ${vacant} vacant` : ""} · as at ${formatDay(asAt, "long")}`
          : "Reporting lines"
      }
      actions={
        <>
          <Segmented<OrganogramView>
            label="Organogram view"
            value={view}
            onChange={setView}
            options={[
              { id: "reporting", label: "Reporting lines" },
              { id: "function", label: "By function" },
              { id: "gaps", label: "Gaps" },
            ]}
          />
          {!drawing && (
            <>
              <Button onClick={() => go({ mode: "studio", item: null })}>Chart studio</Button>
              <ChartStyleMenu
                style={design.style}
                onChange={applyStyle}
                onReset={() => applyStyle(DEFAULT_STYLE)}
                ownership={false}
              />
            </>
          )}
          <ExportMenu chart={workspace.composition} title={title} asAt={asAt} />
          {drawing ? (
            <Button variant="primary" onClick={() => go({ mode: null, item: null })}>
              Done editing
            </Button>
          ) : (
            <>
              <Button onClick={() => setEditing({ role: null })}>Add role</Button>
              <Button variant="primary" onClick={() => go({ mode: "edit", item: null })}>
                Edit chart
              </Button>
            </>
          )}
        </>
      }
      aside={aside}
    >
      {!drawing && !org.roles.length ? (
        <Empty
          title="No roles recorded yet"
          body="Add the roles at the top of the organisation and build down, or import a chart the client already has — PowerPoint, draw.io or a spreadsheet — and confirm what Scripta reads from it."
          action={
            <>
              <Button variant="primary" onClick={() => setEditing({ role: null })}>
                Add role
              </Button>
              <Button onClick={() => go({ mode: "edit", item: null })}>Draw it on the chart</Button>
              <Button onClick={() => go({ mode: "studio", item: null })}>Import a chart</Button>
            </>
          }
        />
      ) : (
        <>
          <div className="oc-head-tools">
            <label className="oc-asat">
              As at
              <input
                type="date"
                value={asAt}
                max="9999-12-31"
                onChange={(e) => setAsAt(e.target.value || today)}
              />
            </label>
            {asAt !== today && (
              <span className="og-muted" style={{ fontSize: 12 }}>
                Roles in force on {formatDay(asAt, "long")}; reporting lines are as recorded today.{" "}
                <LinkButton onClick={() => setAsAt(today)}>Back to today</LinkButton>
              </span>
            )}
            {view === "reporting" && !drawing && (
              <span className="og-muted" style={{ fontSize: 12 }}>
                Drag a role onto another to change whom it reports to, or anywhere else to move it.
                Edit chart to draw, colour and group.
              </span>
            )}
          </div>
          {workspace.toolbar}
          <ErrorLine error={notice ?? workspace.notice ?? workspace.saveError} />
          <ChartCanvas
            {...workspace.canvasProps}
            label={`${title}, ${view === "function" ? "grouped by function" : "reporting lines"}`}
            selectedId={item}
            onSelect={select}
            onDrop={
              view === "function" || drawing
                ? undefined
                : (id, target) => target && requestMove(id, target)
            }
            height={drawing ? 640 : Math.min(640, Math.max(320, workspace.composition.height + 60))}
            emptyNote={<Empty title={`No roles in force on ${formatDay(asAt, "long")}`} />}
            legend={
              design.legend.show ? undefined : (
                <>
                  <Swatch tone="leadership">Leadership</Swatch>
                  <Swatch tone="head">Function head</Swatch>
                  <Swatch tone="role">Role</Swatch>
                  <Swatch tone="vacant">Vacant</Swatch>
                  <Swatch line="dotted">Functional line</Swatch>
                </>
              )
            }
          />
          {!workspace.fullScreen && (
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
                          <LinkButton onClick={() => go({ item: f.roleId })}>{f.text}</LinkButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="og-muted" style={{ margin: 0 }}>
                    No vacancies, sole responsibilities, double reporting lines or missing cover in
                    the roles recorded.
                  </p>
                )}
              </Panel>
              <History
                title="Last change"
                events={history}
                empty="No changes to reporting lines recorded yet."
              />
            </div>
          )}
        </>
      )}

      <RoleDialog
        org={org}
        role={editing?.role ?? null}
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={(id) => go({ item: id })}
        {...(editing && !editing.role
          ? { defaults: { parentRoleId: editing.parentRoleId ?? null } }
          : {})}
      />
      {moving && <MoveDialog org={org} move={moving} onClose={() => setMoving(null)} />}
      {confirmDialog}
    </OrgPage>
  );
}

function MoveDialog({
  org,
  move,
  onClose,
}: {
  org: Organisation;
  move: { roleId: string; parentId: string | null };
  onClose: () => void;
}) {
  const write = useOrgWrite(org.clientId);
  const [change, setChange] = useState<ChangeContext>({});
  const role = org.roles.find((r) => r.id === move.roleId)!;
  const from = org.roles.find((r) => r.id === role.parentRoleId);
  const to = org.roles.find((r) => r.id === move.parentId);
  return (
    <OrgDialog
      open
      title="Change a reporting line"
      blurb={`${role.title} will report to ${to ? to.title : "nobody (top of the chart)"}${from ? ` instead of ${from.title}` : ""}.`}
      onClose={onClose}
      onSubmit={async () => {
        const ok = await write.run(() =>
          updateRecord("org_roles", role.id, { parent_role_id: move.parentId }, change),
        );
        if (ok) onClose();
      }}
      submitLabel="Move role"
      busy={write.busy}
      error={write.error}
    >
      <ChangeFields value={change} onChange={setChange} />
    </OrgDialog>
  );
}

function RoleAside({
  org,
  role,
  onEdit,
  onAddBelow,
  onClose,
  go,
}: {
  org: Organisation;
  role: Role;
  onEdit: () => void;
  onAddBelow: () => void;
  onClose: () => void;
  go: AreaProps["go"];
}) {
  const parent = org.roles.find((r) => r.id === role.parentRoleId);
  const cover = org.roles.find((r) => r.id === role.coverRoleId);
  const entity = org.entities.find((e) => e.id === role.entityId);
  const chain = [...reportingChain(org, role.id)].reverse();
  const reports = org.roles.filter((r) => r.parentRoleId === role.id);
  const owns = org.responsibilities.filter((x) => x.roleId === role.id);
  const deputises = org.responsibilities.filter((x) => x.deputyRoleId === role.id);
  const parties = org.parties.filter((p) => p.roleId === role.id);
  const linesOut = org.lines.filter((l) => l.roleId === role.id);
  const linesIn = org.lines.filter((l) => l.toRoleId === role.id);
  const covering = org.roles.filter((r) => r.coverRoleId === role.id);
  const holder = personName(org, role.holderPersonId);
  const title = (id: string) => org.roles.find((r) => r.id === id)?.title ?? "Role";

  return (
    <>
      <div className="og-aside-head">
        <Eyebrow>{roleKindName(role)}</Eyebrow>
        <h3>{role.title}</h3>
        <p>
          {holder ? (
            <LinkButton
              onClick={() => go({ area: "people", item: role.holderPersonId, mode: null })}
            >
              {holder}
              {role.acting ? " (acting)" : ""}
            </LinkButton>
          ) : (
            "Vacant"
          )}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="primary" onClick={onEdit}>
          Edit
        </Button>
        <Button onClick={onEdit}>{holder ? "Change holder" : "Fill role"}</Button>
        <Button onClick={onAddBelow}>Add role below</Button>
        <Button variant="quiet" onClick={onClose}>
          Close
        </Button>
      </div>
      <Panel title="Place in the organisation">
        <Facts
          rows={[
            [
              "Reports to",
              parent ? (
                <LinkButton onClick={() => go({ item: parent.id })}>{parent.title}</LinkButton>
              ) : (
                "Nobody"
              ),
            ],
            ["Direct reports", reports.length ? reports.map((r) => r.title).join(", ") : ""],
            ["Function", role.functionName],
            [
              "Entity",
              entity ? (
                <LinkButton onClick={() => go({ area: "entities", item: entity.id, mode: null })}>
                  {entityLabel(entity)}
                </LinkButton>
              ) : (
                ""
              ),
            ],
            [
              "Absence cover",
              cover
                ? `${cover.title}${role.coverNote ? `, ${role.coverNote}` : ""}`
                : role.kind === "role"
                  ? ""
                  : "None named",
            ],
            ["Covers for", covering.map((r) => r.title).join(", ")],
            [
              "Functional lines",
              [
                ...linesOut.map((l) => `to ${title(l.toRoleId)}`),
                ...linesIn.map((l) => `from ${title(l.roleId)}`),
              ].join("; "),
            ],
            [
              "In place",
              [
                role.effectiveFrom ? `from ${formatDay(role.effectiveFrom)}` : "",
                role.effectiveTo ? `until ${formatDay(role.effectiveTo)}` : "",
              ]
                .filter(Boolean)
                .join(" "),
            ],
          ]}
        />
        {chain.length > 0 && (
          <div className="oc-chain" style={{ marginTop: 10 }} aria-label="Reporting chain">
            {[...chain, role].map((r, i) => (
              <span key={r.id}>
                {i > 0 && "› "}
                {r.title}
              </span>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Responsibilities">
        {owns.length || deputises.length ? (
          <ul className="og-rows">
            {owns.map((x) => (
              <li key={x.id}>
                <div className="og-row-main">
                  <span className="og-row-title">{x.area}</span>
                  <span className="og-row-meta">
                    {x.deputyRoleId ? `Deputy: ${title(x.deputyRoleId)}` : "No deputy"}
                  </span>
                </div>
              </li>
            ))}
            {deputises.map((x) => (
              <li key={x.id}>
                <div className="og-row-main">
                  <span className="og-row-title">{x.area}</span>
                  <span className="og-row-meta">Deputy for {title(x.roleId)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="og-muted" style={{ margin: 0 }}>
            None recorded for this role.{" "}
            <LinkButton onClick={() => go({ area: "people", item: null, mode: null })}>
              People & responsibilities
            </LinkButton>
          </p>
        )}
      </Panel>
      <Panel title="Authority">
        {parties.length ? (
          <ul className="og-rows">
            {parties.map((p) => {
              const rule = org.rules.find((r) => r.id === p.ruleId);
              if (!rule) return null;
              return (
                <li key={p.id}>
                  <div className="og-row-main">
                    <span className="og-row-title">
                      {STEP_VERB[p.step]}: {rule.matterType}
                    </span>
                    <span className="og-row-meta">
                      {bandLabel(rule)}
                      {rule.basis === "inferred"
                        ? " · inferred, not recorded in an instrument"
                        : ""}
                    </span>
                  </div>
                  <div className="og-row-side">
                    <LinkButton
                      onClick={() => go({ area: "authority", item: rule.id, mode: null })}
                    >
                      Open
                    </LinkButton>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="og-muted" style={{ margin: 0 }}>
            No authority rule names this role.
          </p>
        )}
      </Panel>
    </>
  );
}
