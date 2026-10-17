import { useEffect, useState } from "react";
import { useFieldSaver } from "@/lib/field-saver";
import PlaybookExport from "@/components/PlaybookExport";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppShell, { Crumbs } from "@/components/AppShell";
import { Button, EmptyState } from "@/components/primitives";
import { Trash2 } from "lucide-react";
import LoadError from "@/components/LoadError";
import SaveState from "@/components/SaveState";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { byCategory } from "@/lib/playbook/issues";
import { playbookHealth } from "@/lib/playbook/health";
import "./playbook-screen.css";

type Playbook = {
  id: string;
  name: string;
  description: string | null;
  version_label: string | null;
  status: "Active" | "Draft" | "Archived";
  jurisdiction: string | null;
  agreement_type: string | null;
  team: string | null;
  effective_date: string | null;
  last_reviewed_at: string | null;
  our_role: string | null;
  approval: "Not required" | "Requested" | "Approved" | "Rejected";
};
type Rule = {
  id: string;
  playbook_id: string;
  topic: string;
  preferred: string | null;
  acceptable: string | null;
  fallback: string | null;
  redflag: string | null;
  escalate: string | null;
  approved_clause_text: string | null;
  risk_level: string | null;
  negotiation_guidance: string | null;
  commercial_rationale: string | null;
  legal_rationale: string | null;
  approval_threshold: string | null;
  jurisdiction_note: string | null;
  internal_note: string | null;
  ordinal: number | null;
};

const RULE_FIELDS: {
  key: keyof Rule;
  label: string;
  hint: string;
  tier?: string;
  rows?: number;
}[] = [
  {
    key: "preferred",
    label: "Preferred",
    hint: "The position you propose in outbound drafts.",
    tier: "P",
    rows: 3,
  },
  {
    key: "acceptable",
    label: "Acceptable",
    hint: "Alternatives you can accept without escalation.",
    tier: "A",
    rows: 2,
  },
  {
    key: "fallback",
    label: "Fallback",
    hint: "Last-resort wording after pushback.",
    tier: "F",
    rows: 2,
  },
  {
    key: "redflag",
    label: "Unacceptable",
    hint: "Language you will not accept.",
    tier: "X",
    rows: 2,
  },
  {
    key: "escalate",
    label: "Escalate if",
    hint: "Triggers that require sign-off.",
    tier: "E",
    rows: 2,
  },
  {
    key: "approved_clause_text",
    label: "Approved drafting",
    hint: "Exact clause text, ready to insert.",
    rows: 4,
  },
  { key: "negotiation_guidance", label: "Negotiation guidance", hint: "How to argue it.", rows: 2 },
  {
    key: "commercial_rationale",
    label: "Commercial rationale",
    hint: "Why the business cares.",
    rows: 2,
  },
  { key: "legal_rationale", label: "Legal rationale", hint: "Why the law cares.", rows: 2 },
  {
    key: "approval_threshold",
    label: "Approval threshold",
    hint: "Who must approve a deviation.",
    rows: 1,
  },
  {
    key: "jurisdiction_note",
    label: "Jurisdiction note",
    hint: "Variations by governing law.",
    rows: 2,
  },
  { key: "internal_note", label: "Internal note", hint: "Not shown in exports.", rows: 2 },
];
/** Standalone playbook authoring. A playbook is the controlled source of truth and
 *  belongs to the workspace, so it must be editable without opening a matter. */
