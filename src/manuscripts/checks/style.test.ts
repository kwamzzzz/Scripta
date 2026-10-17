import { describe, expect, it } from "vitest";
import { checkCapitalisation } from "./capitalisation";
import { checkDates } from "./dates";
import { checkHyphenation } from "./hyphenation";
import { checkNameVariants } from "./names";
import { checkNumbers } from "./numbers";
import { checkQuotation } from "./quotes";
import { checkStyleRules } from "./rules";
import { assertOriginals, bib, build, ch, h, p, rule } from "./test-helpers";
import type { CheckInput, CheckResult } from "./types";

const runner =
  (check: (i: CheckInput) => CheckResult) =>
  (nodes: ReturnType<typeof build>, rules = [] as ReturnType<typeof rule>[]) => {
    const r = check({ nodes, rules });
    expect(assertOriginals(r.findings, nodes)).toEqual([]);
    return r;
  };

describe("hyphenation", () => {
  const run = runner(checkHyphenation);
  const nodes = build([
    ch("Chapter 1 Introduction"),
    p("Decision-making in the sector is slow, and decision-making by boards is slower."),
    p("Good decision making needs data. Send an e-mail, or an email, to the policymaker."),
    p("A policy-maker and a well-known case; the case is well known, and in the long term a long-term plan helps."),
  ]);

  it("queries the same compound written two ways, and leaves grammatical pairs alone", () => {
    const { findings, detectedRules } = run(nodes);
    expect(findings.map((f) => f.title).sort()).toEqual([
      "‘decision-making’ and ‘decision making’ are both used",
      "‘e-mail’ and ‘email’ are both used",
      "‘policy-maker’ and ‘policymaker’ are both used",
    ]);
    expect(detectedRules).toContainEqual(
      expect.objectContaining({ category: "hyphenation", preferred: "decision-making", variants: ["decision making"] }),
    );
  });

  it("with a rule, the off-rule form is corrected and not queried", () => {
    const r = [rule("hyphenation", "decision-making", ["decision making"])];
    expect(run(nodes, r).findings.some((f) => f.title.includes("decision"))).toBe(false);
    const fixes = runner(checkStyleRules)(nodes, r).findings;
    expect(fixes.map((f) => [f.original, f.replacement, f.action])).toEqual([["decision making", "decision-making", "correction"]]);
  });
});

describe("capitalisation", () => {
  const run = runner(checkCapitalisation);
  it("queries a term capitalised and not, ignoring sentence openings, full names and generic uses", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("Policy is set by the Central Bank each quarter, and the Central Bank publishes it."),
      p("Central bank staff met. Later the central bank raised rates."),
      p("A central bank in any country does this. The Central Bank of Nigeria differs."),
      p("The Performance-Based Vesting rule and based vesting periods are different things."),
    ]);
    const { findings } = run(nodes);
    expect(findings.map((f) => f.title)).toEqual(["‘Central Bank’ and ‘central bank’ are both used"]);
    expect(findings[0]!.evidence.map((e) => e.quote)).toEqual(["central bank", "Central Bank"]);
    expect(findings[0]!.pass).toBe("consistency");
  });

  it("a capitalisation rule corrects instead", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("Policy is set by the Central Bank, and the central bank publishes it. Central Bank staff agree."),
    ]);
    const r = [rule("capitalisation", "Central Bank", ["central bank"])];
    expect(run(nodes, r).findings).toEqual([]);
    const fixes = runner(checkStyleRules)(nodes, r).findings;
    expect(fixes.map((f) => [f.original, f.replacement])).toEqual([["central bank", "Central Bank"]]);
  });
});

describe("numbers", () => {
  const run = runner(checkNumbers);
  const nodes = build([
    ch("Chapter 1 Introduction"),
    p("Output rose by 12 per cent in 2019 and by 8 per cent in 2020, while costs fell 3%."),
    p("Some 40 per cent of miners are women."),
    p("We interviewed three officials, four miners and five traders in two regions."),
    p("We also met 6 buyers and 7 brokers, with 3 lawyers present in Table 2 and Chapter 4."),
  ]);

  it("queries percent style and small-number style, proposing the majority", () => {
    const { findings, detectedRules } = run(nodes);
    expect(findings.map((f) => f.title)).toEqual([
      "Percentages are written as ‘per cent’ and ‘%’",
      "Numbers under ten are written both as words and as figures",
    ]);
    expect(findings[0]!.evidence[0]).toEqual({ nodeKey: "n2", quote: "3%", note: "less common form" });
    expect(detectedRules.map((r) => r.preferred)).toEqual(["per cent", "Numbers under ten in words"]);
  });

  it("with rules, corrects instead of asking", () => {
    const { findings } = run(nodes, [
      rule("numbers", "per cent"),
      rule("numbers", "Numbers under ten in words", [], "Write numbers under ten as words."),
    ]);
    expect(findings.map((f) => [f.original, f.replacement])).toEqual([
      ["3%", "3 per cent"],
      ["6 buyers", "six buyers"],
      ["7 brokers", "seven brokers"],
      ["3 lawyers", "three lawyers"],
    ]);
  });

  it("does not count measurements, references or ranges with larger numbers", () => {
    const n = build([
      ch("Chapter 1 Introduction"),
      p("See Table 3 and Chapter 4. The site is 5 km away and took 3 hours."),
      p("Between 5 and 15 workers attended; three officials and two miners came, and four traders left."),
    ]);
    expect(run(n).findings).toEqual([]);
  });
});

