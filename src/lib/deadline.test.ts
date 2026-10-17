/**
 * A screen waiting for ever is worse than a screen saying it gave up: the
 * first looks like an empty document, the second can be retried.
 */
import { describe, expect, it, vi } from "vitest";
import { Overdue, withDeadline } from "./deadline";

describe("withDeadline", () => {
  it("passes the answer straight through when it arrives in time", async () => {
    await expect(withDeadline(Promise.resolve("here"), 5, "The document")).resolves.toBe("here");
  });

  it("keeps the original failure rather than replacing it with a timeout", async () => {
    await expect(
      withDeadline(Promise.reject(new Error("Matter not found")), 5, "The document"),
    ).rejects.toThrow("Matter not found");
  });

  it("gives up, in words a person can act on", async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => {});
    const raced = withDeadline(never, 25, "The document");
    const read = expect(raced).rejects.toThrow(/did not come back within 25 seconds. Try again./);
    await vi.advanceTimersByTimeAsync(25_000);
    await read;
    vi.useRealTimers();
  });

  it("names what timed out, so two calls are told apart", () => {
    expect(new Overdue("The preview", 60).message).toContain("The preview");
  });
});
