import { describe, expect, it } from "vitest";
import {
  assetLapsed,
  can,
  explainMarketingError,
  isHex,
  monthWeeks,
  parseWords,
  postDay,
  readiness,
  shiftMonth,
  type Approval,
  type Check,
  type Override,
} from "./model";

const approval = (over: Partial<Approval>): Approval => ({
  id: "a",
  contentId: "p",
  kind: "director_approval",
  version: 1,
  status: "requested",
  note: "",
  requestedBy: null,
  decidedBy: null,
  decidedAt: null,
  createdAt: "2026-09-01T00:00:00Z",
  ...over,
});

const block = (key: string): Check => ({ checkKey: key, level: "block", title: key, reason: "" });

const override = (key: string, version: number): Override => ({
  id: key,
  contentId: "p",
  checkKey: key,
  version,
  reason: "Reviewed",
  actorId: null,
  createdAt: "2026-09-01T00:00:00Z",
});

describe("who may do what", () => {
  it("gives the owner everything, approvers all but access, contributors none", () => {
    expect(can("owner", "grant")).toBe(true);
    expect(can("approver", "grant")).toBe(false);
    expect(can("approver", "override")).toBe(true);
    expect(can("contributor", "approve")).toBe(false);
    expect(can(null, "brief")).toBe(false);
  });
});

describe("readiness", () => {
  const post = { id: "p", version: 2 };

  it("counts only an approval of the current version", () => {
    const r = readiness(post, [], [approval({ version: 1, status: "approved" })], []);
    expect(r.approved).toBe(false);
    expect(r.clear).toBe(false);
    expect(readiness(post, [], [approval({ version: 2, status: "approved" })], []).clear).toBe(
      true,
    );
  });

  it("is blocked until each blocking check is overridden for this version", () => {
    const approvals = [approval({ version: 2, status: "approved" })];
    const checks = [block("tone"), block("licence"), { ...block("asset"), level: "warn" as const }];
    expect(
      readiness(post, checks, approvals, [override("tone", 2)]).blocking.map((c) => c.checkKey),
    ).toEqual(["licence"]);
    // An override of an earlier version does not carry forward.
    expect(
      readiness(post, checks, approvals, [override("tone", 1), override("licence", 1)]).blocking,
    ).toHaveLength(2);
    expect(
      readiness(post, checks, approvals, [override("tone", 2), override("licence", 2)]).clear,
    ).toBe(true);
  });

  it("reports changes asked for, and what is still waiting", () => {
    expect(
      readiness(post, [], [approval({ version: 2, status: "changes_requested", note: "x" })], [])
        .changesAsked?.note,
    ).toBe("x");
    expect(readiness(post, [], [approval({ version: 2 })], []).awaiting).not.toBeNull();
  });
});

describe("the schedule", () => {
  it("lays September 2026 out Monday first", () => {
    const weeks = monthWeeks("2026-09");
    expect(weeks[0]).toEqual([
      null,
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("moves across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("places a published post on the day it went out", () => {
    const at = (d: string) => new Date(`${d}T10:00:00`).toISOString();
    expect(
      postDay({ stage: "published", publishedAt: at("2026-09-03"), scheduledAt: at("2026-09-01") }),
    ).toBe("2026-09-03");
    expect(postDay({ stage: "scheduled", publishedAt: null, scheduledAt: at("2026-09-01") })).toBe(
      "2026-09-01",
    );
    expect(postDay({ stage: "drafting", publishedAt: null, scheduledAt: null })).toBeNull();
  });
});

describe("small rules", () => {
  it("treats retired and expired assets as lapsed", () => {
    expect(assetLapsed({ status: "retired", expiresOn: null }, "2026-09-17")).toBe(true);
    expect(assetLapsed({ status: "approved", expiresOn: "2026-09-16" }, "2026-09-17")).toBe(true);
    expect(assetLapsed({ status: "approved", expiresOn: "2026-09-17" }, "2026-09-17")).toBe(false);
  });

  it("reads an avoid list typed with commas or lines", () => {
    expect(parseWords("guaranteed, best-in-class\nguaranteed,  ")).toEqual([
      "guaranteed",
      "best-in-class",
    ]);
  });

  it("accepts six-digit hex only", () => {
    expect(isHex("#123247")).toBe(true);
    expect(isHex("123247")).toBe(false);
    expect(isHex("#fff")).toBe(false);
  });

  it("explains a policy refusal in words", () => {
    expect(
      explainMarketingError('new row violates row-level security policy for table "mkt_campaigns"'),
    ).toMatch(/approver/);
    expect(explainMarketingError("Blocked by: Licence claim.")).toBe("Blocked by: Licence claim.");
  });
});
