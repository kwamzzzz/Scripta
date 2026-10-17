import { describe, expect, it } from "vitest";
import {
  clampPaneSize,
  paneSizeFromDelta,
  splitPaneConstraints,
} from "./resizable-split-pane.utils";

describe("ResizableSplitPane sizing", () => {
  it("clamps a pane to its configured limits", () => {
    expect(clampPaneSize(180, 240, 600)).toBe(240);
    expect(clampPaneSize(420, 240, 600)).toBe(420);
    expect(clampPaneSize(720, 240, 600)).toBe(600);
  });

  it("widens a right pane when its divider moves left", () => {
    expect(paneSizeFromDelta(360, -48, "end")).toBe(408);
  });

  it("narrows a right pane when its divider moves right", () => {
    expect(paneSizeFromDelta(360, 48, "end")).toBe(312);
  });

  it("uses the inverse direction for a left pane", () => {
    expect(paneSizeFromDelta(280, -32, "start")).toBe(248);
    expect(paneSizeFromDelta(280, 32, "start")).toBe(312);
  });

  it("protects the primary workspace when calculating the maximum pane width", () => {
    expect(
      splitPaneConstraints({
        containerSize: 1000,
        minSize: 280,
        maxSize: 720,
        minPrimarySize: 480,
        compactAt: 700,
      }),
    ).toEqual({ compact: false, availableMax: 519 });
  });

  it("switches to compact behavior before either pane becomes unusable", () => {
    expect(
      splitPaneConstraints({
        containerSize: 760,
        minSize: 280,
        maxSize: 720,
        minPrimarySize: 480,
        compactAt: 700,
      }).compact,
    ).toBe(true);
  });
});
