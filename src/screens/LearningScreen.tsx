/**
 * Learning — the study and training portal.
 *
 * One screen for the whole column. The course menu stays mounted while the
 * page beside it changes, which is what a course menu is for: you should be
 * able to see where you are in the course while reading any part of it.
 *
 * Learner and author are a mode on the same routes rather than two trees. The
 * item list, the numbering and the outline are rendered by the same components
 * either way — the mode decides which controls appear, and nothing else.
 */
import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import AppShell, { Crumbs } from "@/components/AppShell";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { useApp } from "@/store/app";
import { useCourse, useCourses, useLearningActions } from "@/learning/db";
import { CourseMenu } from "@/learning/CourseMenu";
import { CourseHome } from "@/learning/areas/CourseHome";
import { ModulePage } from "@/learning/areas/ModulePage";
import { ItemView } from "@/learning/areas/ItemView";
import { ItemEditor } from "@/learning/areas/ItemEditor";
import { NewCourseDialog } from "@/learning/authoring";
import {
  courseMediaPaths,
  relocateCourseMedia,
  relocateCover,
  removeMedia,
  uploadMedia,
} from "@/learning/media";
import { DeleteCourseDialog, type CourseSize } from "@/learning/DeleteCourse";
import { applyStructuredCourse } from "@/learning/template";
import { readBlocks } from "@/learning/blocks";
import { SHELF_VIEWS, ShelfPage, ShelfPanel, type ShelfView } from "@/learning/Shelf";
import { indexProgress, standing, type Item, type OutlineLine } from "@/learning/model";
import "@/learning/learning.css";

