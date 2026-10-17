import { describe, expect, it } from "vitest";
import { partText } from "@/editor/model";
import {
  answerList,
  buildDocument,
  missingAnswers,
  setupComplete,
  visibleFields,
  visibleSteps,
  type Answers,
} from "./blueprint";
import { BLUEPRINTS, blueprintFor } from "./blueprints";
import { CORPORATE_KINDS, KIND_LABEL, readKind } from "./kinds";

const boardAnswers: Answers = {
  companyName: "Goldenmark Ghana Limited",
  registeredOffice: "12 Independence Avenue, Accra",
  companyNumber: "CS123456789",
  jurisdiction: "Ghana",
  subject: "Opening a US dollar account with Stanbic Bank",
  background: ["The company has agreed to supply gold to Kessler AG", "Payment is in dollars"],
  grantsAuthority: "yes",
  authorisedPerson: "Any one director",
  authorityScope: "execute the account opening documentation",
  signatories: ["Dominik Kleemann", "Akosua Mensah"],
  date: "2026-09-20",
};

describe("kinds", () => {
  it("labels every kind it offers", () => {
    for (const kind of CORPORATE_KINDS) expect(KIND_LABEL[kind]).toBeTruthy();
  });

  it("reads a row written before the kinds were split out", () => {
    expect(readKind("resolution")).toBe("board_written_resolution");
    expect(readKind("board_minutes")).toBe("board_minutes");
    expect(readKind("nonsense")).toBe("letter");
  });
});

describe("progressive disclosure", () => {
  const blueprint = blueprintFor("board_written_resolution");

  it("does not ask who is authorised until authority is wanted", () => {
    const step = blueprint.steps.find((s) => s.id === "authority")!;
    expect(visibleFields(step, {}).map((f) => f.key)).toEqual(["grantsAuthority"]);
    expect(visibleFields(step, { grantsAuthority: "yes" }).map((f) => f.key)).toEqual([
      "grantsAuthority",
      "authorisedPerson",
      "authorityScope",
    ]);
    expect(visibleFields(step, { grantsAuthority: "no" }).map((f) => f.key)).toEqual([
      "grantsAuthority",
    ]);
  });

  it("holds setup open until every visible required answer is given", () => {
    expect(setupComplete(blueprint, {})).toBe(false);
    expect(missingAnswers(blueprint, {}).map((f) => f.key)).toContain("companyName");
    expect(setupComplete(blueprint, boardAnswers)).toBe(true);
  });

  it("does not demand an answer to a question it is not asking", () => {
    const { grantsAuthority: _drop, authorisedPerson, authorityScope, ...rest } = boardAnswers;
    expect(authorisedPerson && authorityScope).toBeTruthy();
    expect(setupComplete(blueprint, { ...rest, grantsAuthority: "no" })).toBe(true);
  });

  it("keeps every step it shows worth showing", () => {
    for (const step of visibleSteps(blueprint, boardAnswers))
      expect(visibleFields(step, boardAnswers).length).toBeGreaterThan(0);
  });
});

