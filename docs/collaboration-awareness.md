# A collaboration awareness layer

**Requirement recorded 15 September 2026, during the Phase 4 acceptance test.
Kwame's, in his words and mental model. Not implemented, deliberately.**

---

## The correction to Phase 4

Phase 4 decided two things and conflated them. The first is still right; the
second went too far.

**Still right:** a mention must not create a Task. Tasks is the answer to *what
do I have to do*, and a list that also carried every mention would stop being
that within a week.

**Too far:** "there is no notification centre" was taken to mean there should be
no awareness surface at all. The result is that a lawyer can only discover that
something relevant happened by opening each matter and looking. The
matter-level dot helps only once you are already looking at the list, and only
for mentions.

## The model

Three surfaces, three different questions:

| | Answers |
|---|---|
| **Tasks** | Things I need to do |
| **Notifications** | Things I should know happened |
| **Matter Activity** | The durable record of what happened on the file |

The middle one is missing. It is not a weaker Task list and it is not a
searchable copy of the audit trail; it is the transient "you should know about
this" layer that sits between them.

## The shape

Restrained, and the restraint is the specification:

- A small **bell / activity control in the global header**, with a **quiet
  unread dot**. Not a count that climbs.
- Opens a **compact panel**. Not a page, not a route, not a workspace.
- Each entry **deep-links directly** to the relevant matter, object and thread.
  An entry you cannot act on from is noise.

## What it surfaces

Meaningful collaboration events **involving me**:

- comments and replies involving me
- mentions
- review requests, and their outcomes
- changes requested
- approvals
- requests, and declines
- assignments and handoffs

## What it is not

Stated as firmly as the inclusions, because this is where the feature would rot:

- **Not an Outlook-style inbox.**
- **Not a notification management product** — no preferences matrix, no
  per-event toggles, no digest scheduling, no channels.
- **No unread-count obsession.** A dot, not a number that climbs.
- **Not every database event.** The audit trail already records everything;
  this is the small subset a person should be interrupted about.
- It does not replace the matter-level quiet markers. Those stay as contextual
  signals where they already are.

## Where it sits in the plan

To be assessed **after Phase 4 acceptance completes**, and the assessment is
itself the deliverable:

1. What is the smallest architecturally sound way to add it?
2. Is it a **Phase 4 close-out enhancement**, or the **first small follow-on
   before Phase 5**?

### Notes towards that assessment, written while the context is fresh

The raw material already exists and was built in Phase 4, which is the argument
for it being small:

- `audit_events` already records every event on the list above —
  `comment.posted`, `comment.edited`, `review.requested`, `review.decided`,
  `work.requested`, `work.declined`, `work.handed_off` — already matter-scoped,
  so it already inherits the matter's visibility and needs no new boundary.
- `comments.mentions` already records who was named, as a fact.
- `approvals.assigned_to` already records who a review is waiting on.
- Realtime already publishes `comments`, `approvals`, `tasks` and
  `flow_deliverables`, so the dot can light up live without new plumbing.

The open questions are narrower than they look, and two of them are the real
work:

1. **What makes an event mine?** "Involving me" is doing a lot of work in the
   requirement. Authored by me, mentioning me, assigned to me, about work I own,
   about a decision I asked for — each is a different predicate and the union of
   them is the feature. This is where a badly specified version becomes a feed.
2. **What is the read state?** Phase 4 deliberately has no per-message read
   state. A single `notifications_seen_at` per person — the same shape as
   `matter_members.mentions_seen_at`, which works — would give the dot without
   introducing per-row unread tracking. That is almost certainly the right
   answer, and it should be resisted hard if it starts growing a table.
3. Whether entries are **derived from `audit_events` on read**, or **written to
   their own table**. Deriving keeps one source of truth and no new write path;
   a table is easier to query and immediately becomes a thing that can drift
   from the audit trail. Start by trying to derive.

A first estimate, to be confirmed rather than relied on: one migration (a
`notifications_seen_at` column and one resolver function answering "events
involving me since"), one hook, one panel component, one suite. Comparable to
Phase 4 step 3, which was the smallest step in the phase.

The thing to watch: item 1 is where scope escapes. If the predicate list cannot
be written down in a paragraph, the feature is not the one described here.
