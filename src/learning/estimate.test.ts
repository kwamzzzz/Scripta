import { describe, expect, it } from "vitest";
import type { Block } from "./blocks";
import { describeItem, estimateBlocks, formatDuration, sittings } from "./estimate";

const para = (n: number): Block => ({ id: `p${n}`, type: "paragraph", text: "word ".repeat(n) });

describe("estimateBlocks", () => {
  it("reads at study pace and leaves time to reflect", () => {
    const e = estimateBlocks([para(1300)]);
    expect(Math.round(e.read)).toBe(600);
    expect(Math.round(e.reflect)).toBe(120);
    expect(Math.round(e.total)).toBe(720);
  });

  it("gives even a short item a minute to sit with it", () => {
    expect(estimateBlocks([para(130)]).reflect).toBe(60);
  });

  it("uses a recording's running time and counts practice separately", () => {
    const e = estimateBlocks([
      {
        id: "a",
        type: "media",
        text: "",
        media: {
          kind: "audio",
          path: "p",
          name: "a.m4a",
          mime: "audio/mp4",
          bytes: 1,
          seconds: 1611,
        },
      },
      { id: "q", type: "quiz", text: "?", options: ["a", "b"], answers: [0] },
      {
        id: "f",
        type: "flashcards",
        text: "",
        cards: [
          { front: "a", back: "b" },
          { front: "c", back: "d" },
          { front: "e", back: "f" },
        ],
      },
    ]);
    // Pausing and replaying: the running time is not the listening time.
    expect(e.listen).toBeCloseTo(1611 * 1.3);
    expect(e.practice).toBe(90 + 75);
    expect(describeItem(e)).toBe("35 min listen · 3 min practice · 7 min to reflect");
  });

  it("times a slide deck by its pages", () => {
    const e = estimateBlocks([
      {
        id: "s",
        type: "media",
        text: "",
        media: {
          kind: "pdf",
          path: "p",
          name: "d.pdf",
          mime: "application/pdf",
          bytes: 1,
          pages: 16,
        },
      },
    ]);
    expect(e.look).toBe(16 * 60);
  });
});

describe("formatDuration", () => {
  it("reads as a person would say it", () => {
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(20)).toBe("1 min");
    expect(formatDuration(59 * 60)).toBe("59 min");
    expect(formatDuration(65 * 60)).toBe("1 h 5 min");
    expect(formatDuration(120 * 60)).toBe("2 h");
  });
});

describe("sittings", () => {
  it("lets short modules share a sitting and splits a long one", () => {
    // 8 + 16 + 10 share one; 32 is one; 70 needs two.
    expect(sittings([8 * 60, 16 * 60, 10 * 60, 32 * 60, 70 * 60])).toBe(1 + 1 + 2);
    expect(sittings([])).toBe(0);
  });
});
