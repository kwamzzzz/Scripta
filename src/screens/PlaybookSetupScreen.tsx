/**
 * Starting a playbook.
 *
 * The old New playbook asked for a name, an agreement type and a jurisdiction,
 * then opened an empty rule list whose first question was "what shall I call
 * rule 1?" — a question about the tool. A lawyer does not think in rules; they
 * think "here is how we approach liability in our customer contracts". So this
 * asks what the playbook is for and which side it speaks for, then puts the
 * issues that kind of agreement actually raises in front of them to keep,
 * rename or drop.
 *
 * Every suggestion is a suggestion. The lawyer can clear them all and write
 * their own, or take the lot and fill them in later.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import AppShell, { Crumbs } from "@/components/AppShell";
import { Button } from "@/components/primitives";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/store/app";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/tokens";
import {
  CATEGORIES,
  suggestedIssues,
  type IssueSuggestion,
  type PlaybookCategory,
} from "@/lib/playbook/issues";
import "./playbook-setup.css";

const ROLES = [
  "Customer",
  "Supplier",
  "Employer",
  "Employee",
  "Lender",
  "Borrower",
  "Licensor",
  "Licensee",
  "Landlord",
  "Tenant",
  "Either side",
];

type Chosen = IssueSuggestion & { keep: boolean };

export default function PlaybookSetupScreen() {
  const { workspaceId } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [agreementType, setAgreementType] = useState("");
  const [ourRole, setOurRole] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [purpose, setPurpose] = useState("");
  const [edited, setEdited] = useState<Chosen[] | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The suggestions follow the agreement type until the lawyer touches them,
  // after which they are the lawyer's list and Scripta stops rewriting it.
  const suggested = useMemo(
    () => suggestedIssues(agreementType).map((issue) => ({ ...issue, keep: true })),
    [agreementType],
  );
  const issues = edited ?? suggested;
  const keeping = issues.filter((i) => i.keep);
  const ready = name.trim().length > 0;

  const change = (next: Chosen[]) => setEdited(next);
  const toggle = (topic: string) =>
    change(issues.map((i) => (i.topic === topic ? { ...i, keep: !i.keep } : i)));
  const rename = (topic: string, value: string) =>
    change(issues.map((i) => (i.topic === topic ? { ...i, topic: value } : i)));
  const recategorise = (topic: string, category: PlaybookCategory) =>
    change(issues.map((i) => (i.topic === topic ? { ...i, category } : i)));
  const addCustom = () => {
    const topic = custom.trim();
    if (!topic || issues.some((i) => i.topic.toLowerCase() === topic.toLowerCase())) return;
    change([...issues, { topic, category: "Commercial", why: "", keep: true }]);
    setCustom("");
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No workspace");
      const { data, error: failed } = await supabase
        .from("playbooks")
        .insert({
          workspace_id: workspaceId,
          name: name.trim(),
          version_label: "v1",
          status: "Draft",
          owner_id: user?.id ?? null,
          agreement_type: agreementType.trim() || null,
          jurisdiction: jurisdiction.trim() || null,
          description: purpose.trim() || null,
          ...(ourRole ? { our_role: ourRole } : {}),
        } as never)
        .select("id")
        .single();
      if (failed || !data) throw new Error(failed?.message ?? "The playbook could not be created.");
      const playbookId = (data as { id: string }).id;

      if (keeping.length) {
        const rows = keeping.map((issue, index) => ({
          playbook_id: playbookId,
          topic: issue.topic,
          category: issue.category,
          ordinal: index + 1,
          ...(issue.why ? { commercial_rationale: issue.why } : {}),
        }));
        const { error: ruleError } = await supabase.from("playbook_rules").insert(rows as never);
        if (ruleError) throw new Error(ruleError.message);
      }
      return playbookId;
    },
    onSuccess: (playbookId) =>
      void navigate({ to: "/playbooks/$playbookId", params: { playbookId }, search: {} }),
    onError: (cause) => setError((cause as Error).message),
  });

  return (
    <AppShell
      section="playbooks"
      scroll={false}
      breadcrumb={
        <Crumbs items={[{ label: "Playbooks", to: "/playbooks" }, { label: "New playbook" }]} />
      }
      assistant={{
        key: "playbooks",
        screen: "New playbook",
        intro: "Ask what a playbook for this kind of agreement usually covers.",
      }}
    >
      <div className="pb-setup">
        <div className="pb-setup-main">
          <header className="pb-setup-head">
            <h1>Teach Scripta how you approach this kind of contract</h1>
            <p>
              A playbook is your negotiating position, not a set of clauses: where you open, what
              you will accept, what needs approval, and the wording you use. Scripta applies it
              when it reviews and drafts.
            </p>
          </header>

          <section className="pb-setup-step">
            <div className="pb-setup-step-head">
              <span className="pb-setup-num">1</span>
              <div>
                <h2>What is this playbook for?</h2>
                <p>Narrow or broad, whichever way your team works.</p>
              </div>
            </div>
            <label className="pb-field">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Commercial contracts — customer side"
                autoFocus
              />
            </label>
            <div className="pb-field-row">
              <label className="pb-field">
                Applies to
                <input
                  value={agreementType}
                  onChange={(e) => setAgreementType(e.target.value)}
                  placeholder="SaaS and services agreements"
                />
                <span className="pb-help">
                  Scripta suggests the issues this kind of agreement raises.
                </span>
              </label>
              <label className="pb-field">
                Our usual role
                <select value={ourRole} onChange={(e) => setOurRole(e.target.value)}>
                  <option value="">Not set</option>
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <span className="pb-help">
                  A cap that is prudent for a customer is unacceptable to a supplier.
                </span>
              </label>
            </div>
            <div className="pb-field-row">
              <label className="pb-field">
                Governing law
                <input
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  placeholder="UAE / DIFC, or jurisdiction-neutral"
                />
              </label>
              <label className="pb-field">
                Purpose
                <input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Standard positions for customer-side technology agreements"
                />
              </label>
            </div>
          </section>

          <section className="pb-setup-step">
            <div className="pb-setup-step-head">
              <span className="pb-setup-num">2</span>
              <div>
                <h2>Which issues matter to you?</h2>
                <p>
                  {agreementType.trim()
                    ? "What a lawyer usually negotiates in this kind of agreement. Keep what applies, rename anything, add your own."
                    : "Say what the playbook applies to above and Scripta will suggest the issues. These are the ones every commercial agreement has."}
                </p>
              </div>
            </div>

            <div className="pb-issues">
              {issues.map((issue) => (
                <div key={issue.topic} className={`pb-issue${issue.keep ? "" : " is-off"}`}>
                  <input
                    type="checkbox"
                    checked={issue.keep}
                    onChange={() => toggle(issue.topic)}
                    aria-label={`Include ${issue.topic}`}
                  />
                  <div className="pb-issue-main">
                    <input
                      className="pb-issue-topic"
                      value={issue.topic}
                      onChange={(e) => rename(issue.topic, e.target.value)}
                      aria-label="Issue"
                    />
                    {issue.why && <span className="pb-issue-why">{issue.why}</span>}
                  </div>
                  <select
                    className="pb-issue-cat"
                    value={issue.category}
                    onChange={(e) => recategorise(issue.topic, e.target.value as PlaybookCategory)}
                    aria-label={`Category for ${issue.topic}`}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="pb-issue-drop"
                    onClick={() => change(issues.filter((i) => i.topic !== issue.topic))}
                    aria-label={`Remove ${issue.topic}`}
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>

            <div className="pb-issue-add">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder="An issue of your own"
                aria-label="Add an issue"
              />
              <Button onClick={addCustom} disabled={!custom.trim()}>
                <Plus size={12} strokeWidth={2} /> Add
              </Button>
            </div>
          </section>

          {error && (
            <div role="alert" className="pb-setup-error">
              {error}
            </div>
          )}

          <div className="pb-setup-actions">
            <Button
              variant="primary"
              disabled={!ready || create.isPending}
              onClick={() => create.mutate()}
              title={ready ? "Create the playbook" : "Give the playbook a name"}
            >
              {create.isPending
                ? "Creating…"
                : keeping.length
                  ? `Create with ${keeping.length} position${keeping.length === 1 ? "" : "s"}`
                  : "Create an empty playbook"}
            </Button>
            <Button onClick={() => void navigate({ to: "/playbooks" })}>Cancel</Button>
            {!ready && <span className="pb-help">A name is all that is required.</span>}
          </div>
        </div>

        <aside className="pb-setup-side" aria-label="What Scripta will create">
          <h2>What Scripta will create</h2>
          <p className="pb-side-note">
            {keeping.length
              ? "These positions, empty and waiting for where you stand. You can fill them in over time — a playbook is built, not written in one sitting."
              : "No positions yet. You can add them once the playbook exists."}
          </p>
          {CATEGORIES.map((category) => {
            const rows = keeping.filter((i) => i.category === category);
            if (!rows.length) return null;
            return (
              <div key={category} className="pb-side-group">
                <h3>{category}</h3>
                <ul>
                  {rows.map((issue) => (
                    <li key={issue.topic}>{issue.topic}</li>
                  ))}
                </ul>
              </div>
            );
          })}
          <div className="pb-side-foot" style={{ color: C.muted }}>
            Each position will hold your preferred stance, what you can accept, what needs
            approval, what you never accept, and the wording you use.
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