describe("buildDocument", () => {
  it("gives a written board resolution its conventional structure, in order", () => {
    const built = buildDocument(blueprintFor("board_written_resolution"), boardAnswers);
    expect(built.parts.map((p) => p.group)).toEqual([
      "company",
      "recital",
      "recital",
      "resolution",
      "authority",
      "execution",
    ]);
  });

  it("drops the authority section when no one is being authorised", () => {
    const built = buildDocument(blueprintFor("board_written_resolution"), {
      ...boardAnswers,
      grantsAuthority: "no",
    });
    expect(built.parts.some((p) => p.group === "authority")).toBe(false);
  });

  it("gives minutes a different structure from a written resolution", () => {
    const minutes = buildDocument(blueprintFor("board_minutes"), {
      ...boardAnswers,
      meetingDate: "2026-09-20",
      chair: "Dominik Kleemann",
      present: ["Dominik Kleemann", "Akosua Mensah"],
      quorum: "yes",
    });
    const groups = minutes.parts.map((p) => p.group);
    expect(groups).toContain("attendance");
    expect(groups).toContain("consideration");
    const resolution = buildDocument(blueprintFor("board_written_resolution"), boardAnswers);
    expect(groups).not.toEqual(resolution.parts.map((p) => p.group));
  });

  it("writes one recital per background fact, in the words given", () => {
    const built = buildDocument(blueprintFor("board_written_resolution"), boardAnswers);
    const recitals = built.parts.filter((p) => p.group === "recital");
    expect(recitals).toHaveLength(2);
    expect(partText(recitals[0]!)).toContain("Kessler AG");
  });

  it("seeds the resolution from what the lawyer said is being approved", () => {
    const built = buildDocument(blueprintFor("board_written_resolution"), boardAnswers);
    const resolution = built.parts.find((p) => p.group === "resolution")!;
    expect(partText(resolution)).toContain("Stanbic Bank");
  });

  it("carries drafting guidance onto every section", () => {
    for (const kind of CORPORATE_KINDS) {
      const built = buildDocument(blueprintFor(kind), {
        ...boardAnswers,
        sender: "Nexis Africa",
        addressee: "Kessler AG",
        purpose: "Confirm the mandate",
        signatoryName: "Dominik Kleemann",
        chair: "Dominik Kleemann",
        present: ["Dominik Kleemann"],
        quorum: "yes",
        meetingDate: "2026-09-20",
        resolutionType: "ordinary",
      });
      expect(built.parts.length).toBeGreaterThan(0);
      for (const part of built.parts) expect(part.hint && part.hint.length > 20).toBe(true);
    }
  });

  it("names a special resolution as one, and says why that matters", () => {
    const special = buildDocument(blueprintFor("shareholder_written_resolution"), {
      ...boardAnswers,
      resolutionType: "special",
    });
    const part = special.parts.find((p) => p.group === "resolution")!;
    expect(part.title).toBe("Special resolution");
    expect(part.hint).toContain("exact terms");
  });

  it("opens with the firm's own operative sentence, as the signed standard does", () => {
    const built = buildDocument(blueprintFor("board_written_resolution"), boardAnswers);
    expect(partText(built.parts[0]!)).toBe(
      "GOLDENMARK GHANA LIMITED, having its registered office at 12 Independence Avenue, Accra, acting by its directors, has adopted the following written resolutions:",
    );
  });

  it("says members, not directors, on a shareholders' resolution", () => {
    const built = buildDocument(blueprintFor("shareholder_written_resolution"), {
      ...boardAnswers,
      resolutionType: "ordinary",
    });
    expect(partText(built.parts[0]!)).toContain("acting by its members");
  });

  it("carries the signatories and the particulars the export reads", () => {
    const built = buildDocument(blueprintFor("board_written_resolution"), boardAnswers);
    expect(built.signatories).toEqual(["Dominik Kleemann", "Akosua Mensah"]);
    expect(built.particulars["companyName"]).toBe("Goldenmark Ghana Limited");
    expect(built.particulars["date"]).toBe("2026-09-20");
  });

  it("titles the document from what it is about", () => {
    const built = buildDocument(blueprintFor("board_written_resolution"), boardAnswers);
    expect(built.title).toContain("Stanbic Bank");
  });

  it("builds something usable from the bare minimum", () => {
    const built = buildDocument(blueprintFor("board_written_resolution"), {
      companyName: "A Ltd",
      jurisdiction: "Ghana",
      subject: "Anything",
      signatories: ["One director"],
    });
    expect(built.parts.map((p) => p.group)).toEqual(["company", "resolution", "execution"]);
  });
});

describe("answerList", () => {
  it("reads a list from lines as well as from an array", () => {
    expect(answerList({ x: "one\n\n two \nthree" }, "x")).toEqual(["one", "two", "three"]);
    expect(answerList({ x: ["a", " b "] }, "x")).toEqual(["a", "b"]);
    expect(answerList({}, "x")).toEqual([]);
  });
});

describe("every blueprint", () => {
  it("asks only questions it can build from, and builds only sections it guides", () => {
    for (const [kind, blueprint] of Object.entries(BLUEPRINTS)) {
      expect(blueprint.kind).toBe(kind);
      const keys = new Set(blueprint.steps.flatMap((s) => s.fields.map((f) => f.key)));
      expect(keys.size).toBeGreaterThan(0);
      for (const step of blueprint.steps) expect(step.fields.length).toBeGreaterThan(0);
    }
  });
});

describe("a built document survives the round trip through storage", () => {
  it("keeps every structural group, rather than turning them into resolutions", async () => {
    const { readCorporateContentV2 } = await import("../corporate-documents");
    const { emptyMeta } = await import("@/editor/model");
    const built = buildDocument(blueprintFor("board_written_resolution"), boardAnswers);
    const stored = JSON.parse(
      JSON.stringify({
        version: 2,
        particulars: built.particulars,
        directors: built.signatories,
        parts: built.parts,
        meta: emptyMeta(),
      }),
    );
    const read = readCorporateContentV2("board_written_resolution", stored);
    expect(read.parts.map((p) => p.group)).toEqual(built.parts.map((p) => p.group));
  });
});

