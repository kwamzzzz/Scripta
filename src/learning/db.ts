/**
 * Reading and writing Learning.
 *
 * A course is read whole — its menu, its modules, every item and this
 * learner's progress across all of it — because almost everything the area
 * shows is a figure derived across the whole course. Continue has to know the
 * furthest incomplete item anywhere in it, and a per-module query would mean
 * the course home disagreeing with the module a learner just finished.
 *
 * Progress rows are this learner's own. Nothing here asks for anybody else's,
 * and row-level security would refuse if it did.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readBlocks } from "./blocks";
import { estimateBlocks } from "./estimate";
import type {
  Course,
  CourseVisibility,
  Enrolment,
  Item,
  ItemKind,
  ItemProgress,
  MenuEntry,
  MenuEntryKind,
  MenuTargetKind,
  Module,
  OutlineLine,
  ReleaseRule,
} from "./model";

/* The learning tables are newer than the generated types, so the calls are
   cast at this boundary and nowhere else. */
const db = supabase as unknown as { from: (t: string) => any };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

const toCourse = (r: any): Course => ({
  id: r.id,
  workspaceId: r.workspace_id,
  title: str(r.title),
  subtitle: str(r.subtitle),
  visibility: (r.visibility ?? "assigned") as CourseVisibility,
  cpdHours: num(r.cpd_hours),
  opensOn: r.opens_on ?? null,
  endsOn: r.ends_on ?? null,
  publishedAt: r.published_at ?? null,
  createdBy: r.created_by,
  updatedAt: str(r.updated_at),
  archivedAt: r.archived_at ?? null,
  coverPath: r.cover_path ?? null,
  coverCredit: str(r.cover_credit),
});

const toMenuEntry = (r: any): MenuEntry => ({
  id: r.id,
  courseId: r.course_id,
  kind: (r.kind ?? "link") as MenuEntryKind,
  label: str(r.label),
  targetKind: (r.target_kind ?? null) as MenuTargetKind | null,
  targetRef: r.target_ref ?? null,
  countsAsContent: r.counts_as_content === true,
  position: num(r.position),
});

/* Outline lines are stored as JSON on the module. Anything that is not a line
   is dropped rather than rendered as an empty row. */
const toOutline = (v: unknown): OutlineLine[] =>
  Array.isArray(v)
    ? v.flatMap((line: any) =>
        line && typeof line === "object" && typeof line.id === "string"
          ? [{ id: line.id, text: str(line.text), itemId: line.item_id ?? line.itemId ?? null }]
          : [],
      )
    : [];

const toModule = (r: any): Module => ({
  id: r.id,
  courseId: r.course_id,
  title: str(r.title),
  week: r.week ?? null,
  cpdHours: num(r.cpd_hours),
  outline: toOutline(r.outline),
  position: num(r.position),
  publishedAt: r.published_at ?? null,
  coverPath: r.cover_path ?? null,
  coverCredit: str(r.cover_credit),
});

const toItem = (r: any): Item => ({
  id: r.id,
  moduleId: r.module_id,
  parentItemId: r.parent_item_id ?? null,
  position: num(r.position),
  kind: (r.kind ?? "item") as ItemKind,
  title: str(r.title),
  payload: r.payload ?? {},
  visible: r.visible !== false,
  releaseRule: (r.release_rule ?? null) as ReleaseRule,
  topicTags: Array.isArray(r.topic_tags) ? r.topic_tags : [],
  outlineLineId: r.outline_line_id ?? null,
});

const toProgress = (r: any): ItemProgress => ({
  itemId: r.item_id,
  state: r.state === "complete" ? "complete" : "started",
  completedOn: r.completed_on ?? null,
});

const toEnrolment = (r: any): Enrolment => ({
  courseId: r.course_id,
  personId: r.person_id,
  role: r.role === "author" ? "author" : "learner",
});

const outlineToJson = (outline: OutlineLine[]) =>
  outline.map((line) => ({ id: line.id, text: line.text, item_id: line.itemId }));

// ------------------------------------------------------------- the shelf --

export type CourseCard = Course & {
  /** Derived on read from this learner's progress; never stored. */
  done: number;
  total: number;
  /** This person's place on the course, if they have one. */
  role: "learner" | "author" | null;
  /** Whether this person made it or is enrolled to author it. */
  authoring: boolean;
  /** Estimated time for the whole course, and what is left of it, in seconds. */
  seconds: number;
  secondsLeft: number;
  /** How much is in it, so deleting can tell an empty course from a real one. */
  modules: number;
  files: number;
};

export const learningKey = (workspaceId: string | null) => ["learning", workspaceId];

