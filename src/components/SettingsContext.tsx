/**
 * Which settings you are looking at.
 *
 * Two things were living under one heading: who you are, and how a firm is run.
 * They belong to different owners — your name and your preferences are yours
 * wherever you are working, while members, invitations and the firm's paper
 * belong to one organisation and change when you switch to another.
 *
 * So there are two pages, and this is the line that says which one you are on.
 * It names the firm rather than saying "Workspace", because somebody who
 * belongs to two of them needs to know which one they are about to administer.
 *
 * A personal workspace has no organisational settings at all, so the second tab
 * simply is not offered.
 */
import { Link } from "@tanstack/react-router";
import { useApp } from "@/store/app";

import "./settings-context.css";

export default function SettingsContext({ on }: { on: "personal" | "workspace" }) {
  const { workspace } = useApp();
  const isFirm = workspace?.kind === "firm";

  return (
    <nav className="settings-context" aria-label="Settings sections">
      <Link
        to="/settings"
        className={`settings-context-tab${on === "personal" ? " is-on" : ""}`}
        aria-current={on === "personal" ? "page" : undefined}
      >
        Personal
        <small>Your account</small>
      </Link>

      {isFirm && workspace ? (
        <Link
          to="/settings/workspace"
          className={`settings-context-tab${on === "workspace" ? " is-on" : ""}`}
          aria-current={on === "workspace" ? "page" : undefined}
        >
          {workspace.name}
          <small>Firm administration</small>
        </Link>
      ) : (
        /* Not a disabled tab: there is nothing behind it to reach. A personal
           workspace has no members, no invitations and nothing to administer. */
        <span className="settings-context-note">
          You are in your personal workspace. Firm settings appear when you are in a firm.
        </span>
      )}
    </nav>
  );
}
