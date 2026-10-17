/**
 * A client's marketing: the section list, and the section on screen.
 *
 * Headed with the client's name and who can see it, because the first thing
 * anyone needs to know about this part of a client is that it is private.
 */
import { lazy, Suspense, type ComponentType } from "react";
import type { Client } from "@/lib/clients";
import { Empty } from "@/organisation/ui";
import {
  LEVEL_LABEL,
  MARKETING_VIEWS,
  can,
  readiness,
  type MarketingLevel,
  type MarketingView,
} from "./model";
import { useMarketing, type MarketingGo, type SectionProps } from "./ui";
import "@/organisation/organisation.css";
import "./marketing.css";

const SECTIONS: Record<MarketingView, ComponentType<SectionProps>> = {
  content: lazy(() => import("./sections/Content")),
  campaigns: lazy(() => import("./sections/Campaigns")),
  brand: lazy(() => import("./sections/BrandKit")),
  assets: lazy(() => import("./sections/Assets")),
  consents: lazy(() => import("./sections/Consents")),
  access: lazy(() => import("./sections/Access")),
  history: lazy(() => import("./sections/History")),
};

const PostEditor = lazy(() => import("./sections/PostEditor"));

export default function MarketingArea({
  client,
  level,
  view,
  item,
  go,
}: {
  client: Client;
  level: MarketingLevel;
  view: MarketingView;
  item: string | null;
  go: MarketingGo;
}) {
  const marketing = useMarketing(client.workspaceId, client.id, true);
  const m = marketing.data;
  if (!m)
    return (
      <p
        className="cl-quiet"
        role={marketing.isError ? "alert" : "status"}
        style={{ padding: "0 32px" }}
      >
        {marketing.isError ? (marketing.error as Error).message : "Loading…"}
      </p>
    );

  const inReview = m.posts.filter((p) => !p.archivedAt && p.stage === "review");
  const waiting = can(level, "approve")
    ? inReview.filter((p) => !readiness(p, [], m.approvals, m.overrides).approved).length
    : 0;
  const pending = m.assets.filter((a) => a.status === "awaiting_approval").length;
  const counts: Partial<Record<MarketingView, { n: number; title?: string }>> = {
    ...(m.posts.filter((p) => !p.archivedAt).length
      ? {
          content: waiting
            ? { n: waiting, title: `${waiting} waiting for approval` }
            : { n: m.posts.filter((p) => !p.archivedAt).length },
        }
      : {}),
    ...(m.campaigns.filter((c) => !c.archivedAt).length
      ? { campaigns: { n: m.campaigns.filter((c) => !c.archivedAt).length } }
      : {}),
    ...(m.assets.length
      ? {
          assets:
            pending && can(level, "approve")
              ? { n: pending, title: `${pending} awaiting approval` }
              : { n: m.assets.length },
        }
      : {}),
    ...(m.consents.length ? { consents: { n: m.consents.length } } : {}),
    access: { n: m.access.length + 1, title: `${m.access.length + 1} can see this` },
  };

  const post = item ? m.posts.find((p) => p.id === item) : null;
  const Section = post ? PostEditor : SECTIONS[view];
  const people = m.access.length + 1;

  return (
    <div className="og-area">
      <nav className="og-nav" aria-label={`${client.name} marketing`}>
        <div className="og-nav-head">{client.name} · Marketing</div>
        <div className="og-nav-list">
          {MARKETING_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-current={v.id === view && !post ? "page" : undefined}
              onClick={() => go({ view: v.id, item: null })}
            >
              <span>{v.label}</span>
              {counts[v.id] && (
                <span className="og-nav-count" title={counts[v.id]!.title}>
                  {counts[v.id]!.n}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="og-nav-foot mk-private">
          <strong>Private</strong>
          <span>
            {people === 1
              ? "Only the client's owner can see this."
              : `${people} people can see this.`}{" "}
            You are {level === "owner" ? "the owner" : `${LEVEL_LABEL[level].toLowerCase()}`}.
          </span>
        </div>
      </nav>
      <Suspense fallback={<Empty title="Loading…" />}>
        {item && !post ? (
          <div className="og-page-body">
            <Empty title="That post is not here" body="It may have been deleted." />
          </div>
        ) : (
          <Section m={m} client={client} level={level} item={item} go={go} />
        )}
      </Suspense>
    </div>
  );
}
