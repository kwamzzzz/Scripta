-- PHASE 4, STEP 1a: the enum values, alone in their own migration.
--
-- WHY THIS IS A SEPARATE FILE, since the plan says the eleven schema changes go
-- in one migration. Postgres will add a value to an existing enum inside a
-- transaction, but it will not let that value be USED until the transaction
-- that added it has committed — `unsafe use of new value of enum type`. The
-- next migration writes check constraints, a trigger and a resolver that all
-- name these values, so it cannot be the same transaction. Splitting the file
-- is the only way to keep both halves transactional.
--
-- The order is the one Phase 3 paid for: the widening that grants nothing runs
-- first, and the file that actually moves a boundary runs second. This file on
-- its own changes no behaviour at all. An enum value that no column holds and
-- no policy reads is inert — it makes rows writable that no code writes yet.
--
-- ---------------------------------------------------------------------------
-- What `source_kind` was missing, and why it matters more than it looks
-- ---------------------------------------------------------------------------
--
-- `comment_matter()` has carried branches for `task`, `flow_phase`,
-- `deliverable`, `draft`, `contract_draft` and `resolution` since Phase 3.
-- None of those is a `source_kind` value, so no comment row could ever hold
-- one, and those branches have never executed. They read as support for
-- threads on a task; they are unreachable code.
--
-- That is worth saying plainly because it is the same shape as the three Phase
-- 3 defects — a thing that looks implemented, reads as implemented, and is
-- silent about not being. It was found by reading `pg_enum` rather than the
-- function.
--
-- Only the kinds Phase 4 actually attaches a thread to are added here. `draft`,
-- `contract_draft` and `resolution` stay unreachable, and their branches in
-- `comment_matter()` stay dead, until something asks for them. Adding an enum
-- value speculatively is how the first three got there.

alter type public.source_kind add value if not exists 'task';
alter type public.source_kind add value if not exists 'deliverable';
alter type public.source_kind add value if not exists 'flow_phase';
alter type public.source_kind add value if not exists 'research_finding';

-- A task origin, not a thread target: `request` is how a task records that
-- somebody asked for it rather than that it fell out of a document. `review`
-- is already present, from the Tasks work funnel.
alter type public.source_kind add value if not exists 'request';

-- ---------------------------------------------------------------------------
-- The review round trip
-- ---------------------------------------------------------------------------
--
-- `Requested → In review → Changes requested → Approved`, which is how review
-- actually goes. `Rejected` stays: it means the thing should not proceed at
-- all, which is a different act from asking for changes and is used rarely.
-- `Not required` stays untouched.

-- Placed in lifecycle order rather than appended. An enum sorts by the order its
-- values were declared, so `order by status` on a review queue reads as the
-- progression it is, and a later `order by` does not have to carry a CASE.
alter type public.approval_status add value if not exists 'In review' after 'Requested';
alter type public.approval_status add value if not exists 'Changes requested' after 'In review';