describe("every kind the app can create is a kind it will export", () => {
  it("accepts each instrument, and the legacy value, and nothing else", async () => {
    const { isCorporateKind } = await import("./kinds");
    for (const kind of CORPORATE_KINDS) expect(isCorporateKind(kind)).toBe(true);
    // Rows written before the instruments were split out.
    expect(isCorporateKind("resolution")).toBe(true);
    expect(isCorporateKind("minutes")).toBe(false);
    expect(isCorporateKind(undefined)).toBe(false);
  });
});

describe("the resolution's own wording", () => {
  it("seeds the first resolution as the standard words it, closing on '; and' before an authority", () => {
    const built = buildDocument(blueprintFor("board_written_resolution"), {
      ...boardAnswers,
      subject: "open a US dollar account with Stanbic Bank.",
    });
    expect(partText(built.parts.find((p) => p.group === "resolution")!)).toBe(
      "the Company be authorised to open a US dollar account with Stanbic Bank; and",
    );
    expect(partText(built.parts.find((p) => p.group === "authority")!)).toBe(
      "any one director be authorised to execute the account opening documentation.",
    );
  });

  it("keeps a resolution the lawyer already wrote as one, and ends the last with a full stop", () => {
    const built = buildDocument(blueprintFor("board_written_resolution"), {
      ...boardAnswers,
      grantsAuthority: "no",
      subject: "The Company engage Gold Coast Refinery;",
    });
    expect(partText(built.parts.find((p) => p.group === "resolution")!)).toBe(
      "the Company engage Gold Coast Refinery.",
    );
  });
});

describe("letter presets", () => {
  const letter = blueprintFor("letter");

  it("asks for an employment confirmation's facts and writes its paragraphs", () => {
    const answers: Answers = {
      letterType: "employment",
      employer: "Nexis Africa",
      employeeName: "Mr. Mawusi Adusu",
      idNumber: "Passport Number G412686",
      position: "Project Analyst",
      startDate: "2026-01-05",
      employmentBasis: "full-time",
      salary: "AED 12,500",
      goodStanding: "yes",
      requestedFor: "account opening purposes",
      signatoryName: "Dominik Kleemann",
    };
    // No addressee, subject or purpose is asked of a confirmation.
    expect(setupComplete(letter, answers)).toBe(true);
    const built = buildDocument(letter, answers);
    expect(built.parts.map((p) => partText(p))).toEqual([
      "This is to confirm that Mr. Mawusi Adusu, holder of Passport Number G412686, is currently employed with Nexis Africa as a Project Analyst.",
      "Mr. Mawusi Adusu was employed on 5th January 2026 and is engaged on a full-time basis.",
      "Mr. Mawusi Adusu's salary is paid via bank transfer, and the total monthly compensation is AED 12,500.",
      "Mr. Mawusi Adusu is in good standing with Nexis Africa and continues to be employed as at the date of this letter.",
      "This letter is issued at the employee's request for account opening purposes.",
    ]);
    expect(built.particulars["subject"]).toBe(
      "Employment and salary confirmation – Mr. Mawusi Adusu",
    );
    expect(built.particulars["salutation"]).toBe("To Whom It May Concern");
  });

  it("writes a confirmation of address in the declarant's voice", () => {
    const answers: Answers = {
      letterType: "address",
      declarantName: "Dominik Kleemann",
      declarantCapacity: "a lawyer admitted in Australia",
      subjectName: "Mr. Abdulmohsin A H A Almishar",
      knowledgeBasis: "my personal and professional knowledge of his residence status",
      signatoryName: "Dominik Kleemann",
    };
    expect(setupComplete(letter, answers)).toBe(true);
    const built = buildDocument(letter, answers);
    expect(partText(built.parts[0]!)).toBe(
      "I, Dominik Kleemann, a lawyer admitted in Australia, hereby confirm that Mr. Abdulmohsin A H A Almishar continues to reside at the address referred to in the previous proof of address held in your records.",
    );
    expect(built.parts.some((p) => p.group === "purpose")).toBe(false);
    expect(built.particulars["closing"]).toBe("Sincerely,");
    expect(built.particulars["subject"]).toBe("Confirmation of residential address");
  });

  it("still asks a general letter for its addressee, subject and purpose", () => {
    const missing = missingAnswers(letter, { letterType: "general" }).map((f) => f.key);
    expect(missing).toEqual(
      expect.arrayContaining(["addressee", "subject", "purpose", "signatoryName"]),
    );
    expect(missing).not.toContain("sender");
  });
});
