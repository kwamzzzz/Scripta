import { describe, expect, it } from "vitest";
import type { Clause } from "@/data/legal";
import { buildClauseTree } from "./contract-editor-tree";

const clause = (id: string, num: string): Clause => ({
  id,
  num,
  title: `Clause ${num}`,
  change: "Baseline",
  risk: "Low",
  status: "Open",
  diff: "",
  analysis: "",
  pb: null,
  page: "1",
  segs: [{ t: `Text ${num}`, k: "n" }],
});

describe("buildClauseTree", () => {
  it("nests clauses under the closest real ancestor and preserves source ids", () => {
    const tree = buildClauseTree([
      clause("root", "3"),
      clause("child", "3.5"),
      clause("grandchild", "3.5.1"),
      clause("sibling", "4"),
    ]);

    expect(tree.map((node) => node.id)).toEqual(["root", "sibling"]);
    expect(tree[0]?.children[0]?.id).toBe("child");
    expect(tree[0]?.children[0]?.children[0]?.id).toBe("grandchild");
  });

  it("keeps an orphaned dotted clause at the root", () => {
    expect(buildClauseTree([clause("orphan", "9.2")])[0]?.id).toBe("orphan");
  });
});
