import { describe, expect, it } from "vitest";
import { toneStyle, type StatusTone } from "./StatusPill";
import { C, statusColors } from "@/lib/tokens";

const TONES: StatusTone[] = ["neutral", "progress", "good", "warning", "danger", "retired"];

/** Every colour the design system has agreed to, and nothing else. */
const PALETTE = new Set<string>([...Object.values(C), ...Object.values(statusColors).flat()]);

describe("toneStyle", () => {
  it("draws every tone in a colour that is already in tokens.ts", () => {
    for (const tone of TONES) {
      const { color, background } = toneStyle(tone);
      expect(PALETTE.has(color), `${tone} ink ${color}`).toBe(true);
      expect(PALETTE.has(background), `${tone} tint ${background}`).toBe(true);
    }
  });

  it("gives each tone its own ink, so two meanings never read as one", () => {
    const inks = TONES.map((tone) => toneStyle(tone).color);
    expect(new Set(inks).size).toBe(TONES.length);
  });

  it("separates a thing that has not started from one that is finished with", () => {
    expect(toneStyle("retired").color).not.toBe(toneStyle("neutral").color);
  });

  it("carries the good, warning and danger meanings on the semantic tokens", () => {
    expect(toneStyle("good").color).toBe(C.green);
    expect(toneStyle("warning").color).toBe(C.amber);
    expect(toneStyle("danger").color).toBe(C.red);
  });
});
