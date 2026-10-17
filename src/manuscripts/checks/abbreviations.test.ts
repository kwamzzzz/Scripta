import { describe, expect, it } from "vitest";
import { checkAbbreviations } from "./abbreviations";
import { assertOriginals, build, ch, front, h, p, rule, table } from "./test-helpers";

const run = (nodes: ReturnType<typeof build>, rules = [] as ReturnType<typeof rule>[]) => {
  const r = checkAbbreviations({ nodes, rules });
  expect(assertOriginals(r.findings, nodes)).toEqual([]);
  return r;
};

describe("abbreviations", () => {
  const nodes = build([
    front("This thesis studies gold regulation in the UAE and Ghana."),
    ch("Chapter 1 Introduction"),
    h("1.1 The GRA"),
    p("The GRA collects royalties. Gold flows through the UAE to refiners."),
    p("The Ghana Revenue Authority (GRA) was set up in 2009. Trade with the United Arab Emirates (UAE) grew."),
    p("The GRA and the UAE are central. The Minerals Commission (MC) licenses miners."),
    ch("Chapter 2 Method"),
    p("Here the Ghana Revenue Authority (GRA) is again spelled out, and the UAE appears."),
    p("The Economic Community of West African States (ECOWAS) sets rules; the Economic Commission of West African States (ECOWAS) is different."),
    p("NATO, the OECD, the EU and the UK need no comment. ECOWAS matters."),
  ]);
  const { findings, detectedRules } = run(nodes);
  const byTitle = (t: string) => findings.find((f) => f.title === t);

  it("flags use before definition, but not in headings or front matter", () => {
    const f = byTitle("GRA is used before it is defined")!;
    expect(f).toMatchObject({ category: "consistency", severity: "minor" });
    expect(f.evidence).toEqual([
      { nodeKey: "n4", quote: "GRA", note: "used before the definition" },
      { nodeKey: "n5", quote: "Ghana Revenue Authority (GRA)", note: "definition" },
    ]);
    expect(byTitle("UAE is used before it is defined")).toBeTruthy();
  });

  it("flags a second definition, and two different expansions as material", () => {
    expect(byTitle("GRA is defined twice")).toBeTruthy();
    const two = byTitle("ECOWAS is defined in 2 different ways")!;
    expect(two.severity).toBe("material");
    expect(two.action).toBe("query");
  });

  it("flags a definition never used again", () => {
    expect(byTitle("MC is defined but never used again")).toMatchObject({ action: "suggestion" });
  });

  it("does not flag undefined common or well-known abbreviations", () => {
    expect(findings.some((f) => /NATO|OECD|\bEU\b|\bUK\b/.test(f.title))).toBe(false);
  });

  it("proposes each defined abbreviation for the style sheet", () => {
    expect(detectedRules).toContainEqual(
      expect.objectContaining({ category: "abbreviation", preferred: "UAE", note: "United Arab Emirates" }),
    );
  });

  it("a rule's expansion turns a different expansion into a correction", () => {
    const n = build([
      ch("Chapter 1 Introduction"),
      p("The Economic Commission of West African States (ECOWAS) sets rules. ECOWAS matters."),
    ]);
    const { findings: fs } = run(n, [rule("abbreviation", "ECOWAS", [], "Economic Community of West African States")]);
    expect(fs.map((f) => [f.action, f.original, f.replacement])).toEqual([
      ["correction", "Economic Commission of West African States", "Economic Community of West African States"],
    ]);
  });

  it("counts a use in a table as a use", () => {
    const n = build([
      ch("Chapter 1 Introduction"),
      p("The Minerals Commission (MC) licenses miners."),
      table([["Body", "Role"], ["MC", "Licensing"]]),
    ]);
    expect(run(n).findings).toEqual([]);
  });
});

describe("abbreviations: short forms with capitals inside, and definitions written the other way round", () => {
  it("catches GoldBod defined two ways, in either order", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("In 2025 Parliament created the Ghana Gold Board (GoldBod) to buy all artisanal gold."),
      p("GoldBod now sets the price."),
      ch("Chapter 4 Reform"),
      p("GoldBod (the Gold Board of Ghana) has since been criticised, and GoldBod has responded."),
    ]);
    const { findings, detectedRules } = run(nodes);
    const f = findings.find((x) => x.title === "GoldBod is defined in 2 different ways")!;
    expect(f).toMatchObject({ severity: "material", action: "query", category: "consistency" });
    expect(f.evidence).toEqual([
      { nodeKey: "n2", quote: "Ghana Gold Board" },
      { nodeKey: "n5", quote: "Gold Board of Ghana" },
    ]);
    expect(detectedRules.some((r) => r.preferred === "GoldBod")).toBe(false);
    expect(findings.map((x) => x.title)).not.toContain("GoldBod is defined but never used again");
  });

  it("does not call a short form defined twice 'never used again'", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("Parliament created the Ghana Gold Board (GoldBod) in 2025."),
      ch("Chapter 4 Reform"),
      p("Critics of the Gold Board of Ghana (GoldBod) remain."),
    ]);
    expect(run(nodes).findings.map((x) => x.title)).toEqual(["GoldBod is defined in 2 different ways"]);
  });

  it("reads the reverse form as a definition when it agrees", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("The Bank of Ghana (BoG) regulates banks. The BoG also supervises lenders."),
      p("Later the BoG (Bank of Ghana) issued a directive, and the BoG enforced it."),
      p("State-owned enterprises (SOEs) dominate, and SOEs borrow heavily."),
    ]);
    const { findings, detectedRules } = run(nodes);
    expect(findings.map((f) => f.title)).toEqual(["BoG is defined twice"]);
    expect(detectedRules).toContainEqual(expect.objectContaining({ preferred: "BoG", note: "Bank of Ghana" }));
    expect(detectedRules).toContainEqual(expect.objectContaining({ preferred: "SOE", note: "State-owned enterprises" }));
  });

  it("does not read ordinary brackets as definitions", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("Section 4 (see above) applies, and the sample was small (n = 42)."),
      p("Accra (Greater Accra Region) and Kumasi (Ashanti) were visited; Mr Mensah (a trader) spoke first."),
      p("The Minister (Hon. Mensah) and the Court (High Court) agreed. Parliament (the House) sat late."),
    ]);
    expect(run(nodes)).toEqual({ findings: [], detectedRules: [] });
  });
});
