-- PHASE 3 ROLLBACK. Written and tested before the cutover ran, not after it broke.
--
-- Running this file returns the firm to the rule it had before the boundary
-- moved: anybody in the workspace can see anything in it. That is today's
-- behaviour, and it is safe precisely because the only people in the firm are
-- the ones who chose to be there.
--
-- What it restores: four predicate bodies to their passthrough form, every
-- policy this cutover rewrote, the three team-management functions, the storage
-- rule and `purge_recently_deleted`. What it drops: the predicates and the
-- register that only exist for the boundary.
--
-- What it does NOT touch, deliberately: `matter_members` and every row in it.
-- Phase 2's team card, the pickers and the Lead invariants keep working exactly
-- as they do now — the table simply stops being consulted for access. Nothing
-- is migrated, no file moves, no identifier changes.
--
-- WHEN TO RUN IT: anything you could open yesterday and cannot today, or
-- anything a colleague can open that they should not. Either is a revert rather
-- than a patch — a confidentiality boundary that is half right is worse than
-- one that is off, because people trust it.

-- ---------------------------------------------------------------------------
-- 1. Predicates, back to passthroughs
-- ---------------------------------------------------------------------------

-- The body formatting matters here and only here. Written exactly like this,
-- `pg_get_functiondef` returns a string byte-identical to the pre-cutover
-- definition, so the rollback can be fingerprinted rather than merely trusted.
create or replace function public.is_matter_member(_matter_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_workspace_member(public.matter_workspace(_matter_id));
$$;

create or replace function public.can_write_matter(_matter_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.can_write_workspace(public.matter_workspace(_matter_id));
$$;

create or replace function public.is_research_member(_research_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_workspace_member(public.research_workspace(_research_id));
$$;

create or replace function public.can_write_research(_research_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.can_write_workspace(public.research_workspace(_research_id));
$$;

-- ---------------------------------------------------------------------------
-- 2. Policies, back to firm-gated
-- ---------------------------------------------------------------------------

-- matters
drop policy if exists "members read matters" on public.matters;
create policy "members read matters" on public.matters for select to authenticated
  using (is_workspace_member(workspace_id));
drop policy if exists "writers insert matters" on public.matters;
create policy "writers insert matters" on public.matters for insert to authenticated
  with check (can_write_workspace(workspace_id));
drop policy if exists "writers update matters" on public.matters;
create policy "writers update matters" on public.matters for update to authenticated
  using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
drop policy if exists "writers delete matters" on public.matters;
create policy "writers delete matters" on public.matters for delete to authenticated
  using (can_write_workspace(workspace_id));

-- matter_members
drop policy if exists "members read matter members" on public.matter_members;
create policy "members read matter members" on public.matter_members for select
  using (is_workspace_member(matter_workspace(matter_id)));
drop policy if exists "writers insert matter members" on public.matter_members;
create policy "writers insert matter members" on public.matter_members for insert
  with check (can_write_workspace(matter_workspace(matter_id)));
drop policy if exists "writers update matter members" on public.matter_members;
create policy "writers update matter members" on public.matter_members for update
  using (can_write_workspace(matter_workspace(matter_id)));
drop policy if exists "writers delete matter members" on public.matter_members;
create policy "writers delete matter members" on public.matter_members for delete
  using (can_write_workspace(matter_workspace(matter_id)));

-- Flow: seven tables, the same four policies each.
do $$
declare t text;
begin
  foreach t in array array['matter_flows','flow_phases','flow_deliverables','flow_evidence',
                           'flow_emails','flow_threads','flow_versions'] loop
    execute format('drop policy if exists %I on public.%I', 'members read ' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (is_workspace_member(workspace_id))', 'members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'writers insert ' || t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (can_write_workspace(workspace_id))', 'writers insert ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'writers update ' || t, t);
    execute format('create policy %I on public.%I for update to authenticated using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id))', 'writers update ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'writers delete ' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (can_write_workspace(workspace_id))', 'writers delete ' || t, t);
  end loop;
end $$;

-- The three Flow tables whose policies were named differently from their table.
drop policy if exists "members read flow_deliverables" on public.flow_deliverables;
create policy "members read flow_deliverables" on public.flow_deliverables for select to authenticated
  using (is_workspace_member(workspace_id));

-- tasks
drop policy if exists "members read tasks" on public.tasks;
create policy "members read tasks" on public.tasks for select
  using (is_workspace_member(workspace_id));
drop policy if exists "writers insert tasks" on public.tasks;
create policy "writers insert tasks" on public.tasks for insert
  with check (can_write_workspace(workspace_id));
drop policy if exists "writers update tasks" on public.tasks;
create policy "writers update tasks" on public.tasks for update
  using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
drop policy if exists "writers delete tasks" on public.tasks;
create policy "writers delete tasks" on public.tasks for delete
  using (can_write_workspace(workspace_id));

-- Drafting: contract_drafts, corporate_documents, drafts
drop policy if exists "members read contract_drafts" on public.contract_drafts;
create policy "members read contract_drafts" on public.contract_drafts for select to authenticated
  using (is_workspace_member(workspace_id));
drop policy if exists "writers insert contract_drafts" on public.contract_drafts;
create policy "writers insert contract_drafts" on public.contract_drafts for insert to authenticated
  with check (can_write_workspace(workspace_id));
drop policy if exists "writers update contract_drafts" on public.contract_drafts;
create policy "writers update contract_drafts" on public.contract_drafts for update to authenticated
  using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
drop policy if exists "writers delete contract_drafts" on public.contract_drafts;
create policy "writers delete contract_drafts" on public.contract_drafts for delete to authenticated
  using (can_write_workspace(workspace_id));

drop policy if exists "members read corporate documents" on public.corporate_documents;
create policy "members read corporate documents" on public.corporate_documents for select to authenticated
  using (is_workspace_member(workspace_id));
drop policy if exists "writers insert corporate documents" on public.corporate_documents;
create policy "writers insert corporate documents" on public.corporate_documents for insert to authenticated
  with check (can_write_workspace(workspace_id));
drop policy if exists "writers update corporate documents" on public.corporate_documents;
create policy "writers update corporate documents" on public.corporate_documents for update to authenticated
  using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
drop policy if exists "writers delete corporate documents" on public.corporate_documents;
create policy "writers delete corporate documents" on public.corporate_documents for delete to authenticated
  using (can_write_workspace(workspace_id));

drop policy if exists "members read drafts" on public.drafts;
create policy "members read drafts" on public.drafts for select to authenticated
  using (is_workspace_member(workspace_id));
drop policy if exists "writers insert drafts" on public.drafts;
create policy "writers insert drafts" on public.drafts for insert to authenticated
  with check (can_write_workspace(workspace_id));
drop policy if exists "writers update drafts" on public.drafts;
create policy "writers update drafts" on public.drafts for update to authenticated
  using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
drop policy if exists "writers delete drafts" on public.drafts;
create policy "writers delete drafts" on public.drafts for delete to authenticated
  using (can_write_workspace(workspace_id));

-- research_matters
drop policy if exists "members read research matters" on public.research_matters;
create policy "members read research matters" on public.research_matters for select to authenticated
  using (is_workspace_member(workspace_id));
drop policy if exists "writers insert research matters" on public.research_matters;
create policy "writers insert research matters" on public.research_matters for insert to authenticated
  with check (can_write_workspace(workspace_id));
drop policy if exists "writers update research matters" on public.research_matters;
create policy "writers update research matters" on public.research_matters for update to authenticated
  using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
drop policy if exists "writers delete research matters" on public.research_matters;
create policy "writers delete research matters" on public.research_matters for delete to authenticated
  using (can_write_workspace(workspace_id));

-- comments and approvals, including the administrative reach this cutover closed
drop policy if exists "members read comments" on public.comments;
create policy "members read comments" on public.comments for select
  using (is_workspace_member(workspace_id));
drop policy if exists "writers insert comments" on public.comments;
create policy "writers insert comments" on public.comments for insert
  with check (can_write_workspace(workspace_id));
drop policy if exists "authors update comments" on public.comments;
create policy "authors update comments" on public.comments for update
  using ((author_id = auth.uid()) or can_admin_workspace(workspace_id))
  with check (can_write_workspace(workspace_id));
drop policy if exists "authors delete comments" on public.comments;
create policy "authors delete comments" on public.comments for delete
  using ((author_id = auth.uid()) or can_admin_workspace(workspace_id));

drop policy if exists "members read approvals" on public.approvals;
create policy "members read approvals" on public.approvals for select
  using (is_workspace_member(workspace_id));
drop policy if exists "writers insert approvals" on public.approvals;
create policy "writers insert approvals" on public.approvals for insert
  with check (can_write_workspace(workspace_id));
drop policy if exists "admins decide approvals" on public.approvals;
create policy "admins decide approvals" on public.approvals for update
  using (can_admin_workspace(workspace_id)) with check (can_admin_workspace(workspace_id));
drop policy if exists "admins delete approvals" on public.approvals;
create policy "admins delete approvals" on public.approvals for delete
  using (can_admin_workspace(workspace_id));

-- links and edit locks
drop policy if exists "members read links" on public.links;
create policy "members read links" on public.links for select
  using (is_workspace_member(workspace_id));
drop policy if exists "writers insert links" on public.links;
create policy "writers insert links" on public.links for insert
  with check (can_write_workspace(workspace_id));
drop policy if exists "writers delete links" on public.links;
create policy "writers delete links" on public.links for delete
  using (can_write_workspace(workspace_id));

drop policy if exists "members read locks" on public.edit_locks;
create policy "members read locks" on public.edit_locks for select
  using ((matter_id is null) or is_workspace_member(matter_workspace(matter_id)));

-- profiles: back to co-members of a workspace only
drop policy if exists "read own profile and co-members" on public.profiles;
create policy "read own profile and co-members" on public.profiles for select to authenticated
  using ((id = auth.uid()) or (exists (
    select 1 from public.workspace_members m
     where m.user_id = profiles.id and is_workspace_member(m.workspace_id))));

-- storage: back to the workspace folder
drop policy if exists "workspace members read matter documents" on storage.objects;
create policy "workspace members read matter documents" on storage.objects for select to authenticated
  using ((bucket_id = 'matter-documents') and is_workspace_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "workspace writers upload matter documents" on storage.objects;
create policy "workspace writers upload matter documents" on storage.objects for insert to authenticated
  with check ((bucket_id = 'matter-documents') and can_write_workspace(((storage.foldername(name))[1])::uuid));
drop policy if exists "workspace writers update matter documents" on storage.objects;
create policy "workspace writers update matter documents" on storage.objects for update to authenticated
  using ((bucket_id = 'matter-documents') and can_write_workspace(((storage.foldername(name))[1])::uuid))
  with check ((bucket_id = 'matter-documents') and can_write_workspace(((storage.foldername(name))[1])::uuid));
drop policy if exists "workspace writers delete matter documents" on storage.objects;
create policy "workspace writers delete matter documents" on storage.objects for delete to authenticated
  using ((bucket_id = 'matter-documents') and can_write_workspace(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------------
-- 3. Team management, back to any firm writer
-- ---------------------------------------------------------------------------

create or replace function public.add_matter_member(
  p_matter uuid, p_user uuid, p_role public.matter_role default 'editor')
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid; who text;
begin
  select workspace_id into ws from public.matters where id = p_matter;
  if ws is null then raise exception 'That matter could not be found.'; end if;
  if not public.can_write_workspace(ws) then
    raise exception 'You do not have permission to change this matter team.';
  end if;
  if p_role = 'lead' then
    raise exception 'A matter has one Lead. Add them first, then hand the matter on.';
  end if;
  insert into public.matter_members (matter_id, user_id, role, added_by)
  values (p_matter, p_user, p_role, auth.uid())
  on conflict (matter_id, user_id) do nothing;
  select coalesce(full_name, email) into who from public.profiles where id = p_user;
  insert into public.audit_events (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (p_matter, auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), 'Someone'),
    'matter.member_added', 'matter', p_matter,
    coalesce(who, 'A colleague') || ' joined the matter team as ' || p_role::text,
    jsonb_build_object('user', p_user, 'role', p_role::text));
end;
$$;

create or replace function public.remove_matter_member(p_matter uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid; who text;
begin
  select workspace_id into ws from public.matters where id = p_matter;
  if ws is null then raise exception 'That matter could not be found.'; end if;
  if not public.can_write_workspace(ws) then
    raise exception 'You do not have permission to change this matter team.';
  end if;
  select coalesce(full_name, email) into who from public.profiles where id = p_user;
  delete from public.matter_members where matter_id = p_matter and user_id = p_user;
  insert into public.audit_events (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (p_matter, auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), 'Someone'),
    'matter.member_removed', 'matter', p_matter,
    coalesce(who, 'A colleague') || ' left the matter team',
    jsonb_build_object('user', p_user));
end;
$$;

create or replace function public.set_matter_member_role(
  p_matter uuid, p_user uuid, p_role public.matter_role)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  select workspace_id into ws from public.matters where id = p_matter;
  if ws is null then raise exception 'That matter could not be found.'; end if;
  if not public.can_write_workspace(ws) then
    raise exception 'You do not have permission to change this matter team.';
  end if;
  if p_role = 'lead' then
    raise exception 'Use the handover to change who leads a matter.';
  end if;
  update public.matter_members set role = p_role
   where matter_id = p_matter and user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Purge, back as it was
-- ---------------------------------------------------------------------------

create or replace function public.purge_recently_deleted()
returns integer language plpgsql security definer set search_path = public
as $$
declare
  t text;
  removed integer := 0;
  n integer;
  cut timestamptz := now() - make_interval(days => public.recently_deleted_days());
begin
  foreach t in array array[
    'matters', 'documents', 'playbooks', 'templates', 'corporate_documents',
    'research_matters', 'flow_presets', 'flow_preset_families', 'precedents',
    'contract_drafts'
  ] loop
    execute format('delete from public.%I where deleted_at is not null and deleted_at < $1', t)
      using cut;
    get diagnostics n = row_count;
    removed := removed + n;
  end loop;
  return removed;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Drop what only the boundary needed
-- ---------------------------------------------------------------------------

-- comment_matter's Phase 1 body, so the restore is exact rather than merely
-- equivalent. The new cases are harmless once nothing calls them, but a
-- rollback that leaves a function subtly different is a rollback you cannot
-- fingerprint, and one you cannot fingerprint is one you have not tested.
create or replace function public.comment_matter(_kind text, _id uuid)
returns uuid language plpgsql stable security definer set search_path = public
as $$
begin
  return case _kind
    when 'matter' then _id
    when 'clause' then public.clause_matter(_id)
    when 'document' then (select matter_id from public.documents where id = _id)
    when 'draft' then (select matter_id from public.drafts where id = _id)
    when 'contract_draft' then (select matter_id from public.contract_drafts where id = _id)
    when 'corporate_document' then (select matter_id from public.corporate_documents where id = _id)
    when 'task' then (select matter_id from public.tasks where id = _id)
    when 'transcript' then public.transcript_matter(_id)
    when 'resolution' then (select matter_id from public.resolutions where id = _id)
    when 'flow' then public.flow_matter(_id)
    when 'flow_phase' then public.phase_matter(_id)
    when 'deliverable' then public.deliverable_matter(_id)
    when 'research' then (select matter_id from public.research_matters where id = _id)
    else null
  end;
end;
$$;

drop function if exists public.can_review_matter(uuid);
drop function if exists public.is_matter_lead(uuid);
drop function if exists public.is_flow_member(uuid);
drop function if exists public.can_write_flow(uuid);
drop function if exists public.is_deliverable_member(uuid);
drop function if exists public.can_write_deliverable(uuid);
drop function if exists public.can_read_storage_path(text);
drop function if exists public.can_write_storage_path(text);
drop function if exists public.matter_register(uuid);
