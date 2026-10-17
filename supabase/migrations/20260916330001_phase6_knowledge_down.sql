-- Down: Phase 6.
--
-- Returns knowledge to firm-shared, which is where Phase 3 found it. Written
-- out in full because the halves matter in a particular order: the policies go
-- back to `is_workspace_member` BEFORE the columns they read are dropped, or
-- the tables spend the intervening moment with no readable policy at all.
--
-- The column privileges are NOT restored. Handing `approved` back to the client
-- would re-open the forgery this phase closed, and a down migration that
-- restores a hole is not a rollback.

drop policy if exists "knowledge visible playbooks" on public.playbooks;
create policy "members read playbooks" on public.playbooks for select
  using (public.is_workspace_member(workspace_id));
drop policy if exists "knowledge visible precedents" on public.precedents;
create policy "members read precedents" on public.precedents for select
  using (public.is_workspace_member(workspace_id));
drop policy if exists "knowledge visible templates" on public.templates;
create policy "members read templates" on public.templates for select
  using (public.is_workspace_member(workspace_id));

drop function if exists public.precedent_provenance(uuid);
drop function if exists public.knowledge_context(text, uuid);
drop function if exists public.approve_knowledge(text, uuid);
drop function if exists public.withdraw_knowledge_approval(text, uuid);
drop function if exists public.share_knowledge(text, uuid, uuid);
drop function if exists public.unshare_knowledge(text, uuid, uuid);
drop function if exists public.set_knowledge_visibility(text, uuid, public.knowledge_visibility);
drop function if exists public.can_use_knowledge(text, uuid);
drop function if exists public.can_approve_knowledge(text, uuid);
drop function if exists public.can_write_knowledge(text, uuid);
drop function if exists public.knowledge_visible(uuid, public.knowledge_visibility, uuid, text, uuid);
drop function if exists public.knowledge_owner(text, uuid);
drop function if exists public.knowledge_workspace(text, uuid);
drop function if exists public.knowledge_approved(timestamptz, timestamptz);

drop table if exists public.knowledge_shares;

-- The columns are left in place on purpose. Dropping `approved_by` and
-- `approved_at` would destroy the record of who approved what, which is
-- provenance rather than configuration, and no rollback should burn that.
