/**
 * Campaigns: the brief each post is written against — the goal, who it is for,
 * the one message, where it runs, how it will be judged, and which entity it
 * speaks as. That entity's licences are what a licence claim is checked against.
 */
import { useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import {
  Empty,
  EntitySelect,
  ErrorLine,
  Facts,
  Field,
  FieldRow,
  OrgDialog,
  OrgPage,
  Panel,
  Pill,
  TextArea,
  TextInput,
  count,
  useOrganisation,
} from "@/organisation/ui";
import { entityLabel, formatDay } from "@/organisation/model";
import { deleteMarketing, insertMarketing, updateMarketing } from "../db";
import { CHANNEL_LABEL, STAGES, can, type Campaign, type Channel } from "../model";
import { useMarketingWrite, type SectionProps } from "../ui";

export default function Campaigns({ m, client, level, go }: SectionProps) {
  const org = useOrganisation(client.workspaceId, client.id);
  const write = useMarketingWrite(m.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const brief = can(level, "brief");

  const shown = m.campaigns.filter((c) => (showArchived ? !!c.archivedAt : !c.archivedAt));

  const remove = async (c: Campaign) => {
    if (
      !(await confirmDelete({
        what: `“${c.name}”`,
        consequence: "Its posts are kept, with no campaign.",
        binned: false,
      }))
    )
      return;
    await write.run(() => deleteMarketing("mkt_campaigns", c.id));
  };

  return (
    <OrgPage
      title="Campaigns"
      subtitle={
        brief
          ? "The brief every post in a campaign is written and checked against."
          : "The brief every post in a campaign is written against. Approvers set and change it."
      }
      actions={
        <>
          <Button variant="quiet" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Show current" : "Show archived"}
          </Button>
          {brief && (
            <Button variant="primary" onClick={() => setEditing("new")}>
              New campaign
            </Button>
          )}
        </>
      }
    >
      <ErrorLine error={write.error} />
      {shown.length === 0 ? (
        <Empty
          title={showArchived ? "No archived campaigns" : "No campaigns yet"}
          body={
            showArchived
              ? undefined
              : "A campaign gathers posts behind one goal and one message, and names the entity they speak for."
          }
          {...(brief && !showArchived
            ? {
                action: (
                  <Button variant="primary" onClick={() => setEditing("new")}>
                    New campaign
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        shown.map((c) => {
          const posts = m.posts.filter((p) => p.campaignId === c.id && !p.archivedAt);
          const entity = org.data?.entities.find((e) => e.id === c.entityId);
          return (
            <Panel
              key={c.id}
              title={c.name}
              right={
                <>
                  {c.status === "closed" && <Pill tone="retired">Closed</Pill>}
                  <button
                    type="button"
                    className="org-link"
                    onClick={() => go({ view: "content", item: null })}
                  >
                    {count(posts.length, "post")}
                  </button>
                  {brief && (
                    <>
                      <button type="button" className="org-link" onClick={() => setEditing(c)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="org-link"
                        onClick={() =>
                          void write.run(() =>
                            updateMarketing("mkt_campaigns", c.id, {
                              archived_at: c.archivedAt ? null : new Date().toISOString(),
                            }),
                          )
                        }
                      >
                        {c.archivedAt ? "Restore" : "Archive"}
                      </button>
                      <button type="button" className="org-link" onClick={() => void remove(c)}>
                        Delete
                      </button>
                    </>
                  )}
                </>
              }
            >
              <Facts
                rows={[
                  ["Goal", c.goal],
                  ["Audience", c.audience],
                  ["Message", c.message],
                  ["Channels", c.channels.map((ch) => CHANNEL_LABEL[ch]).join(", ")],
                  ["Measured by", c.measure],
                  ["Speaks as", entity ? entityLabel(entity) : ""],
                  [
                    "Runs",
                    c.startsOn || c.endsOn
                      ? `${formatDay(c.startsOn) || "…"} – ${formatDay(c.endsOn) || "…"}`
                      : "",
                  ],
                ]}
              />
              {posts.length > 0 && (
                <div className="og-chips mk-stage-chips">
                  {STAGES.map((s) => {
                    const n = posts.filter((p) => p.stage === s.id).length;
                    return n ? (
                      <span key={s.id} className="og-chip">
                        {s.label} {n}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </Panel>
          );
        })
      )}
      {editing && (
        <CampaignDialog
          m={m}
          campaign={editing === "new" ? null : editing}
          org={org.data ?? null}
          onClose={() => setEditing(null)}
        />
      )}
      {confirmDialog}
    </OrgPage>
  );
}

function CampaignDialog({
  m,
  campaign,
  org,
  onClose,
}: {
  m: SectionProps["m"];
  campaign: Campaign | null;
  org: ReturnType<typeof useOrganisation>["data"] | null;
  onClose: () => void;
}) {
  const write = useMarketingWrite(m.clientId);
  const [name, setName] = useState(campaign?.name ?? "");
  const [goal, setGoal] = useState(campaign?.goal ?? "");
  const [audience, setAudience] = useState(campaign?.audience ?? "");
  const [message, setMessage] = useState(campaign?.message ?? "");
  const [channels, setChannels] = useState<Channel[]>(campaign?.channels ?? ["linkedin"]);
  const [measure, setMeasure] = useState(campaign?.measure ?? "");
  const [entityId, setEntityId] = useState<string | null>(campaign?.entityId ?? null);
  const [startsOn, setStartsOn] = useState(campaign?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(campaign?.endsOn ?? "");
  const [closed, setClosed] = useState(campaign?.status === "closed");

  return (
    <OrgDialog
      open
      width={640}
      title={campaign ? `Edit ${campaign.name}` : "New campaign"}
      onClose={onClose}
      busy={write.busy}
      error={write.error}
      submitLabel={campaign ? "Save" : "Create"}
      onSubmit={async () => {
        if (!name.trim()) return write.setError("Give the campaign a name.");
        if (startsOn && endsOn && endsOn < startsOn)
          return write.setError("The campaign cannot end before it starts.");
        const row = {
          name: name.trim(),
          goal: goal.trim(),
          audience: audience.trim(),
          message: message.trim(),
          channels,
          measure: measure.trim(),
          entity_id: entityId,
          starts_on: startsOn || null,
          ends_on: endsOn || null,
          status: closed ? "closed" : "active",
        };
        const ok = await write.run(() =>
          campaign
            ? updateMarketing("mkt_campaigns", campaign.id, row)
            : insertMarketing(m, "mkt_campaigns", row),
        );
        if (ok) onClose();
      }}
    >
      <Field label="Name">
        <TextInput value={name} onChange={setName} autoFocus />
      </Field>
      <Field label="Goal" hint="What the campaign is for">
        <TextArea value={goal} onChange={setGoal} rows={2} />
      </Field>
      <FieldRow>
        <Field label="Audience">
          <TextInput
            value={audience}
            onChange={setAudience}
            placeholder="e.g. Offtakers in the EU"
          />
        </Field>
        <Field label="Measured by">
          <TextInput value={measure} onChange={setMeasure} placeholder="e.g. Qualified enquiries" />
        </Field>
      </FieldRow>
      <Field label="Key message">
        <TextArea value={message} onChange={setMessage} rows={2} />
      </Field>
      <fieldset className="og-change">
        <legend>Channels</legend>
        <div className="og-chips">
          {(Object.keys(CHANNEL_LABEL) as Channel[]).map((ch) => (
            <label key={ch} className="mk-check">
              <input
                type="checkbox"
                checked={channels.includes(ch)}
                onChange={(e) =>
                  setChannels((list) =>
                    e.target.checked ? [...list, ch] : list.filter((x) => x !== ch),
                  )
                }
              />
              {CHANNEL_LABEL[ch]}
            </label>
          ))}
        </div>
      </fieldset>
      <FieldRow>
        <Field label="Speaks as" hint="Licence claims are checked against this entity">
          {org ? (
            <EntitySelect org={org} value={entityId} onChange={setEntityId} empty="Not set" />
          ) : (
            <select disabled>
              <option>Loading…</option>
            </select>
          )}
        </Field>
        <Field label="Starts">
          <TextInput type="date" value={startsOn} onChange={setStartsOn} />
        </Field>
        <Field label="Ends">
          <TextInput type="date" value={endsOn} onChange={setEndsOn} />
        </Field>
      </FieldRow>
      {campaign && (
        <label className="mk-check">
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
          Closed — no more posts planned
        </label>
      )}
    </OrgDialog>
  );
}
