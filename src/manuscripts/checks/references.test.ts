import { describe, expect, it } from "vitest";
import { checkReferences } from "./references";
import { assertOriginals, build, cap, ch, eq, figure, fn, h, p, table, toc } from "./test-helpers";

const run = (nodes: ReturnType<typeof build>) => {
  const r = checkReferences({ nodes, rules: [] });
  expect(assertOriginals(r.findings, nodes)).toEqual([]);
  return r.findings;
};
const titles = (fs: { title: string }[]) => fs.map((f) => f.title);

describe("references: targets that do not exist", () => {
  const nodes = build([
    ch("Chapter 1 Introduction"),
    p("This thesis has three chapters. Chapter 2 sets out the method and Chapter 3 the results."),
    ch("Chapter 2 Method"),
    h("2.1 Sample"),
    p("The sample is described in Table 2.1 and Table 2.2. As section 2.1 explains, the design follows Figure 2.1."),
    cap("Table 2.1: Respondents"),
    table(),
    cap("Table 2.2: Sites"),
    table(),
    cap("Figure 2.1: Design"),
    ch("Chapter 3 Results"),
    p("The results appear in Table 3.1 and Table 6.2 (see also Section 2.4 and Chapter 9)."),
    p("Appendix C lists the interview questions, and Equation (2) gives the model."),
    cap("Table 3.1: Results"),
    table(),
    eq("(1)"),
    h("Appendix A Questionnaire"),
    p("Equation (1) is estimated by least squares, and Appendix A has the questionnaire."),
  ]);
  const fs = run(nodes);

  it("flags a table, section, chapter, appendix and equation that are not there", () => {
    expect(titles(fs)).toEqual(
      expect.arrayContaining([
        "Table 6.2 is referred to but does not exist",
        "Section 2.4 is referred to but does not exist",
        "Chapter 9 is referred to but does not exist",
        "Appendix C is referred to but does not exist",
        "Equation 2 is referred to but does not exist",
      ]),
    );
    const t = fs.find((f) => f.title.startsWith("Table 6.2"))!;
    expect(t).toMatchObject({ severity: "material", category: "cross_reference", action: "query", pass: "references" });
    expect(t.evidence).toEqual([{ nodeKey: "n12", quote: "Table 6.2" }]);
  });

  it("does not flag targets that exist", () => {
    for (const ok of ["Table 2.1", "Table 2.2", "Table 3.1", "Figure 2.1", "Chapter 2", "Chapter 3", "Section 2.1"])
      expect(titles(fs).some((t) => t.startsWith(`${ok} is referred`))).toBe(false);
  });
});

describe("references: things outside the manuscript are not judged", () => {
  it("ignores tables of other works, statute sections and references inside citations", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      h("1.1 Scope"),
      p("As Table 1.1 shows, costs rose."),
      cap("Table 1.1: Costs"),
      table(),
      p("Table 9 of the Annual Report gives the national figures (World Bank 2019, Table 12)."),
      p("Under section 4.2 of the Companies Act, directors owe duties. Chapter 7 of the Constitution is relevant."),
      p("Section 1.4(2) of the Act applies."),
      fn("Smith, The Law of Mining, Table 4."),
    ]);
    const fs = run(nodes);
    expect(fs.filter((f) => f.title.includes("does not exist"))).toEqual([]);
  });

  it("says nothing about equations when none are numbered", () => {
    const nodes = build([ch("Chapter 1 Introduction"), p("Equation (4) is the standard model.")]);
    expect(run(nodes)).toEqual([]);
  });
});

