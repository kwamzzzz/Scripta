import { describe, expect, it } from "vitest";
import { checkCitations, findCitations } from "./citations";
import { corpusOf } from "./corpus";
import { assertOriginals, bib, build, ch, fn, h, p, rule } from "./test-helpers";

const BIB = [
  h("References", 1),
  bib("Brown, A. (2020). Mining and the State. London: Routledge."),
  bib("Müller, K. and Osei, P. (2018). Artisanal Gold in West Africa. Journal of Mining 4(2), 1–20."),
  bib("Smith, J. (2019a). Regulating Gold. Oxford: OUP."),
  bib("Smith, J. (2019b). Gold and Law. Accra: Sub-Saharan Publishers."),
  bib("Tetteh, R., Mensah, E. and Owusu, F. (2021). Licensing Reform. Accra: GIMPA Press."),
  bib("van der Berg, H. (2017). Small-Scale Mining. Pretoria: UNISA Press."),
  bib("World Bank (2022). Ghana Economic Update. Washington, DC: World Bank."),
];

const run = (nodes: ReturnType<typeof build>, rules = [] as ReturnType<typeof rule>[]) => {
  const r = checkCitations({ nodes, rules });
  expect(assertOriginals(r.findings, nodes)).toEqual([]);
  return r;
};

describe("citations: parsing", () => {
  it("reads author–date forms with et al., suffixes, particles, pages and corporate authors", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p(
        "Licensing is contested (Tetteh et al. 2021; Brown, 2020, p. 4). Smith (2019a) and Müller and Osei (2018) agree, as does van der Berg (2017: 12). See also (World Bank 2022).",
      ),
    ]);
    const cites = findCitations(corpusOf(nodes).prose);
    expect(cites.map((c) => [c.first, c.years.join(",")])).toEqual([
      ["Tetteh", "2021"],
      ["Brown", "2020"],
      ["World Bank", "2022"],
      ["Smith", "2019a"],
      ["Müller", "2018"],
      ["van der Berg", "2017"],
    ]);
    expect(cites.find((c) => c.first === "Brown")!.comma).toBe(true);
  });

  it("does not read statutes, months or plain dates as citations", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("The Minerals and Mining Act (2006) and the Companies Act 2019 apply (January 2020). In 2019 (a busy year) prices rose."),
    ]);
    expect(findCitations(corpusOf(nodes).prose)).toEqual([]);
  });
});

describe("citations: against the bibliography", () => {
  const nodes = build([
    ch("Chapter 1 Introduction"),
    p("Gold matters (Brown 2020). Licensing is contested (Tetteh et al. 2021). Smith (2019a) disagrees."),
    p("Recent work (Muller & Osei 2018; Smith 2019b; van der Berg 2017) and the (World Bank 2022) agree."),
    p("A new view (Adjei 2016) and a later one (Adjei 2016, p. 9) are not listed. Brown (2018) is another."),
    p("Tetteh et al. (2021) note the same, and Smyth (2019b) is misspelled."),
  ]);
  const { findings } = run([...nodes, ...build(BIB, "b")]);
  const titles = findings.map((f) => f.title);

  it("flags a citation with no entry, once for all its occurrences, as material", () => {
    const f = findings.find((x) => x.title === "‘Adjei 2016’ is cited but not in the bibliography")!;
    expect(f).toMatchObject({ severity: "material", action: "query", category: "citation", pass: "citations" });
    expect(f.evidence.map((e) => e.quote)).toEqual(["Adjei 2016", "Adjei 2016, p. 9"]);
    expect(f.body).toContain("add the entry or correct the citation");
  });

  it("tolerates diacritics, et al., particles and year suffixes", () => {
    expect(titles.filter((t) => /Muller|Tetteh|Berg|World Bank|^‘Smith 2019/.test(t))).toEqual([]);
  });

  it("asks about a year the bibliography does not have for that author", () => {
    const f = findings.find((x) => x.title.startsWith("‘Brown 2018’"))!;
    expect(f.severity).toBe("minor");
    expect(f.body).toContain("2020");
  });

  it("asks about a near-miss spelling", () => {
    expect(titles).toContain("‘Smyth 2019b’ may be ‘Smith 2019b’");
  });

  it("does not report entries that are cited", () => {
    expect(titles.some((t) => t.startsWith("Bibliography entry never cited"))).toBe(false);
  });
});

describe("citations: uncited entries, format drift and rules", () => {
  const text = [
    ch("Chapter 1 Introduction"),
    p("Gold matters (Brown 2020). Licensing is contested (Tetteh et al. 2021)."),
    p("Others agree (Smith 2019a). The state intervenes (van der Berg 2017)."),
    p("Reform is slow (Brown, 2020). Donors help (World Bank, 2022)."),
    p("Artisanal gold (Müller and Osei 2018) is growing."),
  ];

  it("flags an entry never cited", () => {
    const { findings } = run(build([...text, ...BIB]));
    const f = findings.filter((x) => x.title.startsWith("Bibliography entry never cited"));
    expect(f).toHaveLength(1);
    expect(f[0]!.evidence[0]!.quote).toContain("Smith, J. (2019b)");
  });

  it("queries mixed comma forms and detects the majority", () => {
    const { findings, detectedRules } = run(build([...text, ...BIB]));
    expect(findings.map((f) => f.title)).toContain("Citations mix ‘(Smith, 2019)’ and ‘(Smith 2019)’");
    expect(detectedRules).toContainEqual(
      expect.objectContaining({ category: "citation", preferred: "(Smith 2019)", variants: ["(Smith, 2019)"] }),
    );
  });

  it("with an active rule, corrects the off-rule forms instead of asking", () => {
    const nodes = build([...text, ...BIB]);
    const { findings } = run(nodes, [rule("citation", "(Smith 2019)")]);
    expect(findings.some((f) => f.title.startsWith("Citations mix"))).toBe(false);
    const fixes = findings.filter((f) => f.action === "correction");
    expect(fixes.map((f) => [f.original, f.replacement])).toEqual([
      ["Brown, 2020", "Brown 2020"],
      ["World Bank, 2022", "World Bank 2022"],
    ]);
  });
});

describe("citations: numbered and note styles", () => {
  it("flags a numbered citation past the end of the list", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("Gold matters [1]. Licensing is contested [2, 3]. Others agree [1–3] and [9]."),
      h("References", 1),
      bib("[1] Brown, A. Mining and the State. 2020."),
      bib("[2] Smith, J. Regulating Gold. 2019."),
      bib("[3] Tetteh, R. Licensing Reform. 2021."),
    ]);
    const { findings, detectedRules } = run(nodes);
    expect(findings.map((f) => f.title)).toEqual(["Reference [9] is cited but the list has no entry 9"]);
    expect(findings[0]!.severity).toBe("material");
    expect(detectedRules[0]).toMatchObject({ category: "citation", preferred: "[12]" });
  });

  it("queries Ibid. across a chapter break and with nothing before it", () => {
    const nodes = build([
      ch("Chapter 1 Introduction"),
      p("Opening."),
      fn("Ibid., 4."),
      fn("Brown, Mining and the State, 12."),
      fn("Ibid., 13."),
      ch("Chapter 2 Method"),
      p("Next."),
      fn("Ibid., 14."),
      fn("Smith, Regulating Gold, 3."),
      fn("Tetteh, Licensing Reform, 9."),
    ]);
    const { findings } = run(nodes);
    expect(findings.map((f) => f.title)).toEqual([
      "‘Ibid.’ has no earlier note to refer to",
      "‘Ibid.’ refers back across a chapter break",
    ]);
  });
});
