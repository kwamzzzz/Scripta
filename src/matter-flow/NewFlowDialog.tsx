/**
 * Create Flow: how a piece of work will be run.
 *
 * A flow does not need a matter. It can be filed to one, organised under a
 * client, or simply started — and filed later without being rebuilt. The
 * structure arrives once the flow exists: blank, from a preset, or by asking
 * Scripta, so there is one place a structure is laid down whichever way in.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/store/app";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import ClientPicker from "@/components/ClientPicker";
import { NO_CLIENT, type ClientChoice } from "@/components/client-choice";
import { createStandaloneFlow } from "@/lib/organise";
import "@/components/organise.css";

export type FlowStart = "blank" | "preset" | "ask";
type Home = "none" | "client" | "matter";

export default function NewFlowDialog({
  open,
  onClose,
  client,
  matterId,
}: {
  open: boolean;
  onClose: () => void;
  /** Started from a client's page. */
  client?: ClientChoice;
  /** Started from a matter. */
  matterId?: string;
}) {
  const { workspaceId, matters } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fixed = matterId ? "matter" : client && client.kind !== "none" ? "client" : null;
  const [home, setHome] = useState<Home>(fixed ?? "none");
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<ClientChoice>(client ?? NO_CLIENT);
  const [matter, setMatter] = useState(matterId ?? "");
  const [start, setStart] = useState<FlowStart>("blank");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveMatters = matters.filter((m) => !m.archived_at && !m.deleted_at);
  const fixedMatter = matterId ? matters.find((m) => m.id === matterId) : null;

  const submit = async () => {
    if (!workspaceId || busy) return;
    if (!name.trim()) {
      setError("Give the flow a name.");
      return;
    }
    if (home === "matter" && !matter) {
      setError("Choose the matter, or file the flow later.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const flowId = await createStandaloneFlow(workspaceId, {
        name,
        matterId: home === "matter" ? matter : null,
        client: home === "client" ? choice : NO_CLIENT,
      });
      await qc.invalidateQueries();
      onClose();
      void navigate({
        to: "/flows/$flowId",
        params: { flowId },
        search: start === "blank" ? {} : ({ start } as never),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The flow could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} label="Create a flow">
      <form
        className="org-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2>Create a flow</h2>
        <p>
          Phases, what each one owes, and when. A flow can stand on its own and be filed under a
          client or a matter whenever that is known.
        </p>
        <label className="org-field">
          <span className="org-label">Name</span>
          <input
            autoFocus
            value={name}
            placeholder="Opening of USD account"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {fixed === "matter" ? (
          <div className="org-filing">
            Filed to <strong>{fixedMatter?.name ?? "this matter"}</strong>
          </div>
        ) : fixed === "client" ? (
          <ClientPicker value={choice} onChange={setChoice} />
        ) : (
          <div className="org-field">
            <span className="org-label">Belongs to</span>
            <div className="org-segment" role="group" aria-label="Belongs to">
              {(
                [
                  ["none", "Nothing yet"],
                  ["client", "A client"],
                  ["matter", "A matter"],
                ] as [Home, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={home === key}
                  onClick={() => setHome(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {home === "client" && <ClientPicker value={choice} onChange={setChoice} />}
            {home === "matter" && (
              <label className="org-field">
                <span className="org-label">Matter</span>
                <select value={matter} onChange={(e) => setMatter(e.target.value)}>
                  <option value="">Choose a matter</option>
                  {liveMatters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.client ? `${m.name} — ${m.client}` : m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {home !== "matter" && (
              <span className="org-hint">Only you can see it until it is filed to a matter.</span>
            )}
          </div>
        )}

        <div className="org-field">
          <span className="org-label">Start</span>
          <div className="org-starts" role="radiogroup" aria-label="Start">
            {(
              [
                ["blank", "Blank", "Add the phases yourself."],
                ["preset", "From a preset", "Lay out work you have run before."],
                ["ask", "Ask Scripta", "Describe the work and plan it together."],
              ] as [FlowStart, string, string][]
            ).map(([key, label, hint]) => (
              <label key={key}>
                <input
                  type="radio"
                  name="flow-start"
                  checked={start === key}
                  onChange={() => setStart(key)}
                />
                <strong>{label}</strong>
                <span>{hint}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="org-error" role="alert">
            {error}
          </p>
        )}
        <div className="org-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create flow"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
