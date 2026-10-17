import { describe, expect, it } from "vitest";
import { assess, readRole, type Criterion, type Evidence, type Claim } from "./model";
import {
  areaAdvice,
  areaMix,
  movementSummary,
  readiness,
  trajectory,
  whatWouldMove,
} from "./score";

const TODAY = new Date("2026-09-21T00:00:00Z");

const criterion = (patch: Partial<Criterion> = {}): Criterion => ({
  id: "c1",
  roleId: "r1",
  kind: "competency",
  section: "",
  text: "Draft share purchase agreements",
  note: "",
  essential: true,
  sortOrder: 0,
  ...patch,
});

const evidence = (patch: Partial<Evidence> = {}): Evidence => ({
  id: "e1",
  title: "Project Bugatti SPA",
  kind: "work",
  statement: "",
  outcome: "",
  level: "performed",
  repetition: "once",
  complexity: "standard",
  area: "Corporate",
  happenedOn: "2026-06-01",
  throughTo: null,
  corroboratedBy: "",
  fileRef: null,
  fileName: null,
  links: [],
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
  archivedAt: null,
  ...patch,
});

const linked = (patch: Partial<Evidence> = {}) =>
  evidence({ links: [{ id: "l1", kind: "matter", refId: "m1", label: "Bugatti" }], ...patch });

/** Read a set of criteria the way the portal does. */
const read = (criteria: Criterion[], claimed: Map<string, Evidence[]>) =>
  criteria.map((c) => assess(c, claimed.get(c.id) ?? [], TODAY));

describe("readiness", () => {
  it("is zero with nothing recorded, and says why rather than showing a bare nought", () => {
    const criteria = [criterion({ id: "c1" }), criterion({ id: "c2" })];
    const claimed = new Map<string, Evidence[]>();
    const r = readiness(criteria, read(criteria, claimed), claimed, TODAY);
    expect(r.score).toBe(0);
    expect(r.summary).toMatch(/0 of 2/);
    expect(r.components.map((c) => c.key)).toEqual(["breadth", "depth", "currency", "proof"]);
  });

  it("cannot be moved by an unsupported claim", () => {
    const criteria = [criterion()];
    const bare = new Map([["c1", [evidence({ level: "led", repetition: "routine" })]]]);
    const r = readiness(criteria, read(criteria, bare), bare, TODAY);
    expect(r.score).toBeLessThan(30);
    expect(r.components.find((c) => c.key === "breadth")!.value).toBe(0);
    expect(r.components.find((c) => c.key === "proof")!.value).toBe(0);
  });

  it("reaches full marks only on corroborated, repeated, current work", () => {
    const criteria = [criterion()];
    const best = new Map([
      ["c1", [linked({ level: "led", repetition: "routine", happenedOn: "2026-08-01" })]],
    ]);
    const r = readiness(criteria, read(criteria, best), best, TODAY);
    expect(r.score).toBe(100);
  });

  /* The honesty of the number: old work and unvouched work cost something. */
  it("marks down evidence that is years old even when the requirement is carried", () => {
    const criteria = [criterion()];
    const old = new Map([
      ["c1", [linked({ level: "led", repetition: "routine", happenedOn: "2018-01-01" })]],
    ]);
    const r = readiness(criteria, read(criteria, old), old, TODAY);
    expect(r.components.find((c) => c.key === "currency")!.value).toBe(20);
    expect(r.score).toBeLessThan(90);
  });

  it("ignores desirable requirements on both sides of the ledger", () => {
    const criteria = [
      criterion({ id: "c1" }),
      criterion({ id: "c2", essential: false, text: "Nice to have" }),
    ];
    const claimed = new Map([["c1", [linked({ level: "independent", repetition: "several" })]]]);
    const r = readiness(criteria, read(criteria, claimed), claimed, TODAY);
    expect(r.score).toBe(100);
    expect(r.components[0]!.detail).toMatch(/1 of 1/);
  });

  it("weights breadth and depth above currency and proof", () => {
    const criteria = [criterion({ id: "c1" }), criterion({ id: "c2" })];
    const half = new Map([["c1", [linked({ level: "independent", repetition: "several" })]]]);
    const r = readiness(criteria, read(criteria, half), half, TODAY);
    // One of two carried, perfectly: breadth 50, depth 50, currency 100, proof 100.
    expect(r.score).toBe(Math.round(50 * 0.35 + 50 * 0.35 + 100 * 0.15 + 100 * 0.15));
  });
});

describe("trajectory", () => {
  const criteria = [criterion({ id: "c1" }), criterion({ id: "c2", text: "Due diligence" })];
  const evidenceList = [
    linked({
      id: "e1",
      level: "independent",
      repetition: "several",
      createdAt: "2026-03-05T00:00:00Z",
    }),
    linked({ id: "e2", level: "performed", createdAt: "2026-08-02T00:00:00Z" }),
  ];
  const claims: Claim[] = [
    { id: "x1", criterionId: "c1", evidenceId: "e1", note: "", createdAt: "2026-03-05T00:00:00Z" },
    { id: "x2", criterionId: "c2", evidenceId: "e2", note: "", createdAt: "2026-08-02T00:00:00Z" },
  ];

  it("replays the score month by month from the dates on the claims", () => {
    const points = trajectory(criteria, claims, evidenceList, read, 12, TODAY);
    expect(points).toHaveLength(12);
    expect(points[0]!.score).toBe(0); // a year ago, nothing claimed
    expect(points.at(-1)!.carried).toBe(2); // both carried by now
    const march = points.find((p) => p.month === "2026-03")!;
    const february = points.find((p) => p.month === "2026-02")!;
    expect(february.carried).toBe(0);
    expect(march.carried).toBe(1);
  });

  it("never counts a claim before it was made", () => {
    const points = trajectory(criteria, claims, evidenceList, read, 12, TODAY);
    const july = points.find((p) => p.month === "2026-07")!;
    expect(july.carried).toBe(1);
  });

  it("says what the movement was, in a sentence", () => {
    const points = trajectory(criteria, claims, evidenceList, read, 12, TODAY);
    expect(movementSummary(points)).toMatch(/2 more requirements carried/);
    expect(movementSummary(points)).toMatch(/readiness up/);
  });

  it("says plainly when nothing has moved", () => {
    const flat = trajectory(criteria, [], [], read, 12, TODAY);
    expect(movementSummary(flat)).toMatch(/Nothing has moved/);
  });
});

