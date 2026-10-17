/**
 * What drawing means on each chart.
 *
 * On the group structure a line is a shareholding, drawn from the holder to
 * the company it holds, and the share is asked for as the line is made. On the
 * organogram a line is a reporting line, drawn from the manager to the role
 * that reports to them, or a dotted functional line. New boxes are records
 * (a company, a person, a role) with only the name filled in; the rest is
 * added from the forms when it is known.
 */
import { useState } from "react";
import { Button } from "@/components/primitives";
import {
  entityLabel,
  holderLabel,
  percentLabel,
  personName,
  type Entity,
  type Organisation,
  type Role,
} from "../../model";
import { NOTHING, type QuickAdd } from "../ChartCanvas";
import { holderNodeId, type StructureMode } from "../build";
import { addNote, renameNode } from "../design";
import type { Point } from "../layout";
import {
  addHolding,
  addLine,
  createEntity,
  createPerson,
  createRole,
  holderOf,
  parseShare,
  reportingProblem,
  removeHolding,
  removeLine,
  renameEntity,
  renameOutside,
  renamePerson,
  renameRole,
  setLineNote,
  setParent,
  setShare,
  together,
  type HolderRef,
} from "../records";
import type { Step } from "../useChartDesign";
import type { ChartAdapter, EditorContext } from "./useChartWorkspace";
import { Choice, CommitInput, NameInput, Pop, Section, ShareInput } from "./fields";

const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Where a box sits, for opening a form beside it. */
const besideNode = (ctx: EditorContext, id: string): Point => {
  const n = ctx.composition.nodes.find((x) => x.id === id);
  return n ? { x: n.x, y: n.y + n.h + 8 } : { x: 32, y: 32 };
};

/* =============================================================== ownership */

export type OwnershipPage = {
  mode: StructureMode;
  openHolding: (holdingId: string) => void;
  openEntity: (entityId: string) => void;
  openPerson: (personId: string) => void;
  deleteEntity: (entity: Entity) => void;
};

