/**
 * Who you are, and who you know.
 *
 * The profile is the same shape as the one every lawyer already keeps on a
 * professional network, and that is deliberate: it is the shape they think in,
 * and asking them to think in another one to record the same facts would be an
 * invention for its own sake. What is missing is everything that makes that
 * other thing a network — no feed, no followers, no endorsement from somebody
 * who has never seen your work. This is the raw material a CV, an application
 * or a promotion case is written from, kept once instead of retyped into each.
 *
 * The register of people is the half a practice actually runs on and the half
 * that is normally kept in somebody's head, where it decays. You remember that
 * a person does shipping work and forget which firm they moved to; you hear
 * they made partner and have nowhere to put it. So: what they are good at,
 * what you could reasonably ask them for, how well you know them, and what has
 * happened to them since.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (t: string) => any };
const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/* ------------------------------------------------------------------ types */

export type Profile = {
  headline: string;
  about: string;
  location: string;
  email: string;
  phone: string;
  website: string;
  admissions: string;
};

export const EMPTY_PROFILE: Profile = {
  headline: "",
  about: "",
  location: "",
  email: "",
  phone: "",
  website: "",
  admissions: "",
};

export type Employment =
  | "full_time"
  | "part_time"
  | "pupillage"
  | "secondment"
  | "internship"
  | "consultant"
  | "self_employed"
  | "other";

export const EMPLOYMENTS: Employment[] = [
  "full_time",
  "part_time",
  "pupillage",
  "secondment",
  "internship",
  "consultant",
  "self_employed",
  "other",
];

/** Pupillage and a secondment are not jobs, and a career in law is full of both. */
export const EMPLOYMENT_LABEL: Record<Employment, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  pupillage: "Pupillage",
  secondment: "Secondment",
  internship: "Internship",
  consultant: "Consultant",
  self_employed: "Self-employed",
  other: "Other",
};

export type Position = {
  id: string;
  title: string;
  organisation: string;
  employment: Employment;
  location: string;
  startedOn: string | null;
  endedOn: string | null;
  current: boolean;
  summary: string;
  skills: string[];
};

export type Education = {
  id: string;
  institution: string;
  qualification: string;
  field: string;
  startedOn: string | null;
  endedOn: string | null;
  note: string;
};

export type Credential = {
  id: string;
  name: string;
  issuer: string;
  issuedOn: string | null;
  expiresOn: string | null;
  credentialId: string;
  url: string;
  skills: string[];
};

export type Skill = { id: string; name: string; note: string };

export type Closeness = "close" | "known" | "met";

export const CLOSENESS: Closeness[] = ["close", "known", "met"];

/** How well you know them, which is what decides what you can reasonably ask. */
export const CLOSENESS_LABEL: Record<Closeness, string> = {
  close: "Would call today",
  known: "Worked together",
  met: "Have met",
};

export const CLOSENESS_MEANING: Record<Closeness, string> = {
  close: "You could ring them this afternoon and they would take it.",
  known: "You have worked together; they would remember you.",
  met: "You have met. They may need reminding who you are.",
};

export type Contact = {
  id: string;
  name: string;
  organisation: string;
  role: string;
  location: string;
  email: string;
  phone: string;
  howYouMet: string;
  closeness: Closeness;
  expertise: string[];
  callOn: string;
  theyCallOn: string;
  notes: string;
  lastContactOn: string | null;
  archivedAt: string | null;
};

export type MilestoneKind =
  | "promotion"
  | "move"
  | "qualification"
  | "award"
  | "publication"
  | "appointment"
  | "deal"
  | "other";

export const MILESTONE_KINDS: MilestoneKind[] = [
  "promotion",
  "move",
  "qualification",
  "award",
  "publication",
  "appointment",
  "deal",
  "other",
];

export const MILESTONE_LABEL: Record<MilestoneKind, string> = {
  promotion: "Promotion",
  move: "Moved firm",
  qualification: "Qualified",
  award: "Award or ranking",
  publication: "Published",
  appointment: "Appointment",
  deal: "Deal or case",
  other: "Other",
};

