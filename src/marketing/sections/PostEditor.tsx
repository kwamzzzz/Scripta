/**
 * One post: its text, its checks, its approvals and its versions.
 *
 * What is approved is a version, not a post. Changing the text makes a new
 * version, which needs its own approval — and a post already scheduled or
 * published goes back to review. The database enforces that; this screen says
 * it before it happens.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { useFirmPeople } from "@/lib/matter-team";
import { relTime } from "@/lib/home-data";
import {
  ErrorLine,
  Eyebrow,
  Facts,
  Field,
  FieldRow,
  OrgDialog,
  OrgPage,
  Panel,
  Pill,
  Select,
  TextArea,
  TextInput,
} from "@/organisation/ui";
import {
  assetUrl,
  decideApproval,
  deleteMarketing,
  insertMarketing,
  loadChecks,
  loadVersions,
  requestApproval,
  updateMarketing,
} from "../db";
import {
  APPROVAL_LABEL,
  ASSET_KIND_LABEL,
  CHANNEL_LABEL,
  STAGES,
  STAGE_LABEL,
  assetLapsed,
  can,
  isOverridden,
  localDateTime,
  readiness,
  type ApprovalKind,
  type Channel,
  type Check,
  type Post,
} from "../model";
import { useMarketingWrite, type SectionProps } from "../ui";

const LIMIT: Partial<Record<Channel, number>> = { linkedin: 3000 };

const TONE = { pass: "good", warn: "warning", block: "danger" } as const;

export default function PostEditor({ m, level, item, go }: SectionProps) {
  const post = m.posts.find((p) => p.id === item)!;
  const write = useMarketingWrite(m.clientId);
  const people = useFirmPeople(m.workspaceId);
  const nameOf = (id: string | null) =>
    (id && people.data?.find((p) => p.userId === id)?.name) || "Someone";
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [channel, setChannel] = useState<Channel>(post.channel);
  const [campaignId, setCampaignId] = useState(post.campaignId ?? "");
  const [assetId, setAssetId] = useState(post.assetId ?? "");
  const [when, setWhen] = useState(localDateTime(post.scheduledAt));
  const [legal, setLegal] = useState(false);
  const [overriding, setOverriding] = useState<Check | null>(null);
  const [asking, setAsking] = useState<ApprovalKind | null>(null);
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const [seen, setSeen] = useState(post.updatedAt);

  // Another save (ours, or someone else's) replaced the post: take its text.
  if (post.updatedAt !== seen) {
    setSeen(post.updatedAt);
    setTitle(post.title);
    setBody(post.body);
    setChannel(post.channel);
    setCampaignId(post.campaignId ?? "");
    setAssetId(post.assetId ?? "");
    setWhen(localDateTime(post.scheduledAt));
  }

  const checks = useQuery({
    queryKey: [
      "marketing-checks",
      post.id,
      post.version,
      post.updatedAt,
      m.kit?.updatedAt,
      m.consents.length,
    ],
    retry: false,
    queryFn: () => loadChecks(post.id),
  });
  const versions = useQuery({
    queryKey: ["marketing-versions", post.id, post.version],
    retry: false,
    queryFn: () => loadVersions(post.id),
  });

  const textDirty = title !== post.title || body !== post.body;
  const dirty =
    textDirty ||
    channel !== post.channel ||
    campaignId !== (post.campaignId ?? "") ||
    assetId !== (post.assetId ?? "");
  const r = readiness(post, checks.data ?? [], m.approvals, m.overrides);
  const approver = can(level, "approve");
  const out = post.stage === "scheduled" || post.stage === "published";
  const mine = m.approvals.filter((a) => a.contentId === post.id);
  const current = (kind: ApprovalKind) =>
    mine.find((a) => a.kind === kind && a.version === post.version && a.status === "requested") ??
    mine.find((a) => a.kind === kind && a.version === post.version) ??
    null;
  const asset = m.assets.find((a) => a.id === (assetId || null)) ?? null;
  const limit = LIMIT[channel];

  const saveRow = () =>
    updateMarketing("mkt_content", post.id, {
      title: title.trim() || post.title,
      body,
      channel,
      campaign_id: campaignId || null,
      asset_id: assetId || null,
    });
  const save = () => write.run(saveRow);

  const setStage = (stage: Post["stage"], extra: Record<string, unknown> = {}) =>
    write.run(() => updateMarketing("mkt_content", post.id, { stage, ...extra }));

  const sendForReview = () =>
    write.run(async () => {
      if (dirty) await saveRow();
      await updateMarketing("mkt_content", post.id, { stage: "review" });
      const version = post.version + (textDirty ? 1 : 0);
      const has = (kind: ApprovalKind) =>
        m.approvals.some(
          (a) =>
            a.contentId === post.id &&
            a.kind === kind &&
            a.version === version &&
            a.status !== "changes_requested",
        );
      if (!has("director_approval")) await requestApproval(m, post.id, "director_approval");
      if (legal && !has("legal_review")) await requestApproval(m, post.id, "legal_review");
    });

  const decide = (kind: ApprovalKind, status: "approved" | "changes_requested", note = "") =>
    write.run(async () => {
      await decideApproval(m, post.id, post.version, kind, status, note);
      if (status === "changes_requested" && kind === "director_approval")
        await updateMarketing("mkt_content", post.id, { stage: "drafting" });
    });

  const schedule = () => {
    if (!when) return write.setError("Choose when it goes out.");
    return setStage("scheduled", { scheduled_at: new Date(when).toISOString() });
  };

  const remove = async () => {
    if (
      !(await confirmDelete({
        what: `“${post.title}”`,
        consequence: "Its versions, approvals and overrides go with it.",
        binned: false,
      }))
    )
      return;
    if (await write.run(() => deleteMarketing("mkt_content", post.id))) go({ item: null });
  };

  const stageIndex = STAGES.findIndex((s) => s.id === post.stage);

  return (
    <OrgPage
      title={post.title}
      subtitle={`${CHANNEL_LABEL[post.channel]} · version ${post.version} · ${STAGE_LABEL[post.stage]}${post.archivedAt ? " · Archived" : ""}`}
      actions={
        <>
          <Button variant="quiet" onClick={() => go({ item: null })}>
            All content
          </Button>
          <Button
            variant="quiet"
            onClick={() =>
              void write.run(() =>
                updateMarketing("mkt_content", post.id, {
                  archived_at: post.archivedAt ? null : new Date().toISOString(),
                }),
              )
            }
          >
            {post.archivedAt ? "Restore" : "Archive"}
          </Button>
          {can(level, "delete") && (
            <Button variant="quiet" onClick={() => void remove()}>
              Delete
            </Button>
          )}
          <Button variant="primary" disabled={!dirty || write.busy} onClick={() => void save()}>
            {write.busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
      aside={
        <>
          <Panel
            title="Checks"
            hint={
              textDirty
                ? "These are for the saved text. Save to check your changes."
                : "Run by Scripta on the saved text, against the brand kit, the posting entity's licences and the consents on file."
            }
          >
            {checks.isError ? (
              <ErrorLine error={(checks.error as Error).message} />
            ) : !checks.data ? (
              <p className="og-muted">Checking…</p>
            ) : checks.data.length === 0 ? (
              <p className="og-muted">Nothing to check yet.</p>
            ) : (
              <ul className="og-rows">
                {checks.data.map((c) => {
                  const o = isOverridden(post, c.checkKey, m.overrides);
                  return (
                    <li key={c.checkKey}>
                      <span className={`og-dot is-${o ? "warning" : TONE[c.level]}`} />
                      <div className="og-row-main">
                        <span className="og-row-title">{c.title}</span>
                        <span className="og-row-meta">{c.reason}</span>
                        {o && (
                          <span className="og-row-meta">
                            Overridden by {nameOf(o.actorId)}: {o.reason}
                          </span>
                        )}
                      </div>
                      <div className="og-row-side">
                        {c.level === "block" && !o && can(level, "override") ? (
                          <button
                            type="button"
                            className="org-link"
                            onClick={() => setOverriding(c)}
                          >
                            Override
                          </button>
                        ) : (
                          <Pill tone={o ? "warning" : TONE[c.level]}>
                            {o
                              ? "Overridden"
                              : c.level === "pass"
                                ? "Clear"
                                : c.level === "warn"
                                  ? "Note"
                                  : "Blocks"}
                          </Pill>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          <Panel title="Approvals">
            {mine.length === 0 ? (
              <p className="og-muted">Not yet sent for review.</p>
            ) : (
              <ul className="og-rows">
                {mine.map((a) => (
                  <li key={a.id}>
                    <div className="og-row-main">
                      <span className="og-row-title">
                        {APPROVAL_LABEL[a.kind]} · v{a.version}
                        {a.version !== post.version ? " (earlier version)" : ""}
                      </span>
                      <span className="og-row-meta">
                        {a.status === "requested"
                          ? `Asked by ${nameOf(a.requestedBy)} ${relTime(a.createdAt)}`
                          : `${a.status === "approved" ? "Approved" : "Changes asked"} by ${nameOf(a.decidedBy)} ${a.decidedAt ? relTime(a.decidedAt) : ""}`}
                      </span>
                      {a.note && <span className="og-row-meta">“{a.note}”</span>}
                    </div>
                    <Pill
                      tone={
                        a.status === "approved"
                          ? "good"
                          : a.status === "requested"
                            ? "neutral"
                            : "warning"
                      }
                    >
                      {a.status === "approved"
                        ? "Approved"
                        : a.status === "requested"
                          ? "Waiting"
                          : "Changes"}
                    </Pill>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Versions">
            <ul className="og-rows">
              {(versions.data ?? []).map((v) => (
                <li key={v.id}>
                  <div className="og-row-main">
                    <button
                      type="button"
                      className="org-link mk-version"
                      onClick={() => setOpenVersion(openVersion === v.version ? null : v.version)}
                    >
                      Version {v.version}
                      {v.version === post.version ? " · current" : ""}
                    </button>
                    <span className="og-row-meta">
                      {nameOf(v.createdBy)} · {relTime(v.createdAt)}
                    </span>
                    {openVersion === v.version && (
                      <div className="mk-version-text">
                        <strong>{v.title}</strong>
                        <p>{v.body || "No text."}</p>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      }
    >
      <ErrorLine error={write.error} />
      <ol className="mk-steps" aria-label="Stage">
        {STAGES.map((s, i) => (
          <li key={s.id} className={i < stageIndex ? "is-done" : i === stageIndex ? "is-on" : ""}>
            {s.label}
          </li>
        ))}
      </ol>

      <Panel
        title="What happens next"
        {...(r.blocking.length && post.stage === "review" ? { tone: "warning" as const } : {})}
      >
        {post.stage === "idea" || post.stage === "drafting" ? (
          <div className="mk-next">
            <p>
              {r.changesAsked
                ? `Changes were asked for${r.changesAsked.note ? `: “${r.changesAsked.note}”` : "."} Revise it and send it for review again.`
                : "When the draft is ready, send it for review. An approver decides on the version you send."}
            </p>
            <label className="mk-check">
              <input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} />
              Ask for a legal review as well
            </label>
            <div className="org-actions" style={{ justifyContent: "flex-start" }}>
              <Button variant="primary" disabled={write.busy} onClick={() => void sendForReview()}>
                {dirty ? "Save and send for review" : "Send for review"}
              </Button>
              {post.stage === "idea" && (
                <Button onClick={() => void setStage("drafting")}>Start drafting</Button>
              )}
            </div>
          </div>
        ) : post.stage === "review" ? (
          <div className="mk-next">
            <p>
              {r.approved
                ? r.blocking.length
                  ? `Version ${post.version} is approved. ${r.blocking.length === 1 ? "One check blocks it" : `${r.blocking.length} checks block it`}: an approver must override ${r.blocking.length === 1 ? "it" : "each"} with a reason before it can go out.`
                  : `Version ${post.version} is approved and its checks are clear.`
                : approver
                  ? `Version ${post.version} is waiting for a decision.`
                  : `Version ${post.version} is with an approver.`}
            </p>
            {approver && dirty && (
              <p className="og-hint">
                Save your changes first: a decision is on the saved version.
              </p>
            )}
            <div className="org-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
              {approver && !r.approved && (
                <>
                  <Button
                    variant="primary"
                    disabled={dirty || write.busy}
                    onClick={() => void decide("director_approval", "approved")}
                  >
                    Approve version {post.version}
                  </Button>
                  <Button
                    disabled={dirty || write.busy}
                    onClick={() => setAsking("director_approval")}
                  >
                    Ask for changes
                  </Button>
                </>
              )}
              {approver && current("legal_review")?.status === "requested" && (
                <>
                  <Button
                    disabled={dirty || write.busy}
                    onClick={() => void decide("legal_review", "approved")}
                  >
                    Clear legal review
                  </Button>
                  <Button disabled={dirty || write.busy} onClick={() => setAsking("legal_review")}>
                    Legal changes
                  </Button>
                </>
              )}
              <Button variant="quiet" onClick={() => void setStage("drafting")}>
                Back to drafting
              </Button>
            </div>
            {approver && r.clear && (
              <div className="mk-schedule">
                <Field label="Goes out">
                  <input
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                  />
                </Field>
                <Button
                  variant="primary"
                  disabled={dirty || write.busy}
                  onClick={() => void schedule()}
                >
                  Schedule
                </Button>
                <Button
                  disabled={dirty || write.busy}
                  onClick={() =>
                    void setStage("published", { published_at: new Date().toISOString() })
                  }
                >
                  Mark published now
                </Button>
              </div>
            )}
          </div>
        ) : post.stage === "scheduled" ? (
          <div className="mk-next">
            <p>
              Scheduled for{" "}
              {post.scheduledAt
                ? new Date(post.scheduledAt).toLocaleString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
              . Scripta does not post it for you: mark it published once it is out.
            </p>
            <div className="org-actions" style={{ justifyContent: "flex-start" }}>
              {approver && (
                <Button
                  variant="primary"
                  disabled={write.busy}
                  onClick={() =>
                    void setStage("published", { published_at: new Date().toISOString() })
                  }
                >
                  Mark published
                </Button>
              )}
              <Button onClick={() => void setStage("review")}>Take off the schedule</Button>
            </div>
          </div>
        ) : (
          <Metrics post={post} write={write} />
        )}
      </Panel>

      <Panel title="Post">
        {out && textDirty && (
          <p className="og-hint mk-warn">
            Saving a change to the text makes version {post.version + 1} and sends it back to
            review.
          </p>
        )}
        <Field label="Title">
          <TextInput value={title} onChange={setTitle} />
        </Field>
        <Field
          label="Text"
          hint={
            limit
              ? `${body.length} of ${limit.toLocaleString()} characters`
              : `${body.length} characters`
          }
        >
          <TextArea value={body} onChange={setBody} rows={10} />
        </Field>
        {limit && body.length > limit && (
          <p className="org-error">Longer than {CHANNEL_LABEL[channel]} allows.</p>
        )}
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
                .filter((c) => !c.archivedAt || c.id === post.campaignId)
                .map((c) => ({ value: c.id, label: c.name }))}
              empty="No campaign"
            />
          </Field>
          <Field label="Image">
            <Select
              value={assetId}
              onChange={setAssetId}
              options={m.assets
                .filter((a) => !assetLapsed(a) || a.id === post.assetId)
                .map((a) => ({
                  value: a.id,
                  label: `${a.name} · ${ASSET_KIND_LABEL[a.kind]}${a.status === "awaiting_approval" ? " (awaiting approval)" : ""}`,
                }))}
              empty="No image"
            />
          </Field>
        </FieldRow>
        {asset && <AssetPreview path={asset.storagePath} mime={asset.mimeType} />}
      </Panel>

      {overriding && (
        <ReasonDialog
          title={`Override: ${overriding.title}`}
          blurb={`${overriding.reason} Your reason is kept with version ${post.version}; a new version needs a new override.`}
          submitLabel="Override"
          busy={write.busy}
          error={write.error}
          onClose={() => setOverriding(null)}
          onSubmit={async (reason) => {
            const ok = await write.run(() =>
              insertMarketing(m, "mkt_overrides", {
                content_id: post.id,
                check_key: overriding.checkKey,
                version: post.version,
                reason,
              }),
            );
            if (ok) setOverriding(null);
          }}
        />
      )}
      {asking && (
        <ReasonDialog
          title={asking === "legal_review" ? "Legal changes" : "Ask for changes"}
          blurb="Say what needs to change. The author sees this beside the post."
          submitLabel="Send back"
          busy={write.busy}
          error={write.error}
          onClose={() => setAsking(null)}
          onSubmit={async (note) => {
            if (await decide(asking, "changes_requested", note)) setAsking(null);
          }}
        />
      )}
      {confirmDialog}
    </OrgPage>
  );
}

function Metrics({ post, write }: { post: Post; write: ReturnType<typeof useMarketingWrite> }) {
  const [views, setViews] = useState(String(post.metrics.views ?? ""));
  const [reactions, setReactions] = useState(String(post.metrics.reactions ?? ""));
  const [comments, setComments] = useState(String(post.metrics.comments ?? ""));
  const [note, setNote] = useState(post.metrics.note ?? "");
  const num = (v: string) =>
    v.trim() === "" ? undefined : Math.max(0, Math.round(Number(v)) || 0);
  return (
    <div className="mk-next">
      <Facts
        rows={[
          ["Published", post.publishedAt ? new Date(post.publishedAt).toLocaleString() : ""],
          ["Version", `v${post.version}`],
        ]}
      />
      <Eyebrow>How it did</Eyebrow>
      <FieldRow>
        <Field label="Views">
          <TextInput type="number" value={views} onChange={setViews} />
        </Field>
        <Field label="Reactions">
          <TextInput type="number" value={reactions} onChange={setReactions} />
        </Field>
        <Field label="Comments">
          <TextInput type="number" value={comments} onChange={setComments} />
        </Field>
      </FieldRow>
      <Field label="Note">
        <TextInput value={note} onChange={setNote} placeholder="e.g. Two enquiries from Accra" />
      </Field>
      <div className="org-actions" style={{ justifyContent: "flex-start" }}>
        <Button
          onClick={() =>
            void write.run(() =>
              updateMarketing("mkt_content", post.id, {
                metrics: {
                  ...(num(views) !== undefined ? { views: num(views) } : {}),
                  ...(num(reactions) !== undefined ? { reactions: num(reactions) } : {}),
                  ...(num(comments) !== undefined ? { comments: num(comments) } : {}),
                  ...(note.trim() ? { note: note.trim() } : {}),
                },
              }),
            )
          }
        >
          Save results
        </Button>
      </div>
    </div>
  );
}

export function AssetPreview({ path, mime }: { path: string | null; mime: string | null }) {
  const url = useQuery({
    queryKey: ["marketing-asset-url", path],
    enabled: !!path && !!mime?.startsWith("image/"),
    staleTime: 8 * 60_000,
    queryFn: () => assetUrl(path!),
  });
  if (!url.data) return null;
  return <img className="mk-preview" src={url.data} alt="" />;
}

function ReasonDialog({
  title,
  blurb,
  submitLabel,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  blurb: string;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);
  return (
    <OrgDialog
      open
      title={title}
      blurb={blurb}
      onClose={onClose}
      busy={busy}
      error={missing ? "Give a reason." : error}
      submitLabel={submitLabel}
      onSubmit={() => {
        if (!reason.trim()) return setMissing(true);
        return onSubmit(reason.trim());
      }}
    >
      <Field label="Reason">
        <TextArea value={reason} onChange={setReason} rows={3} />
      </Field>
    </OrgDialog>
  );
}
