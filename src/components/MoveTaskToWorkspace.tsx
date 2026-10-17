/**
 * Filing an unfiled task under a different workspace.
 *
 * Only an UNFILED one. A task attached to a matter is part of that matter's
 * file, and `matter_flows.matter_id` being NOT NULL makes the same point about
 * flows: "this task is in workspace A, the work it is about is in workspace B"
 * is not a state worth being able to reach. The server refuses it, and this
 * dialog explains it rather than offering a button that will fail.
 *
 * There is no preview here, unlike a matter. An unfiled task carries nothing
 * with it and is visible to its author alone, so there is nobody to warn about
 * and nothing to count.
 *
 * `.mt-dialog` is the card because `Modal` draws only the backdrop, and its
 * colours are literal fallbacks because a <dialog> portals outside the token
 * scope.
 */
import { useState } from "react";
import { Building2, Check } from "lucide-react";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import { useAdministeredWorkspaces, useMoveTask } from "@/lib/workspace-move";
import "./matter-team.css";

const MUTED = "var(--scripta-muted, #626c70)";
const INK = "var(--scripta-ink, #123247)";
const RULE = "var(--scripta-rule, #dee0d9)";
const TEAL = "var(--scripta-teal, #247a78)";

export default function MoveTaskToWorkspace({
  taskId,
  taskTitle,
  matterName,
  currentWorkspaceId,
  open,
  onClose,
}: {
  taskId: string;
  taskTitle: string;
  /** Set when the task is filed to a matter, which is why it cannot move. */
  matterName: string | null;
  currentWorkspaceId: string | null | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const workspaces = useAdministeredWorkspaces();
  const [to, setTo] = useState<string | null>(null);
  const move = useMoveTask();
  const [problem, setProblem] = useState<string | null>(null);

  const choices = (workspaces.data ?? []).filter((w) => w.id !== currentWorkspaceId);
  const mayMoveOut =
    !workspaces.isLoading &&
    !!currentWorkspaceId &&
    (workspaces.data ?? []).some((w) => w.id === currentWorkspaceId);

  const close = () => {
    setTo(null);
    setProblem(null);
    onClose();
  };

  const canPick = !matterName && mayMoveOut && choices.length > 0;

  return (
    <Modal open={open} onClose={close} label="Move task to another workspace">
      <div className="mt-dialog">
        <header>
          <h2>Move to another workspace</h2>
          <p>{taskTitle}</p>
        </header>

        <div className="mt-dialog-body">
          {matterName ? (
            <p className="mt-quiet">
              This task belongs to <strong style={{ color: INK }}>{matterName}</strong>. It is part
              of that file, so it moves when the matter moves — move the matter and the task goes
              with it.
            </p>
          ) : workspaces.isLoading ? (
            <p className="mt-quiet">Reading your workspaces…</p>
          ) : !mayMoveOut ? (
            <p className="mt-quiet">
              This task is not yours to move. Filing work somewhere else needs you to be an owner or
              admin of the workspace it is in as well as the one it is going to.
            </p>
          ) : choices.length === 0 ? (
            <p className="mt-quiet">
              There is nowhere else to file this. Moving needs you to administer both ends, and this
              is the only workspace you administer.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {choices.map((workspace) => {
                const chosen = to === workspace.id;
                return (
                  <button
                    key={workspace.id}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => setTo(chosen ? null : workspace.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      border: `1px solid ${chosen ? TEAL : RULE}`,
                      borderRadius: 7,
                      background: chosen ? "rgba(36,54,96,.07)" : "transparent",
                      color: INK,
                      cursor: "pointer",
                      font: "inherit",
                      fontSize: 13.5,
                      padding: "9px 11px",
                      textAlign: "left",
                    }}
                  >
                    <Building2 size={14} color={chosen ? TEAL : MUTED} />
                    <span style={{ flex: 1 }}>{workspace.name}</span>
                    {chosen && <Check size={14} color={TEAL} />}
                  </button>
                );
              })}
            </div>
          )}

          {problem && (
            <p className="mt-error" role="alert">
              {problem}
            </p>
          )}
        </div>

        <footer>
          <Button onClick={close}>{matterName ? "Close" : "Cancel"}</Button>
          {canPick && (
            <Button
              variant="primary"
              disabled={!to || move.isPending}
              onClick={() => {
                if (!to) return;
                setProblem(null);
                move.mutate(
                  { taskId, to },
                  {
                    onSuccess: close,
                    onError: (cause) =>
                      setProblem(
                        cause instanceof Error ? cause.message : "That task could not be moved.",
                      ),
                  },
                );
              }}
            >
              {move.isPending ? "Moving…" : "Move"}
            </Button>
          )}
        </footer>
      </div>
    </Modal>
  );
}