/** Every course this person can see, with their standing in each. */
export function useCourses(workspaceId: string | null) {
  return useQuery({
    queryKey: learningKey(workspaceId),
    enabled: !!workspaceId,
    queryFn: async (): Promise<CourseCard[]> => {
      const { data: courses, error } = await db
        .from("learning_courses")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const ids = (courses ?? []).map((c: any) => c.id);
      if (ids.length === 0) return [];

      // An author can read other people's enrolments on their course, so the
      // rows are narrowed to this person's own before they decide anything.
      // The session already held in the browser; getUser would ask the auth
      // server again on every read of the shelf.
      const { data: auth } = await supabase.auth.getSession();
      const me = auth.session?.user.id ?? null;
      const { data: enrolments } = await db
        .from("learning_enrolments")
        .select("course_id, person_id, role")
        .in("course_id", ids);
      const roleOf = new Map<string, "learner" | "author">(
        (enrolments ?? [])
          .filter((e: any) => e.person_id === me)
          .map((e: any) => [e.course_id, e.role === "author" ? "author" : "learner"] as const),
      );

      // Modules, then items, then progress: three reads for the whole shelf
      // rather than three per course.
      const { data: modules } = await db
        .from("learning_modules")
        .select("id, course_id")
        .in("course_id", ids);
      const moduleIds = (modules ?? []).map((m: any) => m.id);
      const { data: items } = moduleIds.length
        ? await db
            .from("learning_items")
            .select("id, module_id, kind, visible, payload")
            .in("module_id", moduleIds)
        : { data: [] };
      const itemIds = (items ?? []).map((i: any) => i.id);
      const { data: progress } = itemIds.length
        ? await db.from("learning_item_progress").select("item_id, state").in("item_id", itemIds)
        : { data: [] };

      const courseOfModule = new Map<string, string>(
        (modules ?? []).map((m: any) => [m.id, m.course_id] as [string, string]),
      );
      const complete = new Set(
        (progress ?? []).filter((p: any) => p.state === "complete").map((p: any) => p.item_id),
      );

      const tally = new Map<
        string,
        { done: number; total: number; seconds: number; left: number }
      >();
      const moduleCount = new Map<string, number>();
      for (const m of modules ?? [])
        moduleCount.set(m.course_id, (moduleCount.get(m.course_id) ?? 0) + 1);
      const fileCount = new Map<string, number>();
      for (const row of items ?? []) {
        const c = courseOfModule.get(row.module_id);
        const n = readBlocks(row.payload).filter((b) => b.media).length;
        if (c && n) fileCount.set(c, (fileCount.get(c) ?? 0) + n);
      }
      for (const row of items ?? []) {
        if (row.visible === false || row.kind === "folder") continue;
        const courseId = courseOfModule.get(row.module_id);
        if (!courseId) continue;
        const cell = tally.get(courseId) ?? { done: 0, total: 0, seconds: 0, left: 0 };
        const seconds = estimateBlocks(readBlocks(row.payload)).total;
        cell.total += 1;
        cell.seconds += seconds;
        if (complete.has(row.id)) cell.done += 1;
        else cell.left += seconds;
        tally.set(courseId, cell);
      }

      return (courses ?? []).map((row: any) => {
        const cell = tally.get(row.id) ?? { done: 0, total: 0, seconds: 0, left: 0 };
        const role = roleOf.get(row.id) ?? null;
        return {
          ...toCourse(row),
          done: cell.done,
          total: cell.total,
          seconds: cell.seconds,
          secondsLeft: cell.left,
          modules: moduleCount.get(row.id) ?? 0,
          files: fileCount.get(row.id) ?? 0,
          role,
          authoring: role === "author" || row.created_by === me,
        };
      });
    },
  });
}

// ------------------------------------------------------------ one course --

export type CourseFile = {
  course: Course;
  menu: MenuEntry[];
  modules: Module[];
  items: Item[];
  progress: ItemProgress[];
  enrolment: Enrolment | null;
};

export const courseKey = (courseId: string | null) => ["learning", "course", courseId];

export function useCourse(courseId: string | null) {
  return useQuery({
    queryKey: courseKey(courseId),
    enabled: !!courseId,
    queryFn: async (): Promise<CourseFile | null> => {
      const { data: course, error } = await db
        .from("learning_courses")
        .select("*")
        .eq("id", courseId)
        .maybeSingle();
      if (error) throw error;
      if (!course) return null;

      const [menu, modules, enrolment] = await Promise.all([
        db.from("learning_menu_entries").select("*").eq("course_id", courseId).order("position"),
        db.from("learning_modules").select("*").eq("course_id", courseId).order("position"),
        db.from("learning_enrolments").select("*").eq("course_id", courseId).maybeSingle(),
      ]);

      const moduleIds = (modules.data ?? []).map((m: any) => m.id);
      const { data: items } = moduleIds.length
        ? await db.from("learning_items").select("*").in("module_id", moduleIds).order("position")
        : { data: [] };

      const itemIds = (items ?? []).map((i: any) => i.id);
      const { data: progress } = itemIds.length
        ? await db.from("learning_item_progress").select("*").in("item_id", itemIds)
        : { data: [] };

      return {
        course: toCourse(course),
        menu: (menu.data ?? []).map(toMenuEntry),
        modules: (modules.data ?? []).map(toModule),
        items: (items ?? []).map(toItem),
        progress: (progress ?? []).map(toProgress),
        enrolment: enrolment.data ? toEnrolment(enrolment.data) : null,
      };
    },
  });
}

