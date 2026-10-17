import { describe, expect, it } from "vitest";
import {
  contextLine,
  mergeDuplicates,
  mergeUnits,
  needsAttributionReview,
  processWindow,
  sanitiseRef,
  taskAssignee,
  windowsFor,
  cleanEpisodes,
  episodeAt,
  withoutLabels,
  type Item,
  type Participant,
} from "./distiller";

const people: Participant[] = [
  { key: "p1", name: "Mawusi Kwame", source: "lawyer", userId: "u-1" },
  { key: "p2", name: "Dominik Kleemann", source: "detected" },
  { key: "p3", name: "Sarah Mensah", source: "lawyer" },
];

describe("windowsFor", () => {
  it("covers every bubble once, with look-back for context", () => {
    const w = windowsFor(120, 50, 6);
    expect(w.map((x) => [x.from, x.to, x.contextFrom])).toEqual([
      [1, 50, 1],
      [51, 100, 45],
      [101, 120, 95],
    ]);
  });
  it("gives nothing for an empty transcript", () => {
    expect(windowsFor(0)).toEqual([]);
  });
});

describe("sanitiseRef", () => {
  const evidence = "Speaker 2: Thanks, Dominik. John from the bank said he would sign.";
  it("never lets the model confirm", () => {
    expect(
      sanitiseRef({ name: "Mawusi", status: "confirmed", basis: "x" }, people, "").status,
    ).toBe("likely");
  });
  it("maps a first name to the one participant who has it", () => {
    expect(sanitiseRef({ name: "Dominik", status: "likely" }, people, "")).toMatchObject({
      participant: "p2",
    });
    expect(sanitiseRef({ name: "kleemann", status: "uncertain" }, people, "")).toMatchObject({
      participant: "p2",
      status: "uncertain",
    });
  });
  it("keeps a name the transcript itself gives, but no other", () => {
    expect(sanitiseRef({ name: "John", status: "likely" }, people, evidence)).toMatchObject({
      name: "John",
    });
    const invented = sanitiseRef({ name: "Peter Obi", status: "likely" }, people, evidence);
    expect(invented.status).toBe("unattributed");
    expect(invented.name).toBeUndefined();
    expect(invented.participant).toBeUndefined();
  });
  it("does not match part of a word", () => {
    expect(sanitiseRef({ name: "Jo", status: "likely" }, people, evidence).status).toBe(
      "unattributed",
    );
  });
  it("treats a status with no name as unattributed", () => {
    expect(sanitiseRef({ name: "", status: "likely" }, people, evidence).status).toBe(
      "unattributed",
    );
    expect(
      sanitiseRef({ name: "Mawusi", status: "unattributed" }, people, "").participant,
    ).toBeUndefined();
    expect(sanitiseRef(undefined, people, "").status).toBe("unattributed");
    expect(sanitiseRef({ name: "Mawusi", status: "certain" }, people, "").status).toBe(
      "unattributed",
    );
  });
  it("does not guess between two people who share a first name", () => {
    const two = [...people, { key: "p4", name: "Sarah Owusu", source: "lawyer" as const }];
    expect(sanitiseRef({ name: "Sarah", status: "likely" }, two, "").status).toBe("unattributed");
    expect(sanitiseRef({ name: "Sarah", status: "likely" }, two, "Sarah said so")).toMatchObject({
      name: "Sarah",
    });
  });
});

describe("processWindow", () => {
  const win = { from: 11, to: 20, contextFrom: 5 };
  it("keeps units built from the window, drops ones built only from look-back or outside", () => {
    const out = processWindow(
      {
        units: [
          { key: "u1", bubbles: [8, 9, 11], text: "Continues into the window", voice: "A" },
          { key: "u2", bubbles: [6, 7], text: "Context only", voice: "A" },
          { key: "u3", bubbles: [19, 25], text: "Runs past the end", voice: "B" },
          { key: "u4", bubbles: [30], text: "Outside", voice: "B" },
          { key: "u5", bubbles: [12], text: "  ", voice: "B" },
        ],
        items: [],
      },
      win,
      people,
      "",
    );
    expect(out.units.map((u) => [u.key, u.ordinals])).toEqual([
      ["u1", [8, 9, 11]],
      ["u3", [19]],
    ]);
  });
  it("drops an item that rests on no unit it was given", () => {
    const out = processWindow(
      {
        units: [
          { key: "u1", bubbles: [12, 13], text: "We will send the draft by Friday", voice: "A" },
        ],
        items: [
          { kind: "action", title: "Send draft", statement: "", units: ["u1"] },
          { kind: "decision", title: "Orphan", statement: "", units: ["u9"] },
          { kind: "risk", title: "", statement: "no title", units: ["u1"] },
        ],
      },
      win,
      people,
      "",
    );
    expect(out.items.map((i) => i.title)).toEqual(["Send draft"]);
    expect(out.items[0]!.roles.owner?.status).toBe("unattributed");
  });
  it("keeps roles apart and marks materiality only where a role can matter", () => {
    const out = processWindow(
      {
        units: [{ key: "u1", bubbles: [12], text: "The board approved the facility", voice: "A" }],
        items: [
          {
            kind: "decision",
            title: "Facility approved",
            statement: "The speaker reported that the board approved the facility.",
            units: ["u1"],
            speaker: { name: "Sarah", status: "likely", basis: "addressed" },
            decision_maker: { name: "the board", status: "likely", basis: "reported" },
            reported: true,
            attribution_material: true,
            substance_confidence: "high",
          },
          {
            kind: "risk",
            title: "FX exposure",
            statement: "",
            units: ["u1"],
            attribution_material: true,
          },
          { kind: "nonsense", title: "Odd kind", statement: "", units: ["u1"] },
        ],
      },
      win,
      people,
      "the board approved the facility",
    );
    const [decision, risk, odd] = out.items;
    expect(decision!.roles.speaker).toMatchObject({ participant: "p3", status: "likely" });
    expect(decision!.roles.decisionMaker).toMatchObject({ name: "the board" });
    expect(decision!.reported).toBe(true);
    expect(decision!.material).toBe(true);
    expect(risk!.material).toBe(false);
    expect(risk!.roles.owner).toBeUndefined();
    expect(odd!.kind).toBe("statement");
  });
});

