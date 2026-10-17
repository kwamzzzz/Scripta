/**
 * Which settle controls a lawyer is offered on one change.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 *
 * `can_settle_change()` answers TRUE for your own change, because withdrawing
 * your own proposal decides nothing and needs nobody's permission. Every
 * surface that renders settle controls therefore has to ask "is this mine?"
 * BEFORE it asks "may I settle it?", or it draws Accept on the author's own
 * wording.
 *
 * That is not cosmetic. `save_clause_doc` cannot distinguish accepting from
 * withdrawing — both remove the mark, and accepting keeps the text — so an
 * Accept button on your own proposal is a working button that makes your own
 * drafting operative with no second pair of eyes.
 *
 * The clause rail was fixed for this. The Changes pane was not: the edit
 * silently failed to apply, and nothing tested it, so it shipped drawing
 * Accept/Reject on the author's own changes. Found by opening the pane in a
 * browser during the independent acceptance review.
 *
 * So the decision is pulled out of both components into one function, and the
 * rule is asserted rather than trusted to two separate JSX expressions staying
 * in agreement.
 */
import { describe, expect, it } from "vitest";
import { settleControls } from "./settle-controls";

describe("what a lawyer is offered on one outstanding change", () => {
  /* THE ASSERTION THIS FILE EXISTS FOR. */
  it("offers Withdraw, never Accept, on your own proposal", () => {
    expect(settleControls({ mine: true, maySettle: true })).toBe("withdraw");
  });

  it("even when you would otherwise have full settlement authority", () => {
    // A matter Lead editing their own clause is still the author of it.
    expect(settleControls({ mine: true, maySettle: true })).not.toBe("settle");
  });

  it("offers Accept and Reject on somebody else's, where you may settle", () => {
    expect(settleControls({ mine: false, maySettle: true })).toBe("settle");
  });

  it("offers nothing on somebody else's where you may not", () => {
    expect(settleControls({ mine: false, maySettle: false })).toBe("none");
  });

  /* An author may always take back their own proposal, whatever the server
     says about settling — that right is not conditional on authority. */
  it("still offers Withdraw on your own when you have no settlement authority", () => {
    expect(settleControls({ mine: true, maySettle: false })).toBe("withdraw");
  });

  /* Nobody else could ever accept it, so the rule would only trap the work. */
  it("offers Accept on your own when you are the only person on the matter", () => {
    expect(settleControls({ mine: true, maySettle: true, alone: true })).toBe("settle");
    expect(settleControls({ mine: true, maySettle: false, alone: true })).toBe("withdraw");
    expect(settleControls({ mine: true, maySettle: true, alone: false })).toBe("withdraw");
  });
});