export function ownershipAdapter(ctx: EditorContext, page: OwnershipPage): ChartAdapter {
  const { org } = ctx;
  const planned = org.changes.filter((c) => c.status === "planned");
  const entity = (id: string) => org.entities.find((e) => e.id === id) ?? null;
  const title = (id: string) =>
    id.startsWith("p:")
      ? personName(org, id.slice(2)) || "Person"
      : id.startsWith("o:")
        ? id.slice(2)
        : entityLabel(entity(id) ?? undefined);
  const names = [
    ...org.entities.filter((e) => !e.archivedAt).map((e) => e.name),
    ...org.people.filter((p) => !p.archivedAt).map((p) => p.fullName),
  ];

  /** Finds a company by name, or records a new one. */
  const companyNamed = async (name: string, steps: Step[], proposal: string | null) => {
    const found = org.entities.find((e) => fold(e.name) === fold(name));
    if (found) return found.id;
    const made = await createEntity(org, name, proposal);
    steps.push(made.step);
    return made.id;
  };

  const shareForm = (from: string, to: string, at: Point) =>
    ctx.open(
      at,
      <ShareForm
        holder={title(from)}
        company={title(to)}
        planned={page.mode === "current" ? [] : planned}
        onCancel={ctx.close}
        onSubmit={async (share, proposal) => {
          const ok = await ctx.run(
            async () => (await addHolding(org, holderOf(from), to, share, proposal)).step,
          );
          if (ok) ctx.close();
        }}
      />,
    );

  const newCompanyForm = (heading: string, holder: HolderRef | null, at: Point, pin: boolean) =>
    ctx.open(
      at,
      <CompanyForm
        heading={heading}
        withShare={!!holder}
        suggestions={org.entities.map((e) => e.name)}
        planned={page.mode === "current" ? [] : planned}
        onCancel={ctx.close}
        onSubmit={async (name, share, proposal) => {
          let placed: string | null = null;
          const ok = await ctx.run(async () => {
            const steps: Step[] = [];
            const id = await companyNamed(name, steps, proposal);
            placed = id;
            if (holder) steps.push((await addHolding(org, holder, id, share, proposal)).step);
            return together(`Add ${name}`, steps);
          });
          if (ok) {
            if (pin && placed) ctx.place(placed, at);
            ctx.close();
          }
        }}
      />,
    );

  const shareholderForm = (companyId: string, at: Point) =>
    ctx.open(
      at,
      <ShareholderForm
        company={title(companyId)}
        suggestions={names}
        planned={page.mode === "current" ? [] : planned}
        onCancel={ctx.close}
        onSubmit={async (name, holderKind, share, proposal) => {
          const ok = await ctx.run(async () => {
            const steps: Step[] = [];
            let holder: HolderRef;
            if (holderKind === "company")
              holder = { kind: "entity", id: await companyNamed(name, steps, proposal) };
            else if (holderKind === "person") {
              const found = org.people.find((p) => fold(p.fullName) === fold(name));
              if (found) holder = { kind: "person", id: found.id };
              else {
                const made = await createPerson(org, name);
                steps.push(made.step);
                holder = { kind: "person", id: made.id };
              }
            } else holder = { kind: "outside", name };
            steps.push((await addHolding(org, holder, companyId, share, proposal)).step);
            return together(`Add ${name} as shareholder`, steps);
          });
          if (ok) ctx.close();
        }}
      />,
    );

  const rename = (id: string, at: Point) =>
    ctx.open(
      at,
      <RenameForm
        value={title(id)}
        onCancel={ctx.close}
        onSubmit={async (to) => {
          const from = title(id);
          if (!to.trim() || to.trim() === from) return ctx.close();
          const ok = await ctx.run(async () =>
            id.startsWith("p:")
              ? renamePerson(id.slice(2), from, to)
              : id.startsWith("o:")
                ? renameOutside(org, from, to)
                : renameEntity(id, from, to),
          );
          if (ok && id.startsWith("o:")) ctx.change(renameNode(id, `o:${to.trim()}`), "Rename");
          if (ok) ctx.close();
        }}
      />,
    );

  const quickAdd = (id: string, where: QuickAdd, at: Point) => {
    const isEntity = !!entity(id);
    if (where === "before") {
      if (!isEntity) return ctx.notice("Shareholders are added above a company.");
      return shareholderForm(id, at);
    }
    if (where === "after")
      return newCompanyForm(`New company held by ${title(id)}`, holderOf(id), at, false);
    // Beside: a company held by the same shareholder, or on its own.
    const holding = org.holdings
      .filter((h) => h.subsidiaryEntityId === id && !h.effectiveTo)
      .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0];
    if (!isEntity) return ctx.notice("Companies are added beside a company.");
    return holding
      ? newCompanyForm(
          `New company held by ${holderLabel(org, holding)}`,
          holderOf(holderNodeId(holding)),
          at,
          false,
        )
      : newCompanyForm("New company", null, at, false);
  };

  const remove: ChartAdapter["remove"] = (selection) => {
    if (selection.kind === "edge") {
      const holding = org.holdings.find((h) => h.id === selection.id);
      if (!holding) return;
      void ctx.run(() => removeHolding(org, holding)).then((ok) => ok && ctx.select(NOTHING));
      return;
    }
    if (selection.kind !== "nodes") return;
    if (selection.ids.length !== 1) return ctx.notice("Delete boxes one at a time.");
    const id = selection.ids[0]!;
    const e = entity(id);
    if (e) return page.deleteEntity(e);
    const holdings = org.holdings.filter((h) => !h.ownerEntityId && holderNodeId(h) === id);
    void ctx
      .run(async () => {
        const steps: Step[] = [];
        for (const h of holdings) steps.push(await removeHolding(org, h));
        return together(`Remove ${title(id)}'s holdings`, steps);
      })
      .then((ok) => ok && ctx.select(NOTHING));
  };

  return {
    quickLabels: {
      before: "Add a shareholder",
      after: "Add a company it holds",
      beside: "Add a company alongside",
    },
    howTo: [
      "Drag from a dot on the shareholder's box to the company it holds, then type the share.",
      "Select a box and use its + buttons to add a shareholder above, a company below, or one alongside.",
      "Double-click empty space to add a company or a note there; double-click a box to rename it.",
    ],
    addItems: [{ label: "Company", open: (at) => newCompanyForm("New company", null, at, false) }],
    connect: (from, to, at) => {
      if (!to)
        return newCompanyForm(`New company held by ${title(from)}`, holderOf(from), at, true);
      if (from === to) return;
      if (!entity(to))
        return ctx.notice(
          "Shares are held in a company. Draw the line from the shareholder to the company it holds.",
        );
      const existing = org.holdings.find(
        (h) =>
          holderNodeId(h) === from &&
          h.subsidiaryEntityId === to &&
          !h.effectiveTo &&
          !h.removedByChangeId,
      );
      if (existing) {
        ctx.select({ kind: "edge", id: existing.id });
        return ctx.notice(
          `${title(from)} already holds shares in ${title(to)}. Change the share in the panel.`,
        );
      }
      shareForm(from, to, at);
    },
    quickAdd,
    createAt: (at) =>
      ctx.open(
        at,
        <HereForm
          kinds={[
            { id: "record", label: "Company" },
            { id: "note", label: "Note" },
          ]}
          onCancel={ctx.close}
          onSubmit={async (what, text) => {
            if (what === "note") {
              const made = addNote(text, at);
              ctx.change(made.op, "Add note");
              ctx.select({ kind: "note", id: made.id });
              return ctx.close();
            }
            let id: string | null = null;
            const ok = await ctx.run(async () => {
              const made = await createEntity(org, text);
              id = made.id;
              return made.step;
            });
            // The first box on an empty chart is laid out with the rest, not pinned.
            if (ok && id && ctx.composition.nodes.length) ctx.place(id, at);
            if (ok) ctx.close();
          }}
        />,
      ),
    rename,
    remove,
    nodeTitle: title,
    nodeActions: (ids) => {
      if (ids.length !== 1) return null;
      const id = ids[0]!;
      const e = entity(id);
      const at = besideNode(ctx, id);
      return (
        <>
          <Button onClick={() => rename(id, at)}>Rename</Button>
          {e && <Button onClick={() => shareholderForm(id, at)}>Add shareholder</Button>}
          <Button onClick={() => quickAdd(id, "after", at)}>Add company it holds</Button>
          {e ? (
            <Button variant="quiet" onClick={() => page.openEntity(id)}>
              Open in Entities
            </Button>
          ) : id.startsWith("p:") ? (
            <Button variant="quiet" onClick={() => page.openPerson(id.slice(2))}>
              Open in People
            </Button>
          ) : null}
          <Button variant="quiet" onClick={() => remove({ kind: "nodes", ids: [id] })}>
            {e ? "Delete company" : "Remove from the chart"}
          </Button>
        </>
      );
    },
    edgeTitle: (id) => {
      const h = org.holdings.find((x) => x.id === id);
      return h
        ? `${holderLabel(org, h)} → ${entityLabel(entity(h.subsidiaryEntityId) ?? undefined)}`
        : "Shareholding";
    },
    edgeFields: (id) => {
      const h = org.holdings.find((x) => x.id === id);
      if (!h) return null;
      return (
        <Section title="Shareholding">
          <CommitInput
            label="Share"
            suffix="%"
            value={h.percent === null ? "" : String(h.percent)}
            placeholder="Not known"
            onCommit={(text) => {
              const share = parseShare(text);
              if (share === "invalid")
                return ctx.notice("A share is more than 0% and no more than 100%.");
              void ctx.run(() => setShare(h, share));
            }}
          />
          <p className="oe-hint">
            {[
              h.instrument,
              h.proposedChangeId ? "proposed" : "",
              percentLabel(h.percent) === "—" ? "share not recorded" : "",
            ]
              .filter(Boolean)
              .join(" · ") || "In force."}{" "}
            <button type="button" className="org-link" onClick={() => page.openHolding(h.id)}>
              Dates, instrument and scenario…
            </button>
          </p>
        </Section>
      );
    },
  };
}