const item = (over: Partial<Item>): Item => ({
  id: "i",
  kind: "action",
  title: "t",
  statement: "s",
  unitIds: [],
  pointIds: [],
  substance: "high",
  roles: {},
  reported: false,
  material: true,
  review: "distilled",
  due: null,
  taskId: null,
  source: "ai",
  ordinal: 0,
  ...over,
});

describe("material attribution review", () => {
  it("asks only where it matters and Scripta cannot say", () => {
    expect(
      needsAttributionReview(item({ roles: { owner: { status: "uncertain", name: "X" } } })),
    ).toBe("owner");
    expect(
      needsAttributionReview(item({ roles: { owner: { status: "likely", participant: "p1" } } })),
    ).toBeNull();
    // Nobody recorded as owning a commitment is a gap worth asking about…
    expect(needsAttributionReview(item({ roles: { owner: { status: "unattributed" } } }))).toBe(
      "owner",
    );
    expect(needsAttributionReview(item({ kind: "decision", roles: {} }))).toBe("decisionMaker");
    // …an unknown speaker of a position is not.
    expect(
      needsAttributionReview(
        item({ kind: "position", roles: { speaker: { status: "unattributed" } } }),
      ),
    ).toBeNull();
    expect(
      needsAttributionReview(
        item({ kind: "position", roles: { speaker: { status: "uncertain", name: "X" } } }),
      ),
    ).toBe("speaker");
    expect(
      needsAttributionReview(
        item({ material: false, roles: { owner: { status: "uncertain", name: "X" } } }),
      ),
    ).toBeNull();
    expect(
      needsAttributionReview(
        item({ kind: "risk", roles: { speaker: { status: "uncertain", name: "X" } } }),
      ),
    ).toBeNull();
    // It is the owner that matters for an action, not who said it.
    expect(
      needsAttributionReview(
        item({
          roles: {
            speaker: { status: "uncertain", name: "X" },
            owner: { status: "likely", participant: "p1" },
          },
        }),
      ),
    ).toBeNull();
  });
  it("stops asking once answered or rejected", () => {
    const ref = { status: "uncertain" as const, name: "X" };
    expect(
      needsAttributionReview(item({ roles: { owner: { ...ref, resolvedAt: "now" } } })),
    ).toBeNull();
    expect(needsAttributionReview(item({ review: "rejected", roles: { owner: ref } }))).toBeNull();
  });
});

describe("taskAssignee", () => {
  it("assigns only a confirmed owner who is a member", () => {
    expect(
      taskAssignee(item({ roles: { owner: { status: "confirmed", participant: "p1" } } }), people),
    ).toBe("u-1");
    expect(
      taskAssignee(item({ roles: { owner: { status: "likely", participant: "p1" } } }), people),
    ).toBeNull();
    expect(
      taskAssignee(item({ roles: { owner: { status: "confirmed", participant: "p2" } } }), people),
    ).toBeNull();
    expect(
      taskAssignee(item({ roles: { owner: { status: "confirmed", name: "John" } } }), people),
    ).toBeNull();
    expect(taskAssignee(item({ roles: {} }), people)).toBeNull();
  });
});

