import { describe, expect, it } from "vitest";
import {
  houseLongDate,
  HOUSE_SIGNATURE_RULE,
  endsAsHouse,
  houseOpening,
  housePunctuation,
  houseResolutionDate,
  houseSignature,
  ordinal,
} from "./house";

describe("the firm's date line", () => {
  it("writes a settled date the way the standard does", () => {
    expect(houseResolutionDate("2026-09-08")).toBe("Dated this 8th day of September 2026");
    expect(houseResolutionDate("2026-09-01")).toBe("Dated this 1st day of September 2026");
    expect(houseResolutionDate("2026-09-22")).toBe("Dated this 22nd day of September 2026");
    expect(houseResolutionDate("2026-09-23")).toBe("Dated this 23rd day of September 2026");
    expect(houseResolutionDate("2026-09-11")).toBe("Dated this 11th day of September 2026");
  });

  it("leaves room to be dated on execution when there is no date", () => {
    expect(houseResolutionDate("", new Date("2026-05-01"))).toBe(
      "Dated this [          ] day of [                   ] 2026",
    );
  });

  it("keeps a year it can find in a loose date", () => {
    expect(houseResolutionDate("sometime in 2027")).toContain("2027");
  });
});

describe("ordinal", () => {
  it("handles the teens and the twenties", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "30th",
    ]);
  });
});

describe("the opening sentence", () => {
  it("reproduces the standard exactly", () => {
    expect(
      houseOpening({
        companyName: "Goldenmark Ghana Limited",
        registeredOffice: "Bissau Avenue, East Legon, Accra, Ghana",
        organ: "directors",
      }),
    ).toBe(
      "GOLDENMARK GHANA LIMITED, having its registered office at Bissau Avenue, East Legon, Accra, Ghana, acting by its directors, has adopted the following written resolutions:",
    );
  });

  it("says members for a shareholders' resolution", () => {
    expect(houseOpening({ companyName: "A Ltd", registeredOffice: "", organ: "members" })).toBe(
      "A LTD, acting by its members, has adopted the following written resolutions:",
    );
  });

  it("marks the company as missing rather than writing a headless sentence", () => {
    expect(houseOpening({ companyName: "", registeredOffice: "", organ: "directors" })).toContain(
      "[company name]",
    );
  });
});

describe("the signature block", () => {
  it("is a dotted rule, the name, then the office", () => {
    expect(houseSignature("Dominik Kleemann", "Director")).toBe(
      `${HOUSE_SIGNATURE_RULE}\nDominik Kleemann\nDirector`,
    );
  });

  it("still gives an unnamed signatory a rule to sign on", () => {
    expect(houseSignature("", "Director")).toContain(HOUSE_SIGNATURE_RULE);
  });
});

describe("how a run of resolutions is punctuated", () => {
  it("runs semicolons, then '; and', then a full stop", () => {
    expect([0, 1, 2, 3, 4].map((i) => housePunctuation(i, 5))).toEqual([
      ";",
      ";",
      ";",
      "; and",
      ".",
    ]);
  });

  it("ends a single resolution with a full stop", () => {
    expect(housePunctuation(0, 1)).toBe(".");
  });

  it("recognises the standard's own resolutions as correctly punctuated", () => {
    const fromTheStandard = [
      "the Company be authorised to engage and transact with Gold Coast Refinery;",
      "management be authorised to explore, negotiate, agree, enter into and execute;",
      "the arrangement be conducted in compliance with the Act;",
      "management be authorised to execute such amendments; and",
      "any director or the company secretary be authorised to do any such acts and deeds.",
    ];
    fromTheStandard.forEach((text, index) =>
      expect(endsAsHouse(text, index, fromTheStandard.length)).toBe(true),
    );
  });

  it("catches a resolution that stops without its mark", () => {
    expect(endsAsHouse("the Company be authorised to engage", 0, 3)).toBe(false);
    expect(endsAsHouse("the last one;", 2, 3)).toBe(false);
  });

  it("says nothing about an empty resolution", () => {
    expect(endsAsHouse("   ", 0, 3)).toBe(true);
  });
});

describe("the firm's long date", () => {
  it("writes a picked date the way the firm's letters do", () => {
    expect(houseLongDate("2026-09-16")).toBe("16th September 2026");
    expect(houseLongDate("2026-08-25")).toBe("25th August 2026");
    expect(houseLongDate("2026-01-01")).toBe("1st January 2026");
    expect(houseLongDate("2026-03-22")).toBe("22nd March 2026");
  });

  it("keeps a date the lawyer typed in words, and leaves no date empty", () => {
    expect(houseLongDate(" 9th September 2026 ")).toBe("9th September 2026");
    expect(houseLongDate("")).toBe("");
  });
});
