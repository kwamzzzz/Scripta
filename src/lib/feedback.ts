/**
 * Feedback: the vocabulary, and the two decisions worth testing.
 *
 * Everything here is pure. The permission decision and the status flow are
 * stated once, so the composer, the portal and the server function cannot
 * disagree about who may review feedback or where an item can go next. The
 * database is still the enforcement point for both (see the feedback
 * migration); this module is what the interface offers.
 */

export type FeedbackKind = "bug" | "idea" | "other";
export type FeedbackStatus = "unread" | "read" | "resolved";

/**
 * Three kinds. A longer list makes the sender classify instead of write, and
 * every extra option is one more way to file the same thing in two places.
 */
export const FEEDBACK_KINDS: { key: FeedbackKind; label: string; hint: string }[] = [
  { key: "bug", label: "Something is broken", hint: "It did the wrong thing, or nothing at all." },
  { key: "idea", label: "An idea", hint: "Something that would make the work easier." },
  { key: "other", label: "Something else", hint: "A question, a rough edge, a note." },
];

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  bug: "Bug",
  idea: "Idea",
  other: "Other",
};

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  unread: "Unread",
  read: "Read",
  resolved: "Resolved",
};

/**
 * Where an item can go from where it is.
 *
 * Forward through the funnel, plus one way back out of `resolved`: an admin
 * who resolves the wrong row must not be stuck with it. There is deliberately
 * no path back to `unread` — an admin has read it, and pretending otherwise
 * would make the unread count a lie.
 */
const FLOW: Record<FeedbackStatus, readonly FeedbackStatus[]> = {
  unread: ["read", "resolved"],
  read: ["resolved"],
  resolved: ["read"],
};

export function nextStatuses(from: FeedbackStatus): readonly FeedbackStatus[] {
  return FLOW[from];
}

export function canTransition(from: FeedbackStatus, to: FeedbackStatus): boolean {
  return FLOW[from].includes(to);
}

/**
 * Who may read other people's feedback. `owner` and `admin` only, matching the
 * `can_admin_workspace()` helper the row level security policy uses — a lawyer
 * or a viewer sees nothing but their own submissions, whatever the interface
 * happens to render.
 */
export function canReviewFeedback(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export const FEEDBACK_MAX_LENGTH = 2000;

/** Why this message cannot be sent, or null when it can. */
export function feedbackMessageError(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return "Write something first.";
  if (trimmed.length > FEEDBACK_MAX_LENGTH)
    return `That is ${trimmed.length - FEEDBACK_MAX_LENGTH} characters too long.`;
  return null;
}
