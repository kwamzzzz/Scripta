/** Client-safe types for the Scripta Dialogue that sits on every screen. */
import type { ReactNode } from "react";

export type AssistantScope = {
  /** Thread identity. Conversations are kept per key (a matter id, or a section). */
  key: string;
  /** Shown under the panel title — the matter, playbook or screen the assistant is reading. */
  label: string;
  /** Empty-thread note, e.g. "Hi there — how can I help today?" */
  intro?: string;
  /** Optional prompts offered as chips on an empty thread. */
  suggestions?: string[];
  /** Grounding passed to the server: the assistant reads this matter's clause register. */
  matterId?: string | null;
  /** The clause the lawyer currently has selected, when there is one. */
  clauseId?: string | null;
  /** A short description of what is on screen, so answers are anchored to it. */
  screen?: string;
  /** Editor instructions staged for the lawyer to review and send. */
  composerRequest?: { id: string; text: string };
  /**
   * What the panel shows before anybody asks anything.
   *
   * On a review screen the panel should already be reading the clause the
   * lawyer is looking at — its assessment, what it means for the client, what
   * we would do about it — rather than waiting to be asked. The chat stays
   * underneath for the question the brief did not answer.
   */
  brief?: ReactNode;
  /** Handles an action chip on a reply; without it the chip is asked as a question. */
  onAction?: (action: AssistantAction) => void;
};

/** An action chip the assistant can return on a reply (e.g. "Open memo at open points"). */
export type AssistantAction = {
  label: string;
  /** What the screen should do, e.g. "open_deliverable"; the screen decides what it supports. */
  command: string;
  kind?: "primary" | "secondary";
  args?: Record<string, string>;
};

export type AssistantReply = {
  label: string;
  summary: string;
  detail: string;
  sources: string[];
  /** Optional action chips, rendered under the summary. */
  actions?: AssistantAction[];
};

export type AssistantMessage =
  | { id: string; role: "user"; text: string; at: string }
  | { id: string; role: "assistant"; reply: AssistantReply; at: string }
  | { id: string; role: "error"; text: string; at: string };

export const ASSISTANT_INTRO = "Hi there — how can I help today?";
