import { describe, expect, it } from "vitest";
import { playbookHealth, reviewAge, type PlaybookRuleLike } from "./health";

const rule = (over: Partial<PlaybookRuleLike> = {}): PlaybookRuleLike => ({
  id: Math.random().toString(36).slice(2),
  topic: "Limitation of liability",
  preferred: null,
  acceptable: null,
  fallback: null,
  escalate: null,
  redflag: null,
  approved_clause_text: null,
  approval_threshold: null,
  ...over,
});

const keys = (rules: PlaybookRuleLike[]) => playbookHealth(rules).prompts.map((p) => p.key);

describe("playbookHealth", () => {
  it("counts what a lawyer would want counted", () => {
    const health = playbookHealth([
      rule({ preferred: "12 month fees cap", fallback: "2x", approved_clause_text: "text" }),
      rule({ preferred: "Mutual", acceptable: "One way" }),
      rule({ topic: "Notices" }),
    ]);
    expect(health.positions).toBe(3);
    expect(health.withPreferred).toBe(2);
    expect(health.withFallback).toBe(2);
    expect(health.withLanguage).toBe(1);
    expect(health.empty).toBe(1);
  });

  it("says nothing at all about a playbook that is finished", () => {
    const complete = rule({
      preferred: "12 month fees cap",
      fallback: "2x annual fees",
      escalate: "Unlimited liability needs the GC",
      approved_clause_text: "The Supplier's liability shall not exceed…",
    });
    expect(playbookHealth([complete]).prompts).toEqual([]);
  });

  it("names a single empty position rather than counting it", () => {
    const prompts = playbookHealth([rule({ topic: "Data protection" })]).prompts;
    expect(prompts[0]!.text).toContain("Data protection");
    expect(prompts[0]!.text).toContain("has a name and nothing else");
  });

  it("asks for a fallback only where there is a position to fall back from", () => {
    expect(keys([rule({ preferred: "Capped at fees" })])).toContain("fallback");
    // No preferred position yet: the fallback is not the missing part.
    expect(keys([rule()])).not.toContain("fallback");
  });

  it("notices an absolute refusal with no way to approve it anyway", () => {
    expect(keys([rule({ preferred: "Capped", redflag: "Unlimited liability" })])).toContain(
      "escalation",
    );
    expect(
      keys([
        rule({ preferred: "Capped", redflag: "Unlimited", approval_threshold: "GC approval" }),
      ]),
    ).not.toContain("escalation");
  });

  it("says when a position can be stated but not drafted", () => {
    const prompts = playbookHealth([rule({ preferred: "Capped at fees" })]).prompts;
    expect(prompts.find((p) => p.key === "language")!.text).toContain("cannot draft it");
  });

  it("carries the positions each prompt is about, so they can be reached", () => {
    const one = rule({ topic: "Notices" });
    expect(playbookHealth([one]).prompts[0]!.ids).toEqual([one.id]);
  });

  it("puts what is empty before what is merely thin", () => {
    const found = keys([rule(), rule({ preferred: "Capped" })]);
    expect(found[0]).toBe("empty");
  });
});

describe("reviewAge", () => {
  const today = new Date("2026-09-13");
  it("says nothing about a playbook reviewed recently", () => {
    expect(reviewAge("2026-08-01", today)).toBeNull();
  });
  it("speaks up after a quarter", () => {
    expect(reviewAge("2026-01-01", today)).toContain("8 months");
  });
  it("says over a year rather than counting months", () => {
    expect(reviewAge("2024-01-01", today)).toContain("over a year");
  });
  it("says when it has never been reviewed", () => {
    expect(reviewAge(null, today)).toContain("never");
  });
});