export default function PlaybookEditor({
  playbookId,
  initialRuleId,
}: {
  playbookId: string;
  initialRuleId?: string;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(initialRuleId ?? null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  /* Whether anything has actually been written since this screen opened. The
     header used to say "Saved" whenever a write was not in flight, which is a
     claim about the world it had no basis for — including over a field the
     lawyer had just typed into and not yet left. */
  const [written, setWritten] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const pb = useQuery({
    queryKey: ["playbook", playbookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("playbooks")
        .select("*")
        .eq("id", playbookId)
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as Playbook;
    },
  });
  const rules = useQuery({
    queryKey: ["playbook-rules", playbookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("playbook_rules")
        .select("*")
        .eq("playbook_id", playbookId)
        .order("ordinal");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Rule[];
    },
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["playbook", playbookId] });
    await qc.invalidateQueries({ queryKey: ["playbook-rules", playbookId] });
    await qc.invalidateQueries({ queryKey: ["board"] });
  };

  const savePlaybook = async (patch: Partial<Playbook>) => {
    setSaving("playbook");
    setError(null);
    const { error } = await supabase
      .from("playbooks")
      .update(patch as never)
      .eq("id", playbookId);
    if (error) setError(error.message);
    else setWritten(true);
    await refresh();
    setSaving(null);
  };
  const addRule = async () => {
    const ordinal = (rules.data?.length ?? 0) + 1;
    const { data, error } = await supabase
      .from("playbook_rules")
      .insert({ playbook_id: playbookId, topic: "New position", ordinal })
      .select("id")
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    await refresh();
    setSelected(data.id);
  };
  const saveRule = async (id: string, patch: Partial<Rule>) => {
    setSaving(id);
    setError(null);
    const { error } = await supabase
      .from("playbook_rules")
      .update(patch as never)
      .eq("id", id);
    if (error) setError(error.message);
    else setWritten(true);
    await refresh();
    setSaving(null);
  };
  /* Typing is enough. Blur still writes immediately, and leaving the screen
     flushes whatever is outstanding — see `useFieldSaver`. */
  const fields = useFieldSaver((id, patch) =>
    id === playbookId
      ? savePlaybook(patch as Partial<Playbook>)
      : saveRule(id, patch as Partial<Rule>),
  );
  const deleteRule = async (id: string) => {
    const topic = rules.data?.find((r) => r.id === id)?.topic ?? "this position";
    if (
      !(await confirmDelete({
        what: `“${topic}”`,
        consequence: "The wording and guidance recorded on it go too.",
        archivable: false,
      }))
    )
      return;
    setError(null);
    // Every other write here reports its failure; this one used to swallow it,
    // so a delete RLS refused looked exactly like a delete that worked.
    const { error: err } = await supabase.from("playbook_rules").delete().eq("id", id);
    if (err) {
      setError(`"${topic}" could not be deleted. ${err.message}`);
      return;
    }
    if (selected === id) setSelected(null);
    await refresh();
  };

  const rule = rules.data?.find((r) => r.id === selected) ?? null;
  const search = query.trim().toLowerCase();
  const shownRules = (rules.data ?? []).filter((r) =>
    [r.topic, r.preferred, r.fallback, r.redflag].join(" ").toLowerCase().includes(search),
  );

  const crumb = (
    <Crumbs items={[{ label: "Playbooks", to: "/playbooks" }, { label: pb.data?.name ?? "…" }]} />
  );

  if (pb.isLoading)
    return (
      <AppShell
        section="playbooks"
        back={{ label: "Playbooks", href: "/playbooks" }}
        breadcrumb={crumb}
      >
        <div className="scripta-page" role="status">
          Loading playbook…
        </div>
      </AppShell>
    );
  if (pb.isError)
    return (
      <AppShell
        section="playbooks"
        back={{ label: "Playbooks", href: "/playbooks" }}
        breadcrumb={crumb}
      >
        <div className="scripta-page">
          <LoadError what="playbook" error={pb.error} onRetry={() => void pb.refetch()} />
        </div>
      </AppShell>
    );
  if (!pb.data)
    return (
      <AppShell
        section="playbooks"
        back={{ label: "Playbooks", href: "/playbooks" }}
        breadcrumb={crumb}
      >
        <div className="scripta-page">
          <EmptyState title="Playbook not found" body="It may have been deleted." />
        </div>
      </AppShell>
    );
  const p = pb.data;

  return (
    <AppShell
      section="playbooks"
      breadcrumb={crumb}
      back={{ label: "Playbooks", href: "/playbooks" }}
      trackLabel={p.name}
      scroll={false}
      assistant={{
        key: `playbook.${p.id}`,
        label: p.name,
        screen: "Playbook rules",
        intro: "Ask me to draft a rule from a clause you've already negotiated.",
      }}
    >
      <section className="playbook-editor-page" aria-labelledby="playbook-editor-title">
        <header className="scripta-page-heading playbook-page-heading">
          <div>
            <h1 id="playbook-editor-title" className="scripta-page-title">
              {p.name}
            </h1>
            <p className="scripta-page-description">
              {[p.version_label || "v1", p.status, p.jurisdiction].filter(Boolean).join(" · ")}
            </p>
          </div>
          <span className="playbook-save-state" role="status">
            {error
              ? "Action failed"
              : saving
                ? "Saving…"
                : fields.pending > 0
                  ? "Unsaved changes"
                  : written
                    ? "Saved"
                    : "Changes save as you type"}
          </span>
        </header>
        {error && (
          <div role="alert" className="scripta-feedback is-error playbook-error">
            {error}
          </div>
        )}
        <div className="playbook-editor-layout">
          <aside className="playbook-editor-nav" aria-label="Playbook positions and details">
            <header className="playbook-rail-heading">
              <h2>
                Positions <span>{rules.data?.length ?? 0}</span>
              </h2>
              <Button variant="quiet" onClick={() => void addRule()}>
                Add position
              </Button>
            </header>
            <div className="playbook-editor-positions">
              <Field label="Search positions">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Clause or position"
                />
              </Field>
              {rules.isLoading && (
                <div className="playbook-empty" role="status">
                  Loading positions…
                </div>
              )}
              {rules.isError && (
                <LoadError
                  what="positions"
                  error={rules.error}
                  onRetry={() => void rules.refetch()}
                />
              )}
              {byCategory(shownRules).map((group) => (
                <div key={group.category}>
                  <div className="playbook-rail-group">{group.category}</div>
                  {group.rows.map((r) => (
                <div key={r.id} className="playbook-editor-position">
                  <button
                    type="button"
                    className="playbook-editor-position-select"
                    aria-pressed={r.id === selected}
                    onClick={() => setSelected(r.id)}
                  >
                    <strong>{r.topic}</strong>
                    <small>
                      {r.preferred ? `Preferred: ${r.preferred}` : "No preferred position yet"}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="playbook-position-delete"
                    title={`Delete "${r.topic}"`}
                    aria-label={`Delete "${r.topic}"`}
                    onClick={() => void deleteRule(r.id)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
                  ))}
                </div>
              ))}
              {!rules.isLoading && !rules.isError && (rules.data?.length ?? 0) === 0 && (
                <div className="playbook-empty">
                  No positions yet. Add a clause topic and record your preferred position.
                </div>
              )}
              {!rules.isLoading && !rules.isError && !!rules.data?.length && !shownRules.length && (
                <div className="playbook-empty" role="status">
                  No matching positions. Try another search.
                </div>
              )}
            </div>
            <details className="playbook-governance">
              <summary>Playbook details</summary>
              <div className="playbook-governance-fields">
                <Field label="Name">
                  <input
                    defaultValue={p.name}
                    onChange={(e) => fields.schedule(playbookId, "name", { name: e.target.value })}
                    onBlur={() => fields.flushField(playbookId, "name")}
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    rows={3}
                    defaultValue={p.description ?? ""}
                    onChange={(e) =>
                      fields.schedule(playbookId, "description", {
                        description: e.target.value || null,
                      })
                    }
                    onBlur={() => fields.flushField(playbookId, "description")}
                  />
                </Field>
                <Field label="Version">
                  <input
                    defaultValue={p.version_label ?? ""}
                    onChange={(e) =>
                      fields.schedule(playbookId, "version_label", {
                        version_label: e.target.value || null,
                      })
                    }
                    onBlur={() => fields.flushField(playbookId, "version_label")}
                  />
                </Field>
                <Field label="Status">
                  <select
                    value={p.status}
                    onChange={(e) =>
                      void savePlaybook({ status: e.target.value as Playbook["status"] })
                    }
                  >
                    {["Draft", "Active", "Archived"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Jurisdiction">
                  <input
                    defaultValue={p.jurisdiction ?? ""}
                    onChange={(e) =>
                      fields.schedule(playbookId, "jurisdiction", {
                        jurisdiction: e.target.value || null,
                      })
                    }
                    onBlur={() => fields.flushField(playbookId, "jurisdiction")}
                  />
                </Field>
                <Field label="Agreement type">
                  <input
                    defaultValue={p.agreement_type ?? ""}
                    onChange={(e) =>
                      fields.schedule(playbookId, "agreement_type", {
                        agreement_type: e.target.value || null,
                      })
                    }
                    onBlur={() => fields.flushField(playbookId, "agreement_type")}
                  />
                </Field>
                <Field label="Effective date">
                  <input
                    type="date"
                    defaultValue={p.effective_date ?? ""}
                    onChange={(e) =>
                      fields.schedule(playbookId, "effective_date", {
                        effective_date: e.target.value || null,
                      })
                    }
                    onBlur={() => fields.flushField(playbookId, "effective_date")}
                  />
                </Field>
                <p className="playbook-meta">
                  <SaveState mode="on-blur" status={saving === "playbook" ? "saving" : "idle"} />
                </p>
              </div>
            </details>
          </aside>
          <div className="playbook-position-editor">
            {!rule ? (
              <PlaybookOverview
                playbook={p}
                rules={rules.data ?? []}
                loading={rules.isLoading}
                onOpen={setSelected}
                onAdd={() => void addRule()}
                onMarkReviewed={() =>
                  void savePlaybook({ last_reviewed_at: new Date().toISOString() } as Partial<Playbook>)
                }
                marking={saving === "playbook"}
              />
            ) : (
              <div key={rule.id}>
                <div className="playbook-position-editor-heading">
                  <Field label="Position topic">
                    <input
                      defaultValue={rule.topic}
                      onChange={(e) => fields.schedule(rule.id, "topic", { topic: e.target.value })}
                      onBlur={() => fields.flushField(rule.id, "topic")}
                    />
                  </Field>
                  <Field label="Risk level">
                    <select
                      value={rule.risk_level ?? ""}
                      onChange={(e) =>
                        void saveRule(rule.id, { risk_level: e.target.value || null })
                      }
                    >
                      <option value="">Not specified</option>
                      {["Low", "Medium", "High"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                {[
                  { title: "Negotiating positions", fields: RULE_FIELDS.slice(0, 5) },
                  { title: "Model language", fields: RULE_FIELDS.slice(5, 6) },
                  { title: "Guidance and rationale", fields: RULE_FIELDS.slice(6) },
                ].map((group) => (
                  <section
                    key={group.title}
                    className="playbook-rule-section"
                    aria-label={group.title}
                  >
                    <h2>{group.title}</h2>
                    {group.fields.map((f) => (
                      <div
                        key={String(f.key)}
                        className={`scripta-form-field${f.key === "approved_clause_text" ? " playbook-approved-wording" : ""}`}
                      >
                        <label htmlFor={`rule-${rule.id}-${String(f.key)}`}>{f.label}</label>
                        <small id={`rule-hint-${String(f.key)}`}>{f.hint}</small>
                        <textarea
                          id={`rule-${rule.id}-${String(f.key)}`}
                          aria-describedby={`rule-hint-${String(f.key)}`}
                          rows={f.rows ?? 2}
                          defaultValue={(rule[f.key] as string | null) ?? ""}
                          onChange={(e) =>
                            fields.schedule(rule.id, String(f.key), {
                              [f.key]: e.target.value || null,
                            })
                          }
                          onBlur={() => fields.flushField(rule.id, String(f.key))}
                        />
                      </div>
                    ))}
                  </section>
                ))}
                <footer className="playbook-editor-footer">
                  <span className="playbook-meta">
                    <SaveState
                      mode="auto"
                      status={saving === rule.id ? "saving" : fields.pending > 0 ? "idle" : "saved"}
                    />{" "}
                    {p.version_label ?? "v1"}
                  </span>
                  <PlaybookExport
                    playbookId={playbookId}
                    ruleIds={[rule.id]}
                    label="This position"
                  />
                  <Button variant="danger" onClick={() => void deleteRule(rule.id)}>
                    Delete position
                  </Button>
                </footer>
              </div>
            )}
          </div>
        </div>
      </section>
      {confirmDialog}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="scripta-form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * What this playbook contains, before any of it is edited.
 *
 * A playbook opened on its first rule, which told a lawyer nothing about the
 * playbook. This says how much of it is actually usable — how many positions
 * carry a stance, a fallback, an escalation and approved wording — names what
 * is still missing in the lawyer's own terms, and lists the positions the way
 * they are held in the head: by what they are about.
 */
function PlaybookOverview({
  playbook,
  rules,
  loading,
  onOpen,
  onAdd,
  onMarkReviewed,
  marking,
}: {
  playbook: Playbook;
  rules: Rule[];
  loading: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onMarkReviewed: () => void;
  marking: boolean;
}) {
  const health = playbookHealth(rules as never);
  const stats: [number, string][] = [
    [health.positions, health.positions === 1 ? "position" : "positions"],
    [health.withPreferred, "with a preferred position"],
    [health.withFallback, "with a fallback"],
    [health.withEscalation, "with an escalation route"],
    [health.withLanguage, "with approved wording"],
  ];

  if (loading) return <div className="playbook-empty">Loading positions…</div>;

  return (
    <div className="playbook-overview">
      <header>
        <h2>{playbook.name}</h2>
        <p>
          {[playbook.agreement_type, playbook.our_role ? `${playbook.our_role} side` : "", playbook.jurisdiction]
            .filter(Boolean)
            .join(" · ") || "No agreement type set"}
        </p>
        {playbook.description && <p className="playbook-overview-purpose">{playbook.description}</p>}
        <div className="playbook-overview-export">
          <PlaybookExport playbookId={playbook.id} label="Export the playbook" />
        </div>
      </header>

      <div className="playbook-stats">
        {stats.map(([n, label]) => (
          <div key={label}>
            <strong>{n}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Stated, not urged. A playbook is a record somebody keeps as they go,
          and a screen that opens with a list of what they have not done yet is
          a screen they stop opening. The date is a fact worth having — the
          folder somebody opens in 2029 wants it — so it is here with the way to
          set it, and nothing is asked of anybody. */}
      <p className="playbook-reviewed-note">
        {playbook.last_reviewed_at
          ? `Reviewed ${new Date(playbook.last_reviewed_at).toLocaleDateString(undefined, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}.`
          : "Not marked as reviewed."}{" "}
        <button
          type="button"
          className="playbook-gap-action"
          disabled={marking}
          onClick={onMarkReviewed}
        >
          {marking
            ? "Recording…"
            : playbook.last_reviewed_at
              ? "Mark it reviewed again"
              : "Mark it reviewed"}
        </button>
      </p>

      {rules.length === 0 ? (
        <div className="playbook-empty">
          No positions yet. Add the first issue this playbook should cover.
          <div style={{ marginTop: 10 }}>
            <Button variant="primary" onClick={onAdd}>
              Add position
            </Button>
          </div>
        </div>
      ) : (
        byCategory(rules).map((group) => (
          <section key={group.category} className="playbook-overview-group">
            <h3>{group.category}</h3>
            <div>
              {group.rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="playbook-overview-position"
                  onClick={() => onOpen(r.id)}
                >
                  <strong>{r.topic}</strong>
                  <span>
                    {r.preferred?.trim()
                      ? r.preferred
                      : "No position recorded yet — say where you stand."}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
