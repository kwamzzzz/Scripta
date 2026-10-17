import { describe, expect, it } from "vitest";
import {
  deriveDeliverable,
  deriveFlow,
  workingDaysBetween,
  type Deliverable,
  type MatterFlowRecord,
} from "./model";

const TODAY = "2026-09-11";

const doc = (over: Partial<Deliverable> = {}): Deliverable => ({
  id: "d1",
  phaseId: "p1",
  kind: "document",
  name: "Memo",
  type: "memo",
  description: "",
  owner: "JF",
  start: "2026-09-01",
  deadline: "2026-09-20",
  mandatory: true,
  ticked: false,
  ...over,
});

describe("deriveDeliverable", () => {
  it("a document is complete only when ticked with a final version", () => {
    const final = {
      id: "v1",
      deliverableId: "d1",
      fileRef: "x.pdf",
      label: "v1",
      createdAt: "2026-09-02",
      isFinal: true,
      thumbnailRef: null,
    };
    expect(deriveDeliverable(doc({ ticked: true }), [], [], TODAY).state).toBe("in_progress");
    expect(deriveDeliverable(doc({ ticked: false }), [final], [], TODAY).state).toBe("in_progress");
    expect(deriveDeliverable(doc({ ticked: true }), [final], [], TODAY).state).toBe("complete");
  });

  it("an action is complete only when ticked with evidence", () => {
    const action = doc({ kind: "action", type: "email" });
    expect(deriveDeliverable({ ...action, ticked: true }, [], [], TODAY).state).toBe("in_progress");
    const proof = { id: "e1", deliverableId: "d1", name: "Receipt", createdAt: "2026-09-03" };
    expect(deriveDeliverable({ ...action, ticked: true }, [], [proof], TODAY).state).toBe(
      "complete",
    );
  });

  it("waiting_on outranks the deadline; overdue, due today and planned follow the dates", () => {
    expect(
      deriveDeliverable(
        doc({
          deadline: "2026-09-01",
          waitingOn: { who: "Registrar", since: "2026-09-08", expectedBy: "2026-09-15" },
        }),
        [],
        [],
        TODAY,
      ).state,
    ).toBe("waiting_on");
    expect(deriveDeliverable(doc({ deadline: "2026-09-08" }), [], [], TODAY).state).toBe("overdue");
    expect(deriveDeliverable(doc({ deadline: TODAY }), [], [], TODAY).state).toBe("due_today");
    expect(
      deriveDeliverable(doc({ start: "2026-10-01", deadline: "2026-10-30" }), [], [], TODAY).state,
    ).toBe("planned");
  });
});

describe("deriveFlow", () => {
  const record: MatterFlowRecord = {
    matterId: "m",
    kind: "document",
    startedAt: "2026-08-28",
    phases: [
      {
        id: "p2",
        matterId: "m",
        name: "Second",
        description: "",
        steps: [],
        deadline: "2026-10-01",
        order: 2,
      },
      {
        id: "p1",
        matterId: "m",
        name: "First",
        description: "",
        steps: [],
        deadline: "2026-09-01",
        order: 1,
      },
      {
        id: "p3",
        matterId: "m",
        name: "Third",
        description: "",
        steps: [],
        deadline: "2026-11-01",
        order: 3,
      },
    ],
    deliverables: [
      doc({ id: "a", phaseId: "p1", ticked: true, deadline: "2026-08-30" }),
      doc({ id: "b", phaseId: "p1", ticked: false, mandatory: false, deadline: "2026-08-30" }),
      doc({ id: "c", phaseId: "p2", ticked: false }),
      doc({ id: "d", phaseId: "p3", start: "2026-10-05", deadline: "2026-10-30" }),
    ],
    versions: [
      {
        id: "v",
        deliverableId: "a",
        fileRef: "a.pdf",
        label: "v1",
        createdAt: "2026-08-29",
        isFinal: true,
        thumbnailRef: null,
      },
    ],
    evidence: [],
    parties: [],
    contacts: [],
  };

  it("closes a phase when its mandatory deliverables are complete and activates the next", () => {
    const flow = deriveFlow(record, TODAY);
    expect(flow.phases.map((p) => p.name)).toEqual(["First", "Second", "Third"]);
    expect(flow.phases.map((p) => p.state)).toEqual(["done", "active", "upcoming"]);
    expect(flow.activePhase?.id).toBe("p2");
    expect(flow.closedCount).toBe(1);
    expect(flow.activeForDays).toBe(14);
    expect(flow.phases[0]?.completeCount).toBe(1);
    expect(flow.phases[0]?.progress).toBe(0.5);
  });

  it("keeps a phase open while a mandatory deliverable is outstanding", () => {
    const flow = deriveFlow(
      {
        ...record,
        deliverables: record.deliverables.map((d) =>
          d.id === "b" ? { ...d, mandatory: true } : d,
        ),
      },
      TODAY,
    );
    expect(flow.phases[0]?.state).toBe("active");
    expect(flow.phases[0]?.mandatoryOutstanding).toBe(1);
  });
});

describe("workingDaysBetween", () => {
  it("counts Monday to Friday only", () => {
    // Tue 8 Sept → Fri 11 Sept 2026: Wed, Thu, Fri
    expect(workingDaysBetween("2026-09-08", "2026-09-11")).toBe(3);
    // Fri 11 Sept → Mon 14 Sept: Mon only
    expect(workingDaysBetween("2026-09-11", "2026-09-14")).toBe(1);
  });
});
