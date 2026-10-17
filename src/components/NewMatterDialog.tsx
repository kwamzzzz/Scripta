/**
 * New matter: the legal file, and nothing more.
 *
 * A name and, if it is known, the client. Documents, a counterparty, a review
 * or a flow all attach to the matter once it exists. Contract Review keeps its
 * own guided intake for when that is what the lawyer set out to do.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/store/app";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import ClientPicker from "@/components/ClientPicker";
import { NO_CLIENT, type ClientChoice } from "@/components/client-choice";
import { createMatter } from "@/lib/organise";
import "./organise.css";

export default function NewMatterDialog({
  open,
  onClose,
  client = NO_CLIENT,
  initialName = "",
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Where it was started from, when that says whose it is. */
  client?: ClientChoice;
  initialName?: string;
  /** Instead of opening the new matter. */
  onCreated?: (matterId: string) => void | Promise<void>;
}) {
  const { workspaceId } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState(initialName);
  const [choice, setChoice] = useState<ClientChoice>(client);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!workspaceId || busy) return;
    if (!name.trim()) {
      setError("Give the matter a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await createMatter(workspaceId, { name, client: choice });
      await qc.invalidateQueries();
      if (onCreated) await onCreated(id);
      else
        void navigate({
          to: "/matters/$matterId",
          params: { matterId: id },
          search: { screen: "matter" } as never,
        });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The matter could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} label="New matter">
      <form
        className="org-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2>New matter</h2>
        <p>
          The file for one piece of legal work. Documents, a flow and the tools you need can be
          added once it exists.
        </p>
        <label className="org-field">
          <span className="org-label">Name</span>
          <input
            autoFocus
            value={name}
            placeholder="Share purchase — Goldenmark Ghana"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <ClientPicker value={choice} onChange={setChoice} />
        {error && (
          <p className="org-error" role="alert">
            {error}
          </p>
        )}
        <div className="org-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create matter"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
