-- Down: Phase 5 step 5. Clauses stop going live, the leases stop being
-- enforced, and save_clause_doc returns to its two-argument form. The
-- edit_locks policies are left TIGHTENED — a down migration that restores a
-- boundary hole is not a rollback, it is a regression.

alter publication supabase_realtime drop table public.clauses;
alter publication supabase_realtime drop table public.edit_locks;

drop function if exists public.matter_presence(uuid);
drop function if exists public.break_clause_lease(uuid);
drop function if exists public.release_clause(uuid);
drop function if exists public.refresh_clause(uuid);
drop function if exists public.take_clause(uuid);
drop function if exists public.clause_lease(uuid);
drop function if exists public.save_clause_doc(uuid, jsonb, timestamptz);
