/**
 * The selection a deep link asks for survives the data arriving.
 *
 * ---------------------------------------------------------------------------
 * THE ASSERTION THIS FILE EXISTS FOR
 * ---------------------------------------------------------------------------
 *
 * D1: A SELECTION IS NOT WIPED BEFORE THERE IS ANYTHING TO CHECK IT AGAINST.
 *
 * Every entry in the awareness bell deep-links as `?clause=<id>`, and that is
 * the layer's whole justification — Phase 4's acceptance failed because Kwame
 * could not find a review on a one-contract matter, and "open the matter and
 * hunt" is what the bell was built to replace.
 *
 * The reconciliation effect ran once while the matter data was still empty,
 * found no clause with that id in a list of none, fell through to `clauses[0]`
 * — undefined — and wrote "" over the selection. By the time the clauses
 * arrived the id had gone, and the deep link landed on clause 1.1 every time.
 *
 * Found in the Phase 5 browser acceptance by hard-reloading a deep link and
 * reading what was actually selected. No unit test could have caught it,
 * because the bug lived entirely in the ORDER things load.
 */
import { describe, expect, it } from "vitest";
import { reconcileSelection } from "./app";

const clauses = [{ id: "c1" }, { id: "c2" }, { id: "c3" }];
const playbook = [{ id: "p1" }, { id: "p2" }];
const empty = { clauses: [], playbook: [] };

describe("keeping a selection valid as data arrives", () => {
  /* D1. */
  it("leaves a deep-linked clause alone while the data is still loading", () => {
    const next = reconcileSelection({ selClause: "c3", selRule: "" }, empty);
    expect(next.selClause).toBe("c3");
  });

  it("and honours it once the clauses arrive", () => {
    const loading = reconcileSelection({ selClause: "c3", selRule: "" }, empty);
    const loaded = reconcileSelection(loading, { clauses, playbook });
    expect(loaded.selClause).toBe("c3");
  });

  it("falls back to the first clause when the id is genuinely not there", () => {
    const next = reconcileSelection({ selClause: "gone", selRule: "" }, { clauses, playbook });
    expect(next.selClause).toBe("c1");
  });

  it("keeps a valid selection untouched", () => {
    const next = reconcileSelection({ selClause: "c2", selRule: "p2" }, { clauses, playbook });
    expect(next).toEqual({ selClause: "c2", selRule: "p2" });
  });

  /* The two lists load independently, so one arriving must not reconcile the
     other out of existence. */
  it("reconciles each list only once that list has loaded", () => {
    const next = reconcileSelection(
      { selClause: "c3", selRule: "p2" },
      { clauses, playbook: [] },
    );
    expect(next).toEqual({ selClause: "c3", selRule: "p2" });
  });

  it("selects nothing when a loaded matter genuinely has no clauses", () => {
    const next = reconcileSelection({ selClause: "c1", selRule: "" }, { clauses: [], playbook });
    expect(next.selClause).toBe("c1");
    expect(next.selRule).toBe("p1");
  });
});
