import { describe, expect, it } from "vitest";
import {
  expertiseIndex,
  goneQuiet,
  profileGaps,
  readSkills,
  recentMilestones,
  whoCanHelp,
} from "./network";
import type { Contact, Credential, Milestone, Position, Skill } from "./profile";

const TODAY = new Date("2026-09-21T00:00:00Z");

const contact = (patch: Partial<Contact> = {}): Contact => ({
  id: "c1",
  name: "Ama Serwaa",
  organisation: "Bentsi-Enchill",
  role: "Partner",
  location: "Accra",
  email: "",
  phone: "",
  howYouMet: "Opposite side on Bugatti",
  closeness: "known",
  expertise: ["Mining law", "Ghana regulatory"],
  callOn: "A read on the Minerals Commission",
  theyCallOn: "",
  notes: "",
  lastContactOn: "2026-06-01",
  archivedAt: null,
  ...patch,
});

describe("who can help", () => {
  const people = [
    contact({ id: "c1", name: "Ama Serwaa", expertise: ["Mining law"], closeness: "met" }),
    contact({
      id: "c2",
      name: "Kofi Mensah",
      expertise: ["Mining law", "Arbitration"],
      closeness: "close",
    }),
    contact({
      id: "c3",
      name: "Zainab Diallo",
      expertise: ["Data protection"],
      closeness: "known",
    }),
  ];

  it("finds people by what they know, however it is typed", () => {
    expect(whoCanHelp(people, "mining").map((m) => m.contact.id)).toEqual(["c2", "c1"]);
    expect(whoCanHelp(people, "Data Protection").map((m) => m.contact.id)).toEqual(["c3"]);
  });

  it("puts the people you can actually ask first", () => {
    const [first] = whoCanHelp(people, "mining law");
    expect(first!.contact.closeness).toBe("close");
    expect(first!.on).toEqual(["Mining law"]);
  });

  it("finds a half-remembered name or firm too", () => {
    const hit = whoCanHelp(people, "bentsi");
    expect(hit.length).toBe(3);
    expect(hit.every((m) => m.byName)).toBe(true);
  });

  it("returns nothing for an empty question rather than everybody", () => {
    expect(whoCanHelp(people, "   ")).toEqual([]);
  });

  it("leaves archived people out", () => {
    const gone = [contact({ id: "c9", archivedAt: "2026-01-01T00:00:00Z" })];
    expect(whoCanHelp(gone, "mining")).toEqual([]);
  });
});

describe("the register as a whole", () => {
  it("indexes every subject with who knows it, commonest first", () => {
    const index = expertiseIndex([
      contact({ id: "c1", expertise: ["Mining law"] }),
      contact({ id: "c2", expertise: ["mining law", "Arbitration"] }),
    ]);
    expect(index[0]!.subject).toBe("Mining law");
    expect(index[0]!.people).toHaveLength(2);
    expect(index[1]!.subject).toBe("Arbitration");
  });

  /* The point of the rule: it should not tell you off for having met people. */
  it("names only people worth chasing, and never those you merely met", () => {
    const quiet = goneQuiet(
      [
        contact({ id: "close", closeness: "close", lastContactOn: "2024-01-01" }),
        contact({ id: "met", closeness: "met", lastContactOn: "2020-01-01" }),
        contact({ id: "recent", closeness: "close", lastContactOn: "2026-08-01" }),
        contact({ id: "never", closeness: "close", lastContactOn: null }),
      ],
      TODAY,
    );
    expect(quiet.map((c) => c.id)).toEqual(["close"]);
  });

  it("reads milestones newest first, with the person attached", () => {
    const people = [contact({ id: "c1", name: "Ama Serwaa" })];
    const milestones: Milestone[] = [
      {
        id: "m1",
        contactId: "c1",
        kind: "promotion",
        headline: "Made partner",
        note: "",
        happenedOn: "2026-02-01",
      },
      {
        id: "m2",
        contactId: null,
        kind: "qualification",
        headline: "Admitted in Dubai",
        note: "",
        happenedOn: "2026-07-01",
      },
    ];
    const read = recentMilestones(people, milestones);
    expect(read.map((r) => r.milestone.id)).toEqual(["m2", "m1"]);
    expect(read[0]!.contact).toBeNull();
    expect(read[1]!.contact?.name).toBe("Ama Serwaa");
  });
});

describe("skills", () => {
  const positions: Position[] = [
    {
      id: "p1",
      title: "Legal Associate",
      organisation: "Sam Okudzeto & Associates",
      employment: "full_time",
      location: "",
      startedOn: "2023-12-01",
      endedOn: null,
      current: true,
      summary: "",
      skills: ["Legal research", "Dispute resolution"],
    },
  ];
  const credentials: Credential[] = [
    {
      id: "k1",
      name: "Certified Data Protection Officer",
      issuer: "Data Protection Commission",
      issuedOn: "2025-09-01",
      expiresOn: null,
      credentialId: "",
      url: "",
      skills: ["Data protection law"],
    },
  ];
  const skills: Skill[] = [
    { id: "s1", name: "Negotiation", note: "" },
    { id: "s2", name: "legal research", note: "" },
  ];

  it("says which skills have something behind them and which are asserted", () => {
    const read = readSkills(skills, positions, credentials);
    const byName = Object.fromEntries(read.map((r) => [r.name.toLowerCase(), r]));
    expect(byName["negotiation"]!.assertedOnly).toBe(true);
    expect(byName["legal research"]!.assertedOnly).toBe(false);
    expect(byName["legal research"]!.from).toEqual(["Legal Associate, Sam Okudzeto & Associates"]);
    expect(byName["data protection law"]!.from).toEqual(["Certified Data Protection Officer"]);
  });

  it("folds the same skill written two ways into one", () => {
    const read = readSkills(skills, positions, credentials);
    expect(read.filter((r) => r.name.toLowerCase() === "legal research")).toHaveLength(1);
  });
});

describe("profile gaps", () => {
  it("names what is blank in the words a person would use", () => {
    const gaps = profileGaps({
      profile: { headline: "", about: "Something about me", location: "", admissions: "" },
      positions: [],
      education: [],
      credentials: [],
    });
    expect(gaps).toContain("a headline");
    expect(gaps).not.toContain("the paragraph about you");
    expect(gaps).toContain("where you are admitted");
  });

  it("is empty once the profile is filled in", () => {
    expect(
      profileGaps({
        profile: {
          headline: "Legal Associate",
          about: "…",
          location: "Dubai",
          admissions: "Ghana, 2022",
        },
        positions: [{} as Position],
        education: [{}],
        credentials: [{}],
      }),
    ).toEqual([]);
  });
});
