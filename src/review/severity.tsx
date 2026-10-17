/** Provides the clause marks the navigator reads. */
import type { ReactNode } from "react";
import { ClauseMarkCtx, type ClauseMark } from "./clause-marks";

export function ClauseMarksProvider({
  marks,
  children,
}: {
  marks: Map<string, ClauseMark>;
  children: ReactNode;
}) {
  return <ClauseMarkCtx.Provider value={marks}>{children}</ClauseMarkCtx.Provider>;
}
