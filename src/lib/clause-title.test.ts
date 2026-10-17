import { describe, expect, it } from "vitest";
import { retitle, titleFrom } from "./clause-title";

describe("a title taken from the wording follows the wording", () => {
  it("rewrites a whole-sentence title when the sentence changes", () => {
    expect(
      retitle(
        "Late payment bears interest at 2% per month",
        "Late payment bears interest at 2% per month.",
        "Late payment bears interest at 1% per month.",
      ),
    ).toBe("Late payment bears interest at 1% per month");
  });

  it("rewrites an opening-words title when the opening changes", () => {
    expect(
      retitle(
        "The Supplier's total liability shall not exceed the…",
        "The Supplier's total liability shall not exceed the Fees paid in the preceding 12 months.",
        "Except for fraud, the Supplier's total liability shall not exceed twice the Fees.",
      ),
    ).toBe("Except for fraud, the Supplier's total liability shall…");
  });

  it("reads past a printed clause number", () => {
    expect(titleFrom("2.4 This Agreement starts when signed by both Parties and continues")).toBe(
      "This Agreement starts when signed by both Parties…",
    );
  });

  it("never touches a heading the drafter gave", () => {
    expect(retitle("Liability", "The Supplier's liability is capped.", "It is not capped.")).toBe(
      null,
    );
    expect(retitle("Payment", "Payment is due on signing.", "Payment is due in 7 days.")).toBe(
      null,
    );
  });

  it("leaves the title alone when the wording did not change", () => {
    expect(
      retitle(
        "Fees are exclusive of VAT",
        "Fees are exclusive of VAT.",
        "Fees are exclusive of VAT.",
      ),
    ).toBe(null);
  });

  it("leaves it alone when the change is after the opening words", () => {
    expect(
      retitle(
        "The Client shall approve each Deliverable…",
        "The Client shall approve each Deliverable within 5 Business Days.",
        "The Client shall approve each Deliverable within 3 Business Days.",
      ),
    ).toBe(null);
  });
});
