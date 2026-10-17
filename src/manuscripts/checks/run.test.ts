import { describe, expect, it } from "vitest";
import { runChecks } from "./index";
import { assertOriginals, bib, build, cap, ch, figure, fn, front, h, p, rule, table, toc } from "./test-helpers";

/** A clean, realistic short thesis: nothing here should be flagged. */
const CLEAN = [
  front("This thesis examines how Ghana regulates small-scale gold mining and why reform has stalled."),
  toc("Chapter 1 Introduction"),
  toc("1.1 Background"),
  toc("1.2 Research questions"),
  toc("Chapter 2 Methodology"),
  toc("2.1 Sources and data"),
  toc("Chapter 3 Findings"),
  toc("References"),
  ch("Chapter 1 Introduction"),
  h("1.1 Background"),
  p(
    "Small-scale gold mining employs about a million people in Ghana and supplies roughly a third of the country's gold (Hilson 2017). The sector has grown quickly since the early 2000s, and its growth has brought both revenue and harm.",
  ),
  p(
    "The Minerals Commission (MC) licenses operators, while the Environmental Protection Agency (EPA) oversees the land they disturb. The MC and the EPA rarely act together, and their mandates overlap in ways the statute does not resolve.",
  ),
  p(
    "Earlier work has treated the sector as a problem of enforcement (Banchirigah 2008; Hilson and Maconachie 2020). This thesis argues instead that the licensing regime itself shapes behaviour, and that the organisation of the regime explains much of what follows.",
  ),
  fn("On the history of the licensing regime, see Hilson (2017), 12–15."),
  h("1.2 Research questions"),
  p(
    "The thesis asks three questions. First, how does the licensing regime allocate rights? Second, how do miners respond to it? Third, what would a better regime look like? Chapter 2 explains how these questions are answered, and Chapter 3 sets out the findings.",
  ),
  ch("Chapter 2 Methodology"),
  h("2.1 Sources and data"),
  p(
    "The study draws on forty-two interviews held between 3 March 2022 and 18 August 2022 in two regions. Table 2.1 lists the participants by role, and Figure 2.1 maps the sites visited.",
  ),
  cap("Table 2.1: Participants by role"),
  table([
    ["Role", "Number"],
    ["Miners", "24"],
    ["Officials", "11"],
    ["Traders", "7"],
  ]),
  cap("Figure 2.1: Sites visited"),
  figure(),
  p(
    "Interviews were recorded with consent, transcribed and coded in two rounds. The first round followed the themes of the research questions; the second added themes that emerged from the material itself.",
  ),
  p(
    "Documentary sources include licensing records held by the MC and reports published by the EPA. Where a record was incomplete, it was checked against a second source before it was used.",
  ),
  p(
    "The analysis is qualitative. It does not claim that the sample represents every mining community, but it does claim that the patterns it finds recur across sites that differ in size, ownership and history.",
  ),
  ch("Chapter 3 Findings"),
  p(
    "Three findings stand out. Licensing is slow, costly and uncertain; miners respond by working without a licence; and officials tolerate this because enforcement would cost them more than it would gain.",
  ),
  p(
    "Only 18 per cent of the miners interviewed held a valid licence, and most of the rest had applied but not heard back. Table 3.1 summarises the time taken to process an application at each stage.",
  ),
  cap("Table 3.1: Time taken to process an application"),
  table([
    ["Stage", "Months"],
    ["Application", "4"],
    ["Survey", "9"],
  ]),
  p(
    "One official described the backlog as ‘a queue with no end’, and several miners used almost the same words. The delay is not an accident of resources alone: as Chapter 2 showed, the MC has no deadline to decide.",
  ),
  p(
    "These findings support the view that reform should begin with the licence rather than with enforcement (Hilson and Maconachie 2020). A shorter, cheaper and more certain process would bring more miners into the regime than any campaign of raids.",
  ),
  p(
    "The conclusion follows from the evidence set out above, and it suggests that further research should examine how a reformed regime could be financed without raising the cost of a licence.",
  ),
  h("References", 1),
  bib("Banchirigah, S. M. (2008). Challenges with eradicating illegal mining in Ghana. Resources Policy 33(1), 29–38."),
  bib("Hilson, G. (2017). Shootings and burning excavators. The Extractive Industries and Society 4(1), 109–116."),
  bib("Hilson, G. and Maconachie, R. (2020). For the environment. Geoforum 111, 125–141."),
];

describe("runChecks", () => {
  it("raises nothing on a clean manuscript", () => {
    const nodes = build(CLEAN);
    const { findings } = runChecks({ nodes, rules: [] });
    expect(findings.map((f) => `${f.pass}: ${f.title}`)).toEqual([]);
  });

  it("returns the manuscript's own conventions as inactive, detected rules", () => {
    const { detectedRules } = runChecks({ nodes: build(CLEAN), rules: [] });
    expect(detectedRules).toContainEqual(expect.objectContaining({ category: "abbreviation", preferred: "EPA", note: "Environmental Protection Agency" }));
    expect(detectedRules.every((r) => r.origin === "detected" && !r.active)).toBe(true);
  });

  it("does not propose a convention the style sheet already has", () => {
    const { detectedRules } = runChecks({ nodes: build(CLEAN), rules: [rule("abbreviation", "EPA", [], "Environmental Protection Agency", false)] });
    expect(detectedRules.some((r) => r.preferred === "EPA")).toBe(false);
  });
});

