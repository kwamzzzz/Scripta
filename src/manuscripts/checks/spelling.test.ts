import { describe, expect, it } from "vitest";
import { checkSpelling } from "./spelling";
import { SPELL_FAMILIES, SPELL_LOOKUP } from "./spelling-data";
import { assertOriginals, build, ch, p, quote, rule } from "./test-helpers";

const run = (nodes: ReturnType<typeof build>, rules = [] as ReturnType<typeof rule>[]) => {
  const r = checkSpelling({ nodes, rules });
  expect(assertOriginals(r.findings, nodes)).toEqual([]);
  return r;
};

describe("spelling data", () => {
  it("has a broad curated list without blind -ise matches", () => {
    expect(SPELL_FAMILIES.length).toBeGreaterThan(150);
    for (const same of ["advertise", "comprise", "size", "prize", "analyses", "practice", "meter", "check", "program"])
      expect(SPELL_LOOKUP.get(same)?.variety === "gb").toBe(false);
    expect(SPELL_LOOKUP.get("organisation")).toMatchObject({ variety: "gb" });
    expect(SPELL_LOOKUP.get("behavioral")).toMatchObject({ variety: "us" });
  });
});

describe("spelling: drift", () => {
  const nodes = build([
    ch("Chapter 1 Introduction"),
    p("The behaviour of miners and the behaviour of regulators differ."),
    p("Their behavioural patterns, and one behavior in particular, matter."),
    p("The Center for Democratic Development and the World Health Organization agree."),
    p("He said the “behavior was odd” in an interview."),
  ]);
  const { findings, detectedRules } = run(nodes);

  it("raises one query per family naming both forms, minority first", () => {
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f).toMatchObject({ action: "query", severity: "minor", pass: "style", title: "‘behavior’ and ‘behaviour’ are both used" });
    expect(f.evidence[0]).toEqual({ nodeKey: "n3", quote: "behavior", note: "less common form" });
    // Two uses in one paragraph are one place.
    expect(f.evidence.filter((e) => e.note === "usual form")).toEqual([{ nodeKey: "n2", quote: "behaviour", note: "usual form" }]);
    expect(f.body).toContain("(3 times)");
  });

  it("ignores names and quotations", () => {
    expect(JSON.stringify(findings)).not.toMatch(/Center|Organization/);
  });

  it("proposes the majority as a style-sheet rule", () => {
    expect(detectedRules).toContainEqual(
      expect.objectContaining({ category: "spelling", preferred: "behaviour", variants: ["behavior"], origin: "detected", active: false }),
    );
  });
});

describe("spelling: an active rule settles it", () => {
  const nodes = build([
    ch("Chapter 1 Introduction"),
    p("The behavior of miners and the behavior of regulators differ."),
    p("Behavioral economics helps. One behaviour is odd."),
  ]);

  it("turns off-rule forms into corrections and stops the query", () => {
    const { findings } = run(nodes, [rule("spelling", "behaviour", ["behavior"])]);
    expect(findings.every((f) => f.action === "correction")).toBe(true);
    expect(findings.map((f) => [f.original, f.replacement, f.evidence.length])).toEqual([
      ["behavior", "behaviour", 1],
      ["Behavioral", "Behavioural", 1],
    ]);
    expect(findings[0]!.body).toContain("twice");
    expect(findings[0]!.ruleId).toBeTruthy();
  });

  it("never flags the form the rule prefers", () => {
    const { findings } = run(nodes, [rule("spelling", "behavior", ["behaviour"])]);
    expect(findings.map((f) => [f.original, f.replacement])).toEqual([["behaviour", "behavior"]]);
  });

  it("an inactive rule does not apply", () => {
    const { findings } = run(nodes, [rule("spelling", "behaviour", ["behavior"], "", false)]);
    expect(findings.map((f) => f.action)).toEqual(["query"]);
  });
});

describe("spelling: families and varieties", () => {
  it("pools -ise and -ize across words", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("We organise the data, recognise the limits and summarise the results."),
      p("The organisation was realised later, but we then analysed and categorized it."),
    ]);
    const { findings } = run(nodes);
    expect(findings.map((f) => f.title)).toEqual(["Both -ise and -ize spellings are used"]);
    expect(findings[0]!.evidence[0]!.quote).toBe("categorized");
    const withRule = run(nodes, [rule("spelling", "-ise", ["-ize"])]).findings;
    expect(withRule.map((f) => [f.original, f.replacement])).toEqual([["categorized", "categorised"]]);
  });

  it("asks about a lone American form in a clearly British manuscript", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("The heart of the labour market favours the defence of colour and honour."),
      p("Their behaviour, the neighbouring towns, the theatre and the offence all count."),
      p("The favourite labour rumour spread through the harbour."),
      p("The trial took place in a new courthouse center downtown."),
    ]);
    const { findings, detectedRules } = run(nodes);
    expect(findings.map((f) => f.title)).toEqual(["American spelling ‘center’ in a British-spelled manuscript"]);
    expect(detectedRules).toContainEqual(expect.objectContaining({ preferred: "British spelling" }));
  });

  it("does not count 'program' in a computing sentence or 'license' as a verb", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("The programme ran for two years and the programme was reviewed."),
      p("The software program was written in Python."),
      p("The licence was renewed, and the state may license new operators."),
    ]);
    expect(run(nodes).findings).toEqual([]);
  });

  it("treats judgement and judgment as their own choice", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("The judgment of the court and a later judgement differ."),
    ]);
    expect(run(nodes).findings.map((f) => f.title)).toEqual(["‘judgment’ and ‘judgement’ are both used"]);
  });

  it("ignores block quotations", () => {
    const nodes = build([ch("Chapter 1 Introduction"), p("The behaviour was noted."), quote("Their behavior was odd.")]);
    expect(run(nodes).findings).toEqual([]);
  });
});
