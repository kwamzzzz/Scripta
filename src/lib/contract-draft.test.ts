import { describe, expect, it } from "vitest";
import {
  clauseDraftPrompt,
  cleanClauseText,
  clausesToDraft,
  planOutline,
  summariseRun,
  type ClauseDraftOutcome,
} from "./contract-draft";
import type { ContractPlan } from "./contract-plan";

const plan: ContractPlan = {
  agreementType: "Employment Contract",
  governingLaw: "Ghana",
  clauses: [
    { num: "1", title: "DEFINITIONS AND INTERPRETATION", purpose: "Define the terms used." },
    { num: "2", title: "POSITION AND DUTIES", purpose: "Say what the employee does." },
    { num: "13", title: "TERMINATION", purpose: "Say how the contract ends." },
  ],
};

const clause = plan.clauses[2]!;

describe("planOutline", () => {
  it("gives the drafter every clause it may cross-refer to", () => {
    expect(planOutline(plan)).toBe(
      "1. DEFINITIONS AND INTERPRETATION\n2. POSITION AND DUTIES\n13. TERMINATION",
    );
  });
});

describe("clauseDraftPrompt", () => {
  const prompt = clauseDraftPrompt({ plan, clause, matterContext: "The employer is a Ghana Ltd." });

  it("names the one clause to draft", () => {
    expect(prompt).toContain("DRAFT THIS CLAUSE ONLY:\n13. TERMINATION");
  });

  it("carries the whole clause list, so a cross-reference can be right", () => {
    expect(prompt).toContain("2. POSITION AND DUTIES");
  });

  it("carries the house style rather than restating it", () => {
    expect(prompt).toContain("Never 1.1.1");
  });

  it("says plainly when there is no matter context, instead of leaving a gap", () => {
    expect(clauseDraftPrompt({ plan, clause, matterContext: "" })).toContain(
      "MATTER CONTEXT: none.",
    );
  });

  it("includes the firm's position only when there is one", () => {
    expect(prompt).not.toContain("THE FIRM'S POSITION");
    expect(
      clauseDraftPrompt({
        plan,
        clause,
        matterContext: "",
        playbookPosition: "Six months' notice.",
      }),
    ).toContain("Six months' notice.");
  });

  it("tells the drafter to adapt a precedent, not to lift facts from it", () => {
    const withPrecedent = clauseDraftPrompt({
      plan,
      clause,
      matterContext: "",
      precedent: "Either party may terminate on 90 days' notice.",
    });
    expect(withPrecedent).toContain("do not copy a fact out of it");
  });
});

describe("cleanClauseText", () => {
  it("strips a heading the model restated, so the number is not printed twice", () => {
    expect(cleanClauseText("13. TERMINATION\nEither party may terminate…", clause)).toBe(
      "Either party may terminate…",
    );
  });

  it("strips a bare repeated title with no number", () => {
    expect(cleanClauseText("TERMINATION\nEither party may terminate…", clause)).toBe(
      "Either party may terminate…",
    );
  });

  it("strips a code fence a model wrapped the clause in", () => {
    expect(cleanClauseText("```\nEither party may terminate…\n```", clause)).toBe(
      "Either party may terminate…",
    );
  });

  it("leaves a clause that begins with its own subject alone", () => {
    const text = "Either party may terminate this Contract by giving {{Notice period}} notice.";
    expect(cleanClauseText(text, clause)).toBe(text);
  });

  it("does not eat a body that merely mentions the clause title later", () => {
    const text = "Either party may terminate. TERMINATION is dealt with in Schedule 1.";
    expect(cleanClauseText(text, clause)).toBe(text);
  });
});

describe("summariseRun", () => {
  const ok = (num: string): ClauseDraftOutcome => ({ num, title: "T", ok: true, text: "x" });
  const bad = (num: string): ClauseDraftOutcome => ({
    num,
    title: "T",
    ok: false,
    reason: "The model did not answer.",
  });

  it("counts what was drafted and keeps what failed", () => {
    const s = summariseRun([ok("1"), bad("2"), ok("3")]);
    expect(s.drafted).toBe(2);
    expect(s.failed.map((f) => f.num)).toEqual(["2"]);
    expect(s.complete).toBe(false);
  });

  it("is complete only when every clause came back", () => {
    expect(summariseRun([ok("1"), ok("2")]).complete).toBe(true);
  });

  it("is not complete when nothing ran at all", () => {
    // An empty run is a run that did nothing, not a contract that is finished.
    expect(summariseRun([]).complete).toBe(false);
  });
});

describe("clausesToDraft", () => {
  it("drafts the whole plan when nothing is selected", () => {
    expect(clausesToDraft(plan).length).toBe(3);
  });

  it("drafts only the clauses named, and does not shrink the plan", () => {
    // The plan the drafter reads must stay whole or a retried clause loses
    // every cross-reference it was told to honour.
    const work = clausesToDraft(plan, ["13"]);
    expect(work.map((c) => c.num)).toEqual(["13"]);
    expect(plan.clauses.length).toBe(3);
  });

  it("refuses an empty selection rather than silently drafting everything", () => {
    expect(() => clausesToDraft(plan, [])).toThrow(/at least one clause/);
    expect(() => clausesToDraft(plan, ["  "])).toThrow(/at least one clause/);
  });

  it("refuses an unknown clause number and drafts nothing", () => {
    expect(() => clausesToDraft(plan, ["13", "99"])).toThrow(/no clause 99/);
  });

  it("ignores surrounding space in a number", () => {
    expect(clausesToDraft(plan, [" 2 "]).map((c) => c.num)).toEqual(["2"]);
  });
});
