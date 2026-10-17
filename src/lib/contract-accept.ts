import { assembleFreshContract, type ClauseRowPlan } from "@/lib/contract-assembly";
import { summariseRun, type ClauseDraftOutcome } from "@/lib/contract-draft";
import { planProblems, type ContractPlan } from "@/lib/contract-plan";

/**
 * Prove that the wording being accepted is one complete run of this exact
 * approved plan, then assemble it in the shape the database transaction takes.
 */
export function acceptedDraftRows(
  plan: ContractPlan,
  outcomes: ClauseDraftOutcome[],
): ClauseRowPlan[] {
  const problems = planProblems(plan);
  if (problems.length) throw new Error(problems.join(" "));

  const run = summariseRun(outcomes);
  if (!run.complete)
    throw new Error(
      run.failed.length
        ? "Retry every failed clause before accepting this contract."
        : "Draft every clause before accepting this contract.",
    );

  const successful = new Map<string, Extract<ClauseDraftOutcome, { ok: true }>>();
  for (const outcome of outcomes) {
    if (!outcome.ok) continue;
    if (successful.has(outcome.num))
      throw new Error(`Clause ${outcome.num} was drafted more than once.`);
    successful.set(outcome.num, outcome);
  }
  if (successful.size !== plan.clauses.length)
    throw new Error("The completed wording does not match every clause in the approved plan.");

  const drafted = plan.clauses.map((clause) => {
    const outcome = successful.get(clause.num);
    if (!outcome) throw new Error(`Clause ${clause.num} has not been drafted.`);
    if (outcome.title.trim() !== clause.title.trim())
      throw new Error(`Clause ${clause.num} no longer matches the approved plan title.`);
    return { num: clause.num, title: clause.title, text: outcome.text };
  });

  const rows = assembleFreshContract(drafted);
  // The guard is that nothing was dropped for being empty, not that the counts
  // match: a clause now yields a row for itself and one for each of its parts,
  // so a five-clause plan can quite properly produce thirty rows.
  const written = new Set(rows.map((r) => r.num));
  const empty = plan.clauses.filter((c) => !written.has(c.num));
  if (empty.length)
    throw new Error(
      `Every accepted clause must contain wording. Clause ${empty[0]!.num} has none.`,
    );
  return rows;
}
