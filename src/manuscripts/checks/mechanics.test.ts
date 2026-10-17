import { describe, expect, it } from "vitest";
import { checkMechanics } from "./mechanics";
import { assertOriginals, build, ch, p, quote } from "./test-helpers";

const run = (nodes: ReturnType<typeof build>) => {
  const r = checkMechanics({ nodes, rules: [] });
  expect(assertOriginals(r.findings, nodes)).toEqual([]);
  return r.findings;
};
const fixes = (fs: ReturnType<typeof run>) => fs.map((f) => [f.original, f.replacement]);

describe("mechanics", () => {
  it("corrects a repeated word with a unique original", () => {
    const fs = run(build([ch("Chapter 1 Introduction"), p("The court found that the the miners had had no licence. The miners appealed.")]));
    expect(fixes(fs)).toEqual([["the the", "the"]]);
    expect(fs[0]).toMatchObject({ category: "error", action: "correction", pass: "mechanics", severity: "minor" });
  });

  it("widens the original until it is unique in the paragraph", () => {
    const fs = run(build([ch("Chapter 1 Introduction"), p("It was a a test. It was a a trial.")]));
    expect(fixes(fs)).toEqual([
      ["was a a test.", "was a test."],
      ["was a a trial.", "was a trial."],
    ]);
    expect(new Set(fs.map((f) => f.fingerprint)).size).toBe(2);
  });

  it("groups double spaces per chapter into one finding", () => {
    const fs = run(
      build([
        ch("Chapter 1 Introduction"),
        p("One  space too many. And  another."),
        p("A third  one."),
        ch("Chapter 2 Method"),
        p("A fourth  one."),
      ]),
    );
    const doubles = fs.filter((f) => f.original === "  ");
    expect(doubles.map((f) => f.evidence.length)).toEqual([3, 1]);
    expect(doubles[0]!.replacement).toBe(" ");
  });

  it("corrects spaces before punctuation and missing spaces after it", () => {
    const fs = run(
      build([
        ch("Chapter 1 Introduction"),
        p("Miners , traders and buyers met.The meeting ended,however, without agreement."),
        p("The ratio was 0.5 and p < .05 in 2019, e.g. in Accra; see www.example.com/Report.Pdf and J.Smith."),
      ]),
    );
    expect(fixes(fs)).toEqual([
      ["met.The", "met. The"],
      ["ended,however", "ended, however"],
      [" ,", ","],
    ]);
  });

  it("corrects a/an by sound, with the usual exceptions left alone", () => {
    const fs = run(
      build([
        ch("Chapter 1 Introduction"),
        p("It was an university case, a hour long, with a European judge and an unusual outcome."),
        p("A one-off payment, a union rule, an honest broker, an historic ruling, a UN body, an MBA and an NGO."),
        p("Schedule A applies, and a priori reasoning is used. An apple a day."),
        p("She filed a appeal before an tribunal."),
        p("It is an MAB matter, an Mab decision, a OneNote file and a African court."),
      ]),
    );
    expect(fixes(fs)).toEqual([
      ["an university", "a university"],
      ["a hour", "an hour"],
      ["a appeal", "an appeal"],
      ["an tribunal", "a tribunal"],
      ["a African", "an African"],
    ]);
  });

  it("queries unbalanced brackets and quotation marks, allowing split paragraphs and running quotations", () => {
    const fs = run(
      build([
        ch("Chapter 1 Introduction"),
        p("The Act (as amended applies to all miners."),
        p("Items: a) miners, b) traders and c) buyers."),
        p("The report (which ran to"),
        p("forty pages) was late."),
        p("“The first paragraph of a long quotation"),
        p("“and the second, which closes it.”"),
        p("He said “stop and left."),
        p("Nothing else."),
      ]),
    );
    expect(fs.map((f) => [f.title, f.evidence[0]!.nodeKey])).toEqual([
      ["Unbalanced brackets", "n2"],
      ["Unbalanced quotation marks", "n8"],
    ]);
    expect(fs.every((f) => f.action === "query")).toBe(true);
  });

  it("leaves block quotations alone", () => {
    expect(run(build([ch("Chapter 1 Introduction"), quote("He said the the words  twice ,as written.")]))).toEqual([]);
  });
});
