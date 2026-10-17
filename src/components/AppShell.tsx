import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Briefcase,
  Building2,
  CheckSquare,
  FilePenLine,
  FileSearch,
  FileStack,
  FolderOpen,
  BookOpenText,
  LayoutDashboard,
  Library,
  BookMarked,
  ListChecks,
  MessageSquare,
  Mic,
  Search,
  Archive,
  Settings,
  Trash2,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ShieldCheck,
  UserRound,
  GraduationCap,
  TrendingUp,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { C, scriptaTheme } from "@/lib/tokens";
import { usageThisMonth } from "@/lib/usage.functions";
import { useAuth } from "@/lib/auth";
import { useApp } from "@/store/app";
import { QuickTask, useQuickTask } from "@/components/QuickTask";
import { usePersisted } from "@/lib/use-board";
import WorkspaceSwitcher from "@/components/WorkspaceSwitcher";
import CommandPalette from "@/components/CommandPalette";
import AssistantPanel from "@/components/AssistantPanel";
import GeminiUsage from "@/components/GeminiUsage";
import AwarenessBell from "@/components/AwarenessBell";
import MatterPresence from "@/components/MatterPresence";
import ScriptaLogo from "@/components/ScriptaLogo";
import FeedbackChip from "@/components/FeedbackChip";
import ResizableSplitPane from "@/components/ResizableSplitPane";
import { useFeatureAccess } from "@/lib/features";
import { ASSISTANT_INTRO, type AssistantScope } from "@/lib/assistant";
import { BackLink, useTrackLocation, type Trail } from "@/lib/nav";
import { useIsPlatformAdmin } from "@/lib/platform-admin";
import {
  NAV,
  NAV_FOOTER,
  SECTION_NAME,
  isNavParent,
  type AppNavEntry,
  type AppNavItem,
  type NavIconKey,
  type SectionKey,
} from "@/lib/app-navigation";

import "./wireframe.css";
import "./scripta-controls.css";
import WriteHealth from "./WriteHealth";
import FeedbackHighlighter from "./FeedbackHighlighter";
import { MaintenanceGate, PlatformBanners } from "./PlatformNotices";
import "./scripta-shell.css";
import "./scripta-workbench.css";

/**
 * The shell drawn in Legal Drafting Wireframes (4).html: a 52px icon rail
 * (206px expanded, three groups), a 48px topbar, an optional 46px tab row,
 * then the content row with the Scripta Dialogue on the right.
 */

export type { SectionKey } from "@/lib/app-navigation";

const NAV_ICON: Record<NavIconKey, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  clients: Briefcase,
  matters: FolderOpen,
  manuscripts: BookOpenText,
  "contract-drafting": FilePenLine,
  "contract-review": FileSearch,
  "legal-research": Search,
  "corporate-drafting": Building2,
  "matter-flow": ListChecks,
  transcripts: Mic,
  playbooks: BookOpen,
  knowledge: Library,
  library: BookMarked,
  learning: GraduationCap,
  career: TrendingUp,
  tasks: CheckSquare,
  templates: FileStack,
  archive: Archive,
  deleted: Trash2,
  settings: Settings,
  admin: ShieldCheck,
};

