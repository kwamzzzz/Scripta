import { describe, expect, it } from "vitest";
import { hostOf, kindGroup, kindName, libraryFilePath, normaliseUrl, parseTopics } from "./library";

describe("library", () => {
  it("makes a typed link openable", () => {
    expect(normaliseUrl("legislation.gov.gh/act992")).toBe("https://legislation.gov.gh/act992");
    expect(normaliseUrl("  https://example.com ")).toBe("https://example.com");
    expect(normaliseUrl("http://old.site")).toBe("http://old.site");
    expect(normaliseUrl("")).toBe("");
    expect(hostOf("https://www.gra.gov.gh/vat")).toBe("gra.gov.gh");
  });

  it("cleans topics as typed", () => {
    expect(parseTopics("tax, VAT;  free   zones\nTax")).toEqual(["tax", "VAT", "free zones"]);
    expect(parseTopics(" , ;")).toEqual([]);
  });

  it("names a kind, using the writer's own word for 'other'", () => {
    expect(kindName({ kind: "case", kindLabel: "" })).toBe("Case");
    expect(kindGroup({ kind: "case", kindLabel: "" })).toBe("Case law");
    expect(kindName({ kind: "other", kindLabel: "Speech" })).toBe("Speech");
    expect(kindGroup({ kind: "statute", kindLabel: "ignored" })).toBe("Statutes");
  });

  it("keeps a private source's file on its author's own path", () => {
    expect(libraryFilePath("w", "u", "s", "Act 992.pdf", false)).toBe("w/library/s/Act-992.pdf");
    expect(libraryFilePath("w", "u", "s", "Act 992.pdf", true)).toBe(
      "w/personal/u/library/s/Act-992.pdf",
    );
  });
});
