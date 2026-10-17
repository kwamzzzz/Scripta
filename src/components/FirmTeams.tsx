/**
 * The firm's teams.
 *
 * ---------------------------------------------------------------------------
 * A SAVED LIST OF COLLEAGUES, AND NOTHING MORE
 * ---------------------------------------------------------------------------
 *
 * This screen deliberately does not show what a team has been used for. There
 * is no "Transactions → matters" list and none is coming: it would tell
 * somebody which confidential files a group of people are on, which is exactly
 * the side channel §20 rules out. The only link between a team and a matter
 * runs the other way — as provenance on a matter member, readable by people
 * who can already read that matter.
 *
 * It is also not a dashboard. No activity, no counts that climb, no avatars
 * for their own sake. A team is a list; the screen is a list.
 */
import { useState } from "react";
import { Archive, Plus, X } from "lucide-react";
import { Button } from "@/components/primitives";
import { useFirmPeople } from "@/lib/matter-team";
import { useTeamActions, useTeamMembers, useTeams, type Team } from "@/lib/teams";
import { C, mono, radius } from "@/lib/tokens";

function Members({
  team,
  workspaceId,
  canAdminister,
}: {
  team: Team;
  workspaceId: string;
  canAdminister: boolean;
}) {
  const members = useTeamMembers(team.id);
  const people = useFirmPeople(workspaceId);
  const actions = useTeamActions(workspaceId);
  const [problem, setProblem] = useState<string | null>(null);

  const inTeam = new Set((members.data ?? []).map((m) => m.userId));
  const run = (promise: Promise<unknown>, fallback: string) => {
    setProblem(null);
    void promise.catch((cause: unknown) =>
      setProblem(cause instanceof Error ? cause.message : fallback),
    );
  };

  if (!canAdminister) {
    return (
      <p style={{ margin: 0, color: C.muted, fontSize: 12.5 }}>
        {(members.data ?? []).map((m) => m.name).join(", ") || "Nobody yet."}
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {(people.data ?? []).map((person) => {
        const has = inTeam.has(person.userId);
        return (
          <label
            key={person.userId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: C.text,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={has}
              onChange={() =>
                run(
                  has
                    ? actions.removeMember.mutateAsync({ teamId: team.id, userId: person.userId })
                    : actions.addMember.mutateAsync({ teamId: team.id, userId: person.userId }),
                  "That could not be changed.",
                )
              }
            />
            {person.name}
          </label>
        );
      })}
      {problem && (
        <p role="alert" style={{ margin: 0, color: C.red, fontSize: 12.5 }}>
          {problem}
        </p>
      )}
    </div>
  );
}

export default function FirmTeams({
  workspaceId,
  canAdminister,
}: {
  workspaceId: string;
  canAdminister: boolean;
}) {
  const teams = useTeams(workspaceId);
  const actions = useTeamActions(workspaceId);
  const [creating, setCreating] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const run = (promise: Promise<unknown>, fallback: string) => {
    setProblem(null);
    void promise.catch((cause: unknown) =>
      setProblem(cause instanceof Error ? cause.message : fallback),
    );
  };

  const live = (teams.data ?? []).filter((t) => !t.archivedAt);
  const archived = (teams.data ?? []).filter((t) => t.archivedAt);

  const row = (team: Team) => (
    <div
      key={team.id}
      style={{
        border: `1px solid ${C.cardRule}`,
        borderRadius: radius.md,
        background: C.panel,
        padding: "9px 11px",
        display: "grid",
        gap: 7,
        opacity: team.archivedAt ? 0.7 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ color: C.text, fontSize: 13 }}>{team.name}</strong>
        <span style={{ color: C.faint, fontSize: 11.5 }}>
          {team.memberCount === 1 ? "1 person" : `${team.memberCount} people`}
        </span>
        {team.archivedAt && (
          <span style={{ color: C.faint, font: `500 10px ${mono}`, letterSpacing: ".06em" }}>
            ARCHIVED
          </span>
        )}
        <div style={{ flex: 1 }} />
        <Button variant="quiet" onClick={() => setOpen(open === team.id ? null : team.id)}>
          {open === team.id ? "Done" : "Members"}
        </Button>
        {canAdminister && (
          <Button
            variant="quiet"
            onClick={() =>
              run(
                actions.setArchived.mutateAsync({ teamId: team.id, archived: !team.archivedAt }),
                "That could not be changed.",
              )
            }
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Archive size={13} /> {team.archivedAt ? "Restore" : "Archive"}
            </span>
          </Button>
        )}
      </div>

      {/* Said before it is pressed, because archiving quietly withdraws
          knowledge that was shared with this team. */}
      {canAdminister && !team.archivedAt && open === team.id && (
        <p style={{ margin: 0, color: C.faint, fontSize: 11.5, lineHeight: 1.5 }}>
          Archiving this team stops it being offered, and anything shared with it stops reaching
          these people unless they have it another way. It changes no matter staffing.
        </p>
      )}

      {open === team.id && (
        <Members team={team} workspaceId={workspaceId} canAdminister={canAdminister} />
      )}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 9 }}>
      {live.length === 0 && archived.length === 0 && (
        <p style={{ margin: 0, color: C.muted, fontSize: 12.5, lineHeight: 1.55 }}>
          No teams yet. A team is a saved list of colleagues — it makes staffing a matter and
          sharing knowledge faster, and grants nobody anything on its own.
        </p>
      )}

      {live.map(row)}
      {archived.length > 0 && (
        <>
          <span style={{ color: C.faint, font: `500 10px ${mono}`, letterSpacing: ".08em" }}>
            ARCHIVED
          </span>
          {archived.map(row)}
        </>
      )}

      {problem && (
        <p role="alert" style={{ margin: 0, color: C.red, fontSize: 12.5 }}>
          {problem}
        </p>
      )}

      {canAdminister &&
        (creating === null ? (
          <div>
            <Button variant="secondary" onClick={() => setCreating("")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Plus size={13} /> New team
              </span>
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <input
              autoFocus
              aria-label="Team name"
              placeholder="Transactions"
              value={creating}
              onChange={(event) => setCreating(event.target.value)}
              style={{
                flex: 1,
                minWidth: 160,
                border: `1px solid ${C.border}`,
                borderRadius: radius.md,
                background: C.panel,
                color: C.text,
                font: "inherit",
                fontSize: 13,
                padding: "6px 9px",
              }}
            />
            <Button
              variant="primary"
              disabled={!creating.trim() || actions.create.isPending}
              onClick={() => {
                const name = creating.trim();
                setCreating(null);
                run(actions.create.mutateAsync(name), "That team could not be created.");
              }}
            >
              Create
            </Button>
            <Button variant="quiet" onClick={() => setCreating(null)}>
              <X size={13} />
            </Button>
          </div>
        ))}
    </div>
  );
}