describe("what would move you most", () => {
  const criteria = [
    criterion({ id: "c1", text: "Draft SPAs" }),
    criterion({ id: "c2", text: "Lead due diligence" }),
    criterion({ id: "c3", text: "Nice to have", essential: false }),
  ];
  const claimed = new Map([["c1", [linked({ level: "independent", repetition: "several" })]]]);

  it("prices every unfinished requirement by what carrying it is worth", () => {
    const levers = whatWouldMove(criteria, read(criteria, claimed), claimed, TODAY);
    const gap = levers.find((l) => l.criterion.id === "c2")!;
    expect(gap.gain).toBeGreaterThan(0);
    expect(gap.to).toBe("evidenced");
  });

  it("puts the essential gap above the desirable one", () => {
    const levers = whatWouldMove(criteria, read(criteria, claimed), claimed, TODAY);
    expect(levers[0]!.criterion.id).toBe("c2");
  });

  it("prices a desirable requirement at nothing, because the score ignores it", () => {
    const levers = whatWouldMove(criteria, read(criteria, claimed), claimed, TODAY);
    expect(levers.find((l) => l.criterion.id === "c3")!.gain).toBe(0);
  });

  /* Carrying a requirement from nothing lifts depth further than carrying one
     that was already part-way, so these are not equal and the ranking says so. */
  it("prices a requirement with nothing against it above one part-way there", () => {
    const two = [
      criterion({ id: "c1", text: "Nothing here" }),
      criterion({ id: "c2", text: "Part way there" }),
    ];
    const partial = new Map([["c2", [linked({ level: "assisted" })]]]);
    const levers = whatWouldMove(two, read(two, partial), partial, TODAY);
    expect(levers[0]!.criterion.id).toBe("c1");
    expect(levers[0]!.gain).toBeGreaterThan(levers[1]!.gain);
  });

  it("reads a tied list in the framework's own order, not alphabetically", () => {
    const framework = [
      criterion({ id: "z", text: "Zebra competence", sortOrder: 0 }),
      criterion({ id: "a", text: "Aardvark competence", sortOrder: 1 }),
    ];
    const levers = whatWouldMove(framework, read(framework, new Map()), new Map(), TODAY);
    expect(levers[0]!.gain).toBe(levers[1]!.gain);
    expect(levers.map((l) => l.criterion.id)).toEqual(["z", "a"]);
  });

  it("leaves out what is already as far as it goes", () => {
    const levers = whatWouldMove(criteria, read(criteria, claimed), claimed, TODAY);
    expect(levers.map((l) => l.criterion.id)).not.toContain("c1");
  });
});

describe("where the experience sits", () => {
  const portfolio = [
    evidence({ id: "e1", area: "Disputes", level: "led" }),
    evidence({ id: "e2", area: "disputes", level: "assisted" }),
    evidence({ id: "e3", area: "Corporate", level: "performed" }),
    evidence({ id: "e4", area: "", level: "performed" }),
  ];

  it("groups by area however it was capitalised, commonest first", () => {
    const mix = areaMix(portfolio);
    expect(mix[0]!.area).toBe("Disputes");
    expect(mix[0]!.count).toBe(2);
    expect(mix[0]!.best).toBe("led");
    expect(mix.map((m) => m.area)).toContain("Not said");
  });

  it("calls out a specialism when the weight is plainly in one place", () => {
    const one = [
      evidence({ id: "a", area: "Disputes" }),
      evidence({ id: "b", area: "Disputes" }),
      evidence({ id: "c", area: "Disputes" }),
      evidence({ id: "d", area: "Corporate" }),
    ];
    expect(areaAdvice(areaMix(one))).toMatch(/specialism/);
  });

  it("asks for areas first when most evidence has none", () => {
    const untagged = [evidence({ id: "a", area: "" }), evidence({ id: "b", area: "" })];
    expect(areaAdvice(areaMix(untagged))).toMatch(/no practice area/i);
  });

  it("says nothing at all about an empty portfolio", () => {
    expect(areaAdvice(areaMix([]))).toBe("");
  });
});

describe("the whole reading holds together", () => {
  it("agrees with the role reading about what is carried", () => {
    const criteria = [criterion({ id: "c1" }), criterion({ id: "c2", text: "Second" })];
    const claimed = new Map([["c1", [linked({ level: "performed" })]]]);
    const reading = readRole(criteria, claimed, TODAY);
    const r = readiness(criteria, reading.assessments, claimed, TODAY);
    expect(r.components[0]!.detail).toBe(
      `${reading.essentialCarried} of ${reading.essentialTotal} essential requirements carried`,
    );
  });
});
