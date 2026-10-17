/**
 * Learning — the shapes, and the three derivations everything else reads.
 *
 * Nothing in this file talks to the database. It takes the rows as they are
 * stored and works out the things that are deliberately not stored: what an
 * item is called when you point at it, what a learner has left to do, and
 * where "Continue" should land.
 */

export type CourseVisibility = "assigned" | "self";

export type Course = {
  id: string;
  workspaceId: string;
  title: string;
  subtitle: string;
  visibility: CourseVisibility;
  cpdHours: number;
  opensOn: string | null;
  endsOn: string | null;
  publishedAt: string | null;
  createdBy: string;
  updatedAt: string;
  archivedAt: string | null;
  /** Stored path of the cover image, if any; shown through a signed link. */
  coverPath: string | null;
  /** The photographer's credit line, for a photo that asks for one. */
  coverCredit: string;
};

export type MenuEntryKind = "heading" | "divider" | "link";
export type MenuTargetKind = "module" | "item" | "tool" | "url";

/** One line of the authored course menu. The grouping is the author's, not ours. */
export type MenuEntry = {
  id: string;
  courseId: string;
  kind: MenuEntryKind;
  label: string;
  targetKind: MenuTargetKind | null;
  targetRef: string | null;
  countsAsContent: boolean;
  position: number;
};

/**
 * One line of a module's outline. It carries no number of its own: the number
 * it shows is the number of the item it is bound to, which is how renumbering
 * the content renumbers the outline without anybody editing it.
 */
export type OutlineLine = {
  id: string;
  text: string;
  itemId: string | null;
};

export type Module = {
  id: string;
  courseId: string;
  title: string;
  week: number | null;
  cpdHours: number;
  outline: OutlineLine[];
  position: number;
  publishedAt: string | null;
  /** Optional cover image path, shown through a signed link. */
  coverPath: string | null;
  coverCredit: string;
};

export type ItemKind =
  "item" | "video" | "link" | "file" | "folder" | "discussion" | "assignment" | "quiz";

/** What has to be true before a learner can open an item. */
export type ReleaseRule = { after?: string[]; on?: string } | null;

export type Item = {
  id: string;
  moduleId: string;
  parentItemId: string | null;
  position: number;
  kind: ItemKind;
  title: string;
  payload: unknown;
  visible: boolean;
  releaseRule: ReleaseRule;
  topicTags: string[];
  outlineLineId: string | null;
};

export type ProgressState = "started" | "complete";

export type ItemProgress = {
  itemId: string;
  state: ProgressState;
  completedOn: string | null;
};

export type Enrolment = {
  courseId: string;
  personId: string;
  role: "learner" | "author";
};

// --------------------------------------------------------------- numbering --

/**
 * An item with the number it is called by. The number is worked out here and
 * nowhere else: `2.1` is the second child of the second top-level item, and it
 * stays correct because it was never written down.
 */
export type NumberedItem = Item & {
  /** "2.1". Derived from the parent chain and position. */
  number: string;
  /** 0 for a top-level item, 1 for a child. */
  depth: number;
};

/**
 * Every item in reading order, numbered. Siblings are ordered by position and
 * a child follows its parent immediately, which is both the order the page
 * renders in and the order Next walks.
 */
export function numberItems(items: Item[]): NumberedItem[] {
  const children = new Map<string | null, Item[]>();
  for (const item of items) {
    const key = item.parentItemId;
    const list = children.get(key);
    if (list) list.push(item);
    else children.set(key, [item]);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }

  const out: NumberedItem[] = [];
  const walk = (parentId: string | null, prefix: string, depth: number) => {
    const list = children.get(parentId) ?? [];
    list.forEach((item, index) => {
      const number = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      out.push({ ...item, number, depth });
      walk(item.id, number, depth + 1);
    });
  };
  walk(null, "", 0);

  // An item whose parent was deleted underneath it would otherwise vanish from
  // the page while still existing. Surface it at the end rather than lose it.
  if (out.length < items.length) {
    const seen = new Set(out.map((i) => i.id));
    for (const item of items) {
      if (!seen.has(item.id)) out.push({ ...item, number: "—", depth: 0 });
    }
  }
  return out;
}

/**
 * Every item in the course in reading order: module by module in the order
 * the modules sit, each module numbered on its own. Numbering the course's
 * items in one pass would number them across modules — the second item of
 * module one would come out as "12" — and would walk Continue into a later
 * module before an earlier one was finished.
 */
export function numberCourse(
  modules: Pick<Module, "id" | "position">[],
  items: Item[],
): NumberedItem[] {
  const ordered = [...modules].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const known = new Set(ordered.map((m) => m.id));
  return [
    ...ordered.flatMap((module) => numberItems(items.filter((i) => i.moduleId === module.id))),
    // Items whose module is not in the list are kept rather than lost.
    ...numberItems(items.filter((i) => !known.has(i.moduleId))),
  ];
}

/** The item a number refers to, so a learner quoting "2.1" is understood. */
export function itemByNumber(numbered: NumberedItem[], number: string): NumberedItem | null {
  return numbered.find((item) => item.number === number) ?? null;
}

