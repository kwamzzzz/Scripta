import { describe, expect, it } from "vitest";
import {
  assess,
  corroborationOf,
  evidenceReach,
  nextExperience,
  readRole,
  recencyOf,
  roleSummary,
  type Criterion,
  type Evidence,
} from "./model";

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

/** Evidence that points at real work in Scripta. */
const linked = (patch: Partial<Evidence> = {}) =>
  evidence({
    links: [{ id: "l1", kind: "matter", refId: "m1", label: "Project Bugatti" }],
    ...patch,
  });

describe("corroboration", () => {
  it("treats a bare statement as a claim", () => {
    expect(corroborationOf(evidence())).toBe("claimed");
  });

  it("accepts linked work, an attached file or a named person", () => {
    expect(corroborationOf(linked())).toBe("supported");
    expect(corroborationOf(evidence({ fileRef: "ws/matter/deed.pdf" }))).toBe("supported");
    expect(corroborationOf(evidence({ corroboratedBy: "Dominik Kleemann" }))).toBe("supported");
  });
});

describe("recency", () => {
  it("reads from the end of the work where it ran on", () => {
    expect(recencyOf(evidence({ happenedOn: "2022-01-01", throughTo: "2026-05-01" }), TODAY)).toBe(
      "current",
    );
  });

  it("separates current, recent and historic", () => {
    expect(recencyOf(evidence({ happenedOn: "2026-06-01" }), TODAY)).toBe("current");
    expect(recencyOf(evidence({ happenedOn: "2023-06-01" }), TODAY)).toBe("recent");
    expect(recencyOf(evidence({ happenedOn: "2019-01-01" }), TODAY)).toBe("historic");
    expect(recencyOf(evidence({ happenedOn: null }), TODAY)).toBe("undated");
  });
});

describe("assessment", () => {
  it("says nothing is evidenced when nothing is claimed", () => {
    const a = assess(criterion(), [], TODAY);
    expect(a.status).toBe("none");
    expect(a.gap).toMatch(/No evidence/i);
    expect(a.supporting).toEqual([]);
  });

  /* The heart of the brief: saying you can do it is not doing it. */
  it("never reaches Evidenced on an unsupported claim alone", () => {
    const a = assess(criterion(), [evidence({ level: "led", repetition: "routine" })], TODAY);
    expect(a.status).toBe("developing");
    expect(a.supporting).toEqual([]);
    expect(a.discounted).toHaveLength(1);
    expect(a.gap).toMatch(/your own account/i);
  });

  it("reads a claim of mere exposure as not evidenced", () => {
    const a = assess(criterion(), [evidence({ level: "exposure" })], TODAY);
    expect(a.status).toBe("none");
  });

  it("calls corroborated assisting Developing, not Evidenced", () => {
    const a = assess(criterion(), [linked({ level: "assisted" })], TODAY);
    expect(a.status).toBe("developing");
    expect(a.gap).toMatch(/doing it yourself/i);
  });

  it("calls one corroborated performance Evidenced", () => {
    const a = assess(criterion(), [linked({ level: "performed" })], TODAY);
    expect(a.status).toBe("evidenced");
    expect(a.supporting).toEqual(["e1"]);
    expect(a.because.join(" ")).toMatch(/corroborated/i);
  });

  it("needs repetition as well as independence to be Strongly evidenced", () => {
    const once = assess(criterion(), [linked({ level: "independent" })], TODAY);
    expect(once.status).toBe("evidenced");
    expect(once.gap).toMatch(/second|again|capability/i);

    const repeated = assess(
      criterion(),
      [linked({ level: "independent", repetition: "several" })],
      TODAY,
    );
    expect(repeated.status).toBe("strong");
    expect(repeated.gap).toBe("");
  });

  it("accepts two separate corroborated performances as repetition", () => {
    const a = assess(
      criterion(),
      [
        linked({ id: "e1", level: "led" }),
        linked({ id: "e2", level: "independent", title: "Second SPA" }),
      ],
      TODAY,
    );
    expect(a.status).toBe("strong");
    expect(a.supporting[0]).toBe("e1");
  });

  it("holds old work short of strong however senior it was", () => {
    const a = assess(
      criterion(),
      [linked({ level: "led", repetition: "routine", happenedOn: "2018-01-01" })],
      TODAY,
    );
    expect(a.status).toBe("evidenced");
    expect(a.gap).toMatch(/some years old/i);
  });

  it("keeps unsupported statements beside supported evidence without counting them", () => {
    const a = assess(
      criterion(),
      [linked({ id: "e1", level: "performed" }), evidence({ id: "e2", level: "led" })],
      TODAY,
    );
    expect(a.status).toBe("evidenced");
    expect(a.supporting).toEqual(["e1"]);
    expect(a.discounted.map((d) => d.evidenceId)).toEqual(["e2"]);
    expect(a.because.join(" ")).toMatch(/context only/i);
  });

  it("ignores archived evidence", () => {
    const a = assess(criterion(), [linked({ archivedAt: "2026-09-01T00:00:00Z" })], TODAY);
    expect(a.status).toBe("none");
  });
});

