/**
 * Who can use this, and whether the firm stands behind it.
 *
 * One panel for both, because a lawyer thinks about them together — "can
 * Podrick see this, and is it the firm's position" — while the database keeps
 * them apart so they cannot drift. The panel is where the two meet.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS OFFERED IS WHAT THE SERVER WILL ALLOW
 * ---------------------------------------------------------------------------
 *
 * `knowledge_context()` answers with `can_write_knowledge` and
 * `can_approve_knowledge` — the same functions that judge the write. Nothing
 * here works out for itself whether a control should be drawn, which is the
 * rule Phase 4 left behind after three screens decided for themselves and were
 * wrong.
 */
import { useState } from "react";
import { Check, Lock, Users, Building2, Undo2 } from "lucide-react";
import { Button } from "@/components/primitives";
import { useAuth } from "@/lib/auth";
import { displayName, useFirmPeople, useProfileNames } from "@/lib/matter-team";
import { useApp } from "@/store/app";
import {
  STATE_LABEL,
  STATE_MEANING,
  approvalWentStale,
  stateOf,
  useKnowledgeActions,
  useKnowledgeContext,
  useShares,
  type KnowledgeFacts,
  type KnowledgeKind,
  type Visibility,
} from "@/lib/knowledge";
import { useTeamKnowledgeSharing, useTeams } from "@/lib/teams";
import { C, mono, radius } from "@/lib/tokens";

const CHOICES: { value: Visibility; label: string; icon: React.ReactNode }[] = [
  { value: "private", label: "Private", icon: <Lock size={13} /> },
  { value: "shared", label: "Shared", icon: <Users size={13} /> },
  { value: "firm", label: "Firm-wide", icon: <Building2 size={13} /> },
];