const SECTION_SCOPE: Record<SectionKey, Pick<AssistantScope, "label" | "intro" | "suggestions">> = {
  home: { label: "New chat", intro: ASSISTANT_INTRO },
  /* The assistant is told nothing about what is in here. The record is the
     lawyer's own, and an assistant that could read it would be a second way
     for it to leave the room. */
  /* The tutor is a scoped thing that lives inside a course, not the app-wide
     assistant; this one is told only that it is in the study area. */
  learning: {
    label: "Learning",
    intro: "Ask about the course you have open. Study with Scripta answers from its material.",
  },
  career: {
    label: "Career",
    intro: "Ask about the work in this workspace. Your career record is not read here.",
  },
  clients: {
    label: "Clients",
    intro: "Ask what is open for a client across the work you can see.",
  },
  manuscripts: {
    label: "Book Review",
    intro: "Ask about a manuscript's chapters, findings or style sheet.",
  },
  matters: {
    label: "Contract Review",
    intro: "Ask about any mandate, or open one to work inside it.",
  },
  "contract-drafting": {
    label: "Contract Drafting",
    intro: "This workspace is planned for creating and drafting contracts from scratch.",
  },
  "corporate-drafting": {
    label: "Corporate Drafting",
    intro: "This workspace is planned for board resolutions, letters and letterheads.",
  },
  "matter-flow": {
    label: "Flow",
    intro: "Ask which matter is behind, what is waiting on whom, or what closes a phase.",
  },
  review: { label: "Documents", intro: "Open a document to ask about its clauses." },
  transcripts: { label: "New chat", intro: ASSISTANT_INTRO },
  research: {
    label: "Drafting support — verify before reliance",
    intro:
      "Turn client instructions into legal issues, or list the facts still missing across your open matters.",
    suggestions: [
      "Draft issues from instructions",
      "List missing facts",
      "Generate a document request list",
    ],
  },
  playbooks: {
    label: "Playbooks",
    intro: "Ask me to draft a rule from a clause you've already negotiated.",
  },
  knowledge: {
    label: "Precedents",
    intro:
      "Ask which stored clause fits a position, or what a precedent's negotiation history shows.",
  },
  library: {
    label: "Library",
    intro:
      "Ask what the firm has on a point: statutes, cases, books and articles kept in the Library.",
  },
  tasks: { label: "Tasks", intro: "Ask what is waiting on you across your open matters." },
  templates: { label: "Templates", intro: "Ask which template fits the deliverable you owe." },
  archive: { label: "Archive", intro: ASSISTANT_INTRO },
  deleted: { label: "Recently Deleted", intro: ASSISTANT_INTRO },
  "contract-review": { label: "Contract Review", intro: ASSISTANT_INTRO },
  settings: { label: "Settings", intro: ASSISTANT_INTRO },
  admin: { label: "Admin portal", intro: ASSISTANT_INTRO },
};

