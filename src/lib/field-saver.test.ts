/**
 * What a firm's own positions must never do: lose a paragraph quietly.
 *
 * The playbook editor saved on blur, so typing a position and then leaving by
 * any route that was not a click on another field discarded it — and the header
 * read "Saved" throughout. Found by writing a playbook and losing one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFieldSaver } from "./field-saver";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const saver = (save: (id: string, patch: Record<string, unknown>) => void) => {
  let pending = 0;
  const it_ = createFieldSaver(save, 600, (n) => {
    pending = n;
  });
  return { result: { current: it_ }, pendingNow: () => pending, unmount: () => it_.flushAll() };
};

describe("keeping what somebody typed", () => {
  it("writes shortly after the typing stops, without waiting for a click away", () => {
    const writes: [string, Record<string, unknown>][] = [];
    const { result } = saver((id, patch) => writes.push([id, patch]));

    result.current.schedule("rule-1", "preferred", { preferred: "Payment in 30 days." });
    expect(writes).toHaveLength(0);
    vi.advanceTimersByTime(600);

    expect(writes).toEqual([["rule-1", { preferred: "Payment in 30 days." }]]);
  });

  it("keeps the last thing typed, not the first", () => {
    const writes: Record<string, unknown>[] = [];
    const { result } = saver((_id, patch) => writes.push(patch));

    result.current.schedule("r", "preferred", { preferred: "Payment in 3" });
    vi.advanceTimersByTime(100);
    result.current.schedule("r", "preferred", { preferred: "Payment in 30 days." });
    vi.advanceTimersByTime(600);

    expect(writes).toEqual([{ preferred: "Payment in 30 days." }]);
  });

  it("does not let one field's typing delay another's", () => {
    const writes: string[] = [];
    const { result } = saver((_id, patch) => writes.push(Object.keys(patch)[0]!));

    result.current.schedule("r", "preferred", { preferred: "a" });
    result.current.schedule("r", "redflag", { redflag: "b" });
    vi.advanceTimersByTime(600);

    expect(writes.sort()).toEqual(["preferred", "redflag"]);
  });

  it("writes immediately when the lawyer leaves the field", () => {
    const writes: Record<string, unknown>[] = [];
    const { result } = saver((_id, patch) => writes.push(patch));

    result.current.schedule("r", "preferred", { preferred: "Capped at 12 months." });
    result.current.flushField("r", "preferred");

    expect(writes).toEqual([{ preferred: "Capped at 12 months." }]);
    // ...and the timer that was still running must not write it a second time.
    vi.advanceTimersByTime(600);
    expect(writes).toHaveLength(1);
  });

  /* The case that was losing work.

     This asserts the flush itself, which is what the hook calls when the editor
     unmounts and on `pagehide`. That wiring is one line in `useFieldSaver` and
     is NOT covered here — this project has no hook-testing tier, and adding a
     dependency to cover one line of wiring was the wrong trade. Said plainly so
     nobody reads this test as proving more than it does. */
  it("writes everything outstanding when asked to flush", () => {
    const writes: Record<string, unknown>[] = [];
    const { result } = saver((_id, patch) => writes.push(patch));

    result.current.schedule("r", "preferred", { preferred: "Never accept this." });
    result.current.schedule("r", "redflag", { redflag: "Nor this." });
    expect(writes).toHaveLength(0);

    result.current.flushAll();

    expect(writes).toEqual([{ preferred: "Never accept this." }, { redflag: "Nor this." }]);
    // Nothing is written twice when the timers that were still running fire.
    vi.advanceTimersByTime(600);
    expect(writes).toHaveLength(2);
  });

  it("reports what is outstanding, so the header can stop claiming 'Saved'", () => {
    const { result, pendingNow } = saver(() => {});
    expect(result.current.pending).toBe(0);

    result.current.schedule("r", "preferred", { preferred: "x" });
    expect(result.current.pending).toBe(1);
    expect(pendingNow()).toBe(1);

    result.current.schedule("r", "redflag", { redflag: "y" });
    expect(result.current.pending).toBe(2);

    vi.advanceTimersByTime(600);
    expect(result.current.pending).toBe(0);
    expect(pendingNow()).toBe(0);
  });
});
