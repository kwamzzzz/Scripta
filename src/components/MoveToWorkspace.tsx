/**
 * Filing a matter under a different workspace.
 *
 * ---------------------------------------------------------------------------
 * THE DIALOG EXISTS FOR ONE SENTENCE
 * ---------------------------------------------------------------------------
 *
 * Not the picker — a picker is easy. The sentence is the one naming the people
 * this would quietly demote.
 *
 * A firm role is a ceiling on a matter role: somebody admitted to the
 * destination workspace as a viewer becomes a Viewer on this matter whatever
 * the matter team says. Nothing on any screen would show that afterwards. The
 * Editor simply finds, at some later date, that they cannot type.
 *
 * So the move is not offered until the preview has come back, and where there
 * are people to name, they are named.
 *
 * The other half is what this refuses to imply. Moving a matter shows it to
 * NOBODY new — the matter team is the confidentiality boundary and travels with
 * the matter — and a lawyer might reasonably assume the opposite, so the dialog
 * says it rather than leaving them to guess.
 *
 * ---------------------------------------------------------------------------
 * THE CARD IS THE CALLER'S JOB
 * ---------------------------------------------------------------------------
 *
 * `Modal` draws the dimmed backdrop and centres one child; it draws no panel.
 * The first version of this passed a bare div, so the dialog rendered with no
 * background at all and the matters table showed straight through the text.
 * `.mt-dialog` is the house card, and its colours are written as literal
 * fallbacks because a <dialog> portals outside the token scope — which is the
 * same reason the styles below do not use the `C` tokens.
 */
import { useState } from "react";
import { ArrowRight, Building2, Check } from "lucide-react";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import {
  carries,
  useAdministeredWorkspaces,
  useMovePreview,
  useMoveMatter,
} from "@/lib/workspace-move";
import "./matter-team.css";

const MUTED = "var(--scripta-muted, #626c70)";
const INK = "var(--scripta-ink, #123247)";
const RULE = "var(--scripta-rule, #dee0d9)";
const TEAL = "var(--scripta-teal, #247a78)";

export default function MoveToWorkspace({
  matterId,
  matterName,
  currentWorkspaceId,
  open,
  onClose,
}: {
  matterId: string;
  matterName: string;
  currentWorkspaceId: string | null | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const workspaces = useAdministeredWorkspaces();
  const [to, setTo] = useState<string | null>(null);
  const preview = useMovePreview(open ? matterId : null, to);
  const move = useMoveMatter();
  const [problem, setProblem] = useState<string | null>(null);

  /* Only somewhere else. A workspace you are already in is not a destination. */
  const choices = (workspaces.data ?? []).filter((w) => w.id !== currentWorkspaceId);

  /* BOTH ENDS, and the interface has to know it too.
     `workspaces_i_administer()` is the same list the server checks against, so
     a workspace missing from it is one you cannot move OUT of either. Without
     this the dialog offered a destination and the server refused on the way
     out — a button that could not work, explained only after it was pressed. */
  const mayMoveOut =
    !workspaces.isLoading &&
    !!currentWorkspaceId &&
    (workspaces.data ?? []).some((w) => w.id === currentWorkspaceId);

  const close = () => {
    setTo(null);
    setProblem(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={close} label="Move to another workspace">
      <div className="mt-dialog">
        <header>
          <h2>Move to another workspace</h2>
          <p>{matterName}</p>
        </header>

        <div className="mt-dialog-body">
          {workspaces.isLoading ? (
            <p className="mt-quiet">Reading your workspaces…</p>
          ) : !mayMoveOut ? (
            <p className="mt-quiet">
              This matter is not yours to move. Filing a matter somewhere else needs you to be an
              owner or admin of the workspace it is in as well as the one it is going to — being on
              the matter team is not the same thing.
            </p>
          ) : choices.length === 0 ? (
            <p className="mt-quiet">
              There is nowhere else to file this. Moving a matter needs you to administer both ends,
              and this is the only workspace you administer.
            </p>
          ) : (
            <>
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

              {to && preview.isLoading && <p className="mt-quiet">Working out what would move…</p>}

              {to && preview.data && (
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    borderTop: `1px solid ${RULE}`,
                    paddingTop: 12,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      color: INK,
                      fontSize: 13,
                    }}
                  >
                    {preview.data.fromName}
                    <ArrowRight size={13} color={MUTED} />
                    <strong>{preview.data.toName}</strong>
                  </p>

                  <p className="mt-quiet">{carries(preview.data)}</p>

                  {/* The thing a lawyer would otherwise never find out. */}
                  {preview.data.capped.length > 0 && (
                    <p
                      style={{
                        margin: 0,
                        borderLeft: "2px solid var(--scripta-amber, #b8791f)",
                        paddingLeft: 9,
                        color: INK,
                        fontSize: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      {preview.data.capped.join(", ")}{" "}
                      {preview.data.capped.length === 1 ? "is a viewer" : "are viewers"} in{" "}
                      {preview.data.toName}, so they will be able to read this matter but not write
                      to it, whatever their role on the team says.
                    </p>
                  )}

                  {preview.data.released.length > 0 && (
                    <p className="mt-quiet">
                      {preview.data.released.join(", ")} would get their full role on this matter
                      back.
                    </p>
                  )}

                  <p className="mt-quiet">
                    Nobody new can see it. The people on this matter decide who reads it, and they
                    move with it.
                  </p>
                </div>
              )}
            </>
          )}

          {problem && (
            <p className="mt-error" role="alert">
              {problem}
            </p>
          )}
        </div>

        <footer>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!mayMoveOut || !to || !preview.data || move.isPending}
            onClick={() => {
              if (!to) return;
              setProblem(null);
              move.mutate(
                { matterId, to },
                {
                  onSuccess: close,
                  onError: (cause) =>
                    setProblem(
                      cause instanceof Error ? cause.message : "That matter could not be moved.",
                    ),
                },
              );
            }}
          >
            {move.isPending ? "Moving…" : preview.data ? `Move to ${preview.data.toName}` : "Move"}
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