describe("mergeUnits", () => {
  const u = (key: string, window: number, ordinals: number[]) => ({
    key,
    window,
    ordinals,
    text: key,
    voice: "",
    speaker: { status: "unattributed" as const },
  });
  it("joins a unit split by a window boundary; the later reading wins", () => {
    const r = mergeUnits([u("a", 0, [48, 49, 50]), u("b", 1, [49, 50, 51, 52]), u("c", 1, [53])]);
    expect(r.into).toEqual({ a: "b" });
    expect(r.units.map((x) => [x.key, x.ordinals])).toEqual([
      ["b", [48, 49, 50, 51, 52]],
      ["c", [53]],
    ]);
  });
  it("leaves two units of one window that share a bubble alone", () => {
    const r = mergeUnits([u("a", 0, [5]), u("b", 0, [5, 6])]);
    expect(r.into).toEqual({});
    expect(r.units).toHaveLength(2);
  });
  it("resolves a chain across three windows", () => {
    const r = mergeUnits([u("a", 0, [50]), u("b", 1, [50, 100]), u("c", 2, [100, 101])]);
    expect(r.into).toEqual({ a: "c", b: "c" });
    expect(r.units.map((x) => x.ordinals)).toEqual([[50, 100, 101]]);
  });
});

describe("mergeDuplicates", () => {
  const it0 = (id: string, kind: Item["kind"], unitIds: string[]) => ({
    id,
    kind,
    unitIds,
    pointIds: unitIds.map((x) => `p${x}`),
  });
  it("folds a group into its first item and keeps all provenance", () => {
    const r = mergeDuplicates(
      [it0("a", "decision", ["1"]), it0("b", "agreement", ["2"]), it0("c", "risk", ["3"])],
      [["a", "b"]],
    );
    expect(r.dropped).toEqual(["b"]);
    expect(r.items.find((i) => i.id === "a")!.unitIds).toEqual(["1", "2"]);
    expect(r.items.find((i) => i.id === "a")!.pointIds).toEqual(["p1", "p2"]);
  });
  it("ignores unknown ids, reuse, and incompatible kinds", () => {
    const items = [
      it0("a", "decision", ["1"]),
      it0("b", "risk", ["2"]),
      it0("c", "decision", ["3"]),
    ];
    const r = mergeDuplicates(items, [
      ["a", "b"],
      ["zz", "c"],
      ["a", "c"],
      ["c", "a"],
    ]);
    expect(r.dropped).toEqual(["c"]);
    expect(r.items.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("episodes", () => {
  it("clamps, drops empty and reversed, and sorts", () => {
    const e = cleanEpisodes(
      [
        { title: "Fees", from: 40, to: 999 },
        { title: "Opening", from: 0, to: 10 },
        { title: "", from: 11, to: 20 },
        { title: "Backwards", from: 30, to: 20 },
      ],
      60,
    );
    expect(e).toEqual([
      { title: "Opening", fromOrdinal: 1, toOrdinal: 10 },
      { title: "Fees", fromOrdinal: 40, toOrdinal: 60 },
    ]);
    expect(episodeAt(e, 45)).toBe("Fees");
    expect(episodeAt(e, 20)).toBe("");
  });
});

describe("contextLine", () => {
  it("carries the caveats with the item", () => {
    const line = contextLine(
      item({
        kind: "decision",
        title: "Facility approved",
        statement: "Reported that the board approved it.",
        reported: true,
        substance: "medium",
        roles: { decisionMaker: { name: "the board", status: "likely" } },
      }),
      people,
    );
    expect(line).toContain("decided by the board (likely)");
    expect(line).toContain("reported, not verified");
    expect(line).toContain("medium confidence");
    expect(contextLine(item({ roles: {} }), people)).toContain("owner unknown");
    expect(contextLine(item({ statement: "Speaker 2 said John will send it." }), people)).toContain(
      "A participant said John will send it.",
    );
  });
});

describe("withoutLabels", () => {
  it("keeps recorder labels out of what the record says", () => {
    expect(withoutLabels("Speaker 2 agreed to the escrow.")).toBe(
      "A participant agreed to the escrow.",
    );
    expect(withoutLabels("It was put by speaker 12 and Speaker 3.")).toBe(
      "It was put by a participant and a participant.",
    );
    expect(withoutLabels("Loudspeaker 5 volume")).toBe("Loudspeaker 5 volume");
    expect(withoutLabels("John will send it.")).toBe("John will send it.");
  });
  it("applies to units and items coming from the model", () => {
    const out = processWindow(
      {
        units: [
          {
            key: "u1",
            bubbles: [12],
            text: "Speaker 4 offered to circulate the draft.",
            voice: "A",
          },
        ],
        items: [
          {
            kind: "action",
            title: "Speaker 4 circulates draft",
            statement: "Speaker 4 will circulate it.",
            units: ["u1"],
          },
        ],
      },
      { from: 11, to: 20, contextFrom: 5 },
      people,
      "",
    );
    expect(out.units[0]!.text).toBe("A participant offered to circulate the draft.");
    expect(out.items[0]!.title).toBe("A participant circulates draft");
    expect(out.items[0]!.statement).toBe("A participant will circulate it.");
  });
});
