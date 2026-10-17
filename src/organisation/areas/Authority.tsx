/**
 * The delegation of authority as a lawyer reads it: matter type, threshold,
 * and who recommends, approves and signs.
 *
 * Rules name roles, capacities and bodies; people are resolved through the
 * organogram and the entity's officers at the moment of asking, so the matrix
 * never goes stale when someone leaves. What is recorded in an instrument and
 * what the lawyer has only inferred are drawn differently everywhere, because
 * a signature block built on an inference is a different kind of risk.
 */
import { useState } from "react";
import { Button } from "@/components/primitives";
import type { AreaProps } from "../area";
import RecordDocuments from "../components/RecordDocuments";
import AuthorityRuleDialog from "../dialogs/AuthorityRuleDialog";
import InstrumentDialog from "../dialogs/InstrumentDialog";
import { whoSigns, type Answer } from "../answers";
import {
  bandLabel,
  byId,
  currentAppointments,
  currentRoles,
  entityLabel,
  escalationLadder,
  formatDay,
  liveEntities,
  localDay,
  partiesFor,
  personName,
  resolveParty,
  ruleInForce,
  type AuthorityRule,
  type AuthorityStep,
  type Instrument,
  type Organisation,
} from "../model";
import {
  EntitySelect,
  Empty,
  Eyebrow,
  Field,
  FieldRow,
  LinkButton,
  OrgPage,
  Panel,
  RoleSelect,
  Segmented,
  TextInput,
} from "../ui";
import { AnswerView } from "./Ask";
import "../governance.css";

type View = "matrix" | "person" | "signing";

const STEPS: AuthorityStep[] = ["recommend", "approve", "sign"];

