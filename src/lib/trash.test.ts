import { describe, expect, it } from "vitest";
import { binCountdown, daysLeft, RECENTLY_DELETED_DAYS } from "./trash";

const at = (iso: string) => new Date(iso);

describe("the grace period", () => {
  it("is fifteen days, the same number the database purges on", () => {
    expect(RECENTLY_DELETED_DAYS).toBe(15);
  });

  it("counts down from the day it was deleted", () => {
    const deleted = "2026-09-01T09:00:00.000Z";
    expect(daysLeft(deleted, at("2026-09-01T09:00:00.000Z"))).toBe(15);
    expect(daysLeft(deleted, at("2026-09-08T09:00:00.000Z"))).toBe(8);
    expect(daysLeft(deleted, at("2026-09-15T09:00:00.000Z"))).toBe(1);
  });

  it("never goes negative once the time is up", () => {
    const deleted = "2026-09-01T09:00:00.000Z";
    expect(daysLeft(deleted, at("2026-09-16T09:00:00.000Z"))).toBe(0);
    expect(daysLeft(deleted, at("2026-12-25T09:00:00.000Z"))).toBe(0);
  });

  it("says when, not how many, at the end where the number reads badly", () => {
    const deleted = "2026-09-01T09:00:00.000Z";
    expect(binCountdown(deleted, at("2026-09-15T09:00:00.000Z"))).toBe("Removed for good tomorrow");
    expect(binCountdown(deleted, at("2026-09-16T09:00:00.000Z"))).toBe("Removed for good today");
    expect(binCountdown(deleted, at("2026-09-08T09:00:00.000Z"))).toBe("Removed for good in 8 days");
  });
});