export default function KnowledgeSharing({
  kind,
  id,
  facts,
}: {
  kind: KnowledgeKind;
  id: string;
  facts: KnowledgeFacts;
}) {
  const { user } = useAuth();
  const context = useKnowledgeContext(kind, id);
  const shares = useShares(kind, id);
  const actions = useKnowledgeActions(kind, id);
  const { workspaceId } = useApp();
  const people = useFirmPeople(workspaceId);
  const teams = useTeams(workspaceId);
  const teamSharing = useTeamKnowledgeSharing(kind, id);
  const names = useProfileNames();
  const [problem, setProblem] = useState<string | null>(null);

  const ctx = context.data;
  if (!ctx) return null;

  const state = stateOf(facts);
  const stale = approvalWentStale(facts);
  const sharedIds = new Set(
    (shares.data ?? []).filter((s) => s.subjectType !== "team").map((s) => s.subjectId),
  );
  const sharedTeamIds = new Set(
    (shares.data ?? []).filter((s) => s.subjectType === "team").map((s) => s.subjectId),
  );
  /* Archived teams address nobody, so they are not offered — but one that is
     already a target stays listed, or a share would vanish from the panel
     while still existing in the database. */
  const selectableTeams = (teams.data ?? []).filter(
    (t) => !t.archivedAt || sharedTeamIds.has(t.id),
  );
  const colleagues = (people.data ?? []).filter((p) => p.userId !== user?.id);

  const run = (promise: Promise<unknown>, fallback: string) => {
    setProblem(null);
    void promise.catch((cause: unknown) =>
      setProblem(cause instanceof Error ? cause.message : fallback),
    );
  };

  const who = (userId: string) => {
    const person = names.data?.get(userId);
    return person ? displayName({ name: person.name, email: person.email }) : "Somebody";
  };

  return (
    <section aria-label="Sharing and approval" style={{ display: "grid", gap: 11 }}>
      <span style={{ color: C.secondary, font: `500 10px ${mono}`, letterSpacing: ".08em" }}>
        WHO CAN USE THIS
      </span>

      {ctx.mayWrite ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CHOICES.map((choice) => {
            const active = ctx.visibility === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                aria-pressed={active}
                disabled={actions.setVisibility.isPending}
                onClick={() =>
                  run(actions.setVisibility.mutateAsync(choice.value), "That could not be changed.")
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  border: `1px solid ${active ? C.accentEdge : C.border}`,
                  borderRadius: radius.pill,
                  background: active ? C.accentTint : C.panel,
                  color: active ? C.accent : C.secondary,
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 12.5,
                  padding: "5px 11px",
                }}
              >
                {choice.icon}
                {choice.label}
              </button>
            );
          })}
        </div>
      ) : (
        <p style={{ margin: 0, color: C.body, fontSize: 12.5 }}>
          {STATE_LABEL[state]} — {STATE_MEANING[state]}
        </p>
      )}

      <p style={{ margin: 0, color: C.muted, fontSize: 12.5, lineHeight: 1.55 }}>
        {
          STATE_MEANING[
            ctx.visibility === "firm"
              ? state === "approved"
                ? "approved"
                : "firm"
              : ctx.visibility
          ]
        }
      </p>

      {/* Naming people, only where that is what "shared" means. */}
      {ctx.visibility === "shared" && ctx.mayWrite && (
        <div style={{ display: "grid", gap: 6 }}>
          {colleagues.length === 0 && (
            <p style={{ margin: 0, color: C.muted, fontSize: 12.5 }}>
              There is nobody else in this workspace yet.
            </p>
          )}
          {/* People and Teams in one interaction, distinguished but not made
              into two different pickers. */}
          {selectableTeams.length > 0 && (
            <>
              <span style={{ color: C.faint, font: `500 10px ${mono}`, letterSpacing: ".08em" }}>
                TEAMS
              </span>
              {selectableTeams.map((team) => {
                const has = sharedTeamIds.has(team.id);
                return (
                  <label
                    key={team.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      border: `1px solid ${C.cardRule}`,
                      borderRadius: radius.md,
                      padding: "7px 10px",
                      cursor: "pointer",
                      fontSize: 13,
                      color: C.text,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={has}
                      onChange={() =>
                        run(
                          has
                            ? teamSharing.unshareFromTeam.mutateAsync(team.id)
                            : teamSharing.shareWithTeam.mutateAsync(team.id),
                          "That share could not be changed.",
                        )
                      }
                    />
                    <span style={{ flex: 1 }}>{team.name}</span>
                    <span style={{ color: C.faint, fontSize: 11.5 }}>
                      {team.archivedAt
                        ? "archived — reaches nobody"
                        : team.memberCount === 1
                          ? "1 person"
                          : `${team.memberCount} people`}
                    </span>
                  </label>
                );
              })}
              <span style={{ color: C.faint, font: `500 10px ${mono}`, letterSpacing: ".08em" }}>
                PEOPLE
              </span>
            </>
          )}

          {colleagues.map((person) => {
            const has = sharedIds.has(person.userId);
            return (
              <label
                key={person.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1px solid ${C.cardRule}`,
                  borderRadius: radius.md,
                  padding: "7px 10px",
                  cursor: "pointer",
                  fontSize: 13,
                  color: C.text,
                }}
              >
                <input
                  type="checkbox"
                  checked={has}
                  onChange={() =>
                    run(
                      has
                        ? actions.unshare.mutateAsync(person.userId)
                        : actions.share.mutateAsync(person.userId),
                      "That share could not be changed.",
                    )
                  }
                />
                {person.name}
              </label>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------
          APPROVAL
          ------------------------------------------------------------------ */}
      <div
        style={{ display: "grid", gap: 8, borderTop: `1px solid ${C.cardRule}`, paddingTop: 11 }}
      >
        <span style={{ color: C.secondary, font: `500 10px ${mono}`, letterSpacing: ".08em" }}>
          FIRM KNOWLEDGE
        </span>

        {stale && (
          <p
            style={{
              margin: 0,
              borderLeft: `2px solid ${C.amber}`,
              paddingLeft: 9,
              color: C.body,
              fontSize: 12.5,
              lineHeight: 1.55,
            }}
          >
            This was approved, and the wording has changed since. It is not approved firm knowledge
            until somebody approves it again.
          </p>
        )}

        {state === "approved" && !stale && (
          <p style={{ margin: 0, color: C.body, fontSize: 12.5, lineHeight: 1.55 }}>
            Approved firm knowledge. The firm stands behind this wording.
          </p>
        )}

        {ctx.mayApprove ? (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
            {state !== "approved" && (
              <Button
                variant="secondary"
                disabled={ctx.visibility !== "firm" || actions.approve.isPending}
                onClick={() => run(actions.approve.mutateAsync(), "That could not be approved.")}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Check size={13} />{" "}
                  {stale ? "Approve the new wording" : "Approve as firm knowledge"}
                </span>
              </Button>
            )}
            {state === "approved" && (
              <Button
                variant="quiet"
                disabled={actions.withdrawApproval.isPending}
                onClick={() =>
                  run(actions.withdrawApproval.mutateAsync(), "That could not be withdrawn.")
                }
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Undo2 size={13} /> Withdraw approval
                </span>
              </Button>
            )}
            {ctx.visibility !== "firm" && (
              <span style={{ color: C.faint, fontSize: 11.5 }}>
                Only firm-wide knowledge can be approved.
              </span>
            )}
          </div>
        ) : (
          /* Absent, not disabled, where this lawyer has no standing — except
             that the reason is worth saying, because "why can't I approve
             this" is otherwise a mystery. */
          <span style={{ color: C.faint, fontSize: 11.5 }}>
            Approving firm knowledge is for an owner or admin of the workspace.
          </span>
        )}
      </div>

      {problem && (
        <p role="alert" style={{ margin: 0, color: C.red, fontSize: 12.5 }}>
          {problem}
        </p>
      )}
    </section>
  );
}
