/**
 * Organising a flow that was started on its own.
 *
 * Three answers to "where does this belong": a client, a matter that already
 * exists, or a matter made from the flow itself. Each changes a link on the
 * flow and nothing else — its id, phases, deliverables, versions, threads,
 * comments and tasks all stay exactly where they are.
 *
 * Filing into a matter is the one that cannot be taken back, because from then
 * on the matter's team can open the flow and the matter decides who may. The
 * dialog says so before, not after.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/store/app";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import ClientPicker from "@/components/ClientPicker";
import { NO_CLIENT, type ClientChoice } from "@/components/client-choice";
import { createMatter, resolveClient } from "@/lib/organise";
import { fileFlow, type FlowHead } from "./flow-db";
import "@/components/organise.css";

type Target = "client" | "matter" | "new-matter";

export default function FileFlowDialog({
  open,
  onClose,
  head,
  flowName,
  clientName,
  initial = "client",
  onFiled,
}: {
  open: boolean;
  onClose: () => void;
  head: FlowHead;
  flowName: string;
  /** The client the flow is organised under now, if any. */
  clientName: string | null;
  initial?: Target;
  onFiled: (where: { matterId?: string }) => void | Promise<void>;
}) {
  const { workspaceId, matters } = useApp();
  const qc = useQueryClient();
  const current: ClientChoice =
    head.clientId && clientName
      ? { kind: "existing", id: head.clientId, name: clientName }
      : NO_CLIENT;
  const [target, setTarget] = useState<Target>(initial);
  const [client, setClient] = useState<ClientChoice>(current);
  const [matterId, setMatterId] = useState("");
  const [matterName, setMatterName] = useState(flowName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveMatters = matters.filter((m) => !m.archived_at && !m.deleted_at);

  const submit = async () => {
    if (!workspaceId || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (target === "client") {
        const clientId = await resolveClient(head.workspaceId, client);
        await fileFlow(head.flowId, { clientId });
        await onFiled({});
      } else if (target === "matter") {
        if (!matterId) throw new Error("Choose the matter to file this flow to.");
        await fileFlow(head.flowId, { matterId });
        await onFiled({ matterId });
      } else {
        if (!matterName.trim()) throw new Error("Give the new matter a name.");
        const id = await createMatter(head.workspaceId, { name: matterName, client });
        await fileFlow(head.flowId, { matterId: id });
        await onFiled({ matterId: id });
      }
      await qc.invalidateQueries();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The flow could not be filed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} label="Organise this flow">
      <form
        className="org-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2>Organise this flow</h2>
        <div className="org-segment" role="group" aria-label="File under">
          {(
            [
              ["client", "Client"],
              ["matter", "Existing matter"],
              ["new-matter", "New matter from this flow"],
            ] as [Target, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={target === key}
              onClick={() => {
                setTarget(key);
                setError(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {target === "client" && (
          <>
            <ClientPicker value={client} onChange={setClient} />
            <p className="org-hint">
              The flow stays private to you. It is listed under the client for you, and can be filed
              to a matter later.
            </p>
          </>
        )}

        {target === "matter" && (
          <>
            <label className="org-field">
              <span className="org-label">Matter</span>
              <select value={matterId} onChange={(e) => setMatterId(e.target.value)}>
                <option value="">Choose a matter</option>
                {liveMatters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.client ? `${m.name} — ${m.client}` : m.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="org-hint">
              Everything in the flow moves with it, and the matter’s team can open it from then on.
              A flow filed to a matter stays with that matter.
              {head.clientId
                ? " If the matter has no client yet, it takes this flow’s client."
                : ""}
            </p>
          </>
        )}

        {target === "new-matter" && (
          <>
            <label className="org-field">
              <span className="org-label">Matter name</span>
              <input value={matterName} onChange={(e) => setMatterName(e.target.value)} />
            </label>
            <ClientPicker value={client} onChange={setClient} />
            <p className="org-hint">
              A new matter is opened with you as Lead, and this flow is filed to it with everything
              in it.
            </p>
          </>
        )}

        {error && (
          <p className="org-error" role="alert">
            {error}
          </p>
        )}
        <div className="org-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy
              ? "Filing…"
              : target === "client"
                ? "Save"
                : target === "matter"
                  ? "File to matter"
                  : "Create matter and file"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
