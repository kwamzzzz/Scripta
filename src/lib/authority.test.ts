import { describe, expect, it } from "vitest";
import { authorityLabel, authoritySupport, authorityWeight } from "./authority";

describe("authorityWeight", () => {
  it("treats statutes, decisions and regulations as primary", () => {
    expect(authorityWeight("STATUTE")).toBe("primary");
    expect(authorityWeight("COURT DECISION")).toBe("primary");
    expect(authorityWeight("REGULATION")).toBe("primary");
  });

  it("is case and whitespace insensitive, because the model writes this field freely", () => {
    expect(authorityWeight("  court decision ")).toBe("primary");
    expect(authorityWeight("secondary")).toBe("secondary");
  });

  it("treats anything it does not recognise as unverified, never as primary", () => {
    expect(authorityWeight("UNVERIFIED")).toBe("unverified");
    expect(authorityWeight("TREATISE")).toBe("unverified");
    expect(authorityWeight("")).toBe("unverified");
    expect(authorityWeight(null)).toBe("unverified");
    expect(authorityWeight(undefined)).toBe("unverified");
  });
});

describe("authorityLabel", () => {
  it("keeps a primary authority's own kind", () => {
    expect(authorityLabel("STATUTE")).toBe("STATUTE");
  });

  it("says UNVERIFIED first when the kind is unrecognised, and keeps what was claimed", () => {
    expect(authorityLabel("TREATISE")).toBe("UNVERIFIED · TREATISE");
    expect(authorityLabel("UNVERIFIED")).toBe("UNVERIFIED");
    expect(authorityLabel("")).toBe("UNVERIFIED");
  });
});

describe("authoritySupport", () => {
  it("says nothing when every authority is primary", () => {
    const s = authoritySupport([{ kind: "STATUTE" }, { kind: "COURT DECISION" }]);
    expect(s.ok).toBe(true);
    expect(s.warning).toBeNull();
    expect(s.primary).toBe(2);
  });

  it("says nothing when there are no authorities at all", () => {
    // An answer that cites nothing is a separate problem, and not this
    // function's to announce — it must not invent a warning about an empty set.
    expect(authoritySupport([]).warning).toBeNull();
  });

  it("leads with unverified citations even when primary authority is present", () => {
    const s = authoritySupport([{ kind: "STATUTE" }, { kind: "UNVERIFIED" }]);
    expect(s.ok).toBe(false);
    expect(s.warning).toContain("1 citation is unverified");
  });

  it("counts more than one unverified citation in the plural", () => {
    const s = authoritySupport([{ kind: "UNVERIFIED" }, { kind: "TREATISE" }]);
    expect(s.warning).toContain("2 citations are unverified");
    expect(s.warning).toContain("they exist");
  });

  it("warns when an answer rests on secondary sources alone", () => {
    const s = authoritySupport([{ kind: "SECONDARY" }, { kind: "SECONDARY" }]);
    expect(s.ok).toBe(false);
    expect(s.warning).toContain("No primary authority");
  });

  it("does not warn about secondary sources that sit beside primary authority", () => {
    expect(authoritySupport([{ kind: "STATUTE" }, { kind: "SECONDARY" }]).warning).toBeNull();
  });
});
