import { describe, expect, it } from "vitest";
import {
  attentionOf,
  byAttention,
  outgrownTask,
  suggestTool,
  taskSummary,
  toolFor,
  type Task,
} from "./model";

const TODAY = "2026-09-13";

const task = (patch: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "A task",
  detail: "",
  status: "Open",
  priority: "normal",
  dueDate: null,
  plannedOn: null,
  matterId: null,
  matterName: "",
  clientId: null,
  clientName: "",
  flowId: null,
  flowName: "",
  assigneeId: null,
  origin: "manual",
  originId: null,
  deliverableId: null,
  tool: null,
  checklist: [],
  tags: [],
  emailDraft: null,
  threads: [],
  attachments: [],
  output: null,
  completedAt: null,
  createdAt: TODAY,
  updatedAt: TODAY,
  ...patch,
});

describe("what needs attention", () => {
  it("files a deadline that has passed as overdue", () => {
    expect(attentionOf(task({ dueDate: "2026-09-10" }), TODAY)).toBe("overdue");
  });

  it("files today's deadline as today", () => {
    expect(attentionOf(task({ dueDate: TODAY }), TODAY)).toBe("today");
  });

  it("files a day set aside for the work as today, though nothing is due", () => {
    // "Work on Friday" is not "due Friday", but on Friday it is still today's work.
    expect(attentionOf(task({ plannedOn: TODAY }), TODAY)).toBe("today");
  });

  it("files a task with no date of either kind under no date", () => {
    expect(attentionOf(task(), TODAY)).toBe("someday");
  });

  it("keeps waiting work out of overdue, however late it looks", () => {
    // The point of Waiting is that it is not actionable. Showing it as overdue
    // would tell a lawyer to do something they cannot do.
    expect(attentionOf(task({ status: "Waiting", dueDate: "2026-01-01" }), TODAY)).toBe("waiting");
    expect(attentionOf(task({ status: "Blocked", dueDate: "2026-01-01" }), TODAY)).toBe("waiting");
  });

  it("files completed work as completed whatever its dates said", () => {
    expect(attentionOf(task({ status: "Done", dueDate: "2026-01-01" }), TODAY)).toBe("done");
  });

  it("takes whichever date comes first", () => {
    const t = task({ dueDate: "2026-09-20", plannedOn: "2026-09-10" });
    expect(attentionOf(t, TODAY)).toBe("overdue");
  });
});

describe("most pressing first", () => {
  it("puts overdue above today above upcoming", () => {
    const rows = [
      task({ id: "up", dueDate: "2026-09-30" }),
      task({ id: "over", dueDate: "2026-09-01" }),
      task({ id: "now", dueDate: TODAY }),
    ].sort(byAttention(TODAY));
    expect(rows.map((t) => t.id)).toEqual(["over", "now", "up"]);
  });

  it("sorts an undated task last, not first", () => {
    const rows = [task({ id: "none" }), task({ id: "dated", dueDate: "2026-09-30" })].sort(
      byAttention(TODAY),
    );
    expect(rows.map((t) => t.id)).toEqual(["dated", "none"]);
  });

  it("breaks a tie on the same day by priority", () => {
    const rows = [
      task({ id: "normal", dueDate: TODAY }),
      task({ id: "high", dueDate: TODAY, priority: "high" }),
    ].sort(byAttention(TODAY));
    expect(rows.map((t) => t.id)).toEqual(["high", "normal"]);
  });
});

describe("what the dashboard says", () => {
  it("counts the live states and leaves completed work out", () => {
    const summary = taskSummary(
      [
        task({ dueDate: "2026-09-01" }),
        task({ dueDate: TODAY }),
        task({ dueDate: "2026-09-30" }),
        task({ status: "Waiting" }),
        task({ status: "Done", dueDate: "2026-09-01" }),
      ],
      TODAY,
    );
    expect(summary).toEqual({ overdue: 1, today: 1, upcoming: 1, waiting: 1, total: 4 });
  });
});

describe("which tool the work wants", () => {
  it.each([
    ["Prepare Board Resolution authorising engagement with refinery", "corporate"],
    ["Research GoldBod export requirements", "research"],
    ["Review supplier agreement", "review"],
  ])("routes %s", (title, tool) => {
    expect(suggestTool(title)?.key).toBe(tool);
  });

  it("suggests nothing for a single clause, now that Clause Drafting is gone", () => {
    // It used to open Clause Drafting. That tool was removed — a clause
    // position belongs in a playbook — and nothing has taken its place, so
    // the honest answer is no suggestion rather than a wrong one.
    expect(suggestTool("Draft a limitation of liability clause")).toBeNull();
  });

  it("says nothing rather than guessing", () => {
    // A confident wrong suggestion is worse than none.
    expect(suggestTool("Call Mamadou about Tuesday")).toBeNull();
    expect(suggestTool("Book the flights")).toBeNull();
  });

  it("lets a chosen tool beat the rule", () => {
    const chosen = toolFor(task({ title: "Review supplier agreement", tool: "research" }));
    expect(chosen?.key).toBe("research");
    expect(chosen?.because).toContain("You chose");
  });

  it("explains a guess as a guess", () => {
    expect(toolFor(task({ title: "Research the position" }))?.because).toContain("reads like");
  });
});

describe("work that has outgrown a task", () => {
  const list = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `c${i}`, text: "step", done: false }));

  it("says nothing for an ordinary checklist", () => {
    expect(outgrownTask(task({ checklist: list(5) }))).toBe(false);
  });

  it("suggests a Flow once the list is really a process", () => {
    expect(outgrownTask(task({ checklist: list(6) }))).toBe(true);
  });

  it("never suggests it for work that already came from a Flow", () => {
    expect(outgrownTask(task({ checklist: list(9), deliverableId: "d1" }))).toBe(false);
  });
});
