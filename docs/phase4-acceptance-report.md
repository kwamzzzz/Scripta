# Phase 4 — acceptance report

**15–16 September 2026. Two users, two authenticated sessions, against the live
database.** Mawusi (Kwame) and Podrick Robogo on Atlas Industrial Supplies, with
Personal Trade Management as the control matter Podrick is not on.

**Result: Phase 4 is accepted.** Four defects were found and fixed during the
test; none remains open.

---

## The headline

**Three of the four defects the browser found were invisible to the SQL suites —
and in each case the suite was correctly asserting a rule the product was not
using.**

That is the finding worth carrying into Phase 5. The suites are not weak; 158
assertions across eight files all passed, and still pass. They tested the rules.
The application took a different path to the same tables, and no amount of
assertion-writing in the same style would have noticed.

The failure mode has a name now: **a fixture more correct than the product.**
Every Phase 4 assertion wrote comments with `author_id` supplied by hand, because
that made the authorship rules readable — so the suite proved a set of rules
about a column the application was silently leaving empty.

---

## What passed

| § | | Result |
|---|---|---|
| 1 | A thread appears without a reload | **Pass** — comment and reply both arrived live |
| 2 | A mention creates nothing | **Pass** — 0 tasks, 0 approvals, 0 `origin_kind='mention'` |
| 2 | The picker offers the matter team only | **Pass** — on PTM it offered Mawusi alone |
| 3 | Request, decline, and the return | **Pass** — returned to the asker with the reason on record |
| 4 | The review round trip | **Pass** — full lap with correct actors at every move |
| 5 | Resolution is earned | **Pass** — same raiser, same role; only responsibility differed |
| 6 | Editing says so | **Pass** — Edited marker, author-only, audit row with previous text |
| 7 | Demotion mid-flight | **Pass** — every control withdrawn, reads survive |
| 8 | Removal mid-flight | **Pass** — nothing at all, and the URL does not confirm existence |
| 9 | Matter B invisible throughout | **Pass** — continuously, in every list and count |

Live delivery was observed three times on three different paths: a comment
arriving in an open thread, a review request arriving as a task, and a request
for work arriving as a task. Each was read without touching the page.

The clearest single piece of evidence is the review audit trail, which shows the
whole lap with the right hand on every move:

```
Mawusi          review requested
Podrick         Requested          → In review
Podrick         In review          → Changes requested
Mawusi          Changes requested  → Requested      (the resubmit, by the author)
Podrick         Requested          → In review      (he found it again — the fix)
Mawusi          In review          → Approved
```

---

## Defects found and fixed

### 1. A comment was signed by nobody — and could be signed as anybody

`comments.author_id` was never stamped and never checked. Four consequences:
comments rendered as "Unknown"; their own author could not edit them; commenting
on your own unfiled work was **refused outright**; and **any member could post a
comment attributed to a colleague**.

The fourth is the one that mattered. A comment is part of the record of a legal
file; who said a thing is most of what it is worth.

Fixed by **forcing** rather than defaulting — a trigger sets `author_id :=
auth.uid()` unconditionally, so a client sending a colleague's id is stamped with
its real writer. `coalesce()` would have fixed the null and left the
impersonation. `author_id` is now immutable. → `f2ec667`

### 2. The mention marker was unusable

`useClearMentionsOnOpen` was passed `matterId`, which falls back to `matters[0]`.
Visiting the matters **list** therefore marked the first matter as read — so for
anyone whose mentioned matter was their first, which for a person on one matter
is always, the dot was cleared a moment before it could be drawn.

Not weak or late: **unusable, silently.** Now hooked to `forcedMatterId`, set
only when the route names the matter. → `1255929`

### 3. A resubmitted review arrived nowhere

`Changes requested → Requested` moved the status and nothing else. The reviewer's
task stayed `Done` from when it left their hands, so the second lap of the round
trip arrived as neither work nor notice — the exact failure `request_review()`
has a comment above it promising to avoid. Half of a symmetric pair had been
implemented. → `54ca137`

Also fixed there: the reviewer was offered **Resubmit**, a button handing their
own request back into their own queue.

### 4. Two reader functions outranked their callers

`task_actions()` and `review_for()` were `security definer`, so their reads
bypassed RLS, and both guarded only `matter_id is not null`. For unfiled work the
guard was skipped: `task_actions()` returned a row for another person's private
request **and named who asked**.

Found by a regression run rather than the browser. Fixed by making both
`security invoker` — the policy filters the read and there is no branch to
forget. → `4ee1202`

**The rule left behind:** a function that *reports* on a row must not read that
row with more authority than its caller has.

---

## Punch list — none blocking

1. **No Delete on a reply**, only on a root. The database allows the author or
   the Lead to delete either; the interface offers one.
2. **Podrick's workspace silently flipped to "Personal"** during the test and his
   matters list read *"No matters yet"* until switched back. Not Phase 4 —
   workspace selection is Phase 3b — but a lawyer would conclude their files had
   vanished.
3. **Three of the four verbs deliver into Tasks, and Tasks can be switched off.**
   The `tasks` feature flag was disabled for the whole workspace, so a request to
   Podrick created a task he could not see. The work arrived nowhere and the
   asker got no hint. Either the verbs should be unavailable when Tasks is off,
   or they need a delivery surface that does not depend on that flag — which is
   close to the awareness layer. **Fold into that assessment.**
4. **A review's state is only findable by navigating to its exact object.** Kwame
   could not find a review he had requested four minutes earlier, on a matter
   with one contract, because the selection had moved by one clause. The reviewer
   at least gets a task; the asker gets nothing. Also folds into the awareness
   layer, and specifically means "review requests and outcomes" must include the
   **asker**, not only the addressee.
5. **Role changes do not propagate live.** `matter_members` is deliberately not
   published to realtime, so a demotion or removal takes effect on the next
   fetch. Correct by design; worth stating because the acceptance script assumed
   otherwise.
6. **Clause 1 is a group header** in the contract editor and selecting it is
   fiddly, which caused a false alarm mid-test. Not a Phase 4 concern.

---

## Test data left on the live database

Created during the test, on Atlas. **Not cleaned up — that is Kwame's call:**

- 5 tasks: two `ACCEPTANCE …`, one declined `Check the Westpoint indemnity cap`,
  two `Review: clause …`
- 2 approvals (one Approved on clause 1.3, one on clause 1.4)
- 9 comments on clause 1.3 and on the ACCEPTANCE tasks, including three mentions

Say the word and I will remove them in one pass.

---

## What still genuinely needs Kwame

**Nothing for acceptance.** Two things for judgment:

1. **The subjective UX read.** I verified every control appears and disappears
   correctly, but I cannot judge whether the review card, the mention dot and the
   decline flow *feel* right in use. That is yours.
2. **The awareness layer decision** — `docs/collaboration-awareness.md`. Phase 4
   close-out, or first follow-on before Phase 5. Punch-list items 3 and 4 both
   argue for sooner rather than later.

---

## Verification state at close

| | |
|---|---|
| SQL assertions | **188** across nine files, all passing |
| Application tests | **1033**, all passing |
| Typecheck / lint | clean |
| Repo | `main` level with `origin/main`, pushed |
| Live database | schema applied and verified aligned with the repo |
| Podrick | restored: firm Lawyer, **Editor on Atlas** |
| `tasks` feature flag | **on** (was off at the start of the test) |
