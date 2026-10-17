/**
 * A role in the organogram: what it is called, who holds it, whom it reports
 * to, and who covers it.
 *
 * Roles, not people, carry reporting lines and authority, so a change of
 * holder is an edit to the role and leaves every rule that names it standing.
 * A role that has run its course is ended rather than deleted, which keeps it
 * in the history and in any "as at" view of the past.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { deleteRecord, insertRecord, updateRecord } from "../db";
import {
  canReportTo,
  localDay,
  ROLE_KIND_LABEL,
  type ChangeContext,
  type Organisation,
  type Role,
  type RoleKind,
} from "../model";
import {
  ChangeFields,
  EntitySelect,
  Field,
  FieldRow,
  LinkButton,
  OrgDialog,
  PersonSelect,
  RoleSelect,
  Select,
  SelectOrOther,
  TextInput,
  useOrgWrite,
} from "../ui";

export default function RoleDialog({
  org,
  role,
  open,
  onClose,
  onSaved,
  defaults,
}: {
  org: Organisation;
  role: Role | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  defaults?: { parentRoleId?: string | null; functionName?: string };
}) {
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const [title, setTitle] = useState("");
  const [holder, setHolder] = useState<string | null>(null);
  const [newPerson, setNewPerson] = useState("");
  const [addingPerson, setAddingPerson] = useState(false);
  const [acting, setActing] = useState(false);
  const [parent, setParent] = useState<string | null>(null);
  const [kind, setKind] = useState<RoleKind>("role");
  const [kindLabel, setKindLabel] = useState("");
  const [kindTyped, setKindTyped] = useState<string | null>(null);
  const [fn, setFn] = useState("");
  const [entity, setEntity] = useState<string | null>(null);
  const [newEntity, setNewEntity] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [coverNote, setCoverNote] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [lineToAdd, setLineToAdd] = useState<string | null>(null);
  const [change, setChange] = useState<ChangeContext>({});

  useEffect(() => {
    if (!open) return;
    write.setError(null);
    setTitle(role?.title ?? "");
    setHolder(role?.holderPersonId ?? null);
    setNewPerson("");
    setAddingPerson(false);
    setActing(role?.acting ?? false);
    setParent(role ? role.parentRoleId : (defaults?.parentRoleId ?? null));
    setKind(role?.kind ?? "role");
    setKindLabel(role?.kindLabel ?? "");
    setKindTyped(null);
    setFn(role?.functionName ?? defaults?.functionName ?? "");
    setEntity(role?.entityId ?? null);
    setNewEntity(null);
    setCover(role?.coverRoleId ?? null);
    setCoverNote(role?.coverNote ?? "");
    setFrom(role?.effectiveFrom ?? "");
    setTo(role?.effectiveTo ?? "");
    setLines(role ? org.lines.filter((l) => l.roleId === role.id).map((l) => l.toRoleId) : []);
    setLineToAdd(null);
    setChange({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, role?.id]);

  const functions = [
    ...new Set(org.roles.map((r) => r.functionName.trim()).filter(Boolean)),
  ].sort();
  // Kinds the client already uses in its own words, each with the tier it ranks as.
  const ownKinds = new Map<string, RoleKind>();
  for (const r of org.roles) {
    const label = r.kindLabel.trim();
    if (label && !ownKinds.has(label)) ownKinds.set(label, r.kind);
  }
  const kindOptions = [
    ...(Object.keys(ROLE_KIND_LABEL) as RoleKind[]).map((k) => ({
      value: k as string,
      label: ROLE_KIND_LABEL[k],
    })),
    ...[...ownKinds.keys()].sort().map((label) => ({ value: `own:${label}`, label })),
  ];
  const pickKind = (v: string) => {
    if (v.startsWith("own:")) {
      const label = v.slice(4);
      setKindLabel(label);
      setKind(ownKinds.get(label) ?? "role");
    } else {
      setKindLabel("");
      setKind((v || "role") as RoleKind);
    }
  };

  const invalidParent = (id: string) =>
    !!role && (id === role.id || !canReportTo(org, role.id, id));

  const save = async () => {
    if (!title.trim()) {
      write.setError("A role needs a title.");
      return;
    }
    if (kindTyped !== null && !kindTyped.trim()) {
      write.setError("Name the kind, or choose one from the list.");
      return;
    }
    if (newEntity !== null && !newEntity.trim()) {
      write.setError("Name the entity, or choose one from the list.");
      return;
    }
    if (from && to && to < from) {
      write.setError("A role cannot end before it starts.");
      return;
    }
    let savedId = role?.id ?? "";
    const ok = await write.run(async () => {
      let holderId = holder;
      if (addingPerson && newPerson.trim())
        holderId = await insertRecord(org, "org_people", { full_name: newPerson.trim() }, change);
      let entityId = entity;
      if (newEntity !== null)
        entityId = await insertRecord(org, "org_entities", { name: newEntity.trim() }, change);
      const row = {
        title: title.trim(),
        holder_person_id: holderId,
        acting: holderId ? acting : false,
        parent_role_id: parent,
        kind,
        kind_label: kindTyped !== null ? kindTyped.trim() : kindLabel,
        function_name: fn.trim(),
        entity_id: entityId,
        cover_role_id: cover,
        cover_note: cover ? coverNote.trim() : "",
        effective_from: from || null,
        effective_to: to || null,
      };
      if (role) await updateRecord("org_roles", role.id, row, change);
      else savedId = await insertRecord(org, "org_roles", row, change);
      const existing = org.lines.filter((l) => l.roleId === savedId);
      for (const l of existing)
        if (!lines.includes(l.toRoleId)) await deleteRecord("org_role_lines", l.id);
      for (const target of lines)
        if (!existing.some((l) => l.toRoleId === target))
          await insertRecord(org, "org_role_lines", { role_id: savedId, to_role_id: target });
    });
    if (ok) {
      onSaved?.(savedId);
      onClose();
    }
  };

  const endRole = async () => {
    if (!role) return;
    const on = change.on || localDay();
    const ok = await write.run(() =>
      updateRecord("org_roles", role.id, { effective_to: on }, { ...change, on }),
    );
    if (ok) onClose();
  };

  const remove = async () => {
    if (!role) return;
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
    if (ok) onClose();
  };

  return (
    <>
      <OrgDialog
        open={open}
        title={role ? `Edit ${role.title}` : "Add a role"}
        blurb="A role holds a reporting line and any authority. People hold roles, so a change of holder leaves both in place."
        onClose={onClose}
        onSubmit={save}
        submitLabel={role ? "Save role" : "Add role"}
        busy={write.busy}
        error={write.error}
        width={620}
        extra={
          role ? (
            <>
              {!role.effectiveTo && (
                <Button variant="quiet" onClick={() => void endRole()} disabled={write.busy}>
                  End role
                </Button>
              )}
              <Button variant="danger" onClick={() => void remove()} disabled={write.busy}>
                Delete
              </Button>
            </>
          ) : undefined
        }
      >
        <FieldRow>
          <Field label="Title">
            <TextInput
              value={title}
              onChange={setTitle}
              autoFocus
              placeholder="e.g. Finance Manager"
            />
          </Field>
          <Field label="Kind">
            <SelectOrOther
              value={kindLabel ? `own:${kindLabel}` : kind}
              onChange={pickKind}
              options={kindOptions}
              custom={kindTyped}
              onCustomChange={setKindTyped}
              otherLabel="Something else…"
              placeholder="e.g. Board member"
              extra={
                <Select<RoleKind>
                  value={kind}
                  onChange={(v) => setKind((v || "role") as RoleKind)}
                  options={(Object.keys(ROLE_KIND_LABEL) as RoleKind[]).map((k) => ({
                    value: k,
                    label: `Ranks as ${ROLE_KIND_LABEL[k]}`,
                  }))}
                />
              }
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field
            label="Held by"
            hint={
              <LinkButton onClick={() => setAddingPerson((v) => !v)}>
                {addingPerson ? "Choose someone recorded" : "Someone not recorded yet"}
              </LinkButton>
            }
          >
            {addingPerson ? (
              <TextInput value={newPerson} onChange={setNewPerson} placeholder="Full name" />
            ) : (
              <PersonSelect org={org} value={holder} onChange={setHolder} empty="Vacant" />
            )}
          </Field>
          <Field label="Reports to">
            <RoleSelect
              org={org}
              value={parent}
              onChange={setParent}
              empty="Nobody (top of the chart)"
              exclude={invalidParent}
            />
          </Field>
        </FieldRow>
        {(holder || (addingPerson && newPerson.trim())) && (
          <label className="og-check">
            <input type="checkbox" checked={acting} onChange={(e) => setActing(e.target.checked)} />
            Holding it in an acting capacity
          </label>
        )}
        <FieldRow>
          <Field label="Function" hint="Groups roles in the By function view">
            <input
              list="og-role-functions"
              value={fn}
              onChange={(e) => setFn(e.target.value)}
              placeholder="e.g. Finance"
            />
            <datalist id="og-role-functions">
              {functions.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Field>
          <Field label="Entity" hint="The company the role sits in, where it matters">
            <EntitySelect
              org={org}
              value={entity}
              onChange={setEntity}
              empty="Group-wide"
              custom={newEntity}
              onCustomChange={setNewEntity}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Absence cover">
            <RoleSelect
              org={org}
              value={cover}
              onChange={setCover}
              empty="None named"
              exclude={(id) => id === role?.id}
            />
          </Field>
          {cover && (
            <Field label="Cover limited to">
              <TextInput
                value={coverNote}
                onChange={setCoverNote}
                placeholder="e.g. payments only, to GHS 250k"
              />
            </Field>
          )}
        </FieldRow>
        <Field
          label="Functional (dotted) lines"
          hint="Reports on a function without changing the reporting line"
        >
          <div className="og-chips">
            {lines.map((id) => {
              const target = org.roles.find((r) => r.id === id);
              return (
                <span key={id} className="og-chip">
                  {target?.title ?? "Role"}
                  <button
                    type="button"
                    className="org-link"
                    aria-label={`Remove the line to ${target?.title ?? "this role"}`}
                    onClick={() => setLines((l) => l.filter((x) => x !== id))}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <RoleSelect
              org={org}
              value={lineToAdd}
              onChange={setLineToAdd}
              empty="Add a dotted line to…"
              exclude={(id) => id === role?.id || id === parent || lines.includes(id)}
            />
            <Button
              onClick={() => {
                if (lineToAdd) setLines((l) => [...l, lineToAdd]);
                setLineToAdd(null);
              }}
              disabled={!lineToAdd}
            >
              Add line
            </Button>
          </div>
        </Field>
        <FieldRow>
          <Field label="In place from">
            <TextInput type="date" value={from} onChange={setFrom} />
          </Field>
          <Field label="Ended on" hint="Leave blank while the role exists">
            <TextInput type="date" value={to} onChange={setTo} />
          </Field>
        </FieldRow>
        <ChangeFields value={change} onChange={setChange} />
      </OrgDialog>
      {confirmDialog}
    </>
  );
}
