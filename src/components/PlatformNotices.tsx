/**
 * What the admin portal says to everyone, drawn at the top of every screen:
 * live announcements, maintenance mode, and, for an administrator looking at
 * the app as a member would, a reminder that that is what they are seeing.
 */
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Info, AlertTriangle, CheckCircle2, X, Wrench } from "lucide-react";
import {
  dismissAnnouncement,
  dismissedAnnouncements,
  useLiveAnnouncements,
  useMaintenance,
  type Tone,
} from "@/lib/platform";
import { useViewAsMember } from "@/lib/features";
import "./platform-notices.css";

const ICON: Record<Tone, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
};

export function PlatformBanners({ isAdmin }: { isAdmin: boolean }) {
  const live = useLiveAnnouncements();
  const maintenance = useMaintenance();
  const [asMember, setAsMember] = useViewAsMember();
  const [gone, setGone] = useState<string[]>(dismissedAnnouncements);
  const shown = live.filter((a) => !gone.includes(a.id));
  if (!shown.length && !(isAdmin && (asMember || maintenance.on))) return null;
  return (
    <div className="pn-stack">
      {isAdmin && asMember && (
        <div className="pn pn-admin" role="status">
          <span>
            You are viewing Scripta as a member sees it: switched-off features are held back from
            you too.
          </span>
          <button type="button" onClick={() => setAsMember(false)}>
            Stop viewing as a member
          </button>
        </div>
      )}
      {isAdmin && maintenance.on && (
        <div className="pn pn-warning" role="status">
          <Wrench size={14} aria-hidden />
          <span>
            Maintenance mode is on: members see a “back soon” page. You can keep working.{" "}
            <Link to="/admin" search={{ tab: "announcements" } as never}>
              Manage
            </Link>
          </span>
        </div>
      )}
      {shown.map((a) => {
        const Icon = ICON[a.tone];
        return (
          <div key={a.id} className={`pn pn-${a.tone}`} role="status">
            <Icon size={14} aria-hidden />
            <span>
              <strong>{a.title}</strong>
              {a.body && <> {a.body}</>}
            </span>
            {a.dismissible && (
              <button
                type="button"
                className="pn-close"
                aria-label="Dismiss"
                onClick={() => {
                  dismissAnnouncement(a.id);
                  setGone((g) => [...g, a.id]);
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Members see this in place of the app while maintenance mode is on. */
export function MaintenanceGate({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  const maintenance = useMaintenance();
  const [asMember] = useViewAsMember();
  if (!maintenance.on || (isAdmin && !asMember)) return <>{children}</>;
  return (
    <div className="pn-maintenance" role="status">
      <Wrench size={22} aria-hidden />
      <h1>Back shortly</h1>
      <p>
        {maintenance.message ||
          "Scripta is being updated. Your work is safe; please check back in a little while."}
      </p>
    </div>
  );
}
