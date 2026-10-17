# A research finding should be a durable object

**Recorded 16 September 2026, during Phase 4. Deliberately not implemented.**

Kwame's decision, and the reasoning, kept where the next person will find it
rather than in a conversation nobody can read.

---

## The requirement

A lawyer should be able to discuss one finding, and to ask a colleague to
review one finding, rather than a whole research note. "Is this right?" about a
single proposition is a real thing a senior lawyer says to a junior, and it is
more useful than the same question about a twelve-finding memo.

That is a genuine product requirement. It is not being dropped; it is being put
where it can be done properly.

## Why Phase 4 does not do it

A finding is not currently a durable entity.

`replaceChildren()` in `src/lib/research-store.functions.ts` deletes every
`research_findings` row for a research matter and inserts them again on **every
save** — not only when the research is re-run. Each save therefore issues new
primary keys for findings that have not changed.

The consequence for a thread attached to one, proved against the live database
rather than reasoned about:

| | |
|---|---|
| Before a save | the thread resolves to its matter; a colleague on the matter reads it |
| After a save | the comment rows still exist — `comments.entity_id` is polymorphic and carries no foreign key, so nothing cascades — but `comment_matter()` returns null, the comments policy falls to its author-only branch, and the thread is visible to its writer and to nobody else |

No error. No log. Invisible in the direction that looks like the feature simply
not working — the signature all three Phase 3 defects shared.

Flow phases and deliverables were checked for the same property and do not have
it: `flow-db.ts` upserts them by id against an explicit inserted / updated /
deletedIds diff, so their ids survive a save. This is isolated to findings.

## What was decided instead

**Research collaboration attaches to the research matter**, which is a durable
row with a stable id. `research` is a thread kind; `research_finding` is not.

Research persistence was **not** changed to make finding-level threads work.
Phase 4 is structured collaboration on things that already exist; redesigning
how research saves itself is a different piece of work and would have expanded
this phase into one.

## What was removed, and the one thing that was not

Removed in `20260916130000_phase4_research_at_matter_level.sql`:

- the `research_finding` branch of `comment_matter()`
- the `research_finding` branch of `entity_owner()`
- `finding_research()`, which existed only to serve them
- the `research_finding` branch of all six comments and approvals policies
- `research_finding` from `THREAD_KINDS` in `src/lib/thread.ts`

**Not removed: the `research_finding` value in the `source_kind` enum.**
Postgres has no `ALTER TYPE ... DROP VALUE`. Removing it means rebuilding the
type and rewriting five columns across four tables — `comments.entity_kind`,
`approvals.entity_kind`, `links.from_kind`, `links.to_kind` and
`tasks.origin_kind` — which is a large, risky change for a cosmetic gain. That
is the only reason it survives.

The leftover is a different shape from the dead branches it replaces, and the
difference is the point. The Phase 3 problem was never the enum; it was a
resolver that *claimed* to handle a kind. `task`, `deliverable` and `flow_phase`
had branches in `comment_matter()` that read as working support and could never
run. `research_finding` now has no resolver branch, no policy branch, no entry
in `THREAD_KINDS`, and no interface able to produce one. A row written with it
resolves to null and falls to the author-only branch, which is the fail-safe
default rather than a leak.

And it is asserted rather than assumed. `phase4_schema_and_resolvers.sql` tests
that `research_finding` resolves to **nothing**, and the migration refuses to
finish if it ever resolves again. The unsupported kind is a checked property of
the schema instead of an unexamined leftover; anybody re-adding it is made to
read this file.

## When to revisit

With deeper Legal Research and Workflow Tool collaboration — Phase 5 territory,
where finding identity can be made stable properly rather than patched to make
one feature work.

What that needs, in rough order:

1. **A durable key for a finding.** Either stop replacing children wholesale and
   upsert by id, or give a finding a stable natural key that survives a re-run
   (issue number plus ordinal is not enough — findings are reordered and
   renumbered).
2. **A decision about what a re-run means.** When research is answered again and
   a finding's text changes, is it the same finding with new wording, or a new
   finding? A thread that survives the first and not the second needs the
   product to have an opinion, and the audit trail needs to record which
   happened.
3. **Then, and only then**, `research_finding` returns to `comment_matter()`,
   `entity_owner()`, the policies and `THREAD_KINDS` — in one migration, with
   the null branch of each asserted before the feature is built, which is the
   rule Phase 3 bought in blood.

Step 3 of that list is cheap. Steps 1 and 2 are the work, and step 2 is a
product question rather than an engineering one.
