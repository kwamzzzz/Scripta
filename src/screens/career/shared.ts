/** What every view of the career portal is handed. */
import type { useCareerActions, CareerRecord } from "@/lib/career/data";
import type { useProfileActions, ProfileRecord } from "@/lib/career/profile";
import type { CareerRole, Criterion, Evidence, RoleReading } from "@/lib/career/model";
import type { CareerTab } from "../CareerScreen";

export type Reading = RoleReading & {
  criteria: Criterion[];
  /** The evidence claimed against each criterion, by criterion id. */
  claimed: Map<string, Evidence[]>;
};

export type ViewProps = {
  record: CareerRecord;
  role: CareerRole | null;
  reading: Reading | null;
  actions: ReturnType<typeof useCareerActions>;
  go: (tab: CareerTab, roleId?: string) => void;
  onProblem: (message: string | null) => void;
};

export const say = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/** What the profile and the register are handed. Their own record, their own writes. */
export type ProfileProps = {
  record: ProfileRecord;
  actions: ReturnType<typeof useProfileActions>;
  onProblem: (message: string | null) => void;
};
