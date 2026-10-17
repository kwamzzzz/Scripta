/**
 * Staffing a file.
 *
 * Everything that changes the team happens here, so the card itself stays a
 * list rather than a control surface. Changes save as they are made — there is
 * no draft of a team, and a Cancel button that appeared to undo four saved
 * writes would be a lie.
 *
 * ONLY THE LEAD CHANGES A TEAM, and only the Lead is shown the controls that do
 * it. This used to offer an Editor a role select on his own row and a cross to
 * remove himself: every one of those was refused by the database, which is the
 * part that matters, but a control that cannot work should not be drawn. An
 * interface that offers what the rules forbid teaches people to distrust both.
 *
 * Everyone else on the matter sees the same list, read only. They are entitled
 * to know who else is on the file they are working on.
 *
 * The Lead's row is fixed. A matter has exactly one, the database will not let
 * go of it, and it moves by handing the matter on — which is offered as its own
 * deliberate act, with the consequence written out, because a partner who
 * expects to add a role and instead gives away their file has been badly
 * served.
 *
 * `Modal` draws the backdrop and nothing else, so the card below is its own:
 * background, padding, radius and shadow with literal fallbacks, since it
 * portals out of the token scope.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import { Avatar } from "@/components/Person";
import { useAuth } from "@/lib/auth";
import {
  ASSIGNABLE_ROLES,
  ROLE_LABEL,
  ROLE_MEANING,
  displayName,
  provenanceOf,
  useFirmPeople,
  useMatterTeam,
  useTeamActions,
  type MatterRole,
} from "@/lib/matter-team";

import {
  describeStaffing,
  useStaffMatterFromTeam,
  useStaffingPreview,
  useTeams,
} from "@/lib/teams";
import "./matter-team.css";

/**
 * Staffing the matter from a saved team.
 *
 * ---------------------------------------------------------------------------
 * A SHORTCUT FOR NAMING PEOPLE, NOT A WAY OF GRANTING ACCESS
 * ---------------------------------------------------------------------------
 *
 * The team is read once and its people become ordinary matter members. That is
 * why the preview matters: what is about to happen is a list of individual
 * additions, and the Lead should see exactly who before pressing anything.
 *
 * Lead is deliberately absent from the roles. A matter has one Lead and handing
 * it on is its own act; a bulk role is never it.
 */
