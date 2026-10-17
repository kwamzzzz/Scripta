/**
 * Every part of Scripta, each with three states: On, Coming soon (members see
 * it greyed out, with your note) or Hidden (members do not see it). A feature
 * that is off can be opened early to named people. Administrators keep full
 * access; "View as a member" shows the app as everyone else sees it.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import {
  FEATURES,
  FEATURE_GROUPS,
  useFeatureSettings,
  useSaveFeature,
  useViewAsMember,
  type FeatureDef,
  type FeatureSetting,
  type FeatureState,
} from "@/lib/features";
import { logAdminEvent } from "@/lib/platform";
import { ago, loadPeople, type AdminPerson } from "@/lib/admin-data";
import { useAdminActor } from "./actor";

const STATE_LABEL: Record<FeatureState, string> = {
  on: "On",
  dim: "Coming soon",
  hidden: "Hidden",
};
const STATE_HINT: Record<FeatureState, string> = {
  on: "Everyone can use it.",
  dim: "Members see it greyed out, with your note.",
  hidden: "Members do not see it at all.",
};

export default function FeaturesTab() {
  const { settings, loading } = useFeatureSettings();
  const people = useQuery({ queryKey: ["admin", "people"], queryFn: loadPeople });
  const save = useSaveFeature();
  const actor = useAdminActor();
  const [asMember, setAsMember] = useViewAsMember();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"all" | FeatureState>("all");
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { on: 0, dim: 0, hidden: 0 };
    for (const f of FEATURES) c[settings[f.key]?.state ?? "on"] += 1;
    return c;
  }, [settings]);

  const write = async (f: FeatureDef, next: FeatureSetting, what: string) => {
    setError(null);
    try {
      await save.mutateAsync({
        key: f.key,
        state: next.state,
        note: next.note,
        preview: next.preview,
        userId: actor.id,
      });
      await logAdminEvent(actor, "feature.changed", f.key, `${f.label}: ${what}`, {
        state: next.state,
        preview: next.preview.length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That change did not save.");
    }
  };

  const shown = FEATURES.filter((f) => {
    const s = settings[f.key]?.state ?? "on";
    if (show !== "all" && s !== show) return false;
    const q = query.trim().toLowerCase();
    return !q || `${f.label} ${f.hint} ${f.group}`.toLowerCase().includes(q);
  });

  return (
    <>
      <p className="adm-lede">
        Choose what members can use. You keep full access to everything whatever you choose here.
        Coming soon leaves a feature in place but greyed out, with a note from you; Hidden takes it
        away entirely. Open a switched-off feature early to named people to trial it.
      </p>
      <div className="adm-toolbar">
        <input
          type="search"
          placeholder="Find a feature"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Find a feature"
        />
        <div className="adm-summary-chips" role="group" aria-label="Show">
          {(["all", "on", "dim", "hidden"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`adm-chip${k !== "all" ? ` is-${k}` : ""}`}
              aria-pressed={show === k}
              style={show === k ? { outline: "2px solid var(--scripta-teal, #247a78)" } : undefined}
              onClick={() => setShow(k)}
            >
              {k === "all" ? `All ${FEATURES.length}` : `${STATE_LABEL[k]} ${counts[k]}`}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <Button onClick={() => setAsMember(!asMember)}>
          {asMember ? "Stop viewing as a member" : "View the app as a member"}
        </Button>
        {counts.on < FEATURES.length && (
          <Button
            onClick={async () => {
              for (const f of FEATURES) {
                const s = settings[f.key];
                if (s && s.state !== "on")
                  await write(f, { ...s, state: "on" }, "turned on (all features back on)");
              }
            }}
          >
            Turn everything on
          </Button>
        )}
      </div>
      {error && <p className="adm-error">{error}</p>}
      {loading ? (
        <p className="adm-muted">Loading…</p>
      ) : (
        FEATURE_GROUPS.map((group) => {
          const rows = shown.filter((f) => f.group === group);
          if (!rows.length) return null;
          return (
            <section key={group} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2>{group}</h2>
              <div className="adm-feature-grid">
                {rows.map((f) => (
                  <FeatureCard
                    key={f.key}
                    f={f}
                    setting={settings[f.key]!}
                    people={people.data ?? []}
                    busy={save.isPending}
                    onWrite={write}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}

function FeatureCard({
  f,
  setting,
  people,
  busy,
  onWrite,
}: {
  f: FeatureDef;
  setting: FeatureSetting;
  people: AdminPerson[];
  busy: boolean;
  onWrite: (f: FeatureDef, next: FeatureSetting, what: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(setting.note);
  const [preview, setPreview] = useState<string[]>(setting.preview);
  const dirty = note !== setting.note || preview.join() !== setting.preview.join();
  const members = people.filter((p) => !p.isAdmin);

  return (
    <article className={`adm-feature is-${setting.state}`}>
      <div className="adm-feature-head">
        <div style={{ minWidth: 0 }}>
          <strong>{f.label}</strong>
          <span className="adm-muted" style={{ fontSize: 12 }}>
            {f.hint}
          </span>
        </div>
        <div className="adm-seg" role="group" aria-label={`${f.label} availability`}>
          {(["on", "dim", "hidden"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`is-${s}`}
              aria-pressed={setting.state === s}
              title={STATE_HINT[s]}
              disabled={busy || setting.state === s}
              onClick={() =>
                void onWrite(f, { ...setting, state: s }, `set to ${STATE_LABEL[s].toLowerCase()}`)
              }
            >
              {STATE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      {f.caution && setting.state !== "on" && <p className="adm-caution">{f.caution}</p>}
      <div className="adm-actions" style={{ fontSize: 12 }}>
        <button
          type="button"
          className="adm-link"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? "Less" : "Note and early access"}
        </button>
        {setting.preview.length > 0 && (
          <span className="adm-chip is-on">Early access: {setting.preview.length}</span>
        )}
        {setting.note && <span className="adm-chip">Has a note</span>}
        {setting.updatedAt && <span className="adm-muted">Changed {ago(setting.updatedAt)}</span>}
      </div>
      {open && (
        <div className="adm-more">
          <label className="adm-field">
            <span>What members read while it is coming soon</span>
            <input
              value={note}
              maxLength={200}
              placeholder="This area is being worked on and will open soon."
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="adm-field">
            <span>Early access: these people see it on while it is off for everyone else</span>
            {members.length === 0 ? (
              <span className="adm-muted">Everyone signed in is an administrator already.</span>
            ) : (
              <div className="adm-people-pick">
                {members.map((p) => {
                  const on = preview.includes(p.id);
                  return (
                    <label key={p.id} className={on ? "is-on" : undefined}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setPreview(on ? preview.filter((x) => x !== p.id) : [...preview, p.id])
                        }
                      />
                      {p.name}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div className="adm-actions">
            <Button
              variant="primary"
              disabled={!dirty || busy}
              onClick={() =>
                void onWrite(
                  f,
                  { ...setting, note, preview },
                  `note and early access updated (${preview.length} with early access)`,
                )
              }
            >
              Save
            </Button>
            {dirty && (
              <Button
                onClick={() => {
                  setNote(setting.note);
                  setPreview(setting.preview);
                }}
              >
                Discard
              </Button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
