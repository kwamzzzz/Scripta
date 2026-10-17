import { describe, expect, it } from "vitest";
import { describeFailure, isWatchedWrite, tableOf } from "./write-health";

const REST = "https://abc.supabase.co/rest/v1/";

describe("which requests are worth watching", () => {
  it("watches writes to the database", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"])
      expect(isWatchedWrite(`${REST}matter_flows`, method)).toBe(true);
  });

  it("ignores reads, which fail visibly — the thing you asked for is not there", () => {
    expect(isWatchedWrite(`${REST}matter_flows?select=id`, "GET")).toBe(false);
    expect(isWatchedWrite(`${REST}matter_flows`, "HEAD")).toBe(false);
  });

  it("watches uploads, because a file that did not arrive is lost work too", () => {
    expect(isWatchedWrite("https://abc.supabase.co/storage/v1/object/x.docx", "POST")).toBe(true);
  });

  /** It runs on a timer and retries itself; a banner would cry wolf. */
  it("ignores the token refresh", () => {
    expect(
      isWatchedWrite("https://abc.supabase.co/auth/v1/token?grant_type=refresh_token", "POST"),
    ).toBe(false);
  });

  it("ignores everything that is not the database", () => {
    expect(isWatchedWrite("https://example.com/api/thing", "POST")).toBe(false);
  });
});

describe("naming what failed", () => {
  it("reads the table out of the url", () => {
    expect(tableOf(`${REST}flow_phases?id=eq.1`)).toBe("flow_phases");
    expect(tableOf(`${REST}tasks`)).toBe("tasks");
  });

  it("says nothing rather than something wrong", () => {
    expect(tableOf("https://example.com/nothing")).toBe("");
  });
});

describe("what the person is told", () => {
  it("prefers the database's own words", () => {
    expect(describeFailure(400, JSON.stringify({ message: 'null value in column "name"' }))).toBe(
      'null value in column "name"',
    );
  });

  it("keeps the hint, which is usually the actionable half", () => {
    expect(
      describeFailure(
        400,
        JSON.stringify({ message: "column x does not exist", hint: "Perhaps y" }),
      ),
    ).toBe("column x does not exist (Perhaps y)");
  });

  /** The case that cost a working day: refused, with nothing said. */
  it("explains a refusal in terms of what to do about it", () => {
    expect(describeFailure(401, "")).toMatch(/signed in|permission/i);
    expect(describeFailure(403, "")).toMatch(/signed in|permission/i);
  });

  it("falls back to the status when the body is not JSON", () => {
    expect(describeFailure(500, "<html>nope</html>")).toContain("500");
  });

  it("says the database was unreachable when nothing came back at all", () => {
    expect(describeFailure(0, "")).toMatch(/could not be reached/i);
  });
});

/**
 * RPC is not a table, and the net cannot tell a read from a write.
 *
 * The assertion this block exists for is R1: A FAILED RPC NEVER CLAIMS WORK
 * WAS LOST.
 *
 * Phase 5's editor keeps unsaved wording on screen on purpose — when the
 * database refuses a save because a colleague holds the clause, the refusal's
 * whole promise is that the words are still there. The net fired alongside
 * that refusal, called it "a change to “rpc”", and offered RELOAD: the one
 * action that throws the sentence away, directly under a message saying it was
 * safe.
 *
 * Found in the Phase 5 browser acceptance.
 */
describe("rpc calls are not watched writes", () => {
  const RPC = "https://abc.supabase.co/rest/v1/rpc/";

  /* R1. */
  it("does not treat a refused save_clause_doc as a lost write", () => {
    expect(isWatchedWrite(`${RPC}save_clause_doc`, "POST")).toBe(false);
  });

  it("nor a read that PostgREST happens to require a POST for", () => {
    for (const fn of ["events_involving_me", "clause_context", "thread_context"]) {
      expect(isWatchedWrite(`${RPC}${fn}`, "POST")).toBe(false);
    }
  });

  /* The net still covers everything it was built for. Phase 5 did not turn it
     off, it moved one class of call out of it. */
  it("still watches ordinary table writes", () => {
    expect(isWatchedWrite("https://abc.supabase.co/rest/v1/clauses", "PATCH")).toBe(true);
    expect(isWatchedWrite("https://abc.supabase.co/rest/v1/comments", "POST")).toBe(true);
  });

  it("and still watches uploads", () => {
    expect(isWatchedWrite("https://abc.supabase.co/storage/v1/object/x.docx", "POST")).toBe(true);
  });
});
