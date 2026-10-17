import { describe, expect, it } from "vitest";
import { backTarget, MAX_TRAIL, pushTrail, screenOf, type Trail } from "./nav-trail";

const t = (href: string, label = href): Trail => ({ href, label });
const build = (...hrefs: string[]) => hrefs.reduce<Trail[]>((a, h) => pushTrail(a, t(h)), []);

describe("screenOf", () => {
  it("is the path, not the search", () => {
    expect(screenOf("/matters/1?screen=review")).toBe("/matters/1");
    expect(screenOf("/drafting")).toBe("/drafting");
  });
});

describe("pushTrail", () => {
  it("keeps one entry per screen when only the tab changes", () => {
    const trail = build("/playbooks", "/matters/1?screen=matter", "/matters/1?screen=review");
    expect(trail.map((x) => x.href)).toEqual(["/playbooks", "/matters/1?screen=review"]);
  });

  it("truncates back to a screen you return to, rather than looping", () => {
    const trail = build("/matters", "/matters/1", "/matters");
    expect(trail.map((x) => x.href)).toEqual(["/matters"]);
  });

  it("keeps distinct screens in the order they were visited", () => {
    const trail = build("/", "/knowledge", "/drafting");
    expect(trail.map((x) => x.href)).toEqual(["/", "/knowledge", "/drafting"]);
  });

  it("never grows past the cap, dropping the oldest", () => {
    const trail = build(...Array.from({ length: MAX_TRAIL + 4 }, (_, i) => `/s${i}`));
    expect(trail).toHaveLength(MAX_TRAIL);
    expect(trail[0]!.href).toBe("/s4");
  });
});

describe("backTarget", () => {
  const fallback = t("/", "Dashboard");

  it("leaves the screen you are on, even after moving between its tabs", () => {
    // The bug this replaces: back walked you through the tabs you had just
    // been on, so the only way out of a matter was the nav rail.
    const trail = build("/playbooks", "/matters/1?screen=matter", "/matters/1?screen=review");
    expect(backTarget(trail, "/matters/1?screen=review", fallback).href).toBe("/playbooks");
  });

  it("skips the current screen even when the trail has not caught up yet", () => {
    const trail = build("/knowledge", "/drafting");
    expect(backTarget(trail, "/drafting?precedent=abc", fallback).href).toBe("/knowledge");
  });

  it("returns to where you were, on the tab you left it on", () => {
    const trail = build("/matters/1?screen=review", "/drafting");
    expect(backTarget(trail, "/drafting", fallback).href).toBe("/matters/1?screen=review");
  });

  it("falls back when the screen was opened cold", () => {
    expect(backTarget([], "/drafting", fallback)).toEqual(fallback);
  });

  it("falls back when every entry is the screen you are on", () => {
    const trail = build("/drafting?research=a");
    expect(backTarget(trail, "/drafting", fallback)).toEqual(fallback);
  });
});

describe("a screen that lives at two paths", () => {
  const LIB = "/matters/contract-drafting";
  const NEW = "/matters/contract-drafting/new";
  const SAVED = "/matters/contract-drafting/abc";

  it("gives both halves of the wizard the same identity", () => {
    expect(screenOf(NEW)).toBe(screenOf(SAVED));
  });

  it("does not swallow the library the wizard belongs to", () => {
    expect(screenOf(LIB)).toBe(LIB);
    expect(screenOf(LIB)).not.toBe(screenOf(NEW));
  });

  it("keeps one entry when the create route becomes the saved record", () => {
    const trail = build(LIB, NEW, SAVED);
    expect(trail.map((x) => x.href)).toEqual([LIB, SAVED]);
  });

  it("sends back past the blank create route, not into it", () => {
    expect(backTarget(build(LIB, NEW, SAVED), SAVED, t("/fallback")).href).toBe(LIB);
  });

  // The shell that is leaving re-renders with the destination href before it
  // unmounts, so the destination gets written twice. Identity comes from the
  // href, so both writes collapse — whichever order they land in.
  it("survives the outgoing shell writing the destination first", () => {
    const trail = build(LIB, NEW, NEW, SAVED, SAVED);
    expect(trail.map((x) => x.href)).toEqual([LIB, SAVED]);
    expect(backTarget(trail, SAVED, t("/fallback")).href).toBe(LIB);
  });

  it("sends back to the library from a draft opened straight from it", () => {
    const trail = build(LIB, SAVED, SAVED);
    expect(backTarget(trail, SAVED, t("/fallback")).href).toBe(LIB);
  });

  it("leaves screens without a declared identity keyed on their path", () => {
    const trail = build("/matters", "/matters/new", "/matters/1");
    expect(trail.map((x) => x.href)).toEqual(["/matters", "/matters/new", "/matters/1"]);
  });
});
