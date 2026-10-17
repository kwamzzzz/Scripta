/**
 * The admin portal: control over the platform, in tabs.
 *
 *   Overview       the headline numbers and what needs attention
 *   Features       every part of Scripta: on, coming soon or hidden; early access
 *   Feedback       what people have said, triaged
 *   People         everyone, their firms, when last active; administrators
 *   AI usage       spend and calls across the platform
 *   Announcements  banners to everyone, and maintenance mode
 *   Activity log   what administrators have changed, and who
 *
 * The tab is in the address (?tab=), so a link can open the right one.
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import AppShell, { Crumbs } from "@/components/AppShell";
import { SectionPanel } from "@/components/SectionPanel";
import { useIsPlatformAdmin } from "@/lib/platform-admin";
import { loadOverview } from "@/lib/admin-data";
import OverviewTab from "./admin/OverviewTab";
import FeaturesTab from "./admin/FeaturesTab";
import FeedbackTab from "./admin/FeedbackTab";
import PeopleTab from "./admin/PeopleTab";
import UsageTab from "./admin/UsageTab";
import AnnouncementsTab from "./admin/AnnouncementsTab";
import ActivityTab from "./admin/ActivityTab";
import "./administration.css";
import "./admin/admin.css";

export const ADMIN_TABS = [
  { id: "overview", label: "Overview" },
  { id: "features", label: "Features" },
  { id: "feedback", label: "Feedback" },
  { id: "people", label: "People" },
  { id: "usage", label: "AI usage" },
  { id: "announcements", label: "Announcements" },
  { id: "activity", label: "Activity log" },
] as const;
export type AdminTab = (typeof ADMIN_TABS)[number]["id"];

export default function AdminScreen() {
  const { isAdmin, loading } = useIsPlatformAdmin();
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const tab: AdminTab = ADMIN_TABS.some((t) => t.id === search.tab)
    ? (search.tab as AdminTab)
    : "overview";
  const go = (next: AdminTab) =>
    void navigate({ to: "/admin", search: { tab: next } as never, replace: true });
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    enabled: isAdmin,
    queryFn: loadOverview,
  });
  const unread = overview.data?.feedbackUnread ?? 0;

  const body = () => {
    if (loading) return <p className="adm-muted">Checking your access…</p>;
    if (!isAdmin)
      return (
        <p className="adm-muted">
          This portal is for Scripta administrators. Ask an administrator to grant you access.
        </p>
      );
    return (
      <>
        {tab === "overview" && <OverviewTab overview={overview} go={go} />}
        {tab === "features" && <FeaturesTab />}
        {tab === "feedback" && <FeedbackTab />}
        {tab === "people" && <PeopleTab />}
        {tab === "usage" && <UsageTab />}
        {tab === "announcements" && <AnnouncementsTab />}
        {tab === "activity" && <ActivityTab />}
      </>
    );
  };

  return (
    <AppShell
      section="admin"
      panel={
        isAdmin ? (
          <SectionPanel
            title="Admin portal"
            meta="Administrators"
            groups={[
              {
                heading: "The workspace",
                items: [
                  { id: "overview", label: "Overview" },
                  { id: "people", label: "People" },
                  { id: "features", label: "Features" },
                ],
              },
              {
                heading: "What is coming in",
                items: [
                  { id: "feedback", label: "Feedback", count: unread > 0 ? unread : undefined },
                  { id: "usage", label: "AI usage" },
                ],
              },
              {
                heading: "What goes out, and what happened",
                items: [
                  { id: "announcements", label: "Announcements" },
                  { id: "activity", label: "Activity log" },
                ],
              },
            ]}
            activeId={tab}
            onSelect={(id) => go(id as AdminTab)}
          />
        ) : undefined
      }
      breadcrumb={
        <Crumbs
          items={[
            { label: "Admin portal", to: "/admin" },
            { label: ADMIN_TABS.find((t) => t.id === tab)!.label },
          ]}
        />
      }
      scroll
    >
      <div className="scripta-page admin-page" style={{ maxWidth: "none" }}>
        <header className="scripta-page-heading">
          <div>
            <h1 className="scripta-page-title">Admin portal</h1>
            <p className="scripta-page-description">
              Control over Scripta: what is available to whom, what people are saying, what AI
              costs, and what administrators have changed.
            </p>
          </div>
        </header>
        <div className="adm">{body()}</div>
      </div>
    </AppShell>
  );
}
