/**
 * The course team, edited where it is shown.
 *
 * Team members are credit blocks inside the course's items (usually "About
 * this course"), so the About page and this band always agree. An author does
 * not need to know that: in authoring mode every card has Edit, and "Add team
 * member" puts a new card in the same item as the others, or in the first
 * item of the course when there are none yet.
 */
import { useState } from "react";
import { Modal } from "@/wireframe/screens";
import { isFilledCredit, newBlockId, readBlocks, type Block, type Media } from "../blocks";
import type { CourseFile } from "../db";
import { numberCourse } from "../model";
import { BlockFields } from "./BlockFields";
import { CreditCard } from "./RichBlocks";

type Member = { itemId: string; block: Block };

export function TeamBand({
  file,
  authoring,
  onSaveBlocks,
  onUpload,
}: {
  file: CourseFile;
  authoring: boolean;
  onSaveBlocks: (itemId: string, blocks: Block[]) => Promise<void>;
  onUpload: (file: File, itemId: string) => Promise<Media>;
}) {
  const [editing, setEditing] = useState<Member | null>(null);
  const [isNew, setIsNew] = useState(false);
  const numbered = numberCourse(file.modules, file.items);
  const team: Member[] = numbered.flatMap((i) =>
    readBlocks(i.payload)
      .filter(isFilledCredit)
      .map((block) => ({ itemId: i.id, block })),
  );
  if (team.length === 0 && !authoring) return null;

  // Sponsors lend their material, not their time: the heading says which the band holds.
  const sponsors = team.filter((m) => /sponsor/i.test(m.block.cite ?? "")).length;
  const heading =
    sponsors === 0
      ? "Course team"
      : sponsors === team.length
        ? sponsors === 1
          ? "Course sponsor"
          : "Course sponsors"
        : "Course team and sponsors";

  // Where a new member goes: beside the existing team, or the course's first item.
  const home =
    team[0]?.itemId ??
    numbered.find((i) => readBlocks(i.payload).some((b) => b.type === "credit"))?.id ??
    numbered.find((i) => i.kind !== "folder")?.id ??
    null;

  const save = async (member: Member, remove = false) => {
    const item = file.items.find((i) => i.id === member.itemId);
    if (!item) return;
    const blocks = readBlocks(item.payload);
    const at = blocks.findIndex((b) => b.id === member.block.id);
    let next: Block[];
    if (remove) next = blocks.filter((b) => b.id !== member.block.id);
    else if (at >= 0) next = blocks.map((b) => (b.id === member.block.id ? member.block : b));
    else {
      // After the last credit already in the item, so the team stays together.
      const last = blocks.map((b) => b.type).lastIndexOf("credit");
      next = [...blocks];
      next.splice(last >= 0 ? last + 1 : blocks.length, 0, member.block);
    }
    await onSaveBlocks(member.itemId, next);
  };

  return (
    <section className="lr-team">
      <div className="lr-label">{heading}</div>
      <div className="lr-team-grid">
        {team.map((m) => (
          <div key={m.block.id} className="lr-team-slot">
            <CreditCard block={m.block} compact />
            {authoring ? (
              <button
                type="button"
                className="lr-btn lr-team-edit"
                onClick={() => {
                  setIsNew(false);
                  setEditing(m);
                }}
              >
                Edit
              </button>
            ) : null}
          </div>
        ))}
        {authoring && home ? (
          <button
            type="button"
            className="lr-team-add"
            onClick={() => {
              setIsNew(true);
              setEditing({
                itemId: home,
                block: {
                  id: newBlockId(),
                  type: "credit",
                  text: "",
                  cite: "",
                  org: "",
                },
              });
            }}
          >
            + Add team member
          </button>
        ) : null}
      </div>

      {editing ? (
        <TeamMemberDialog
          member={editing}
          isNew={isNew}
          onUpload={(f) => onUpload(f, editing.itemId)}
          onClose={() => setEditing(null)}
          onSave={async (m) => {
            await save(m);
            setEditing(null);
          }}
          onRemove={async (m) => {
            await save(m, true);
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function TeamMemberDialog({
  member,
  isNew,
  onUpload,
  onClose,
  onSave,
  onRemove,
}: {
  member: Member;
  isNew: boolean;
  onUpload: (file: File) => Promise<Media>;
  onClose: () => void;
  onSave: (m: Member) => Promise<void>;
  onRemove: (m: Member) => Promise<void>;
}) {
  const [block, setBlock] = useState(member.block);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} label="Course team member">
      <div className="org-dialog">
        <h2>{isNew ? "Add a team member" : "Edit team member"}</h2>
        <p>
          Name, role and organisation, with a photo of the person and the logo of their institution.
          A card shows once it has a name or an organisation.
        </p>
        <div className="lr-team-preview">
          <CreditCard block={block} compact />
        </div>
        <BlockFields
          block={block}
          onChange={(fields) => setBlock((b) => ({ ...b, ...fields }))}
          onUpload={onUpload}
        />
        <div className="org-actions" style={{ justifyContent: "space-between" }}>
          {!isNew ? (
            <button
              type="button"
              className="lr-btn"
              data-danger="true"
              disabled={busy}
              onClick={() => void run(() => onRemove({ ...member, block }))}
            >
              Remove from the team
            </button>
          ) : (
            <span />
          )}
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" className="lr-btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="lr-btn"
              data-primary="true"
              disabled={busy}
              onClick={() => void run(() => onSave({ ...member, block }))}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </span>
        </div>
      </div>
    </Modal>
  );
}
