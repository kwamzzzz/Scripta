import { describe, expect, it } from "vitest";
import { FEATURES, mergeSettings, stateFor } from "./features";
import { isLive, parseMaintenance, type Announcement } from "./platform";
import { SECTION_KEYS } from "./app-navigation";

const member = { userId: "m1", isAdmin: false, asMember: false };
const admin = { userId: "a1", isAdmin: true, asMember: false };

describe("feature catalogue", () => {
  it("covers every section a member can reach from the sidebar", () => {
    const keys = new Set(FEATURES.map((f) => f.key));
    const reachable = SECTION_KEYS.filter((k) => k !== "admin" && k !== "review");
    expect(reachable.filter((k) => !keys.has(k))).toEqual([]);
  });
  it("has no duplicate keys", () => {
    expect(new Set(FEATURES.map((f) => f.key)).size).toBe(FEATURES.length);
  });
});

describe("mergeSettings", () => {
  it("defaults everything to on and reads stored rows", () => {
    const s = mergeSettings([
      { key: "library", enabled: false, off_mode: "hidden", note: null, preview_users: ["m1"] },
      { key: "tasks", enabled: false, off_mode: "dim", note: "Back Monday" },
      { key: "not-a-feature", enabled: false },
    ]);
    expect(s["library"]).toMatchObject({ state: "hidden", preview: ["m1"] });
    expect(s["tasks"]).toMatchObject({ state: "dim", note: "Back Monday" });
    expect(s["clients"]?.state).toBe("on");
    expect(s["not-a-feature"]).toBeUndefined();
  });
});

describe("stateFor", () => {
  const off = { state: "hidden" as const, note: "", preview: ["m1"], updatedAt: null };
  it("holds a switched-off feature back from members", () => {
    expect(stateFor({ ...off, preview: [] }, member)).toBe("hidden");
    expect(stateFor({ ...off, state: "dim", preview: [] }, member)).toBe("dim");
  });
  it("gives early access to the people named", () => {
    expect(stateFor(off, member)).toBe("on");
    expect(stateFor(off, { ...member, userId: "m2" })).toBe("hidden");
  });
  it("keeps administrators in, unless they view as a member", () => {
    expect(stateFor(off, admin)).toBe("on");
    expect(stateFor(off, { ...admin, asMember: true })).toBe("hidden");
  });
  it("treats a missing setting as on", () => {
    expect(stateFor(undefined, member)).toBe("on");
  });
});

describe("announcements and maintenance", () => {
  const base: Announcement = {
    id: "1",
    title: "t",
    body: "",
    tone: "info",
    audience: "everyone",
    startsAt: "2026-09-01T00:00:00Z",
    endsAt: null,
    dismissible: true,
    createdAt: "2026-09-01T00:00:00Z",
    archivedAt: null,
  };
  const now = Date.parse("2026-09-10T00:00:00Z");
  it("is live between its start and end, and not once archived", () => {
    expect(isLive(base, now)).toBe(true);
    expect(isLive({ ...base, startsAt: "2026-09-11T00:00:00Z" }, now)).toBe(false);
    expect(isLive({ ...base, endsAt: "2026-09-09T00:00:00Z" }, now)).toBe(false);
    expect(isLive({ ...base, archivedAt: "2026-09-02T00:00:00Z" }, now)).toBe(false);
  });
  it("reads maintenance mode defensively", () => {
    expect(parseMaintenance(null)).toEqual({ on: false, message: "", since: null });
    expect(parseMaintenance({ on: true, message: "Back at 6" }).on).toBe(true);
    expect(parseMaintenance({ on: "yes" }).on).toBe(false);
  });
});
