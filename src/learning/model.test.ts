import { describe, expect, it } from "vitest";
import {
  canPublish,
  indexProgress,
  isReleased,
  itemAfter,
  itemByNumber,
  moduleWarnings,
  nextIncomplete,
  numberCourse,
  numberItems,
  outlineRows,
  standing,
  streakDays,
  type Item,
  type ItemProgress,
  type Module,
} from "./model";

const TODAY = new Date("2026-09-21T09:00:00Z");

const item = (patch: Partial<Item> & { id: string }): Item => ({
  moduleId: "m1",
  parentItemId: null,
  position: 0,
  kind: "item",
  title: "",
  payload: {},
  visible: true,
  releaseRule: null,
  topicTags: [],
  outlineLineId: null,
  ...patch,
});

/** Module 3 of the wireframe: 1, 2, 2.1, 2.2, 2.3, 3, 4, and a locked quiz at 5. */
const module3 = (): Item[] => [
  item({ id: "video", position: 0, kind: "video", title: "How courts read exclusion clauses" }),
  item({ id: "folder", position: 1, kind: "folder", title: "Authorities & drafting note" }),
  item({ id: "caps", parentItemId: "folder", position: 0, title: "Caps and carve-outs" }),
  item({ id: "limit", parentItemId: "folder", position: 1, title: "Limitation of liability" }),
  item({ id: "indem", parentItemId: "folder", position: 2, kind: "link", title: "Indemnities" }),
  item({ id: "disc", position: 2, kind: "discussion", title: "A clause you would resist" }),
  item({ id: "assign", position: 3, kind: "assignment", title: "Draft a liability clause" }),
  item({
    id: "quiz",
    position: 4,
    kind: "quiz",
    title: "Quiz — Module 3",
    releaseRule: { after: ["video", "folder", "disc", "assign"] },
  }),
];

const progressOf = (...ids: string[]): ItemProgress[] =>
  ids.map((itemId) => ({ itemId, state: "complete", completedOn: "2026-09-20T10:00:00Z" }));

describe("numbering", () => {
  it("numbers the wireframe's module exactly", () => {
    const numbered = numberItems(module3());
    expect(numbered.map((i) => `${i.number} ${i.id}`)).toEqual([
      "1 video",
      "2 folder",
      "2.1 caps",
      "2.2 limit",
      "2.3 indem",
      "3 disc",
      "4 assign",
      "5 quiz",
    ]);
  });

  it("renumbers everything when an item is dragged, without touching a stored number", () => {
    const items = module3();
    // The discussion is dragged above the folder: positions change, nothing else does.
    const dragged = items.map((i) => {
      if (i.id === "disc") return { ...i, position: 1 };
      if (i.id === "folder") return { ...i, position: 2 };
      return i;
    });
    const numbered = numberItems(dragged);
    expect(numbered.map((i) => `${i.number} ${i.id}`)).toEqual([
      "1 video",
      "2 disc",
      "3 folder",
      "3.1 caps",
      "3.2 limit",
      "3.3 indem",
      "4 assign",
      "5 quiz",
    ]);
    // The children moved with their parent and kept their ids.
    expect(itemByNumber(numbered, "3.2")?.id).toBe("limit");
  });

  it("keeps an orphaned item visible rather than dropping it off the page", () => {
    const items = [...module3(), item({ id: "stray", parentItemId: "deleted-folder" })];
    const numbered = numberItems(items);
    expect(numbered).toHaveLength(9);
    expect(numbered.find((i) => i.id === "stray")?.number).toBe("—");
  });
});

describe("the outline", () => {
  const withOutline = (): Module => ({
    id: "m1",
    courseId: "c1",
    title: "Risk, liability & indemnity",
    week: 3,
    cpdHours: 1.5,
    position: 2,
    publishedAt: null,
    coverPath: null,
    coverCredit: "",
    outline: [
      { id: "l1", text: "Watch the introduction", itemId: "video" },
      { id: "l2", text: "Read the three authorities", itemId: "folder" },
      { id: "l3", text: "Caps and carve-outs", itemId: "caps" },
      { id: "l4", text: "Post one clause you would resist", itemId: "disc" },
      { id: "l5", text: "Draft the clause in the assignment", itemId: "assign" },
    ],
  });

  it("takes each line's number from the item it is bound to", () => {
    const rows = outlineRows(withOutline(), numberItems(module3()));
    expect(rows.map((r) => r.number)).toEqual(["1", "2", "2.1", "3", "4"]);
  });

  it("flags an item that answers no outline line", () => {
    const warnings = moduleWarnings(withOutline(), numberItems(module3()));
    const unanswered = warnings.filter((w) => w.kind === "item-answers-nothing");
    // The quiz and two of the folder's children are bound to nothing.
    expect(unanswered.map((w) => (w.kind === "item-answers-nothing" ? w.number : ""))).toEqual([
      "2.2",
      "2.3",
      "5",
    ]);
  });

  it("will not publish a module with no outline", () => {
    const empty = { ...withOutline(), outline: [] };
    expect(canPublish(empty)).toBe(false);
    expect(moduleWarnings(empty, numberItems(module3()))).toEqual([{ kind: "no-outline" }]);
    expect(canPublish(withOutline())).toBe(true);
  });
});

