import { describe, expect, it } from "vitest";
import { researchGuidance, type DraftingResearchSource } from "./research-drafting";

const research = (overrides: Partial<DraftingResearchSource> = {}): DraftingResearchSource => ({
  id: "research-1",
  title: "Enforceability of the interest clause",
  shortAnswer: "The clause is enforceable on the current commercial facts.",
  authorities: [
    {
      n: 2,
      cite: "BGE 4A_172/2019",
      kind: "COURT DECISION",
      source: "Federal Supreme Court",
      date: "14 May 2019",
      held: "The commercial context matters to the assessment.",
    },
    {
      n: 1,
      cite: "Art. 314 CO",
      kind: "STATUTE",
      source: "Swiss Code of Obligations",
      date: "In force",
      held: "The parties may agree the contractual interest rate.",
    },
  ],
  ...overrides,
});

describe("researchGuidance", () => {
  it("maps the title, short answer and ordered authorities into one AI-sourced step", () => {
    const steps = researchGuidance(research());

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      label: "Research conclusion — Enforceability of the interest clause",
      source: "ai",
    });
    expect(steps[0]?.body).toContain(
      "Short answer\nThe clause is enforceable on the current commercial facts.",
    );
    expect(steps[0]?.body.indexOf("[1] Art. 314 CO")).toBeLessThan(
      steps[0]?.body.indexOf("[2] BGE 4A_172/2019") ?? 0,
    );
    expect(steps[0]?.body).toContain("The parties may agree the contractual interest rate.");
  });

  it("keeps a conclusion useful when it has no cited authorities", () => {
    const steps = researchGuidance(research({ authorities: [] }));

    expect(steps).toHaveLength(1);
    expect(steps[0]?.body).toBe(
      "Short answer\nThe clause is enforceable on the current commercial facts.",
    );
  });

  it("produces no empty guidance step when the short answer is absent", () => {
    expect(researchGuidance(research({ shortAnswer: "   " }))).toEqual([]);
  });

  it("carries an unverified citation with an explicit reliance warning", () => {
    const steps = researchGuidance(
      research({
        authorities: [
          {
            n: 1,
            cite: "Possible citation",
            kind: "UNVERIFIED",
            source: "Model search",
            date: "",
            held: "This proposition still needs a primary source.",
          },
        ],
      }),
    );

    expect(steps[0]?.body).toContain("Possible citation — UNVERIFIED");
    expect(steps[0]?.body).toContain("Check it exists, and in this form, before relying on it");
  });
});
