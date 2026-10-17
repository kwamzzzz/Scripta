# Phase 5 — two-user browser acceptance

**16 September 2026.** Mawusi (Lead) and Podrick Robogo (Editor), in separate
Chrome profiles, on the Atlas Industrial Supplies framework agreement, clause
1.3 "Confirmation".

Kwame drove the Mawusi profile. Claude drove Podrick and verified every
server-side claim against the live database.

## Result: PASSED

All eight assertions, after six defects were found and fixed.

| | Assertion | Verified by |
|---|---|---|
| 1 | A deep link lands on the clause it names | Kwame |
| 2 | "Podrick Robogo is in this clause" | Kwame |
| 3 | Settle controls withheld while a colleague holds it | Kwame |
| 4 | "Take it from Podrick" — offered to the Lead | Kwame |
| 5 | A saved change arrives live, without a reload | Kwame |
| 6 | The break works, and settle controls then appear | Kwame |
| 7 | The break is audited, and the bell tells the interrupted lawyer | Claude |
| 8 | **The save is refused, and the unsaved sentence survives** | Claude |

Assertion 4 was confirmed from both sides: the Lead is offered the break, and
an Editor looking at the same held clause is not.

### The audit trail it produced

| Time (UTC) | Who | Event | Recorded |
|---|---|---|---|
| 03:01:41 | Podrick | `change.proposed` | 1 proposed, 0 settled |
| 03:25:08 | Podrick | `change.proposed` | 1 proposed, 0 settled |
| 03:31:03 | Mawusi | `lease.broken` | Took the clause from Podrick Robogo |

No document text anywhere in it. Counts and the act only, with the interrupted
lawyer named in `metadata.held_by` — which is what lets the bell tell that
person specifically.

### Assertion 8, in full

Podrick held the clause with unsaved wording in the editor. Mawusi broke the
lease. Podrick pressed Save.

- The database refused: *"This clause is open with Mawusi. Your changes have
  not been saved — they are still on your screen."*
- The editor stayed open and the unsaved sentence stayed in it.
- `clauses.updated_at` did not move. The unsaved text never reached the
  database.

## Six defects, all found by the browser and none by 1,167 unit tests

**1. Typing produced one tracked change per keystroke.** A single typed proviso
logged "80 proposed, 0 settled". Both change marks are `inclusive: false`, which
is correct, so a character typed at the end of your own proposal did not inherit
its mark and the plugin minted a fresh change for it. Every existing case in the
plugin's suite inserted text in ONE transaction, which is not what typing is —
the fixture was not wrong about the rule, it was wrong about the SHAPE OF THE
INPUT. Now one change; six cases added that type the way a keyboard does.

**2. Deep links landed on the wrong clause.** Selection reconciliation ran while
the matter data was still empty, wrote "" over the id from the URL, and then
fell through to the first clause. Every entry in the awareness bell links as
`?clause=<id>`, so the bell led to clause 1.1 every time — precisely the "open
the matter and hunt" it was built to replace.

**3. The rail offered Accept on your own wording.** `can_settle_change` answers
true for your own change, and rightly, because withdrawing decides nothing. The
interface read that as "may accept", so the editor promised "your wording is
marked as proposed until somebody accepts it" and two inches below offered the
author the button to accept it themselves. `mine` is now asked first: your own
proposal offers Withdraw, and says "Yours. Somebody else accepts it."

**4. The bell was not in the global header.** Four screens supply their own
topbar, including the matter workbench, so the bell vanished on exactly the
screens where collaboration happens.

**5. Presence was dead code.** `MatterPresence` renders only when you are on a
matter screen — which is precisely the screen that overrode the topbar. "Who is
in this clause" shipped in step 5 and had never once been drawn.

**6. The write-health net claimed a refused RPC was lost work.** A POST to
`/rest/v1/rpc/` is a function call, and the net cannot tell a read from a write;
several of them are reads. It fired alongside the lease refusal, called it "a
change to “rpc”", and offered RELOAD — the one action that throws away the
unsaved sentence, directly under a message promising it was safe.

## Correction to the record

The step 7 commit states that change-set review shipped. The UI half never
reached the file; only the unused `asking` and `team` state did, which
typechecked. It is present now. The commit message was ahead of the code.

## Open decision, not blocking

`can_settle_change` permits the author of a change to settle it, so that they
can withdraw it. The server cannot distinguish withdrawing from accepting —
both remove the mark; accepting keeps the text, withdrawing removes it. The
interface no longer offers self-acceptance, but a crafted request could still
make an Editor's own wording operative with no second pair of eyes.

Closing that properly changes how the firm works, so it is Kwame's call. See
`docs/self-acceptance.md`.
