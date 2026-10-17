/**
 * The Library's collections: the shelves along the top of the Library that a
 * source can sit on (several at once). Made, renamed, put aside and deleted
 * here; deleting a shelf leaves its sources in the Library.
 */
import { useState } from "react";
import { Modal } from "@/wireframe/screens";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import type { LibraryCollection, LibrarySource } from "@/lib/library";
import "@/components/organise.css";

export default function CollectionsDialog({
  collections,
  sources,
  onClose,
  onCreate,
  onRename,
  onArchive,
  onDelete,
}: {
  collections: LibraryCollection[];
  sources: LibrarySource[];
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (c: LibraryCollection, name: string) => Promise<void>;
  onArchive: (c: LibraryCollection, archived: boolean) => Promise<void>;
  onDelete: (c: LibraryCollection) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const count = (c: LibraryCollection) =>
    sources.filter((s) => s.collectionIds.includes(c.id)).length;

  const run = async (work: () => Promise<void>) => {
    setError(null);
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const ordered = [
    ...collections.filter((c) => !c.archivedAt),
    ...collections.filter((c) => c.archivedAt),
  ];

  return (
    <Modal open onClose={onClose} label="Collections">
      <div className="org-dialog lib-dialog">
        <h2>Collections</h2>
        <p>
          Shelves for the Library, shown along its top. A source can sit on several; deleting a
          collection leaves its sources where they are.
        </p>
        <form
          className="lib-newcol"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void run(async () => {
              await onCreate(name);
              setName("");
            });
          }}
        >
          <input
            value={name}
            autoFocus
            placeholder="New collection, e.g. Ghana tax"
            aria-label="New collection name"
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Add
          </Button>
        </form>
        <ul className="lib-cols">
          {ordered.map((c) => {
            const value = names[c.id] ?? c.name;
            const n = count(c);
            return (
              <li key={c.id} className={c.archivedAt ? "is-archived" : undefined}>
                <input
                  value={value}
                  aria-label={`Name of ${c.name}`}
                  onChange={(e) => setNames((m) => ({ ...m, [c.id]: e.target.value }))}
                  onBlur={() => {
                    if (value.trim() && value.trim() !== c.name) void run(() => onRename(c, value));
                    else setNames((m) => ({ ...m, [c.id]: c.name }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
                <span className="lib-cols-count">
                  {n} {n === 1 ? "source" : "sources"}
                  {c.archivedAt ? " · Archived" : ""}
                </span>
                <button
                  type="button"
                  className="org-link"
                  onClick={() => void run(() => onArchive(c, !c.archivedAt))}
                >
                  {c.archivedAt ? "Restore" : "Archive"}
                </button>
                <button
                  type="button"
                  className="org-link lib-danger"
                  onClick={() =>
                    void (async () => {
                      const yes = await confirmDelete({
                        what: `the collection “${c.name}”`,
                        binned: false,
                        consequence: n
                          ? `Its ${n} ${n === 1 ? "source stays" : "sources stay"} in the Library.`
                          : "It has no sources.",
                      });
                      if (yes) await run(() => onDelete(c));
                    })()
                  }
                >
                  Delete
                </button>
              </li>
            );
          })}
          {!collections.length && <li className="lib-cols-none">No collections yet.</li>}
        </ul>
        {error && (
          <p className="org-error" role="alert">
            {error}
          </p>
        )}
        <div className="org-actions">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
      {confirmDialog}
    </Modal>
  );
}
