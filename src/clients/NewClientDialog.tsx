/**
 * New client: a name, whether it is an organisation or a person, and for an
 * organisation whether the firm keeps the essentials or full corporate services.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/store/app";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import { useClients } from "@/components/client-choice";
import {
  CLIENT_KIND_LABEL,
  createClient,
  type Client,
  type ClientKind,
  type OptionalArea,
} from "@/lib/clients";
import ServiceAreas from "./ServiceAreas";
import "@/components/organise.css";
import "./clients.css";

const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export default function NewClientDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (client: Client) => void;
}) {
  const { workspaceId } = useApp();
  const qc = useQueryClient();
  const clients = useClients();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ClientKind>("organisation");
  const [areas, setAreas] = useState<OptionalArea[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Said, not refused: two clients can share a name and be two legal persons.
  const same = (clients.data ?? []).find((c) => name.trim() && fold(c.name) === fold(name));

  const submit = async () => {
    if (!workspaceId || busy) return;
    if (!name.trim()) {
      setError("Give the client a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const client = await createClient(workspaceId, {
        name,
        kind,
        optionalAreas: kind === "organisation" ? areas : [],
      });
      await qc.invalidateQueries({ queryKey: ["clients"] });
      onCreated(client);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The client could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} label="New client">
      <form
        className="org-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2>New client</h2>
        <p>The organisation or person the firm acts for. Everything else can be added later.</p>
        <label className="org-field">
          <span className="org-label">Name</span>
          <input
            autoFocus
            value={name}
            placeholder="Goldenmark Ghana Ltd"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {same && (
          <p className="org-hint">
            {same.name} is already a client{same.archivedAt ? " (archived)" : ""}. Create another
            only if this is a different person.
          </p>
        )}
        <div className="org-field">
          <span className="org-label">Type</span>
          <div className="org-segment" role="group" aria-label="Type">
            {(Object.keys(CLIENT_KIND_LABEL) as ClientKind[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={kind === key}
                onClick={() => setKind(key)}
              >
                {CLIENT_KIND_LABEL[key]}
              </button>
            ))}
          </div>
        </div>
        {kind === "organisation" && <ServiceAreas kind={kind} value={areas} onChange={setAreas} />}
        {error && (
          <p className="org-error" role="alert">
            {error}
          </p>
        )}
        <div className="org-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create client"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
