import { describe, expect, it } from "vitest";
import { clauseTopic } from "./format";

describe("a clause heading as a topic", () => {
  it("takes a real heading", () => {
    expect(clauseTopic("Limitation of liability")).toBe("Limitation of liability");
  });

  it("leaves out clause text the parser used as a heading", () => {
    expect(clauseTopic("“the Act” means the Labour Act, 2003 (Act 651) as amended…")).toBe("");
  });

  it("leaves out a heading that is really a sentence", () => {
    expect(clauseTopic("The Supplier shall indemnify the Customer in full")).toBe("");
  });

  it("has nothing to say about an empty heading", () => {
    expect(clauseTopic("  ")).toBe("");
  });
});