export type Milestone = {
  id: string;
  /** Null is your own. A career keeps both. */
  contactId: string | null;
  kind: MilestoneKind;
  headline: string;
  note: string;
  happenedOn: string | null;
};

export type ProfileRecord = {
  profile: Profile;
  positions: Position[];
  education: Education[];
  credentials: Credential[];
  skills: Skill[];
  contacts: Contact[];
  milestones: Milestone[];
};

export const EMPTY_PROFILE_RECORD: ProfileRecord = {
  profile: EMPTY_PROFILE,
  positions: [],
  education: [],
  credentials: [],
  skills: [],
  contacts: [],
  milestones: [],
};

/* ---------------------------------------------------------------- reading */

export async function loadProfile(workspaceId: string): Promise<ProfileRecord> {
  const [profile, positions, education, credentials, skills, contacts, milestones] =
    await Promise.all([
      db.from("career_profile").select("*").eq("workspace_id", workspaceId).maybeSingle(),
      db.from("career_positions").select("*").eq("workspace_id", workspaceId),
      db.from("career_education").select("*").eq("workspace_id", workspaceId),
      db.from("career_credentials").select("*").eq("workspace_id", workspaceId),
      db.from("career_skills").select("*").eq("workspace_id", workspaceId).order("sort_order"),
      db.from("career_contacts").select("*").eq("workspace_id", workspaceId).order("name"),
      db.from("career_milestones").select("*").eq("workspace_id", workspaceId),
    ]);
  for (const r of [positions, education, credentials, skills, contacts, milestones])
    if (r.error) throw new Error(r.error.message);

  const p = profile.data;
  return {
    profile: p
      ? {
          headline: str(p.headline),
          about: str(p.about),
          location: str(p.location),
          email: str(p.email),
          phone: str(p.phone),
          website: str(p.website),
          admissions: str(p.admissions),
        }
      : EMPTY_PROFILE,
    /* Newest first, the way a career is read. A position still running comes
       before one that ended, whatever the dates say. */
    positions: (positions.data ?? [])
      .map((r: any): Position => ({
        id: r.id,
        title: str(r.title),
        organisation: str(r.organisation),
        employment: (r.employment ?? "full_time") as Employment,
        location: str(r.location),
        startedOn: r.started_on ?? null,
        endedOn: r.ended_on ?? null,
        current: !!r.current,
        summary: str(r.summary),
        skills: arr(r.skills),
      }))
      .sort(
        (a: Position, b: Position) =>
          Number(b.current) - Number(a.current) ||
          (b.startedOn ?? "").localeCompare(a.startedOn ?? ""),
      ),
    education: (education.data ?? [])
      .map((r: any): Education => ({
        id: r.id,
        institution: str(r.institution),
        qualification: str(r.qualification),
        field: str(r.field),
        startedOn: r.started_on ?? null,
        endedOn: r.ended_on ?? null,
        note: str(r.note),
      }))
      .sort((a: Education, b: Education) => (b.endedOn ?? "").localeCompare(a.endedOn ?? "")),
    credentials: (credentials.data ?? [])
      .map((r: any): Credential => ({
        id: r.id,
        name: str(r.name),
        issuer: str(r.issuer),
        issuedOn: r.issued_on ?? null,
        expiresOn: r.expires_on ?? null,
        credentialId: str(r.credential_id),
        url: str(r.url),
        skills: arr(r.skills),
      }))
      .sort((a: Credential, b: Credential) => (b.issuedOn ?? "").localeCompare(a.issuedOn ?? "")),
    skills: (skills.data ?? []).map((r: any) => ({
      id: r.id,
      name: str(r.name),
      note: str(r.note),
    })),
    contacts: (contacts.data ?? []).map((r: any): Contact => ({
      id: r.id,
      name: str(r.name),
      organisation: str(r.organisation),
      role: str(r.role),
      location: str(r.location),
      email: str(r.email),
      phone: str(r.phone),
      howYouMet: str(r.how_you_met),
      closeness: (r.closeness ?? "known") as Closeness,
      expertise: arr(r.expertise),
      callOn: str(r.call_on),
      theyCallOn: str(r.they_call_on),
      notes: str(r.notes),
      lastContactOn: r.last_contact_on ?? null,
      archivedAt: r.archived_at ?? null,
    })),
    milestones: (milestones.data ?? [])
      .map((r: any): Milestone => ({
        id: r.id,
        contactId: r.contact_id ?? null,
        kind: (r.kind ?? "other") as MilestoneKind,
        headline: str(r.headline),
        note: str(r.note),
        happenedOn: r.happened_on ?? null,
      }))
      .sort((a: Milestone, b: Milestone) => (b.happenedOn ?? "").localeCompare(a.happenedOn ?? "")),
  };
}

