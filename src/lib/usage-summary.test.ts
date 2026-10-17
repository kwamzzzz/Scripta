import { describe, expect, it } from "vitest";
import { summarise } from "./usage.functions";
import { RATES } from "./ai-pricing";

const SINCE = "2026-09-01T00:00:00.000Z";
const row = (feature: string, input: number, output: number, cost: unknown = null, ok = true) => ({
  feature,
  provider: "gemini",
  model: "gemini-3.7-flash",
  input_tokens: input,
  output_tokens: output,
  cost_usd: cost as number | string | null,
  ok,
});

describe("this month's usage", () => {
  it("is empty and honest with no calls", () => {
    const u = summarise([], SINCE, 50);
    expect(u.calls).toBe(0);
    expect(u.inputTokens).toBe(0);
    expect(u.costUsd).toBeNull();
    expect(u.ratesKnown).toBe(false);
    expect(u.capUsd).toBe(50);
    expect(u.byFeature).toEqual([]);
  });

  it("totals tokens and groups by feature, biggest first", () => {
    const u = summarise(
      [
        row("assistant-reply", 400, 300),
        row("drafting", 2000, 900),
        row("assistant-reply", 50, 20),
      ],
      SINCE,
      50,
    );
    expect(u.calls).toBe(3);
    expect(u.inputTokens).toBe(2450);
    expect(u.outputTokens).toBe(1220);
    expect(u.byFeature.map((f) => f.feature)).toEqual(["drafting", "assistant-reply"]);
    expect(u.byFeature[1]).toMatchObject({ calls: 2, inputTokens: 450, outputTokens: 320 });
  });

  it("reports no cost while any model is unpriced, rather than counting it as zero", () => {
    const u = summarise(
      [{ ...row("drafting", 10, 10, 0.002), model: "unpriced-model" }],
      SINCE,
      50,
    );
    expect(u.ratesKnown).toBe(false);
    expect(u.costUsd).toBeNull();
    expect(u.byFeature[0]!.costUsd).toBeNull();
  });

  it("adds up cost once rates exist, and handles numerics arriving as strings", () => {
    const original = RATES["gemini-3.7-flash"];
    RATES["gemini-3.7-flash"] = { inputPerMillion: 0.3, outputPerMillion: 2.5 };
    try {
      const u = summarise(
        [row("drafting", 10, 10, "0.25"), row("insights", 10, 10, 0.5)],
        SINCE,
        50,
      );
      expect(u.ratesKnown).toBe(true);
      expect(u.costUsd).toBeCloseTo(0.75, 6);
      expect(u.byFeature.find((f) => f.feature === "insights")!.costUsd).toBeCloseTo(0.5, 6);
    } finally {
      if (original) {
        RATES["gemini-3.7-flash"] = original;
      } else {
        delete RATES["gemini-3.7-flash"];
      }
    }
  });

  it("counts failed calls separately but still charges for their tokens", () => {
    const u = summarise(
      [row("research", 100, 0, null, false), row("research", 10, 5)],
      SINCE,
      null,
    );
    expect(u.calls).toBe(2);
    expect(u.failures).toBe(1);
    expect(u.inputTokens).toBe(110);
    expect(u.capUsd).toBeNull();
  });

  it("prices old rows that were stored before the rate existed", () => {
    const original = RATES["gemini-3.7-flash"];
    RATES["gemini-3.7-flash"] = { inputPerMillion: 0.3, outputPerMillion: 2.5 };
    try {
      // Both rows have a null cost, exactly as they were written while unpriced.
      const u = summarise([row("assistant-reply", 876, 549, null)], SINCE, 50);
      expect(u.ratesKnown).toBe(true);
      // 876 in at 0.30 plus 549 out at 2.50 per million.
      expect(u.costUsd).toBeCloseTo(0.001635, 6);
      expect(u.byFeature[0]!.costUsd).toBeCloseTo(0.001635, 6);
    } finally {
      if (original) {
        RATES["gemini-3.7-flash"] = original;
      } else {
        delete RATES["gemini-3.7-flash"];
      }
    }
  });
});
