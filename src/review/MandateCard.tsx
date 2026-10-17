/**
 * The review mandate: who we act for, and what we were asked to do.
 *
 * This sits above the administrative fields because it is what the review is,
 * and the reference number is only how it is filed. Scripta cannot say whether
 * a clause is bad for the client until it is told which party the client is.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/primitives";
import { PRIORITY_SUGGESTIONS, REVIEW_DEPTHS, type ReviewMandate } from "./model";
import { Card, Chip, Eyebrow, Field, Growing } from "./ui";
import { fmtWhen } from "./format";

export default function MandateCard({
  mandate,
  parties,
  saving,
  onSave,
}: {
  mandate: ReviewMandate;
  /** The party names from the contract, offered so nobody retypes them. */
  parties: string[];
  saving: boolean;
  onSave: (next: Omit<ReviewMandate, "reviewedAt">) => void;
}) {
  const [draft, setDraft] = useState(mandate);
  // A save elsewhere, or the first load arriving, replaces an untouched draft.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(mandate);
  }, [mandate, dirty]);
  const edit = (patch: Partial<ReviewMandate>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const togglePriority = (p: string) =>
    edit({
      priorities: draft.priorities.includes(p)
        ? draft.priorities.filter((x) => x !== p)
        : [...draft.priorities, p],
    });

  const unset = !mandate.reviewFor.trim();
  // Once it is set, the mandate is something to read, not a form to fill in
  // again on every visit: the brief shows, and Edit brings the fields back.
  const [editing, setEditing] = useState(false);
  const depth = REVIEW_DEPTHS.find((d) => d.key === mandate.depth);
  const lastRead = mandate.reviewedAt ? (
    <Eyebrow>LAST READ {fmtWhen(mandate.reviewedAt).toUpperCase()}</Eyebrow>
  ) : (
    <Chip tone="quiet">Not yet reviewed</Chip>
  );

  if (!unset && !editing && !dirty) {
    return (
      <Card
        title="Review mandate"
        right={
          <span className="rv-row">
            {lastRead}
            <Button variant="quiet" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </span>
        }
      >
        <div className="rv-mandate">
          <p>
            For <strong>{mandate.reviewFor}</strong>
            {mandate.reviewRole.trim() && <> as {mandate.reviewRole}</>}
            {depth && <> · {depth.label}</>}
          </p>
          {mandate.instructions.trim() && <blockquote>{mandate.instructions}</blockquote>}
          {mandate.priorities.length > 0 && (
            <p className="rv-mandate-first">Look at first: {mandate.priorities.join(", ")}</p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Review mandate"
      hint={
        unset
          ? "Say who we act for. The same clause is a risk to one party and a protection to the other, so this decides every assessment below it."
          : undefined
      }
      right={lastRead}
    >
      <div className="rv-grid2">
        <Field label="Reviewing for" hint="The party we act for, as the contract names them.">
          <input
            className="rv-input"
            list="rv-parties"
            value={draft.reviewFor}
            placeholder="e.g. Nexis Africa FZ-LLC"
            onChange={(e) => edit({ reviewFor: e.target.value })}
          />
          <datalist id="rv-parties">
            {parties.filter(Boolean).map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Their role" hint="Buyer, Lender, Employer, Licensee, Offtaker.">
          <input
            className="rv-input"
            value={draft.reviewRole}
            placeholder="e.g. Purchaser"
            onChange={(e) => edit({ reviewRole: e.target.value })}
          />
        </Field>
      </div>

      <Field
        label="Review instructions"
        hint="What you were actually asked to do. Scripta reads this on every clause."
      >
        <Growing
          value={draft.instructions}
          rows={3}
          placeholder="e.g. Confirm we can exit on 30 days' notice, and flag anything that survives termination. The client will not accept an uncapped indemnity."
          onChange={(v) => edit({ instructions: v })}
        />
      </Field>

      <Field label="Depth">
        <select
          className="rv-input"
          value={draft.depth}
          onChange={(e) => edit({ depth: e.target.value })}
        >
          {REVIEW_DEPTHS.map((d) => (
            <option key={d.key} value={d.key} title={d.meaning}>
              {d.label} — {d.meaning}
            </option>
          ))}
        </select>
      </Field>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Eyebrow>LOOK AT THESE FIRST</Eyebrow>
        <div className="rv-filters">
          {PRIORITY_SUGGESTIONS.map((p) => (
            <button
              key={p}
              type="button"
              className={`rv-pill${draft.priorities.includes(p) ? " is-on" : ""}`}
              onClick={() => togglePriority(p)}
              aria-pressed={draft.priorities.includes(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="rv-row">
        <Button
          variant={unset ? "primary" : "secondary"}
          disabled={saving || !dirty}
          onClick={() => {
            onSave({
              reviewFor: draft.reviewFor,
              reviewRole: draft.reviewRole,
              instructions: draft.instructions,
              depth: draft.depth,
              priorities: draft.priorities,
            });
            setDirty(false);
            setEditing(false);
          }}
        >
          {saving ? "Saving…" : dirty ? "Save mandate" : "Saved"}
        </Button>
        {!unset && (
          <Button
            variant="quiet"
            onClick={() => {
              setDraft(mandate);
              setDirty(false);
              setEditing(false);
            }}
          >
            {dirty ? "Cancel" : "Done"}
          </Button>
        )}
        {dirty && (
          <span style={{ fontSize: 11.5, color: "#8a5b00" }}>
            Unsaved. Scripta reads the saved mandate, not this draft.
          </span>
        )}
      </div>
    </Card>
  );
}
