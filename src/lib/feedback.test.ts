import { describe, expect, it } from "vitest";
import {
  FEEDBACK_MAX_LENGTH,
  canReviewFeedback,
  canTransition,
  feedbackMessageError,
  nextStatuses,
  type FeedbackStatus,
} from "@/lib/feedback";

const ALL: FeedbackStatus[] = ["unread", "read", "resolved"];

describe("canReviewFeedback", () => {
  it("admits the two roles that run a workspace", () => {
    expect(canReviewFeedback("owner")).toBe(true);
    expect(canReviewFeedback("admin")).toBe(true);
  });

  it("refuses everyone else, including the roles that can write matters", () => {
    expect(canReviewFeedback("lawyer")).toBe(false);
    expect(canReviewFeedback("viewer")).toBe(false);
  });

  it("refuses an absent or unrecognised role rather than defaulting open", () => {
    expect(canReviewFeedback(null)).toBe(false);
    expect(canReviewFeedback(undefined)).toBe(false);
    expect(canReviewFeedback("")).toBe(false);
    expect(canReviewFeedback("Admin")).toBe(false);
  });
});

describe("the status flow", () => {
  it("moves an unread item to read or straight to resolved", () => {
    expect(nextStatuses("unread")).toEqual(["read", "resolved"]);
  });

  it("resolves a read item, and reopens a resolved one", () => {
    expect(nextStatuses("read")).toEqual(["resolved"]);
    expect(nextStatuses("resolved")).toEqual(["read"]);
  });

  it("never returns to unread, because an admin has already seen it", () => {
    for (const from of ALL) expect(canTransition(from, "unread")).toBe(false);
  });

  it("offers no transition to the status an item already holds", () => {
    for (const from of ALL) expect(canTransition(from, from)).toBe(false);
  });

  it("agrees with the list it offers", () => {
    for (const from of ALL)
      for (const to of ALL) expect(canTransition(from, to)).toBe(nextStatuses(from).includes(to));
  });
});

describe("feedbackMessageError", () => {
  it("accepts an ordinary message", () => {
    expect(feedbackMessageError("The clause list scrolls to the top on save.")).toBeNull();
  });

  it("rejects a message that is only whitespace", () => {
    expect(feedbackMessageError("   \n\t ")).toBe("Write something first.");
  });

  it("measures the overrun after trimming", () => {
    const long = `  ${"x".repeat(FEEDBACK_MAX_LENGTH + 3)}  `;
    expect(feedbackMessageError(long)).toBe("That is 3 characters too long.");
  });

  it("accepts a message exactly at the limit", () => {
    expect(feedbackMessageError("x".repeat(FEEDBACK_MAX_LENGTH))).toBeNull();
  });
});
