/**
 * The sentence a Lead reads before staffing a matter from a team.
 *
 * The assertion this file exists for is D1: IT NEVER OVERSTATES WHAT WILL
 * HAPPEN. Staffing changes who can read a confidential file, and a Lead who is
 * told "4 people will be added" when two of them are already there has been
 * given a number they cannot act on.
 *
 * This is the only computation Phase 7 does on the client. Everything else —
 * who may staff, who may manage, who can see what — is decided by the database.
 */
import { describe, expect, it } from "vitest";
import { describeStaffing, type StaffingPreview } from "./teams";

const person = (name: string, alreadyMember = false): StaffingPreview => ({
  userId: name.toLowerCase(),
  name,
  alreadyMember,
  existingRole: alreadyMember ? "reviewer" : null,
});

describe("what staffing a matter from a team would do", () => {
  it("says so plainly when the team is empty", () => {
    expect(describeStaffing([])).toBe("This team has nobody in it yet.");
  });

  it("counts one person without pluralising", () => {
    expect(describeStaffing([person("Mawusi")])).toBe("1 person will be added.");
  });

  it("counts several", () => {
    expect(describeStaffing([person("Mawusi"), person("Podrick"), person("Kwame")])).toBe(
      "3 people will be added.",
    );
  });

  /* D1. */
  it("never counts somebody who is already on the matter as being added", () => {
    expect(
      describeStaffing([person("Mawusi"), person("Podrick", true), person("Kwame", true)]),
    ).toBe("1 person will be added · 2 are already on this matter.");
  });

  it("handles a team entirely already on the matter", () => {
    expect(describeStaffing([person("Mawusi", true)])).toBe(
      "0 people will be added · 1 is already on this matter.",
    );
  });

  /* Somebody already on the matter keeps whatever role they have — the server
     refuses to change it — so the sentence must not imply otherwise. */
  it("says nothing about changing an existing member's role", () => {
    const line = describeStaffing([person("Podrick", true)]);
    expect(line).not.toMatch(/role|editor|reviewer|change/i);
  });
});