describe("runChecks: target chapters", () => {
  const nodes = build([
    ch("Chapter 1 One"),
    p("Opening words."),
    ch("Chapter 2 Two"),
    p("The United Arab Emirates (UAE) buys gold. The behavior of traders matters."),
    ch("Chapter 3 Three"),
    p("The court found the the miners liable."),
    ch("Chapter 4 Four"),
    p("More words."),
    ch("Chapter 5 Five"),
    p("More words."),
    ch("Chapter 6 Six"),
    p("More words."),
    ch("Chapter 7 Seven"),
    p("The UAE refines gold. The behaviour of refiners and the behaviour of buyers differ."),
  ]);
  const ch3 = nodes.find((n) => n.text === "Chapter 3 Three")!.key;
  const ch7 = nodes.find((n) => n.text === "Chapter 7 Seven")!.key;

  it("keeps a finding that spans chapters 2 and 7 when reviewing 7, and drops one that lives in 3", () => {
    const all = runChecks({ nodes, rules: [], targetChapterKeys: null }).findings.map((f) => f.title);
    expect(all).toEqual(expect.arrayContaining(["Repeated word: ‘the the’", "‘behavior’ and ‘behaviour’ are both used"]));

    const only7 = runChecks({ nodes, rules: [], targetChapterKeys: [ch7] }).findings;
    expect(only7.map((f) => f.title)).toEqual(["‘behavior’ and ‘behaviour’ are both used"]);
    // The evidence still shows where the other form is, outside the target.
    expect(only7[0]!.evidence.map((e) => e.nodeKey)).toContain("n4");

    const only3 = runChecks({ nodes, rules: [], targetChapterKeys: [ch3] }).findings;
    expect(only3.map((f) => f.title)).toEqual(["Repeated word: ‘the the’"]);
  });

  it("uses the whole manuscript as context: an abbreviation defined in chapter 2 is defined for chapter 7", () => {
    const only7 = runChecks({ nodes, rules: [], targetChapterKeys: [ch7] }).findings;
    expect(only7.some((f) => f.title.includes("UAE"))).toBe(false);
  });
});

describe("runChecks: fingerprints and evidence", () => {
  it("gives the same fingerprints when the manuscript is re-imported with new keys", () => {
    const items = [
      ch("Chapter 1 One"),
      p("The behaviour of miners, the behaviour of traders and one behavior differ."),
      p("The court found the the miners liable, see Table 9."),
      cap("Table 1: Output"),
      table(),
      p("As Table 1 shows."),
    ];
    const a = runChecks({ nodes: build(items, "a"), rules: [] }).findings.map((f) => f.fingerprint).sort();
    const b = runChecks({ nodes: build(items, "zz"), rules: [] }).findings.map((f) => f.fingerprint).sort();
    expect(a.length).toBeGreaterThan(2);
    expect(b).toEqual(a);
  });

  it("caps evidence at twelve places and says how many more", () => {
    const items = [ch("Chapter 1 One"), ...Array.from({ length: 20 }, (_, i) => p(`Paragraph ${i} has  a double space.`))];
    const nodes = build(items);
    const { findings } = runChecks({ nodes, rules: [] });
    const f = findings.find((x) => x.original === "  ")!;
    expect(f.evidence).toHaveLength(12);
    expect(f.body).toContain("and 8 more");
    expect(assertOriginals(findings, nodes)).toEqual([]);
  });
});

describe("runChecks: performance", () => {
  it("reads 3,000 paragraphs of about 40 words in well under two seconds", () => {
    const words =
      "the regulator licenses small-scale miners across the region while traders buy gold at prices set in Accra and the Minerals Commission reviews each application slowly because its officials lack resources and clear deadlines under the law".split(
        " ",
      );
    const items = [];
    for (let c = 1; c <= 10; c++) {
      items.push(ch(`Chapter ${c} Part ${c}`));
      for (let i = 0; i < 300; i++) {
        const sentence = Array.from({ length: 40 }, (_, k) => words[(i * 7 + k * 3 + c) % words.length]).join(" ");
        const extra = i % 50 === 0 ? ` (Hilson ${2000 + (i % 20)}; see Table ${c}.1) and the behaviour of the EPA.` : ".";
        items.push(p(sentence[0]!.toUpperCase() + sentence.slice(1) + extra));
      }
      items.push(cap(`Table ${c}.1: Data`), table());
    }
    items.push(h("References", 1), bib("Hilson, G. (2017). Shootings. EIS 4(1)."), bib("Hilson, G. (2000). Early work. Resources Policy."));
    const nodes = build(items);
    expect(nodes.filter((n) => n.kind === "paragraph")).toHaveLength(3000);
    const t0 = performance.now();
    runChecks({ nodes, rules: [rule("spelling", "British spelling")] });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1500);
  });
});
