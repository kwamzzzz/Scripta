/**
 * The roles themselves: the documents, kept whole, and the requirements read
 * out of them.
 *
 * The original text is never replaced by the list made from it. A lawyer
 * arguing they meet a requirement will want the employer's own paragraph, not
 * a version of it that somebody — or something — tidied up on the way in.
 */
import { useState } from "react";
import { extractCriteria } from "@/lib/career/extract.functions";
import { FRAMEWORKS } from "@/lib/career/frameworks";
import {
  CRITERION_KINDS,
  CRITERION_KIND_LABEL,
  ROLE_KIND_LABEL,
  fmtDate,
  type CareerRoleKind,
  type CriterionKind,
} from "@/lib/career/model";
import { say, type ViewProps } from "./shared";

export default function RolesView({ record, role, actions, go, onProblem }: ViewProps) {
  const [adding, setAdding] = useState(false);
  const roles = record.roles.filter((r) => !r.archivedAt);
  const open = role;
  const criteria = record.criteria
    .filter((c) => c.roleId === open?.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="cr-grid">
      {/* A job description is two screens of text, so the form that takes one
          spans the grid rather than sharing a column with the list. */}
      {adding && (
        <section className="cr-card cr-span">
          <h2>Add a role</h2>
          <RoleForm
            onCancel={() => setAdding(false)}
            onSave={async (input) => {
              try {
                const id = await actions.addRole.mutateAsync(input);
                setAdding(false);
                go("roles", id as string);
              } catch (e) {
                onProblem(say(e));
              }
            }}
          />
        </section>
      )}
      <section className="cr-card">
        <header className="cr-card-head">
          <h2>Roles you are working towards</h2>
          <button type="button" className="cr-primary" onClick={() => setAdding(true)}>
            Add a role
          </button>
        </header>
        {!roles.length && !adding && (
          <p className="cr-muted">
            A job description, a role profile, or the competency framework your profession
            publishes. You can keep several and measure the same evidence against all of them.
          </p>
        )}

        {/* The blank page is the reason these tools go unused, so the first
            thing offered is a real framework rather than an empty form. */}
        <div className="cr-starters">
          <h3 className="cr-sub">Start from a published framework</h3>
          {FRAMEWORKS.map((f) => (
            <div key={f.id} className="cr-starter">
              <div>
                <strong>{f.title}</strong>
                <span className="cr-muted">{f.blurb}</span>
                <span className="cr-muted">
                  {f.source}
                  {f.url && (
                    <>
                      {" · "}
                      <a href={f.url} target="_blank" rel="noreferrer">
                        read the original
                      </a>
                    </>
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const id = (await actions.addRole.mutateAsync({
                      title: f.title,
                      organisation: f.organisation,
                      kind: "framework",
                      note: f.source,
                    })) as string;
                    await actions.addCriteria.mutateAsync({
                      roleId: id,
                      rows: f.criteria.map((c, i) => ({
                        text: c.text,
                        kind: c.kind,
                        section: c.section,
                        essential: c.essential,
                        note: c.code,
                        sortOrder: i,
                      })),
                    });
                    go("requirements", id);
                  } catch (e) {
                    onProblem(say(e));
                  }
                }}
              >
                Use this
              </button>
            </div>
          ))}
        </div>
        <ul className="cr-rolelist">
          {roles.map((r) => (
            <li key={r.id} className={r.id === open?.id ? "is-on" : ""}>
              <button type="button" onClick={() => go("roles", r.id)}>
                <strong>{r.title || "Untitled role"}</strong>
                <span>
                  {[
                    ROLE_KIND_LABEL[r.kind],
                    r.organisation,
                    r.targetOn ? `by ${fmtDate(r.targetOn)}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="cr-count">
                  {record.criteria.filter((c) => c.roleId === r.id).length} requirements
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {open && (
        <RoleDetail
          key={open.id}
          role={open}
          criteria={criteria}
          actions={actions}
          onProblem={onProblem}
          onRead={() => go("requirements", open.id)}
        />
      )}
    </div>
  );
}

function RoleForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (input: {
    title: string;
    organisation: string;
    kind: CareerRoleKind;
    sourceText: string;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [kind, setKind] = useState<CareerRoleKind>("jd");
  const [sourceText, setSourceText] = useState("");
  return (
    <form
      className="cr-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({ title: title.trim(), organisation: organisation.trim(), kind, sourceText });
      }}
    >
      {/* Three short answers on one line; the document gets the rest. */}
      <div className="cr-row cr-row-3">
        <label>
          Role
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Senior Associate, Corporate"
            autoFocus
            required
          />
        </label>
        <label>
          Firm or body
          <input
            value={organisation}
            onChange={(e) => setOrganisation(e.target.value)}
            placeholder="Nexis Africa"
          />
        </label>
        <label>
          What this is
          <select value={kind} onChange={(e) => setKind(e.target.value as CareerRoleKind)}>
            {(Object.keys(ROLE_KIND_LABEL) as CareerRoleKind[]).map((k) => (
              <option key={k} value={k}>
                {ROLE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="cr-paste">
        The document, as written
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          placeholder="Paste the job description or framework here. It is kept exactly as pasted."
        />
      </label>
      <div className="cr-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="cr-primary" disabled={!title.trim()}>
          Add role
        </button>
      </div>
    </form>
  );
}

/**
 * A date to be ready by — afterwards, and only if you want one.
 *
 * It used to be a field in the form that creates the role, which asked the
 * question at the one moment nobody can answer it: you have just pasted a job
 * description and have not yet looked at what it wants. Deciding when to be
 * ready is a thing you do once you can see the gaps, and it is a deadline
 * nobody set but you — so it is a button you press when you want the pressure,
 * and it comes off again the same way.
 */
function TargetDate({
  role,
  actions,
  onProblem,
}: {
  role: ViewProps["role"] & object;
  actions: ViewProps["actions"];
  onProblem: ViewProps["onProblem"];
}) {
  const [editing, setEditing] = useState(false);
  const save = (targetOn: string | null) =>
    void actions.patchRole
      .mutateAsync({ id: role.id, patch: { targetOn } })
      .then(() => setEditing(false))
      .catch((e) => onProblem(say(e)));

  if (editing || (!role.targetOn && editing))
    return (
      <div className="cr-target is-editing">
        <label>
          Be ready by
          <input
            type="date"
            defaultValue={role.targetOn ?? ""}
            autoFocus
            onChange={(e) => e.target.value && save(e.target.value)}
          />
        </label>
        <button type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    );

  return (
    <div className="cr-target">
      {role.targetOn ? (
        <>
          <span>
            Aiming to be ready by <strong>{fmtDate(role.targetOn)}</strong>
          </span>
          <button type="button" onClick={() => setEditing(true)}>
            Change
          </button>
          <button type="button" onClick={() => save(null)}>
            Remove it
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setEditing(true)}>
          Set a date to be ready by
        </button>
      )}
    </div>
  );
}

/** One role: its text, and the requirements read out of it. */
function RoleDetail({
  role,
  criteria,
  actions,
  onProblem,
  onRead,
}: {
  role: ViewProps["role"] & object;
  criteria: ViewProps["record"]["criteria"];
  actions: ViewProps["actions"];
  onProblem: ViewProps["onProblem"];
  onRead: () => void;
}) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<CriterionKind>("responsibility");
  const [busy, setBusy] = useState(false);
  const [proposed, setProposed] = useState<
    { kind: CriterionKind; section: string; text: string; essential: boolean }[] | null
  >(null);

  const extract = async () => {
    setBusy(true);
    onProblem(null);
    try {
      const out = await extractCriteria({
        data: { text: role.sourceText, title: role.title },
      });
      if (!out.ok) onProblem(out.error);
      else if (!out.criteria.length) onProblem("Nothing in that text read as a requirement.");
      else setProposed(out.criteria);
    } catch (e) {
      onProblem(say(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cr-card">
      <header className="cr-card-head">
        <h2>{role.title}</h2>
        <button type="button" onClick={onRead}>
          Read against my evidence
        </button>
      </header>

      <TargetDate role={role} actions={actions} onProblem={onProblem} />

      {role.sourceText && (
        <details className="cr-original">
          <summary>The document, as written</summary>
          <pre>{role.sourceText}</pre>
        </details>
      )}

      <h3>Requirements</h3>
      <p className="cr-muted">
        Each one is assessed on its own, so keep them to a single thing a person could show they
        have done.
      </p>

      <ul className="cr-criteria">
        {criteria.map((c) => (
          <li key={c.id}>
            <span className={`cr-kind is-${c.kind}`}>{CRITERION_KIND_LABEL[c.kind]}</span>
            <span className="cr-criterion-text">{c.text}</span>
            {!c.essential && <span className="cr-desirable">Desirable</span>}
            <button
              type="button"
              className="cr-remove"
              aria-label={`Remove ${c.text}`}
              onClick={() =>
                void actions.removeCriterion.mutateAsync(c.id).catch((e) => onProblem(say(e)))
              }
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form
        className="cr-add-criterion"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          void actions.addCriteria
            .mutateAsync({
              roleId: role.id,
              rows: [{ text: text.trim(), kind, sortOrder: criteria.length }],
            })
            .then(() => setText(""))
            .catch((err) => onProblem(say(err)));
        }}
      >
        <select value={kind} onChange={(e) => setKind(e.target.value as CriterionKind)}>
          {CRITERION_KINDS.map((k) => (
            <option key={k} value={k}>
              {CRITERION_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a requirement, in the employer's words"
          aria-label="Add a requirement"
        />
        <button type="submit" disabled={!text.trim()}>
          Add
        </button>
      </form>

      {/* Off by default. The wording of a requirement is the thing a lawyer
          will later argue they meet, so writing it is theirs; this is here for
          the forty-bullet framework nobody wants to retype. */}
      {role.sourceText && !proposed && (
        <div className="cr-extract">
          <button type="button" onClick={() => void extract()} disabled={busy}>
            {busy ? "Reading the document…" : "Read the requirements out of it with AI"}
          </button>
          <span>
            Proposes requirements from the text above in the employer's own words. Nothing is saved
            until you accept it, and the assessment never uses AI.
          </span>
        </div>
      )}

      {proposed && (
        <div className="cr-proposed">
          <h4>{proposed.length} proposed. Accept the ones that are right.</h4>
          <ul>
            {proposed.map((p, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" defaultChecked data-i={i} />
                  <span className={`cr-kind is-${p.kind}`}>{CRITERION_KIND_LABEL[p.kind]}</span>
                  <span>{p.text}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="cr-actions">
            <button type="button" onClick={() => setProposed(null)}>
              Discard
            </button>
            <button
              type="button"
              className="cr-primary"
              onClick={() => {
                const boxes = [
                  ...document.querySelectorAll<HTMLInputElement>(
                    ".cr-proposed input[type=checkbox]",
                  ),
                ];
                const rows = proposed
                  .filter((_, i) => boxes[i]?.checked)
                  .map((p, i) => ({ ...p, sortOrder: criteria.length + i }));
                if (!rows.length) return setProposed(null);
                void actions.addCriteria
                  .mutateAsync({ roleId: role.id, rows })
                  .then(() => setProposed(null))
                  .catch((e) => onProblem(say(e)));
              }}
            >
              Add the ticked ones
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
