import { describe, expect, it } from "vitest";
import {
  geminiSchema,
  ANTHROPIC_DEFAULT_MODEL,
  GatewayError,
  anthropicRequest,
  anthropicResult,
  describe as describeStatus,
  geminiRequest,
  geminiResult,
  resolveProvider,
} from "./ai-gateway.server";

const CALL = {
  feature: "test",
  system: "You are a contract reviewer.",
  user: "Analyse clause 2.",
  toolName: "record_analysis",
  toolDescription: "Record the analysis.",
  parameters: { type: "object", properties: { risk: { type: "string" } }, required: ["risk"] },
};

describe("provider selection", () => {
  it("prefers Gemini — the cheapest — when its key is present", () => {
    expect(
      resolveProvider({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", LOVABLE_API_KEY: "l" })
        ?.provider,
    ).toBe("gemini");
  });
  it("uses Anthropic when only that key is present", () => {
    expect(resolveProvider({ ANTHROPIC_API_KEY: "a", LOVABLE_API_KEY: "l" })?.provider).toBe(
      "anthropic",
    );
  });
  it("falls back to the Lovable gateway", () => {
    expect(resolveProvider({ LOVABLE_API_KEY: "l" })?.provider).toBe("lovable");
  });
  it("can be forced", () => {
    expect(
      resolveProvider({ ANTHROPIC_API_KEY: "a", LOVABLE_API_KEY: "l", AI_PROVIDER: "lovable" })
        ?.provider,
    ).toBe("lovable");
  });
  it("is null with no keys", () => {
    expect(resolveProvider({})).toBeNull();
  });
});

describe("Anthropic mapping", () => {
  it("forces the named tool and passes the schema as input_schema", () => {
    const req = anthropicRequest(CALL, ANTHROPIC_DEFAULT_MODEL);
    expect(req.tool_choice).toEqual({ type: "tool", name: "record_analysis" });
    expect(req.tools[0]!.input_schema).toBe(CALL.parameters);
    expect(req.system).toBe(CALL.system);
    expect(req.messages).toEqual([{ role: "user", content: CALL.user }]);
  });

  it("returns the tool_use input as the structured result", () => {
    const out = anthropicResult<{ risk: string }>(
      {
        content: [
          { type: "text", text: "…" },
          { type: "tool_use", name: "record_analysis", input: { risk: "High" } },
        ],
      },
      "record_analysis",
    );
    expect(out).toEqual({ risk: "High" });
  });

  it("fails clearly when no tool_use block comes back", () => {
    expect(() =>
      anthropicResult({ content: [{ type: "text", text: "sorry" }] }, "record_analysis"),
    ).toThrow(GatewayError);
  });
});

describe("status wording", () => {
  it("names the key on a rejected Anthropic key", () => {
    expect(describeStatus(401, "", "anthropic").message).toContain("ANTHROPIC_API_KEY");
  });
  it("marks rate limits retryable", () => {
    expect(describeStatus(429, "", "anthropic").retryable).toBe(true);
  });
});

describe("Gemini mapping", () => {
  it("forces the named function via toolConfig", () => {
    const req = geminiRequest(CALL);
    expect(req.toolConfig.functionCallingConfig).toEqual({
      mode: "ANY",
      allowedFunctionNames: ["record_analysis"],
    });
    // A sanitised copy now, not the same object: Gemini rejects keys the
    // other providers accept, so the schema is cleaned on the way out.
    expect(req.tools[0]!.functionDeclarations[0]!.parameters).toEqual(CALL.parameters);
    expect(req.systemInstruction.parts[0]!.text).toBe(CALL.system);
  });

  it("returns the function call's args as the structured result", () => {
    const out = geminiResult<{ risk: string }>(
      {
        candidates: [
          {
            content: {
              parts: [
                { text: "…" },
                { functionCall: { name: "record_analysis", args: { risk: "Medium" } } },
              ],
            },
          },
        ],
      },
      "record_analysis",
    );
    expect(out).toEqual({ risk: "Medium" });
  });

  it("fails clearly when no function call comes back", () => {
    expect(() =>
      geminiResult(
        { candidates: [{ content: { parts: [{ text: "sorry" }] } }] },
        "record_analysis",
      ),
    ).toThrow(GatewayError);
  });

  it("names the key on a rejected Gemini key", () => {
    expect(describeStatus(401, "", "gemini").message).toContain("GEMINI_API_KEY");
  });
});

describe("Gemini schema sanitising", () => {
  it("removes additionalProperties, which Gemini rejects outright", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: { risk: { type: "string", enum: ["Low", "High"] } },
      required: ["risk"],
    };
    expect(geminiSchema(schema)).toEqual({
      type: "object",
      properties: { risk: { type: "string", enum: ["Low", "High"] } },
      required: ["risk"],
    });
  });

  it("strips it at every depth, including inside arrays", () => {
    const nested = geminiSchema({
      type: "object",
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { text: { type: "string" } },
          },
        },
      },
    }) as any;
    expect(JSON.stringify(nested)).not.toContain("additionalProperties");
    expect(nested.properties.items.items.properties.text).toEqual({ type: "string" });
  });

  it("keeps everything Gemini does understand", () => {
    const kept = {
      type: "string",
      description: "why",
      enum: ["a"],
      nullable: true,
      minItems: 1,
      maxItems: 2,
      format: "int32",
    };
    expect(geminiSchema(kept)).toEqual(kept);
  });

  it("sends the sanitised schema in the request", () => {
    const req = geminiRequest({
      ...CALL,
      parameters: { type: "object", additionalProperties: false, properties: {} },
    });
    expect(JSON.stringify(req)).not.toContain("additionalProperties");
  });
});

describe("geminiSchema: nullable types", () => {
  it("turns a list of types into one type that may be null", () => {
    expect(
      geminiSchema({
        type: "object",
        properties: {
          verdict: { type: ["string", "null"], enum: ["Pass", "Fail", null] },
          note: { type: ["string", "null"], description: "One sentence." },
          count: { type: "integer" },
        },
      }),
    ).toEqual({
      type: "object",
      properties: {
        verdict: { type: "string", nullable: true, enum: ["Pass", "Fail"] },
        note: { type: "string", nullable: true, description: "One sentence." },
        count: { type: "integer" },
      },
    });
  });
});
