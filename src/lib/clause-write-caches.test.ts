/**
 * The pane must not contradict the button you pressed in it.
 *
 * `useClauseActions.done()`, the restore in `clause-versions.ts` and the
 * realtime handler in `live.ts` each kept their own list of what a clause write
 * makes stale, and only the restore path listed `matter-changes`. So the
 * Changes pane settled a change with its own button and went on showing it.
 *
 * There is no hook tier in this suite, so these assert the shared list itself
 * and the fact that all three writers now read from it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLAUSE_WRITE_CACHES, refreshAfterClauseWrite } from "./tracked-clause";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("the caches a clause write makes stale", () => {
  it("includes the Changes pane, which is the one that was missing", () => {
    expect(CLAUSE_WRITE_CACHES).toContain("matter-changes");
  });

  it("still refreshes the clause itself, its standing, and the matter", () => {
    expect([...CLAUSE_WRITE_CACHES]).toEqual([
      "tracked-clause",
      "clause-context",
      "matter-data",
      "matter-changes",
    ]);
  });

  it("invalidates every one of them, once each", () => {
    const asked: unknown[][] = [];
    refreshAfterClauseWrite({
      invalidateQueries: ({ queryKey }) => asked.push(queryKey),
    });
    expect(asked).toEqual(CLAUSE_WRITE_CACHES.map((key) => [key]));
  });

  /* The drift is what caused this, so the guard is against drifting back:
     a writer that spells its own list again is a writer that can fall behind. */
  it("is the only list — the restore and realtime paths read it rather than repeat it", () => {
    for (const path of ["./clause-versions.ts", "./live.ts"]) {
      const text = source(path);
      expect(text).toMatch(/CLAUSE_WRITE_CACHES|refreshAfterClauseWrite/);
      expect(text).not.toMatch(/queryKey: \["(clause-context|matter-data)"/);
    }
  });
});
