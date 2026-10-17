/**
 * Speaking to everyone at once: announcements shown as a banner at the top of
 * every screen, within a window you choose, and maintenance mode, which gives
 * members a calm "back soon" page while administrators keep working.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { supabase } from "@/integrations/supabase/client";
import {
  isLive,
  listAnnouncements,
  logAdminEvent,
  saveMaintenance,
  useMaintenance,
  type Announcement,
  type Tone,
} from "@/lib/platform";
import { ago } from "@/lib/admin-data";
import { useAdminActor } from "./actor";

const ICON: Record<Tone, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
};
const TONE_LABEL: Record<Tone, string> = {
  info: "Information",
  warning: "Warning",
  success: "Good news",
};

/** A local date-time input value for an ISO time. */
const localInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

type Draft = {
  title: string;
  body: string;
  tone: Tone;
  audience: "everyone" | "admins";
  starts: string;
  ends: string;
  dismissible: boolean;
};
const EMPTY: Draft = {
  title: "",
  body: "",
  tone: "info",
  audience: "everyone",
  starts: "",
  ends: "",
  dismissible: true,
};

export default function AnnouncementsTab() {
  const qc = useQueryClient();
  const actor = useAdminActor();
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const list = useQuery({ queryKey: ["admin", "announcements"], queryFn: listAnnouncements });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin"] });
    void qc.invalidateQueries({ queryKey: ["announcements"] });
  };
  const run = async (what: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await what();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  };

  const publish = () =>
    run(async () => {
      const row = {
        title: draft.title.trim(),
        body: draft.body.trim(),
        tone: draft.tone,
        audience: draft.audience,
        starts_at: draft.starts ? new Date(draft.starts).toISOString() : new Date().toISOString(),
        ends_at: draft.ends ? new Date(draft.ends).toISOString() : null,
        dismissible: draft.dismissible,
      };
      if (row.ends_at && row.ends_at <= row.starts_at)
        throw new Error("The end must come after the start.");
      const { error: e } = editing
        ? await supabase.from("announcements").update(row).eq("id", editing)
        : await supabase.from("announcements").insert({ ...row, created_by: actor.id });
      if (e) throw new Error(e.message);
      await logAdminEvent(
        actor,
        editing ? "announcement.edited" : "announcement.posted",
        editing ?? "",
        `${editing ? "Edited" : "Posted"} announcement “${row.title}”`,
      );
      setDraft(EMPTY);
      setEditing(null);
    });

  const setArchived = (a: Announcement, archived: boolean) =>
    run(async () => {
      const { error: e } = await supabase
        .from("announcements")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", a.id);
      if (e) throw new Error(e.message);
      await logAdminEvent(
        actor,
        archived ? "announcement.archived" : "announcement.restored",
        a.id,
        `${archived ? "Archived" : "Restored"} announcement “${a.title}”`,
      );
    });

  const remove = async (a: Announcement) => {
    if (!(await confirmDelete({ what: `the announcement “${a.title}”`, binned: false }))) return;
    await run(async () => {
      const { error: e } = await supabase.from("announcements").delete().eq("id", a.id);
      if (e) throw new Error(e.message);
      await logAdminEvent(actor, "announcement.deleted", a.id, `Deleted announcement “${a.title}”`);
    });
  };

  const all = list.data ?? [];
  const now = Date.now();
  const groups: [string, Announcement[]][] = [
    ["Showing now", all.filter((a) => isLive(a, now))],
    ["Scheduled", all.filter((a) => !a.archivedAt && Date.parse(a.startsAt) > now)],
    ["Ended", all.filter((a) => !a.archivedAt && a.endsAt !== null && Date.parse(a.endsAt) <= now)],
    ["Archived", all.filter((a) => a.archivedAt)],
  ];
  const PreviewIcon = ICON[draft.tone];

  return (
    <>
      <Maintenance />

      <section className="adm-panel">
        <h2>{editing ? "Edit announcement" : "New announcement"}</h2>
        <div className="adm-form-grid">
          <label className="adm-field" style={{ gridColumn: "1 / -1" }}>
            <span>Headline</span>
            <input
              value={draft.title}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g. Scripta will be updated on Friday evening"
            />
          </label>
          <label className="adm-field" style={{ gridColumn: "1 / -1" }}>
            <span>More detail (optional)</span>
            <input
              value={draft.body}
              maxLength={400}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </label>
          <label className="adm-field">
            <span>Kind</span>
            <select
              value={draft.tone}
              onChange={(e) => setDraft({ ...draft, tone: e.target.value as Tone })}
            >
              {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
                <option key={t} value={t}>
                  {TONE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="adm-field">
            <span>Who sees it</span>
            <select
              value={draft.audience}
              onChange={(e) =>
                setDraft({ ...draft, audience: e.target.value as Draft["audience"] })
              }
            >
              <option value="everyone">Everyone</option>
              <option value="admins">Administrators only</option>
            </select>
          </label>
          <label className="adm-field">
            <span>From (blank: now)</span>
            <input
              type="datetime-local"
              value={draft.starts}
              onChange={(e) => setDraft({ ...draft, starts: e.target.value })}
            />
          </label>
          <label className="adm-field">
            <span>Until (blank: until archived)</span>
            <input
              type="datetime-local"
              value={draft.ends}
              onChange={(e) => setDraft({ ...draft, ends: e.target.value })}
            />
          </label>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={draft.dismissible}
            onChange={(e) => setDraft({ ...draft, dismissible: e.target.checked })}
          />
          People can dismiss it
        </label>
        {draft.title.trim() && (
          <div className={`adm-notice is-${draft.tone}`} aria-label="Preview">
            <PreviewIcon size={14} aria-hidden style={{ marginTop: 3 }} />
            <div>
              <strong>{draft.title}</strong> {draft.body}
            </div>
          </div>
        )}
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-actions">
          <Button
            variant="primary"
            disabled={busy || !draft.title.trim()}
            onClick={() => void publish()}
          >
            {editing
              ? "Save changes"
              : draft.starts && Date.parse(draft.starts) > Date.now()
                ? "Schedule"
                : "Post now"}
          </Button>
          {(editing || draft.title) && (
            <Button
              onClick={() => {
                setDraft(EMPTY);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </section>

      {list.isLoading ? (
        <p className="adm-muted">Loading…</p>
      ) : (
        groups.map(([label, rows]) =>
          rows.length === 0 ? null : (
            <section key={label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2>
                {label} · {rows.length}
              </h2>
              {rows.map((a) => {
                const Icon = ICON[a.tone];
                return (
                  <div key={a.id} className={`adm-notice is-${a.tone}`}>
                    <Icon size={14} aria-hidden style={{ marginTop: 3 }} />
                    <div>
                      <strong>{a.title}</strong> {a.body}
                      <div className="adm-muted" style={{ fontSize: 12 }}>
                        {a.audience === "admins" ? "Administrators only" : "Everyone"} · from{" "}
                        {new Date(a.startsAt).toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {a.endsAt
                          ? ` until ${new Date(a.endsAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`
                          : ""}
                        {a.dismissible ? "" : " · cannot be dismissed"} · posted {ago(a.createdAt)}
                      </div>
                    </div>
                    <div className="adm-actions">
                      {!a.archivedAt && (
                        <button
                          type="button"
                          className="adm-link"
                          onClick={() => {
                            setEditing(a.id);
                            setDraft({
                              title: a.title,
                              body: a.body,
                              tone: a.tone,
                              audience: a.audience,
                              starts: localInput(a.startsAt),
                              ends: localInput(a.endsAt),
                              dismissible: a.dismissible,
                            });
                          }}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        className="adm-link"
                        disabled={busy}
                        onClick={() => void setArchived(a, !a.archivedAt)}
                      >
                        {a.archivedAt ? "Restore" : "Archive"}
                      </button>
                      <button
                        type="button"
                        className="adm-link"
                        style={{ color: "#9a3d2f" }}
                        disabled={busy}
                        onClick={() => void remove(a)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          ),
        )
      )}
      {confirmDialog}
    </>
  );
}

function Maintenance() {
  const qc = useQueryClient();
  const actor = useAdminActor();
  const current = useMaintenance();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = message ?? current.message;

  const write = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await saveMaintenance(
        { on, message: text.trim(), since: on ? new Date().toISOString() : null },
        actor.id,
      );
      await logAdminEvent(
        actor,
        on ? "maintenance.on" : "maintenance.off",
        "maintenance",
        on ? "Maintenance mode switched on" : "Maintenance mode switched off",
      );
      setMessage(null);
      void qc.invalidateQueries({ queryKey: ["platform-settings"] });
      void qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="adm-panel"
      style={current.on ? { borderColor: "#e5d8b4", background: "#fffdf6" } : undefined}
    >
      <div className="adm-switch-row">
        <div>
          <h2>Maintenance mode · {current.on ? "on" : "off"}</h2>
          <p style={{ margin: "4px 0 0" }}>
            {current.on
              ? `Members have been seeing a “back soon” page since ${current.since ? ago(current.since).toLowerCase() : "earlier"}. Administrators carry on as normal.`
              : "When on, members see a calm “back soon” page instead of the app; nothing is lost and administrators keep working. Use it for updates and migrations."}
          </p>
        </div>
        <Button
          variant={current.on ? "primary" : "danger"}
          disabled={busy}
          onClick={() => void write(!current.on)}
        >
          {current.on ? "Switch off" : "Switch on"}
        </Button>
      </div>
      <label className="adm-field">
        <span>What members read</span>
        <input
          value={text}
          maxLength={300}
          placeholder="Scripta is being updated. Your work is safe; please check back in a little while."
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      {current.on && message !== null && message !== current.message && (
        <div className="adm-actions">
          <Button disabled={busy} onClick={() => void write(true)}>
            Update message
          </Button>
        </div>
      )}
      {error && <p className="adm-error">{error}</p>}
    </section>
  );
}
