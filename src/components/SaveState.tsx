/**
 * Whether the work is safe, said in one place.
 *
 * Scripta currently saves in four different ways and tells the user which one
 * they are in almost never. Some screens have an explicit Save button, some
 * autosave and show a word, some autosave silently, and some commit a field the
 * moment it loses focus. The last of those is the reason this exists: a lawyer
 * editing a governance field has no way to discover that leaving the field
 * wrote the value, because nothing was pressed and nothing was said.
 *
 * So the mode is part of the message, not just the status. A screen that saves
 * on its own says so before anything is typed, rather than only afterwards.
 *
 * The wording is Contract Review's, which is the reference screen for how a
 * collection should behave: "Changes save when you leave a field." Four other
 * screens said the same thing four other ways — "Edits save when you leave a
 * field", "Text fields save when you leave them" — and this component existed
 * for a while as a fifth. One sentence, said once, is the whole point.
 */
import { Check, CircleAlert, Loader } from "lucide-react";
import { C } from "@/lib/tokens";

import "./save-state.css";

/** How this screen commits an edit. */
export type SaveMode =
  /** Written as you type, or shortly after. */
  | "auto"
  /** Written when a field loses focus — invisible unless it is named. */
  | "on-blur"
  /** Written only when the user presses Save. */
  | "manual";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type SaveRequest = {
  mode: SaveMode;
  status: SaveStatus;
  /** Why it failed. Shown verbatim after "Not saved." */
  error?: string | undefined;
};

export type SaveMessage = {
  /** The words. Empty means show nothing at all. */
  text: string;
  tone: "quiet" | "working" | "done" | "error";
  /** How a screen reader is told: errors interrupt, confirmations do not. */
  live: "status" | "alert" | "off";
};

/**
 * The sentence for a save state.
 *
 * At rest, only a screen that saves by itself has anything to say — a manual
 * screen has a Save button, and that button is already the answer to "do I need
 * to do something?". Saying "Not saved yet" beside it would read as a fault
 * rather than as the normal state of an unedited form.
 */
export function saveMessage({ mode, status, error }: SaveRequest): SaveMessage {
  if (status === "error")
    return { text: `Not saved. ${error ?? "Try again."}`.trim(), tone: "error", live: "alert" };
  if (status === "saving") return { text: "Saving…", tone: "working", live: "status" };
  if (status === "saved") return { text: "Saved", tone: "done", live: "status" };
  if (mode === "auto") return { text: "Changes save as you type", tone: "quiet", live: "off" };
  if (mode === "on-blur")
    return { text: "Changes save when you leave a field", tone: "quiet", live: "off" };
  return { text: "", tone: "quiet", live: "off" };
}

const MARK = { quiet: null, working: Loader, done: Check, error: CircleAlert } as const;
const COLOUR = { quiet: C.faint, working: C.muted, done: C.green, error: C.red } as const;

/**
 * Save state as a line of text beside the work.
 *
 * Deliberately not a toast: a toast is gone by the time the question is asked,
 * and the question here — "is this safe to close?" — is asked at the end.
 */
export default function SaveState(request: SaveRequest) {
  const { text, tone, live } = saveMessage(request);
  if (!text) return null;
  const Mark = MARK[tone];
  return (
    <span
      className={`scripta-save-state is-${tone}`}
      style={{ color: COLOUR[tone] }}
      {...(live === "off" ? {} : { role: live })}
    >
      {Mark && <Mark size={13} aria-hidden="true" />}
      {text}
    </span>
  );
}