/* =============================================================== reporting */

export type ReportingPage = {
  openRole: (roleId: string) => void;
  deleteRole: (role: Role) => void;
};

export function reportingAdapter(ctx: EditorContext, page: ReportingPage): ChartAdapter {
  const { org } = ctx;
  const role = (id: string) => org.roles.find((r) => r.id === id) ?? null;
  const title = (id: string) => role(id)?.title ?? "Role";
  const people = org.people.filter((p) => !p.archivedAt).map((p) => p.fullName);

  /** The holder named in a form: someone recorded, a new person, or nobody. */
  const personNamed = async (name: string, steps: Step[]) => {
    if (!name.trim()) return null;
    const found = org.people.find((p) => fold(p.fullName) === fold(name));
    if (found) return found.id;
    const made = await createPerson(org, name);
    steps.push(made.step);
    return made.id;
  };

  const roleForm = (
    heading: string,
    at: Point,
    save: (title: string, holderId: string | null, steps: Step[]) => Promise<string>,
    pin: boolean,
  ) =>
    ctx.open(
      at,
      <RoleForm
        heading={heading}
        people={people}
        onCancel={ctx.close}
        onSubmit={async (t, holder) => {
          let id: string | null = null;
          const ok = await ctx.run(async () => {
            const steps: Step[] = [];
            const holderId = await personNamed(holder, steps);
            id = await save(t, holderId, steps);
            return together(`Add ${t}`, steps);
          });
          if (ok && pin && id) ctx.place(id, at);
          if (ok) ctx.close();
        }}
      />,
    );

  const quickAdd = (id: string, where: QuickAdd, at: Point) => {
    const r = role(id);
    if (!r) return;
    if (where === "after")
      return roleForm(
        `New role reporting to ${r.title}`,
        at,
        async (t, holder, steps) => {
          const made = await createRole(org, t, r.id, holder);
          steps.push(made.step);
          return made.id;
        },
        false,
      );
    if (where === "beside")
      return roleForm(
        r.parentRoleId ? `New role reporting to ${title(r.parentRoleId)}` : "New role at the top",
        at,
        async (t, holder, steps) => {
          const made = await createRole(org, t, r.parentRoleId, holder);
          steps.push(made.step);
          return made.id;
        },
        false,
      );
    return roleForm(
      `New role above ${r.title}`,
      at,
      async (t, holder, steps) => {
        const made = await createRole(org, t, r.parentRoleId, holder);
        steps.push(made.step);
        steps.push(await setParent(r, made.id));
        return made.id;
      },
      false,
    );
  };

  const rename = (id: string, at: Point) => {
    const r = role(id);
    if (!r) return;
    ctx.open(
      at,
      <RenameForm
        value={r.title}
        onCancel={ctx.close}
        onSubmit={async (to) => {
          if (!to.trim() || to.trim() === r.title) return ctx.close();
          if (await ctx.run(() => renameRole(r, to))) ctx.close();
        }}
      />,
    );
  };

  return {
    quickLabels: {
      before: "Add a role above",
      after: "Add a role reporting to this one",
      beside: "Add a role alongside",
    },
    howTo: [
      "Drag from a dot on a manager's box to the role that reports to them.",
      "Select a box and use its + buttons to add a role above, a report below, or a peer alongside.",
      "Double-click empty space to add a role or a note there; double-click a box to rename it.",
    ],
    addItems: [
      {
        label: "Role",
        open: (at) =>
          roleForm(
            "New role",
            at,
            async (t, holder, steps) => {
              const made = await createRole(org, t, null, holder);
              steps.push(made.step);
              return made.id;
            },
            false,
          ),
      },
    ],
    connect: (from, to, at) => {
      const manager = role(from);
      if (!manager) return;
      if (!to)
        return roleForm(
          `New role reporting to ${manager.title}`,
          at,
          async (t, holder, steps) => {
            const made = await createRole(org, t, manager.id, holder);
            steps.push(made.step);
            return made.id;
          },
          true,
        );
      const report = role(to);
      if (!report || report.id === manager.id) return;
      if (report.parentRoleId === manager.id) {
        ctx.select({ kind: "edge", id: `tree-${report.id}` });
        return ctx.notice(`${report.title} already reports to ${manager.title}.`);
      }
      const problem = reportingProblem(org, report.id, manager.id);
      ctx.open(
        at,
        <ReportsForm
          report={report.title}
          manager={manager.title}
          currently={report.parentRoleId ? title(report.parentRoleId) : null}
          problem={problem}
          onCancel={ctx.close}
          onReports={async () => {
            if (await ctx.run(() => setParent(report, manager.id))) ctx.close();
          }}
          onDotted={async () => {
            if (await ctx.run(async () => (await addLine(org, report.id, manager.id)).step))
              ctx.close();
          }}
        />,
      );
    },
    quickAdd,
    createAt: (at) =>
      ctx.open(
        at,
        <HereForm
          kinds={[
            { id: "record", label: "Role" },
            { id: "note", label: "Note" },
          ]}
          onCancel={ctx.close}
          onSubmit={async (what, text) => {
            if (what === "note") {
              const made = addNote(text, at);
              ctx.change(made.op, "Add note");
              ctx.select({ kind: "note", id: made.id });
              return ctx.close();
            }
            let id: string | null = null;
            const ok = await ctx.run(async () => {
              const made = await createRole(org, text, null);
              id = made.id;
              return made.step;
            });
            // The first box on an empty chart is laid out with the rest, not pinned.
            if (ok && id && ctx.composition.nodes.length) ctx.place(id, at);
            if (ok) ctx.close();
          }}
        />,
      ),
    rename,
    remove: (selection) => {
      if (selection.kind === "edge") {
        if (selection.id.startsWith("tree-")) {
          const r = role(selection.id.slice(5));
          if (r) void ctx.run(() => setParent(r, null)).then((ok) => ok && ctx.select(NOTHING));
        } else if (selection.id.startsWith("line-")) {
          const line = org.lines.find((l) => l.id === selection.id.slice(5));
          if (line)
            void ctx.run(() => removeLine(org, line)).then((ok) => ok && ctx.select(NOTHING));
        }
        return;
      }
      if (selection.kind !== "nodes") return;
      if (selection.ids.length !== 1) return ctx.notice("Delete roles one at a time.");
      const r = role(selection.ids[0]!);
      if (r) page.deleteRole(r);
    },
    nodeTitle: title,
    nodeActions: (ids) => {
      if (ids.length !== 1) return null;
      const r = role(ids[0]!);
      if (!r) return null;
      const at = besideNode(ctx, r.id);
      return (
        <>
          <Button onClick={() => rename(r.id, at)}>Rename</Button>
          <Button onClick={() => quickAdd(r.id, "after", at)}>Add report</Button>
          <Button variant="quiet" onClick={() => page.openRole(r.id)}>
            Edit role…
          </Button>
          <Button variant="quiet" onClick={() => page.deleteRole(r)}>
            Delete role
          </Button>
        </>
      );
    },
    edgeTitle: (id) => {
      if (id.startsWith("tree-")) {
        const r = role(id.slice(5));
        return r?.parentRoleId
          ? `${r.title} reports to ${title(r.parentRoleId)}`
          : "Reporting line";
      }
      const line = org.lines.find((l) => `line-${l.id}` === id);
      return line ? `${title(line.roleId)} ⇢ ${title(line.toRoleId)}` : "Dotted line";
    },
    edgeFields: (id) => {
      if (id.startsWith("tree-"))
        return (
          <p className="oe-hint">
            To record when this line started and the minute behind it, use Edit role on the report.
          </p>
        );
      const line = org.lines.find((l) => `line-${l.id}` === id);
      if (!line) return null;
      return (
        <Section title="Functional line">
          <CommitInput
            label="What the line is for"
            value={line.note}
            placeholder="e.g. Budget sign-off"
            onCommit={(note) => void ctx.run(() => setLineNote(line, note))}
          />
        </Section>
      );
    },
  };
}

