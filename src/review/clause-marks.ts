/**
 * Review severity, shared with the clause navigator.
 *
 * The navigator already showed which clauses carry a change. What it could not
 * show was which ones carry a problem, because the review had nowhere to record
 * one. A context rather than a prop thread: the navigator is four components
 * deep inside the editor, and this is the only thing it needs from the review.
 */
import { createContext, useContext } from "react";
import type { Severity } from "./model";

export type ClauseMark = { severity: Severity | null; reviewed: boolean; open: number };

export const ClauseMarkCtx = createContext<Map<string, ClauseMark>>(new Map());

/** The mark for one clause. Undefined outside a review screen, which draws nothing. */
export const useClauseMark = (clauseId: string) => useContext(ClauseMarkCtx).get(clauseId);
