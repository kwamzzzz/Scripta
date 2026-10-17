import { describe as suite, expect, it } from "vitest";
import { browserOf, describe, nameOf, type ElementLike } from "./feedback-capture";

const el = (
  tagName: string,
  attrs: Record<string, string> = {},
  text = "",
  parent: ElementLike | null = null,
): ElementLike => ({
  tagName,
  getAttribute: (name) => attrs[name] ?? null,
  textContent: text,
  parentElement: parent,
});

suite("feedback capture", () => {
  it("names what was pointed at the way a person would", () => {
    expect(nameOf(el("BUTTON", {}, "  Add   source "))).toBe("Button ‘Add source’");
    expect(nameOf(el("DIV", { role: "tab", "aria-label": "Cards" }))).toBe("Tab ‘Cards’");
    expect(nameOf(el("INPUT", { placeholder: "Search the Library" }))).toBe(
      "Field ‘Search the Library’",
    );
    expect(nameOf(el("DIV"))).toBe("Area");
  });

  it("says where it sits and on which screen", () => {
    const panel = el("ASIDE", { "aria-label": "Details for Act 896" });
    const button = el("BUTTON", {}, "Edit", el("DIV", {}, "", panel));
    expect(describe(button, "Library")).toBe("Button ‘Edit’ in Details for Act 896 on Library");
  });

  it("reads the browser and system from the user agent", () => {
    expect(
      browserOf(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome 140 on macOS");
    expect(
      browserOf(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139.0 Safari/537.36 Edg/139.0",
      ),
    ).toBe("Edge 139 on Windows");
  });
});