describe("references: numbering", () => {
  it("flags duplicates, gaps and order of tables", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("See Table 1, Table 2, Table 3 and Table 5; Figure 1 and Figure 2."),
      cap("Table 1: A"),
      table(),
      cap("Table 3: C"),
      table(),
      cap("Table 2: B"),
      table(),
      cap("Table 5: E"),
      table(),
      cap("Figure 1: X"),
      cap("Figure 2: Y"),
      p("Text between the figures."),
      cap("Figure 2: Z"),
    ]);
    const fs = run(nodes);
    expect(titles(fs)).toEqual(
      expect.arrayContaining(["Table 3 comes before Table 2", "There is no Table 4", "Figure 2 is numbered twice"]),
    );
    expect(fs.find((f) => f.title === "Figure 2 is numbered twice")!.severity).toBe("material");
    expect(fs.find((f) => f.title === "There is no Table 4")!.severity).toBe("minor");
  });

  it("reads ranges and flags a table never mentioned", () => {
    const nodes = build([
      ch("Chapter 4 Findings"),
      p("Tables 4.1–4.3 summarise the survey."),
      cap("Table 4.1: One"),
      table(),
      cap("Table 4.2: Two"),
      table(),
      cap("Table 4.3: Three"),
      table(),
      cap("Table 4.4: Four"),
      table(),
    ]);
    const fs = run(nodes);
    expect(titles(fs)).toEqual(["Table 4.4 is never referred to in the text"]);
    expect(fs[0]).toMatchObject({ action: "suggestion", severity: "minor" });
  });
});

describe("references: contents and headings", () => {
  it("flags a contents entry that matches no heading and a chapter missing from the contents", () => {
    const nodes = build([
      toc("Chapter 1 Introduction"),
      toc("Chapter 2 Research Methodology"),
      toc("2.1 Sample"),
      toc("Chapter 3 Findings"),
      ch("Chapter 1 Introduction"),
      p("Opening words."),
      ch("Chapter 2 Methodology"),
      h("2.1 Sample"),
      p("Words."),
      ch("Chapter 3 Findings"),
      p("More words."),
      ch("Chapter 4 Conclusion"),
      p("Final words."),
    ]);
    const fs = run(nodes);
    expect(titles(fs)).toEqual([
      "Contents entry ‘Chapter 2 Research Methodology’ does not match a heading",
      "‘Chapter 4 Conclusion’ is missing from the contents",
    ]);
    expect(fs[0]!.body).toContain("‘Chapter 2 Methodology’");
  });

  it("flags a heading level skip and a numbering gap", () => {
    const nodes = build([
      ch("Chapter 2 Method"),
      h("2.1 Design", 2),
      h("2.1.1 Detail", 4),
      h("2.3 Sample", 2),
      p("Words."),
    ]);
    const fs = run(nodes);
    expect(titles(fs)).toEqual(["Heading level jumps from 2 to 4", "Heading numbering skips 2.2"]);
  });

  it("does not treat per-chapter section numbers as duplicates", () => {
    const nodes = build([
      ch("Chapter 1 One"),
      h("1. Background", 2, "1"),
      h("2. Aims", 2, "2"),
      ch("Chapter 2 Two"),
      h("1. Background", 2, "1"),
      h("2. Aims", 2, "2"),
    ]);
    expect(run(nodes)).toEqual([]);
  });
});

describe("references: Word files are trusted to have all their figures and tables", () => {
  const items = [
    ch("Chapter 3 Findings"),
    p("As Figure 3.1 shows, output fell, and Table 3.2 gives the detail."),
    p("The trend continued into the next year."),
  ];

  it("flags a figure and a table referred to in a Word manuscript that has none", () => {
    const nodes = build(items);
    const fs = checkReferences({ nodes, rules: [], format: "docx" }).findings;
    expect(fs.map((f) => f.title)).toEqual([
      "Table 3.2 is referred to but does not exist",
      "Figure 3.1 is referred to but does not exist",
    ]);
    expect(fs[1]!.body).toContain("no numbered figures at all");
    expect(fs.every((f) => f.severity === "material")).toBe(true);
  });

  it("says nothing for a PDF, or when the format is not known", () => {
    const nodes = build(items);
    expect(checkReferences({ nodes, rules: [], format: "pdf" }).findings).toEqual([]);
    expect(checkReferences({ nodes, rules: [] }).findings).toEqual([]);
  });

  it("says nothing in a Word file with pictures that carry no numbered captions", () => {
    const nodes = build([...items, figure(), table()]);
    expect(checkReferences({ nodes, rules: [], format: "docx" }).findings).toEqual([]);
  });
});
