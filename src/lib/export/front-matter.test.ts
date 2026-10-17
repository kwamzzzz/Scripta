import { describe, expect, it } from "vitest";
import {
  buildFrontMatter,
  frontMatterSource,
  instrumentName,
  longDate,
  readFrontMatterEdits,
} from "./front-matter";

const source = {
  agreementType: "Employment Contract",
  client: "Acme Ghana Ltd",
  counterparty: "Jane Doe",
  date: "2026-09-01",
  clientRole: "Employer",
  counterpartyRole: "Employee",
};

const texts = (lines: { text: string }[]) => lines.map((l) => l.text);

describe("longDate", () => {
  it("writes the date the way the firm writes it", () => {
    expect(longDate("2026-09-01")).toBe("1st September 2026");
    expect(longDate("2026-09-02")).toBe("2nd September 2026");
    expect(longDate("2026-09-03")).toBe("3rd September 2026");
    expect(longDate("2026-09-17")).toBe("17th September 2026");
  });

  it("gets the teens right, where the suffix rule reverses", () => {
    expect(longDate("2026-09-11")).toBe("11th September 2026");
    expect(longDate("2026-09-12")).toBe("12th September 2026");
    expect(longDate("2026-09-13")).toBe("13th September 2026");
  });

  it("asks for a date rather than inventing today's", () => {
    expect(longDate("")).toBe("[Date]");
    expect(longDate("not a date")).toBe("[Date]");
  });
});

describe("the cover page", () => {
  it("sits at the top unless the lawyer moves it clear of the letterhead logo", () => {
    expect(buildFrontMatter(source).coverY).toBe(0);
    expect(buildFrontMatter({ ...source, coverY: 0.62 }).coverY).toBe(0.62);
    expect(buildFrontMatter(frontMatterSource({ ...source }, { coverY: 0.9 })).coverY).toBe(0.9);
  });

  it("carries the agreement type and nothing else", () => {
    // The employment contract's page one is the letterhead and the title. The
    // tenancy agreement lists its parties there; that is its own convention,
    // not the house one.
    expect(texts(buildFrontMatter(source).cover)).toEqual(["EMPLOYMENT CONTRACT"]);
  });

  it("asks for the agreement type rather than falling back to the matter name", () => {
    expect(texts(buildFrontMatter({ ...source, agreementType: " " }).cover)).toEqual([
      "[AGREEMENT TYPE]",
    ]);
  });
});

describe("the preamble", () => {
  it("runs from the operative sentence to the words that make the clauses bite", () => {
    const { preamble } = buildFrontMatter(source);
    const joined = texts(preamble);
    expect(joined[0]).toContain("THIS EMPLOYMENT CONTRACT");
    expect(joined[0]).toContain("is made on this 1st day of September 2026 (the Signing Date)");
    expect(joined).toContain("BETWEEN:");
    expect(joined[joined.length - 1]).toBe("NOW IT IS HEREBY AGREED as follows:");
  });

  it("numbers the parties and names them collectively by their roles", () => {
    const joined = texts(buildFrontMatter(source).preamble);
    expect(joined.some((t) => t.startsWith("(1)\tAcme Ghana Ltd"))).toBe(true);
    expect(joined.some((t) => t.startsWith("(2)\tJane Doe"))).toBe(true);
    expect(joined.some((t) => t.includes("the Employer and the Employee"))).toBe(true);
  });

  it("sets each line as the firm's contracts set it", () => {
    // Measured from the employment contract in the template bank: the type in
    // bold and the ordinal raised, the parties hanging from a tab after their
    // number, the first ending "; AND" and the second ",", the collective
    // terms bold, and the operative words bold on a line of their own.
    const { preamble } = buildFrontMatter(source);
    const byPart = (part: string) => preamble.filter((l) => l.part === part);
    const title = byPart("title")[0]!;
    expect(title.runs?.[0]).toEqual({ text: "THIS EMPLOYMENT CONTRACT ", bold: true });
    expect(title.runs?.some((r) => r.sup && r.text === "st")).toBe(true);
    expect(title.text).toContain("(the “Contract”)");
    const [first] = byPart("party1");
    const [second] = byPart("party2");
    expect(first).toMatchObject({ hanging: true, align: "justify" });
    expect(first!.text).toBe("(1)\tAcme Ghana Ltd of [First party address] (the “Employer”); AND");
    expect(second!.text).toBe("(2)\tJane Doe of [Second party address] (the “Employee”),");
    const parties = byPart("parties")[0]!;
    expect(parties.text).toBe(
      "(the Employer and the Employee are together referred to as the “Parties” and each individually as a “Party”).",
    );
    expect(parties.runs?.filter((r) => r.bold).map((r) => r.text)).toEqual([
      "“Parties”",
      "“Party”",
    ]);
    expect(byPart("agreed")[0]).toMatchObject({ strong: true, align: "left" });
    // A blank line sits between the parties, as it does on the page.
    expect(preamble[3]!.text).toBe("");
    expect(preamble[3]!.hanging).toBe(true);
  });

  it("calls an agreement an Agreement and anything else a Contract", () => {
    expect(instrumentName("Employment Contract")).toBe("Contract");
    expect(instrumentName("Supplemental Tenancy Agreement")).toBe("Agreement");
    const { preamble } = buildFrontMatter({ ...source, agreementType: "Tenancy Agreement" });
    expect(preamble[0]!.text).toContain("THIS TENANCY AGREEMENT (the “Agreement”)");
  });

  it("runs a description on after a comma but introduces an address with of", () => {
    const described = buildFrontMatter({
      ...source,
      clientAddress:
        "a company incorporated under the laws of Ghana with its office at 12 Bissau Avenue, Accra",
    }).preamble.find((l) => l.part === "party1")!;
    expect(described.text).toContain("Acme Ghana Ltd, a company incorporated");
    const addressed = buildFrontMatter({
      ...source,
      clientAddress: "12 Bissau Avenue, Accra",
    }).preamble.find((l) => l.part === "party1")!;
    expect(addressed.text).toContain("Acme Ghana Ltd of 12 Bissau Avenue, Accra");
  });

  it("asks for an address rather than inventing one", () => {
    const joined = texts(buildFrontMatter(source).preamble);
    expect(joined.some((t) => t.includes("[First party address]"))).toBe(true);
  });

  it("will not compose a recital nobody wrote", () => {
    const joined = texts(buildFrontMatter(source).preamble);
    expect(joined.some((t) => t === "WHEREAS [Why the parties are contracting]")).toBe(true);
  });

  it("does not say WHEREAS twice when the recital already begins with it", () => {
    const joined = texts(
      buildFrontMatter({
        ...source,
        recitals: ["WHEREAS the Employer wishes to employ the Employee;"],
      }).preamble,
    );
    expect(joined).toContain("WHEREAS the Employer wishes to employ the Employee;");
    expect(joined.some((t) => /WHEREAS WHEREAS/i.test(t))).toBe(false);
  });

  it("uses the recitals when there are some, and only marks the first", () => {
    const { preamble } = buildFrontMatter({
      ...source,
      recitals: ["the Employer wishes to employ the Employee;", "the Employee has agreed."],
    });
    const joined = texts(preamble);
    expect(joined).toContain("WHEREAS the Employer wishes to employ the Employee;");
    expect(joined).toContain("the Employee has agreed.");
  });

  it("falls back to neutral roles rather than guessing what a party is called", () => {
    const joined = texts(
      buildFrontMatter({ ...source, clientRole: undefined, counterpartyRole: undefined }).preamble,
    );
    expect(joined.some((t) => t.includes("the First Party and the Second Party"))).toBe(true);
  });

  it("asks for a party it was not given", () => {
    const joined = texts(buildFrontMatter({ ...source, counterparty: "  " }).preamble);
    expect(joined.some((t) => t.startsWith("(2)\t[Second party]"))).toBe(true);
  });

  it("does not repeat the title the cover has just given", () => {
    const joined = texts(buildFrontMatter(source).preamble);
    expect(joined[0]).toContain("THIS EMPLOYMENT CONTRACT");
    expect(joined).not.toContain("EMPLOYMENT CONTRACT");
  });
});

