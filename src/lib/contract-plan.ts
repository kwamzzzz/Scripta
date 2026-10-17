/**
 * The clause skeleton a lawyer approves before any contract prose is drafted.
 *
 * `purpose` steers the later drafting call. It is working metadata and is not
 * part of the assembled contract.
 */
export type ClausePlan = {
  num: string;
  title: string;
  purpose: string;
};

export type ContractPlan = {
  agreementType: string;
  governingLaw: string;
  clauses: ClausePlan[];
};

export type NewClausePlan = Pick<ClausePlan, "title" | "purpose">;

const withClauses = (plan: ContractPlan, clauses: ClausePlan[]): ContractPlan => ({
  ...plan,
  clauses,
});

const assertExistingIndex = (plan: ContractPlan, index: number, label: string): void => {
  if (!Number.isInteger(index) || index < 0 || index >= plan.clauses.length) {
    throw new RangeError(`${label} must identify an existing clause.`);
  }
};

const assertInsertionIndex = (plan: ContractPlan, index: number): void => {
  if (!Number.isInteger(index) || index < 0 || index > plan.clauses.length) {
    throw new RangeError(
      "Insert index must be between the first position and the end of the plan.",
    );
  }
};

const oneLine = (value: string): string => value.replace(/\s+/g, " ").trim();

/** Renumber every top-level clause in its current order, starting at 1. */
export function renumberPlan(plan: ContractPlan): ContractPlan {
  return withClauses(
    plan,
    plan.clauses.map((clause, index) => ({ ...clause, num: String(index + 1) })),
  );
}

/** Move one clause to another zero-based position and renumber the result. */
export function reorderClause(
  plan: ContractPlan,
  fromIndex: number,
  toIndex: number,
): ContractPlan {
  assertExistingIndex(plan, fromIndex, "Source index");
  assertExistingIndex(plan, toIndex, "Destination index");

  const clauses = [...plan.clauses];
  const [moved] = clauses.splice(fromIndex, 1);
  clauses.splice(toIndex, 0, moved!);
  return renumberPlan(withClauses(plan, clauses));
}

/** Rename a clause without changing its purpose or position. */
export function renameClause(plan: ContractPlan, index: number, title: string): ContractPlan {
  assertExistingIndex(plan, index, "Clause index");
  return withClauses(
    plan,
    plan.clauses.map((clause, at) => (at === index ? { ...clause, title: title.trim() } : clause)),
  );
}

/** Delete a clause and close every numbering gap left behind. */
export function deleteClause(plan: ContractPlan, index: number): ContractPlan {
  assertExistingIndex(plan, index, "Clause index");
  return renumberPlan(
    withClauses(
      plan,
      plan.clauses.filter((_, at) => at !== index),
    ),
  );
}

/** Insert a new clause at a zero-based position and renumber the whole plan. */
export function insertClause(
  plan: ContractPlan,
  index: number,
  clause: NewClausePlan,
): ContractPlan {
  assertInsertionIndex(plan, index);
  const clauses = [...plan.clauses];
  clauses.splice(index, 0, {
    num: "",
    title: clause.title.trim(),
    purpose: oneLine(clause.purpose),
  });
  return renumberPlan(withClauses(plan, clauses));
}

/**
 * Explain every structural reason a plan cannot yet be drafted.
 *
 * The caller decides how to present these. Keeping them as specific messages
 * lets a screen refuse the drafting step without discarding the lawyer's plan.
 */
export function planProblems(plan: ContractPlan): string[] {
  if (plan.clauses.length === 0) return ["A contract plan must contain at least one clause."];

  const problems: string[] = [];
  const numberCounts = new Map<string, number>();

  plan.clauses.forEach((clause, index) => {
    const num = clause.num.trim();
    numberCounts.set(num, (numberCounts.get(num) ?? 0) + 1);
    if (!clause.title.trim()) {
      problems.push(
        num ? `Clause ${num} needs a title.` : `The clause at position ${index + 1} needs a title.`,
      );
    }
  });

  for (const [num, count] of numberCounts) {
    if (count > 1) {
      problems.push(
        num
          ? `Clause number ${num} is used more than once.`
          : "More than one clause has an empty number.",
      );
    }
  }

  return problems;
}
