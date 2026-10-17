/**
 * What the firm is called.
 *
 * A display name and nothing more. Renaming changes the word in the switcher,
 * on this page and in every invitation from here on — and changes nothing else:
 * not the workspace's id, and therefore not one matter, reference, storage
 * path, membership or permission. The firm that was called something else
 * yesterday is the same firm.
 *
 * Only an owner or an administrator may change it. Everybody else sees it.
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import { renameWorkspace } from "@/lib/workspaces";

export default function FirmName({
  workspaceId,
  name,
  canRename,
}: {
  workspaceId: string;
  name: string;
  canRename: boolean;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(name);
  const [notice, setNotice] = useState<string | null>(null);

  // A rename elsewhere, or a workspace switch, replaces the field; typing in it
  // does not.
  useEffect(() => setDraft(name), [name, workspaceId]);

  const rename = useMutation({
    mutationFn: () => renameWorkspace(workspaceId, draft),
    onSuccess: (saved) => {
      setNotice(`Renamed to ${saved}.`);
      void qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
    onError: (cause: unknown) =>
      setNotice(cause instanceof Error ? cause.message : "The name could not be saved."),
  });

  if (!canRename)
    return (
      <div className="settings-readonly">
        <span>Firm</span>
        <div>{name}</div>
      </div>
    );

  const changed = draft.trim() !== name && draft.trim().length > 0;

  return (
    <div>
      <h3>Firm name</h3>
      <p className="firm-people-note">
        How this firm appears in the workspace switcher, here, and on invitations. Changing it
        changes the name and nothing else.
      </p>
      <form
        className="firm-people-invite"
        onSubmit={(e) => {
          e.preventDefault();
          setNotice(null);
          if (changed) rename.mutate();
        }}
      >
        <label>
          <span>Name</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={120}
            autoComplete="organization"
          />
        </label>
        <Button type="submit" disabled={!changed || rename.isPending}>
          {rename.isPending ? "Saving…" : "Save name"}
        </Button>
      </form>
      {notice && (
        <p
          className={`settings-notice${rename.isError ? " is-error" : ""}`}
          role={rename.isError ? "alert" : "status"}
        >
          {notice}
        </p>
      )}
    </div>
  );
}
