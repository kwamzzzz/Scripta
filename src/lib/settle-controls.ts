/**
 * Which settle controls one outstanding change should offer.
 *
 * One function, used by the clause rail and the Changes pane, because they had
 * drifted: the rail asked "is this mine?" first and the pane did not, so the
 * pane drew Accept on the author's own wording.
 *
 * `can_settle_change()` answers true for your own change — withdrawing decides
 * nothing — so "may settle" is not the same question as "may accept", and any
 * surface that conflates them offers self-approval.
 */
export type SettleOffer = "withdraw" | "settle" | "none";

export function settleControls({
  mine,
  maySettle,
  alone = false,
}: {
  /** The caller is the author of this change. */
  mine: boolean;
  /** `can_settle_change()` for this change's author, from the server. */
  maySettle: boolean;
  /** The caller is the only person on the matter. */
  alone?: boolean;
}): SettleOffer {
  // `mine` first, always. Taking back your own words is not a decision about
  // them; accepting them is, and it is not yours to make — while there is
  // somebody else on the matter to make it. A lawyer working a matter alone
  // has no second pair of eyes to wait for, and withholding Accept left their
  // own mark-up impossible to settle anywhere in Scripta.
  if (mine) return alone && maySettle ? "settle" : "withdraw";
  return maySettle ? "settle" : "none";
}
