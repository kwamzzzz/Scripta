/**
 * Access: who can see this client's marketing. Nobody but the client's owner
 * until the owner adds them. Everyone else in the firm sees the client, its
 * organisation and the matters they are on, and no sign that marketing exists.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import { useFirmPeople } from "@/lib/matter-team";
import { relTime } from "@/lib/home-data";
import { ErrorLine, Field, FieldRow, OrgPage, Panel, Pill, Select } from "@/organisation/ui";
import { deleteMarketing, insertMarketing, marketingLevelKey, updateMarketing } from "../db";
import { LEVEL_LABEL, can, type AccessGrant } from "../model";
import { useMarketingWrite, type SectionProps } from "../ui";

const LEVELS: { value: AccessGrant["level"]; label: string }[] = [
  { value: "contributor", label: "Contributor — drafts, uploads, asks for review" },
  { value: "approver", label: "Approver — also briefs, approves, overrides, schedules" },
];

export default function Access({ m, client, level }: SectionProps) {
  const write = useMarketingWrite(m.clientId);
  const qc = useQueryClient();
  const people = useFirmPeople(m.workspaceId);
  const owner = can(level, "grant");
  const [userId, setUserId] = useState("");
  const [grant, setGrant] = useState<AccessGrant["level"]>("contributor");

  const nameOf = (id: string | null) =>
    (id && people.data?.find((p) => p.userId === id)?.name) || "Someone";
  const has = new Set([...m.access.map((a) => a.userId), ...(m.ownerId ? [m.ownerId] : [])]);
  const addable = (people.data ?? []).filter((p) => !has.has(p.userId) && p.userId !== m.meId);

  const changed = () => qc.invalidateQueries({ queryKey: marketingLevelKey(m.clientId) });

  return (
    <OrgPage
      title="Access"
      subtitle={`Marketing for ${client.name} is private. Only the person who created the client, and the people they add here, can see it — its posts, files and history.`}
    >
      <ErrorLine error={write.error} />
      <Panel title="Who can see this">
        <ul className="og-rows">
          <li>
            <div className="og-row-main">
              <span className="og-row-title">
                {m.ownerId ? nameOf(m.ownerId) : "Workspace owners and admins"}
                {m.ownerId && m.ownerId === m.meId ? " (you)" : ""}
              </span>
              <span className="og-row-meta">
                {m.ownerId
                  ? "Created the client. Decides who else can see its marketing."
                  : "Nobody is recorded as creating this client, so the workspace's owners and admins stand in."}
              </span>
            </div>
            <Pill tone="progress">Owner</Pill>
          </li>
          {m.access.map((a) => (
            <li key={a.id}>
              <div className="og-row-main">
                <span className="og-row-title">
                  {nameOf(a.userId)}
                  {a.userId === m.meId ? " (you)" : ""}
                </span>
                <span className="og-row-meta">
                  Added by {nameOf(a.grantedBy)} {relTime(a.createdAt)}
                </span>
              </div>
              <div className="og-row-side">
                {owner ? (
                  <>
                    <div className="rg-filter">
                      <Select
                        value={a.level}
                        onChange={(v) =>
                          v &&
                          void write
                            .run(() =>
                              updateMarketing("client_marketing_access", a.id, { level: v }),
                            )
                            .then(changed)
                        }
                        options={LEVELS.map((l) => ({
                          value: l.value,
                          label: LEVEL_LABEL[l.value],
                        }))}
                      />
                    </div>
                    <button
                      type="button"
                      className="org-link"
                      onClick={() =>
                        void write
                          .run(() => deleteMarketing("client_marketing_access", a.id))
                          .then(changed)
                      }
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <Pill tone="neutral">{LEVEL_LABEL[a.level]}</Pill>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      {owner ? (
        <Panel
          title="Add someone"
          hint="Anyone in the firm. They see it the next time they open the client."
        >
          <FieldRow>
            <Field label="Person">
              <Select
                value={userId}
                onChange={setUserId}
                options={addable.map((p) => ({ value: p.userId, label: p.name }))}
                empty={
                  people.isPending
                    ? "Loading…"
                    : addable.length
                      ? "Choose a person"
                      : "Everyone already has access"
                }
              />
            </Field>
            <Field label="Access">
              <Select
                value={grant}
                onChange={(v) => setGrant((v || "contributor") as AccessGrant["level"])}
                options={LEVELS}
              />
            </Field>
          </FieldRow>
          <div className="org-actions" style={{ justifyContent: "flex-start" }}>
            <Button
              variant="primary"
              disabled={!userId || write.busy}
              onClick={async () => {
                const ok = await write.run(() =>
                  insertMarketing(m, "client_marketing_access", { user_id: userId, level: grant }),
                );
                if (ok) setUserId("");
              }}
            >
              Give access
            </Button>
          </div>
        </Panel>
      ) : (
        <p className="og-muted">Only the client's owner can change who has access.</p>
      )}
    </OrgPage>
  );
}
