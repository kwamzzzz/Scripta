/**
 * Content: every post, as a flow from idea to published, or laid out on the
 * month it goes out. Anyone with access drafts; approvers send it out.
 */
import { useState } from "react";
import { Button } from "@/components/primitives";
import {
  Empty,
  Field,
  FieldRow,
  OrgDialog,
  OrgPage,
  Pill,
  Segmented,
  Select,
  TextInput,
} from "@/organisation/ui";
import { insertMarketing } from "../db";
import {
  CHANNEL_LABEL,
  STAGES,
  localDate,
  monthName,
  monthWeeks,
  postDay,
  readiness,
  shiftMonth,
  type Channel,
  type Post,
} from "../model";
import { useMarketingWrite, type SectionProps } from "../ui";

export default function Content({ m, go }: SectionProps) {
  const [lens, setLens] = useState<"board" | "schedule">("board");
  const [campaignId, setCampaignId] = useState<string>("");
  const [month, setMonth] = useState(() => localDate(new Date().toISOString()).slice(0, 7));
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const posts = m.posts.filter(
    (p) =>
      (showArchived ? !!p.archivedAt : !p.archivedAt) &&
      (!campaignId || p.campaignId === campaignId),
  );
  const campaignName = new Map(m.campaigns.map((c) => [c.id, c.name]));

  const card = (p: Post) => {
    const r = readiness(p, [], m.approvals, m.overrides);
    const day = postDay(p);
    return (
      <button key={p.id} type="button" className="mk-card" onClick={() => go({ item: p.id })}>
        <span className="mk-card-title">{p.title}</span>
        <span className="mk-card-meta">
          {[
            CHANNEL_LABEL[p.channel],
            p.campaignId ? campaignName.get(p.campaignId) : "",
            day
              ? new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })
              : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="mk-card-foot">
          <span className="og-muted">v{p.version}</span>
          {p.stage === "review" &&
            (r.approved ? (
              <Pill tone="good">Approved</Pill>
            ) : r.changesAsked ? (
              <Pill tone="warning">Changes asked</Pill>
            ) : r.awaiting ? (
              <Pill tone="neutral">Awaiting approval</Pill>
            ) : null)}
        </span>
      </button>
    );
  };

  return (
    <OrgPage
      title="Content"
      subtitle="From idea to published. A post goes out only once this version is approved and its checks are clear or overridden."
      wide
      actions={
        <>
          <Segmented
            label="View"
            value={lens}
            onChange={setLens}
            options={[
              { id: "board", label: "Board" },
              { id: "schedule", label: "Schedule" },
            ]}
          />
          {m.campaigns.length > 0 && (
            <div className="rg-filter">
              <Select
                value={campaignId}
                onChange={(v) => setCampaignId(v)}
                options={m.campaigns
                  .filter((c) => !c.archivedAt)
                  .map((c) => ({ value: c.id, label: c.name }))}
                empty="All campaigns"
              />
            </div>
          )}
          <Button variant="quiet" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Show current" : "Show archived"}
          </Button>
          <Button variant="primary" onClick={() => setAdding(true)}>
            New post
          </Button>
        </>
      }
    >
      {m.posts.length === 0 ? (
        <Empty
          title="No posts yet"
          body="Start with an idea. Drafts, reviews, approvals and what went out are all kept here, with every version."
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              New post
            </Button>
          }
        />
      ) : lens === "board" ? (
        <div className="mk-board">
          {STAGES.map((s) => {
            const here = posts.filter((p) => p.stage === s.id);
            return (
              <section key={s.id} className="mk-col" aria-label={s.label}>
                <header>
                  <span>{s.label}</span>
                  <span className="og-nav-count">{here.length || ""}</span>
                </header>
                {here.map(card)}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mk-month">
          <div className="mk-month-head">
            <Button
              variant="quiet"
              onClick={() => setMonth(shiftMonth(month, -1))}
              title="Previous month"
            >
              ‹
            </Button>
            <strong>{monthName(month)}</strong>
            <Button
              variant="quiet"
              onClick={() => setMonth(shiftMonth(month, 1))}
              title="Next month"
            >
              ›
            </Button>
          </div>
          <div className="mk-grid" role="grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="mk-grid-dow" role="columnheader">
                {d}
              </div>
            ))}
            {monthWeeks(month)
              .flat()
              .map((day, i) => (
                <div
                  key={day ?? `x${i}`}
                  className={`mk-day${day ? "" : " is-out"}`}
                  role="gridcell"
                >
                  {day && <span className="mk-day-n">{Number(day.slice(8))}</span>}
                  {day &&
                    posts
                      .filter((p) => postDay(p) === day)
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`mk-day-post is-${p.stage}`}
                          onClick={() => go({ item: p.id })}
                          title={`${p.title} · ${CHANNEL_LABEL[p.channel]}`}
                        >
                          {p.title}
                        </button>
                      ))}
                </div>
              ))}
          </div>
          {posts.some((p) => !postDay(p)) && (
            <p className="og-muted mk-note">
              {posts.filter((p) => !postDay(p)).length} not yet scheduled.
            </p>
          )}
        </div>
      )}
      {adding && (
        <NewPostDialog
          m={m}
          campaignId={campaignId || null}
          onClose={() => setAdding(false)}
          onCreated={(id) => go({ item: id })}
        />
      )}
    </OrgPage>
  );
}

function NewPostDialog({
  m,
  campaignId: initialCampaign,
  onClose,
  onCreated,
}: {
  m: SectionProps["m"];
  campaignId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const write = useMarketingWrite(m.clientId);
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState<Channel>("linkedin");
  const [campaignId, setCampaignId] = useState(initialCampaign ?? "");
  return (
    <OrgDialog
      open
      title="New post"
      blurb="A working title is enough. It starts as an idea."
      onClose={onClose}
      busy={write.busy}
      error={write.error}
      submitLabel="Create"
      onSubmit={async () => {
        if (!title.trim()) return write.setError("Give the post a working title.");
        let id = "";
        const ok = await write.run(async () => {
          id = await insertMarketing(m, "mkt_content", {
            title: title.trim(),
            channel,
            campaign_id: campaignId || null,
          });
        });
        if (ok) {
          onClose();
          onCreated(id);
        }
      }}
    >
      <Field label="Working title">
        <TextInput value={title} onChange={setTitle} autoFocus />
      </Field>
      <FieldRow>
        <Field label="Channel">
          <Select
            value={channel}
            onChange={(v) => setChannel((v || "linkedin") as Channel)}
            options={(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => ({
              value: c,
              label: CHANNEL_LABEL[c],
            }))}
          />
        </Field>
        <Field label="Campaign">
          <Select
            value={campaignId}
            onChange={setCampaignId}
            options={m.campaigns
              .filter((c) => !c.archivedAt)
              .map((c) => ({ value: c.id, label: c.name }))}
            empty="No campaign"
          />
        </Field>
      </FieldRow>
    </OrgDialog>
  );
}
