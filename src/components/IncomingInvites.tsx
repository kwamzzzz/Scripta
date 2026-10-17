/**
 * Invitations waiting for YOU.
 *
 * This exists because of a confusion the first real invitation produced. A firm
 * administrator's Settings page listed "Awaiting a reply" — meaning people this
 * firm has asked and who have not yet answered — and somebody reading it as an
 * invitee reasonably took it to mean invitations waiting for them. The two
 * lists are now named for what they hold, and this is the second of them.
 *
 * It also fixes a real dead end rather than only the wording: before this, the
 * only way to accept an invitation was to be holding the `/join/<token>` link.
 * Lose the message and you had no route in, because the invitations table is
 * readable only by an administrator of the firm that sent it.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import { acceptInvite, myPendingInvites } from "@/lib/invites";

import "./firm-people.css";

const roleWord: Record<string, string> = {
  owner: "as its owner",
  admin: "as an administrator",
  lawyer: "as a lawyer",
  viewer: "with read-only access",
};

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

export default function IncomingInvites() {
  const invites = useQuery({ queryKey: ["my-invites"], queryFn: myPendingInvites });

  const join = useMutation({
    mutationFn: (token: string) => acceptInvite(token),
    // A full reload: workspace membership is read once when the session starts,
    // and somebody who has just joined a firm needs the app to know it.
    onSuccess: () => window.location.assign("/"),
  });

  const rows = invites.data ?? [];
  if (!rows.length) return null;

  return (
    <section className="settings-section" aria-labelledby="settings-invitations">
      <div>
        <h2 id="settings-invitations">Invitations for you</h2>
        <p>Firms that have asked you to join.</p>
      </div>
      <div className="settings-section-content">
        <ul className="settings-list firm-people-invites">
          {rows.map((i) => (
            <li key={i.token}>
              <div>
                <span>{i.firmName}</span>
                <small>
                  You have been invited {roleWord[i.invitedRole] ?? `as ${i.invitedRole}`} · lapses{" "}
                  {when(i.expiresAt)}
                </small>
              </div>
              <Button
                variant="primary"
                disabled={join.isPending}
                onClick={() => join.mutate(i.token)}
              >
                {join.isPending ? "Joining…" : `Join ${i.firmName}`}
              </Button>
            </li>
          ))}
        </ul>
        {join.isError && (
          <p className="settings-notice is-error" role="alert">
            {(join.error as Error).message}
          </p>
        )}
        <p className="firm-people-note" style={{ margin: "10px 0 0" }}>
          Joining a firm does not open anyone's matters. A colleague adds you to the files you are
          meant to work on, one at a time.
        </p>
      </div>
    </section>
  );
}
