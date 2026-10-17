import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/primitives";
import LetterheadManager from "@/components/LetterheadManager";
import FirmPeople from "@/components/FirmPeople";
import FirmName from "@/components/FirmName";
import IncomingInvites from "@/components/IncomingInvites";
import { workspaceLabel } from "@/lib/workspaces";
import AppShell, { Crumbs } from "@/components/AppShell";
import SettingsContext from "@/components/SettingsContext";
import "./settings-screen.css";
import { useApp } from "@/store/app";
import { useAuth } from "@/lib/auth";
import { usePersisted } from "@/lib/use-board";
import { NEWS_VISUALS_PREFERENCE_KEY } from "@/lib/news-visuals";
import { useWorkspaceRole } from "@/lib/workspace-role";
import { canReviewFeedback } from "@/lib/feedback";

export default function SettingsScreen() {
  const { workspace, workspaces } = useApp();
  const { profile, updateProfile, signOut } = useAuth();
  const { role } = useWorkspaceRole();
  // Administration, not authorisation: this decides who may invite and remove
  // people, and nothing about who may open a matter.
  const canAdminister = role === "owner" || role === "admin";
  const isFirm = workspace?.kind === "firm";
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [newsVisualsEnabled, setNewsVisualsEnabled] = usePersisted(
    NEWS_VISUALS_PREFERENCE_KEY,
    true,
  );

  useEffect(() => setName(profile?.full_name ?? ""), [profile?.full_name]);

  const saveProfile = async () => {
    setSaving(true);
    setAccountNotice(null);
    try {
      await updateProfile(name);
      setAccountNotice("Profile saved.");
    } catch (cause) {
      setAccountNotice(cause instanceof Error ? cause.message : "Could not save the profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      section="settings"
      breadcrumb={<Crumbs items={[{ label: "Settings" }]} />}
      scroll={false}
    >
      <div className="scripta-page settings-page">
        <header className="scripta-page-heading">
          <div>
            <h1 className="scripta-page-title">Personal settings</h1>
            <p className="scripta-page-description">
              Your account and how Scripta behaves for you, wherever you are working.
            </p>
          </div>
        </header>

        <SettingsContext on="personal" />
        <section className="settings-section" aria-labelledby="settings-account">
          <div>
            <h2 id="settings-account">Account</h2>
            <p>Manage how your name appears in Scripta.</p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!saving) void saveProfile();
            }}
            className="settings-section-content"
            aria-busy={saving}
          >
            <label className="scripta-form-field">
              Full name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                disabled={saving}
              />
            </label>
            <div className="settings-readonly">
              <span>Email</span>
              <div>{profile?.email}</div>
            </div>
            {accountNotice && (
              <div
                role={accountNotice === "Profile saved." ? "status" : "alert"}
                className={`settings-notice${accountNotice === "Profile saved." ? "" : " is-error"}`}
              >
                {accountNotice}
              </div>
            )}
            <div className="scripta-page-actions">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
              <Button disabled={saving} onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          </form>
        </section>
        <section className="settings-section" aria-labelledby="settings-briefing">
          <div>
            <h2 id="settings-briefing">Daily briefing</h2>
            <p>Choose how news appears on your dashboard.</p>
          </div>
          <div className="settings-preference">
            <div>
              <h3>News images</h3>
              <p>Show licensed images alongside article sources and links.</p>
            </div>
            <button
              type="button"
              className={`settings-switch${newsVisualsEnabled ? " is-on" : ""}`}
              role="switch"
              aria-checked={newsVisualsEnabled}
              aria-label="Show visual news strip"
              onClick={() => setNewsVisualsEnabled((enabled) => !enabled)}
            >
              <span />
            </button>
          </div>
        </section>
        <IncomingInvites />

        <section className="settings-section" aria-labelledby="settings-workspaces">
          <div>
            <h2 id="settings-workspaces">Your workspaces</h2>
            <p>Where you work. Your personal workspace, and any firm you belong to.</p>
          </div>
          <div className="settings-section-content">
            <ul className="settings-list">
              {workspaces.map((w) => (
                <li key={w.id}>
                  <span>{workspaceLabel(w)}</span>
                  <small>{w.kind === "firm" ? "Firm" : "Yours alone"}</small>
                </li>
              ))}
            </ul>
            <p className="firm-people-note" style={{ margin: "12px 0 0" }}>
              A firm is where colleagues work together. Start one from the workspace switcher at the
              top of the sidebar. Firm administration lives under that firm's own settings.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