/* ================================================================== forms */

type Planned = { id: string; title: string }[];

function PlanSelect({
  planned,
  value,
  onChange,
}: {
  planned: Planned;
  value: string;
  onChange: (v: string) => void;
}) {
  if (!planned.length) return null;
  return (
    <label className="oe-field">
      <span>Part of</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">The structure in force</option>
        {planned.map((c) => (
          <option key={c.id} value={c.id}>
            Planned: {c.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function useShare() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const read = () => {
    const share = parseShare(text);
    if (share === "invalid") {
      setError("A share is more than 0% and no more than 100%.");
      return undefined;
    }
    setError(null);
    return share;
  };
  return { text, setText, error, read };
}

function ShareForm({
  holder,
  company,
  planned,
  onSubmit,
  onCancel,
}: {
  holder: string;
  company: string;
  planned: Planned;
  onSubmit: (share: number | null, proposal: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const share = useShare();
  const [plan, setPlan] = useState(planned[0]?.id ?? "");
  return (
    <Pop
      title={
        <>
          <strong>{holder}</strong> holds shares in <strong>{company}</strong>
        </>
      }
      submit="Add shareholding"
      onCancel={onCancel}
      onSubmit={async () => {
        const value = share.read();
        if (value === undefined) return;
        await onSubmit(value, plan || null);
      }}
    >
      <ShareInput value={share.text} onChange={share.setText} />
      <PlanSelect planned={planned} value={plan} onChange={setPlan} />
      {share.error && <p className="oe-error">{share.error}</p>}
      <p className="oe-hint">Leave the share blank if it is not known yet.</p>
    </Pop>
  );
}

function CompanyForm({
  heading,
  withShare,
  suggestions,
  planned,
  onSubmit,
  onCancel,
}: {
  heading: string;
  withShare: boolean;
  suggestions: string[];
  planned: Planned;
  onSubmit: (name: string, share: number | null, proposal: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const share = useShare();
  const [plan, setPlan] = useState(planned[0]?.id ?? "");
  return (
    <Pop
      title={heading}
      onCancel={onCancel}
      onSubmit={async () => {
        if (!name.trim()) return setError("Name the company.");
        const value = withShare ? share.read() : null;
        if (value === undefined) return;
        await onSubmit(name.trim(), value, plan || null);
      }}
    >
      <NameInput
        label="Company"
        value={name}
        onChange={setName}
        suggestions={suggestions}
        placeholder="e.g. Rimac Group"
      />
      {withShare && <ShareInput value={share.text} onChange={share.setText} />}
      <PlanSelect planned={planned} value={plan} onChange={setPlan} />
      {(error || share.error) && <p className="oe-error">{error ?? share.error}</p>}
    </Pop>
  );
}

function ShareholderForm({
  company,
  suggestions,
  planned,
  onSubmit,
  onCancel,
}: {
  company: string;
  suggestions: string[];
  planned: Planned;
  onSubmit: (
    name: string,
    kind: "company" | "person" | "outside",
    share: number | null,
    proposal: string | null,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"company" | "person" | "outside">("company");
  const [error, setError] = useState<string | null>(null);
  const share = useShare();
  const [plan, setPlan] = useState(planned[0]?.id ?? "");
  return (
    <Pop
      title={
        <>
          New shareholder of <strong>{company}</strong>
        </>
      }
      onCancel={onCancel}
      onSubmit={async () => {
        if (!name.trim()) return setError("Name the shareholder.");
        const value = share.read();
        if (value === undefined) return;
        await onSubmit(name.trim(), kind, value, plan || null);
      }}
    >
      <Choice
        label="Kind of shareholder"
        value={kind}
        onChange={setKind}
        options={[
          { id: "company", label: "Company" },
          { id: "person", label: "Person" },
          { id: "outside", label: "Outside the group" },
        ]}
      />
      <NameInput
        label="Name"
        value={name}
        onChange={setName}
        suggestions={suggestions}
        placeholder={kind === "outside" ? "e.g. Other investors" : "e.g. Porsche"}
      />
      <ShareInput value={share.text} onChange={share.setText} />
      <PlanSelect planned={planned} value={plan} onChange={setPlan} />
      {(error || share.error) && <p className="oe-error">{error ?? share.error}</p>}
    </Pop>
  );
}

function RenameForm({
  value,
  onSubmit,
  onCancel,
}: {
  value: string;
  onSubmit: (next: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(value);
  return (
    <Pop title="Rename" submit="Rename" onCancel={onCancel} onSubmit={() => onSubmit(name)}>
      <label className="oe-field">
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
      </label>
    </Pop>
  );
}

function HereForm({
  kinds,
  onSubmit,
  onCancel,
}: {
  kinds: { id: "record" | "note"; label: string }[];
  onSubmit: (what: "record" | "note", text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [what, setWhat] = useState<"record" | "note">("record");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Pop
      title="Add here"
      onCancel={onCancel}
      onSubmit={async () => {
        if (!text.trim()) return setError(what === "note" ? "Write the note." : "Give it a name.");
        await onSubmit(what, text.trim());
      }}
    >
      <label className="oe-field">
        <span>{what === "note" ? "Note" : "Name"}</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={what === "note" ? "e.g. DK + partners" : ""}
        />
      </label>
      <Choice label="What to add" value={what} onChange={setWhat} options={kinds} />
      {error && <p className="oe-error">{error}</p>}
    </Pop>
  );
}

function RoleForm({
  heading,
  people,
  onSubmit,
  onCancel,
}: {
  heading: string;
  people: string[];
  onSubmit: (title: string, holder: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [t, setT] = useState("");
  const [holder, setHolder] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Pop
      title={heading}
      onCancel={onCancel}
      onSubmit={async () => {
        if (!t.trim()) return setError("Name the role.");
        await onSubmit(t.trim(), holder.trim());
      }}
    >
      <label className="oe-field">
        <span>Role</span>
        <input
          value={t}
          onChange={(e) => setT(e.target.value)}
          placeholder="e.g. Country Manager"
        />
      </label>
      <NameInput
        label="Held by (optional)"
        value={holder}
        onChange={setHolder}
        suggestions={people}
        placeholder="Leave blank if vacant"
      />
      {error && <p className="oe-error">{error}</p>}
    </Pop>
  );
}

function ReportsForm({
  report,
  manager,
  currently,
  problem,
  onReports,
  onDotted,
  onCancel,
}: {
  report: string;
  manager: string;
  currently: string | null;
  problem: string | null;
  onReports: () => Promise<void>;
  onDotted: () => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <Pop
      title={
        <>
          <strong>{report}</strong> and <strong>{manager}</strong>
        </>
      }
      submit={problem ? "Dotted line" : `Reports to ${manager}`}
      onCancel={onCancel}
      onSubmit={problem ? onDotted : onReports}
      extra={problem ? undefined : <Button onClick={() => void onDotted()}>Dotted line</Button>}
    >
      {problem ? (
        <p className="oe-error">{problem} A dotted functional line can still be drawn.</p>
      ) : (
        <p className="oe-hint">
          {currently ? `${report} reports to ${currently} now. ` : ""}Choose a reporting line, or a
          dotted functional line.
        </p>
      )}
    </Pop>
  );
}
