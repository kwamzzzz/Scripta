/**
 * How a firm is run.
 *
 * Everything on this page belongs to one organisation and changes when you
 * switch to another: its name, its people, its invitations, its paper. That is
 * why it is a separate page from your own account settings, which travel with
 * you wherever you are working.
 *
 * The heading names the firm rather than saying "Workspace", because somebody
 * who belongs to two of them needs to know which one they are about to change.
 *
 * A personal workspace has none of this. It is not a firm, it can never have a
 * second member, and the page says so and offers the way to start a real one
 * rather than showing an administration screen with nothing in it.
 */
import { Link } from "@tanstack/react-router";
import AppShell, { Crumbs } from "@/components/AppShell";
import SettingsContext from "@/components/SettingsContext";
import LetterheadManager from "@/components/LetterheadManager";
import FirmPeople from "@/components/FirmPeople";
import FirmTeams from "@/components/FirmTeams";
import FirmName from "@/components/FirmName";
import { useApp } from "@/store/app";
import { useWorkspaceRole } from "@/lib/workspace-role";
import { canReviewFeedback } from "@/lib/feedback";

import "./settings-screen.css";

export default function WorkspaceSettingsScreen() {
  const { workspace } = useApp();
  const { role } = useWorkspaceRole();
  // Administration, not authorisation. This decides who may invite, rename and
  // remove; it decides nothing about who may open a matter.
  const canAdminister = role === "owner" || role === "admin";
  const isFirm = workspace?.kind === "firm";

  return (
    <AppShell
      section="settings"
      breadcrumb={
        <Crumbs items={[{ label: "Settings" }, { label: workspace?.name ?? "Workspace" }]} />
      }
      scroll={false}
    >
      <div className="scripta-page settings-page">
        <header className="scripta-page-heading">
          <div>
            <h1 className="scripta-page-title">
              {isFirm ? workspace?.name : "Personal workspace"}
            </h1>
            <p className="scripta-page-description">
              {isFirm
                ? "The firm, the people in it, and its paper."
                : "Your own workspace. It belongs to you alone and has nothing to administer."}
            </p>
          </div>
        </header>

        <SettingsContext on="workspace" />

        {!isFirm ? (
          <section className="settings-section" aria-labelledby="ws-not-a-firm">
            <div>
              <h2 id="ws-not-a-firm">Not a firm</h2>
              <p>A personal workspace has no members and no invitations.</p>
            </div>
            <div className="settings-section-content">
              <p className="firm-people-note">
                Start a firm from the workspace switcher at the top of the sidebar, and its settings
                appear here. Your personal workspace stays exactly as it is.
              </p>
              <div>
                <Link to="/settings" className="wf-button wf-button-outline">
                  Back to personal settings
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="settings-section" aria-labelledby="ws-general">
              <div>
                <h2 id="ws-general">General</h2>
                <p>What this firm is called, wherever its name appears.</p>
              </div>
              <div className="settings-section-content">
                {workspace && (
                  <FirmName
                    workspaceId={workspace.id}
                    name={workspace.name}
                    canRename={canAdminister}
                  />
                )}
              </div>
            </section>

            <section className="settings-section" aria-labelledby="ws-people">
              <div>
                <h2 id="ws-people">People</h2>
                <p>
                  {canAdminister
                    ? "Who belongs to this firm, and who has been asked."
                    : "Who belongs to this firm. An owner or administrator manages the list."}
                </p>
              </div>
              <div className="settings-section-content">
                {workspace && (
                  <FirmPeople workspaceId={workspace.id} canAdminister={canAdminister} />
                )}
                <p className="firm-people-note" style={{ margin: "14px 0 0" }}>
                  Belonging to this firm opens no matter. A colleague adds you to the files you are
                  meant to work on, one at a time.
                </p>
              </div>
            </section>

            {/* Teams sit inside the firm branch, so a personal workspace never
                shows an administration surface it could never use. */}
            <section className="settings-section" aria-labelledby="ws-teams">
              <div>
                <h2 id="ws-teams">Teams</h2>
                <p>
                  {canAdminister
                    ? "Saved lists of colleagues, for staffing a matter and sharing knowledge."
                    : "The firm's saved lists of colleagues. An owner or administrator manages them."}
                </p>
              </div>
              <div className="settings-section-content">
                {workspace && (
                  <FirmTeams workspaceId={workspace.id} canAdminister={canAdminister} />
                )}
                <p className="firm-people-note" style={{ margin: "14px 0 0" }}>
                  A team opens no matter. Using one to staff a matter adds those people to it
                  individually; joining a team later does not put anybody on work already under way.
                </p>
              </div>
            </section>

            <section className="settings-section" aria-labelledby="ws-paper">
              <div>
                <h2 id="ws-paper">Letterheads</h2>
                <p>The firm's paper.</p>
              </div>
              <div className="settings-section-content">
                <p style={{ margin: "0 0 10px" }}>
                  Used for letters, resolutions and contract cover pages. Drop a file to add one;
                  the default goes on every new document.
                </p>
                {workspace && <LetterheadManager workspaceId={workspace.id} />}
              </div>
            </section>

            {canReviewFeedback(role) && (
              <section className="settings-section" aria-labelledby="ws-feedback">
                <div>
                  <h2 id="ws-feedback">Feedback</h2>
                  <p>What people in this firm have reported.</p>
                </div>
                <div className="settings-section-content">
                  <p>Available to owners and administrators.</p>
                  <div>
                    <Link to="/settings/feedback" className="wf-button wf-button-outline">
                      Review feedback
                    </Link>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
