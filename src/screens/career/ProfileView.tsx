/**
 * Your own record: who you are, where you have been, what you hold.
 *
 * Built in the sections a lawyer already keeps elsewhere, because that is the
 * shape they think in — a headline, a paragraph, the positions, the degrees,
 * the certificates, the skills. What is missing is what makes those other
 * profiles performances: nobody follows this, nobody endorses it, and no
 * number says how complete you are. It is written once here and read by the
 * CV, the application and the promotion case.
 */
import { useState } from "react";
import {
  CLOSENESS_LABEL,
  EMPLOYMENTS,
  EMPLOYMENT_LABEL,
  type Credential,
  type Education,
  type Employment,
  type Position,
  type ProfileRecord,
  type Profile,
} from "@/lib/career/profile";
import { profileGaps, readSkills } from "@/lib/career/network";
import { fmtDate } from "@/lib/career/model";
import type { ProfileProps } from "./shared";
import { say } from "./shared";

/** "Dec 2023 — Present · 2 yrs 10 mos", the way a career is written. */
function span(from: string | null, to: string | null, current: boolean) {
  const month = (iso: string | null) =>
    iso
      ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
          month: "short",
          year: "numeric",
        })
      : "";
  const end = current ? "Present" : month(to);
  const head = [month(from), end].filter(Boolean).join(" – ");
  if (!from) return head;
  const started = new Date(`${from}T00:00:00`).getTime();
  const ended = current || !to ? Date.now() : new Date(`${to}T00:00:00`).getTime();
  const months = Math.max(0, Math.round((ended - started) / (30.44 * 24 * 3600 * 1000)));
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const length = [
    years ? `${years} yr${years === 1 ? "" : "s"}` : "",
    rest ? `${rest} mo${rest === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return [head, length].filter(Boolean).join(" · ");
}

export default function ProfileView({ record, actions, onProblem }: ProfileProps) {
  const [editing, setEditing] = useState<
    null | "profile" | "position" | "education" | "credential"
  >(null);
  const gaps = profileGaps(record);
  const skills = readSkills(record.skills, record.positions, record.credentials);
  const mine = record.milestones.filter((m) => !m.contactId);

  return (
    <div className="cr-list">
      {/* The header: name comes from the account, the rest is theirs to write. */}
      <section className="cr-card cr-profile-head">
        <div className="cr-card-head">
          <h2>{record.profile.headline || "Your profile"}</h2>
          <button
            type="button"
            onClick={() => setEditing(editing === "profile" ? null : "profile")}
          >
            {editing === "profile" ? "Close" : record.profile.headline ? "Edit" : "Fill this in"}
          </button>
        </div>
        {editing === "profile" ? (
          <ProfileForm
            profile={record.profile}
            onCancel={() => setEditing(null)}
            onSave={(p) =>
              void actions.saveProfile
                .mutateAsync(p)
                .then(() => setEditing(null))
                .catch((e) => onProblem(say(e)))
            }
          />
        ) : (
          <>
            {record.profile.about ? (
              <p className="cr-statement">{record.profile.about}</p>
            ) : (
              <p className="cr-muted">
                A paragraph about your practice: what you do, where, and what you are known for.
                This is what an application or a CV is written from.
              </p>
            )}
            <div className="cr-profile-facts">
              {record.profile.admissions && <span>Admitted: {record.profile.admissions}</span>}
              {record.profile.location && <span>{record.profile.location}</span>}
              {record.profile.email && <span>{record.profile.email}</span>}
              {record.profile.website && <span>{record.profile.website}</span>}
            </div>
            {/* Said once, in plain words, and never as a percentage. */}
            {gaps.length > 0 && <p className="cr-muted">Still blank: {gaps.join(", ")}.</p>}
          </>
        )}
      </section>

      <Section
        title="Experience"
        blurb="Every position, including the ones that are not jobs — pupillage, secondments, internships."
        onAdd={() => setEditing(editing === "position" ? null : "position")}
        adding={editing === "position"}
        form={
          <PositionForm
            onCancel={() => setEditing(null)}
            onSave={(row) =>
              void actions.addPosition
                .mutateAsync(row)
                .then(() => setEditing(null))
                .catch((e) => onProblem(say(e)))
            }
          />
        }
      >
        {record.positions.map((p) => (
          <article key={p.id} className="cr-entry">
            <div className="cr-entry-main">
              <strong>{p.title}</strong>
              <span>
                {[p.organisation, EMPLOYMENT_LABEL[p.employment]].filter(Boolean).join(" · ")}
              </span>
              <span className="cr-muted">
                {[span(p.startedOn, p.endedOn, p.current), p.location].filter(Boolean).join(" · ")}
              </span>
              {p.summary && <p className="cr-statement">{p.summary}</p>}
              {p.skills.length > 0 && (
                <div className="cr-claimed">
                  {p.skills.map((s) => (
                    <span key={s} className="cr-chip">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="cr-remove"
              aria-label={`Remove ${p.title}`}
              onClick={() =>
                void actions.removePosition.mutateAsync(p.id).catch((e) => onProblem(say(e)))
              }
            >
              ×
            </button>
          </article>
        ))}
      </Section>

      <Section
        title="Education"
        blurb=""
        onAdd={() => setEditing(editing === "education" ? null : "education")}
        adding={editing === "education"}
        form={
          <EducationForm
            onCancel={() => setEditing(null)}
            onSave={(row) =>
              void actions.addEducation
                .mutateAsync(row)
                .then(() => setEditing(null))
                .catch((e) => onProblem(say(e)))
            }
          />
        }
      >
        {record.education.map((e) => (
          <article key={e.id} className="cr-entry">
            <div className="cr-entry-main">
              <strong>{e.institution}</strong>
              <span>{[e.qualification, e.field].filter(Boolean).join(" · ")}</span>
              <span className="cr-muted">{span(e.startedOn, e.endedOn, false)}</span>
              {e.note && <p className="cr-statement">{e.note}</p>}
            </div>
            <button
              type="button"
              className="cr-remove"
              aria-label={`Remove ${e.institution}`}
              onClick={() =>
                void actions.removeEducation.mutateAsync(e.id).catch((err) => onProblem(say(err)))
              }
            >
              ×
            </button>
          </article>
        ))}
      </Section>

      <Section
        title="Licences and certifications"
        blurb="Your practising certificate, and anything else with an issuer and a date."
        onAdd={() => setEditing(editing === "credential" ? null : "credential")}
        adding={editing === "credential"}
        form={
          <CredentialForm
            onCancel={() => setEditing(null)}
            onSave={(row) =>
              void actions.addCredential
                .mutateAsync(row)
                .then(() => setEditing(null))
                .catch((e) => onProblem(say(e)))
            }
          />
        }
      >
        {record.credentials.map((c) => (
          <article key={c.id} className="cr-entry">
            <div className="cr-entry-main">
              <strong>{c.name}</strong>
              <span>{c.issuer}</span>
              <span className="cr-muted">
                {[
                  c.issuedOn ? `Issued ${fmtDate(c.issuedOn)}` : "",
                  c.expiresOn ? `Expires ${fmtDate(c.expiresOn)}` : "",
                  c.credentialId ? `No. ${c.credentialId}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer">
                  Show credential
                </a>
              )}
            </div>
            <button
              type="button"
              className="cr-remove"
              aria-label={`Remove ${c.name}`}
              onClick={() =>
                void actions.removeCredential.mutateAsync(c.id).catch((e) => onProblem(say(e)))
              }
            >
              ×
            </button>
          </article>
        ))}
      </Section>

      {/* Skills say where they come from rather than how many people clicked a
          button. One named nowhere else is an assertion, and says so. */}
      <section className="cr-card">
        <div className="cr-card-head">
          <h2>Skills{skills.length ? ` (${skills.length})` : ""}</h2>
        </div>
        <form
          className="cr-add-criterion"
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.querySelector("input")!;
            const name = input.value.trim();
            if (!name) return;
            void actions.addSkill
              .mutateAsync(name)
              .then(() => (input.value = ""))
              .catch((err) => onProblem(say(err)));
          }}
        >
          <input placeholder="A skill you want to be known for" aria-label="Add a skill" />
          <button type="submit">Add</button>
        </form>
        {skills.length === 0 ? (
          <p className="cr-muted">
            Nothing yet. Skills also come from the positions and certificates above.
          </p>
        ) : (
          <ul className="cr-skills">
            {skills.map((s) => {
              const own = record.skills.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
              return (
                <li key={s.name}>
                  <strong>{s.name}</strong>
                  {s.assertedOnly ? (
                    <span className="cr-muted">Named here only</span>
                  ) : (
                    <span className="cr-muted">From {s.from.join("; ")}</span>
                  )}
                  {own && (
                    <button
                      type="button"
                      className="cr-remove"
                      aria-label={`Remove ${s.name}`}
                      onClick={() =>
                        void actions.removeSkill.mutateAsync(own.id).catch((e) => onProblem(say(e)))
                      }
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {mine.length > 0 && (
        <section className="cr-card">
          <h2>Your milestones</h2>
          <ul className="cr-ev-list">
            {mine.map((m) => (
              <li key={m.id}>
                <strong>{m.headline}</strong>
                <span className="cr-muted">
                  {[fmtDate(m.happenedOn), m.note].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Section({
  title,
  blurb,
  onAdd,
  adding,
  form,
  children,
}: {
  title: string;
  blurb: string;
  onAdd: () => void;
  adding: boolean;
  form: React.ReactNode;
  children: React.ReactNode;
}) {
  const empty = !Array.isArray(children) || children.length === 0;
  return (
    <section className="cr-card">
      <div className="cr-card-head">
        <h2>{title}</h2>
        <button type="button" onClick={onAdd}>
          {adding ? "Close" : "Add"}
        </button>
      </div>
      {blurb && !adding && <p className="cr-muted">{blurb}</p>}
      {adding && form}
      {empty && !adding && <p className="cr-muted">Nothing recorded yet.</p>}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ forms */

function ProfileForm({
  profile,
  onCancel,
  onSave,
}: {
  profile: Profile;
  onCancel: () => void;
  onSave: (p: Profile) => void;
}) {
  const [f, setF] = useState<Profile>(profile);
  const on = (k: keyof Profile) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="cr-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(f);
      }}
    >
      <label>
        Headline
        <input
          value={f.headline}
          onChange={on("headline")}
          placeholder="Legal Associate · Dispute resolution · Data protection"
          autoFocus
        />
      </label>
      <label>
        About
        <textarea
          rows={6}
          value={f.about}
          onChange={on("about")}
          placeholder="What you do, where, and what you are known for."
        />
      </label>
      <div className="cr-row cr-row-3">
        <label>
          Admitted
          <input
            value={f.admissions}
            onChange={on("admissions")}
            placeholder="Ghana, 2022 · England & Wales (non-practising)"
          />
        </label>
        <label>
          Based in
          <input value={f.location} onChange={on("location")} placeholder="Dubai, UAE" />
        </label>
        <label>
          Website
          <input value={f.website} onChange={on("website")} placeholder="" />
        </label>
      </div>
      <div className="cr-row">
        <label>
          Email
          <input value={f.email} onChange={on("email")} placeholder="Your own, not the firm's" />
        </label>
        <label>
          Phone
          <input value={f.phone} onChange={on("phone")} />
        </label>
      </div>
      <div className="cr-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="cr-primary">
          Save
        </button>
      </div>
    </form>
  );
}

const asSkills = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function PositionForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (row: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [employment, setEmployment] = useState<Employment>("full_time");
  const [location, setLocation] = useState("");
  const [startedOn, setStartedOn] = useState("");
  const [endedOn, setEndedOn] = useState("");
  const [current, setCurrent] = useState(false);
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState("");
  return (
    <form
      className="cr-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({
          title: title.trim(),
          organisation: organisation.trim(),
          employment,
          location: location.trim(),
          started_on: startedOn || null,
          ended_on: current ? null : endedOn || null,
          current,
          summary: summary.trim(),
          skills: asSkills(skills),
        });
      }}
    >
      <div className="cr-row cr-row-3">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        </label>
        <label>
          Firm or organisation
          <input value={organisation} onChange={(e) => setOrganisation(e.target.value)} />
        </label>
        <label>
          Kind
          <select value={employment} onChange={(e) => setEmployment(e.target.value as Employment)}>
            {EMPLOYMENTS.map((k) => (
              <option key={k} value={k}>
                {EMPLOYMENT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="cr-row cr-row-3">
        <label>
          From
          <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </label>
        <label>
          To
          <input
            type="date"
            value={endedOn}
            disabled={current}
            onChange={(e) => setEndedOn(e.target.value)}
          />
        </label>
        <label>
          Where
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      </div>
      <label className="cr-check">
        <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} />I
        am still here
      </label>
      <label>
        What you did
        <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <label>
        Skills it gave you
        <input
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          placeholder="Legal research, Dispute resolution — separated by commas"
        />
      </label>
      <div className="cr-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="cr-primary" disabled={!title.trim()}>
          Add
        </button>
      </div>
    </form>
  );
}

function EducationForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (row: Record<string, unknown>) => void;
}) {
  const [institution, setInstitution] = useState("");
  const [qualification, setQualification] = useState("");
  const [field, setField] = useState("");
  const [startedOn, setStartedOn] = useState("");
  const [endedOn, setEndedOn] = useState("");
  return (
    <form
      className="cr-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!institution.trim()) return;
        onSave({
          institution: institution.trim(),
          qualification: qualification.trim(),
          field: field.trim(),
          started_on: startedOn || null,
          ended_on: endedOn || null,
        });
      }}
    >
      <div className="cr-row cr-row-3">
        <label>
          Institution
          <input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            autoFocus
            required
          />
        </label>
        <label>
          Qualification
          <input
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
            placeholder="LLB, LPC, LLM"
          />
        </label>
        <label>
          Field
          <input value={field} onChange={(e) => setField(e.target.value)} placeholder="Law" />
        </label>
      </div>
      <div className="cr-row">
        <label>
          From
          <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={endedOn} onChange={(e) => setEndedOn(e.target.value)} />
        </label>
      </div>
      <div className="cr-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="cr-primary" disabled={!institution.trim()}>
          Add
        </button>
      </div>
    </form>
  );
}

function CredentialForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (row: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [url, setUrl] = useState("");
  const [skills, setSkills] = useState("");
  return (
    <form
      className="cr-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({
          name: name.trim(),
          issuer: issuer.trim(),
          issued_on: issuedOn || null,
          expires_on: expiresOn || null,
          credential_id: credentialId.trim(),
          url: url.trim(),
          skills: asSkills(skills),
        });
      }}
    >
      <div className="cr-row">
        <label>
          What it is
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label>
          Issued by
          <input value={issuer} onChange={(e) => setIssuer(e.target.value)} />
        </label>
      </div>
      <div className="cr-row cr-row-3">
        <label>
          Issued
          <input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
        </label>
        <label>
          Expires (if it does)
          <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        </label>
        <label>
          Credential number
          <input value={credentialId} onChange={(e) => setCredentialId(e.target.value)} />
        </label>
      </div>
      <div className="cr-row">
        <label>
          Link
          <input value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label>
          Skills it shows
          <input
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="Separated by commas"
          />
        </label>
      </div>
      <div className="cr-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="cr-primary" disabled={!name.trim()}>
          Add
        </button>
      </div>
    </form>
  );
}