export default function LearningScreen({
  courseId = null,
  moduleId = null,
  itemId = null,
}: {
  courseId?: string | null;
  moduleId?: string | null;
  itemId?: string | null;
}) {
  const { workspaceId } = useApp();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { mode?: string; view?: string };
  const [creating, setCreating] = useState(false);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const [deleting, setDeleting] = useState<null | {
    id: string;
    size: CourseSize;
    archived: boolean;
  }>(null);

  const courses = useCourses(workspaceId);
  const course = useCourse(courseId);
  const actions = useLearningActions(workspaceId, courseId);

  const file = course.data ?? null;
  const canAuthor =
    file?.enrolment?.role === "author" ||
    (!!file && courses.data?.find((c) => c.id === courseId)?.authoring === true);
  const authoring = canAuthor && search.mode === "authoring";

  const go = (to: string) => navigate({ to, search: search.mode ? { mode: search.mode } : {} });
  const openCourse = (id: string, author = false) =>
    navigate({ to: `/learning/c/${id}`, search: author ? { mode: "authoring" } : {} });
  const openModule = (id: string) => go(`/learning/c/${courseId}/m/${id}`);
  const openItem = (id: string) => go(`/learning/c/${courseId}/i/${id}`);

  /** Rename and detail writes report success to EditableName rather than throwing. */
  const saved = async (write: Promise<unknown>) => {
    try {
      await write;
      return true;
    } catch {
      return false;
    }
  };

  /** Gone for good, with the files it stored. */
  const deleteFully = async (id: string) => {
    const paths = await courseMediaPaths(id);
    await actions.deleteCourse.mutateAsync(id);
    void removeMedia(paths);
    if (courseId === id) navigate({ to: "/learning", search: {} });
  };

  /**
   * An empty course (no modules) goes at once: nothing can be lost. Anything
   * more takes two steps: a warning that offers archiving, then the name typed.
   */
  const requestDelete = (id: string, size: CourseSize, archived: boolean) => {
    if (size.modules === 0) void deleteFully(id);
    else setDeleting({ id, size, archived });
  };

  const deleteDialog = deleting ? (
    <DeleteCourseDialog
      course={deleting.size}
      archived={deleting.archived}
      onClose={() => setDeleting(null)}
      onArchive={async () => {
        await actions.updateCourse.mutateAsync({ id: deleting.id, archived: true });
        navigate({ to: "/learning", search: { view: "archived" } });
      }}
      onDelete={() => deleteFully(deleting.id)}
    />
  ) : null;

  const newCourse = (
    <NewCourseDialog
      open={creating}
      onClose={() => setCreating(false)}
      onCreate={async (fields) => {
        const { template, ...course } = fields;
        const created = await actions.createCourse.mutateAsync(course);
        if (template) {
          await applyStructuredCourse(created.id, template);
          await actions.refresh();
        }
        // Straight into writing it: a new course is only ever opened to be built.
        openCourse(created.id, true);
      }}
    />
  );

  // --------------------------------------------------------- the shelf --

  if (!courseId) {
    const list = courses.data ?? [];
    const view: ShelfView = SHELF_VIEWS.includes(search.view as ShelfView)
      ? (search.view as ShelfView)
      : "overview";
    return (
      <AppShell
        section="learning"
        breadcrumb={<Crumbs items={[{ label: "Learning" }]} />}
        trackLabel="Learning"
        /* Learning keeps its own column whether or not a course is open: with
           one it is the course menu, without one it is the section's menu. */
        panel={
          <ShelfPanel
            list={list}
            view={view}
            onSelect={(next) =>
              navigate({ to: "/learning", search: next === "overview" ? {} : { view: next } })
            }
          />
        }
      >
        <div className="lr">
          <div className="lr-main">
            <ShelfPage
              list={list}
              loading={courses.isLoading}
              view={view}
              onOpen={(c, author) => openCourse(c.id, author)}
              onNewCourse={() => setCreating(true)}
              onEnrol={(c) => actions.enrol.mutate(c.id)}
              onRestore={(c) => actions.updateCourse.mutate({ id: c.id, archived: false })}
              onDelete={(c) =>
                requestDelete(
                  c.id,
                  { title: c.title, modules: c.modules, items: c.total, files: c.files },
                  !!c.archivedAt,
                )
              }
            />
          </div>
        </div>
        {newCourse}
        {confirmDialog}
        {deleteDialog}
      </AppShell>
    );
  }

  // -------------------------------------------------------- one course --

  // Learning / course / module / item: every level above the page is a way back.
  const crumbItem = itemId ? file?.items.find((i) => i.id === itemId) : undefined;
  const crumbModuleId = crumbItem?.moduleId ?? moduleId;
  const crumbModule = crumbModuleId ? file?.modules.find((m) => m.id === crumbModuleId) : undefined;
  const crumbs = [
    { label: "Learning", to: "/learning" },
    ...(file
      ? [
          {
            label: file.course.title || "Untitled course",
            ...(crumbModule ? { onClick: () => void go(`/learning/c/${courseId}`) } : {}),
          },
        ]
      : []),
    ...(crumbModule
      ? [
          {
            label: crumbModule.title || "Untitled module",
            ...(crumbItem ? { onClick: () => void openModule(crumbModule.id) } : {}),
          },
        ]
      : []),
    ...(crumbItem ? [{ label: crumbItem.title || "Untitled item" }] : []),
  ];

  const body = () => {
    if (course.isLoading)
      return (
        <div className="lr-page">
          <div className="lr-empty">Loading…</div>
        </div>
      );
    if (!file) {
      return (
        <div className="lr-page">
          <div className="lr-empty">That course is not open to you.</div>
        </div>
      );
    }

    if (itemId && authoring) {
      const item = file.items.find((i) => i.id === itemId);
      return (
        <ItemEditor
          file={file}
          itemId={itemId}
          onOpenItem={openItem}
          onOpenModule={openModule}
          onRename={(title) => saved(actions.updateItem.mutateAsync({ id: itemId, title }))}
          onSaveBlocks={async (blocks) => {
            await actions.updateItem.mutateAsync({ id: itemId, payload: { blocks } });
          }}
          onUpload={(upload) =>
            uploadMedia(upload, {
              workspaceId: file.course.workspaceId,
              courseId,
              itemId,
              visibility: file.course.visibility,
            })
          }
          onRemoveMedia={(path) => void removeMedia([path])}
          onDelete={async () => {
            if (!item) return;
            if (
              await confirmDelete({
                what: `“${item.title || "Untitled item"}”`,
                archivable: false,
                binned: false,
              })
            ) {
              await unbind(item.moduleId, [item.id]);
              await actions.deleteItem.mutateAsync(item.id);
              void removeMedia(mediaPaths([item]));
              openModule(item.moduleId);
            }
          }}
        />
      );
    }

    if (itemId) {
      return (
        <ItemView
          file={file}
          itemId={itemId}
          onOpenItem={openItem}
          onOpenModule={openModule}
          saving={actions.setComplete.isPending}
          onSetComplete={(id, complete) => actions.setComplete.mutate({ itemId: id, complete })}
        />
      );
    }

    if (moduleId) {
      return (
        <ModulePage
          file={file}
          moduleId={moduleId}
          authoring={authoring}
          onOpenItem={openItem}
          onToggleVisible={(item) =>
            actions.setItemVisible.mutate({ itemId: item.id, visible: !item.visible })
          }
          onMove={(item, by, siblings) =>
            actions.moveItem.mutate({ siblings, itemId: item.id, by })
          }
          onAddItem={(kind, title, parentItemId) => {
            // Position is the only ordering fact written down; the number the
            // row shows is worked out from it on the way back.
            return actions.addItem.mutateAsync({
              moduleId,
              ...(parentItemId ? { parentItemId } : {}),
              kind,
              title,
            });
          }}
          onWriteLine={async (line, title) => {
            const module = file.modules.find((m) => m.id === moduleId);
            if (!module) return;
            const created = await actions.addItem.mutateAsync({
              moduleId,
              kind: "item",
              title,
              outlineLineId: line.id,
            });
            await actions.saveOutline.mutateAsync({
              moduleId,
              outline: module.outline.map((l) =>
                l.id === line.id ? { ...l, itemId: created.id } : l,
              ),
            });
            openItem(created.id);
          }}
          onRename={(title) => saved(actions.updateModule.mutateAsync({ id: moduleId, title }))}
          onUploadCover={(picked) =>
            uploadMedia(picked, {
              workspaceId: file.course.workspaceId,
              courseId,
              itemId: `module-${moduleId}`,
              visibility: file.course.visibility,
            }).then((media) => media.path)
          }
          onSaveCover={(patch) =>
            saved(actions.updateModule.mutateAsync({ id: moduleId, ...patch }))
          }
          onSaveOutline={async (outline: OutlineLine[]) => {
            await actions.saveOutline.mutateAsync({ moduleId, outline });
          }}
          onPublish={(published) => actions.updateModule.mutate({ id: moduleId, published })}
          onDeleteItem={async (item) => {
            const children = file.items.filter((i) => i.parentItemId === item.id);
            if (
              await confirmDelete({
                what: `“${item.title || "Untitled item"}”`,
                ...(children.length > 0
                  ? {
                      consequence: `The ${children.length} ${children.length === 1 ? "item" : "items"} inside it go too.`,
                    }
                  : {}),
                archivable: false,
                binned: false,
              })
            ) {
              await unbind(moduleId, [item.id, ...children.map((c) => c.id)]);
              await actions.deleteItem.mutateAsync(item.id);
              void removeMedia(mediaPaths([item, ...children]));
            }
          }}
          onDeleteModule={async () => {
            const module = file.modules.find((m) => m.id === moduleId);
            const count = file.items.filter((i) => i.moduleId === moduleId).length;
            if (
              await confirmDelete({
                what: `“${module?.title || "Untitled module"}”`,
                ...(count > 0
                  ? {
                      consequence: `Its outline and ${count} ${count === 1 ? "item" : "items"} go with it.`,
                    }
                  : {}),
                archivable: false,
                binned: false,
              })
            ) {
              await actions.deleteModule.mutateAsync(moduleId);
              void removeMedia([
                ...mediaPaths(file.items.filter((i) => i.moduleId === moduleId)),
                ...(module?.coverPath ? [module.coverPath] : []),
              ]);
              go(`/learning/c/${courseId}`);
            }
          }}
        />
      );
    }

    return (
      <CourseHome
        file={file}
        authoring={authoring}
        onOpenModule={openModule}
        onOpenItem={openItem}
        onAddModule={(title) => actions.addModule.mutateAsync({ courseId, title })}
        onMoveModule={(id, by) =>
          actions.moveModule.mutate({ modules: file.modules, moduleId: id, by })
        }
        onSaveTeam={async (id, blocks) => {
          await actions.updateItem.mutateAsync({ id, payload: { blocks } });
        }}
        onUploadTeam={(upload, id) =>
          uploadMedia(upload, {
            workspaceId: file.course.workspaceId,
            courseId,
            itemId: id,
            visibility: file.course.visibility,
          })
        }
        onUploadCover={(picked) =>
          uploadMedia(picked, {
            workspaceId: file.course.workspaceId,
            courseId,
            itemId: "cover",
            visibility: file.course.visibility,
          }).then((media) => media.path)
        }
        onUpdate={(patch) =>
          saved(
            (async () => {
              // Files follow the course's privacy, and move before it changes.
              if (patch.visibility && patch.visibility !== file.course.visibility) {
                const moved = await relocateCourseMedia(file.items, {
                  workspaceId: file.course.workspaceId,
                  courseId,
                  to: patch.visibility,
                });
                for (const row of moved) {
                  await actions.updateItem.mutateAsync({ id: row.id, payload: row.payload });
                }
                for (const m of file.modules) {
                  if (!m.coverPath) continue;
                  const moved = await relocateCover(m.coverPath, {
                    workspaceId: file.course.workspaceId,
                    courseId,
                    to: patch.visibility,
                  });
                  if (moved !== m.coverPath)
                    await actions.updateModule.mutateAsync({ id: m.id, coverPath: moved });
                }
                if (file.course.coverPath) {
                  patch = {
                    ...patch,
                    coverPath: await relocateCover(file.course.coverPath, {
                      workspaceId: file.course.workspaceId,
                      courseId,
                      to: patch.visibility,
                    }),
                  };
                }
              }
              await actions.updateCourse.mutateAsync({ id: courseId, ...patch });
            })(),
          )
        }
        onArchive={async () => {
          await actions.updateCourse.mutateAsync({ id: courseId, archived: true });
          navigate({ to: "/learning", search: { view: "archived" } });
        }}
        onDelete={() =>
          requestDelete(
            courseId,
            {
              title: file.course.title,
              modules: file.modules.length,
              items: file.items.length,
              files: mediaPaths(file.items).length,
            },
            !!file.course.archivedAt,
          )
        }
      />
    );
  };

  /** An outline line answered by an item that is going stops pointing at it. */
  const unbind = async (fromModuleId: string, itemIds: string[]) => {
    const module = file?.modules.find((m) => m.id === fromModuleId);
    if (!module || !module.outline.some((l) => l.itemId && itemIds.includes(l.itemId))) return;
    await actions.saveOutline.mutateAsync({
      moduleId: fromModuleId,
      outline: module.outline.map((l) =>
        l.itemId && itemIds.includes(l.itemId) ? { ...l, itemId: null } : l,
      ),
    });
  };

  const activeRef = itemId ?? moduleId;
  const overall = file
    ? standing(file.items, indexProgress(file.progress))
    : { done: 0, total: 0, percent: 0 };

  return (
    <AppShell
      section="learning"
      breadcrumb={<Crumbs items={crumbs} />}
      trackLabel="Learning"
      panel={
        file ? (
          <CourseMenu
            file={file}
            activeRef={activeRef}
            authoring={authoring}
            onOpen={(t) => (t.kind === "module" ? openModule(t.id) : openItem(t.id))}
            onHome={() => go(`/learning/c/${courseId}`)}
            onBack={() => navigate({ to: "/learning", search: {} })}
          />
        ) : (
          // Held open while the course loads, so the page does not jump sideways.
          <nav className="lr-menu lr-dark" aria-label="Course menu" />
        )
      }
      actions={
        canAuthor ? (
          <div style={{ display: "flex", gap: 6 }}>
            {/* The mode changes; the page you are on does not. Switching to
                authoring on a module has to leave you on that module. */}
            <button
              type="button"
              className="lr-btn"
              data-primary={!authoring ? "true" : undefined}
              onClick={() => navigate({ to: ".", search: {} })}
            >
              Learner
            </button>
            <button
              type="button"
              className="lr-btn"
              data-primary={authoring ? "true" : undefined}
              onClick={() => navigate({ to: ".", search: { mode: "authoring" } })}
            >
              Authoring
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="lr">
        <div className="lr-main">{body()}</div>
      </div>
      {confirmDialog}
      {deleteDialog}
    </AppShell>
  );
}

/** Every stored file the items point at. */
function mediaPaths(items: Item[]): string[] {
  return items.flatMap((item) =>
    readBlocks(item.payload).flatMap((b) => (b.media ? [b.media.path] : [])),
  );
}
