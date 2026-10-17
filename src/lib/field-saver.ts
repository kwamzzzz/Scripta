/**
 * Keeping what somebody typed, without waiting for them to click away.
 *
 * ---------------------------------------------------------------------------
 * A PLAYBOOK IS A RECORD, AND A RECORD MUST NOT LOSE A PARAGRAPH
 * ---------------------------------------------------------------------------
 *
 * The playbook editor saved on blur. That is a defensible choice and it was
 * disclosed — "Changes save when you leave a field" sat in the footer — but it
 * has one failure a firm's own positions cannot afford: type a position, then
 * leave by any route that is not a click on another field, and the words are
 * gone. Closing the tab, the browser's back button, a keyboard shortcut. The
 * lawyer is told nothing, because nothing failed; the save was simply never
 * asked for.
 *
 * It was worse than silent. The header read "Saved" the whole time — not
 * "saved since your last edit", just "Saved", whenever a write was not in
 * flight. So the one place on screen a person would look to check their work
 * was safe actively told them it was.
 *
 * This writes shortly after typing stops, flushes immediately on blur, and
 * flushes again if the editor goes away with anything outstanding. `pending`
 * is what the header now reports, so the indicator describes the world.
 */
import { useEffect, useMemo, useState } from "react";

export type FieldPatch = Record<string, unknown>;

export type FieldSaver = {
  /** Record a keystroke. Writes once the typing stops. */
  schedule: (id: string, field: string, patch: FieldPatch) => void;
  /** Write one field now — on blur, where the intent is unambiguous. */
  flushField: (id: string, field: string) => void;
  /** Write everything outstanding now. */
  flushAll: () => void;
  /** How many fields are typed but not yet written. */
  pending: number;
};

/**
 * The saver itself, with no React in it.
 *
 * Plain so that the promises below can be tested as promises — that a later
 * keystroke never loses to an earlier one, that blur does not write twice, and
 * above all that going away writes what is outstanding. This project has no
 * hook-testing tier, and a guarantee about not losing a lawyer's work is not
 * one to leave resting on a hook that cannot be driven in a test.
 */
export function createFieldSaver(
  save: (id: string, patch: FieldPatch) => unknown,
  delay = 600,
  onPendingChange: (pending: number) => void = () => {},
) {
  const outstanding = new Map<string, { id: string; patch: FieldPatch }>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const announce = () => onPendingChange(outstanding.size);

  const write = (key: string) => {
    const held = outstanding.get(key);
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    timers.delete(key);
    if (!held) return;
    outstanding.delete(key);
    announce();
    save(held.id, held.patch);
  };

  return {
    schedule(id: string, field: string, patch: FieldPatch) {
      const key = `${id}:${field}`;
      // The latest value wins; an earlier keystroke never overwrites a later one.
      outstanding.set(key, { id, patch });
      announce();
      const running = timers.get(key);
      if (running) clearTimeout(running);
      timers.set(
        key,
        setTimeout(() => write(key), delay),
      );
    },
    flushField(id: string, field: string) {
      write(`${id}:${field}`);
    },
    flushAll() {
      for (const key of [...outstanding.keys()]) write(key);
    },
    get pending() {
      return outstanding.size;
    },
  };
}

/**
 * `delay` is deliberately short. A lawyer pausing to think mid-sentence should
 * not be able to out-wait their own save.
 */
export function useFieldSaver(
  save: (id: string, patch: FieldPatch) => unknown,
  delay = 600,
): FieldSaver {
  const [pending, setPending] = useState(0);

  /* The saver is made once. `save` is read through a ref so that the flush on
     unmount calls the CURRENT one rather than the one captured on first render
     — that flush is exactly the moment a stale closure would write to the
     wrong place. */
  const held = useMemo(() => {
    const box: { save: (id: string, patch: FieldPatch) => unknown } = { save };
    const saver = createFieldSaver((id, patch) => box.save(id, patch), delay, setPending);
    return { box, saver };
    /* `save` is deliberately not a dependency: it is a fresh closure on every
       render, and rebuilding the saver would throw away the timers holding
       somebody's half-typed position. It is read through the box below, which
       is updated every render, so the saver always calls the current one. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay]);
  held.box.save = save;

  /* Leaving the screen is not a reason to lose a sentence. */
  useEffect(() => {
    const leaving = () => held.saver.flushAll();
    window.addEventListener("pagehide", leaving);
    return () => {
      window.removeEventListener("pagehide", leaving);
      held.saver.flushAll();
    };
  }, [held]);

  return {
    schedule: held.saver.schedule,
    flushField: held.saver.flushField,
    flushAll: held.saver.flushAll,
    pending,
  };
}
