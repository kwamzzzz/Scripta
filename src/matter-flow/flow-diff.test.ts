import { describe, expect, it } from "vitest";
import { changes, flowDiff, isEmptyWrite } from "./flow-diff";
import { reorderInPhase, type Deliverable, type MatterFlowRecord } from "./model";

const record = (patch: Partial<MatterFlowRecord> = {}): MatterFlowRecord => ({
  matterId: "m1",
  kind: "document",
  startedAt: "2026-09-01",
  phases: [],
  deliverables: [],
  versions: [],
  evidence: [],
  parties: [],
  contacts: [],
  ...patch,
});

const phase = (id: string, name = "Engagement") => ({
  id,
  matterId: "m1",
  name,
  description: "",
  steps: [],
  deadline: "2026-09-30",
  order: 0,
});

describe("what changed", () => {
  it("sorts rows into inserted, updated and deleted", () => {
    const c = changes(
      [
        { id: "a", n: 1 },
        { id: "b", n: 2 },
      ],
      [
        { id: "a", n: 1 },
        { id: "b", n: 9 },
        { id: "c", n: 3 },
      ],
    );
    expect(c.inserted).toEqual([{ id: "c", n: 3 }]);
    expect(c.updated).toEqual([{ id: "b", n: 9 }]);
    expect(c.deletedIds).toEqual([]);
  });

  it("reports a row that is gone", () => {
    expect(changes([{ id: "a" }, { id: "b" }], [{ id: "a" }]).deletedIds).toEqual(["b"]);
  });

  it("calls an untouched row untouched even though the object is new", () => {
    // Every store action rebuilds the record, so reference equality would
    // report the whole flow as changed on every tick of a checkbox.
    const before = [{ id: "a", nested: { deep: [1, 2] } }];
    const after = [{ id: "a", nested: { deep: [1, 2] } }];
    expect(changes(before, after).updated).toEqual([]);
  });

  it("keys by whatever identifies the row", () => {
    const c = changes(
      [{ deliverableId: "d1", body: "old" }],
      [{ deliverableId: "d1", body: "new" }],
      (r) => r.deliverableId,
    );
    expect(c.updated).toEqual([{ deliverableId: "d1", body: "new" }]);
  });
});

describe("a record's worth of difference", () => {
  it("writes everything when there was nothing before", () => {
    const write = flowDiff(null, record({ phases: [phase("p1")] }));
    expect(write.head).not.toBeNull();
    expect(write.phases.inserted).toHaveLength(1);
  });

  it("writes nothing at all when nothing moved", () => {
    const before = record({ phases: [phase("p1")] });
    expect(isEmptyWrite(flowDiff(before, record({ phases: [phase("p1")] })))).toBe(true);
  });

  it("leaves the flow's own row alone when only a phase changed", () => {
    const write = flowDiff(
      record({ phases: [phase("p1")] }),
      record({ phases: [phase("p1", "Structuring")] }),
    );
    expect(write.head).toBeNull();
    expect(write.phases.updated.map((p) => p.name)).toEqual(["Structuring"]);
  });

  it("notices the flow's own fields changing", () => {
    const write = flowDiff(record(), record({ startedAt: "2026-10-01" }));
    expect(write.head?.startedAt).toBe("2026-10-01");
    expect(isEmptyWrite(write)).toBe(false);
  });

  it("treats records written before threads existed as having none", () => {
    const write = flowDiff(record(), record());
    expect(write.threads.inserted).toEqual([]);
    expect(write.emails.deletedIds).toEqual([]);
  });
});

describe("reordering deliverables", () => {
  const d = (id: string, phaseId = "p1") =>
    ({
      id,
      phaseId,
      kind: "document",
      name: id,
      type: "memo",
      description: "",
      owner: "",
      start: "",
      deadline: "",
      mandatory: true,
      ticked: false,
    }) as Deliverable;

  it("keeps other phases in place and refills this phase's slots", () => {
    const list = [d("a"), d("x", "p2"), d("b"), d("c")];
    expect(reorderInPhase(list, "p1", ["c", "a", "b"]).map((r) => r.id)).toEqual([
      "c",
      "x",
      "a",
      "b",
    ]);
    // Ids from elsewhere are ignored; rows the order forgets keep their place at the end.
    expect(reorderInPhase(list, "p1", ["b", "x"]).map((r) => r.id)).toEqual(["b", "x", "a", "c"]);
  });

  it("writes rows that only moved, so the new order survives a reload", () => {
    const before = record({ phases: [phase("p1")], deliverables: [d("a"), d("b"), d("c")] });
    const after = {
      ...before,
      deliverables: reorderInPhase(before.deliverables, "p1", ["c", "a", "b"]),
    };
    const write = flowDiff(before, after);
    expect(isEmptyWrite(write)).toBe(false);
    expect(write.deliverables.updated.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
    // Nothing moved, nothing written.
    expect(isEmptyWrite(flowDiff(before, { ...before }))).toBe(true);
  });
});
