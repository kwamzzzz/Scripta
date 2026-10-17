/**
 * Recording something before it is forgotten, from wherever you are.
 *
 * A lawyer three clicks into a review who remembers they owe somebody a call
 * will not navigate to Tasks to write it down; they will mean to, and then
 * they will not. So the box opens over whatever is on screen, takes a name,
 * and closes. Everything else about the task is decided later, on a task that
 * exists.
 *
 * It knows the matter you were looking at, because that is context Scripta
 * already has and would otherwise make you retype.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import { useApp } from "@/store/app";
import { quickAdd } from "@/lib/tasks/data";
import { suggestTool } from "@/lib/tasks/model";
import "./quick-task.css";

export function QuickTask({
  open,
  matterId,
  matterName,
  onClose,
}: {
  open: boolean;
  matterId?: string | null;
  matterName?: string;
  onClose: () => void;
}) {
  const { workspaceId } = useApp();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setSaved(null);
    }
  }, [open]);

  const add = useMutation({
    mutationFn: () => quickAdd(workspaceId!, { title, matterId: matterId ?? null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
      // Confirmed, not just dismissed: the whole value is trusting it landed.
      setSaved(title);
      setTitle("");
      box.current?.focus();
    },
  });

  if (!open) return null;
  const tool = suggestTool(title);

  return (
    <Modal open onClose={onClose} label="Add a task">
      <form
        className="qt"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) add.mutate();
        }}
      >
        <div className="qt-head">
          <strong>Add a task</strong>
          {matterName && <span>on {matterName}</span>}
        </div>
        <input
          ref={box}
          value={title}
          autoFocus
          placeholder="Prepare WAGAS advisory proposal"
          aria-label="Task name"
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="qt-foot">
          <span>
            {add.isError
              ? (add.error as Error).message
              : saved
                ? `Added “${saved}”. Add another, or press Escape.`
                : tool
                  ? `Scripta will offer ${tool.short}.`
                  : "A name is enough. The rest can wait."}
          </span>
          <Button variant="primary" type="submit" disabled={!title.trim() || add.isPending}>
            {add.isPending ? "Adding…" : "Add"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Ctrl/Cmd+I from anywhere. Returns the open state for the shell to render. */
export function useQuickTask() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return { open, show: () => setOpen(true), close: () => setOpen(false) };
}
