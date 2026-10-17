/**
 * What a task is.
 *
 * Tasks answer one question when the screen opens: what do I need to work on?
 * Everything here exists to answer it — the attention states a lawyer actually
 * thinks in, the difference between a deadline and an intention, and what the
 * task is connected to so it can be started rather than merely read.
 */

/**
 * Stored values are the ones the table already had, plus Waiting. The labels
 * are what a lawyer calls them. Renaming the stored values would rewrite every
 * existing row for a cosmetic gain, so the two are kept apart.
 */
import {
  correspondenceSearchText,
  sortThreads,
  type Attachment,
  type EmailDraft,
  type ThreadEntry,
} from "@/lib/correspondence";

export type { Attachment, EmailDraft, ThreadEntry };

export type TaskStatus = "Open" | "In progress" | "Waiting" | "Blocked" | "Done";

export const TASK_STATUSES: TaskStatus[] = ["Open", "In progress", "Waiting", "Blocked", "Done"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  Open: "To do",
  "In progress": "In progress",
  Waiting: "Waiting",
  Blocked: "Blocked",
  Done: "Complete",
};

/** The statuses a board draws as columns; Blocked is rare and sits under Waiting. */
export const BOARD_STATUSES: TaskStatus[] = ["Open", "In progress", "Waiting", "Done"];

export type TaskPriority = "high" | "normal" | "low";
export const PRIORITIES: TaskPriority[] = ["high", "normal", "low"];
export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "High",
  normal: "Normal",
  low: "Low",
};

/** Where a task came from. `manual` is somebody typing it, which is most of them. */
export type TaskOrigin =
  | "manual"
  | "flow"
  | "review"
  | "research"
  | "corporate"
  | "transcript"
  | "clause"
  | "playbook"
  | "precedent"
  | "document"
  | "matter"
  | "org_obligation"
  | "org_licence";

export const ORIGIN_LABEL: Record<string, string> = {
  manual: "Added by hand",
  flow: "Flow",
  review: "Contract Review",
  research: "Legal Research",
  corporate: "Corporate Drafting",
  transcript: "Transcript distiller",
  clause: "A clause",
  playbook: "Playbooks",
  precedent: "Precedents",
  document: "A document",
  matter: "A matter",
  org_obligation: "Compliance calendar",
  org_licence: "Licence renewal",
};

export type ChecklistItem = { id: string; text: string; done: boolean };

export type Task = {
  id: string;
  title: string;
  detail: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** The actual deadline. Null when there simply is not one. */
  dueDate: string | null;
  /** The day you mean to work on it. Not a deadline. */
  plannedOn: string | null;
  matterId: string | null;
  matterName: string;
  /**
   * Whose work this is, and by which route. A task filed to a matter reaches
   * its client through the matter; one raised in a flow, through the flow; and
   * only a task filed to neither holds a client of its own. `clientName` is
   * the answer whichever route it came by.
   */
  clientId: string | null;
  clientName: string;
  /** The flow this task's deliverable belongs to, when it came from one. */
  flowId: string | null;
  flowName: string;
  assigneeId: string | null;
  origin: TaskOrigin | null;
  originId: string | null;
  /** The deliverable this discharges, when it came from a Flow. */
  deliverableId: string | null;
  /** Which Workflow Tool this is work for. */
  tool: ToolKey | null;
  checklist: ChecklistItem[];
  tags: string[];
  /**
   * The email this task is settling the wording of, and the replies that came
   * back. Same shapes a Flow deliverable uses; see `lib/correspondence`.
   */
  emailDraft: EmailDraft | null;
  threads: ThreadEntry[];
  /**
   * What the task carries: files, documents Scripta already holds, and links.
   * Kept on the task rather than on a message, because most of what a lawyer
   * attaches is not correspondence at all.
   */
  attachments: Attachment[];
  output: { kind: string; id: string | null; label: string } | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const isDone = (t: Task) => t.status === "Done";

/* ------------------------------------------------------- attention states */

/**
 * The states a lawyer opens the screen in.
 *
 * Not a filter over every field: these are the answers to "what needs me?",
 * and a task is in exactly one of them. Waiting wins over a date, because work
 * you cannot act on is not today's work however overdue it looks — which is
 * the whole reason the state exists.
 */
export type Attention = "overdue" | "today" | "upcoming" | "waiting" | "someday" | "done";

export const ATTENTION_LABEL: Record<Attention, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  waiting: "Waiting",
  someday: "No date",
  done: "Completed",
};

const earliest = (a: string | null, b: string | null) =>
  a && b ? (a < b ? a : b) : (a ?? b ?? null);

/** The date a task is sorted and filed under, whichever kind it is. */
export const actingDate = (task: Pick<Task, "dueDate" | "plannedOn">) =>
  earliest(task.dueDate, task.plannedOn);

export function attentionOf(task: Task, today: string): Attention {
  if (task.status === "Done") return "done";
  if (task.status === "Waiting" || task.status === "Blocked") return "waiting";
  // Either kind of date can put work in today: a deadline that falls now, or a
  // day set aside for it.
  const when = actingDate(task);
  if (!when) return "someday";
  if (when < today) return "overdue";
  if (when === today) return "today";
  return "upcoming";
}

