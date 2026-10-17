/**
 * The two places a matter meets the preset library: laying a preset onto this
 * matter's flow, and saving this matter's flow back as one.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/store/app";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import type { MatterFlowRecord } from "../model";
import { FLOW, TintChip, fmtDay, plural } from "../ui";
import {
  createFamily,
  createPreset,
  errorMessage,
  listPresetLibrary,
  presetsQueryKey,
} from "./db";
import { addWorkingDays, presetBodyFromFlow, presetShape, type ApplyOptions, type PresetBody } from "./model";
import "../matter-flow.css";
import "./presets.css";

function usePresetLibrary() {
  const { workspaceId } = useApp();
  const query = useQuery({
    queryKey: presetsQueryKey(workspaceId),
    queryFn: () => listPresetLibrary(workspaceId!),
    enabled: !!workspaceId,
    retry: false,
  });
  return { workspaceId, ...query };
}

/* ---------------------------------------------------------------- apply */

export function ApplyPresetDialog({
  open,
  today,
  hasPhases,
  onClose,
  onApply,
}: {
  open: boolean;
  today: string;
  /** Applying onto a flow that already has phases appends; say so. */
  hasPhases: boolean;
  onClose: () => void;
  onApply: (body: PresetBody, options: ApplyOptions) => void;
}) {
  const { data, isLoading, error: loadError } = usePresetLibrary();
  const families = useMemo(() => (data ?? []).filter((f) => f.variants.length > 0), [data]);
  const [familyId, setFamilyId] = useState("");
  const [presetId, setPresetId] = useState("");
  const [start, setStart] = useState(today);
  const [withParties, setWithParties] = useState(true);

  const family = families.find((f) => f.id === familyId) ?? families[0] ?? null;
  const preset = family?.variants.find((v) => v.id === presetId) ?? family?.variants[0] ?? null;
  const shape = preset ? presetShape(preset.body) : null;

  return (
    <Modal open={open} onClose={onClose} label="Start from a preset">
      <form
        className="mf-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!preset) return;
          onApply(preset.body, { start, withParties });
          onClose();
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>Start from a preset</div>

        {isLoading && <div style={{ color: FLOW.muted, fontSize: 12.5 }}>Loading presets…</div>}

        {loadError && (
          <div className="mf-preset-error" role="alert">
            The preset library could not be read. {errorMessage(loadError)}
          </div>
        )}

        {!isLoading && !loadError && families.length === 0 && (
          <div style={{ color: FLOW.grey, fontSize: 12.5, lineHeight: 1.55 }}>
            There are no presets with a structure in them yet. Build one under Flow › Presets, or
            set this matter's phases up by hand and save them as a preset afterwards.
          </div>
        )}

        {family && preset && (
          <>
            <label className="mf-field">
              Kind of work
              <select
                value={family.id}
                onChange={(e) => {
                  setFamilyId(e.target.value);
                  setPresetId("");
                }}
              >
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mf-field">
              Variant
              <select value={preset.id} onChange={(e) => setPresetId(e.target.value)}>
                {family.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            {preset.summary && (
              <div style={{ color: FLOW.grey, fontSize: 12, lineHeight: 1.5 }}>
                {preset.summary}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <TintChip tint="grey">{plural(shape!.phases, "phase")}</TintChip>
              {shape!.documents > 0 && (
                <TintChip tint="grey">{plural(shape!.documents, "document")}</TintChip>
              )}
              {shape!.actions > 0 && (
                <TintChip tint="grey">{plural(shape!.actions, "action")}</TintChip>
              )}
              {shape!.uploads > 0 && <TintChip tint="amber">{shape!.uploads} uploads expected</TintChip>}
            </div>
            <label className="mf-field" style={{ width: 210 }}>
              Matter start
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            <div style={{ color: FLOW.muted, fontSize: 11.5 }}>
              Every date is set from here. The last phase would be due{" "}
              {fmtDay(addWorkingDays(start, shape!.span), true)}.
            </div>
            {preset.body.parties.length > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <input
                  type="checkbox"
                  checked={withParties}
                  onChange={(e) => setWithParties(e.target.checked)}
                />
                Bring in the {plural(preset.body.parties.length, "party role")}, unnamed
              </label>
            )}
            {hasPhases && (
              <div style={{ color: FLOW.grey, fontSize: 12, lineHeight: 1.5 }}>
                This matter already has phases. The preset's phases are added after them; nothing
                already on the flow is touched.
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <div style={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!preset || !start}>
            Apply preset
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ----------------------------------------------------------------- save */

const NEW_FAMILY = "__new__";

export function SavePresetDialog({
  open,
  record,
  matterName,
  onClose,
  onSaved,
}: {
  open: boolean;
  record: MatterFlowRecord;
  matterName: string;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const { data, workspaceId } = usePresetLibrary();
  const queryClient = useQueryClient();
  const families = data ?? [];
  const [familyId, setFamilyId] = useState<string>(NEW_FAMILY);
  const [familyName, setFamilyName] = useState("");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);

  const body = useMemo(() => presetBodyFromFlow(record), [record]);
  const shape = presetShape(body);
  const newFamily = familyId === NEW_FAMILY;
  const canSave =
    !!workspaceId && name.trim().length > 0 && (!newFamily || familyName.trim().length > 0);

  const save = useMutation({
    mutationFn: async () => {
      const family = newFamily
        ? await createFamily(workspaceId!, familyName)
        : families.find((f) => f.id === familyId)!;
      await createPreset(workspaceId!, {
        familyId: family.id,
        name: name.trim(),
        summary: summary.trim(),
        kind: record.kind,
        body,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: presetsQueryKey(workspaceId) });
      onSaved(name.trim());
      onClose();
    },
    onError: (cause: unknown) => setError(errorMessage(cause, "The preset did not save.")),
  });

  return (
    <Modal open={open} onClose={onClose} label="Save this flow as a preset">
      <form
        className="mf-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save.mutate();
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>Save this flow as a preset</div>
        <div style={{ color: FLOW.grey, fontSize: 12.5, lineHeight: 1.55 }}>
          The structure of {matterName} is kept; the work is not. No versions, evidence, ticks or
          fixed dates travel — deadlines become working days from the matter start.
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <TintChip tint="grey">{plural(shape.phases, "phase")}</TintChip>
          {shape.documents > 0 && <TintChip tint="grey">{plural(shape.documents, "document")}</TintChip>}
          {shape.actions > 0 && <TintChip tint="grey">{plural(shape.actions, "action")}</TintChip>}
          {shape.uploads > 0 && <TintChip tint="amber">{shape.uploads} uploads expected</TintChip>}
        </div>

        <label className="mf-field">
          Kind of work
          <select value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
            <option value={NEW_FAMILY}>New family…</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        {newFamily && (
          <label className="mf-field">
            Family name
            <input
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Gold Transaction Safeguard"
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
            required
          />
        </label>
        <label className="mf-field">
          When to reach for it
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>

        {error && (
          <div className="mf-preset-error" role="alert">
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <div style={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!canSave || save.isPending}>
            {save.isPending ? "Saving…" : "Save preset"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
