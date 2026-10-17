/**
 * Learning media: recordings, videos, diagrams and slide decks in a course.
 *
 * Files live where the course's privacy says, the way Library keeps its
 * files. A lawyer's own reading keeps its media on their personal path, which
 * nobody else can read; firm training keeps it on the course's path, which the
 * workspace can. Changing a course from one to the other moves the files with
 * it, so a firm course never points at a file its learners cannot open.
 *
 * Nothing stores a link. The path is kept on the block and a short-lived
 * signed link is made when the block is shown.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mediaKindOf, readBlocks, type Media } from "./blocks";
import type { CourseVisibility, Item } from "./model";

const BUCKET = "matter-documents";

/** The bucket's own ceiling. A larger file is refused before it is sent. */
export const MAX_MEDIA_BYTES = 25_000_000;

const safeName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-80) || "file";

export function mediaPath(input: {
  workspaceId: string;
  userId: string;
  courseId: string;
  itemId: string;
  name: string;
  visibility: CourseVisibility;
}): string {
  const file = `${crypto.randomUUID().slice(0, 8)}-${safeName(input.name)}`;
  return input.visibility === "self"
    ? `${input.workspaceId}/personal/${input.userId}/learning/${input.courseId}/${input.itemId}/${file}`
    : `${input.workspaceId}/learning/${input.courseId}/${input.itemId}/${file}`;
}

export async function uploadMedia(
  file: File,
  where: {
    workspaceId: string;
    courseId: string;
    itemId: string;
    visibility: CourseVisibility;
  },
): Promise<Media> {
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error(
      `${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. Files up to ${MAX_MEDIA_BYTES / 1_000_000} MB can be added.`,
    );
  }
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) throw new Error("Sign in again to add files.");
  const path = mediaPath({ ...where, userId, name: file.name });
  // Browsers leave the type blank, or call it a generic stream of bytes, for
  // some files (.m4a among them), and a player refuses a recording stored so.
  const mime =
    file.type && file.type !== "application/octet-stream" ? file.type : mimeFromName(file.name);
  // The upload is sent as form data, and storage takes the type from the file
  // part rather than from the option, so the file itself must carry it.
  const typed = file.type === mime ? file : new File([file], file.name, { type: mime });
  const { error } = await supabase.storage.from(BUCKET).upload(path, typed, { contentType: mime });
  if (error) throw error;
  const kind = mediaKindOf(mime, file.name);
  const seconds = kind === "audio" || kind === "video" ? await runningTime(typed, kind) : null;
  const pages = kind === "pdf" ? await countPages(typed) : null;
  return {
    kind,
    path,
    name: file.name,
    mime,
    bytes: file.size,
    ...(seconds ? { seconds } : {}),
    ...(pages ? { pages } : {}),
  };
}

/**
 * How long a recording runs, read from the file itself, so the course can say
 * "27 min listen" without anybody typing it. Gives up quietly after a few
 * seconds; the player reports it later if this could not.
 */
function runningTime(file: File, kind: "audio" | "video"): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), 5000);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      window.clearTimeout(timer);
      done(Number.isFinite(el.duration) ? Math.round(el.duration) : null);
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    el.src = url;
  });
}

/** Pages in a PDF, counted from its page objects; a close figure is enough for timing. */
async function countPages(file: File): Promise<number | null> {
  try {
    const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
    const n = (text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export function mimeFromName(name: string): string {
  return MIME_BY_EXTENSION[name.toLowerCase().split(".").pop() ?? ""] ?? "application/octet-stream";
}

/** A link to play or show a file, renewed well before it lapses. */
export function useMediaUrl(path: string | null) {
  return useQuery({
    queryKey: ["learning", "media-url", path],
    enabled: !!path,
    staleTime: 45 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/** Remove files nothing points at any more. Failures are ignored: an orphan costs storage, not access. */
export async function removeMedia(paths: string[]) {
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

/**
 * Move every file in a course to where its new privacy keeps it, and return
 * the items whose payload now names new paths. Called before the course's
 * visibility is written, so a failed move leaves the course as it was.
 */
export async function relocateCourseMedia(
  items: Item[],
  input: { workspaceId: string; courseId: string; to: CourseVisibility },
): Promise<{ id: string; payload: unknown }[]> {
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) throw new Error("Sign in again to change who the course is for.");
  const changed: { id: string; payload: unknown }[] = [];
  for (const item of items) {
    const blocks = readBlocks(item.payload);
    if (!blocks.some((b) => b.media)) continue;
    const next = [];
    for (const block of blocks) {
      if (!block.media) {
        next.push(block);
        continue;
      }
      const file = block.media.path.split("/").pop() ?? safeName(block.media.name);
      const to =
        input.to === "self"
          ? `${input.workspaceId}/personal/${userId}/learning/${input.courseId}/${item.id}/${file}`
          : `${input.workspaceId}/learning/${input.courseId}/${item.id}/${file}`;
      if (to !== block.media.path) {
        const { error } = await supabase.storage.from(BUCKET).move(block.media.path, to);
        if (error) throw error;
      }
      next.push({ ...block, media: { ...block.media, path: to } });
    }
    changed.push({ id: item.id, payload: { ...(item.payload as object), blocks: next } });
  }
  return changed;
}

/**
 * Move one of a course's own files (a course or module cover) to where the
 * course's privacy `to` keeps it: the part after the course's folder is kept,
 * only the folder changes. Returns the path unchanged when it is already there.
 */
export async function relocateCover(
  path: string,
  input: { workspaceId: string; courseId: string; to: CourseVisibility },
): Promise<string> {
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) throw new Error("Sign in again to change who the course is for.");
  const marker = `/learning/${input.courseId}/`;
  const at = path.indexOf(marker);
  const tail = at >= 0 ? path.slice(at + marker.length) : `cover/${path.split("/").pop()}`;
  const to =
    input.to === "self"
      ? `${input.workspaceId}/personal/${userId}/learning/${input.courseId}/${tail}`
      : `${input.workspaceId}/learning/${input.courseId}/${tail}`;
  if (to === path) return path;
  const { error } = await supabase.storage.from(BUCKET).move(path, to);
  if (error) throw error;
  return to;
}

/** Every stored file a course's items point at, read fresh before the course is deleted. */
export async function courseMediaPaths(courseId: string): Promise<string[]> {
  const db = supabase as unknown as { from: (t: string) => any };
  const { data: course } = await db
    .from("learning_courses")
    .select("cover_path")
    .eq("id", courseId)
    .maybeSingle();
  const cover: string[] = course?.cover_path ? [course.cover_path] : [];
  const { data: modules } = await db
    .from("learning_modules")
    .select("id, cover_path")
    .eq("course_id", courseId);
  const ids = (modules ?? []).map((m: { id: string }) => m.id);
  cover.push(
    ...(modules ?? [])
      .map((m: { cover_path: string | null }) => m.cover_path)
      .filter((p: string | null): p is string => !!p),
  );
  if (ids.length === 0) return cover;
  const { data: items } = await db.from("learning_items").select("payload").in("module_id", ids);
  return cover.concat(
    (items ?? []).flatMap((i: { payload: unknown }) =>
      readBlocks(i.payload).flatMap((b) => [
        ...(b.media ? [b.media.path] : []),
        ...(b.photo ? [b.photo.path] : []),
      ]),
    ),
  );
}