describe("next experience", () => {
  it("asks for the work itself when only a statement exists", () => {
    const c = criterion();
    const a = assess(c, [evidence({ level: "performed" })], TODAY);
    expect(nextExperience(c, a)).toMatch(/Attach the work behind/i);
  });

  it("asks for the next rung when assisting is all there is", () => {
    const c = criterion();
    const a = assess(c, [linked({ level: "assisted" })], TODAY);
    expect(nextExperience(c, a)).toMatch(/yourself with review/i);
  });

  it("asks for a certificate rather than more work for a qualification", () => {
    const c = criterion({ kind: "qualification", text: "Admitted to practise" });
    const a = assess(c, [evidence({ level: "led" })], TODAY);
    expect(nextExperience(c, a)).toMatch(/certificate/i);
  });
});

describe("role reading", () => {
  const criteria = [
    criterion({ id: "c1", text: "Draft SPAs" }),
    criterion({ id: "c2", text: "Manage client relationships" }),
    criterion({ id: "c3", text: "Supervise juniors", essential: false }),
  ];

  const claims = new Map<string, Evidence[]>([
    ["c1", [linked({ id: "e1", level: "independent", repetition: "several" })]],
    ["c2", [linked({ id: "e2", level: "assisted" })]],
  ]);

  it("sorts every requirement into exactly one bucket", () => {
    const r = readRole(criteria, claims, TODAY);
    expect(r.byStatus.strong.map((a) => a.criterionId)).toEqual(["c1"]);
    expect(r.byStatus.developing.map((a) => a.criterionId)).toEqual(["c2"]);
    expect(r.byStatus.none.map((a) => a.criterionId)).toEqual(["c3"]);
    expect(r.assessments).toHaveLength(3);
  });

  it("counts only essential requirements in the secondary indicator", () => {
    const r = readRole(criteria, claims, TODAY);
    expect(r.essentialTotal).toBe(2);
    expect(r.essentialCarried).toBe(1);
  });

  it("summarises in words, naming what has nothing against it", () => {
    const r = readRole(criteria, claims, TODAY);
    expect(roleSummary(r)).toMatch(/1 of 2 essential requirements are evidenced/);
    expect(roleSummary(r)).toMatch(/1 has nothing against it/);
  });
});

describe("evidence reuse", () => {
  it("reports every criterion and role one piece of evidence reaches", () => {
    const criteria = [
      criterion({ id: "c1", roleId: "r1" }),
      criterion({ id: "c2", roleId: "r2", text: "Negotiate on your own feet" }),
    ];
    const claims = [
      {
        id: "x1",
        criterionId: "c1",
        evidenceId: "e1",
        note: "",
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "x2",
        criterionId: "c2",
        evidenceId: "e1",
        note: "",
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "x3",
        criterionId: "c1",
        evidenceId: "e2",
        note: "",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ];
    const reach = evidenceReach("e1", claims, criteria);
    expect(reach.criterionIds).toEqual(["c1", "c2"]);
    expect(reach.roleIds).toEqual(["r1", "r2"]);
  });
});
