/**
 * One variant of a preset: its phases, what each owes, the uploads it expects
 * and the roles the matter needs. Everything is edited against a draft and
 * written in one save, so a half-built structure never reaches a matter.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Paperclip, Users } from "lucide-react";
import { useApp } from "@/store/app";
import AppShell, { Crumbs } from "@/components/AppShell";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { useConfirm } from "@/components/Confirm";
import { typeLabel } from "../editor-routes";
import { isoDate, uid, type DeliverableKind } from "../model";
import { Card, Eyebrow, FLOW, LinkAction, TypeChip, fmtDay, localDay, plural } from "../ui";
import { errorMessage, getPreset, listPresetLibrary, presetsQueryKey, updatePreset } from "./db";
import {
  PartyDialog,
  PresetDeliverableDialog,
  PresetPhaseDialog,
  type PresetDeliverableInput,
  type PresetPhaseInput,
} from "./dialogs";
import {
  addWorkingDays,
  presetShape,
  type PresetBody,
  type PresetDeliverable,
  type PresetPhase,
} from "./model";
import "../matter-flow.css";
import "./presets.css";

const dayLabel = (offset: number) => (offset === 0 ? "Day 0" : `Day ${offset}`);

export default function PresetEditor({ presetId }: { presetId: string }) {
  const { workspaceId } = useApp();
  const { confirm, confirmDialog: askDialog } = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = isoDate(new Date());

  const query = useQuery({
    queryKey: ["flow-preset", presetId],
    queryFn: () => getPreset(presetId),
    retry: false,
  });
  const familiesQuery = useQuery({
    queryKey: presetsQueryKey(workspaceId),
    queryFn: () => listPresetLibrary(workspaceId!),
    enabled: !!workspaceId,
    retry: false,
  });

  const preset = query.data ?? null;
  const family = familiesQuery.data?.find((f) => f.id === preset?.familyId) ?? null;

  const [draft, setDraft] = useState<{
    name: string;
    summary: string;
    kind: DeliverableKind;
    body: PresetBody;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phaseDialog, setPhaseDialog] = useState<{ phase: PresetPhase | null } | null>(null);
  const [itemDialog, setItemDialog] = useState<{
    phase: PresetPhase;
    item: PresetDeliverable | null;
  } | null>(null);
  const [partyDialog, setPartyDialog] = useState<{ index: number | null } | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  // The draft is seeded once from the record and then owned by this screen.
  useEffect(() => {
    if (preset && !draft)
      setDraft({
        name: preset.name,
        summary: preset.summary,
        kind: preset.kind,
        body: preset.body,
      });
  }, [preset, draft]);

  const edit = (fn: (d: NonNullable<typeof draft>) => NonNullable<typeof draft>) => {
    setDraft((current) => (current ? fn(current) : current));
    setDirty(true);
  };
  const editBody = (fn: (body: PresetBody) => PresetBody) =>
    edit((d) => ({ ...d, body: fn(d.body) }));

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      await updatePreset(presetId, draft);
    },
    onSuccess: () => {
      setDirty(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["flow-preset", presetId] });
      void queryClient.invalidateQueries({ queryKey: presetsQueryKey(workspaceId) });
    },
    onError: (cause: unknown) => setError(errorMessage(cause, "The preset did not save.")),
  });

  const phases = useMemo(
    () => [...(draft?.body.phases ?? [])].sort((a, b) => a.order - b.order),
    [draft],
  );
  const shape = draft ? presetShape(draft.body) : null;

  /* ------------------------------------------------------------ phases */

  const savePhase = (input: PresetPhaseInput, existing: PresetPhase | null) =>
    editBody((body) =>
      existing
        ? {
            ...body,
            phases: body.phases.map((p) => (p.id === existing.id ? { ...p, ...input } : p)),
          }
        : {
            ...body,
            phases: [
              ...body.phases,
              {
                ...input,
                id: uid("pp"),
                order: Math.max(-1, ...body.phases.map((p) => p.order)) + 1,
              },
            ],
          },
    );

  const removePhase = (phase: PresetPhase) =>
    editBody((body) => ({
      ...body,
      phases: body.phases.filter((p) => p.id !== phase.id),
      deliverables: body.deliverables.filter((d) => d.phaseId !== phase.id),
    }));

  const movePhase = (phase: PresetPhase, delta: -1 | 1) =>
    editBody((body) => {
      const sorted = [...body.phases].sort((a, b) => a.order - b.order);
      const index = sorted.findIndex((p) => p.id === phase.id);
      const other = sorted[index + delta];
      if (index < 0 || !other) return body;
      const me = sorted[index]!;
      return {
        ...body,
        phases: body.phases.map((p) =>
          p.id === me.id
            ? { ...p, order: other.order }
            : p.id === other.id
              ? { ...p, order: me.order }
              : p,
        ),
      };
    });

  /* ------------------------------------------------------ deliverables */

  const saveItem = (
    input: PresetDeliverableInput,
    phase: PresetPhase,
    existing: PresetDeliverable | null,
  ) =>
    editBody((body) =>
      existing
        ? {
            ...body,
            deliverables: body.deliverables.map((d) =>
              d.id === existing.id ? { ...d, ...input } : d,
            ),
          }
        : {
            ...body,
            deliverables: [...body.deliverables, { ...input, id: uid("pd"), phaseId: phase.id }],
          },
    );

  const removeItem = (item: PresetDeliverable) =>
    editBody((body) => ({
      ...body,
      deliverables: body.deliverables.filter((d) => d.id !== item.id),
    }));

  const crumbs = (
    <Crumbs
      items={[
        { label: "Flow", to: "/matters/flow" },
        { label: "Presets", to: "/matters/flow/presets" },
        { label: draft?.name ?? "Preset" },
      ]}
    />
  );

  if (!draft)
    return (
      <AppShell
        section="matter-flow"
        scroll={false}
        back={{ label: "Presets", href: "/matters/flow/presets" }}
        breadcrumb={crumbs}
      >
        <div className="mf-preset-editor">
          <div style={{ color: FLOW.muted, fontSize: 12.5 }}>
            {query.isLoading ? "Loading the preset…" : "That preset is no longer there."}
          </div>
        </div>
      </AppShell>
    );

  const itemWord = draft.kind === "action" ? "action" : "deliverable";

  /** A phase takes everything owed in it, so the question counts it first. */
  const askRemovePhase = async (phase: PresetPhase) => {
    const owed = draft.body.deliverables.filter((d) => d.phaseId === phase.id).length;
    if (
      !(await confirmDelete({
        what: `“${phase.name}”`,
        consequence: owed
          ? `Everything owed in it goes too: ${plural(owed, itemWord)}.`
          : "Nothing is owed in it yet.",
        archivable: false,
        binned: false,
      }))
    )
      return;
    removePhase(phase);
    setPhaseDialog(null);
  };

  const askRemoveItem = async (item: PresetDeliverable) => {
    // Only what this item actually carries is claimed.
    const detail = [
      "Its dates",
      item.ownerRole ? "its owner" : "",
      item.expected.length ? "the uploads it expects" : "",
    ].filter(Boolean);
    if (
      !(await confirmDelete({
        what: `“${item.name}”`,
        consequence: `${detail.slice(0, -1).join(", ")}${
          detail.length > 1 ? " and " : ""
        }${detail.at(-1)} go with it.`,
        archivable: false,
        binned: false,
      }))
    )
      return;
    removeItem(item);
    setItemDialog(null);
  };

  const askRemoveParty = async (index: number) => {
    const party = draft.body.parties[index];
    if (!party) return;
    if (
      !(await confirmDelete({
        what: `“${party.role}”`,
        consequence: "Applying the preset would no longer bring that role across.",
        archivable: false,
        binned: false,
      }))
    )
      return;
    editBody((body) => ({ ...body, parties: body.parties.filter((_, i) => i !== index) }));
    setPartyDialog(null);
  };

  return (
    <AppShell
      section="matter-flow"
      scroll={false}
      back={{ label: "Presets", href: "/matters/flow/presets" }}
      breadcrumb={crumbs}
      assistant={{
        key: "matter-flow",
        label: "Presets",
        screen: `Preset — ${draft.name}`,
        suggestions: [
          "What is missing from this structure?",
          "Which phase usually slips on work like this?",
        ],
      }}
    >
      <div className="mf-preset-editor">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {family && <Eyebrow>{family.name.toUpperCase()}</Eyebrow>}
            <input
              className="mf-preset-title"
              value={draft.name}
              onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))}
              aria-label="Variant name"
            />
            <input
              className="mf-preset-summary"
              value={draft.summary}
              placeholder="When to reach for this variant"
              onChange={(e) => edit((d) => ({ ...d, summary: e.target.value }))}
              aria-label="When to reach for this variant"
            />
          </div>
          <div style={{ flex: "none", textAlign: "right" }}>
            <Eyebrow color="#6b6b6b">
              {[
                plural(shape!.phases, "phase"),
                plural(shape!.documents, "document"),
                plural(shape!.actions, "action"),
              ]
                .join(" · ")
                .toUpperCase()}
            </Eyebrow>
            {shape!.span > 0 && (
              <div style={{ color: FLOW.muted, fontSize: 11.5, marginTop: 4 }}>
                {plural(shape!.span, "working day")} · started today it would close{" "}
                {fmtDay(addWorkingDays(today, shape!.span), true)}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mf-preset-error" role="alert">
            {error}
          </div>
        )}

        {phases.length === 0 && (
          <div className="mf-preset-empty">
            <div style={{ fontSize: 15, fontWeight: 600 }}>No phases yet.</div>
            <div style={{ color: FLOW.grey, fontSize: 12.5, lineHeight: 1.55, maxWidth: 560 }}>
              Add one phase per scope-of-services item this kind of work always has, then what each
              phase owes. Dates are working days from the matter start, so the structure lands
              correctly whenever it is applied.
            </div>
            <Button variant="primary" onClick={() => setPhaseDialog({ phase: null })}>
              Add the first phase
            </Button>
          </div>
        )}

        {phases.map((phase, index) => {
          const items = draft.body.deliverables.filter((d) => d.phaseId === phase.id);
          return (
            <section key={phase.id} className="mf-preset-phase">
              <header className="mf-preset-phase-head">
                <span
                  style={{
                    flex: "none",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "#f0f0f0",
                    color: FLOW.grey,
                    font: "600 11px inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {index + 1}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{phase.name}</div>
                  {phase.description && (
                    <div style={{ color: FLOW.grey, fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>
                      {phase.description}
                    </div>
                  )}
                  {phase.steps.length > 0 && (
                    <ul
                      style={{
                        margin: "6px 0 0",
                        paddingLeft: 16,
                        color: FLOW.muted,
                        fontSize: 11.5,
                        lineHeight: 1.6,
                      }}
                    >
                      {phase.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  )}
                  {phase.note && (
                    <div className="mf-preset-note" style={{ marginTop: 7 }}>
                      {phase.note}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      color: FLOW.grey,
                      fontSize: 11.5,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <CalendarClock size={12} strokeWidth={2} /> Due {dayLabel(phase.dueOffset)}
                  </span>
                  <LinkAction
                    onClick={() => setPhaseDialog({ phase })}
                    style={{ color: FLOW.muted }}
                  >
                    Edit phase
                  </LinkAction>
                </div>
              </header>

              {items.length === 0 && (
                <div className="mf-preset-item" style={{ color: FLOW.muted }}>
                  Nothing owed in this phase yet.
                </div>
              )}
              {items.map((item) => (
                <div key={item.id} className="mf-preset-item">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}
                    >
                      <span style={{ fontWeight: 600 }}>{item.name}</span>
                      <TypeChip>{typeLabel(item)}</TypeChip>
                      {!item.mandatory && <TypeChip>Optional</TypeChip>}
                    </div>
                    {item.description && (
                      <div
                        style={{ color: FLOW.grey, fontSize: 12, lineHeight: 1.5, marginTop: 3 }}
                      >
                        {item.description}
                      </div>
                    )}
                    {item.note && (
                      <div className="mf-preset-note" style={{ marginTop: 6 }}>
                        {item.note}
                      </div>
                    )}
                    {item.expected.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                        {item.expected.map((slot) => (
                          <span key={slot} className="mf-preset-slot">
                            <Paperclip size={10} strokeWidth={2} /> {slot}
                          </span>
                        ))}
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        gap: 14,
                        color: FLOW.muted,
                        fontSize: 11.5,
                        marginTop: 7,
                      }}
                    >
                      <span>
                        {dayLabel(item.startOffset)} → {dayLabel(item.dueOffset)}
                      </span>
                      <span>{item.ownerRole || "No owner set"}</span>
                    </div>
                  </div>
                  <LinkAction
                    onClick={() => setItemDialog({ phase, item })}
                    style={{ color: FLOW.muted, flex: "none" }}
                  >
                    Edit
                  </LinkAction>
                </div>
              ))}

              <div className="mf-preset-add">
                <Button onClick={() => setItemDialog({ phase, item: null })}>
                  {draft.kind === "action" ? "Add action" : "Add deliverable"}
                </Button>
                <div style={{ flex: 1 }} />
                {index > 0 && (
                  <LinkAction onClick={() => movePhase(phase, -1)} style={{ color: FLOW.grey }}>
                    Move earlier
                  </LinkAction>
                )}
                {index < phases.length - 1 && (
                  <LinkAction onClick={() => movePhase(phase, 1)} style={{ color: FLOW.grey }}>
                    Move later
                  </LinkAction>
                )}
              </div>
            </section>
          );
        })}

        {phases.length > 0 && (
          <div>
            <Button onClick={() => setPhaseDialog({ phase: null })}>Add phase</Button>
          </div>
        )}

        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Users size={13} strokeWidth={2} color={FLOW.grey} />
            <Eyebrow>ROLES THIS MATTER NEEDS</Eyebrow>
            <div style={{ flex: 1 }} />
            <LinkAction onClick={() => setPartyDialog({ index: null })}>Add role</LinkAction>
          </div>
          {draft.body.parties.length === 0 ? (
            <div style={{ color: FLOW.muted, fontSize: 12 }}>
              No roles yet. Applying the preset would bring none across.
            </div>
          ) : (
            draft.body.parties.map((party, index) => (
              <div
                key={`${party.role}-${index}`}
                style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12.5 }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{party.role}</div>
                  {party.note && (
                    <div style={{ color: FLOW.muted, fontSize: 11.5, marginTop: 2 }}>
                      {party.note}
                    </div>
                  )}
                </div>
                <LinkAction
                  onClick={() => setPartyDialog({ index })}
                  style={{ color: FLOW.muted, flex: "none" }}
                >
                  Edit
                </LinkAction>
              </div>
            ))
          )}
        </Card>

        <div className="mf-preset-bar">
          <span style={{ color: dirty ? FLOW.orange : FLOW.muted, fontSize: 12 }}>
            {save.isPending
              ? "Saving…"
              : dirty
                ? "Unsaved changes"
                : `Saved${preset ? ` · ${fmtDay(localDay(preset.updatedAt), true)}` : ""}`}
          </span>
          <div style={{ flex: 1 }} />
          <Button
            onClick={async () => {
              if (
                !dirty ||
                (await confirm({
                  title: "Discard your changes?",
                  body: "The edits you have made to this preset go. The saved preset is untouched.",
                  confirmLabel: "Discard changes",
                }))
              )
                void navigate({ to: "/matters/flow/presets" });
            }}
          >
            Back to presets
          </Button>
          <Button
            variant="primary"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
          >
            Save preset
          </Button>
        </div>
      </div>

      {phaseDialog && (
        <PresetPhaseDialog
          open
          {...(phaseDialog.phase ? { initial: phaseDialog.phase } : {})}
          today={today}
          onClose={() => setPhaseDialog(null)}
          onSave={(input) => savePhase(input, phaseDialog.phase)}
          {...(phaseDialog.phase
            ? { onDelete: () => void askRemovePhase(phaseDialog.phase!) }
            : {})}
        />
      )}

      {itemDialog && (
        <PresetDeliverableDialog
          open
          {...(itemDialog.item ? { initial: itemDialog.item } : {})}
          defaultKind={draft.kind}
          today={today}
          phaseDueOffset={itemDialog.phase.dueOffset}
          onClose={() => setItemDialog(null)}
          onSave={(input) => saveItem(input, itemDialog.phase, itemDialog.item)}
          {...(itemDialog.item ? { onDelete: () => void askRemoveItem(itemDialog.item!) } : {})}
        />
      )}

      {partyDialog && (
        <PartyDialog
          open
          {...(partyDialog.index !== null
            ? { initial: draft.body.parties[partyDialog.index] }
            : {})}
          onClose={() => setPartyDialog(null)}
          onSave={(input) =>
            editBody((body) => ({
              ...body,
              parties:
                partyDialog.index === null
                  ? [...body.parties, input]
                  : body.parties.map((p, i) => (i === partyDialog.index ? input : p)),
            }))
          }
          {...(partyDialog.index !== null
            ? { onDelete: () => void askRemoveParty(partyDialog.index!) }
            : {})}
        />
      )}
      {confirmDialog}
      {askDialog}
    </AppShell>
  );
}