/**
 * Most pressing first.
 *
 * Overdue before today before the rest, then by date, then high priority ahead
 * of normal. A task with no date sorts last rather than first: it is not
 * urgent, it is merely undated.
 */
export function byAttention(today: string) {
  const rank: Record<Attention, number> = {
    overdue: 0,
    today: 1,
    upcoming: 2,
    waiting: 3,
    someday: 4,
    done: 5,
  };
  const weight: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };
  return (a: Task, b: Task) => {
    const byState = rank[attentionOf(a, today)] - rank[attentionOf(b, today)];
    if (byState) return byState;
    const first = actingDate(a);
    const second = actingDate(b);
    if (first && second && first !== second) return first < second ? -1 : 1;
    if (first !== second) return first ? -1 : 1;
    return weight[a.priority] - weight[b.priority];
  };
}

/** What the Dashboard can say without opening Tasks. */
export function taskSummary(tasks: Task[], today: string) {
  const live = tasks.filter((t) => t.status !== "Done");
  const count = (a: Attention) => live.filter((t) => attentionOf(t, today) === a).length;
  return {
    overdue: count("overdue"),
    today: count("today"),
    upcoming: count("upcoming"),
    waiting: count("waiting"),
    total: live.length,
  };
}

/* ----------------------------------------------------- do this in Scripta */

export type ToolKey = "corporate" | "research" | "review" | "flow";

export type Tool = {
  key: ToolKey;
  /** What the button says. A verb, because it starts the work. */
  label: string;
  /** The tool's name on its own, for a row that has no room for a sentence. */
  short: string;
  to: string;
  /** Why Scripta thinks so, shown when it is a guess rather than a record. */
  because: string;
};

export const TOOLS: Record<ToolKey, Omit<Tool, "because">> = {
  corporate: {
    key: "corporate",
    label: "Start in Corporate Drafting",
    short: "Corporate Drafting",
    to: "/matters/corporate-drafting/new",
  },
  research: {
    key: "research",
    label: "Start Legal Research",
    short: "Legal Research",
    to: "/research/new",
  },
  review: {
    key: "review",
    label: "Start Contract Review",
    short: "Contract Review",
    to: "/matters",
  },
  flow: { key: "flow", label: "Create a Flow", short: "Flow", to: "/matters/flow" },
};

/**
 * Which tool this task is work for.
 *
 * Read off the words a lawyer would use, because that is all Scripta has
 * before the task is opened. Deliberately conservative: no match is a good
 * answer, and a confident wrong suggestion is worse than none.
 */
const RULES: { tool: ToolKey; test: RegExp; because: string }[] = [
  {
    tool: "corporate",
    test: /\b(board |written |shareholders? )?resolution\b|\bminutes\b|incorporat|company secretar|power of attorney/i,
    because: "This reads like a corporate instrument.",
  },
  {
    tool: "flow",
    test: /\bend[- ]to[- ]end\b|\bthroughout the transaction\b|\badvise .* on the .* transaction\b/i,
    because: "This reads like work with stages rather than one job.",
  },
  {
    tool: "research",
    test: /\bresearch\b|\bmemo(randum)?\b|\bopinion\b|\brequirements?\b|\bregulat|\bis it lawful\b|\blegal position\b/i,
    because: "This reads like a question to answer before anything is drafted.",
  },
  {
    tool: "review",
    test: /\breview\b|mark ?-?up|\bredline\b|\bcomment on\b|\bnegotiat/i,
    because: "This reads like work on somebody else's paper.",
  },
];

export function suggestTool(title: string, detail = ""): Tool | null {
  const text = `${title} ${detail}`;
  for (const rule of RULES)
    if (rule.test.test(text)) return { ...TOOLS[rule.tool], because: rule.because };
  return null;
}

/** The tool a task offers: the one it was given, else the guess. A person's answer beats a rule. */
export function toolFor(task: Pick<Task, "title" | "detail" | "tool">): Tool | null {
  if (task.tool && TOOLS[task.tool])
    return { ...TOOLS[task.tool], because: "You chose this for this task." };
  return suggestTool(task.title, task.detail);
}

/**
 * Work that has outgrown a task.
 *
 * A checklist is a work item; phases, several deliverables and dependencies
 * are a work process, and those belong in a Flow. The threshold is high on
 * purpose: suggesting it early would train people to ignore it.
 */
export function outgrownTask(task: Pick<Task, "checklist" | "deliverableId">): boolean {
  return !task.deliverableId && task.checklist.length >= 6;
}

/** A task's replies, oldest first. */
export const taskThreads = (task: Task) => sortThreads(task.threads);

/**
 * Everything about a task a keyword should reach. Correspondence included: the
 * reason a reply is kept against the task at all is so it can be found from
 * here rather than from a mail client.
 */
export const taskSearchText = (task: Task) =>
  [
    task.title,
    task.detail,
    task.matterName,
    task.clientName,
    task.flowName,
    ...task.tags,
    ...task.checklist.map((c) => c.text),
    ...task.attachments.map((a) => a.name),
    correspondenceSearchText(task),
  ].join(" ");
