import { describe, expect, it } from "vitest";
import {
  FUNCTION_GUIDE,
  FUNCTION_GUIDE_TEXT,
  isLegalFunction,
  LEGAL_FUNCTIONS,
  normaliseActor,
} from "./legal-function";

describe("the vocabulary", () => {
  it("is short enough to stay separable", () => {
    // Every category has to be useful, distinguishable and unlock a workflow.
    // A longer list classifies less reliably, not more.
    expect(LEGAL_FUNCTIONS.length).toBeLessThanOrEqual(14);
  });

  it("leaves out the distinctions a model cannot hold apart", () => {
    // An indemnity is an obligation to a lawyer and a remedy to a model.
    // Representation, warranty and covenant move between jurisdictions.
    for (const dropped of ["remedy", "representation", "warranty", "covenant"])
      expect(LEGAL_FUNCTIONS as readonly string[]).not.toContain(dropped);
  });

  it("keeps an honest escape, so nothing is forced into a category", () => {
    expect(LEGAL_FUNCTIONS as readonly string[]).toContain("other");
  });

  it("explains every category, including where its neighbours begin", () => {
    for (const f of LEGAL_FUNCTIONS) {
      expect(FUNCTION_GUIDE[f]).toBeTruthy();
      expect(FUNCTION_GUIDE_TEXT).toContain(`${f}:`);
    }
  });

  it("rejects anything outside the list, so a stray label is never stored", () => {
    expect(isLegalFunction("obligation")).toBe(true);
    expect(isLegalFunction("remedy")).toBe(false);
    expect(isLegalFunction("OBLIGATION")).toBe(false);
    expect(isLegalFunction(null)).toBe(false);
  });
});

describe("the actor", () => {
  it("keeps the contract's own words rather than a fixed set of party names", () => {
    // Real contracts say Supplier and Buyer, Investor and Manager, Employer
    // and Employee. An enum would force every one of them into the wrong word.
    for (const party of ["Supplier", "The Manager", "Employee", "Goldenmark Ghana Limited"])
      expect(normaliseActor(party)).toBe(party);
  });

  it("preserves a provision that binds both sides", () => {
    expect(normaliseActor("Both Parties")).toBe("Both Parties");
    expect(normaliseActor("Either Party")).toBe("Either Party");
  });

  it("treats every way of saying 'nobody' as no actor at all", () => {
    // A definition has no actor. Storing "N/A" as prose only means parsing it
    // back out later.
    for (const none of ["", "   ", "N/A", "n/a", "none", "None", "null", "not applicable", "-"])
      expect(normaliseActor(none)).toBeNull();
  });

  it("does not invent an actor from a non-answer", () => {
    expect(normaliseActor(null)).toBeNull();
    expect(normaliseActor(undefined)).toBeNull();
    expect(normaliseActor(42)).toBeNull();
  });
});

/**
 * The classifications a real agreement should produce.
 *
 * These are the cases the experiment is judged on. They do not call a model —
 * they pin what "right" means, so that when the live run is inspected by hand
 * there is something to inspect it against.
 */
describe("what a correct reading looks like", () => {
  const expected: { text: string; function: string; actor: string | null; why: string }[] = [
    {
      text: "The Supplier shall maintain insurance.",
      function: "obligation",
      actor: "Supplier",
      why: "the ordinary 'X shall'",
    },
    {
      text: "The Customer may terminate this Agreement on 30 days' notice.",
      function: "termination_right",
      actor: "Customer",
      why: "notice here is the mechanism of ending the agreement, not the substance",
    },
    {
      text: "Neither Party shall disclose Confidential Information.",
      function: "prohibition",
      actor: "Both Parties",
      why: "'shall not', binding both sides",
    },
    {
      text: "The aggregate liability of the Supplier shall not exceed the Fees.",
      function: "liability_limit",
      actor: "Supplier",
      why: "a cap, even though it is phrased as a prohibition",
    },
    {
      text: "Completion is conditional upon regulatory approval.",
      function: "condition",
      actor: null,
      why: "no party is made responsible for obtaining it",
    },
    {
      text: "“Business Day” means any day other than a Saturday or Sunday.",
      function: "definition",
      actor: null,
      why: "a definition has no actor",
    },
    {
      text: "Thank you for your email of 10 September setting out your requirements.",
      function: "other",
      actor: null,
      why: "prose in an advisory letter, not a provision — other is the honest answer",
    },
  ];

  it("names a function that exists for every case", () => {
    for (const c of expected) expect(isLegalFunction(c.function)).toBe(true);
  });

  it("normalises every expected actor the way the writer will", () => {
    for (const c of expected) expect(normaliseActor(c.actor)).toBe(c.actor);
  });

  /**
   * The deliberately ambiguous one, kept separate because it has no single
   * right answer.
   *
   * "The Supplier shall indemnify the Buyer against all losses arising from a
   * breach, and the Buyer shall notify the Supplier of any claim within 14
   * days." is an obligation, a notice requirement and a deadline at once, on
   * two different parties. The vocabulary asks for the dominant function, so
   * obligation is defensible and notice_requirement is defensible.
   *
   * What would NOT be acceptable is a confident single actor: the provision
   * binds both, and answering "Supplier" alone loses the Buyer's duty entirely.
   * That is the failure mode the live inspection is looking for.
   */
  it("accepts more than one reading where a provision genuinely has more than one", () => {
    const defensible = ["obligation", "notice_requirement", "deadline"];
    for (const f of defensible) expect(isLegalFunction(f)).toBe(true);
    // Where both sides are bound, the actor must say so rather than pick one.
    expect(normaliseActor("Both Parties")).toBe("Both Parties");
  });
});