// ---------------------------------------------------------------- writes --

/**
 * One past the highest position among the rows the query selects, read at the
 * moment of writing. The screen's copy may be a save behind when names are
 * added in quick succession, and two rows at one position sort by id.
 */
async function nextPosition(query: any): Promise<number> {
  const { data, error } = await query.order("position", { ascending: false }).limit(1);
  if (error) throw error;
  const top = data?.[0]?.position;
  return typeof top === "number" ? top + 1 : 0;
}

export function useLearningActions(workspaceId: string | null, courseId: string | null) {
  const qc = useQueryClient();
  // Returned, so each write resolves only once the screens have re-read: a
  // page opened straight after a write never shows the list from before it.
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: learningKey(workspaceId) }),
      qc.invalidateQueries({ queryKey: courseKey(courseId) }),
    ]);

  /**
   * Mark complete, and only ever by explicit action. There is no call here
   * that sets completion from a scroll position or a timer, because there is
   * no such thing as having read something because a page was open.
   */
  const setComplete = useMutation({
    mutationFn: async ({ itemId, complete }: { itemId: string; complete: boolean }) => {
      const { error } = await db.from("learning_item_progress").upsert(
        {
          item_id: itemId,
          state: complete ? "complete" : "started",
          completed_on: complete ? new Date().toISOString() : null,
        },
        { onConflict: "person_id,item_id" },
      );
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const createCourse = useMutation({
    mutationFn: async (fields: {
      title: string;
      subtitle?: string;
      visibility: CourseVisibility;
      cpdHours?: number;
      endsOn?: string | null;
    }) => {
      const { data, error } = await db
        .from("learning_courses")
        .insert({
          workspace_id: workspaceId,
          title: fields.title,
          subtitle: fields.subtitle ?? "",
          visibility: fields.visibility,
          // A self course carries no hours; the database refuses them anyway.
          cpd_hours: fields.visibility === "self" ? 0 : (fields.cpdHours ?? 0),
          ends_on: fields.endsOn ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      // The author is enrolled as an author, so the course is theirs to change
      // from the same screens a learner reads it in.
      await db.from("learning_enrolments").insert({ course_id: data.id, role: "author" });
      return toCourse(data);
    },
    onSuccess: refresh,
  });

  const addModule = useMutation({
    mutationFn: async (fields: { courseId: string; title: string }) => {
      const position = await nextPosition(
        db.from("learning_modules").select("position").eq("course_id", fields.courseId),
      );
      const { data, error } = await db
        .from("learning_modules")
        .insert({ course_id: fields.courseId, title: fields.title, position })
        .select()
        .single();
      if (error) throw error;
      return toModule(data);
    },
    onSuccess: refresh,
  });

  const saveOutline = useMutation({
    mutationFn: async (fields: { moduleId: string; outline: OutlineLine[] }) => {
      const { error } = await db
        .from("learning_modules")
        .update({ outline: outlineToJson(fields.outline) })
        .eq("id", fields.moduleId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const addItem = useMutation({
    mutationFn: async (fields: {
      moduleId: string;
      parentItemId?: string | null;
      kind: ItemKind;
      title: string;
      outlineLineId?: string | null;
    }) => {
      const siblings = db
        .from("learning_items")
        .select("position")
        .eq("module_id", fields.moduleId);
      const position = await nextPosition(
        fields.parentItemId
          ? siblings.eq("parent_item_id", fields.parentItemId)
          : siblings.is("parent_item_id", null),
      );
      const { data, error } = await db
        .from("learning_items")
        .insert({
          module_id: fields.moduleId,
          parent_item_id: fields.parentItemId ?? null,
          kind: fields.kind,
          title: fields.title,
          position,
          outline_line_id: fields.outlineLineId ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return toItem(data);
    },
    onSuccess: refresh,
  });

  /** Course details. Only the fields passed are written. */
  const updateCourse = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      title?: string;
      subtitle?: string;
      visibility?: CourseVisibility;
      cpdHours?: number;
      endsOn?: string | null;
      archived?: boolean;
      published?: boolean;
      coverPath?: string | null;
      coverCredit?: string;
    }) => {
      const row: Record<string, unknown> = {};
      if (patch.published !== undefined) {
        row["published_at"] = patch.published ? new Date().toISOString() : null;
      }
      if (patch.title !== undefined) row["title"] = patch.title;
      if (patch.subtitle !== undefined) row["subtitle"] = patch.subtitle;
      if (patch.visibility !== undefined) {
        row["visibility"] = patch.visibility;
        if (patch.visibility === "self") row["cpd_hours"] = 0;
      }
      if (patch.cpdHours !== undefined) row["cpd_hours"] = patch.cpdHours;
      if (patch.endsOn !== undefined) row["ends_on"] = patch.endsOn;
      if (patch.coverPath !== undefined) row["cover_path"] = patch.coverPath;
      if (patch.coverCredit !== undefined) row["cover_credit"] = patch.coverCredit;
      if (patch.archived !== undefined) {
        row["archived_at"] = patch.archived ? new Date().toISOString() : null;
      }
      const { error } = await db.from("learning_courses").update(row).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  /** Gone for good, with everything in it: modules, items and progress cascade. */
  const deleteCourse = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("learning_courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const updateModule = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      title?: string;
      cpdHours?: number;
      published?: boolean;
      coverPath?: string | null;
      coverCredit?: string;
    }) => {
      const row: Record<string, unknown> = {};
      if (patch.title !== undefined) row["title"] = patch.title;
      if (patch.cpdHours !== undefined) row["cpd_hours"] = patch.cpdHours;
      if (patch.coverPath !== undefined) row["cover_path"] = patch.coverPath;
      if (patch.coverCredit !== undefined) row["cover_credit"] = patch.coverCredit;
      if (patch.published !== undefined) {
        row["published_at"] = patch.published ? new Date().toISOString() : null;
      }
      const { error } = await db.from("learning_modules").update(row).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const deleteModule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("learning_modules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  /** Swap a module with its neighbour. Positions are the only thing written. */
  const moveModule = useMutation({
    mutationFn: async ({
      modules,
      moduleId,
      by,
    }: {
      modules: Module[];
      moduleId: string;
      by: -1 | 1;
    }) => {
      const ordered = [...modules].sort((a, b) => a.position - b.position);
      const index = ordered.findIndex((m) => m.id === moduleId);
      const a = ordered[index];
      const b = ordered[index + by];
      if (!a || !b) return;
      // Equal positions would swap to the same values; write the list index instead.
      await Promise.all([
        db
          .from("learning_modules")
          .update({ position: index + by })
          .eq("id", a.id),
        db.from("learning_modules").update({ position: index }).eq("id", b.id),
      ]);
    },
    onSuccess: refresh,
  });

  const updateItem = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      title?: string;
      payload?: unknown;
      outlineLineId?: string | null;
    }) => {
      const row: Record<string, unknown> = {};
      if (patch.title !== undefined) row["title"] = patch.title;
      if (patch.payload !== undefined) row["payload"] = patch.payload;
      if (patch.outlineLineId !== undefined) row["outline_line_id"] = patch.outlineLineId;
      const { error } = await db.from("learning_items").update(row).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  /** Children of a folder go with it; the database cascades them. */
  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("learning_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const setItemVisible = useMutation({
    mutationFn: async ({ itemId, visible }: { itemId: string; visible: boolean }) => {
      const { error } = await db.from("learning_items").update({ visible }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  /**
   * Move an item among its siblings. Only positions are written: no number is
   * stored anywhere, so nothing else has to be rewritten to follow it.
   */
  const moveItem = useMutation({
    mutationFn: async ({
      siblings,
      itemId,
      by,
    }: {
      siblings: Item[];
      itemId: string;
      by: -1 | 1;
    }) => {
      const ordered = [...siblings].sort((a, b) => a.position - b.position);
      const index = ordered.findIndex((i) => i.id === itemId);
      const target = index + by;
      if (index < 0 || target < 0 || target >= ordered.length) return;
      const a = ordered[index];
      const b = ordered[target];
      if (!a || !b) return;
      await Promise.all([
        db.from("learning_items").update({ position: b.position }).eq("id", a.id),
        db.from("learning_items").update({ position: a.position }).eq("id", b.id),
      ]);
    },
    onSuccess: refresh,
  });

  const enrol = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("learning_enrolments").insert({ course_id: id });
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: refresh,
  });

  return {
    setComplete,
    createCourse,
    addModule,
    saveOutline,
    addItem,
    updateCourse,
    deleteCourse,
    updateModule,
    deleteModule,
    moveModule,
    updateItem,
    deleteItem,
    setItemVisible,
    moveItem,
    enrol,
    refresh,
  };
}
