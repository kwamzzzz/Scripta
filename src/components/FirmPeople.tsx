/**
 * The people in the firm, and the people who have been asked.
 *
 * Two lists rather than one, because "a member" and "somebody we invited three
 * weeks ago who never replied" are different facts and an administrator needs
 * both. The old Settings screen showed the first and had no idea the second
 * could exist.
 *
 * Only an owner or an administrator sees any of this. For everybody else the
 * member list stays what it was: who is here. Inviting is administration, and
 * administration is not authorisation — none of it grants access to a single
 * matter, which is the whole point of the boundary this is the foundation for.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/primitives";
import ActionMenu from "@/components/ActionMenu";
import {
  createInvite,
  effectiveStatus,
  inviteLink,
  listInvites,
  resendInvite,
  revokeInvite,
  statusLabel,
  type Invite,
} from "@/lib/invites";
import type { WorkspaceRole } from "@/lib/workspace-role";

import "./firm-people.css";

/** What each firm role is for, in the words a firm would use. */
const ROLES: { value: WorkspaceRole; label: string; hint: string }[] = [
  { value: "admin", label: "Administrator", hint: "Manages people, paper and firm knowledge." },
  { value: "lawyer", label: "Lawyer", hint: "Creates matters and does the work." },
  { value: "viewer", label: "Viewer", hint: "Reads what they are given. Writes nothing." },
];

const roleLabel = (role: string) =>
  role === "owner" ? "Owner" : (ROLES.find((r) => r.value === role)?.label ?? role);

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

type Member = {
  id: string;
  role: string;
  user_id: string;
  person: { id: string; full_name: string | null; email: string | null } | null;
};

export default function FirmPeople({
  workspaceId,
  canAdminister,
}: {
  workspaceId: string;
  /** Owner or administrator. Decides whether invitations exist on this screen at all. */
  canAdminister: boolean;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("lawyer");
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ["members", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("id, role, user_id")
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { id: string; role: string; user_id: string }[];
      if (!rows.length) return [] as Member[];
      const { data: people, error: peopleError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in(
          "id",
          rows.map((r) => r.user_id),
        );
      if (peopleError) throw new Error(peopleError.message);
      return rows.map((r) => ({
        ...r,
        person: (people ?? []).find((p) => p.id === r.user_id) ?? null,
      })) as Member[];
    },
  });

  const invites = useQuery({
    queryKey: ["invites", workspaceId],
    enabled: canAdminister,
    queryFn: () => listInvites(workspaceId),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["invites", workspaceId] });
    void qc.invalidateQueries({ queryKey: ["members", workspaceId] });
  };

  const invite = useMutation({
    mutationFn: () => createInvite(workspaceId, email, role),
    onSuccess: (created) => {
      setEmail("");
      setNotice({ text: `Invitation ready for ${created.email}. Copy the link and send it.` });
      refresh();
    },
    onError: (cause: unknown) =>
      setNotice({
        text: cause instanceof Error ? cause.message : "The invitation could not be created.",
        bad: true,
      }),
  });

  const resend = useMutation({
    mutationFn: (id: string) => resendInvite(id),
    onSuccess: () => {
      setNotice({ text: "A new link has been issued. The old one no longer works." });
      refresh();
    },
    onError: (cause: unknown) =>
      setNotice({
        text: cause instanceof Error ? cause.message : "That invitation could not be resent.",
        bad: true,
      }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: () => {
      setNotice({ text: "The invitation has been cancelled." });
      refresh();
    },
    onError: (cause: unknown) =>
      setNotice({
        text: cause instanceof Error ? cause.message : "That invitation could not be cancelled.",
        bad: true,
      }),
  });

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      setCopied(token);
      window.setTimeout(() => setCopied((t) => (t === token ? null : t)), 2500);
    } catch {
      setNotice({ text: "The link could not be copied. Select it by hand.", bad: true });
    }
  };

  const open = (invites.data ?? []).filter((i) => effectiveStatus(i) === "pending");
  const closed = (invites.data ?? []).filter((i) => effectiveStatus(i) !== "pending");

  const actionsFor = (i: Invite) => {
    const live = effectiveStatus(i) === "pending";
    const actions = [
      ...(live ? [{ label: "Copy link", onClick: () => void copy(i.token) }] : []),
      { label: live ? "Issue a new link" : "Invite again", onClick: () => resend.mutate(i.id) },
      ...(live
        ? [{ label: "Cancel invitation", onClick: () => revoke.mutate(i.id), danger: true }]
        : []),
    ];
    return actions;
  };

  return (
    <div className="firm-people">
      <div>
        <h3>Members</h3>
        {members.isLoading ? (
          <p role="status">Loading members…</p>
        ) : members.isError ? (
          <div className="settings-notice is-error" role="alert">
            <p>Members could not be loaded.</p>
            <Button onClick={() => void members.refetch()}>Try again</Button>
          </div>
        ) : (
          <ul className="settings-list">
            {(members.data ?? []).map((m) => (
              <li key={m.id}>
                <span>{m.person?.full_name ?? m.person?.email ?? m.user_id}</span>
                <small>{roleLabel(m.role)}</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canAdminister && (
        <>
          <div>
            <h3>Invite someone</h3>
            <p className="firm-people-note">
              Scripta does not send the email. Create the invitation, copy the link and send it
              however you would normally write to them. The link only admits the address it was
              written for, and lapses after fourteen days.
            </p>
            <form
              className="firm-people-invite"
              onSubmit={(e) => {
                e.preventDefault();
                setNotice(null);
                if (email.trim()) invite.mutate();
              }}
            >
              <label>
                <span>Email address</span>
                <input
                  type="email"
                  value={email}
                  placeholder="name@firm.com"
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label>
                <span>Joins as</span>
                <select value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" variant="primary" disabled={invite.isPending || !email.trim()}>
                {invite.isPending ? "Creating…" : "Create invitation"}
              </Button>
            </form>
            <p className="firm-people-hint">{ROLES.find((r) => r.value === role)?.hint}</p>
            {notice && (
              <p
                className={`settings-notice${notice.bad ? " is-error" : ""}`}
                role={notice.bad ? "alert" : "status"}
              >
                {notice.text}
              </p>
            )}
          </div>

          <div>
            <h3>Invitations this firm has sent</h3>
            {invites.isLoading ? (
              <p role="status">Loading invitations…</p>
            ) : open.length === 0 ? (
              <p className="firm-people-note">
                This firm has not invited anybody who has yet to reply.
              </p>
            ) : (
              <ul className="settings-list firm-people-invites">
                {open.map((i) => (
                  <li key={i.id}>
                    <div>
                      <span>{i.email}</span>
                      <small>
                        {roleLabel(i.role)} · invited {when(i.createdAt)} · lapses{" "}
                        {when(i.expiresAt)}
                      </small>
                    </div>
                    <div className="firm-people-row-actions">
                      {copied === i.token && <em>Link copied</em>}
                      <ActionMenu label={i.email} actions={actionsFor(i)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {closed.length > 0 && (
            <div>
              <h3>Invitations this firm sent earlier</h3>
              <ul className="settings-list firm-people-invites">
                {closed.map((i) => (
                  <li key={i.id}>
                    <div>
                      <span>{i.email}</span>
                      <small>
                        {statusLabel[effectiveStatus(i)]}
                        {i.acceptedAt
                          ? ` ${when(i.acceptedAt)}`
                          : ` · invited ${when(i.createdAt)}`}
                      </small>
                    </div>
                    {effectiveStatus(i) !== "accepted" && (
                      <ActionMenu label={i.email} actions={actionsFor(i)} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