describe("progress", () => {
  it("counts item completion and ignores folders", () => {
    const progress = indexProgress(progressOf("video", "caps"));
    // Eight items, one of which is a folder: seven count.
    expect(standing(module3(), progress)).toEqual({ done: 2, total: 7, percent: 29 });
  });

  it("holds the quiz until everything it names is complete", () => {
    const items = module3();
    const quiz = items.find((i) => i.id === "quiz")!;
    expect(isReleased(quiz, indexProgress(progressOf("video")), TODAY)).toBe(false);
    const all = indexProgress(progressOf("video", "folder", "disc", "assign"));
    expect(isReleased(quiz, all, TODAY)).toBe(true);
  });

  it("continues at the furthest incomplete item, not the last one visited", () => {
    const numbered = numberItems(module3());
    const progress = indexProgress(progressOf("video", "folder", "caps"));
    expect(nextIncomplete(numbered, progress, TODAY)?.id).toBe("limit");
  });

  it("steps over a locked item rather than parking on it", () => {
    const numbered = numberItems(module3());
    // Everything done but the quiz, which is now released.
    const done = progressOf("video", "folder", "caps", "limit", "indem", "disc", "assign");
    expect(nextIncomplete(numbered, indexProgress(done), TODAY)?.id).toBe("quiz");

    // The same, except the assignment is outstanding, so the quiz is still shut.
    const partial = progressOf("video", "folder", "caps", "limit", "indem", "disc");
    expect(nextIncomplete(numbered, indexProgress(partial), TODAY)?.id).toBe("assign");
  });

  it("returns nothing to continue once the module is finished", () => {
    const numbered = numberItems(module3());
    const all = progressOf("video", "folder", "caps", "limit", "indem", "disc", "assign", "quiz");
    expect(nextIncomplete(numbered, indexProgress(all), TODAY)).toBeNull();
  });

  it("walks Next in reading order, through the nesting", () => {
    const numbered = numberItems(module3());
    expect(itemAfter(numbered, "folder")?.id).toBe("caps");
    expect(itemAfter(numbered, "indem")?.id).toBe("disc");
    expect(itemAfter(numbered, "quiz")).toBeNull();
  });
});

describe("streak", () => {
  const on = (day: string): ItemProgress => ({
    itemId: day,
    state: "complete",
    completedOn: `${day}T08:00:00Z`,
  });

  it("counts distinct days, not completions", () => {
    const rows = [on("2026-09-21"), on("2026-09-21"), on("2026-09-20"), on("2026-09-19")];
    expect(streakDays(rows, TODAY)).toBe(3);
  });

  it("survives a day that has not finished yet", () => {
    expect(streakDays([on("2026-09-20"), on("2026-09-19")], TODAY)).toBe(2);
  });

  it("breaks on a missed day", () => {
    expect(streakDays([on("2026-09-21"), on("2026-09-18")], TODAY)).toBe(1);
    expect(streakDays([on("2026-09-15")], TODAY)).toBe(0);
    expect(streakDays([], TODAY)).toBe(0);
  });
});

describe("numberCourse", () => {
  const items = [
    item({ id: "b1", moduleId: "mB", position: 0 }),
    item({ id: "a2", moduleId: "mA", position: 1 }),
    item({ id: "a1", moduleId: "mA", position: 0 }),
    item({ id: "b2", moduleId: "mB", position: 1 }),
  ];
  const modules = [
    { id: "mB", position: 1 },
    { id: "mA", position: 0 },
  ];

  it("numbers each module on its own, in module order", () => {
    expect(numberCourse(modules, items).map((i) => `${i.id}:${i.number}`)).toEqual([
      "a1:1",
      "a2:2",
      "b1:1",
      "b2:2",
    ]);
  });

  it("sends Continue to the earlier module first", () => {
    const next = nextIncomplete(numberCourse(modules, items), indexProgress([]), TODAY);
    expect(next?.id).toBe("a1");
  });
});