// ----------------------------------------------------------------- outline --

/**
 * The outline as it renders: each line carrying the number of the item it is
 * bound to. A line bound to nothing still shows — an outline written before
 * the content is the normal way round — it simply has no number yet.
 */
export type OutlineRow = OutlineLine & { number: string | null };

export function outlineRows(module: Module, numbered: NumberedItem[]): OutlineRow[] {
  const byId = new Map(numbered.map((item) => [item.id, item]));
  return module.outline.map((line) => ({
    ...line,
    number: line.itemId ? (byId.get(line.itemId)?.number ?? null) : null,
  }));
}

/**
 * What is not yet honest about this module. The author sees these; only the
 * missing outline stops a publish, because writing an item before its outline
 * line is ordinary and being unable to save it would not be.
 */
export type ModuleWarning =
  | { kind: "no-outline" }
  | { kind: "item-answers-nothing"; itemId: string; number: string; title: string }
  | { kind: "line-has-no-item"; lineId: string; text: string };

export function moduleWarnings(module: Module, numbered: NumberedItem[]): ModuleWarning[] {
  const warnings: ModuleWarning[] = [];
  if (module.outline.length === 0) {
    warnings.push({ kind: "no-outline" });
    return warnings;
  }

  const bound = new Set(module.outline.map((line) => line.itemId).filter(Boolean) as string[]);
  for (const item of numbered) {
    if (!bound.has(item.id)) {
      warnings.push({
        kind: "item-answers-nothing",
        itemId: item.id,
        number: item.number,
        title: item.title,
      });
    }
  }
  for (const line of module.outline) {
    if (!line.itemId) warnings.push({ kind: "line-has-no-item", lineId: line.id, text: line.text });
  }
  return warnings;
}

/** A module without an outline cannot be published. The database agrees. */
export function canPublish(module: Module): boolean {
  return module.outline.length > 0;
}

// ---------------------------------------------------------------- progress --

export type ProgressIndex = Map<string, ItemProgress>;

export function indexProgress(rows: ItemProgress[]): ProgressIndex {
  return new Map(rows.map((row) => [row.itemId, row]));
}

export function isComplete(progress: ProgressIndex, itemId: string): boolean {
  return progress.get(itemId)?.state === "complete";
}

/**
 * Whether an item is open to this learner yet. A release rule naming other
 * items holds until every one of them is complete, which is what keeps the
 * quiz shut until the module has actually been worked through.
 */
export function isReleased(item: Item, progress: ProgressIndex, now: Date = new Date()): boolean {
  const rule = item.releaseRule;
  if (!rule) return true;
  if (rule.on && new Date(rule.on) > now) return false;
  if (rule.after && rule.after.length > 0) {
    return rule.after.every((id) => isComplete(progress, id));
  }
  return true;
}

/**
 * Items that count towards completion. A folder is a container rather than a
 * thing to read, so it is not one of them — otherwise a module gains progress
 * for having structure.
 */
export function countsTowardsProgress(item: Item): boolean {
  return item.visible && item.kind !== "folder";
}

export type Standing = { done: number; total: number; percent: number };

/** Every figure this area shows comes through here. Nothing caches the result. */
export function standing(items: Item[], progress: ProgressIndex): Standing {
  const counted = items.filter(countsTowardsProgress);
  const done = counted.filter((item) => isComplete(progress, item.id)).length;
  const total = counted.length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/**
 * Where Continue goes: the furthest incomplete item in reading order, not the
 * last URL visited, so it survives the author reordering the module underneath
 * the learner. Nothing released is skipped; a locked item is passed over
 * rather than parked on.
 */
export function nextIncomplete(
  numbered: NumberedItem[],
  progress: ProgressIndex,
  now: Date = new Date(),
): NumberedItem | null {
  for (const item of numbered) {
    if (!countsTowardsProgress(item)) continue;
    if (isComplete(progress, item.id)) continue;
    if (!isReleased(item, progress, now)) continue;
    return item;
  }
  return null;
}

/** The item after this one in reading order, for Next. */
export function itemAfter(numbered: NumberedItem[], itemId: string): NumberedItem | null {
  const index = numbered.findIndex((item) => item.id === itemId);
  if (index < 0) return null;
  for (let i = index + 1; i < numbered.length; i += 1) {
    const candidate = numbered[i];
    if (candidate && candidate.visible) return candidate;
  }
  return null;
}

/**
 * Distinct days on which at least one item was completed, counting back from
 * today and stopping at the first gap. A streak is a fact about days, not
 * about hours spent.
 */
export function streakDays(rows: ItemProgress[], today: Date = new Date()): number {
  const days = new Set(
    rows
      .filter((row) => row.state === "complete" && row.completedOn)
      .map((row) => (row.completedOn as string).slice(0, 10)),
  );
  if (days.size === 0) return 0;

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const cursor = new Date(today);
  // A streak is unbroken if you studied today or yesterday; anything older has
  // already been broken by the day that passed without a completion.
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}