describe("dates", () => {
  const run = runner(checkDates);
  const nodes = build([
    ch("Chapter 1 Introduction"),
    p("The Act came into force on 22 September 2016 and was amended on 3 May 2019."),
    p("A further change followed on 1 July 2021, and the review began on September 22, 2022."),
    p("The last hearing was on 04/05/2023."),
  ]);

  it("queries mixed formats and proposes the majority", () => {
    const { findings, detectedRules } = run(nodes);
    expect(findings.map((f) => f.title)).toEqual(["Dates are written in 3 formats"]);
    expect(findings[0]!.evidence.map((e) => e.quote)).toEqual(expect.arrayContaining(["September 22, 2022", "04/05/2023"]));
    expect(detectedRules[0]).toMatchObject({ category: "dates", preferred: "22 September 2026" });
  });

  it("with a rule, rewrites what can be read one way and asks about the rest", () => {
    const { findings } = run(nodes, [rule("dates", "22 September 2026")]);
    expect(findings.map((f) => [f.action, f.original, f.replacement])).toEqual([
      ["correction", "September 22, 2022", "22 September 2022"],
      ["query", undefined, undefined],
    ]);
  });
});

describe("quotation marks", () => {
  const run = runner(checkQuotation);
  it("queries mixed single and double outer marks, ignoring nested quotations", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("He called it ‘reform’ and later ‘progress’; others said ‘decline’."),
      p("The minister spoke of ‘growth’ and ‘jobs’ and ‘the “new” deal’."),
      p("A critic called it “theatre”, a second “noise”, and a third “spin”."),
    ]);
    const { findings } = run(nodes);
    expect(findings.map((f) => f.title)).toEqual(["Single and double quotation marks are both used for quotations"]);
  });

  it("queries a few straight marks among curly ones", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("The miners’ union called it ‘theft’. The state’s view differs. It isn’t simple, and it’s ‘urgent’."),
      p("Officials didn't agree, and the union's case was weak."),
    ]);
    const { findings } = run(nodes);
    expect(findings.map((f) => f.title)).toEqual(["Some quotation marks are straight, not curly"]);
    expect(findings[0]!.evidence.filter((e) => e.note === "less common form")).toHaveLength(2);
  });
});

describe("name variants", () => {
  const run = runner(checkNameVariants);
  it("queries near-identical names used at least twice each", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("The regulator, GoldBod, was created in 2025. Critics of GoldBod say it is slow."),
      p("Supporters of Goldbod disagree, and Goldbod has grown. Under Nkrumah the state expanded."),
      p("Later Nkrumah fell; the Nkruma government had lasted nine years, as Nkruma admitted."),
      p("Kenya and the Kenyan courts, Gambia and Zambia, Gambia and Zambia again, and Kenya and Kenyan law."),
    ]);
    const { findings } = run(nodes);
    expect(findings.map((f) => f.title).sort()).toEqual([
      "‘GoldBod’ and ‘Goldbod’ are both used",
      "‘Nkruma’ and ‘Nkrumah’ are both used",
    ]);
  });

  it("leaves alone two authors who are both in the bibliography", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("As argued by Smith and later by Smyth, and again by Smith and Smyth."),
      h("References", 1),
      bib("Smith, J. (2019). Gold."),
      bib("Smyth, K. (2020). Silver."),
    ]);
    expect(run(nodes).findings).toEqual([]);
  });
});

describe("literal style rules", () => {
  it("applies terminology rules outside quotations and names", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("The small scale miners and the Small Scale Miners Association met; they said “small scale miners” matter."),
    ]);
    const { findings } = runner(checkStyleRules)(nodes, [rule("terminology", "small-scale miners", ["small scale miners"])]);
    expect(findings.map((f) => [f.original, f.replacement])).toEqual([["small scale miners", "small-scale miners"]]);
    expect(findings[0]!.evidence).toHaveLength(1);
  });
});
