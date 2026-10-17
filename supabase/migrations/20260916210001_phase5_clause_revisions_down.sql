-- ROLLBACK for `20260916210000_phase5_clause_revisions.sql`.
--
-- Written and proved before the forward migration ran, which is the practice
-- Phase 3 established for anything that moves a policy and Phase 5 extends to
-- anything that touches legal text.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS UNDOES, AND THE ONE THING IT MUST NOT
-- ---------------------------------------------------------------------------
--
-- It drops the revisions table and its guards. It does NOT touch
-- `clauses.doc`, and it does not restore `clause_segments`, because at this
-- point in Phase 5 the segments have not been deleted — they are still the
-- table every existing screen reads from, and they stay that way until the new
-- model has been in use long enough to trust.
--
-- That is the deliberate shape of step 2: the migration is ADDITIVE. It writes
-- `clauses.doc` and it writes revisions, and it removes nothing. A clause whose
-- conversion turned out wrong can be reconverted, and the old redline is still
-- sitting in `clause_segments` to reconvert it from. Retiring the segments is a
-- separate decision, taken later, once there is nothing left reading them.
--
-- The cost of that choice is a period where two representations of the same
-- wording coexist and could drift. The mitigation is that only one of them is
-- written during that period: after step 3 the editor writes `doc`, and the
-- segment-writing path is removed in the same change rather than left running
-- alongside.

drop trigger if exists clause_revisions_stamp on public.clause_revisions;
drop trigger if exists clause_revisions_immutable on public.clause_revisions;
drop function if exists public.stamp_clause_revision();
drop function if exists public.protect_clause_revision();
drop function if exists public.clause_baseline(uuid);

drop table if exists public.clause_revisions;
