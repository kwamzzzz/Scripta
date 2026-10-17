import { describe, expect, it } from "vitest";
import { blankFixture, goldSupplyFixture } from "../fixtures";
import { deriveFlow, workingDaysBetween, type MatterFlowRecord } from "../model";
import {
  addWorkingDays,
  applyPresetBody,
  emptyPresetBody,
  parsePresetBody,
  presetBodyFromFlow,
  presetShape,
} from "./model";

/** 2026-09-14 is a Monday. */
const MONDAY = "2026-09-14";

describe("addWorkingDays", () => {
  it("skips the weekend", () => {
    expect(addWorkingDays(MONDAY, 0)).toBe(MONDAY);
    expect(addWorkingDays(MONDAY, 4)).toBe("2026-09-18"); // Friday
    expect(addWorkingDays(MONDAY, 5)).toBe("2026-09-21"); // the next Monday
    expect(addWorkingDays(MONDAY, 10)).toBe("2026-09-28");
  });

  it("inverts workingDaysBetween", () => {
    for (const n of [0, 1, 3, 7, 12, 30]) {
      expect(workingDaysBetween(MONDAY, addWorkingDays(MONDAY, n))).toBe(n);
    }
  });

  it("treats a negative offset as day zero", () => {
    expect(addWorkingDays(MONDAY, -3)).toBe(MONDAY);
  });
});

describe("presetBodyFromFlow", () => {
  const body = presetBodyFromFlow(goldSupplyFixture("m1"));

  it("keeps the structure", () => {
    const record = goldSupplyFixture("m1");
    expect(body.phases).toHaveLength(record.phases.length);
    expect(body.deliverables).toHaveLength(record.deliverables.length);
    expect(body.kind).toBe("document");
  });

  it("holds dates as offsets from the matter start, not fixed dates", () => {
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain("2026-08-28");
    expect(body.phases.every((p) => p.dueOffset >= 0)).toBe(true);
    expect(Math.max(...body.phases.map((p) => p.dueOffset))).toBeGreaterThan(0);
  });

  it("carries no work: no versions, evidence or ticks", () => {
    const keys = new Set(Object.keys(body.deliverables[0] ?? {}));
    expect(keys.has("ticked")).toBe(false);
    expect("versions" in body).toBe(false);
    expect("evidence" in body).toBe(false);
  });

  it("orders phases from zero", () => {
    expect(body.phases.map((p) => p.order)).toEqual(body.phases.map((_, i) => i));
  });
});

