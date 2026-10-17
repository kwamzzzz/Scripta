/**
 * A client's marketing: its brand kit and assets, the consents it holds, and
 * the campaigns and posts that go out in its name.
 *
 * It is private to the client's owner — the person who created the client —
 * and the people they let in, as contributors (draft, upload, ask for review)
 * or approvers (brief campaigns, approve, override a check, schedule, publish).
 * The database enforces all of it; the helpers here only decide what the
 * screen offers, so a button is never shown that the database would refuse.
 */

export type MarketingLevel = "owner" | "approver" | "contributor";

export const LEVEL_LABEL: Record<MarketingLevel, string> = {
  owner: "Owner",
  approver: "Approver",
  contributor: "Contributor",
};

export type MarketingView =
  "content" | "campaigns" | "brand" | "assets" | "consents" | "access" | "history";

export const MARKETING_VIEWS: { id: MarketingView; label: string }[] = [
  { id: "content", label: "Content" },
  { id: "campaigns", label: "Campaigns" },
  { id: "brand", label: "Brand kit" },
  { id: "assets", label: "Assets" },
  { id: "consents", label: "Consents" },
  { id: "access", label: "Access" },
  { id: "history", label: "History" },
];

export const isMarketingView = (v: unknown): v is MarketingView =>
  MARKETING_VIEWS.some((x) => x.id === v);

export type Stage = "idea" | "drafting" | "review" | "scheduled" | "published";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "drafting", label: "Drafting" },
  { id: "review", label: "In review" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
];

export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label])) as Record<
  Stage,
  string
>;

export type Channel =
  "linkedin" | "newsletter" | "one_pager" | "website" | "event" | "press" | "other";

export const CHANNEL_LABEL: Record<Channel, string> = {
  linkedin: "LinkedIn",
  newsletter: "Newsletter",
  one_pager: "One-pager",
  website: "Website",
  event: "Event",
  press: "Press",
  other: "Other",
};

export type AssetKind =
  | "logo_primary"
  | "logo_reversed"
  | "logo_mark"
  | "favicon"
  | "letterhead"
  | "email_signature"
  | "template"
  | "photography"
  | "document"
  | "other";

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  logo_primary: "Primary logo",
  logo_reversed: "Reversed logo",
  logo_mark: "Logo mark",
  favicon: "Favicon",
  letterhead: "Letterhead",
  email_signature: "Email signature",
  template: "Template",
  photography: "Photography",
  document: "Document",
  other: "Other",
};

export type BrandKit = {
  id: string;
  palette: { name: string; hex: string }[];
  headingFont: string;
  bodyFont: string;
  tone: string;
  avoidWords: string[];
  rules: string;
  updatedAt: string;
};

export type Asset = {
  id: string;
  kind: AssetKind;
  name: string;
  storagePath: string | null;
  mimeType: string | null;
  byteSize: number | null;
  rules: string;
  status: "awaiting_approval" | "approved" | "retired";
  approvedAt: string | null;
  expiresOn: string | null;
  createdAt: string;
};

export type Consent = {
  id: string;
  party: string;
  status: "requested" | "granted" | "refused";
  note: string;
  updatedAt: string;
};

export type Campaign = {
  id: string;
  name: string;
  goal: string;
  audience: string;
  message: string;
  channels: Channel[];
  measure: string;
  entityId: string | null;
  startsOn: string | null;
  endsOn: string | null;
  status: "active" | "closed";
  archivedAt: string | null;
  createdAt: string;
};

export type Metrics = { views?: number; reactions?: number; comments?: number; note?: string };

export type Post = {
  id: string;
  campaignId: string | null;
  channel: Channel;
  title: string;
  body: string;
  assetId: string | null;
  stage: Stage;
  scheduledAt: string | null;
  publishedAt: string | null;
  metrics: Metrics;
  version: number;
  createdBy: string | null;
  updatedAt: string;
  archivedAt: string | null;
};

export type ApprovalKind = "legal_review" | "director_approval";

export const APPROVAL_LABEL: Record<ApprovalKind, string> = {
  legal_review: "Legal review",
  director_approval: "Approval",
};

