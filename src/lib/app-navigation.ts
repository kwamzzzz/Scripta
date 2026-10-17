export const SECTION_KEYS = [
  "home",
  "clients",
  "matters",
  "manuscripts",
  "contract-review",
  "contract-drafting",
  "corporate-drafting",
  "matter-flow",
  "review",
  "transcripts",
  "research",
  "playbooks",
  "knowledge",
  "library",
  "learning",
  "career",
  "tasks",
  "templates",
  "archive",
  "deleted",
  "settings",
  "admin",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/** A place name suitable for `Back to …`, not the assistant's label. */
export const SECTION_NAME: Record<SectionKey, string> = {
  home: "Dashboard",
  clients: "Clients",
  matters: "Matters",
  manuscripts: "Manuscripts",
  "contract-review": "Contract Review",
  "contract-drafting": "Contract Drafting",
  "corporate-drafting": "Corporate Drafting",
  "matter-flow": "Flow",
  review: "Documents",
  transcripts: "Transcript distiller",
  research: "Research",
  playbooks: "Playbooks",
  knowledge: "Precedents",
  library: "Library",
  learning: "Learning",
  career: "Career",
  tasks: "Tasks",
  templates: "Templates",
  archive: "Archive",
  deleted: "Recently Deleted",
  settings: "Settings",
  admin: "Admin portal",
};

export type NavIconKey =
  | "dashboard"
  | "clients"
  | "matters"
  | "manuscripts"
  | "contract-drafting"
  | "contract-review"
  | "legal-research"
  | "corporate-drafting"
  | "matter-flow"
  | "transcripts"
  | "playbooks"
  | "knowledge"
  | "library"
  | "learning"
  | "career"
  | "tasks"
  | "templates"
  | "archive"
  | "deleted"
  | "settings"
  | "admin";

export type AppNavItem = {
  kind: "item";
  key: SectionKey;
  label: string;
  to: string;
  icon: NavIconKey;
  adminOnly?: true;
};

export type AppNavParent = {
  kind: "parent";
  id: "workflow-tools";
  label: string;
  icon: NavIconKey;
  children: AppNavItem[];
};

export type AppNavEntry = AppNavItem | AppNavParent;

export type AppNavGroup = {
  label: string;
  items: AppNavEntry[];
};

const ITEM_CONTRACT_DRAFTING: AppNavItem = {
  kind: "item",
  key: "contract-drafting",
  label: "Contract Drafting",
  to: "/matters/contract-drafting",
  icon: "contract-drafting",
};
const ITEM_CONTRACT_REVIEW: AppNavItem = {
  kind: "item",
  key: "contract-review",
  label: "Contract Review",
  to: "/matters/review",
  icon: "contract-review",
};
const ITEM_RESEARCH: AppNavItem = {
  kind: "item",
  key: "research",
  label: "Legal Research",
  to: "/research",
  icon: "legal-research",
};
const ITEM_CORPORATE_DRAFTING: AppNavItem = {
  kind: "item",
  key: "corporate-drafting",
  label: "Corporate Drafting",
  to: "/matters/corporate-drafting",
  icon: "corporate-drafting",
};
const ITEM_TRANSCRIPTS: AppNavItem = {
  kind: "item",
  key: "transcripts",
  label: "Transcript distiller",
  to: "/transcripts",
  icon: "transcripts",
};
const ITEM_LIBRARY: AppNavItem = {
  kind: "item",
  key: "library",
  label: "Library",
  to: "/library",
  icon: "library",
};
const ITEM_KNOWLEDGE: AppNavItem = {
  kind: "item",
  key: "knowledge",
  label: "Precedents",
  to: "/knowledge",
  icon: "knowledge",
};
/* Under KNOWLEDGE with the rest of what is kept rather than done, and a
   portal of its own: it is about the person rather than the firm's work, and
   nobody else in the workspace can read a row of it. */
const ITEM_LEARNING: AppNavItem = {
  kind: "item",
  key: "learning",
  label: "Learning",
  to: "/learning",
  icon: "learning",
};
const ITEM_CAREER: AppNavItem = {
  kind: "item",
  key: "career",
  label: "Career",
  to: "/career",
  icon: "career",
};
const ITEM_TEMPLATES: AppNavItem = {
  kind: "item",
  key: "templates",
  label: "Templates",
  to: "/templates",
  icon: "templates",
};
const ITEM_PLAYBOOKS: AppNavItem = {
  kind: "item",
  key: "playbooks",
  label: "Playbooks",
  to: "/playbooks",
  icon: "playbooks",
};
const ITEM_ARCHIVE: AppNavItem = {
  kind: "item",
  key: "archive",
  label: "Archive",
  to: "/archive",
  icon: "archive",
};
const ITEM_DELETED: AppNavItem = {
  kind: "item",
  key: "deleted",
  label: "Recently Deleted",
  to: "/deleted",
  icon: "deleted",
};
const ITEM_SETTINGS: AppNavItem = {
  kind: "item",
  key: "settings",
  label: "Settings",
  to: "/settings",
  icon: "settings",
};
const ITEM_ADMIN: AppNavItem = {
  kind: "item",
  key: "admin",
  label: "Admin portal",
  to: "/admin",
  icon: "admin",
  adminOnly: true,
};

/**
 * The sidebar, in the order a lawyer's day reads.
 *
 * WORKSPACE is the work: what needs doing today, then who it is for, the
 * files opened for them and how the work is coordinated. TOOLS are where the
 * drafting and reading happen, always in view rather than folded away, since
 * Scripta is used on large screens with room to spare. KNOWLEDGE is what the
 * firm reuses, most-opened first. ADMIN is the platform's own controls, for
 * administrators only. Housekeeping and settings are not places work
 * happens, so they sit apart at the foot of the sidebar (NAV_FOOTER).
 */
export const NAV: AppNavGroup[] = [
  {
    label: "WORKSPACE",
    items: [
      { kind: "item", key: "home", label: "Dashboard", to: "/", icon: "dashboard" },
      // Tasks sits here, not under Knowledge: it is what needs doing, which
      // comes before where the doing happens.
      { kind: "item", key: "tasks", label: "Tasks", to: "/tasks", icon: "tasks" },
      // Who the firm acts for, before the files opened for them. A client is
      // not a gate: matters and flows can exist without one and be filed later.
      { kind: "item", key: "clients", label: "Clients", to: "/clients", icon: "clients" },
      // Matters sits above Flow and above the tools: it is the work itself, and
      // opening one used to mean going through Contract Review — which put
      // "New matter" inside a tool for reading contracts.
      { kind: "item", key: "matters", label: "Matters", to: "/matters", icon: "matters" },
      // Theses, dissertations and books under Book Review: first-class records
      // like clients and matters, which may be filed to either or to neither.
      {
        kind: "item",
        key: "manuscripts",
        label: "Manuscripts",
        to: "/manuscripts",
        icon: "manuscripts",
      },
      { kind: "item", key: "matter-flow", label: "Flow", to: "/matters/flow", icon: "matter-flow" },
    ],
  },
  {
    label: "TOOLS",
    items: [
      ITEM_CONTRACT_DRAFTING,
      ITEM_CONTRACT_REVIEW,
      ITEM_RESEARCH,
      ITEM_CORPORATE_DRAFTING,
      ITEM_TRANSCRIPTS,
    ],
  },
  {
    label: "KNOWLEDGE",
    items: [ITEM_LIBRARY, ITEM_KNOWLEDGE, ITEM_TEMPLATES, ITEM_PLAYBOOKS, ITEM_LEARNING, ITEM_CAREER],
  },
  // Running the platform, apart from the firm's own work. Only administrators
  // see it; for everyone else the group is empty and not drawn.
  { label: "ADMIN", items: [ITEM_ADMIN] },
];

/** Housekeeping and settings: at the foot of the sidebar, apart from the work. */
export const NAV_FOOTER: AppNavItem[] = [ITEM_ARCHIVE, ITEM_DELETED, ITEM_SETTINGS];

export function isNavParent(entry: AppNavEntry): entry is AppNavParent {
  return entry.kind === "parent";
}

export function flattenNavItems(groups: AppNavGroup[]): AppNavItem[] {
  return groups.flatMap((group) =>
    group.items.flatMap((entry) => (isNavParent(entry) ? entry.children : [entry])),
  );
}
