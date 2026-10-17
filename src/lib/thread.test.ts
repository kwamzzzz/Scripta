/**
 * The predicates, against the same table of cases as the SQL suite.
 *
 * These are not tests that the interface works. They are tests that the
 * interface's opinion about who may do what matches the database's, because the
 * two are written in different languages and the day they diverge is the day
 * somebody is shown a Resolve that does nothing — or, far worse, is not shown
 * one they were entitled to and concludes the thread is somebody else's problem.
 *
 * Every case here has a counterpart in `supabase/tests/phase4_thread.sql`.
 */
import { describe, expect, it } from "vitest";
import {
  buildThread,
  editedLabel,
  mayDelete,
  mayEdit,
  mayResolve,
  NO_ACCESS,
  type Comment,
  type ThreadContext,
} from "@/lib/thread";

const ME = "6df711b6-27b0-4aaf-8129-ef39700de7bb";
const THEM = "176d2a8c-10f1-429b-82f2-dde207c99a68";
const THIRD = "00000000-0000-0000-0000-000000000003";

const context = (over: Partial<ThreadContext> = {}): ThreadContext => ({
  matterId: "matter",
  ownerId: null,
  myRole: "editor",
  mayComment: true,
  ...over,
});

const comment = (over: Partial<Comment> = {}): Comment => ({
  id: "c1",
  parentId: null,
  entityKind: "task",
  entityId: "t1",
  body: "Body",
  authorId: ME,
  resolved: false,
  createdAt: "2026-09-15T09:00:00.000Z",
  updatedAt: null,
  mentions: [],
  kind: "note",
  ...over,
});

describe("mayResolve — resolution is earned, not granted by role", () => {
  it("lets the person who raised it close it", () => {
    expect(mayResolve(comment({ authorId: ME }), context(), ME)).toBe(true);
  });

  it("lets the person responsible for the work close it", () => {
    expect(mayResolve(comment({ authorId: THEM }), context({ ownerId: ME }), ME)).toBe(true);
  });

  it("lets the Lead close anything on their matter", () => {
    expect(
      mayResolve(comment({ authorId: THEM }), context({ myRole: "lead", ownerId: THIRD }), ME),
    ).toBe(true);
  });

  it("refuses an Editor who neither raised it nor owns the work", () => {
    expect(
      mayResolve(comment({ authorId: THEM }), context({ myRole: "editor", ownerId: THIRD }), ME),
    ).toBe(false);
  });

  /* The null branch. Where nobody is responsible the rule narrows to the raiser
     and the Lead — it does not fall open to every Editor, which is the mistake
     the Phase 3 defects all made in one form or another. */
  it("narrows to the raiser and the Lead where nobody is responsible", () => {
    const orphan = context({ ownerId: null, myRole: "editor" });
    expect(mayResolve(comment({ authorId: THEM }), orphan, ME)).toBe(false);
    expect(mayResolve(comment({ authorId: ME }), orphan, ME)).toBe(true);
    expect(mayResolve(comment({ authorId: THEM }), { ...orphan, myRole: "lead" }, ME)).toBe(true);
  });

  it("refuses a Viewer even on a thread they raised", () => {
    const viewer = context({ myRole: "viewer", mayComment: false });
    expect(mayResolve(comment({ authorId: ME }), viewer, ME)).toBe(false);
  });

  it("refuses a non-member outright", () => {
    expect(mayResolve(comment({ authorId: ME }), NO_ACCESS, ME)).toBe(false);
  });

  it("refuses when nobody is signed in", () => {
    expect(mayResolve(comment(), context(), null)).toBe(false);
  });

  /* An owner id that matches nobody must not become a match. */
  it("does not treat a null owner as matching a null user", () => {
    expect(mayResolve(comment({ authorId: THEM }), context({ ownerId: null }), null)).toBe(false);
  });
});

describe("mayEdit — the author, and nobody else", () => {
  it("lets the author edit", () => {
    expect(mayEdit(comment({ authorId: ME }), context(), ME)).toBe(true);
  });

  it("refuses everybody else, including the Lead", () => {
    expect(mayEdit(comment({ authorId: THEM }), context({ myRole: "lead" }), ME)).toBe(false);
  });

  it("refuses a Viewer on their own comment, because they may no longer write", () => {
    expect(mayEdit(comment({ authorId: ME }), context({ myRole: "viewer", mayComment: false }), ME)).toBe(
      false,
    );
  });
});

describe("mayDelete — the author, or the Lead", () => {
  it("lets the author delete", () => {
    expect(mayDelete(comment({ authorId: ME }), context(), ME)).toBe(true);
  });

  it("lets the Lead delete somebody else's", () => {
    expect(mayDelete(comment({ authorId: THEM }), context({ myRole: "lead" }), ME)).toBe(true);
  });

  it("refuses an Editor on somebody else's", () => {
    expect(mayDelete(comment({ authorId: THEM }), context({ myRole: "editor" }), ME)).toBe(false);
  });

  /* A Lead may remove a comment from the record and may not rewrite one. */
  it("is wider than mayEdit for a Lead, which is the asymmetry we want", () => {
    const asLead = context({ myRole: "lead" });
    const theirs = comment({ authorId: THEM });
    expect(mayDelete(theirs, asLead, ME)).toBe(true);
    expect(mayEdit(theirs, asLead, ME)).toBe(false);
  });
});

describe("buildThread", () => {
  it("reads downwards: roots oldest first, replies under their root", () => {
    const items = buildThread([
      comment({ id: "r2", createdAt: "2026-09-15T11:00:00.000Z" }),
      comment({ id: "r1", createdAt: "2026-09-15T09:00:00.000Z" }),
      comment({ id: "a2", parentId: "r1", createdAt: "2026-09-15T10:30:00.000Z" }),
      comment({ id: "a1", parentId: "r1", createdAt: "2026-09-15T10:00:00.000Z" }),
    ]);
    expect(items.map((i) => i.comment.id)).toEqual(["r1", "r2"]);
    expect(items[0]!.replies.map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(items[1]!.replies).toEqual([]);
  });

  /* A reply whose root is not in the set — filtered out by RLS, or deleted
     between the two reads — must not vanish the root it was attached to, and
     must not surface as a root of its own pretending to start a discussion. */
  it("drops an orphaned reply rather than promoting it to a root", () => {
    const items = buildThread([comment({ id: "a1", parentId: "gone" })]);
    expect(items).toEqual([]);
  });

  it("handles an empty thread", () => {
    expect(buildThread([])).toEqual([]);
  });
});

describe("editedLabel — an edit says so", () => {
  it("says nothing about a comment that was never edited", () => {
    expect(editedLabel({ updatedAt: null })).toBeNull();
  });

  it("marks one that was", () => {
    expect(editedLabel({ updatedAt: "2026-09-15T09:00:00.000Z" })).toContain("Edited");
  });

  it("still marks it when the time cannot be read", () => {
    expect(editedLabel({ updatedAt: "not a date" })).toBe("Edited");
  });
});
