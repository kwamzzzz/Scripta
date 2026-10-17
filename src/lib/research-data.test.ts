import { describe, expect, it } from "vitest";
import { resolveResearch, type ResearchSummary } from "@/lib/research-data";

const summary = (over: Partial<ResearchSummary>): ResearchSummary => ({
  id: "11111111-1111-4111-8111-111111111111",
  legacyId: null,
  matterId: null,
  kind: "simple",
  title: "Probation notice",
  updatedAt: "2026-09-07T00:00:00.000Z",
  reportLocked: false,
  archivedAt: null,
  deletedAt: null,
  ...over,
});

describe("resolveResearch", () => {
  const imported = summary({
    id: "22222222-2222-4222-8222-222222222222",
    legacyId: "simple-abc",
  });
  const matters = [summary({}), imported];

  it("resolves a research matter by its own id", () => {
    expect(resolveResearch(matters, matters[0]!.id)).toBe(matters[0]);
  });

  it("resolves an old /research/simple-<uuid> link through the legacy id", () => {
    expect(resolveResearch(matters, "simple-abc")).toBe(imported);
  });

  it("does not match a matter that has no legacy id", () => {
    expect(resolveResearch(matters, "simple-nothing")).toBeNull();
  });
});