/** The rounded topbar chips drawn on every wireframe screen. */
export function TopChip({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <div
      className="wf-top-chip"
      onClick={onClick}
      style={{
        border: "1px solid #d4d4d4",
        borderRadius: 14,
        padding: "5px 12px",
        color: "#5f5f5f",
        fontSize: 12,
        whiteSpace: "nowrap",
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      {children}
    </div>
  );
}

export function Crumb({ children }: { children: ReactNode }) {
  return <span style={{ color: "#6f6f6f" }}>{children}</span>;
}

export type CrumbItem = {
  label: ReactNode;
  /** Route to go back to; earlier crumbs are links, the last one is the page. */
  to?: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  onClick?: () => void;
};

/** The breadcrumb trail drawn in every topbar: section root, then the path into it. */
export function Crumbs({ items }: { items: CrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: 13 }}
    >
      {items.map((item, i) => {
        const last = i === items.length - 1;
        const style: CSSProperties = {
          color: last ? "#232323" : "#6f6f6f",
          textDecoration: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 360,
          fontWeight: last ? 500 : 400,
          // Where the trail is short of room, the places above give way first:
          // the page you are on is the one name worth reading in full.
          // (A factor below 1 would leave the overflow partly unshrunk.)
          flexShrink: last ? 1 : 10,
          // Enough for a one-word section ("Matters") to stay readable.
          minWidth: last ? 80 : 56,
        };
        return (
          <Fragment key={i}>
            {i > 0 && <span style={{ color: "#6b6b6b" }}>/</span>}
            {!last && item.to ? (
              <Link
                className="wf-crumb"
                style={style}
                // Crumb targets are built from strings; the route tree types are checked where they are declared.
                to={item.to as never}
                params={item.params as never}
                search={item.search as never}
              >
                {item.label}
              </Link>
            ) : !last && item.onClick ? (
              <button
                type="button"
                className="wf-crumb"
                onClick={item.onClick}
                style={{ ...style, background: "none", border: 0, padding: 0, font: "inherit" }}
              >
                {item.label}
              </button>
            ) : (
              <span style={style} aria-current={last ? "page" : undefined}>
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export default function AppShell({
  section,
  breadcrumb,
  topbar,
  back,
  trackLabel,
  actions,
  tabs,
  scroll = true,
  assistant,
  hideAssistant,
  hostTabs,
  panel,
  children,
}: {
  section: SectionKey;
  /** Left side of the topbar (breadcrumb). Ignored when `topbar` is given. */
  breadcrumb?: ReactNode | undefined;
  /** The full 48px topbar content, as drawn (breadcrumb, spacer, chips). */
  topbar?: ReactNode | undefined;
  /** Contextual back control; the fallback is used on refresh or a cold link. */
  back?: Trail | undefined;
  /** How this screen is named in another screen's back control. */
  trackLabel?: string | undefined;
  actions?: ReactNode | undefined;
  /** The 46px tab row content, as drawn. */
  tabs?: ReactNode | undefined;
  /**
   * The tabs of what this screen sits inside — a client's, when one of its
   * flows or matters is open in it — drawn as a row above this screen's own.
   */
  hostTabs?: ReactNode | undefined;
  scroll?: boolean | undefined;
  assistant?: Partial<AssistantScope> | undefined;
  /** Screens that draw their own right-hand panel (4f, 4g). */
  hideAssistant?: boolean | undefined;
  /**
   * A second navigation column belonging to this section, drawn between the
   * icon rail and the page — a course menu, a portal's own views. A section
   * that has one keeps the main rail compact, because two full-width columns
   * of navigation either side of the work is two too many.
   */
  panel?: ReactNode | undefined;
  children: ReactNode;
}) {
  const { profile, signOut } = useAuth();
  const { workspace, matter } = useApp();
  // Capture, from any screen. Mounted once here so nothing a lawyer remembers
  // mid-task depends on navigating somewhere first.
  const quickTask = useQuickTask();
  const path = useRouterState({ select: (state) => state.location.pathname });
  // The selected matter is sticky, so it is only this task's matter when the
  // screen is actually about it. Filing work to a matter the lawyer is not
  // looking at would be worse than not filing it at all.
  const onThisMatter = !!matter?.id && path.includes(matter.id);
  const { isAdmin } = useIsPlatformAdmin();
  // A switched-off feature stays fully usable for administrators (unless they
  // are viewing as a member), and for anyone given early access. Everyone else
  // sees it greyed out ("coming soon") or not at all, as the administrator chose.
  const access = useFeatureAccess();
  const offState = (key: SectionKey) => access.state(key);
  const available = (key: SectionKey) => offState(key) !== "hidden";
  const visible = (item: AppNavItem) => (!item.adminOnly || isAdmin) && available(item.key);
  const navGroups = NAV.map((group) => {
    const items = group.items.flatMap((entry): AppNavEntry[] => {
      if (!isNavParent(entry)) return visible(entry) ? [entry] : [];
      const children = entry.children.filter(visible);
      return children.length > 0 ? [{ ...entry, children }] : [];
    });
    return { ...group, items };
  }).filter((group) => group.items.length > 0);
  const footerItems = NAV_FOOTER.filter(visible);
  const state = access.raw(section);
  const sectionDim = offState(section) === "dim";
  const sectionHidden = offState(section) === "hidden";
  const assistantOn = access.state("assistant") === "on";
  const noAssistant = hideAssistant || !assistantOn;

  const [expanded, setExpanded] = usePersisted("px.navigation.expanded.v2", true);
  const [toolsOpen, setToolsOpen] = usePersisted("px.navigation.workflow-tools.open", true);
  const [assistantOpen, setAssistantOpen] = usePersisted("px.assistant.open", true);
  const [compactViewport, setCompactViewport] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileNavWasOpen = useRef(false);
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!compactViewport || !mobileNavOpen) {
      if (mobileNavWasOpen.current)
        sidebar?.querySelector<HTMLButtonElement>(".wf-sidebar-toggle")?.focus();
      mobileNavWasOpen.current = false;
      return;
    }
    mobileNavWasOpen.current = true;
    sidebar?.querySelector<HTMLButtonElement>(".wf-sidebar-toggle")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Let an open account/workspace menu consume Escape first.
        if (sidebar?.querySelector('[role="menu"], .wf-account-menu')) return;
        event.preventDefault();
        setMobileNavOpen(false);
      }
      if (event.key !== "Tab" || !sidebar) return;
      const controls = Array.from(
        sidebar.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex="0"]'),
      ).filter((element) => element.offsetParent !== null);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [compactViewport, mobileNavOpen]);
  /* A section with its own panel supplies the names; the rail only has to
     say which section you are in, so it stays as icons. */
  const showExpanded = compactViewport ? mobileNavOpen : expanded && !panel;
  const toggleNavigation = useCallback(() => {
    if (compactViewport) setMobileNavOpen((value) => !value);
    else setExpanded((value) => !value);
  }, [compactViewport, setExpanded]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => {
      setCompactViewport(query.matches);
      setMobileNavOpen(false);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  useTrackLocation(trackLabel ?? SECTION_NAME[section]);
  useEffect(() => {
    if (assistant?.composerRequest) setAssistantOpen(true);
  }, [assistant?.composerRequest, setAssistantOpen]);
  const scope: AssistantScope = {
    key: section,
    screen: SECTION_SCOPE[section].label,
    ...SECTION_SCOPE[section],
    ...assistant,
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target?.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleNavigation();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAssistantOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toggleNavigation, setAssistantOpen]);
  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAccountOpen(false);
      accountRef.current?.querySelector("button")?.focus();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [accountOpen]);
  const initials = (profile?.full_name || profile?.email || "P")
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const avatar = (
    <span
      className="wf-shell-avatar"
      title={profile?.full_name || profile?.email || "Scripta user"}
      style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        font: "500 9px 'Geist',sans-serif",
        flex: "none",
        padding: 0,
      }}
    >
      {initials}
    </span>
  );

  const sidebarToggle = (
    <button
      type="button"
      className="wf-sidebar-toggle"
      title={showExpanded ? "Collapse sidebar (⌘B)" : "Expand sidebar (⌘B)"}
      aria-label={showExpanded ? "Collapse sidebar" : "Expand sidebar"}
      onClick={toggleNavigation}
    >
      {showExpanded ? (
        <PanelLeftClose size={15} aria-hidden="true" />
      ) : (
        <PanelLeftOpen size={15} aria-hidden="true" />
      )}
    </button>
  );

  const compactNavItem = (item: AppNavItem) => {
    const Icon = NAV_ICON[item.icon];
    const memberDim = offState(item.key) === "dim";
    return (
      <Link
        key={item.key}
        to={item.to}
        className={`wf-railbox ${section === item.key ? "is-active" : ""}`}
        title={memberDim ? `${item.label} is coming soon` : item.label}
        aria-label={item.label}
        aria-current={section === item.key ? "page" : undefined}
        aria-disabled={memberDim || undefined}
        onClick={memberDim ? (event) => event.preventDefault() : () => setMobileNavOpen(false)}
        style={memberDim ? { opacity: 0.45, cursor: "default" } : undefined}
      >
        <Icon size={14} strokeWidth={1.5} />
      </Link>
    );
  };

  const expandedNavItem = (item: AppNavItem) => {
    const Icon = NAV_ICON[item.icon];
    // What this viewer gets (an administrator viewing as a member gets what
    // members get), and what everyone else gets, for an administrator's badge.
    const memberDim = offState(item.key) === "dim";
    const s = memberDim ? "on" : access.raw(item.key);
    return (
      <Link
        key={item.key}
        to={item.to}
        className={`wf-navrow ${section === item.key ? "is-active" : ""}`}
        aria-current={section === item.key ? "page" : undefined}
        aria-disabled={memberDim || undefined}
        onClick={memberDim ? (event) => event.preventDefault() : () => setMobileNavOpen(false)}
        title={
          memberDim
            ? `${item.label} is coming soon`
            : s !== "on"
              ? `${item.label} is ${s === "hidden" ? "hidden from" : "greyed out for"} everyone else`
              : undefined
        }
        style={memberDim ? { opacity: 0.45, cursor: "default", pointerEvents: "auto" } : undefined}
      >
        <span className="wf-navrow-icon">
          <Icon size={16} strokeWidth={1.6} />
        </span>
        <span>{item.label}</span>
        {/* An administrator needs to know a section is switched off, not to be
            told in capitals on every row. A member who will see it later still
            gets the word, because to them it is news. */}
        {memberDim ? (
          <span className="scripta-nav-flag is-soon">SOON</span>
        ) : isAdmin && s !== "on" ? (
          <span
            className={`scripta-nav-flag is-mark${s === "hidden" ? " is-hidden" : ""}`}
            title={
              s === "hidden"
                ? "Switched off and hidden from everyone else"
                : "Switched off and greyed out for everyone else"
            }
            aria-label={s === "hidden" ? "Hidden from members" : "Greyed out for members"}
          />
        ) : null}
      </Link>
    );
  };

  return (
    <div
      className={`wf-shell scripta-shell scripta-ui wf-section-${section} ${compactViewport && mobileNavOpen ? "is-mobile-nav-open" : ""}`}
      style={scriptaTheme}
    >
      {/* The backstop for a write the database refused, wherever it was made.
          In the shell rather than on a screen, because the screens that need
          it most are the ones that forgot to handle their own errors. */}
      <WriteHealth />
      {compactViewport && mobileNavOpen && (
        <button
          type="button"
          className="scripta-nav-backdrop"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      {showExpanded ? (
        <aside
          ref={sidebarRef}
          role={compactViewport ? "dialog" : undefined}
          aria-modal={compactViewport || undefined}
          className="wf-sidebar is-expanded"
          aria-label="Main navigation"
          style={{
            width: 240,
            flex: "none",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div className="wf-sidebar-identity">
            <div className="wf-sidebar-logo-row">
              <Link
                to="/"
                aria-label="Scripta home"
                className="wf-sidebar-logo-link"
                onClick={() => setMobileNavOpen(false)}
              >
                <ScriptaLogo />
              </Link>
              {sidebarToggle}
            </div>
          </div>
          <div style={{ padding: "0 8px 8px" }}>
            <WorkspaceSwitcher />
          </div>
          <div
            className="scripta-nav-groups"
            style={{
              flex: 1,
              padding: "6px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              overflowY: "auto",
            }}
          >
            {navGroups.map((g) => (
              <div key={g.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div
                  className="scripta-nav-group-label"
                  style={{
                    padding: "4px 8px",
                    font: "500 9px 'Geist',sans-serif",
                    color: "#6b6b6b",
                    letterSpacing: ".08em",
                  }}
                >
                  {g.label}
                </div>
                {g.items.map((entry) => {
                  if (isNavParent(entry)) {
                    const ParentIcon = NAV_ICON[entry.icon];
                    const parentActive = entry.children.some((item) => item.key === section);
                    return (
                      <div key={entry.id}>
                        <button
                          type="button"
                          className={`wf-navrow ${parentActive && !toolsOpen ? "is-active" : ""}`}
                          aria-expanded={toolsOpen}
                          aria-controls={`wf-navtree-${entry.id}`}
                          onClick={() => setToolsOpen((open) => !open)}
                          style={{ width: "100%" }}
                        >
                          <span className="wf-navrow-icon">
                            <ParentIcon size={16} strokeWidth={1.6} />
                          </span>
                          <span>{entry.label}</span>
                          <ChevronDown
                            size={12}
                            aria-hidden="true"
                            style={{
                              marginLeft: "auto",
                              transform: toolsOpen ? "rotate(0deg)" : "rotate(-90deg)",
                            }}
                          />
                        </button>
                        {toolsOpen && (
                          <div
                            id={`wf-navtree-${entry.id}`}
                            role="group"
                            aria-label={`${entry.label} sections`}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 3,
                              margin: "3px 0 1px 11px",
                              paddingLeft: 8,
                              borderLeft: `1px solid ${C.border}`,
                            }}
                          >
                            {entry.children.map(expandedNavItem)}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return expandedNavItem(entry);
                })}
              </div>
            ))}
          </div>
          {footerItems.length > 0 && (
            // Housekeeping and settings, apart from the places work happens.
            <nav className="scripta-nav-utility" aria-label="Housekeeping and settings">
              {footerItems.map(expandedNavItem)}
            </nav>
          )}
          <div className="scripta-sidebar-footer">
            <div className="wf-account" ref={accountRef}>
              <button
                type="button"
                className="wf-account-trigger"
                aria-label="Open account menu"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((open) => !open)}
              >
                {avatar}
                <span className="wf-account-copy">
                  <strong>{profile?.full_name || profile?.email || "Scripta user"}</strong>
                  <small>
                    {profile?.full_name ? (profile?.email ?? "") : (workspace?.name ?? "Workspace")}
                  </small>
                </span>
                <ChevronDown size={13} aria-hidden="true" />
              </button>
              {accountOpen && (
                <div className="wf-account-menu">
                  <Link
                    to="/settings"
                    onClick={() => {
                      setAccountOpen(false);
                      setMobileNavOpen(false);
                    }}
                  >
                    <UserRound size={13} aria-hidden="true" /> Account settings
                  </Link>
                  <button type="button" onClick={() => void signOut()}>
                    <LogOut size={13} aria-hidden="true" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>
      ) : (
        <aside
          ref={sidebarRef}
          className="wf-sidebar is-compact"
          aria-label="Main navigation"
          style={{
            width: 64,
            flex: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 13,
            padding: "12px 0",
            minHeight: 0,
            overflowY: "auto",
          }}
        >
          <Link to="/" aria-label="Scripta home" className="wf-sidebar-compact-logo">
            <ScriptaLogo compact />
          </Link>
          {sidebarToggle}
          <div style={{ width: 22, height: 1, background: "#dedede", margin: "2px 0" }} />
          {navGroups
            .flatMap((group) => group.items)
            .map((entry) => {
              if (!isNavParent(entry)) return compactNavItem(entry);
              const ParentIcon = NAV_ICON[entry.icon];
              const parentActive = entry.children.some((item) => item.key === section);
              return (
                <Fragment key={entry.id}>
                  <button
                    type="button"
                    className={`wf-railbox ${parentActive && !toolsOpen ? "is-active" : ""}`}
                    title={
                      toolsOpen ? `Collapse ${entry.label} menu` : `Expand ${entry.label} menu`
                    }
                    aria-label={
                      toolsOpen ? `Collapse ${entry.label} menu` : `Expand ${entry.label} menu`
                    }
                    aria-expanded={toolsOpen}
                    aria-controls={`wf-compact-navtree-${entry.id}`}
                    onClick={() => setToolsOpen((open) => !open)}
                    style={{ cursor: "pointer", padding: 0 }}
                  >
                    <ParentIcon size={14} strokeWidth={1.5} />
                  </button>
                  {toolsOpen && (
                    <div
                      id={`wf-compact-navtree-${entry.id}`}
                      role="group"
                      aria-label={`${entry.label} sections`}
                      style={{ display: "contents" }}
                    >
                      {entry.children.map(compactNavItem)}
                    </div>
                  )}
                </Fragment>
              );
            })}
          <div style={{ flex: 1 }} />
          {footerItems.map(compactNavItem)}
        </aside>
      )}
      {panel && !(compactViewport && mobileNavOpen) ? (
        <aside className="wf-panel" aria-label={`${SECTION_NAME[section]} navigation`}>
          {panel}
        </aside>
      ) : null}
      {/* Shows a reviewer what a piece of feedback pointed at, when they arrive from it. */}
      <FeedbackHighlighter />
      <main
        inert={compactViewport && mobileNavOpen ? true : undefined}
        className="wf-main"
        style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}
      >
        <header
          className="wf-topbar"
          style={{
            height: 48,
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 18px",
          }}
        >
          <div className="wf-topbar-content">
            {back && <BackLink fallback={back} />}
            {topbar ?? (
              <>
                {breadcrumb}
                <div style={{ flex: 1 }} />
                {actions}
                {access.state("feedback") === "on" && (
                  <FeedbackChip screen={scope.screen ?? SECTION_SCOPE[section].label} />
                )}
                <GeminiUsage />
              </>
            )}

            {/* ---------------------------------------------------------------
                OUTSIDE THE FALLBACK, DELIBERATELY
                ---------------------------------------------------------------

                These two were inside it, and both were wrong there.

                Four screens supply their own `topbar` — the matter workbench,
                matter flow, research, and the wireframe screens — so the bell
                simply vanished on them. Kwame asked for "a small bell in the
                GLOBAL header"; one that disappears on the matter screen is not
                global, and the matter screen is exactly where you would want to
                be told a colleague has just taken your clause.

                Presence was worse than hidden, it was dead. It renders only
                when `onThisMatter`, which can only be true on a matter screen —
                which is precisely the screen that overrides the topbar. It
                could never have appeared anywhere.

                Found in the Phase 5 browser acceptance, by looking for the bell
                on the matter screen and finding no bell. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              {/* Who is in the document, read from the lease rows. Not a
                  control: a colleague's whereabouts is something to know, not
                  somewhere to be sent from the top bar. */}
              <MatterPresence matterId={onThisMatter ? matter!.id : null} />
              {/* Things I should know happened. A dot, never a count. */}
              <AwarenessBell />
            </div>
          </div>
          <CommandPalette showTrigger />
          <QuickTask
            open={quickTask.open && access.state("quick-task") === "on"}
            matterId={onThisMatter ? matter!.id : null}
            matterName={onThisMatter ? matter!.name : ""}
            onClose={quickTask.close}
          />
        </header>
        <PlatformBanners isAdmin={isAdmin} />
        {hostTabs && (
          <div
            className="wf-tabrow wf-tabrow-host"
            role="tablist"
            aria-label="Sections of what this is in"
            style={{
              height: 42,
              flex: "none",
              display: "flex",
              alignItems: "center",
              gap: 24,
              padding: "0 18px",
              overflowX: "auto",
            }}
          >
            {hostTabs}
          </div>
        )}
        {tabs && (
          <div
            className="wf-tabrow"
            role="tablist"
            aria-label="Workspace sections"
            style={{
              height: 46,
              flex: "none",
              display: "flex",
              alignItems: "center",
              gap: 24,
              padding: "0 18px",
              overflowX: "auto",
            }}
          >
            {tabs}
          </div>
        )}
        <div className="wf-work">
        <ResizableSplitPane
          className="wf-body"
          storageKey="px.assistant.width"
          side="end"
          defaultSize={450}
          minSize={280}
          maxSize={720}
          minPrimarySize={480}
          compactAt={760}
          label="Resize Scripta assistant panel"
          open={assistantOpen && !noAssistant}
          keepSecondaryMounted
          showPanelActions={false}
          primary={
            <div
              className="wf-content"
              style={{
                overflowY: scroll ? "auto" : "hidden",
                position: "relative",
              }}
            >
              {sectionDim && (
                <div
                  style={{
                    padding: "9px 18px",
                    borderBottom: "1px solid #e2e2e2",
                    background: "#FBF5E6",
                    color: "#8A6D1F",
                    fontSize: 12.5,
                  }}
                >
                  {access.note(section) || "This area is being worked on and will open soon."}
                </div>
              )}
              {isAdmin && !access.asMember && state !== "on" && (
                <div
                  style={{
                    padding: "9px 18px",
                    borderBottom: "1px solid #e2e2e2",
                    background: "#FBF5E6",
                    color: "#8A6D1F",
                    fontSize: 12.5,
                  }}
                >
                  Switched off for everyone else — they see it{" "}
                  {state === "hidden" ? "not at all" : "greyed out as coming soon"}. You still have
                  full access.
                </div>
              )}
              <MaintenanceGate isAdmin={isAdmin}>
                {sectionHidden ? (
                  <div style={{ padding: 40, fontSize: 13.5, color: "#8A857D" }}>
                    This page isn’t available.
                  </div>
                ) : sectionDim ? (
                  // Greyed and inert, while the note above it stays readable.
                  <div
                    style={{
                      filter: "grayscale(1)",
                      opacity: 0.55,
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                      minHeight: 0,
                      minWidth: 0,
                    }}
                    inert={true}
                    aria-disabled
                  >
                    {children}
                  </div>
                ) : (
                  children
                )}
              </MaintenanceGate>
            </div>
          }

          secondary={<AssistantPanel scope={scope} onClose={() => setAssistantOpen(false)} />}
        />
        {/* Closed, the assistant keeps a rail: it is always one click away and
            never disappears from the frame. */}
        {!assistantOpen && !noAssistant && (
          <aside className="wf-assistant-rail" aria-label="Scripta assistant">
            <button
              type="button"
              className="wf-assistant-rail-open"
              title="Show assistant (⌘J)"
              aria-label="Show assistant"
              onClick={() => setAssistantOpen(true)}
            >
              <MessageSquare size={16} />
            </button>
          </aside>
        )}
        </div>
      </main>
    </div>
  );
}

/** Wireframe button: outline by default, terracotta outline for `accent`, filled for `solid`. */
