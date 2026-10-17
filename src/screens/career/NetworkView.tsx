/**
 * The register of people.
 *
 * It opens on the question a lawyer actually arrives with — "who do I know who
 * can help with this?" — because that is the one asked in a hurry, usually
 * with a problem already in hand. The subjects underneath it are the register
 * seen from the other side: everything anybody in it knows about, commonest
 * first, so it can be browsed when the question is vaguer than a search box.
 *
 * What it does not do is chase. There are no reminders, no streaks and no
 * badge counting how many people you have "engaged". The one nudge is a quiet
 * line naming people you would call today and have not spoken to in a year,
 * and it is only drawn when there are any.
 */
import { useMemo, useState } from "react";
import {
  CLOSENESS,
  CLOSENESS_LABEL,
  CLOSENESS_MEANING,
  MILESTONE_KINDS,
  MILESTONE_LABEL,
  type Closeness,
  type Contact,
  type MilestoneKind,
} from "@/lib/career/profile";
import { expertiseIndex, goneQuiet, recentMilestones, whoCanHelp } from "@/lib/career/network";
import { fmtDate } from "@/lib/career/model";
import { say, type ProfileProps } from "./shared";

export default function NetworkView({ record, actions, onProblem }: ProfileProps) {
  const [term, setTerm] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const people = record.contacts.filter((c) => !c.archivedAt);
  const matches = useMemo(() => whoCanHelp(people, term), [people, term]);
  const subjects = useMemo(() => expertiseIndex(people), [people]);
  const quiet = useMemo(() => goneQuiet(people), [people]);
  const milestones = useMemo(
    () => recentMilestones(people, record.milestones, 6),
    [people, record.milestones],
  );

  const shown = term.trim() ? matches.map((m) => m.contact) : people;

  return (
    <div className="cr-list">
      <section className="cr-card">
        <div className="cr-card-head">
          <h2>Who do I know who can help with this?</h2>
          <button type="button" className="cr-primary" onClick={() => setAdding(true)}>
            Add someone
          </button>
        </div>
        <input
          className="cr-ask"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Mining regulation · arbitration in Accra · someone at Bentsi-Enchill"
          aria-label="Search the people you know"
        />
        {term.trim() && (
          <p className="cr-muted">
            {matches.length
              ? `${matches.length} ${matches.length === 1 ? "person" : "people"}, the ones you can actually ask first.`
              : "Nobody in your register on that. It is worth knowing that too."}
          </p>
        )}
        {!term.trim() && subjects.length > 0 && (
          <>
            {/* The register from the other side: what it collectively knows. */}
            <div className="cr-bubbles">
              {subjects.map((s) => (
                <button key={s.subject} type="button" onClick={() => setTerm(s.subject)}>
                  {s.subject}
                  <span>{s.people.length}</span>
                </button>
              ))}
            </div>
            <p className="cr-muted">
              {people.length} {people.length === 1 ? "person" : "people"} across {subjects.length}{" "}
              {subjects.length === 1 ? "subject" : "subjects"}.
            </p>
          </>
        )}
      </section>

      {adding && (
        <section className="cr-card cr-span">
          <h2>Someone you know</h2>
          <ContactForm
            onCancel={() => setAdding(false)}
            onSave={(row) =>
              void actions.addContact
                .mutateAsync(row)
                .then(() => setAdding(false))
                .catch((e) => onProblem(say(e)))
            }
          />
        </section>
      )}

      {!people.length && !adding && (
        <p className="cr-muted">
          Nobody recorded yet. The people worth keeping here are the ones you could actually call:
          who they are, what they are good at, and how you know them well enough to ask.
        </p>
      )}

      {shown.map((c) => (
        <ContactCard
          key={c.id}
          contact={c}
          record={record}
          actions={actions}
          onProblem={onProblem}
          matchedOn={matches.find((m) => m.contact.id === c.id)?.on ?? []}
          open={openId === c.id}
          onToggle={() => setOpenId(openId === c.id ? null : c.id)}
        />
      ))}

      {milestones.length > 0 && !term.trim() && (
        <section className="cr-card">
          <h2>What has happened to them</h2>
          <p className="cr-muted">
            Read before you reach out, so it is informed rather than awkward.
          </p>
          <ul className="cr-ev-list">
            {milestones.map(({ milestone, contact }) => (
              <li key={milestone.id}>
                <strong>
                  {contact ? `${contact.name}: ` : "You: "}
                  {milestone.headline}
                </strong>
                <span className="cr-muted">
                  {[MILESTONE_LABEL[milestone.kind], fmtDate(milestone.happenedOn), milestone.note]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The only nudge, and only when it has something to say. */}
      {quiet.length > 0 && !term.trim() && (
        <p className="cr-muted">
          Not spoken to in over a year: {quiet.map((c) => c.name).join(", ")}.
        </p>
      )}
    </div>
  );
}

function ContactCard({
  contact,
  record,
  actions,
  onProblem,
  matchedOn,
  open,
  onToggle,
}: {
  contact: Contact;
  record: ProfileProps["record"];
  actions: ProfileProps["actions"];
  onProblem: ProfileProps["onProblem"];
  matchedOn: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const [logging, setLogging] = useState(false);
  const theirs = record.milestones.filter((m) => m.contactId === contact.id);

  return (
    <article className={`cr-person${open ? " is-open" : ""}`}>
      <button type="button" className="cr-person-head" onClick={onToggle} aria-expanded={open}>
        <span className="cr-person-who">
          <strong>{contact.name}</strong>
          <span className="cr-muted">
            {[contact.role, contact.organisation, contact.location].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className={`cr-close is-${contact.closeness}`}>
          {CLOSENESS_LABEL[contact.closeness]}
        </span>
        <span className="cr-claimed">
          {contact.expertise.slice(0, 3).map((e) => (
            <span key={e} className={`cr-chip${matchedOn.includes(e) ? " is-hit" : ""}`}>
              {e}
            </span>
          ))}
          {contact.expertise.length > 3 && (
            <span className="cr-muted">+{contact.expertise.length - 3}</span>
          )}
        </span>
      </button>

      {open && (
        <div className="cr-person-body">
          <dl className="cr-facts">
            {contact.callOn && (
              <div>
                <dt>You can call on them for</dt>
                <dd>{contact.callOn}</dd>
              </div>
            )}
            {contact.theyCallOn && (
              <div>
                <dt>They call on you for</dt>
                <dd>{contact.theyCallOn}</dd>
              </div>
            )}
            {contact.howYouMet && (
              <div>
                <dt>How you know them</dt>
                <dd>{contact.howYouMet}</dd>
              </div>
            )}
            <div>
              <dt>How well</dt>
              <dd>{CLOSENESS_MEANING[contact.closeness]}</dd>
            </div>
            {(contact.email || contact.phone) && (
              <div>
                <dt>Reach them</dt>
                <dd>{[contact.email, contact.phone].filter(Boolean).join(" · ")}</dd>
              </div>
            )}
            <div>
              <dt>Last spoke</dt>
              <dd>{contact.lastContactOn ? fmtDate(contact.lastContactOn) : "Not recorded"}</dd>
            </div>
          </dl>

          {contact.notes && <p className="cr-statement">{contact.notes}</p>}

          {theirs.length > 0 && (
            <div>
              <h4>Milestones</h4>
              <ul className="cr-ev-list">
                {theirs.map((m) => (
                  <li key={m.id}>
                    <strong>{m.headline}</strong>
                    <span className="cr-muted">
                      {[MILESTONE_LABEL[m.kind], fmtDate(m.happenedOn), m.note]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="cr-actions cr-actions-left">
            <button
              type="button"
              onClick={() =>
                void actions.patchContact
                  .mutateAsync({
                    id: contact.id,
                    row: { last_contact_on: new Date().toISOString().slice(0, 10) },
                  })
                  .catch((e) => onProblem(say(e)))
              }
            >
              Spoke to them today
            </button>
            <button type="button" onClick={() => setLogging((v) => !v)}>
              {logging ? "Close" : "Record a milestone"}
            </button>
            <button
              type="button"
              className="cr-danger"
              onClick={() =>
                void actions.removeContact.mutateAsync(contact.id).catch((e) => onProblem(say(e)))
              }
            >
              Remove
            </button>
          </div>

          {logging && (
            <MilestoneForm
              onCancel={() => setLogging(false)}
              onSave={(row) =>
                void actions.addMilestone
                  .mutateAsync({ ...row, contact_id: contact.id })
                  .then(() => setLogging(false))
                  .catch((e) => onProblem(say(e)))
              }
            />
          )}
        </div>
      )}
    </article>
  );
}

function MilestoneForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (row: Record<string, unknown>) => void;
}) {
  const [kind, setKind] = useState<MilestoneKind>("promotion");
  const [headline, setHeadline] = useState("");
  const [happenedOn, setHappenedOn] = useState("");
  const [note, setNote] = useState("");
  return (
    <form
      className="cr-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!headline.trim()) return;
        onSave({
          kind,
          headline: headline.trim(),
          happened_on: happenedOn || null,
          note: note.trim(),
        });
      }}
    >
      <div className="cr-row cr-row-3">
        <label>
          What happened
          <select value={kind} onChange={(e) => setKind(e.target.value as MilestoneKind)}>
            {MILESTONE_KINDS.map((k) => (
              <option key={k} value={k}>
                {MILESTONE_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          In a line
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Made partner at Bentsi-Enchill"
            autoFocus
            required
          />
        </label>
        <label>
          When
          <input type="date" value={happenedOn} onChange={(e) => setHappenedOn(e.target.value)} />
        </label>
      </div>
      <label>
        Anything worth remembering
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="cr-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="cr-primary" disabled={!headline.trim()}>
          Record it
        </button>
      </div>
    </form>
  );
}

function ContactForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (row: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [closeness, setCloseness] = useState<Closeness>("known");
  const [expertise, setExpertise] = useState("");
  const [callOn, setCallOn] = useState("");
  const [theyCallOn, setTheyCallOn] = useState("");
  const [howYouMet, setHowYouMet] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [lastContactOn, setLastContactOn] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <form
      className="cr-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({
          name: name.trim(),
          organisation: organisation.trim(),
          role: role.trim(),
          location: location.trim(),
          closeness,
          expertise: expertise
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          call_on: callOn.trim(),
          they_call_on: theyCallOn.trim(),
          how_you_met: howYouMet.trim(),
          email: email.trim(),
          phone: phone.trim(),
          last_contact_on: lastContactOn || null,
          notes: notes.trim(),
        });
      }}
    >
      <div className="cr-row cr-row-3">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label>
          Firm or organisation
          <input value={organisation} onChange={(e) => setOrganisation(e.target.value)} />
        </label>
        <label>
          What they do
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Partner" />
        </label>
      </div>
      <label>
        What they are good at
        <input
          value={expertise}
          onChange={(e) => setExpertise(e.target.value)}
          placeholder="Mining law, Ghana regulatory, Arbitration — separated by commas"
        />
      </label>
      <div className="cr-row">
        <label>
          You can call on them for
          <input
            value={callOn}
            onChange={(e) => setCallOn(e.target.value)}
            placeholder="A read on the Minerals Commission"
          />
        </label>
        <label>
          They call on you for
          <input value={theyCallOn} onChange={(e) => setTheyCallOn(e.target.value)} />
        </label>
      </div>
      <div className="cr-row cr-row-3">
        <label>
          How well you know them
          <select value={closeness} onChange={(e) => setCloseness(e.target.value as Closeness)}>
            {CLOSENESS.map((c) => (
              <option key={c} value={c}>
                {CLOSENESS_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          How you met
          <input
            value={howYouMet}
            onChange={(e) => setHowYouMet(e.target.value)}
            placeholder="Opposite side on Bugatti"
          />
        </label>
        <label>
          Last spoke
          <input
            type="date"
            value={lastContactOn}
            onChange={(e) => setLastContactOn(e.target.value)}
          />
        </label>
      </div>
      <div className="cr-row cr-row-3">
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          Based in
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      </div>
      <label>
        Anything else worth remembering
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="cr-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="cr-primary" disabled={!name.trim()}>
          Add to the register
        </button>
      </div>
    </form>
  );
}
