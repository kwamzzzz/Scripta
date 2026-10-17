/**
 * The clock's arithmetic, and the one rule that makes its number worth
 * signing: nothing is counted while the app was not there.
 */
import { describe, expect, it } from "vitest";
import {
  BEAT_EVERY,
  clauseList,
  formatUnits,
  formatUnitSpan,
  proposeNarrative,
  unitsFor,
  countedIn,
  formatSpan,
  formatWorked,
  GONE_AFTER,
  isRunning,
  totalOf,
  type Sitting,
} from "./time-spent";

const NOW = new Date("2026-09-22T14:00:00.000Z").getTime();
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

const sitting = (over: Partial<Sitting> = {}): Sitting => ({
  id: "s-1",
  seconds: 0,
  runningSince: null,
  beatAt: ago(0),
  endedAt: null,
  ...over,
});

describe("counting a sitting", () => {
  it("counts a running sitting up to the moment asked for", () => {
    const s = sitting({ seconds: 120, runningSince: ago(45), beatAt: ago(5) });
    expect(countedIn(s, NOW)).toBe(165);
    expect(isRunning(s, NOW)).toBe(true);
  });

  it("counts a paused sitting at what it had, and no more", () => {
    const s = sitting({ seconds: 300, runningSince: null, beatAt: ago(3600) });
    expect(countedIn(s, NOW)).toBe(300);
    expect(isRunning(s, NOW)).toBe(false);
  });

  /**
   * The assertion the feature turns on. A tab closed at six o'clock must count
   * until six o'clock — not until the laptop is opened again the next morning,
   * which is what a naive now-minus-started would give.
   */
  it("stops at the last heartbeat when the app went away", () => {
    const closed = sitting({ seconds: 600, runningSince: ago(9000), beatAt: ago(8400) });
    // Ten minutes counted before the run, plus the ten minutes it was watched.
    expect(countedIn(closed, NOW)).toBe(600 + (9000 - 8400));
    expect(isRunning(closed, NOW)).toBe(false);
  });

  it("forgives a missed beat rather than ending a lawyer's sitting over it", () => {
    // One beat late: a throttled background tab, not a closed app.
    const late = sitting({ seconds: 0, runningSince: ago(120), beatAt: ago(BEAT_EVERY + 5) });
    expect(isRunning(late, NOW)).toBe(true);
    expect(countedIn(late, NOW)).toBe(120);

    const gone = sitting({ seconds: 0, runningSince: ago(120), beatAt: ago(GONE_AFTER + 5) });
    expect(isRunning(gone, NOW)).toBe(false);
    expect(countedIn(gone, NOW)).toBe(120 - (GONE_AFTER + 5));
  });

  it("treats a stopped sitting as stopped, however it was left", () => {
    const s = sitting({ seconds: 90, runningSince: ago(30), endedAt: ago(10), beatAt: ago(10) });
    expect(isRunning(s, NOW)).toBe(false);
  });

  it("totals the sittings, because nothing stores a total", () => {
    const rows = [
      sitting({ id: "a", seconds: 300, endedAt: ago(7200) }),
      sitting({ id: "b", seconds: 60, endedAt: ago(3600) }),
      sitting({ id: "c", seconds: 10, runningSince: ago(20), beatAt: ago(2) }),
    ];
    expect(totalOf(rows, NOW)).toBe(300 + 60 + 30);
  });
});

describe("reading the number", () => {
  it("shows minutes and seconds, and hours only once there are any", () => {
    expect(formatSpan(0)).toBe("0:00");
    expect(formatSpan(42)).toBe("0:42");
    expect(formatSpan(725)).toBe("12:05");
    expect(formatSpan(3857)).toBe("1:04:17");
  });

  it("writes the total the way a time record does", () => {
    expect(formatWorked(30)).toBe("under a minute");
    expect(formatWorked(60)).toBe("1m");
    expect(formatWorked(2520)).toBe("42m");
    expect(formatWorked(3857)).toBe("1h 04m");
  });
});

describe("what leaves the clock", () => {
  it("rounds up to the firm's unit, because that is how a firm bills", () => {
    expect(unitsFor(0)).toBe(0);
    // Any work at all is a unit: the file was opened and something was read.
    expect(unitsFor(5)).toBe(1);
    expect(unitsFor(6 * 60)).toBe(1);
    expect(unitsFor(6 * 60 + 1)).toBe(2);
    expect(unitsFor(3600)).toBe(10);
    expect(unitsFor(3857)).toBe(11);
  });

  it("writes units the way a bill does, and the way a person reads", () => {
    expect(formatUnits(1)).toBe("0.1");
    expect(formatUnits(10)).toBe("1.0");
    expect(formatUnits(15)).toBe("1.5");
    expect(formatUnitSpan(1)).toBe("6m");
    expect(formatUnitSpan(10)).toBe("1h");
    expect(formatUnitSpan(15)).toBe("1h 30m");
  });
});

describe("the narrative Scripta proposes", () => {
  /**
   * It reads like a lawyer wrote it, because a client reads it. Counts of
   * insertions and deletions are what a machine writes, and the first question
   * they provoke is what the client is paying for.
   */
  it("says what was done, to which clauses", () => {
    expect(
      proposeNarrative({
        document: "Vendor Agreement",
        amended: ["4", "5.1"],
        drafted: [],
        considered: [],
      }),
    ).toBe("Reviewing and marking up Vendor Agreement; amendments to clauses 4 and 5.1.");
  });

  it("names drafting as drafting", () => {
    expect(
      proposeNarrative({
        document: "Vendor Agreement",
        amended: [],
        drafted: ["3A"],
        considered: ["5.2", "5.1", "10"],
      }),
    ).toBe(
      "Reviewing and marking up Vendor Agreement; drafting clause 3A; " +
        "consideration of clauses 5.1, 5.2 and 10.",
    );
  });

  it("falls back to the plain truth when nothing was marked up", () => {
    expect(
      proposeNarrative({ document: "Vendor Agreement", amended: [], drafted: [], considered: [] }),
    ).toBe("Reviewing Vendor Agreement.");
  });

  it("orders clause numbers as a lawyer would, with schedules last", () => {
    expect(clauseList(["10", "2.1", "2", "Schedule 1", "2.10"])).toBe(
      "2, 2.1, 2.10, 10 and Schedule 1",
    );
    expect(clauseList([])).toBe("");
  });
});
