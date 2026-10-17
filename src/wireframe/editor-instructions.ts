import type { Instruction } from "./InstructionModals";

/** Preserve every selected clause anchor when handing off to the assistant. */
export function instructionPrompt(instructions: Instruction[]) {
  const chosen = instructions.filter((i) => i.on && i.summary.trim());
  if (!chosen.length) return "";
  return `Propose revised wording for the following selected instructions. For each clause, explain the change and any legal constraint, then show the proposed text for my review. Do not claim the contract has been changed.\n\n${chosen.map((i) => `${i.anchor} · ${i.title}\n${i.basis ? `Lawyer's review label: ${i.basis} (verify against the applicable authority).\n` : ""}${i.summary.trim()}`).join("\n\n")}`;
}

export type ClauseCommentRow = {
  id: string;
  entity_id: string;
  body: string;
  kind: "note" | "instruction";
  created_at: string;
};

/** What the document knows about a clause an instruction is anchored to. */
export type InstructionClause = { id: string; num: string; label: string; basis?: string };

/**
 * Instructions as they are stored: a comment on a clause. The anchor, the
 * heading and the scope are read back from the clause itself rather than kept
 * on the row, so a renumbered or renamed clause carries its instructions with
 * it, and a comment left on a clause that has since gone is dropped instead of
 * being shown against nothing. Oldest first, the order they were written in.
 */
export function instructionsFromComments(
  comments: ClauseCommentRow[],
  clauses: InstructionClause[],
): Instruction[] {
  const byId = new Map(clauses.map((clause) => [clause.id, clause]));
  return comments
    .filter((row) => row.kind === "instruction" && byId.has(row.entity_id) && row.body.trim())
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((row) => {
      const clause = byId.get(row.entity_id)!;
      return {
        id: row.id,
        title: clause.label,
        summary: row.body,
        anchor: `CLAUSE ${clause.num}`,
        clauseId: clause.id,
        ...(clause.basis ? { basis: clause.basis } : {}),
        scope: clause.num.includes(".") ? ("clause" as const) : ("section" as const),
        on: true,
      };
    });
}