describe("edits to the first page", () => {
  const matter = {
    agreementType: "Agreement",
    client: "Acme Ghana Ltd",
    counterparty: "Jane Doe",
    date: "2026-09-01",
  };

  it("uses the matter's own record when nothing has been edited", () => {
    expect(frontMatterSource(matter, {})).toMatchObject({
      agreementType: "Agreement",
      client: "Acme Ghana Ltd",
    });
  });

  it("lets a correction win over the matter", () => {
    const s = frontMatterSource(matter, { agreementType: "Employment Contract" });
    expect(s.agreementType).toBe("Employment Contract");
  });

  it("treats a cleared field as no edit, so the derived value comes back", () => {
    // Otherwise clearing a box would empty the contract rather than restore it.
    expect(frontMatterSource(matter, { client: "   " }).client).toBe("Acme Ghana Ltd");
  });

  it("puts an edited address into the preamble instead of asking for one", () => {
    const { preamble } = buildFrontMatter(
      frontMatterSource(matter, { clientAddress: "1 Main Street, Accra" }),
    );
    const joined = texts(preamble);
    expect(joined.some((t) => t.includes("1 Main Street, Accra"))).toBe(true);
    expect(joined.some((t) => t.includes("[First party address]"))).toBe(false);
  });

  it("still asks for the address it was not given", () => {
    const joined = texts(buildFrontMatter(frontMatterSource(matter, {})).preamble);
    expect(joined.some((t) => t.includes("[First party address]"))).toBe(true);
  });
});

describe("readFrontMatterEdits", () => {
  it("reads what was stored", () => {
    expect(readFrontMatterEdits({ agreementType: "Lease", recitals: ["a", "b"] })).toEqual({
      agreementType: "Lease",
      recitals: ["a", "b"],
    });
  });

  it("reads the cover position as a fraction of the page, and nothing else", () => {
    expect(readFrontMatterEdits({ coverY: 0.62 })).toEqual({ coverY: 0.62 });
    expect(readFrontMatterEdits({ coverY: 7 })).toEqual({ coverY: 1 });
    expect(readFrontMatterEdits({ coverY: "middle" })).toEqual({});
  });

  it("discards anything that is not a front matter rather than throwing", () => {
    expect(readFrontMatterEdits(null)).toEqual({});
    expect(readFrontMatterEdits("nonsense")).toEqual({});
    expect(readFrontMatterEdits([1, 2])).toEqual({});
    expect(readFrontMatterEdits({ agreementType: 7, recitals: "no" })).toEqual({});
  });
});
