/**
 * Presets — the workspace's reusable matter structures.
 *
 * The library lists variants, because a variant is the thing that gets applied
 * to a matter. The family it belongs to is a column, and the board view groups
 * by it, so "Gold Transaction Safeguard" reads as a set without needing a
 * second kind of list. Everything else — table, board, cards, columns, search,
 * saved views, the actions menu — is the shared Library, the same as Contract
 * Review and every other collection in Scripta.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/store/app";
import AppShell, { Crumbs } from "@/components/AppShell";
import Library, { type LibColumn, type LibView } from "@/components/Library";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { archiveLabel, archiveVerb, setArchived } from "@/lib/archive";
import { binCountdown, deleteForever, moveToBin, restoreFromBin } from "@/lib/trash";
import { Modal } from "@/wireframe/screens";
import { C, mono } from "@/lib/tokens";
import { relTime } from "@/lib/home-data";
import type { DeliverableKind } from "../model";
import { FLOW, plural } from "../ui";
import {
  createFamily,
  createPreset,
  errorMessage,
  listPresetLibrary,
  listPresetRows,
  presetsQueryKey,
  updateFamily,
  type PresetRowView,
} from "./db";
import { presetShape } from "./model";
import "./presets.css";

const rowsQueryKey = (workspaceId: string | null) => ["flow-preset-rows", workspaceId];

/** When this variant went to Recently Deleted — on its own, or with its family. */
const binnedAt = (r: PresetRowView) => r.deletedAt ?? r.familyDeletedAt;