export function useProfile(workspaceId: string | null) {
  return useQuery({
    queryKey: ["career-profile", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => loadProfile(workspaceId!),
  });
}

/* ---------------------------------------------------------------- writing */

const fail = ({ error }: { error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
};

/** Every write the profile and the register make. */
export function useProfileActions(workspaceId: string | null) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["career-profile", workspaceId] });
  const ws = () => {
    if (!workspaceId) throw new Error("No workspace is open.");
    return workspaceId;
  };
  const useAction = <T>(run: (input: T) => Promise<unknown>) =>
    useMutation({ mutationFn: run, onSuccess: refresh });

  const rowFor = (table: string) => ({
    add: (row: Record<string, unknown>) => db.from(table).insert({ workspace_id: ws(), ...row }),
    patch: (id: string, row: Record<string, unknown>) => db.from(table).update(row).eq("id", id),
    remove: (id: string) => db.from(table).delete().eq("id", id),
  });

  return {
    /* One row per person per workspace, made on first save. */
    saveProfile: useAction(async (patch: Partial<Profile>) =>
      fail(
        await db.from("career_profile").upsert(
          {
            workspace_id: ws(),
            headline: patch.headline ?? "",
            about: patch.about ?? "",
            location: patch.location ?? "",
            email: patch.email ?? "",
            phone: patch.phone ?? "",
            website: patch.website ?? "",
            admissions: patch.admissions ?? "",
          },
          { onConflict: "workspace_id,created_by" },
        ),
      ),
    ),

    addPosition: useAction(async (row: Record<string, unknown>) =>
      fail(await rowFor("career_positions").add(row)),
    ),
    patchPosition: useAction(async ({ id, row }: { id: string; row: Record<string, unknown> }) =>
      fail(await rowFor("career_positions").patch(id, row)),
    ),
    removePosition: useAction(async (id: string) =>
      fail(await rowFor("career_positions").remove(id)),
    ),

    addEducation: useAction(async (row: Record<string, unknown>) =>
      fail(await rowFor("career_education").add(row)),
    ),
    removeEducation: useAction(async (id: string) =>
      fail(await rowFor("career_education").remove(id)),
    ),

    addCredential: useAction(async (row: Record<string, unknown>) =>
      fail(await rowFor("career_credentials").add(row)),
    ),
    removeCredential: useAction(async (id: string) =>
      fail(await rowFor("career_credentials").remove(id)),
    ),

    addSkill: useAction(async (name: string) =>
      fail(
        await db
          .from("career_skills")
          .upsert(
            { workspace_id: ws(), name: name.trim() },
            { onConflict: "workspace_id,created_by,name" },
          ),
      ),
    ),
    removeSkill: useAction(async (id: string) => fail(await rowFor("career_skills").remove(id))),

    addContact: useAction(async (row: Record<string, unknown>) =>
      fail(await rowFor("career_contacts").add(row)),
    ),
    patchContact: useAction(async ({ id, row }: { id: string; row: Record<string, unknown> }) =>
      fail(await rowFor("career_contacts").patch(id, row)),
    ),
    removeContact: useAction(async (id: string) =>
      fail(await rowFor("career_contacts").remove(id)),
    ),

    addMilestone: useAction(async (row: Record<string, unknown>) =>
      fail(await rowFor("career_milestones").add(row)),
    ),
    removeMilestone: useAction(async (id: string) =>
      fail(await rowFor("career_milestones").remove(id)),
    ),
  };
}