export type Approval = {
  id: string;
  contentId: string;
  kind: ApprovalKind;
  version: number;
  status: "requested" | "approved" | "changes_requested";
  note: string;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type Override = {
  id: string;
  contentId: string;
  checkKey: string;
  version: number;
  reason: string;
  actorId: string | null;
  createdAt: string;
};

export type Check = {
  checkKey: string;
  level: "pass" | "warn" | "block";
  title: string;
  reason: string;
};

export type AccessGrant = {
  id: string;
  userId: string;
  level: "contributor" | "approver";
  grantedBy: string | null;
  createdAt: string;
};

export type HistoryRow = { id: string; summary: string; actor: string; at: string };

export type Marketing = {
  workspaceId: string;
  clientId: string;
  /** Who created the client: the owner of its marketing. Null for older clients. */
  ownerId: string | null;
  meId: string | null;
  kit: BrandKit | null;
  campaigns: Campaign[];
  posts: Post[];
  assets: Asset[];
  consents: Consent[];
  approvals: Approval[];
  overrides: Override[];
  access: AccessGrant[];
};

/* ------------------------------------------------------------ permissions */

export type MarketingAction =
  | "brief" // campaigns
  | "kit"
  | "consents"
  | "approve"
  | "override"
  | "schedule"
  | "delete"
  | "grant";

/** Mirrors the policies: approvers do everything but grant access; contributors none of these. */
export const can = (level: MarketingLevel | null, action: MarketingAction): boolean =>
  level === "owner" || (level === "approver" && action !== "grant");

/* ---------------------------------------------------------------- a post */

export type Readiness = {
  /** An approval of the current version. */
  approved: boolean;
  /** An approval of the current version still waiting for a decision. */
  awaiting: Approval | null;
  /** Changes asked for on the current version. */
  changesAsked: Approval | null;
  /** Blocking checks not overridden for this version. */
  blocking: Check[];
  /** Whether an approver could schedule or publish it now. */
  clear: boolean;
};

export function readiness(
  post: Pick<Post, "id" | "version">,
  checks: Check[],
  approvals: Approval[],
  overrides: Override[],
): Readiness {
  const mine = approvals.filter(
    (a) => a.contentId === post.id && a.version === post.version && a.kind === "director_approval",
  );
  const approved = mine.some((a) => a.status === "approved");
  const overridden = new Set(
    overrides
      .filter((o) => o.contentId === post.id && o.version === post.version)
      .map((o) => o.checkKey),
  );
  const blocking = checks.filter((c) => c.level === "block" && !overridden.has(c.checkKey));
  return {
    approved,
    awaiting: mine.find((a) => a.status === "requested") ?? null,
    changesAsked: approved ? null : (mine.find((a) => a.status === "changes_requested") ?? null),
    blocking,
    clear: approved && blocking.length === 0,
  };
}

export const isOverridden = (
  post: Pick<Post, "id" | "version">,
  checkKey: string,
  overrides: Override[],
) =>
  overrides.find(
    (o) => o.contentId === post.id && o.version === post.version && o.checkKey === checkKey,
  ) ?? null;

/** The day a post sits on in the schedule: when it went out, or when it will. */
export const postDay = (post: Pick<Post, "scheduledAt" | "publishedAt" | "stage">) => {
  const at = post.stage === "published" ? (post.publishedAt ?? post.scheduledAt) : post.scheduledAt;
  return at ? localDate(at) : null;
};

/** YYYY-MM-DD in the viewer's own timezone. */
export const localDate = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** For a datetime-local input. */
export const localDateTime = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${localDate(iso)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** The weeks of a month, Monday first; days outside the month are null. */
export function monthWeeks(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const monthName = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

export const assetLapsed = (
  a: Pick<Asset, "status" | "expiresOn">,
  today = localDate(new Date().toISOString()),
) => a.status === "retired" || (!!a.expiresOn && a.expiresOn < today);

/** Avoid words typed as a list: commas or new lines, trimmed, no repeats. */
export const parseWords = (text: string) => [
  ...new Set(
    text
      .split(/[,\n]/)
      .map((w) => w.trim())
      .filter(Boolean),
  ),
];

export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v.trim());

/** The sentences a person can actually cause, in words. */
export function explainMarketingError(message: string): string {
  if (/row-level security/.test(message))
    return "Your access to this client's marketing does not allow that. An approver or the client's owner can.";
  if (/mkt_content_scheduled_needs_time/.test(message)) return "Choose when it goes out first.";
  if (/client_marketing_access_unique/.test(message)) return "That person already has access.";
  if (/mkt_overrides_unique/.test(message))
    return "That check is already overridden for this version.";
  if (/mkt_brand_kits_one_per_client/.test(message)) return "This client already has a brand kit.";
  return message;
}
