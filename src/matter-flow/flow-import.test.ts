import { describe, expect, it } from "vitest";
import { hasDatabaseIds, withDatabaseIds } from "./flow-import";
import type { MatterFlowRecord } from "./model";

const local: MatterFlowRecord = {
  matterId: "m1",
  kind: "document",
  startedAt: "2026-09-01",
  phases: [
    {
      id: "ph_a",
      matterId: "m1",
      name: "Engagement",
      description: "",
      steps: [],
      deadline: "",
      order: 0,
    },
  ],
  deliverables: [
    {
      id: "del_a",
      phaseId: "ph_a",
      kind: "document",
      name: "Advisory proposal",
      type: "memo",
      description: "",
      owner: "KA",
      start: "",
      deadline: "",
      mandatory: true,
      ticked: false,
      dependsOn: ["del_b"],
    },
    {
      id: "del_b",
      phaseId: "ph_a",
      kind: "document",
      name: "Engagement letter",
      type: "letter",
      description: "",
      owner: "KA",
      start: "",
      deadline: "",
      mandatory: false,
      ticked: false,
    },
  ],
  versions: [
    {
      id: "ver_a",
      deliverableId: "del_a",
      fileRef: null,
      label: "v1",
      createdAt: "2026-09-02",
      isFinal: true,
      thumbnailRef: null,
    },
  ],
  evidence: [],
  parties: [],
  contacts: [],
};

describe("carrying a browser's flow up to the database", () => {
  it("knows a local record still has local ids", () => {
    expect(hasDatabaseIds(local)).toBe(false);
  });

  it("gives every row an id the tables accept", () => {
    const moved = withDatabaseIds(local);
    expect(hasDatabaseIds(moved)).toBe(true);
  });

  it("keeps a deliverable under the phase it was under", () => {
    const moved = withDatabaseIds(local);
    expect(moved.deliverables[0]!.phaseId).toBe(moved.phases[0]!.id);
    expect(moved.deliverables[1]!.phaseId).toBe(moved.phases[0]!.id);
  });

  it("keeps a version on the deliverable it was on", () => {
    const moved = withDatabaseIds(local);
    expect(moved.versions[0]!.deliverableId).toBe(moved.deliverables[0]!.id);
  });

  it("follows a dependency between two deliverables", () => {
    const moved = withDatabaseIds(local);
    expect(moved.deliverables[0]!.dependsOn).toEqual([moved.deliverables[1]!.id]);
  });

  it("leaves a record that already has database ids alone", () => {
    const already = withDatabaseIds(local);
    expect(withDatabaseIds(already)).toEqual(already);
  });
});
