/**
 * The review, loaded once per matter and shared by every tab.
 *
 * Overview, Issues, Redline and Final all read the same six objects, and the
 * clause panel reads them too. One query keyed on the matter means a decision
 * taken on the Issues tab shows on the Overview counts without a reload.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Clause } from "@/data/legal";
import {
  createIssue,
  decideAmendment,
  decideIssue,
  extractKeyTerms,
  finishReviewRun,
  loadReview,
  proposeAmendment,
  researchIssue,
  reviewClauses,
  saveReviewMandate,
  setKeyTerm,
  updateIssue,
} from "./functions";
import { checkScheduleConformity } from "./conformity.functions";
import {
  clauseReview,
  emptyMandate,
  reviewProgress,
  sortIssues,
  type Amendment,
  type Assessment,
  type Instruction,
  type Issue,
  type KeyTerm,
  type ReviewMandate,
} from "./model";

export type ReviewData = {
  mandate: ReviewMandate;
  matter: {
    id: string;
    name: string;
    client: string;
    counterparty: string;
    matterType: string;
    governingLaw: string;
  };
  assessments: Assessment[];
  issues: Issue[];
  /** When the clause register was last rebuilt, or null if unknown. */
  registerBuiltAt?: string | null;
  amendments: Amendment[];
  keyTerms: KeyTerm[];
  instructions: Instruction[];
};

const EMPTY: ReviewData = {
  mandate: emptyMandate(),
  matter: {
    id: "",
    name: "",
    client: "",
    counterparty: "",
    matterType: "",
    governingLaw: "",
  },
  assessments: [],
  issues: [],
  registerBuiltAt: null,
  amendments: [],
  keyTerms: [],
  instructions: [],
};

export function useReview(matterId: string | null, clauses: Clause[]) {
  const qc = useQueryClient();
  const key = ["contract-review", matterId];
  const query = useQuery({
    queryKey: key,
    enabled: !!matterId,
    queryFn: async () => (await loadReview({ data: { matterId: matterId! } })) as ReviewData,
  });
  const data = query.data ?? EMPTY;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["contract-review", matterId] });
  // The clause row carries the risk and review state the editor reads, so a
  // review run has to refresh the matter as well as the review.
  const refreshAll = () => {
    refresh();
    void qc.invalidateQueries({ queryKey: ["matter", matterId] });
    void qc.invalidateQueries({ queryKey: ["matter-data"] });
  };

  const derived = useMemo(() => {
    const order = new Map(clauses.map((c, i) => [c.id, i]));
    const byClause = new Map(
      clauses.map((c) => [
        c.id,
        clauseReview(c, {
          assessments: data.assessments,
          issues: data.issues,
          amendments: data.amendments,
          instructions: data.instructions,
        }),
      ]),
    );
    return {
      byClause,
      order,
      progress: reviewProgress(clauses, data.assessments, data.issues, data.amendments),
      open: sortIssues(
        data.issues.filter((i) => i.status === "open"),
        order,
      ),
      decided: sortIssues(
        data.issues.filter((i) => i.status !== "open"),
        order,
      ),
      matterInstructions: data.instructions.filter((i) => i.clauseId === null),
    };
  }, [clauses, data]);

  // Named so the hook rules can see it: every one of these is called
  // unconditionally, in the same order, on every render.
  const useAction = <T>(fn: (input: T) => Promise<unknown>, after: () => void = refresh) =>
    useMutation({ mutationFn: (input: T) => fn(input), onSuccess: after });

  return {
    ...data,
    ...derived,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refresh,
    refreshAll,
    /* Every write the review screens make, each refreshing what it changed. */
    saveMandate: useAction<Parameters<typeof saveReviewMandate>[0]["data"]>((d) =>
      saveReviewMandate({ data: d }),
    ),
    runReview: useAction<Parameters<typeof reviewClauses>[0]["data"]>(
      (d) => reviewClauses({ data: d }),
      refreshAll,
    ),
    finishRun: useAction<Parameters<typeof finishReviewRun>[0]["data"]>((d) =>
      finishReviewRun({ data: d }),
    ),
    runKeyTerms: useAction<Parameters<typeof extractKeyTerms>[0]["data"]>((d) =>
      extractKeyTerms({ data: d }),
    ),
    saveKeyTerm: useAction<Parameters<typeof setKeyTerm>[0]["data"]>((d) =>
      setKeyTerm({ data: d }),
    ),
    addIssue: useAction<Parameters<typeof createIssue>[0]["data"]>((d) => createIssue({ data: d })),
    editIssue: useAction<Parameters<typeof updateIssue>[0]["data"]>((d) =>
      updateIssue({ data: d }),
    ),
    decide: useAction<Parameters<typeof decideIssue>[0]["data"]>((d) => decideIssue({ data: d })),
    propose: useAction<Parameters<typeof proposeAmendment>[0]["data"]>((d) =>
      proposeAmendment({ data: d }),
    ),
    decideAmend: useAction<Parameters<typeof decideAmendment>[0]["data"]>(
      (d) => decideAmendment({ data: d }),
      refreshAll,
    ),
    research: useAction<Parameters<typeof researchIssue>[0]["data"]>((d) =>
      researchIssue({ data: d }),
    ),
    /** Does the agreement agree with its schedules? Raises Conformity issues. */
    checkSchedules: useAction<{ matterId: string }>((d) => checkScheduleConformity({ data: d })),
  };
}

export type Review = ReturnType<typeof useReview>;
