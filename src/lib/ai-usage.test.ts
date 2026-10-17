import { describe, expect, it } from "vitest";
import { costUsd, rateFor, ratesConfigured, RATES } from "./ai-pricing";
import { extractTokens, usageRow } from "./ai-usage.server";

describe("pricing", () => {
  it("returns no cost while rates are unset, rather than guessing zero", () => {
    expect(rateFor("unpriced-model")).toBeNull();
    expect(costUsd("unpriced-model", 1000, 500)).toBeNull();
    expect(ratesConfigured(["unpriced-model"])).toBe(false);
    expect(ratesConfigured([])).toBe(false);
  });

  it("returns no dollar cost for Lovable gateway usage", () => {
    expect(costUsd("google/gemini-3.7-flash", 1_000_000, 200_000, "lovable")).toBeNull();
  });

  it("prices a call once a rate exists, ignoring any provider prefix", () => {
    const original = RATES["gemini-3.7-flash"];
    RATES["gemini-3.7-flash"] = { inputPerMillion: 0.3, outputPerMillion: 2.5 };
    try {
      // 1M in at 0.30 plus 200k out at 2.50 = 0.30 + 0.50
      expect(costUsd("gemini-3.7-flash", 1_000_000, 200_000)).toBeCloseTo(0.8, 6);
      expect(rateFor("google/gemini-3.7-flash")).not.toBeNull();
      expect(ratesConfigured(["gemini-3.7-flash"])).toBe(true);
      // A single cheap call survives rounding rather than collapsing to zero.
      expect(costUsd("gemini-3.7-flash", 1000, 0)).toBe(0.0003);
    } finally {
      if (original) {
        RATES["gemini-3.7-flash"] = original;
      } else {
        delete RATES["gemini-3.7-flash"];
      }
    }
  });
});

describe("token counts", () => {
  it("reads Gemini, counting thinking tokens as output", () => {
    expect(
      extractTokens("gemini", {
        usageMetadata: {
          promptTokenCount: 1200,
          candidatesTokenCount: 300,
          thoughtsTokenCount: 90,
        },
      }),
    ).toEqual({ inputTokens: 1200, outputTokens: 390 });
  });

  it("reads Anthropic, counting cached input as input", () => {
    expect(
      extractTokens("anthropic", {
        usage: {
          input_tokens: 100,
          cache_read_input_tokens: 900,
          cache_creation_input_tokens: 50,
          output_tokens: 40,
        },
      }),
    ).toEqual({ inputTokens: 1050, outputTokens: 40 });
  });

  it("reads the Lovable gateway's OpenAI shape", () => {
    expect(
      extractTokens("lovable", { usage: { prompt_tokens: 10, completion_tokens: 20 } }),
    ).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it("gives zeros for a shape it does not recognise rather than throwing", () => {
    expect(extractTokens("gemini", {})).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(extractTokens("gemini", null)).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(extractTokens("anthropic", { usage: { input_tokens: "many" } })).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
  });
});

describe("the recorded row", () => {
  it("carries the feature, provider and model, with cost null while unpriced", () => {
    const row = usageRow("clause-analysis", "gemini", "unpriced-model", {
      inputTokens: 800,
      outputTokens: 120,
    });
    expect(row).toEqual({
      feature: "clause-analysis",
      provider: "gemini",
      model: "unpriced-model",
      input_tokens: 800,
      output_tokens: 120,
      cost_usd: null,
      ok: true,
    });
  });

  it("prices a Gemini row once a rate exists", () => {
    const original = RATES["gemini-3.7-flash"];
    RATES["gemini-3.7-flash"] = { inputPerMillion: 0.75, outputPerMillion: 3.75 };
    try {
      const row = usageRow("clause-analysis", "gemini", "gemini-3.7-flash", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });
      // $0.75 / $3.75 per million input / output.
      expect(row.cost_usd).toBeCloseTo(4.5, 6);
    } finally {
      if (original) {
        RATES["gemini-3.7-flash"] = original;
      } else {
        delete RATES["gemini-3.7-flash"];
      }
    }
  });

  it("does not fabricate a dollar cost for Lovable gateway rows", () => {
    const row = usageRow("clause-analysis", "lovable", "google/gemini-3.7-flash", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(row.cost_usd).toBeNull();
  });

  it("never records a blank feature", () => {
    expect(usageRow("", "gemini", "m", { inputTokens: 0, outputTokens: 0 }).feature).toBe(
      "unknown",
    );
  });
});
