# Open decision: may a lawyer accept their own wording?

Raised by the Phase 5 browser acceptance, 16 September 2026. **Not blocking.**

## The situation

`can_settle_change(clause, author)` answers **true** when the author is the
caller. That is deliberate and right: taking back your own proposal decides
nothing and needs nobody's permission.

But `save_clause_doc` cannot tell withdrawing from accepting. Both remove the
mark. Accepting keeps the text; withdrawing removes it. The server checks *who
may settle*, not *which way*.

So an Editor can make their own drafting operative with no second pair of eyes.

The interface no longer offers it — your own proposal shows Withdraw and says
"Yours. Somebody else accepts it." A crafted request could still do it.

## Why it is not simply a bug to fix

It is a question about how the firm works, not about what the code should do.
Scripta's own editor says *"your wording is marked as proposed until somebody
accepts it"*, which reads as a rule. Whether that rule should bind the drafter
in a two-person team is Kwame's call, not mine.

## The options

**A. Leave it.** The audit records `change.settled` against the person, so it is
attributable after the fact. In a small trusted circle that may be enough, and
requiring a colleague to accept every one of your own edits is real friction on
a matter where you are the only one working.

**B. Refuse self-acceptance at the server.** Split the right in two:
`can_withdraw_change` (the author, always) and `can_accept_change` (the Lead,
the clause's assignee, an addressed reviewer — never mere authorship). The
server then needs to tell the two apart, which it can do structurally rather
than by being told: settling your own insertion must leave the document's text
SHORTER (you took the words back), and settling your own deletion must leave it
UNCHANGED (you took the strike back). Accepting does the opposite in both cases.

No new verb, no trusting the client's account of its own intent.

**C. Make it the Lead's setting per matter.** More machinery than this deserves,
and a second place for the rule to live. Recorded only to be dismissed.

## Recommendation

**B**, when it next matters — which is the day a third lawyer joins a matter.
Today the practical risk is low and the interface no longer invites it.

Doing B is roughly one migration and one suite; it does not disturb the mark
model, the readings or the leases.
