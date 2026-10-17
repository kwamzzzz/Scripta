/**
 * The matter team, on the matter.
 *
 * Who is working on this file, what each of them is answerable for, and how
 * they came to be here. Nothing about access, sharing, permission or
 * confidentiality — the boundary does not exist until Phase 3, and a card that
 * implied it did would be making a promise the database cannot keep.
 *
 * Two things this deliberately does not do.
 *
 * It does not treat working alone as an empty state. Most files in a small firm
 * have one person on them; that is the normal condition of the work, not a gap
 * in the data, so there is no dashed box and no "0 members" waiting to be
 * filled — one quiet line and the control that changes it.
 *
 * And it does not colour-code the roles. Lead is set in the ink of the page
 * because it is the one role that is structurally different — exactly one per
 * matter, answerable for the file — and the rest are the same quiet mono label
 * as every other piece of secondary metadata in Scripta.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/Person";
import ManageTeamDialog from "@/components/ManageTeamDialog";
import RequestWork from "@/components/RequestWork";
import { provenanceOf, ROLE_LABEL, useFirmPeople, useMatterTeam } from "@/lib/matter-team";
import { useAuth } from "@/lib/auth";

import "./matter-team.css";

export default function MatterTeamCard({
  matterId,
  workspaceId,
}: {
  matterId: string;
  workspaceId: string;
}) {
  const { user } = useAuth();
  const team = useMatterTeam(matterId);
  const firm = useFirmPeople(workspaceId);
  const [managing, setManaging] = useState(false);

  const members = team.data ?? [];
  const alone = members.length <= 1;
  // Only the Lead changes a team, so only the Lead is offered the control that
  // does it. Everyone else on the matter sees the list — they are entitled to
  // know who they are working with — under a label that says what it is.
  const iLead = members.some((m) => m.role === "lead" && m.userId === user?.id);
  // Nobody to add is a different situation from nobody added, and the card says
  // only the first of those. Why the firm is empty belongs in Settings.
  const noOneToAdd = (firm.data ?? []).length <= 1;

  return (
    <div className="rv-card mt-card">
      <div className="rv-card-head">
        <h2>Matter team</h2>
        {!alone && (
          <button type="button" className="mt-action" onClick={() => setManaging(true)}>
            {iLead ? "Manage team" : "View team"}
          </button>
        )}
        {/* Asking lives beside the people, because the only people who can be
            asked are the people on the file. */}
        {!alone && <RequestWork matterId={matterId} />}
      </div>

      <div className="rv-card-body">
        {team.isLoading ? (
          <p className="mt-quiet" role="status">
            Loading the team…
          </p>
        ) : team.isError ? (
          <p className="mt-quiet" role="alert">
            The team could not be loaded.{" "}
            <button type="button" className="mt-link" onClick={() => void team.refetch()}>
              Try again
            </button>
          </p>
        ) : (
          <>
            <ul className="mt-list">
              {members.map((m) => (
                <li key={m.userId}>
                  <Avatar
                    name={m.name}
                    email={m.email}
                    size={28}
                    tone={m.userId === user?.id ? "self" : "quiet"}
                  />
                  <span className="mt-who">
                    <span className="mt-name">{m.name}</span>
                    <span className="mt-prov">{provenanceOf(m)}</span>
                  </span>
                  <span className={`mt-role${m.role === "lead" ? " is-lead" : ""}`}>
                    {ROLE_LABEL[m.role]}
                  </span>
                </li>
              ))}
            </ul>

            {alone && (
              <>
                <p className="mt-quiet">No other team members yet.</p>
                {iLead && (
                  <div className="mt-foot">
                    {noOneToAdd ? (
                      <Link to="/settings/workspace" className="mt-link">
                        Manage firm members →
                      </Link>
                    ) : (
                      <button type="button" className="mt-action" onClick={() => setManaging(true)}>
                        Add someone
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {managing && (
        <ManageTeamDialog
          matterId={matterId}
          workspaceId={workspaceId}
          onClose={() => setManaging(false)}
        />
      )}
    </div>
  );
}