function StaffFromTeam({
  matterId,
  workspaceId,
  onDone,
}: {
  matterId: string;
  workspaceId: string;
  onDone: (message: string) => void;
}) {
  const teams = useTeams(workspaceId);
  const [teamId, setTeamId] = useState("");
  const [role, setRole] = useState<MatterRole>("editor");
  const preview = useStaffingPreview(matterId, teamId || null);
  const staff = useStaffMatterFromTeam(matterId);
  const [problem, setProblem] = useState<string | null>(null);

  const live = (teams.data ?? []).filter((t) => !t.archivedAt && t.memberCount > 0);
  if (live.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="mt-add">
        <select
          className="px-person-picker"
          value={teamId}
          aria-label="A team from the firm"
          onChange={(e) => setTeamId(e.target.value)}
        >
          <option value="">Or add a whole team…</option>
          {live.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          className="px-person-picker"
          value={role}
          aria-label="Role for the people being added"
          onChange={(e) => setRole(e.target.value as MatterRole)}
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <Button
          disabled={!teamId || staff.isPending || !preview.data}
          onClick={() => {
            setProblem(null);
            staff.mutate(
              { teamId, role },
              {
                onSuccess: (result) => {
                  setTeamId("");
                  onDone(
                    `${result.team}: ${result.added} joined, ${result.already} already on the matter.`,
                  );
                },
                onError: (cause) =>
                  setProblem(cause instanceof Error ? cause.message : "That did not work."),
              },
            );
          }}
        >
          Add team
        </Button>
      </div>

      {/* What will actually happen, before it happens. */}
      {teamId && preview.data && (
        <p className="mt-quiet">
          {describeStaffing(preview.data)}{" "}
          {preview.data.some((p) => p.alreadyMember) &&
            "Anybody already here keeps the role they have."}
        </p>
      )}
      {problem && (
        <p className="mt-error" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

export default function ManageTeamDialog({
  matterId,
  workspaceId,
  onClose,
}: {
  matterId: string;
  workspaceId: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const team = useMatterTeam(matterId);
  const firm = useFirmPeople(workspaceId);
  const actions = useTeamActions(matterId);

  const [pick, setPick] = useState("");
  const [pickRole, setPickRole] = useState<MatterRole>("editor");
  const [handOver, setHandOver] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const members = team.data ?? [];
  const lead = members.find((m) => m.role === "lead") ?? null;
  const iLead = !!lead && lead.userId === user?.id;
  // The single question the whole dialog turns on. It mirrors `is_matter_lead`
  // in the database rather than inventing a second rule.
  const mayManage = iLead;
  const [notice, setNotice] = useState<string | null>(null);
  const onTeam = new Set(members.map((m) => m.userId));
  const addable = (firm.data ?? []).filter((p) => !onTeam.has(p.userId));
  const candidate = members.find((m) => m.userId === handOver) ?? null;

  const run = (p: Promise<unknown>) => {
    setFailed(null);
    void p.catch((cause: unknown) =>
      setFailed(cause instanceof Error ? cause.message : "That change could not be saved."),
    );
  };

  return (
    <Modal open onClose={onClose} label="Manage the matter team">
      <div className="mt-dialog">
        <header>
          <h2>Who is working on this matter</h2>
          <p>
            {mayManage
              ? "Roles describe what each person is responsible for. Only the Lead changes the team."
              : "Roles describe what each person is responsible for. The Lead of this matter decides who is on it."}
          </p>
        </header>

        <div className="mt-dialog-body">
          <ul className="mt-rows">
            {members.map((m) => {
              const isLead = m.role === "lead";
              return (
                <li key={m.userId}>
                  <Avatar
                    name={m.name}
                    email={m.email}
                    size={28}
                    tone={m.userId === user?.id ? "self" : "quiet"}
                  />
                  <span className="mt-who">
                    <span className="mt-name">
                      {m.name}
                      {m.userId === user?.id && <em> · you</em>}
                    </span>
                    <span className="mt-prov">{m.email || provenanceOf(m)}</span>
                  </span>

                  {isLead || !mayManage ? (
                    <span className="mt-role-fixed" title={ROLE_MEANING[m.role]}>
                      {ROLE_LABEL[m.role]}
                    </span>
                  ) : (
                    <select
                      className="px-person-picker mt-role-select"
                      value={m.role}
                      aria-label={`Role for ${m.name}`}
                      onChange={(e) =>
                        run(
                          actions.setRole.mutateAsync({
                            userId: m.userId,
                            role: e.target.value as MatterRole,
                          }),
                        )
                      }
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r} title={ROLE_MEANING[r]}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  )}

                  {isLead || !mayManage ? (
                    <span className="mt-x" aria-hidden="true" />
                  ) : (
                    <button
                      type="button"
                      className="mt-x"
                      aria-label={`Take ${m.name} off this matter`}
                      title={`Take ${m.name} off this matter`}
                      onClick={() => run(actions.remove.mutateAsync(m.userId))}
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-rule" />

          {!mayManage ? (
            <p className="mt-quiet">
              Ask {lead ? lead.name : "the Lead"} to add or remove anybody on this matter.
            </p>
          ) : addable.length > 0 ? (
            <div className="mt-add">
              <select
                className="px-person-picker"
                value={pick}
                aria-label="Somebody from the firm"
                onChange={(e) => setPick(e.target.value)}
              >
                <option value="">Add someone from the firm…</option>
                {addable.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {displayName(p)}
                  </option>
                ))}
              </select>
              <select
                className="px-person-picker"
                value={pickRole}
                aria-label="Role for the person being added"
                onChange={(e) => setPickRole(e.target.value as MatterRole)}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <Button
                disabled={!pick || actions.add.isPending}
                onClick={() => {
                  run(
                    actions.add
                      .mutateAsync({ userId: pick, role: pickRole })
                      .then(() => setPick("")),
                  );
                }}
              >
                Add
              </Button>
            </div>
          ) : (
            /* The card never explains this; here it is the answer to the question
               the reader has just asked by opening the dialog. */
            <p className="mt-quiet">
              Everybody in the firm is already on this matter.{" "}
              <Link to="/settings" className="mt-link" onClick={onClose}>
                Manage firm members →
              </Link>
            </p>
          )}

          {/* Staffing from a saved team. Below the individual picker, because
              one person at a time is the ordinary case and a whole team is the
              shortcut — not the other way round. */}
          {mayManage && (
            <StaffFromTeam
              matterId={matterId}
              workspaceId={workspaceId}
              onDone={(message) => setNotice(message)}
            />
          )}
          {notice && <p className="mt-quiet">{notice}</p>}

          {/* The handover, offered only to the person who can actually do it. */}
          {mayManage && members.length > 1 && (
            <>
              <div className="mt-rule" />
              <div className="mt-handover">
                <span className="mt-eyebrow">Hand the matter on</span>
                <div className="mt-add">
                  <select
                    className="px-person-picker"
                    value={handOver ?? ""}
                    aria-label="Who should lead this matter"
                    onChange={(e) => setHandOver(e.target.value || null)}
                  >
                    <option value="">Choose a colleague…</option>
                    {members
                      .filter((m) => m.role !== "lead")
                      .map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                  <Button
                    variant="primary"
                    disabled={!candidate || actions.handOver.isPending}
                    onClick={() =>
                      candidate &&
                      run(
                        actions.handOver
                          .mutateAsync(candidate.userId)
                          .then(() => setHandOver(null)),
                      )
                    }
                  >
                    Hand it over
                  </Button>
                </div>
                {candidate && (
                  <p className="mt-warn">
                    A matter has one Lead. Making {candidate.name} the Lead hands them the file and
                    leaves you an Editor on it.
                  </p>
                )}
              </div>
            </>
          )}

          {failed && (
            <p className="mt-error" role="alert">
              {failed}
            </p>
          )}
        </div>

        <footer>
          <span className="mt-quiet">Changes save as you make them.</span>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
