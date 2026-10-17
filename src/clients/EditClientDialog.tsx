/**
 * Editing a client's own details — name, type, reference and the areas its
 * file carries — in a dialog titled with the client, so it is never unclear
 * whether the page or something on it is being changed.
 */
import { useEffect, useState } from "react";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import {
  CLIENT_KIND_LABEL,
  updateClient,
  type Client,
  type ClientKind,
  type OptionalArea,
} from "@/lib/clients";
import ServiceAreas from "./ServiceAreas";
import "@/components/organise.css";
import "./clients.css";

export default function EditClientDialog({
  client,
  open,
  onClose,
  onSaved,
}: {
  client: Client;
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(client.name);
  const [kind, setKind] = useState<ClientKind>(client.kind);
  const [reference, setReference] = useState(client.reference);
  const [areas, setAreas] = useState<OptionalArea[]>(client.optionalAreas);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Opened again, it starts from the client as it now is.
  useEffect(() => {
    if (!open) return;
    setName(client.name);
    setKind(client.kind);
    setReference(client.reference);
    setAreas(client.optionalAreas);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client.id]);

  const save = async () => {
    if (busy) return;
    if (!name.trim()) return setError("Give the client a name.");
    setBusy(true);
    setError(null);
    try {
      await updateClient(client, { name, kind, reference, optionalAreas: areas });
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The client was not saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} label={`Edit ${client.name}`}>
      <form
        className="org-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2>Edit client details</h2>
        <p>{client.name}</p>
        <label className="org-field">
          <span className="org-label">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="cl-editor-row">
          <label className="org-field">
            <span className="org-label">Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as ClientKind)}>
              {(Object.keys(CLIENT_KIND_LABEL) as ClientKind[]).map((k) => (
                <option key={k} value={k}>
                  {CLIENT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="org-field">
            <span className="org-label">Reference</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        </div>
        <ServiceAreas kind={kind} value={areas} onChange={setAreas} separately />
        {error && (
          <p className="org-error" role="alert">
            {error}
          </p>
        )}
        <p className="org-hint">Renaming a client renames the client line on its matters.</p>
        <div className="org-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
