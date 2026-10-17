/**
 * New manuscript: a title, what kind of work it is, the file, and where (if
 * anywhere) it is filed. The file is read in the browser into chapters,
 * sections, paragraphs, notes, tables and the bibliography, and that reading
 * is what is stored and reviewed.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/store/app";
import { useAuth } from "@/lib/auth";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import ClientPicker from "@/components/ClientPicker";
import { NO_CLIENT, type ClientChoice } from "@/components/client-choice";
import { resolveClient } from "@/lib/organise";
import { createManuscript, deleteManuscript, errorMessage, importVersion } from "./db";
import { MANUSCRIPT_KINDS, type ManuscriptKind } from "./model";
import "@/components/organise.css";

const ACCEPT =
  ".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf";

export default function NewManuscriptDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { workspaceId, matters } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ManuscriptKind>("thesis");
  const [author, setAuthor] = useState("");
  const [client, setClient] = useState<ClientChoice>(NO_CLIENT);
  const [matterId, setMatterId] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = (f: File | null) => {
    setFile(f);
    if (f && !title.trim())
      setTitle(
        f.name
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      );
  };

  const submit = async () => {
    if (!workspaceId || !user || busy) return;
    if (!file) return setError("Choose the manuscript file: a Word document or a PDF.");
    if (!title.trim()) return setError("Give the manuscript a title.");
    setError(null);
    let id: string | null = null;
    try {
      setBusy("Reading the manuscript…");
      const { parseManuscript } = await import("./parse");
      const parsed = await parseManuscript(file);
      if (!parsed.nodes.length) throw new Error("No text could be read from this file.");
      setBusy("Filing it…");
      const clientId = await resolveClient(workspaceId, client);
      id = await createManuscript({
        workspaceId,
        title,
        kind,
        author,
        clientId,
        matterId: matterId || null,
        private: isPrivate,
      });
      await importVersion({
        manuscript: { id, workspaceId, private: isPrivate, matterId: matterId || null },
        userId: user.id,
        file,
        parsed,
        onProgress: (done, of) => setBusy(`Storing the reading… ${Math.round((done / of) * 100)}%`),
      });
      await qc.invalidateQueries({ queryKey: ["manuscripts"] });
      onClose();
      void navigate({ to: "/manuscripts/$manuscriptId", params: { manuscriptId: id } });
    } catch (cause) {
      // A record with no reading behind it is not worth leaving in the list.
      if (id) await deleteManuscript({ id }).catch(() => {});
      setError(errorMessage(cause, "The manuscript could not be added."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} label="New manuscript">
      <form
        className="org-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2>New manuscript</h2>
        <p>
          A thesis, dissertation, book or long report. Scripta reads it into chapters, sections,
          paragraphs, notes, tables and the bibliography, and reviews it from there.
        </p>
        <label className="org-field">
          <span className="org-label">File</span>
          <input type="file" accept={ACCEPT} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          <small className="ms-hint">
            Word keeps the real headings, footnotes and tables. A PDF is read from its layout, so
            chapters and notes are inferred.
          </small>
        </label>
        <label className="org-field">
          <span className="org-label">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="ms-row2">
          <label className="org-field">
            <span className="org-label">Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as ManuscriptKind)}>
              {MANUSCRIPT_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="org-field">
            <span className="org-label">Author</span>
            <input
              value={author}
              placeholder="Optional"
              onChange={(e) => setAuthor(e.target.value)}
            />
          </label>
        </div>
        <ClientPicker value={client} onChange={setClient} />
        <label className="org-field">
          <span className="org-label">Matter</span>
          <select value={matterId} onChange={(e) => setMatterId(e.target.value)}>
            <option value="">Not filed to a matter</option>
            {matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="ms-check">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setPrivate(e.target.checked)}
          />
          Private to me. Colleagues will not see it until you change this.
        </label>
        {error && (
          <p className="org-error" role="alert">
            {error}
          </p>
        )}
        <div className="org-actions">
          {busy && (
            <span className="ms-busy" role="status">
              {busy}
            </span>
          )}
          <Button onClick={onClose} disabled={!!busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!!busy}>
            {busy ? "Adding…" : "Add manuscript"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
