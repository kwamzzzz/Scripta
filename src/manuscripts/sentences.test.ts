import { describe, expect, it } from "vitest";
import { parseSentenceKey, sentenceOf, splitSentences } from "./sentences";

const texts = (t: string) => splitSentences(t).map((s) => s.text);

describe("splitSentences", () => {
  it("splits ordinary prose and keeps offsets exact", () => {
    const t = "Fieldwork began in March. It ended in June! Was it long enough? Perhaps.";
    const s = splitSentences(t);
    expect(s.map((x) => x.text)).toEqual([
      "Fieldwork began in March.",
      "It ended in June!",
      "Was it long enough?",
      "Perhaps.",
    ]);
    for (const x of s) expect(t.slice(x.start, x.end)).toBe(x.text);
    expect(s.map((x) => x.n)).toEqual([1, 2, 3, 4]);
  });

  it("does not break after abbreviations, initials or inside numbers", () => {
    expect(
      texts(
        "As Hilson et al. argue, licences matter, e.g. in Ghana. See p. 12 and Fig. 3 for details. S. M. Banchirigah wrote in 2008. Growth was 3.5 per cent in section 4.2 of the report.",
      ),
    ).toEqual([
      "As Hilson et al. argue, licences matter, e.g. in Ghana.",
      "See p. 12 and Fig. 3 for details.",
      "S. M. Banchirigah wrote in 2008.",
      "Growth was 3.5 per cent in section 4.2 of the report.",
    ]);
  });

  it("keeps closing quotes and brackets with their sentence, and a citation after the stop", () => {
    expect(
      texts(
        'He called it "a turning point." Later work disagreed (Smith 2019). (This was contested.) Next.',
      ),
    ).toEqual([
      'He called it "a turning point."',
      "Later work disagreed (Smith 2019).",
      "(This was contested.)",
      "Next.",
    ]);
    expect(texts("The rate rose sharply. (Hilson 2016) Nobody disputes it.")).toEqual([
      "The rate rose sharply. (Hilson 2016) Nobody disputes it.",
    ]);
  });

  it("does not split before a lowercase continuation or inside a URL", () => {
    expect(texts("The data (see www.example.org) were clear. and so on.")).toEqual([
      "The data (see www.example.org) were clear. and so on.",
    ]);
  });

  it("returns one sentence for text with no terminal punctuation, and none for blanks", () => {
    expect(texts("2.1 Formalisation")).toEqual(["2.1 Formalisation"]);
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("sentence keys", () => {
  it("reads a sentence key and a plain paragraph key", () => {
    expect(parseSentenceKey("n29.2")).toEqual({ nodeKey: "n29", sentence: 2 });
    expect(parseSentenceKey("n29")).toEqual({ nodeKey: "n29" });
  });
  it("finds the sentence containing a quote", () => {
    const t = "The the delays grew. A important step followed.";
    expect(sentenceOf(t, "A important")).toBe(2);
    expect(sentenceOf(t, "not there")).toBeUndefined();
  });
});