export default function Authority({ org, go }: AreaProps) {
  const today = localDay();
  const [view, setView] = useState<View>("matrix");
  const current = org.instruments.filter((i) => !i.supersededOn || i.supersededOn > today);
  const superseded = org.instruments
    .filter((i) => i.supersededOn && i.supersededOn <= today)
    .sort((a, b) => (b.supersededOn ?? "").localeCompare(a.supersededOn ?? ""));
  const [showing, setShowing] = useState<string>("today");
  const [instrumentDialog, setInstrumentDialog] = useState<
    | { kind: "new" }
    | { kind: "edit"; instrument: Instrument }
    | { kind: "version"; instrument: Instrument }
    | null
  >(null);
  const [ruleDialog, setRuleDialog] = useState<AuthorityRule | "new" | null>(null);

  const primary = current[0] ?? null;
  const historical = org.instruments.find((i) => i.id === showing) ?? null;
  const rules = (
    historical
      ? org.rules.filter((r) => r.instrumentId === historical.id)
      : org.rules.filter((r) => ruleInForce(org, r, today))
  ).sort((a, b) => a.position - b.position || a.matterType.localeCompare(b.matterType));
  const hasInferred = rules.some((r) => r.basis === "inferred");

  const subtitle = primary
    ? [
        primary.approvedOn
          ? // The approving body is a name, written as the instrument gives it.
            `Approved${primary.approvedBy ? ` by ${primary.approvedBy}` : ""} on ${formatDay(primary.approvedOn)}`
          : "Approval date not recorded",
        primary.scopeNote,
        primary.reviewDueOn && `review due ${formatDay(primary.reviewDueOn)}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : org.rules.length
      ? "No instrument recorded: every rule here is unsupported until one is"
      : "Who may recommend, approve and sign, and on whose authority";

  return (
    <OrgPage
      title={primary ? primary.title : "Delegation of authority"}
      subtitle={subtitle}
      actions={
        <>
          {org.rules.length > 0 && (
            <Segmented
              label="Authority view"
              value={view}
              onChange={setView}
              options={[
                { id: "matrix", label: "Matrix" },
                { id: "person", label: "By person" },
                { id: "signing", label: "Signing authority" },
              ]}
            />
          )}
          {primary ? (
            <Button onClick={() => setInstrumentDialog({ kind: "version", instrument: primary })}>
              New version
            </Button>
          ) : (
            <Button onClick={() => setInstrumentDialog({ kind: "new" })}>Record instrument</Button>
          )}
          <Button variant="primary" onClick={() => setRuleDialog("new")}>
            Add rule
          </Button>
        </>
      }
    >
      {org.rules.length === 0 && org.instruments.length === 0 ? (
        <Empty
          title="No authority recorded yet"
          body="Record the delegation of authority — the policy, articles or board resolution — and then its rules: for each kind of matter and value, who recommends, who approves and who signs. Scripta then answers “who signs this?” from it."
          action={
            <>
              <Button variant="primary" onClick={() => setInstrumentDialog({ kind: "new" })}>
                Record instrument
              </Button>
              <Button onClick={() => setRuleDialog("new")}>Add a rule without one</Button>
            </>
          }
        />
      ) : (
        <>
          {superseded.length > 0 && (
            <div className="gv-asat">
              <label className="og-check">
                Showing
                <select
                  value={showing}
                  onChange={(e) => setShowing(e.target.value)}
                  aria-label="Which rules to show"
                >
                  <option value="today">Rules in force today</option>
                  {superseded.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title} (superseded {formatDay(i.supersededOn)})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {view === "matrix" && (
            <Matrix
              org={org}
              rules={rules}
              onEdit={setRuleDialog}
              hasInferred={hasInferred}
              historical={!!historical}
            />
          )}
          {view === "person" && <ByPerson org={org} rules={rules} go={go} />}
          {view === "signing" && <SigningAuthority org={org} rules={rules} />}

          <div className="og-grid-2">
            <WhoSigns org={org} go={go} />
            <Escalation org={org} />
          </div>

          <Panel title="Source">
            {primary ? (
              <div className="gv-source">
                <div>
                  <div className="og-strong">{primary.title}</div>
                  <div className="og-row-meta">
                    {[
                      primary.reference && `Reference ${primary.reference}`,
                      primary.approvedOn && formatDay(primary.approvedOn),
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No reference recorded"}
                  </div>
                </div>
                <LinkButton
                  onClick={() => setInstrumentDialog({ kind: "edit", instrument: primary })}
                >
                  Edit
                </LinkButton>
              </div>
            ) : (
              <p className="og-muted">
                No instrument is recorded. Rules without one are unsupported.{" "}
                <LinkButton onClick={() => setInstrumentDialog({ kind: "new" })}>
                  Record it
                </LinkButton>
              </p>
            )}
            {primary && (
              <RecordDocuments
                org={org}
                recordType="instrument"
                recordId={primary.id}
                label={primary.title}
              />
            )}
            {current.length > 1 && (
              <div className="gv-earlier">
                <Eyebrow>Also in force</Eyebrow>
                {current.slice(1).map((i) => (
                  <div key={i.id} className="gv-source">
                    <span>{i.title}</span>
                    <LinkButton
                      onClick={() => setInstrumentDialog({ kind: "edit", instrument: i })}
                    >
                      Edit
                    </LinkButton>
                  </div>
                ))}
              </div>
            )}
            {superseded.length > 0 && (
              <div className="gv-earlier">
                <Eyebrow>Earlier versions</Eyebrow>
                {superseded.map((i) => (
                  <div key={i.id} className="gv-source">
                    <span>
                      {i.title}
                      <span className="og-muted">
                        {" "}
                        · {i.approvedOn ? `${formatDay(i.approvedOn)} – ` : "until "}
                        {formatDay(i.supersededOn)}
                      </span>
                    </span>
                    <span className="gv-source-actions">
                      <LinkButton onClick={() => setShowing(i.id)}>Show its rules</LinkButton>
                      <LinkButton
                        onClick={() => setInstrumentDialog({ kind: "edit", instrument: i })}
                      >
                        Edit
                      </LinkButton>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {instrumentDialog && (
        <InstrumentDialog
          key={
            instrumentDialog.kind === "new"
              ? "new"
              : `${instrumentDialog.kind}-${instrumentDialog.instrument.id}`
          }
          org={org}
          instrument={instrumentDialog.kind === "edit" ? instrumentDialog.instrument : null}
          supersedes={instrumentDialog.kind === "version" ? instrumentDialog.instrument : null}
          open
          onClose={() => setInstrumentDialog(null)}
          onSaved={() => setShowing("today")}
        />
      )}
      {ruleDialog && (
        <AuthorityRuleDialog
          key={ruleDialog === "new" ? "new" : ruleDialog.id}
          org={org}
          rule={ruleDialog === "new" ? null : ruleDialog}
          open
          onClose={() => setRuleDialog(null)}
          {...(historical && ruleDialog === "new"
            ? { defaults: { instrumentId: historical.id } }
            : {})}
        />
      )}
    </OrgPage>
  );
}

/** "Commercial", "CEO + 1 director", "Board resolution". */
const stepLabel = (org: Organisation, rule: AuthorityRule, step: AuthorityStep) =>
  partiesFor(org, rule.id, step)
    .map((p) => resolveParty(org, p, rule.entityId).label)
    .join(" + ");

function Matrix({
  org,
  rules,
  onEdit,
  hasInferred,
  historical,
}: {
  org: Organisation;
  rules: AuthorityRule[];
  onEdit: (rule: AuthorityRule) => void;
  hasInferred: boolean;
  historical: boolean;
}) {
  const entities = byId(org.entities);
  const instruments = byId(org.instruments);
  if (!rules.length)
    return (
      <Panel>
        <p className="og-muted">
          {historical ? "That version recorded no rules." : "No rule is in force today."}
        </p>
      </Panel>
    );
  return (
    <div className="og-panel gv-matrix">
      <table className="og-table">
        <thead>
          <tr>
            <th>Matter</th>
            <th>Threshold</th>
            <th>Recommends</th>
            <th>Approves</th>
            <th>Signs</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => {
            const inferred = r.basis === "inferred";
            const unsupported = r.basis === "recorded" && !instruments.get(r.instrumentId ?? "");
            return (
              <tr
                key={r.id}
                className={`is-selectable${inferred ? " gv-inferred" : ""}`}
                onClick={() => onEdit(r)}
              >
                <td>
                  <button
                    type="button"
                    className="gv-cell-link og-strong"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(r);
                    }}
                  >
                    {r.matterType}
                  </button>
                  <div className="gv-matter-meta">
                    {r.entityId && (
                      <span className="og-chip">{entityLabel(entities.get(r.entityId))} only</span>
                    )}
                    {inferred && <span className="og-chip is-unverified">Inferred</span>}
                    {unsupported && <span className="og-chip is-unverified">No instrument</span>}
                    {r.effectiveTo && (
                      <span className="og-chip">Until {formatDay(r.effectiveTo)}</span>
                    )}
                  </div>
                  {r.note && <div className="og-row-meta">{r.note}</div>}
                </td>
                <td className="og-mono">{bandLabel(r)}</td>
                {STEPS.map((step) => (
                  <td key={step}>
                    {stepLabel(org, r, step) || <span className="og-muted">—</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasInferred && (
        <p className="og-hint gv-caption">
          Inferred rows are the firm's understanding of the position, not written in any instrument.
          Confirm them before relying on a signature block.
        </p>
      )}
    </div>
  );
}

function ByPerson({
  org,
  rules,
  go,
}: {
  org: Organisation;
  rules: AuthorityRule[];
  go: AreaProps["go"];
}) {
  const today = localDay();
  const roles = currentRoles(org, today);
  const appointments = currentAppointments(org, today);
  const rows = org.people
    .filter((p) => !p.archivedAt)
    .map((person) => {
      const held = new Set(roles.filter((r) => r.holderPersonId === person.id).map((r) => r.id));
      const offices = appointments.filter((a) => a.personId === person.id);
      const lines: { step: AuthorityStep; rule: AuthorityRule; via: string }[] = [];
      for (const rule of rules) {
        for (const p of org.parties.filter((x) => x.ruleId === rule.id)) {
          if (p.roleId && held.has(p.roleId))
            lines.push({
              step: p.step,
              rule,
              via: roles.find((r) => r.id === p.roleId)?.title ?? "",
            });
          if (p.capacity) {
            const match = offices.filter(
              (a) =>
                (a.capacity === p.capacity ||
                  (p.capacity === "director" && a.capacity === "managing_director")) &&
                (!rule.entityId || rule.entityId === a.entityId),
            );
            if (match.length)
              lines.push({
                step: p.step,
                rule,
                via: `${p.capacity} of ${match.map((a) => entityLabel(org.entities.find((e) => e.id === a.entityId))).join(", ")}`,
              });
          }
        }
      }
      return { person, lines };
    })
    .filter((x) => x.lines.length);

  if (!rows.length)
    return (
      <Panel>
        <p className="og-muted">
          Nobody holds authority through these rules today: the roles they name are vacant, or no
          officers are recorded.
        </p>
      </Panel>
    );
  return (
    <div className="og-panel gv-matrix">
      <table className="og-table">
        <thead>
          <tr>
            <th>Person</th>
            <th>Recommends</th>
            <th>Approves</th>
            <th>Signs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ person, lines }) => (
            <tr key={person.id}>
              <td>
                <button
                  type="button"
                  className="gv-cell-link og-strong"
                  onClick={() => go({ area: "people", item: person.id, mode: null })}
                >
                  {person.fullName}
                </button>
              </td>
              {STEPS.map((step) => (
                <td key={step}>
                  {lines
                    .filter((l) => l.step === step)
                    .map((l, i) => (
                      <div
                        key={i}
                        className={
                          l.rule.basis === "inferred" ? "gv-line gv-inferred-text" : "gv-line"
                        }
                      >
                        {l.rule.matterType} <span className="og-mono">{bandLabel(l.rule)}</span>
                        <div className="og-row-meta">as {l.via}</div>
                      </div>
                    ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SigningAuthority({ org, rules }: { org: Organisation; rules: AuthorityRule[] }) {
  const entities = liveEntities(org);
  const [entityId, setEntityId] = useState<string | null>(entities[0]?.id ?? null);
  const entity = entities.find((e) => e.id === entityId) ?? null;
  const applicable = rules.filter((r) => !r.entityId || r.entityId === entityId);
  return (
    <Panel
      title="Who can sign today"
      right={
        <label className="og-check">
          For
          <EntitySelect
            org={org}
            value={entityId}
            onChange={setEntityId}
            empty="Choose an entity"
          />
        </label>
      }
    >
      {!entity ? (
        <p className="og-muted">
          {entities.length
            ? "Choose the entity that would sign."
            : "No entities are recorded, so no signatories can be named."}
        </p>
      ) : !applicable.length ? (
        <p className="og-muted">No rule applies to {entityLabel(entity)}.</p>
      ) : (
        <ul className="og-rows">
          {applicable.map((rule) => {
            const signers = partiesFor(org, rule.id, "sign").map((p) =>
              resolveParty(org, p, entity.id),
            );
            return (
              <li key={rule.id}>
                <span className="og-row-main">
                  <span className="og-row-title">
                    {rule.matterType} <span className="og-mono og-muted">{bandLabel(rule)}</span>
                    {rule.basis === "inferred" && (
                      <span className="og-chip is-unverified gv-inline-chip">Inferred</span>
                    )}
                  </span>
                  {signers.length === 0 ? (
                    <span className="og-row-meta">No signatory recorded under this rule.</span>
                  ) : (
                    signers.map((s) => (
                      <span key={s.party.id} className="og-row-meta">
                        {s.label}
                        {s.people.length ? `: ${s.people.join(", ")}` : ""}
                        {s.gap && <span className="gv-gap"> — {s.gap}</span>}
                      </span>
                    ))
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function WhoSigns({ org, go }: { org: Organisation; go: AreaProps["go"] }) {
  const types = [...new Set(org.rules.map((r) => r.matterType))].sort();
  const [matterType, setMatterType] = useState(types[0] ?? "");
  const [amount, setAmount] = useState("");
  const [entityId, setEntityId] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = () => {
    const raw = amount.replace(/[,\s]/g, "");
    const value = raw ? Number(raw) : null;
    if (!matterType.trim()) return setError("Choose the kind of matter.");
    if (raw && !Number.isFinite(value)) return setError("The value must be a number.");
    setError(null);
    setAnswer(whoSigns(org, { matterType, amount: value, entityId }));
  };

  return (
    <Panel title="Who signs this?">
      <form
        className="gv-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <Field label="Matter">
          <input
            list="og-authority-types"
            value={matterType}
            onChange={(e) => setMatterType(e.target.value)}
          />
          <datalist id="og-authority-types">
            {types.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <FieldRow>
          <Field label="Value">
            <TextInput value={amount} onChange={setAmount} placeholder="400000" />
          </Field>
          <Field label="Contracting entity">
            <EntitySelect org={org} value={entityId} onChange={setEntityId} empty="Not chosen" />
          </Field>
        </FieldRow>
        {error && (
          <p className="org-error" role="alert">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" disabled={!types.length}>
            Check
          </Button>
          {!types.length && <span className="og-hint"> Add a rule first.</span>}
        </div>
      </form>
      {answer && <AnswerView answer={answer} go={go} compact />}
    </Panel>
  );
}

function Escalation({ org }: { org: Organisation }) {
  const roles = currentRoles(org).filter((r) => r.kind !== "role");
  const [from, setFrom] = useState<string | null>(
    roles.find((r) => r.kind === "head")?.id ?? roles[0]?.id ?? null,
  );
  const ladder = from ? escalationLadder(org, from) : [];
  const byRole = byId(org.roles);
  return (
    <Panel title="Escalation & absence cover">
      {!org.roles.length ? (
        <p className="og-muted">Escalation follows the organogram. Add roles there first.</p>
      ) : (
        <>
          <Field label="Escalating from">
            <RoleSelect org={org} value={from} onChange={setFrom} empty="Choose a role" />
          </Field>
          {ladder.length > 0 && (
            <div className="gv-ladder" aria-label="Escalation ladder">
              {ladder.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && <span aria-hidden> › </span>}
                  {r.title}
                </span>
              ))}
              {ladder.length > 0 && !ladder[ladder.length - 1]!.parentRoleId && (
                <span className="og-muted"> › Board</span>
              )}
            </div>
          )}
          {roles.length > 0 && (
            <dl className="og-facts gv-cover">
              {roles.map((r) => {
                const cover = r.coverRoleId ? byRole.get(r.coverRoleId) : undefined;
                const coverHolder = cover ? personName(org, cover.holderPersonId) : "";
                return (
                  <div key={r.id}>
                    <dt>{r.title} away</dt>
                    <dd className={cover ? undefined : "gv-gap"}>
                      {cover
                        ? `${cover.title}${coverHolder ? ` (${coverHolder})` : " (vacant)"}${r.coverNote ? `, ${r.coverNote}` : ""}`
                        : "No cover named"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
          <p className="og-hint">Cover is set on each role in the organogram.</p>
        </>
      )}
    </Panel>
  );
}
