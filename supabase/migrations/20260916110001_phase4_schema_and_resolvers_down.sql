-- ROLLBACK for `20260916110000_phase4_schema_and_resolvers.sql`.
--
-- Written before the migration was applied, which is the practice Phase 3
-- established for anything that moves a policy. It is not run in the normal
-- course; it exists so that "put it back" is a file somebody can read rather
-- than a thing somebody reconstructs at the wrong moment.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS CAN AND CANNOT UNDO
-- ---------------------------------------------------------------------------
--
-- CAN: the policies, the triggers, the two new resolvers, the column grants,
-- and the columns themselves.
--
-- CANNOT: the enum values from `20260916100000_phase4_enum_values.sql`.
-- Postgres has no `ALTER TYPE ... DROP VALUE`, and there is no supported way to
-- remove one from `source_kind` or `approval_status` short of rewriting the
-- type and every column that uses it. That is the reason those values live in
-- their own migration and the reason that migration adds nothing but inert
-- values: an enum value no column holds and no policy reads grants nothing, so
-- leaving them behind costs nothing either. If this rollback runs, they stay,
-- and the next attempt finds `add value if not exists` already satisfied.
--
-- ORDER. Section 8 of the migration widened the comments UPDATE policy to admit
-- the people who may resolve, and moved the finer rule into a trigger. Dropping
-- the trigger first would leave that wider policy standing with nothing
-- enforcing authorship — an editing free-for-all for anyone who may resolve. So
-- the POLICIES are restored first and the triggers dropped second, which is the
-- same lesson as Phase 3: close the bypass before moving the boundary, never
-- the other way round.

-- ---------------------------------------------------------------------------
-- 1. The policies, back to their Phase 3d wording
-- ---------------------------------------------------------------------------

drop policy if exists "authors update comments" on public.comments;
create policy "authors update comments" on public.comments for update
  using (author_id = auth.uid()
         or case when public.comment_matter(entity_kind::text, entity_id) is not null
                 then public.is_matter_lead(public.comment_matter(entity_kind::text, entity_id))
                 else public.can_admin_workspace(workspace_id) end)
  with check (case when public.comment_matter(entity_kind::text, entity_id) is not null
                   then public.can_review_matter(public.comment_matter(entity_kind::text, entity_id))
                   else public.can_write_workspace(workspace_id) end);

drop policy if exists "members read comments" on public.comments;
create policy "members read comments" on public.comments for select
  using (
    case
      when public.comment_matter(entity_kind::text, entity_id) is not null
        then public.is_matter_member(public.comment_matter(entity_kind::text, entity_id))
      when entity_kind::text = 'research'
        then coalesce(public.is_research_member(entity_id), author_id = auth.uid())
      when entity_kind::text in ('playbook', 'precedent')
        then public.is_workspace_member(workspace_id)
      else author_id = auth.uid()
    end);

drop policy if exists "writers insert comments" on public.comments;
create policy "writers insert comments" on public.comments for insert
  with check (
    case
      when public.comment_matter(entity_kind::text, entity_id) is not null
        then public.can_review_matter(public.comment_matter(entity_kind::text, entity_id))
      when entity_kind::text = 'research'
        then coalesce(public.can_write_research(entity_id), author_id = auth.uid())
      when entity_kind::text in ('playbook', 'precedent')
        then public.can_write_workspace(workspace_id)
      else author_id = auth.uid()
    end);

drop policy if exists "authors delete comments" on public.comments;
create policy "authors delete comments" on public.comments for delete
  using (author_id = auth.uid()
         or case when public.comment_matter(entity_kind::text, entity_id) is not null
                 then public.is_matter_lead(public.comment_matter(entity_kind::text, entity_id))
                 else public.can_admin_workspace(workspace_id) end);

drop policy if exists "members read approvals" on public.approvals;
create policy "members read approvals" on public.approvals for select
  using (
    case
      when public.comment_matter(entity_kind::text, entity_id) is not null
        then public.is_matter_member(public.comment_matter(entity_kind::text, entity_id))
      when entity_kind::text = 'research'
        then coalesce(public.is_research_member(entity_id), requested_by = auth.uid())
      when entity_kind::text in ('playbook', 'precedent')
        then public.is_workspace_member(workspace_id)
      else requested_by = auth.uid()
    end);

