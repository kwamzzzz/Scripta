import { describe, expect, it } from "vitest";
import { emptyOrganisation, type Organisation, type ProcessStep, type Role } from "../model";
import {
  actionTypeFor,
  matchOwnerRole,
  needsAuthority,
  presetBodyFromSteps,
  publishChecklist,
  rulesForStep,
} from "./preset";

const role = (id: string, title: string, over: Partial<Role> = {}): Role => ({
  id,
  title,
  functionName: "",
  kind: "role",
  kindLabel: "",
  entityId: null,
  parentRoleId: null,
  holderPersonId: null,
  acting: false,
  coverRoleId: null,
  coverNote: "",
  position: 0,
  effectiveFrom: null,
  effectiveTo: null,
  lastChangeOn: null,
  lastChangeRef: null,
  updatedAt: "",
  ...over,
});

const step = (position: number, title: string, over: Partial<ProcessStep> = {}): ProcessStep => ({
  id: `s${position}`,
  processId: "p",
  position,
  title,
  detail: "",
  ownerRoleId: null,
  durationDays: null,
  sourceSection: "",
  sourcePage: null,
  ...over,
});

const org = (): Organisation => {
  const o = emptyOrganisation("c", "w");
  o.roles = [
    role("ceo", "Chief Executive", { kind: "leadership" }),
    role("comp", "Compliance", { kind: "head", functionName: "Compliance" }),
    role("compa", "Compliance Analyst", { functionName: "Compliance" }),
    role("fin", "Finance Manager", { kind: "head", functionName: "Finance" }),
    role("ops", "Operations", { kind: "head" }),
    role("ops2", "Operations", { kind: "head" }),
  ];
  return o;
};

describe("presetBodyFromSteps", () => {
  it("lays steps end to end in working days, one phase and one owed action each", () => {
    const o = org();
    const body = presetBodyFromSteps(o, [
      step(2, "Assay booking", { durationDays: 1, ownerRoleId: "ops" }),
      step(1, "Supplier KYC", {
        durationDays: 2,
        ownerRoleId: "comp",
        sourceSection: "§3.1",
        sourcePage: 4,
      }),
      step(3, "Export permit", { durationDays: 5, detail: "Lodge the export declaration" }),
    ]);
    expect(body.kind).toBe("action");
    expect(body.phases.map((p) => [p.name, p.dueOffset, p.order])).toEqual([
      ["Supplier KYC", 2, 1],
      ["Assay booking", 3, 2],
      ["Export permit", 8, 3],
    ]);
    expect(body.phases[0]!.note).toBe("From §3.1, page 4 of the source document.");
    expect(body.deliverables.map((d) => [d.ownerRole, d.startOffset, d.dueOffset, d.type])).toEqual(
      [
        ["Compliance", 0, 2, "meeting"],
        ["Operations", 2, 3, "meeting"],
        ["", 3, 8, "filing"],
      ],
    );
    expect(body.deliverables.every((d, i) => d.phaseId === body.phases[i]!.id)).toBe(true);
  });

  it("gives a step with no duration a day rather than stacking it on the last", () => {
    const body = presetBodyFromSteps(org(), [step(1, "A"), step(2, "B")]);
    expect(body.phases.map((p) => p.dueOffset)).toEqual([1, 2]);
  });
});

describe("actionTypeFor", () => {
  it("reads the kind of work from the step's words", () => {
    expect(actionTypeFor({ title: "Payment approval", detail: "" })).toBe("payment");
    expect(actionTypeFor({ title: "Lodge annual return", detail: "" })).toBe("filing");
    expect(actionTypeFor({ title: "Notify the bank", detail: "" })).toBe("email");
    expect(actionTypeFor({ title: "Price agreement", detail: "" })).toBe("meeting");
  });
});

describe("matchOwnerRole", () => {
  it("takes an exact title, then the head of the named function", () => {
    const o = org();
    expect(matchOwnerRole(o, "Chief Executive")?.id).toBe("ceo");
    expect(matchOwnerRole(o, "Compliance")?.id).toBe("comp");
    expect(matchOwnerRole(o, "finance")?.id).toBe("fin");
  });

  it("does not guess between two equally good roles or from nothing", () => {
    const o = org();
    expect(matchOwnerRole(o, "Operations")).toBeNull();
    expect(matchOwnerRole(o, "approved internally")).toBeNull();
    expect(matchOwnerRole(o, "")).toBeNull();
  });
});

describe("authority for a step", () => {
  it("flags approvals and finds the rule whose matter type the step names", () => {
    const o = org();
    o.rules = [
      {
        id: "r1",
        instrumentId: null,
        matterType: "Bank payment",
        entityId: null,
        minAmount: null,
        maxAmount: 50000,
        currency: "GHS",
        basis: "recorded",
        note: "",
        position: 0,
        effectiveFrom: null,
        effectiveTo: null,
      },
    ];
    o.parties = [
      {
        id: "p1",
        ruleId: "r1",
        step: "approve",
        roleId: "fin",
        capacity: null,
        body: null,
        count: 1,
        position: 0,
      },
    ];
    const s = { title: "Payment approval", detail: "Bank payments are approved internally" };
    expect(needsAuthority(s)).toBe(true);
    const found = rulesForStep(o, s);
    expect(found).toHaveLength(1);
    expect(found[0]!.summary).toBe("Bank payment ≤ GHS 50k · approves: Finance Manager");
    expect(rulesForStep(o, { title: "Assay booking", detail: "" })).toHaveLength(0);
  });
});

describe("publishChecklist", () => {
  it("counts unowned steps and requires a source the client still holds", () => {
    const o = org();
    const list = publishChecklist(o, "gone", [step(1, "A", { ownerRoleId: "ceo" }), step(2, "B")]);
    expect(list.find((x) => x.key === "owners")).toMatchObject({
      done: false,
      title: "Name an owner for 1 step",
    });
    expect(list.find((x) => x.key === "source")!.done).toBe(false);
  });
});