describe("applyPresetBody", () => {
  const preset = presetBodyFromFlow(goldSupplyFixture("gold"));

  it("lays the structure onto a blank flow with real dates", () => {
    const applied = applyPresetBody(blankFixture("m2"), preset, { start: MONDAY });
    expect(applied.phases).toHaveLength(preset.phases.length);
    expect(applied.deliverables).toHaveLength(preset.deliverables.length);
    expect(applied.phases[0]!.deadline).toBe(addWorkingDays(MONDAY, preset.phases[0]!.dueOffset));
    expect(applied.deliverables.every((d) => d.ticked === false)).toBe(true);
    expect(applied.versions).toHaveLength(0);
    expect(applied.evidence).toHaveLength(0);
  });

  it("keeps every deliverable's start on or before its deadline", () => {
    const applied = applyPresetBody(blankFixture("m2"), preset, { start: MONDAY });
    expect(applied.deliverables.every((d) => d.start <= d.deadline)).toBe(true);
  });

  it("preserves the phase → deliverable tree", () => {
    const applied = applyPresetBody(blankFixture("m2"), preset, { start: MONDAY });
    const ids = new Set(applied.phases.map((p) => p.id));
    expect(applied.deliverables.every((d) => ids.has(d.phaseId))).toBe(true);
    const flow = deriveFlow(applied, MONDAY);
    expect(flow.phases.flatMap((p) => p.deliverables)).toHaveLength(applied.deliverables.length);
  });

  it("appends to an existing flow instead of replacing it", () => {
    const existing = goldSupplyFixture("m3");
    const applied = applyPresetBody(existing, preset, { start: MONDAY });
    expect(applied.phases).toHaveLength(existing.phases.length + preset.phases.length);
    expect(applied.versions).toEqual(existing.versions);
    expect(applied.evidence).toEqual(existing.evidence);
    const orders = applied.phases.map((p) => p.order);
    expect(new Set(orders).size).toBe(orders.length);
    const appended = applied.phases.slice(existing.phases.length);
    expect(Math.min(...appended.map((p) => p.order))).toBeGreaterThan(
      Math.max(...existing.phases.map((p) => p.order)),
    );
  });

  it("mints fresh ids so the same preset can be applied twice", () => {
    const once = applyPresetBody(blankFixture("m4"), preset, { start: MONDAY });
    const twice = applyPresetBody(once, preset, { start: MONDAY });
    const ids = twice.phases.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const delIds = twice.deliverables.map((d) => d.id);
    expect(new Set(delIds).size).toBe(delIds.length);
  });

  it("brings party roles in as unnamed slots, without duplicating one already there", () => {
    const body = {
      ...emptyPresetBody(),
      parties: [
        { role: "Buyer / offtaker", note: "" },
        { role: "Refiner", note: "" },
      ],
    };
    const record: MatterFlowRecord = {
      ...blankFixture("m5"),
      parties: [{ name: "Kessler AG", role: "buyer / offtaker" }],
    };
    const applied = applyPresetBody(record, body, { start: MONDAY });
    expect(applied.parties).toHaveLength(2);
    expect(applied.parties[1]).toEqual({ name: "", role: "Refiner" });
  });

  it("drops deliverables whose phase is missing", () => {
    const body = {
      ...emptyPresetBody(),
      deliverables: [
        {
          id: "d1",
          phaseId: "nope",
          kind: "document" as const,
          name: "Orphan",
          type: "memo" as const,
          description: "",
          note: "",
          ownerRole: "",
          startOffset: 0,
          dueOffset: 1,
          mandatory: true,
          expected: [],
        },
      ],
    };
    expect(applyPresetBody(blankFixture("m6"), body, { start: MONDAY }).deliverables).toHaveLength(0);
  });

  it("carries guidance notes and expected uploads onto the matter", () => {
    const body = {
      ...emptyPresetBody(),
      phases: [
        {
          id: "p1",
          name: "Structuring",
          description: "",
          steps: [],
          note: "Confirm the refinery is LBMA-accredited before anything else.",
          dueOffset: 5,
          order: 0,
        },
      ],
      deliverables: [
        {
          id: "d1",
          phaseId: "p1",
          kind: "document" as const,
          name: "Transaction structure memo",
          type: "memo" as const,
          description: "",
          note: "Flag any leg that moves metal before payment.",
          ownerRole: "Lead",
          startOffset: 0,
          dueOffset: 3,
          mandatory: true,
          expected: ["Assay certificate", "Export permit"],
        },
      ],
    };
    const applied = applyPresetBody(blankFixture("m7"), body, { start: MONDAY });
    expect(applied.phases[0]!.note).toContain("LBMA");
    expect(applied.deliverables[0]!.note).toContain("moves metal");
    expect(applied.deliverables[0]!.expected).toEqual(["Assay certificate", "Export permit"]);
    expect(applied.deliverables[0]!.owner).toBe("Lead");
  });

  it("round-trips a flow through a preset and back", () => {
    const applied = applyPresetBody(blankFixture("m8"), preset, { start: MONDAY });
    const again = presetBodyFromFlow({ ...applied, startedAt: MONDAY });
    expect(again.phases.map((p) => p.dueOffset)).toEqual(preset.phases.map((p) => p.dueOffset));
    expect(again.deliverables.map((d) => d.name)).toEqual(preset.deliverables.map((d) => d.name));
  });
});

describe("parsePresetBody", () => {
  it("reads a body written by presetBodyFromFlow", () => {
    const body = presetBodyFromFlow(goldSupplyFixture("m9"));
    expect(parsePresetBody(JSON.parse(JSON.stringify(body)))).toEqual(body);
  });

  it("survives junk", () => {
    expect(parsePresetBody(null)).toEqual(emptyPresetBody());
    expect(parsePresetBody({ phases: "nope", deliverables: 7 })).toEqual(emptyPresetBody());
  });

  it("drops deliverables pointing at a phase that is not there", () => {
    const parsed = parsePresetBody({
      phases: [{ id: "p1", name: "One" }],
      deliverables: [{ id: "d1", phaseId: "gone", name: "Orphan" }],
    });
    expect(parsed.deliverables).toHaveLength(0);
    expect(parsed.phases[0]!.name).toBe("One");
  });
});

describe("presetShape", () => {
  it("counts what the library shows", () => {
    const shape = presetShape(presetBodyFromFlow(goldSupplyFixture("m10")));
    expect(shape.phases).toBeGreaterThan(0);
    expect(shape.documents).toBeGreaterThan(0);
    expect(shape.span).toBeGreaterThan(0);
  });
});
