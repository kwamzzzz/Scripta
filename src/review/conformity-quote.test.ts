import { describe, expect, it } from "vitest";
import { quoted, withoutLeadNum } from "./conformity.functions";

describe("quotes after a renumber", () => {
  // Filed as 3.2; the wording still carries the document's "4.2".
  const text = "4.2 The Client shall approve each Deliverable within 5 Business Days.";

  it("leaves the printed number off the wording", () => {
    expect(withoutLeadNum(text)).toBe(
      "The Client shall approve each Deliverable within 5 Business Days.",
    );
    expect(withoutLeadNum("2.4. Term")).toBe("Term");
    expect(withoutLeadNum("1) Term")).toBe("Term");
    expect(withoutLeadNum("5 Business Days apply")).toBe("5 Business Days apply");
    expect(withoutLeadNum("The Client")).toBe("The Client");
  });

  it("finds a quote given with the new number, the old one or none", () => {
    expect(quoted("3.2 The Client shall approve each Deliverable", text)).toBe(true);
    expect(quoted("4.2 The Client shall approve each Deliverable", text)).toBe(true);
    expect(quoted("The Client shall approve each Deliverable", text)).toBe(true);
    expect(quoted("within 10 Business Days", text)).toBe(false);
    expect(quoted("10 Business Days", "within 5 Business Days")).toBe(false);
  });
});
