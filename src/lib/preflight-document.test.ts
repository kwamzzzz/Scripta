import { describe, expect, it } from "vitest";
import { makePart } from "@/editor/model";
import { blocking } from "@/components/Preflight";
import { documentPreflight } from "./preflight-document";

const part = (title: string, text: string, num = "") =>
  makePart({ title, text, num, placeholder: "What belongs here." });

describe("documentPreflight", () => {
  it("says so when everything is written", () => {
    const items = documentPreflight([part("One", "Written."), part("Two", "Also written.")]);
    expect(items.map((i) => i.key)).toEqual(["written"]);
    expect(blocking(items)).toEqual([]);
  });

  it("stops an empty section, and says what belongs in it", () => {
    const items = documentPreflight([part("One", "  ")]);
    expect(items[0]!.level).toBe("blocking");
    expect(items[0]!.detail).toBe("What belongs here.");
  });

  it("names every placeholder still to fill", () => {
    const items = documentPreflight([part("One", "Pay [amount] to [payee] by [date].")]);
    expect(items[0]!.count).toBe(3);
    expect(items[0]!.detail).toContain("[amount], [payee], [date]");
  });

  it("refuses to export nothing at all", () => {
    expect(documentPreflight([]).map((i) => i.key)).toEqual(["nothing"]);
  });

  it("calls the parts what the tool calls them", () => {
    const items = documentPreflight([part("One", "")], "clause");
    expect(documentPreflight([], "clause")[0]!.detail).toContain("clause");
    expect(items[0]!.label).toContain("One");
  });

  it("points at the section it is about, so the check can be followed", () => {
    const one = part("One", "");
    expect(documentPreflight([one])[0]!.anchorId).toBe(one.id);
  });
});
