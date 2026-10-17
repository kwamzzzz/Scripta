import { supabase } from "@/integrations/supabase/client";

/**
 * Changing a matter after it has been opened.
 *
 * Intake captures a matter's name, client, counterparty, type, governing law,
 * reference and target date — and until now nothing could change any of them
 * again. A client renames, a counterparty is added late, a target date moves,
 * a reference is mistyped. A matter that cannot be corrected is a matter that
 * slowly stops describing the work.
 *
 * Stage is deliberately absent. It is not stored for display: `stageOf` reads
 * it from what the matter actually contains, so a matter cannot claim to be
 * complete while its clauses are still open. Letting someone type a stage
 * would put a second, more flattering answer next to the true one.
 */

export type MatterPatch = Partial<{
  name: string;
  client: string;
  counterparty: string;
  matterType: string;
  governingLaw: string;
  reference: string;
  /** ISO date (yyyy-mm-dd), or empty to clear it. */
  targetDate: string;
}>;

/** Blank means "not recorded", which is a null in the database rather than an
 *  empty string, so a cleared field reads the same as one never filled in. */
const orNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export async function updateMatter(matterId: string, patch: MatterPatch): Promise<void> {
  const row = {
    updated_at: new Date().toISOString(),
    ...(patch.name === undefined ? {} : { name: patch.name.trim() || "Untitled matter" }),
    ...(patch.client === undefined ? {} : { client: orNull(patch.client) }),
    ...(patch.counterparty === undefined ? {} : { counterparty: orNull(patch.counterparty) }),
    // matter_type is NOT NULL in the database and defaults to "Other".
    // Clearing it falls back to that rather than failing the write.
    ...(patch.matterType === undefined ? {} : { matter_type: patch.matterType.trim() || "Other" }),
    ...(patch.governingLaw === undefined ? {} : { governing_law: orNull(patch.governingLaw) }),
    ...(patch.reference === undefined ? {} : { reference: orNull(patch.reference) }),
    ...(patch.targetDate === undefined ? {} : { target_date: orNull(patch.targetDate) }),
  };
  const { error } = await supabase.from("matters").update(row).eq("id", matterId);
  if (error) throw error;
}

/** The fields a matter records about itself, in the order they are read. */
export const MATTER_FIELDS: {
  key: keyof MatterPatch;
  label: string;
  placeholder: string;
  type?: "date";
}[] = [
  { key: "name", label: "Name", placeholder: "What this matter is called" },
  { key: "counterparty", label: "Counterparty", placeholder: "Who is on the other side" },
  { key: "matterType", label: "Type", placeholder: "Share purchase, employment, lease…" },
  { key: "governingLaw", label: "Governing law", placeholder: "Ghana, England and Wales…" },
  { key: "reference", label: "Reference", placeholder: "Your own file reference" },
  { key: "targetDate", label: "Target date", placeholder: "", type: "date" },
];

/**
 * Archive or reopen a matter.
 *
 * Archiving is not deleting and is not a stage. It says the work is finished
 * with for now: the matter leaves the working lists and keeps everything —
 * documents, clauses, drafting points, audit trail — so it can be reopened,
 * or answered for, years later.
 */
export async function setMatterArchived(matterId: string, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from("matters")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", matterId);
  if (error) throw error;
}
