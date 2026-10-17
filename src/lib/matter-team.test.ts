import { describe, expect, it } from "vitest";
import { ASSIGNABLE_ROLES, displayName, initialsOf, provenanceOf, ROLE_LABEL } from "./matter-team";

const member = (over: Partial<Parameters<typeof provenanceOf>[0]> = {}) => ({
  userId: "u1",
  role: "editor" as const,
  name: "Samuel Kobby Amoah",
  email: "s.amoah@nexis.africa",
  addedAt: "2026-08-14T09:00:00.000Z",
  addedByName: "Mawusi",
  isCreator: false,
  ...over,
});

describe("initials", () => {
  it("takes the first and last of a full name", () => {
    expect(initialsOf("Mawusi Kwame Adusu")).toBe("MA");
    expect(initialsOf("Samuel Kobby Amoah")).toBe("SA");
  });

  it("takes two letters from a single name", () => {
    expect(initialsOf("Mawusi")).toBe("MA");
  });

  /* A person who has never set a name should not become a blank circle. */
  it("falls back to the address rather than to nothing", () => {
    expect(initialsOf("", "podrickrobogo@gmail.com")).toBe("PO");
    expect(initialsOf("   ", "a@b.com")).toBe("A");
  });

  it("never returns an empty string", () => {
    expect(initialsOf("", "")).toBe("?");
  });
});

describe("the name to print", () => {
  it("prefers the name, falls back to the address, then says so", () => {
    expect(displayName({ name: "Mawusi", email: "m@x.com" })).toBe("Mawusi");
    expect(displayName({ name: "   ", email: "m@x.com" })).toBe("m@x.com");
    expect(displayName({ name: null, email: null })).toBe("Unknown");
  });
});

describe("the provenance line", () => {
  /* The line exists so nobody has to open an audit trail to answer "why is he
     on this?". It has to distinguish the two ways a person comes to be here. */
  it("says the matter was created, for the person who created it", () => {
    expect(provenanceOf(member({ isCreator: true }))).toMatch(/^Created the matter · /);
  });

  it("names whoever brought them on, for everybody else", () => {
    expect(provenanceOf(member())).toBe("Added by Mawusi · 14 August");
  });

  it("does not invent an adder it was never given", () => {
    expect(provenanceOf(member({ addedByName: null }))).toBe("Added by a colleague · 14 August");
  });

  it("drops the date rather than printing a broken one", () => {
    expect(provenanceOf(member({ addedAt: "not a date" }))).toBe("Added by Mawusi");
  });
});

describe("the roles on offer", () => {
  /* Lead is reached by handing the matter on, never by picking it from a list:
     a matter has exactly one, and the database will not let go of it. */
  it("never offers Lead as something to assign", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("lead");
    expect(ASSIGNABLE_ROLES).toEqual(["editor", "reviewer", "viewer"]);
  });

  it("has a word for every role, Lead included", () => {
    for (const role of ["lead", "editor", "reviewer", "viewer"] as const)
      expect(ROLE_LABEL[role]).toBeTruthy();
  });
});
