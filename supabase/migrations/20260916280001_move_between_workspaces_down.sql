-- Down: workspace moves.
--
-- The two guards are restored to their ORIGINAL form — refusing every
-- workspace_id change outright — because the exception only exists to serve
-- the move function, and a guard left half open after its reason is gone is
-- not a rollback, it is a hole.

drop function if exists public.move_matter_to_workspace(uuid, uuid);
drop function if exists public.move_task_to_workspace(uuid, uuid);
drop function if exists public.matter_move_preview(uuid, uuid);
drop function if exists public.matter_stragglers(uuid);
drop function if exists public.workspaces_i_administer();
drop function if exists public.moving_matter();

-- Restoring enforce_comment_change / enforce_review_move without the exception
-- is left to the migration that defined them; re-running
-- 20260916110000_phase4_schema_and_resolvers.sql and the Phase 4 review
-- migration puts both back as they were.
