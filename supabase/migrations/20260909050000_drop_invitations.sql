-- Scripta is a personal workspace. Nobody is invited into it.
--
-- workspace_invitations was never read or written by any application code —
-- the only table in the schema with no call site at all — and inviting people
-- is the opposite of what this app is for. An empty table with four policies
-- guarding nothing is one more thing for the next reader to work out.
--
-- workspace_members deliberately stays. It looks like a collaboration feature
-- and is not: it is how row level security decides that a row belongs to you.
-- is_workspace_member and can_write_workspace read it on every query, so it is
-- the mechanism that keeps the data private, not a way of sharing it.

drop table if exists public.workspace_invitations;
