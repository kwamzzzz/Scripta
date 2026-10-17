/**
 * Starting a firm.
 *
 * Deliberately one field. A firm is a name and an owner; the members, the
 * matters, the paper and the playbooks all arrive afterwards through the parts
 * of Scripta that already handle them. An onboarding wizard here would be
 * asking for things nobody knows on the day they start.
 *
 * There was no way to do this at all until now — the insert was permitted and
 * nothing called it — which is why every account had only the personal
 * workspace it was given at signup, and why one of those ended up holding a
 * firm's ten matters.
 */
import { useState } from "react";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import { createFirmWorkspace } from "@/lib/workspaces";

import "./matter-team.css";

export default function CreateFirmDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const create = async () => {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    setFailed(null);
    try {
      await createFirmWorkspace(clean);
      // A full reload: the workspace list is read once when the session starts,
      // and the person who just made a firm should land in it.
      window.location.assign("/");
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : "The firm could not be created.");
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} label="Create a firm workspace">
      <form
        className="mt-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <header>
          <h2>Create a firm workspace</h2>
          <p>
            A firm is where colleagues work together: shared matters, matter teams, and the firm's
            own precedents, templates and paper. Your personal workspace stays as it is.
          </p>
        </header>

        <div className="mt-dialog-body">
          <label className="firm-people-invite" style={{ display: "block" }}>
            <span
              style={{
                fontSize: 11,
                color: "var(--scripta-muted, #626c70)",
              }}
            >
              Firm name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nexis Africa"
              maxLength={120}
              autoComplete="organization"
              autoFocus
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
                font: "inherit",
                fontSize: 14,
                padding: "8px 10px",
                border: "1px solid var(--scripta-border, #cccfc9)",
                borderRadius: 6,
                background: "var(--scripta-surface, #fff)",
                color: "var(--scripta-ink, #123247)",
              }}
            />
          </label>
          <p className="mt-quiet">
            You can change the name later without affecting any work in it.
          </p>
          {failed && (
            <p className="mt-error" role="alert">
              {failed}
            </p>
          )}
        </div>

        <footer>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create firm"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