drop policy if exists "writers insert approvals" on public.approvals;
create policy "writers insert approvals" on public.approvals for insert
  with check (
    case
      when public.comment_matter(entity_kind::text, entity_id) is not null
        then public.can_review_matter(public.comment_matter(entity_kind::text, entity_id))
      when entity_kind::text = 'research'
        then coalesce(public.can_write_research(entity_id), requested_by = auth.uid())
      when entity_kind::text in ('playbook', 'precedent')
        then public.can_write_workspace(workspace_id)
      else requested_by = auth.uid()
    end);

-- ---------------------------------------------------------------------------
-- 2. The triggers, now that nothing depends on them
-- ---------------------------------------------------------------------------

drop trigger if exists comments_enforce_change on public.comments;
drop trigger if exists comments_inherit_parent on public.comments;
drop trigger if exists comments_validate_mentions on public.comments;
drop trigger if exists approvals_updated_at on public.approvals;

drop function if exists public.enforce_comment_change();
drop function if exists public.inherit_comment_parent();
drop function if exists public.validate_comment_mentions();

-- ---------------------------------------------------------------------------
-- 3. The resolvers
-- ---------------------------------------------------------------------------

drop function if exists public.matters_with_unseen_mentions();
drop function if exists public.mark_mentions_seen(uuid);
drop function if exists public.entity_owner(text, uuid);

-- `comment_matter()` is restored rather than dropped: sixteen policies call it,
-- and dropping it would take them with it.
create or replace function public.comment_matter(_kind text, _id uuid)
returns uuid language plpgsql stable security definer set search_path = public
as $$
begin
  return case _kind
    when 'matter' then _id
    when 'review' then _id
    when 'clause' then public.clause_matter(_id)
    when 'transcript' then public.transcript_matter(_id)
    when 'document' then (select matter_id from public.documents where id = _id)
    when 'corporate' then (select matter_id from public.corporate_documents where id = _id)
    when 'flow' then public.flow_matter(_id)
    when 'research' then (select matter_id from public.research_matters where id = _id)
    when 'draft' then (select matter_id from public.drafts where id = _id)
    when 'contract_draft' then (select matter_id from public.contract_drafts where id = _id)
    when 'task' then (select matter_id from public.tasks where id = _id)
    when 'resolution' then public.resolution_matter(_id)
    when 'flow_phase' then public.phase_matter(_id)
    when 'deliverable' then public.deliverable_matter(_id)
    else null
  end;
end;
$$;

drop function if exists public.finding_research(uuid);

-- ---------------------------------------------------------------------------
-- 4. The grants, back to table level
-- ---------------------------------------------------------------------------
--
-- Column grants are dropped by revoking the whole table and granting it whole
-- again; a column grant left behind would keep the table readable in a way
-- nobody expects to find.

revoke select, update on public.matter_members from authenticated, anon;
grant select, update on public.matter_members to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. The columns
-- ---------------------------------------------------------------------------
--
-- Last, and the only destructive step in the file. Every comment reply, every
-- mention and every edited-at is dropped with them. Nothing else in the
-- rollback loses data.

alter table public.matter_members drop column if exists mentions_seen_at;

alter table public.approvals drop column if exists updated_at;
alter table public.approvals drop column if exists task_id;
alter table public.approvals drop column if exists assigned_to;

drop index if exists public.comments_mentions_idx;
drop index if exists public.comments_parent_idx;
alter table public.comments drop column if exists mentions;
alter table public.comments drop column if exists updated_at;
alter table public.comments drop column if exists parent_id;

-- `kind` goes back to text with the check constraint it had. The enum type is
-- dropped only once no column holds it.
do $$
begin
  if (select udt_name from information_schema.columns
       where table_schema = 'public' and table_name = 'comments' and column_name = 'kind')
     = 'comment_kind' then
    alter table public.comments alter column kind drop default;
    alter table public.comments alter column kind type text using kind::text;
    alter table public.comments alter column kind set default 'note';
    alter table public.comments add constraint comments_kind_check
      check (kind in ('note', 'instruction'));
  end if;
end $$;

drop type if exists public.comment_kind;
