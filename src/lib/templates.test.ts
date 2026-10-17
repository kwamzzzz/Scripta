import { describe, expect, test } from "vitest";
import {
  fillSection,
  missingFacts,
  placeholdersIn,
  templatePlaceholders,
  type TemplateSection,
} from "./templates";

const section = (id: string, body: string, ordinal = 0): TemplateSection => ({
  id,
  heading: id,
  body,
  guidance: "",
  optional: false,
  ordinal,
});

describe("template placeholders", () => {
  test("a placeholder is read out of the drafting, in reading order", () => {
    expect(placeholdersIn("This Agreement is made between {{party a}} and {{party b}}.")).toEqual([
      "party a",
      "party b",
    ]);
    // Spacing inside the braces is a typing accident, not a different fact.
    expect(placeholdersIn("{{ effective date }}")).toEqual(["effective date"]);
    expect(placeholdersIn("No placeholders here.")).toEqual([]);
  });

  test("the same fact asked for twice is one fact", () => {
    const body = "{{Party A}} shall pay {{amount}}. {{party a}} shall also notify {{Party A}}.";
    expect(placeholdersIn(body)).toEqual(["Party A", "amount"]);
  });

  test("a template's facts are gathered across its sections, in order", () => {
    const sections = [
      section("s1", "Between {{party a}} and {{party b}}."),
      section("s2", "Dated {{effective date}}, governed by {{governing law}}.", 1),
      section("s3", "Signed by {{party a}}.", 2),
    ];
    expect(templatePlaceholders(sections)).toEqual([
      "party a",
      "party b",
      "effective date",
      "governing law",
    ]);
  });

  test("braces that are not placeholders are left alone", () => {
    expect(placeholdersIn("{single} and {{}} and {{   }}")).toEqual([]);
  });
});

describe("filling a template", () => {
  test("a fact replaces every mention of it, however it was capitalised", () => {
    const out = fillSection("{{Party A}} pays {{amount}} to {{party a}}.", {
      "party a": "Helvetia Ventures",
      amount: "CHF 5,000,000",
    });
    expect(out).toBe("Helvetia Ventures pays CHF 5,000,000 to Helvetia Ventures.");
  });

  test("a fact not yet supplied stays visible rather than leaving a hole", () => {
    const out = fillSection("Dated {{effective date}}, between {{party a}}.", {
      "party a": "Laine SA",
    });
    // The unanswered one is still legible as a question.
    expect(out).toBe("Dated {{effective date}}, between Laine SA.");
    // An empty answer counts as no answer.
    expect(fillSection("{{x}}", { x: "   " })).toBe("{{x}}");
  });

  test("what is still missing can be listed before drafting starts", () => {
    const sections = [
      section("s1", "{{party a}} and {{party b}}"),
      section("s2", "on {{effective date}}", 1),
    ];
    expect(missingFacts(sections, { "party a": "Laine SA" })).toEqual([
      "party b",
      "effective date",
    ]);
    expect(
      missingFacts(sections, { "party a": "A", "party b": "B", "effective date": "1 Jan" }),
    ).toEqual([]);
  });
});
