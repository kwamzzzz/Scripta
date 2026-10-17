/**
 * The page at the end of an invitation link.
 *
 * Four things can be true when somebody arrives here and the screen has to tell
 * them apart, because three of them are not their fault and one of them is
 * somebody using a link that was not written for them:
 *
 *   the link is good and they are signed in as the right person — join;
 *   the link is good and they are not signed in — sign in first, then join;
 *   the link is good and they are signed in as somebody else — say so plainly;
 *   the link has lapsed, been cancelled or been replaced — say which.
 *
 * "Something went wrong" would cover all four and help with none. The one thing
 * this must never do is fail silently and leave a person looking at a firm they
 * have not joined, wondering whether they have.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import { useAuth } from "@/lib/auth";
import { acceptInvite, peekInvite, statusLabel, type InviteStatus } from "@/lib/invites";

import "./join-firm.css";

const roleLine: Record<string, string> = {
  owner: "as the firm's owner",
  admin: "as an administrator",
  lawyer: "as a lawyer",
  viewer: "with read-only access",
};

export default function JoinFirmScreen({ token }: { token: string }) {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [failed, setFailed] = useState<string | null>(null);

  const invite = useQuery({
    queryKey: ["invite-peek", token],
    queryFn: () => peekInvite(token),
    retry: false,
  });

  const join = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: () => {
      // A full reload rather than a route change: workspace membership is read
      // once when the session starts, and the person who just joined needs the
      // app to know it.
      window.location.assign("/");
    },
    onError: (cause: unknown) =>
      setFailed(cause instanceof Error ? cause.message : "The invitation could not be accepted."),
  });

  const frame = (title: string, body: React.ReactNode) => (
    <main className="join-firm">
      <div className="join-firm-card">
        <p className="join-firm-mark">Scripta</p>
        <h1>{title}</h1>
        {body}
      </div>
    </main>
  );

  if (invite.isLoading || loading) return frame("Checking your invitation…", null);

  if (invite.isError)
    return frame(
      "That invitation could not be checked",
      <>
        <p>Something went wrong reading the link. It may be worth trying again.</p>
        <Button onClick={() => void invite.refetch()}>Try again</Button>
      </>,
    );

  const data = invite.data;
  if (!data)
    return frame(
      "That link does not match an invitation",
      <p>
        Check that you copied the whole of it. If it still does not work, ask whoever invited you to
        send a new one.
      </p>,
    );

  const status = data.status as InviteStatus;
  if (status !== "pending")
    return frame(
      status === "accepted" ? "You have already joined" : "This invitation is closed",
      <>
        <p>
          {status === "accepted"
            ? `This invitation to ${data.workspaceName} has already been accepted.`
            : `${statusLabel[status]}. Ask ${data.workspaceName} for a new invitation.`}
        </p>
        {status === "accepted" && (
          <Button onClick={() => void navigate({ to: "/" })}>Open Scripta</Button>
        )}
      </>,
    );

  if (!user)
    return frame(
      `You have been invited to ${data.workspaceName}`,
      <>
        <p>
          The invitation was sent to <strong>{data.email}</strong>{" "}
          {roleLine[data.invitedRole] ?? `as ${data.invitedRole}`}. Sign in with that address to
          accept it.
        </p>
        <Button variant="primary" onClick={() => void navigate({ to: "/" })}>
          Sign in
        </Button>
        <p className="join-firm-small">Come back to this link once you are signed in.</p>
      </>,
    );

  const signedInAs = profile?.email ?? user.email ?? "";
  if (signedInAs.toLowerCase() !== data.email.toLowerCase())
    return frame(
      "This invitation was sent to a different address",
      <p>
        It was written for <strong>{data.email}</strong>, and you are signed in as{" "}
        <strong>{signedInAs}</strong>. Sign out and sign back in as {data.email}, or ask{" "}
        {data.workspaceName} to invite {signedInAs} instead.
      </p>,
    );

  return frame(
    `Join ${data.workspaceName}`,
    <>
      <p>
        You have been invited {roleLine[data.invitedRole] ?? `as ${data.invitedRole}`}, as{" "}
        <strong>{data.email}</strong>.
      </p>
      <p className="join-firm-small">
        Joining the firm does not open anyone's matters. A colleague adds you to the files you are
        meant to work on, one at a time.
      </p>
      <Button variant="primary" disabled={join.isPending} onClick={() => join.mutate()}>
        {join.isPending ? "Joining…" : "Accept and join"}
      </Button>
      {failed && (
        <p className="join-firm-error" role="alert">
          {failed}
        </p>
      )}
    </>,
  );
}