/** Naming a variant, and the family it belongs to. New families start here. */
function NewPresetDialog({
  families,
  onClose,
  onSave,
}: {
  families: { id: string; name: string }[];
  onClose: () => void;
  onSave: (input: {
    familyId: string | null;
    familyName: string;
    name: string;
    summary: string;
    kind: DeliverableKind;
  }) => void;
}) {
  const NEW = "__new__";
  const [familyId, setFamilyId] = useState(families[0]?.id ?? NEW);
  const [familyName, setFamilyName] = useState("");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [kind, setKind] = useState<DeliverableKind>("document");
  const newFamily = familyId === NEW;
  const ready = name.trim() && (!newFamily || familyName.trim());
  return (
    <Modal open onClose={onClose} label="New preset">
      <form
        className="mf-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          onSave({
            familyId: newFamily ? null : familyId,
            familyName: familyName.trim(),
            name: name.trim(),
            summary: summary.trim(),
            kind,
          });
          onClose();
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>New preset</div>
        <div style={{ color: FLOW.grey, fontSize: 12.5, lineHeight: 1.5 }}>
          A family is a kind of work, "Gold Transaction Safeguard". A variant is how that work is
          actually structured this time.
        </div>
        <label className="mf-field">
          Kind of work
          <select value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
            <option value={NEW}>New family…</option>
          </select>
        </label>
        {newFamily && (
          <label className="mf-field">
            Family name
            <input
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Gold Transaction Safeguard"
              autoFocus
              required
            />
          </label>
        )}
        <label className="mf-field">
          Variant
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Spot sale, refining in country"
            autoFocus={!newFamily}
            required
          />
        </label>
        <label className="mf-field">
          When to reach for it
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <div role="radiogroup" aria-label="Kind" style={{ display: "flex", gap: 6 }}>
          {(["document", "action"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={`mf-filter-chip${kind === k ? " is-on" : ""}`}
              onClick={() => setKind(k)}
            >
              {k === "document" ? "Mostly documents" : "Mostly actions"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <div style={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!ready}>
            Create preset
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RenameFamilyDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: { name: string; description: string };
  onClose: () => void;
  onSave: (input: { name: string; description: string }) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  return (
    <Modal open onClose={onClose} label="Edit family">
      <form
        className="mf-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSave({ name: name.trim(), description: description.trim() });
          onClose();
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>Edit family</div>
        <label className="mf-field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label className="mf-field">
          What this kind of work is
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <div style={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function PresetsLibrary() {
  const { workspaceId } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<PresetRowView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useQuery({
    queryKey: rowsQueryKey(workspaceId),
    queryFn: () => listPresetRows(workspaceId!),
    enabled: !!workspaceId,
    retry: false,
  });
  const families = useQuery({
    queryKey: presetsQueryKey(workspaceId),
    queryFn: () => listPresetLibrary(workspaceId!),
    enabled: !!workspaceId,
    retry: false,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: rowsQueryKey(workspaceId) });
    await queryClient.invalidateQueries({ queryKey: presetsQueryKey(workspaceId) });
  };

  const open = (row: PresetRowView) =>
    void navigate({ to: "/matters/flow/presets/$presetId", params: { presetId: row.id } });

  /** Out of the active workspace, and back again. Reversible, so it does not ask. */
  const archive = async (targets: PresetRowView[], archived: boolean) => {
    if (!targets.length) return;
    setNotice(null);
    try {
      await setArchived(
        "flow_presets",
        targets.map((r) => r.id),
        archived,
      );
      await refresh();
    } catch (error) {
      setNotice(`That preset could not be ${archiveVerb(archived)}. ${errorMessage(error)}`);
    }
  };

  const remove = async (targets: PresetRowView[]) => {
    if (!targets.length) return;
    const what = targets.length === 1 ? `“${targets[0]!.name}”` : `${targets.length} presets`;
    if (!(await confirmDelete({ what, count: targets.length }))) return;
    setNotice(null);
    try {
      await moveToBin(
        "flow_presets",
        targets.map((row) => row.id),
      );
      await refresh();
    } catch (error) {
      setNotice(`${what} could not be deleted. ${errorMessage(error)}`);
    }
  };

  /**
   * Out of Recently Deleted. A variant that went with its family brings the
   * family back with it, or it would come back to a family that is still binned
   * and stay invisible.
   */
  const restore = async (targets: PresetRowView[]) => {
    if (!targets.length) return;
    const what = targets.length === 1 ? `“${targets[0]!.name}”` : `${targets.length} presets`;
    setNotice(null);
    try {
      const families = [
        ...new Set(targets.filter((r) => r.familyDeletedAt).map((r) => r.familyId)),
      ];
      if (families.length) await restoreFromBin("flow_preset_families", families);
      await restoreFromBin(
        "flow_presets",
        targets.filter((r) => r.deletedAt).map((r) => r.id),
      );
      await refresh();
    } catch (error) {
      setNotice(`${what} could not be restored. ${errorMessage(error)}`);
    }
  };

  /** Before the fifteen days are up. The variant goes; its family is left alone. */
  const removeForGood = async (targets: PresetRowView[]) => {
    if (!targets.length) return;
    const what = targets.length === 1 ? `“${targets[0]!.name}”` : `${targets.length} presets`;
    if (!(await confirmDelete({ what, count: targets.length, binned: false }))) return;
    setNotice(null);
    try {
      await deleteForever(
        "flow_presets",
        targets.map((row) => row.id),
      );
      await refresh();
    } catch (error) {
      setNotice(`${what} could not be deleted. ${errorMessage(error)}`);
    }
  };

  /**
   * Deleting a family takes its variants, so both go to the bin — each variant
   * on its own `deleted_at`, so each can be restored or removed for good from
   * Recently Deleted like any other row.
   */
  const removeFamily = async (row: PresetRowView) => {
    const siblings = (rows.data ?? []).filter((r) => r.familyId === row.familyId);
    if (
      !(await confirmDelete({
        what: `the family “${row.familyName}”`,
        consequence:
          siblings.length > 1
            ? `All ${siblings.length} variants in it go too.`
            : "Its variant goes too.",
      }))
    )
      return;
    setNotice(null);
    try {
      await moveToBin(
        "flow_presets",
        siblings.map((r) => r.id),
      );
      await moveToBin("flow_preset_families", [row.familyId]);
      await refresh();
    } catch (error) {
      setNotice(`That family could not be deleted. ${errorMessage(error)}`);
    }
  };

  const create = async (input: {
    familyId: string | null;
    familyName: string;
    name: string;
    summary: string;
    kind: DeliverableKind;
  }) => {
    setNotice(null);
    try {
      const familyId = input.familyId ?? (await createFamily(workspaceId!, input.familyName)).id;
      const created = await createPreset(workspaceId!, {
        familyId,
        name: input.name,
        summary: input.summary,
        kind: input.kind,
      });
      await refresh();
      void navigate({
        to: "/matters/flow/presets/$presetId",
        params: { presetId: created.id },
      });
    } catch (error) {
      setNotice(`That preset could not be created. ${errorMessage(error)}`);
    }
  };

  const columns: LibColumn<PresetRowView>[] = [
    {
      key: "name",
      label: "Variant",
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, color: C.text }}>{r.name}</span>
          {binnedAt(r) && (
            <div style={{ color: C.muted, fontSize: 11.5 }}>{binCountdown(binnedAt(r)!)}</div>
          )}
        </div>
      ),
      value: (r) => r.name.toLowerCase(),
    },
    {
      key: "family",
      label: "Kind of work",
      width: 200,
      render: (r) => <span style={{ color: C.body }}>{r.familyName}</span>,
      value: (r) => r.familyName.toLowerCase(),
    },
    {
      key: "phases",
      label: "Phases",
      width: 84,
      render: (r) => (
        <span style={{ fontFamily: mono, fontSize: 11.5, color: C.muted }}>
          {presetShape(r.body).phases}
        </span>
      ),
      value: (r) => presetShape(r.body).phases,
    },
    {
      key: "owes",
      label: "Owes",
      width: 150,
      render: (r) => {
        const shape = presetShape(r.body);
        return (
          <span style={{ color: C.muted, fontSize: 11.5 }}>
            {[
              shape.documents ? plural(shape.documents, "document") : null,
              shape.actions ? plural(shape.actions, "action") : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </span>
        );
      },
      value: (r) => presetShape(r.body).documents + presetShape(r.body).actions,
    },
    {
      key: "uploads",
      label: "Uploads expected",
      width: 130,
      defaultOff: true,
      render: (r) => (
        <span style={{ fontFamily: mono, fontSize: 11.5, color: C.muted }}>
          {presetShape(r.body).uploads || "—"}
        </span>
      ),
      value: (r) => presetShape(r.body).uploads,
    },
    {
      key: "span",
      label: "Span",
      width: 120,
      render: (r) => {
        const span = presetShape(r.body).span;
        return (
          <span style={{ color: C.muted, fontSize: 11.5 }}>
            {span ? plural(span, "working day") : "—"}
          </span>
        );
      },
      value: (r) => presetShape(r.body).span,
    },
    {
      key: "updated",
      label: "Updated",
      width: 120,
      render: (r) => <span style={{ color: C.muted }}>{relTime(r.updatedAt)}</span>,
      value: (r) => r.updatedAt,
    },
  ];

  // Archived presets show only under Archived, as on Matters. A variant inside
  // an archived family is put aside with it, and one inside a deleted family is
  // in the bin with it — which is not the same thing, so it leaves Archived too.
  const live = (r: PresetRowView) => !r.archivedAt && !r.familyArchivedAt && !binnedAt(r);
  const views: LibView<PresetRowView>[] = [
    { key: "All", label: "All", filter: live },
    {
      key: "Documents",
      label: "Mostly documents",
      filter: (r) => live(r) && r.kind === "document",
    },
    { key: "Actions", label: "Mostly actions", filter: (r) => live(r) && r.kind === "action" },
    { key: "Empty", label: "Not built yet", filter: (r) => live(r) && !presetShape(r.body).phases },
    { key: "Archived", label: "Archived", filter: (r) => !live(r) && !binnedAt(r) },
    { key: "Deleted", label: "Recently Deleted", filter: (r) => !!binnedAt(r) },
  ];

  const familyNames = [...new Set((rows.data ?? []).map((r) => r.familyName))].sort();
  const loadError = rows.error ? errorMessage(rows.error) : null;

  return (
    <AppShell
      section="matter-flow"
      scroll={false}
      back={{ label: "Flow", href: "/matters/flow" }}
      breadcrumb={<Crumbs items={[{ label: "Flow", to: "/matters/flow" }, { label: "Presets" }]} />}
      assistant={{
        key: "matter-flow",
        label: "Presets",
        screen: "Flow presets",
        suggestions: [
          "Which preset fits a gold transaction with an offshore refiner?",
          "What does the safeguard preset require before shipment?",
        ],
      }}
    >
      {(notice || loadError) && (
        <div role="alert" style={{ padding: "8px 20px", color: C.red, fontSize: 12.5 }}>
          {notice ?? `The preset library could not be read. ${loadError}`}
        </div>
      )}
      <Library
        storageKey="flow-presets"
        title="Presets"
        description="How a kind of work is run: the phases it moves through, what each phase owes, the uploads it expects and the roles it needs. Apply one to a matter and its flow is laid out with real dates."
        rows={rows.data ?? []}
        columns={columns}
        views={views}
        searchText={(r) => [r.name, r.familyName, r.summary].join(" ")}
        searchPlaceholder="Search presets"
        rowLabel={(r) => r.name}
        onOpen={open}
        primary={{ label: "New preset", onClick: () => setCreating(true) }}
        actions={(r) =>
          binnedAt(r)
            ? [
                { label: "Restore", onClick: () => void restore([r]) },
                { label: "Delete for good", danger: true, onClick: () => void removeForGood([r]) },
              ]
            : [
                { label: "Open", onClick: () => open(r) },
                { label: "Edit family", onClick: () => setRenaming(r) },
                {
                  label: archiveLabel(!!r.archivedAt),
                  onClick: () => void archive([r], !r.archivedAt),
                },
                { label: "Delete", danger: true, onClick: () => void remove([r]) },
                { label: "Delete family", danger: true, onClick: () => void removeFamily(r) },
              ]
        }
        bulk={(view) =>
          view === "Deleted"
            ? [
                { label: "Restore", onClick: (rows) => void restore(rows) },
                {
                  label: "Delete for good",
                  danger: true,
                  onClick: (rows) => void removeForGood(rows),
                },
              ]
            : [
                { label: "Archive", onClick: (targets) => void archive(targets, true) },
                { label: "Restore", onClick: (targets) => void archive(targets, false) },
                { label: "Delete", danger: true, onClick: (targets) => void remove(targets) },
              ]
        }
        board={{
          columns: familyNames,
          column: (r) => r.familyName,
          card: (r) => <PresetCard row={r} />,
        }}
        cards={(r) => <PresetCard row={r} />}
        detail={(r) => <PresetDetail row={r} onOpen={() => open(r)} />}
        empty={
          <>
            <h3>No presets yet</h3>
            <p>
              Start one for a kind of work you do more than once, or open a matter whose flow
              already reads the way you want and save it as a preset from there.
            </p>
          </>
        }
      />
      {creating && (
        <NewPresetDialog
          families={(families.data ?? [])
            .filter((f) => !f.archivedAt)
            .map((f) => ({ id: f.id, name: f.name }))}
          onClose={() => setCreating(false)}
          onSave={(input) => void create(input)}
        />
      )}
      {renaming && (
        <RenameFamilyDialog
          initial={{ name: renaming.familyName, description: renaming.familyDescription }}
          onClose={() => setRenaming(null)}
          onSave={(input) => {
            const id = renaming.familyId;
            setNotice(null);
            void updateFamily(id, input)
              .then(refresh)
              .catch((error) =>
                setNotice(`That family could not be renamed. ${errorMessage(error)}`),
              );
          }}
        />
      )}
      {confirmDialog}
    </AppShell>
  );
}

function PresetCard({ row }: { row: PresetRowView }) {
  const shape = presetShape(row.body);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontWeight: 600, color: C.text }}>{row.name}</div>
      <div style={{ color: C.muted, fontSize: 11.5 }}>{row.familyName}</div>
      {row.summary && (
        <div style={{ color: C.body, fontSize: 12, lineHeight: 1.5 }}>{row.summary}</div>
      )}
      <div style={{ color: C.muted, fontSize: 11.5 }}>
        {[
          plural(shape.phases, "phase"),
          shape.documents ? plural(shape.documents, "document") : null,
          shape.actions ? plural(shape.actions, "action") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </div>
  );
}

function PresetDetail({ row, onOpen }: { row: PresetRowView; onOpen: () => void }) {
  const shape = presetShape(row.body);
  const facts: [string, string][] = [
    ["Kind of work", row.familyName],
    ["Phases", String(shape.phases)],
    ["Documents", String(shape.documents)],
    ["Actions", String(shape.actions)],
    ["Uploads expected", String(shape.uploads)],
    ["Span", shape.span ? plural(shape.span, "working day") : "—"],
    ["Roles", String(row.body.parties.length)],
  ];
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{row.name}</h2>
        {row.summary && (
          <p style={{ margin: "6px 0 0", color: C.body, fontSize: 12.5, lineHeight: 1.55 }}>
            {row.summary}
          </p>
        )}
      </div>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt style={{ color: C.muted, fontSize: 11 }}>{k}</dt>
            <dd style={{ margin: 0, fontSize: 12.5 }}>{v}</dd>
          </div>
        ))}
      </dl>
      <Button variant="primary" onClick={onOpen}>
        Open preset
      </Button>
    </div>
  );
}
