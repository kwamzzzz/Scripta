import { describe, expect, it } from "vitest";
import { chaptersFrom, type Chapter, type Finding, type StoredNode } from "./db";
import { passages } from "./runner";
import { buildEditorialReport } from "./report";
import { passesFor, type ParsedNode } from "./model";

const node = (p: Partial<StoredNode> & { key: string }): StoredNode => ({
  id: p.key,
  ord: 0,
  kind: "paragraph",
  level: 0,
  number: "",
  label: "",
  text: "",
  parentKey: null,
  chapterKey: null,
  ...p,
});

describe("chaptersFrom", () => {
  it("names chapters without repeating their number and counts their words", () => {
    const nodes: ParsedNode[] = [
      node({ key: "n1", kind: "front", text: "Abstract text here" }),
      node({
        key: "n2",
        kind: "chapter",
        level: 1,
        number: "1",
        label: "1 Introduction",
        text: "1 Introduction",
        chapterKey: "n2",
      }),
      node({ key: "n3", text: "one two three", chapterKey: "n2" }),
      node({
        key: "n4",
        kind: "chapter",
        level: 1,
        number: "2",
        text: "Chapter 2: Literature Review",
        chapterKey: "n4",
      }),
      node({ key: "n5", text: "four five", chapterKey: "n4" }),
      node({ key: "n6", kind: "chapter", level: 1, text: "References", chapterKey: "n6" }),
    ];
    expect(chaptersFrom(nodes)).toEqual([
      { chapterKey: "n2", ord: 0, number: "1", title: "Introduction", wordCount: 3 },
      { chapterKey: "n4", ord: 1, number: "2", title: "Literature Review", wordCount: 2 },
      { chapterKey: "n6", ord: 2, number: "", title: "References", wordCount: 0 },
    ]);
  });
});

describe("passages", () => {
  it("never crosses a chapter, skips what is not prose, and keeps to the target", () => {
    const long = Array.from({ length: 900 }, () => "word").join(" ");
    const nodes = [
      node({ key: "a", kind: "chapter", text: "One", chapterKey: "a" }),
      node({ key: "b", text: long, chapterKey: "a" }),
      node({ key: "c", text: long, chapterKey: "a" }),
      node({ key: "t", kind: "table", text: "x | y", chapterKey: "a" }),
      node({ key: "d", kind: "chapter", text: "Two", chapterKey: "d" }),
      node({ key: "e", text: "short", chapterKey: "d" }),
      node({ key: "z", kind: "bibliography_entry", text: "Smith 2019", chapterKey: "d" }),
    ];
    const all = passages(nodes, new Set(["a", "d"]));
    expect(all.map((run) => run.map((n) => n.key))).toEqual([["a", "b"], ["c"], ["d", "e"]]);
    expect(passages(nodes, new Set(["d"])).map((run) => run.map((n) => n.key))).toEqual([
      ["d", "e"],
    ]);
  });
});

describe("scopes", () => {
  it("proofreading only runs the language passes; a consistency review does not proofread", () => {
    expect(passesFor("proofreading")).toEqual(["style", "mechanics"]);
    expect(passesFor("consistency")).not.toContain("mechanics");
    expect(passesFor("chapters")).toContain("consistency");
  });
});

describe("buildEditorialReport", () => {
  const chapter = (key: string, number: string, title: string): Chapter => ({
    id: key,
    chapterKey: key,
    ord: Number(number),
    number,
    title,
    wordCount: 0,
    state: "reviewed",
    summary: null,
    summarisedAt: null,
    assessment: null,
    reviewedAt: null,
  });
  const finding = (p: Partial<Finding> & { ref: number }): Finding => ({
    id: String(p.ref),
    versionId: "v",
    pass: "mechanics",
    category: "error",
    severity: "minor",
    action: "correction",
    title: "T",
    body: "",
    original: null,
    replacement: null,
    evidence: [],
    chapterKeys: [],
    fingerprint: String(p.ref),
    source: "rule",
    ruleId: null,
    status: "open",
    decisionNote: "",
    decidedAt: null,
    carriedFrom: null,
    verification: null,
    createdAt: "",
    ...p,
  });
  it("puts author queries first, then findings by chapter, and leaves out what is decided", () => {
    const nodes = new Map([
      ["p1", node({ key: "p1", chapterKey: "c1", text: "The results demonstrates" })],
    ]);
    const report = buildEditorialReport({
      title: "Thesis",
      versionNo: 2,
      nodes,
      chapters: [chapter("c1", "1", "Introduction"), chapter("c2", "2", "Method")],
      findings: [
        finding({
          ref: 1,
          chapterKeys: ["c1"],
          title: "Agreement",
          original: "results demonstrates",
          replacement: "results demonstrate",
          evidence: [{ nodeKey: "p1" }],
        }),
        finding({
          ref: 2,
          action: "query",
          category: "consistency",
          title: "Which year?",
          chapterKeys: ["c1", "c2"],
        }),
        finding({ ref: 3, chapterKeys: ["c2"], status: "dismissed", title: "Gone" }),
      ],
    });
    expect(report.clauses.map((c) => c.title)).toEqual(["Author queries", "1 Introduction"]);
    const body = report.clauses[1]!.segs[0]!.t;
    expect(body).toContain("“results demonstrates” should read “results demonstrate”.");
    expect(body).toContain("Where: 1 Introduction");
    expect(report.subtitle).toContain("2 open or accepted findings");
  });
});
