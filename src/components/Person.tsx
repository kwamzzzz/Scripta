/**
 * A person, shown the two ways Scripta needs to show one.
 *
 * `Avatar` is initials in a circle, and it exists to make a board scannable —
 * a column of eight names is read; a column of eight faces is glanced at. It is
 * deliberately small and quiet, and it never appears on its own where knowing
 * exactly who is responsible matters. Responsibility is a name.
 *
 * `PersonPicker` is the other half: the end of free-text ownership. A
 * deliverable's owner used to be a text box with a twelve-character limit,
 * which is how an em dash came to be rendered as somebody's name on the flow
 * board. There are now two valid answers — a member of the matter team, or
 * nobody — and no third.
 */
import { useMemo } from "react";
import { displayName, initialsOf, useProfileNames } from "@/lib/matter-team";
import { useAuth } from "@/lib/auth";

import "./person.css";

export function Avatar({
  name,
  email = "",
  size = 24,
  tone = "quiet",
  title,
}: {
  name: string;
  email?: string;
  size?: number;
  /** `self` marks the signed-in person, the one face worth distinguishing. */
  tone?: "quiet" | "self";
  title?: string;
}) {
  return (
    <span
      className={`px-avatar${tone === "self" ? " is-self" : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      title={title ?? name}
      aria-hidden="true"
    >
      {initialsOf(name, email)}
    </span>
  );
}

/**
 * A face and a name together, for the places that have room for both.
 *
 * The name carries the accessible text; the circle is decorative, which is why
 * `Avatar` is aria-hidden. A screen reader hearing "MA Mawusi Kwame Adusu"
 * would be hearing the initials twice.
 */
export function PersonLine({
  name,
  email = "",
  size = 22,
  tone = "quiet",
}: {
  name: string;
  email?: string;
  size?: number;
  tone?: "quiet" | "self";
}) {
  return (
    <span className="px-person">
      <Avatar name={name} email={email} size={size} tone={tone} />
      <span className="px-person-name">{name}</span>
    </span>
  );
}

/**
 * Who is responsible: somebody on the matter team, or nobody.
 *
 * Restricted to the team on purpose. Responsibility for a piece of a matter
 * cannot sit with a person who is not on the matter — that is how a task ends
 * up owned by somebody who has never heard of the file. If the person you want
 * is not in the list, they are added to the team first, which is a decision
 * rather than an inconvenience.
 *
 * A value that is no longer on the team is kept and shown rather than silently
 * dropped, because it is the only surviving record of who was meant to do
 * something.
 */
export type PickablePerson = { userId: string; name: string; email?: string };

export function PersonPicker({
  value,
  team,
  onChange,
  id,
  unassignedLabel = "Unassigned",
  disabled = false,
}: {
  value: string | null;
  /** Who may hold this responsibility. The matter team, where there is one. */
  team: PickablePerson[];
  onChange: (userId: string | null) => void;
  id?: string;
  unassignedLabel?: string;
  disabled?: boolean;
}) {
  const stale = useMemo(
    () => (value && !team.some((m) => m.userId === value) ? value : null),
    [value, team],
  );

  return (
    <select
      {...(id ? { id } : {})}
      className="px-person-picker"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{unassignedLabel}</option>
      {team.map((m) => (
        <option key={m.userId} value={m.userId}>
          {displayName(m)}
        </option>
      ))}
      {stale && <option value={stale}>Somebody no longer on this matter</option>}
    </select>
  );
}

/**
 * Who owns a piece of work, wherever a row has to say so.
 *
 * Three states, and the middle one is why this exists. A deliverable may point
 * at a real person; it may carry initials somebody typed into the old free-text
 * box months ago; or it may belong to nobody. The second is shown as what it is
 * — a note, not a person — rather than being dressed up as one, because a row
 * that renders "SKA" identically whether it is a colleague or a string is how
 * an em dash came to be somebody's name on the flow board.
 */
export function OwnerTag({
  ownerId,
  legacy = "",
  showAvatar = true,
}: {
  ownerId?: string | null | undefined;
  /** What was typed before owners were people. Never treated as one. */
  legacy?: string | undefined;
  showAvatar?: boolean | undefined;
}) {
  const names = useProfileNames();
  const person = ownerId ? names.data?.get(ownerId) : undefined;

  if (ownerId && person)
    return showAvatar ? (
      <PersonLine name={person.name} email={person.email} size={18} />
    ) : (
      <span className="px-person-name">{person.name}</span>
    );

  // A real id we cannot name yet: the names are still loading, or they have
  // left the firm. Either way, not "Unassigned".
  if (ownerId) return <span className="px-owner-unknown">Someone at the firm</span>;

  const note = legacy.replace(/^[—–-]$/, "").trim();
  if (note)
    return (
      <span className="px-owner-legacy" title="Typed before owners were people">
        {note}
      </span>
    );

  return <span className="px-owner-none">Unassigned</span>;
}

/**
 * A face on a row, and only where it earns its place.
 *
 * Shown when the work is somebody else's: your own name on your own list is
 * noise, and a column of identical self-portraits scans no better than a blank
 * one. A colleague's initials, on the other hand, are the fastest way to see
 * that a row is not yours.
 *
 * The name stays reachable on hover and to a screen reader. Where knowing
 * exactly who is responsible matters — the detail panel, the manage dialog —
 * the name is written out instead.
 */
export function AssigneeMark({ userId }: { userId?: string | null | undefined }) {
  const { user } = useAuth();
  const names = useProfileNames();
  if (!userId || userId === user?.id) return null;
  const person = names.data?.get(userId);
  if (!person) return null;
  return (
    <span className="px-assignee" title={person.name}>
      <Avatar name={person.name} email={person.email} size={18} />
      <span className="sr-only">Assigned to {person.name}</span>
    </span>
  );
}
