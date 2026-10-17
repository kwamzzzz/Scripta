/**
 * The four states a lawyer sees, from the two facts the database keeps.
 *
 * The assertion this file exists for is K1: AN APPROVAL THAT NO LONGER APPLIES
 * TO THE WORDING DOES NOT READ AS APPROVED.
 *
 * That is the one piece of the approval rule the interface computes for itself
 * rather than asking the server, so it is the one piece that could disagree
 * with the server. `knowledge_approved()` in SQL and `stateOf()` here have to
 * mean the same thing, and these cases are what keeps them honest.
 */
import { describe, expect, it } from "vitest";
import { approvalWentStale, stateOf, STATE_LABEL, type KnowledgeFacts } from "./knowledge";

const facts = (over: Partial<KnowledgeFacts> = {}): KnowledgeFacts => ({
  visibility: "firm",
  approvedAt: null,
  contentChangedAt: "2026-09-01T10:00:00.000Z",
  ...over,
});

describe("the four knowledge states", () => {
  it("private and shared are never approved, whatever else is true", () => {
    expect(stateOf(facts({ visibility: "private", approvedAt: "2026-09-02T10:00:00.000Z" }))).toBe(
      "private",
    );
    expect(stateOf(facts({ visibility: "shared", approvedAt: "2026-09-02T10:00:00.000Z" }))).toBe(
      "shared",
    );
  });

  it("firm-wide on its own is not approved", () => {
    expect(stateOf(facts())).toBe("firm");
  });

  it("firm-wide and approved after the last change is approved", () => {
    expect(stateOf(facts({ approvedAt: "2026-09-02T10:00:00.000Z" }))).toBe("approved");
  });

  /* K1. */
  it("an approval overtaken by an amendment stops reading as approved", () => {
    expect(
      stateOf(
        facts({
          approvedAt: "2026-09-02T10:00:00.000Z",
          contentChangedAt: "2026-09-03T09:00:00.000Z",
        }),
      ),
    ).toBe("firm");
  });

  it("and the interface can tell that from never having been approved", () => {
    const stale = facts({
      approvedAt: "2026-09-02T10:00:00.000Z",
      contentChangedAt: "2026-09-03T09:00:00.000Z",
    });
    const never = facts();
    expect(approvalWentStale(stale)).toBe(true);
    expect(approvalWentStale(never)).toBe(false);
    expect(stateOf(stale)).toBe(stateOf(never));
  });

  /* Approving at the same instant as the last change counts, matching the
     server's `>=`. The two must agree or the badge and the database disagree. */
  it("approving something at the instant it last changed counts", () => {
    expect(
      stateOf(
        facts({
          approvedAt: "2026-09-01T10:00:00.000Z",
          contentChangedAt: "2026-09-01T10:00:00.000Z",
        }),
      ),
    ).toBe("approved");
  });

  it("copes with knowledge that has never recorded a change", () => {
    expect(stateOf(facts({ approvedAt: "2026-09-02T10:00:00.000Z", contentChangedAt: null }))).toBe(
      "approved",
    );
  });

  it("names every state in words a lawyer uses, not column values", () => {
    expect(Object.values(STATE_LABEL)).toEqual(["Private", "Shared", "Firm-wide", "Approved"]);
  });
});
