/**
 * The career portal.
 *
 * A different room from the rest of Scripta. Everywhere else the app is about
 * the firm's work — the matter, the document, the deadline. This is about the
 * person doing it, and it is theirs alone: nobody else in the workspace can
 * read a row of it. That difference is why it is a portal with its own
 * surface rather than another workflow screen with a list and a detail panel.
 *
 * It answers four questions, and the views are those questions:
 *   Overview       what does this role expect of me, and where do I stand
 *   Requirements   every criterion, and what evidence it rests on
 *   Evidence       what I can actually prove I have done
 *   Strengths      what is carried, with repetition behind it
 *   Development    what is partly there
 *   Gaps           what has nothing against it
 *   Next           the experience worth seeking, requirement by requirement
 *   Roles          the job descriptions and frameworks themselves
 *
 * The role being read is in the address, so a lawyer can keep one open.
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import AppShell, { Crumbs } from "@/components/AppShell";
import { SectionPanel } from "@/components/SectionPanel";
import { useApp } from "@/store/app";
import { useCareer, useCareerActions, EMPTY_RECORD } from "@/lib/career/data";
import { useProfile, useProfileActions, EMPTY_PROFILE_RECORD } from "@/lib/career/profile";
import { readRole, type Evidence } from "@/lib/career/model";
import RolesView from "./career/RolesView";
import OverviewView from "./career/OverviewView";
import RequirementsView from "./career/RequirementsView";
import EvidenceView from "./career/EvidenceView";
import StandingView from "./career/StandingView";
import NextView from "./career/NextView";
import ProfileView from "./career/ProfileView";
import NetworkView from "./career/NetworkView";
import "./career/career.css";

export const CAREER_TABS = [
  { id: "profile", label: "Profile" },
  { id: "network", label: "Network" },
  { id: "overview", label: "Overview" },
  { id: "requirements", label: "Requirements" },
  { id: "evidence", label: "Evidence" },
  { id: "strengths", label: "Strengths" },
  { id: "development", label: "Development" },
  { id: "gaps", label: "Gaps" },
  { id: "next", label: "Next experience" },
  { id: "roles", label: "Roles" },
] as const;

export type CareerTab = (typeof CAREER_TABS)[number]["id"];

const CAREER_GROUPS: { heading: string; ids: CareerTab[] }[] = [
  { heading: "You", ids: ["profile", "network"] },
  { heading: "Against the role", ids: ["overview", "requirements", "evidence"] },
  { heading: "Where you stand", ids: ["strengths", "development", "gaps", "next"] },
  { heading: "The roles", ids: ["roles"] },
];

export default function CareerScreen() {
  const { workspaceId } = useApp();
  const search = useSearch({ strict: false }) as { tab?: string; role?: string };
  const navigate = useNavigate();
  const record = useCareer(workspaceId);
  const actions = useCareerActions(workspaceId);
  const data = record.data ?? EMPTY_RECORD;
  /* The profile and the register are the lawyer's own record rather than a
     reading of a role, so they load and write on their own key. */
  const profile = useProfile(workspaceId);
  const profileActions = useProfileActions(workspaceId);
  const profileData = profile.data ?? EMPTY_PROFILE_RECORD;
  const [problem, setProblem] = useState<string | null>(null);

  const tab: CareerTab = CAREER_TABS.some((t) => t.id === search.tab)
    ? (search.tab as CareerTab)
    : "overview";

  const roles = data.roles.filter((r) => !r.archivedAt);
  const role = roles.find((r) => r.id === search.role) ?? roles[0] ?? null;

  const go = (next: CareerTab, roleId?: string) =>
    void navigate({
      to: "/career",
      search: { tab: next, role: roleId ?? role?.id } as never,
      replace: true,
    });

  /* The reading, done once for the role in view. Evidence is looked up through
     the claims, so the same piece carries every requirement it was claimed
     against — here and in every other role. */
  const reading = useMemo(() => {
    if (!role) return null;
    const criteria = data.criteria
      .filter((c) => c.roleId === role.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const byId = new Map<string, Evidence>(data.evidence.map((e) => [e.id, e]));
    const claimed = new Map<string, Evidence[]>();
    for (const c of criteria)
      claimed.set(
        c.id,
        data.claims
          .filter((x) => x.criterionId === c.id)
          .map((x) => byId.get(x.evidenceId))
          .filter((e): e is Evidence => !!e),
      );
    return { criteria, claimed, ...readRole(criteria, claimed) };
  }, [role, data]);

  const shared = {
    record: data,
    role,
    reading,
    actions,
    go,
    onProblem: setProblem,
  };

  const mine = { record: profileData, actions: profileActions, onProblem: setProblem };

  const body = () => {
    /* The profile and the register stand on their own: they are not about a
       role, so they are drawn whether or not one has been added. */
    if (tab === "profile")
      return profile.isLoading ? (
        <p className="cr-muted">Reading your profile…</p>
      ) : (
        <ProfileView {...mine} />
      );
    if (tab === "network")
      return profile.isLoading ? (
        <p className="cr-muted">Reading your register…</p>
      ) : (
        <NetworkView {...mine} />
      );
    if (record.isLoading) return <p className="cr-muted">Reading your record…</p>;
    if (record.isError) return <p className="cr-error">{(record.error as Error).message}</p>;
    if (!roles.length && tab !== "roles")
      return (
        <div className="cr-empty">
          <h2>Nothing to measure yourself against yet.</h2>
          <p>
            Add the job description, role profile or competency framework you are working towards.
            Scripta keeps the original, and you break it into the requirements you can evidence one
            at a time.
          </p>
          <button type="button" className="cr-primary" onClick={() => go("roles")}>
            Add a role
          </button>
        </div>
      );
    switch (tab) {
      case "roles":
        return <RolesView {...shared} />;
      case "overview":
        return <OverviewView {...shared} />;
      case "requirements":
        return <RequirementsView {...shared} />;
      case "evidence":
        return <EvidenceView {...shared} />;
      case "strengths":
        return <StandingView {...shared} which="strengths" />;
      case "development":
        return <StandingView {...shared} which="development" />;
      case "gaps":
        return <StandingView {...shared} which="gaps" />;
      case "next":
        return <NextView {...shared} />;
    }
  };

  return (
    <AppShell
      section="career"
      breadcrumb={
        <Crumbs
          items={[
            { label: "Career", to: "/career" },
            { label: CAREER_TABS.find((t) => t.id === tab)!.label },
          ]}
        />
      }
      scroll
      panel={
        <SectionPanel
          title="Career progression"
          meta={role ? role.title : "No role yet"}
          groups={CAREER_GROUPS.map((group) => ({
            heading: group.heading,
            items: group.ids.flatMap((id) => {
              const entry = CAREER_TABS.find((t) => t.id === id);
              return entry ? [{ id: entry.id, label: entry.label }] : [];
            }),
          }))}
          activeId={tab}
          onSelect={(id) => go(id as CareerTab)}
          foot="Private to you"
        />
      }
    >
      {/* The page padding every other screen has; the portal's own column
          sits inside it. */}
      <div className="scripta-page cr-page">
        <div className="cr">
          <header className="cr-head">
            <div>
              <h1>Career progression</h1>
              <p>
                What a role expects of you, what you can prove you have done, and the experience
                worth seeking next. Private to you — nobody else in this workspace can read it.
              </p>
            </div>
            {roles.length > 1 && (
              <label className="cr-role-pick">
                <span>Role</span>
                <select
                  value={role?.id ?? ""}
                  onChange={(e) => go(tab, e.target.value)}
                  aria-label="Role being read"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                      {r.organisation ? ` · ${r.organisation}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </header>

          {problem && (
            <p className="cr-error" role="alert">
              {problem}
            </p>
          )}
          {body()}
        </div>
      </div>
    </AppShell>
  );
}
