-- PHASE 3: the confidentiality boundary becomes real.
--
-- One rule: no matter membership, no matter access. Belonging to the firm gets
-- you the letterhead, the knowledge library, the people directory, your own
-- tasks and your own day. It gets you no matter.
--
-- THE NON-DISCLOSURE PROPERTY, which everything below is shaped by: a matter
-- you cannot open must be indistinguishable from a matter that does not exist.
-- Row-level security returns an empty set rather than an error, so the database
-- never has to decide whether to admit something is there — and no policy here
-- widens a read in order to say "this exists but is not yours".
--
-- Read this file alongside its rollback, `20260915220001_matter_boundary_down.sql`,
-- which was written and proved first.
--
-- Nothing here migrates data. No file moves. No identifier changes.
--
-- ---------------------------------------------------------------------------
-- WHAT HAPPENED WHEN THIS RAN, kept because the record should say so
-- ---------------------------------------------------------------------------
--
-- 1. THE FIRST ATTEMPT FAILED, on a wrong assumption in the plan. The Flow
--    children were written as if all six hung off `flow_id`. Four of them —
--    `flow_evidence`, `flow_emails`, `flow_threads`, `flow_versions` — hang off
--    `deliverable_id`. Postgres raised 42703 and rolled the batch back. The
--    chain is matter → flow → deliverable → child, and it is why
--    `is_deliverable_member` and `can_write_deliverable` exist.
--
-- 2. THAT ROLLBACK LEFT AN INTERMEDIATE STATE, briefly, and it was the exact
--    one the cutover was required never to produce. The predicate bodies in
--    section 1 had already committed in an earlier statement, so matter
--    membership was governing the sixteen tables that already called them —
--    while `add_matter_member` still checked `can_write_workspace`. For a few
--    minutes a firm member could, in principle, have added themselves to a
--    matter and walked in.
--
--    Nobody could: the firm had one member, and no second person could sign in.
--    The bypass in section 8 was closed as the very next statement, ahead of
--    the remaining policies, rather than in file order.
--
--    The lesson is in the ordering, not the outcome. A cutover whose parts are
--    applied in sequence has an intermediate state for every failure point in
--    it, and the safe order is to close the bypass FIRST and move the boundary
--    second — never the other way round, which is the order this file reads in.
--    If this is ever re-run against a firm with more than one member, run
--    section 8 before sections 2 to 7.
--
-- 3. ONE PRE-EXISTING HOLE WAS FOUND while auditing the security-definer
--    surface: `purge_recently_deleted`. See section 10.

-- ---------------------------------------------------------------------------
-- 1. The predicates
-- ---------------------------------------------------------------------------

-- Note what is NOT in these bodies: any reference to the workspace. Firm
-- membership stops being sufficient, which is the decision, and it also stops
-- being necessary — so external counsel can later be admitted to one matter
-- without joining the firm. No policy in this file may add that join back.

create or replace function public.is_matter_member(_matter_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.matter_members
     where matter_id = _matter_id and user_id = auth.uid());
$$;

comment on function public.is_matter_member(uuid) is
  'The confidentiality boundary. Deliberately does not consult workspace_members: belonging to the firm is not authorisation on a file, and not belonging to the firm is not a bar to being on one.';

/* The firm role is a ceiling. Somebody admitted to the firm as a viewer is a
   Viewer on every matter whatever the team says — the lower of the two always
   wins. Somebody with no firm role at all has no ceiling, which is what leaves
   room for external collaborators later. */
create or replace function public.can_write_matter(_matter_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.matter_members
     where matter_id = _matter_id and user_id = auth.uid()
       and role in ('lead', 'editor'))
   and not exists (
    select 1 from public.workspace_members wm
     where wm.workspace_id = public.matter_workspace(_matter_id)
       and wm.user_id = auth.uid() and wm.role = 'viewer');
$$;

-- Comments and approvals only: a Reviewer reads the work and says something
-- about it, which is exactly how a partner reads a junior's draft.
create or replace function public.can_review_matter(_matter_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.matter_members
     where matter_id = _matter_id and user_id = auth.uid()
       and role in ('lead', 'editor', 'reviewer'))
   and not exists (
    select 1 from public.workspace_members wm
     where wm.workspace_id = public.matter_workspace(_matter_id)
       and wm.user_id = auth.uid() and wm.role = 'viewer');
$$;

create or replace function public.is_matter_lead(_matter_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.matter_members
     where matter_id = _matter_id and user_id = auth.uid() and role = 'lead');
$$;

-- Flow carries a workspace and no matter, so the whole of it was firm-visible.
-- `matter_flows.matter_id` is not null, so these need no fallback.
create or replace function public.is_flow_member(_flow_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_matter_member(public.flow_matter(_flow_id)); $$;

create or replace function public.can_write_flow(_flow_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.can_write_matter(public.flow_matter(_flow_id)); $$;

-- Evidence, emails, threads and versions hang off the DELIVERABLE, not the
-- flow. Assuming otherwise is what made the first attempt at this migration
-- fail, which is the cheapest place it could have been caught.
create or replace function public.is_deliverable_member(_deliverable_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_matter_member(public.deliverable_matter(_deliverable_id)); $$;

create or replace function public.can_write_deliverable(_deliverable_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.can_write_matter(public.deliverable_matter(_deliverable_id)); $$;

-- Research linked to a matter follows the matter. Research linked to nothing is
-- the firm's own — four rows are — and stays firm-wide.
create or replace function public.is_research_member(_research_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select case
    when r.matter_id is not null then public.is_matter_member(r.matter_id)
    else public.is_workspace_member(r.workspace_id)
  end
  from public.research_matters r where r.id = _research_id;
$$;

create or replace function public.can_write_research(_research_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select case
    when r.matter_id is not null then public.can_write_matter(r.matter_id)
    else public.can_write_workspace(r.workspace_id)
  end
  from public.research_matters r where r.id = _research_id;
$$;

-- One comment table serves every context, so one function says which matter a
-- comment belongs to — and, for firm knowledge, that it belongs to none. A
-- comment on a precedent is firm business; dragging it inside the boundary
-- because the code path is shared would be a bug.
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
    -- playbook, precedent, manual: firm knowledge. Null means "gate on the
    -- workspace", never "deny".
    else null
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Matter and its team
-- ---------------------------------------------------------------------------

drop policy if exists "members read matters" on public.matters;
create policy "members read matters" on public.matters for select to authenticated
  using (public.is_matter_member(id));

-- Creating a matter is a firm act; the Phase 1 trigger writes the creator in as
-- its Lead in the same statement, so nobody creates a file they cannot open.
drop policy if exists "writers insert matters" on public.matters;
create policy "writers insert matters" on public.matters for insert to authenticated
  with check (public.can_write_workspace(workspace_id));

drop policy if exists "writers update matters" on public.matters;
create policy "writers update matters" on public.matters for update to authenticated
  using (public.can_write_matter(id)) with check (public.can_write_matter(id));

drop policy if exists "writers delete matters" on public.matters;
create policy "writers delete matters" on public.matters for delete to authenticated
  using (public.is_matter_lead(id));

-- THE BYPASS, closed at the table as well as in the functions. Without this, a
-- firm member could add themselves to any matter and walk in.
drop policy if exists "members read matter members" on public.matter_members;
create policy "members read matter members" on public.matter_members for select
  using (public.is_matter_member(matter_id));
drop policy if exists "writers insert matter members" on public.matter_members;
create policy "writers insert matter members" on public.matter_members for insert
  with check (public.is_matter_lead(matter_id));
drop policy if exists "writers update matter members" on public.matter_members;
create policy "writers update matter members" on public.matter_members for update
  using (public.is_matter_lead(matter_id));
drop policy if exists "writers delete matter members" on public.matter_members;
create policy "writers delete matter members" on public.matter_members for delete
  using (public.is_matter_lead(matter_id));

-- ---------------------------------------------------------------------------
-- 3. Flow, in full
-- ---------------------------------------------------------------------------

drop policy if exists "members read matter_flows" on public.matter_flows;
create policy "members read matter_flows" on public.matter_flows for select to authenticated
  using (public.is_matter_member(matter_id));
drop policy if exists "writers insert matter_flows" on public.matter_flows;
create policy "writers insert matter_flows" on public.matter_flows for insert to authenticated
  with check (public.can_write_matter(matter_id));
drop policy if exists "writers update matter_flows" on public.matter_flows;
create policy "writers update matter_flows" on public.matter_flows for update to authenticated
  using (public.can_write_matter(matter_id)) with check (public.can_write_matter(matter_id));
drop policy if exists "writers delete matter_flows" on public.matter_flows;
create policy "writers delete matter_flows" on public.matter_flows for delete to authenticated
  using (public.can_write_matter(matter_id));

-- The children reach their matter in two hops or three: phases and
-- deliverables carry `flow_id`; evidence, emails, threads and versions carry
-- `deliverable_id` and get there through the deliverable.
do $$
declare t text;
begin
  foreach t in array array['flow_phases','flow_deliverables'] loop
    execute format('drop policy if exists %I on public.%I', 'members read ' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_flow_member(flow_id))', 'members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'writers insert ' || t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write_flow(flow_id))', 'writers insert ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'writers update ' || t, t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_write_flow(flow_id)) with check (public.can_write_flow(flow_id))', 'writers update ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'writers delete ' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_write_flow(flow_id))', 'writers delete ' || t, t);
  end loop;

  foreach t in array array['flow_evidence','flow_emails','flow_threads','flow_versions'] loop
    execute format('drop policy if exists %I on public.%I', 'members read ' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_deliverable_member(deliverable_id))', 'members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'writers insert ' || t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write_deliverable(deliverable_id))', 'writers insert ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'writers update ' || t, t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_write_deliverable(deliverable_id)) with check (public.can_write_deliverable(deliverable_id))', 'writers update ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'writers delete ' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_write_deliverable(deliverable_id))', 'writers delete ' || t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Tasks, drafting, research: the matter where there is one
-- ---------------------------------------------------------------------------

-- A task filed to a matter follows the matter. A task filed to nothing is
-- personal firm business and stays where it was — closing those too would take
-- away the to-do list of everybody who has not filed anything.
drop policy if exists "members read tasks" on public.tasks;
create policy "members read tasks" on public.tasks for select
  using (case when matter_id is not null then public.is_matter_member(matter_id)
              else public.is_workspace_member(workspace_id) end);
drop policy if exists "writers insert tasks" on public.tasks;
create policy "writers insert tasks" on public.tasks for insert
  with check (case when matter_id is not null then public.can_write_matter(matter_id)
                   else public.can_write_workspace(workspace_id) end);
drop policy if exists "writers update tasks" on public.tasks;
create policy "writers update tasks" on public.tasks for update
  using (case when matter_id is not null then public.can_write_matter(matter_id)
              else public.can_write_workspace(workspace_id) end)
  with check (case when matter_id is not null then public.can_write_matter(matter_id)
                   else public.can_write_workspace(workspace_id) end);
drop policy if exists "writers delete tasks" on public.tasks;
create policy "writers delete tasks" on public.tasks for delete
  using (case when matter_id is not null then public.can_write_matter(matter_id)
              else public.can_write_workspace(workspace_id) end);

-- The same shape for the three drafting tables and research.
do $$
declare
  t text; sel text; ins text; upd text; del text;
begin
  foreach t in array array['contract_drafts','corporate_documents','drafts','research_matters'] loop
    select case t
             when 'contract_drafts' then 'members read contract_drafts'
             when 'corporate_documents' then 'members read corporate documents'
             when 'drafts' then 'members read drafts'
             else 'members read research matters' end,
           case t
             when 'contract_drafts' then 'writers insert contract_drafts'
             when 'corporate_documents' then 'writers insert corporate documents'
             when 'drafts' then 'writers insert drafts'
             else 'writers insert research matters' end,
           case t
             when 'contract_drafts' then 'writers update contract_drafts'
             when 'corporate_documents' then 'writers update corporate documents'
             when 'drafts' then 'writers update drafts'
             else 'writers update research matters' end,
           case t
             when 'contract_drafts' then 'writers delete contract_drafts'
             when 'corporate_documents' then 'writers delete corporate documents'
             when 'drafts' then 'writers delete drafts'
             else 'writers delete research matters' end
      into sel, ins, upd, del;

    execute format('drop policy if exists %I on public.%I', sel, t);
    execute format($f$create policy %I on public.%I for select to authenticated
      using (case when matter_id is not null then public.is_matter_member(matter_id)
                  else public.is_workspace_member(workspace_id) end)$f$, sel, t);
    execute format('drop policy if exists %I on public.%I', ins, t);
    execute format($f$create policy %I on public.%I for insert to authenticated
      with check (case when matter_id is not null then public.can_write_matter(matter_id)
                       else public.can_write_workspace(workspace_id) end)$f$, ins, t);
    execute format('drop policy if exists %I on public.%I', upd, t);
    execute format($f$create policy %I on public.%I for update to authenticated
      using (case when matter_id is not null then public.can_write_matter(matter_id)
                  else public.can_write_workspace(workspace_id) end)
      with check (case when matter_id is not null then public.can_write_matter(matter_id)
                       else public.can_write_workspace(workspace_id) end)$f$, upd, t);
    execute format('drop policy if exists %I on public.%I', del, t);
    execute format($f$create policy %I on public.%I for delete to authenticated
      using (case when matter_id is not null then public.can_write_matter(matter_id)
                  else public.can_write_workspace(workspace_id) end)$f$, del, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Comments and approvals
-- ---------------------------------------------------------------------------

-- Reviewer earns its keep here and nowhere else: it is the one role that may
-- write to these two tables and nothing else in the matter.
drop policy if exists "members read comments" on public.comments;
create policy "members read comments" on public.comments for select
  using (case when public.comment_matter(entity_kind::text, entity_id) is not null
              then public.is_matter_member(public.comment_matter(entity_kind::text, entity_id))
              else public.is_workspace_member(workspace_id) end);
drop policy if exists "writers insert comments" on public.comments;
create policy "writers insert comments" on public.comments for insert
  with check (case when public.comment_matter(entity_kind::text, entity_id) is not null
                   then public.can_review_matter(public.comment_matter(entity_kind::text, entity_id))
                   else public.can_write_workspace(workspace_id) end);

-- The administrative reach this cutover closes: an admin could edit or delete
-- any comment on any matter, including one they cannot read.
drop policy if exists "authors update comments" on public.comments;
create policy "authors update comments" on public.comments for update
  using (author_id = auth.uid()
         or case when public.comment_matter(entity_kind::text, entity_id) is not null
                 then public.is_matter_lead(public.comment_matter(entity_kind::text, entity_id))
                 else public.can_admin_workspace(workspace_id) end)
  with check (case when public.comment_matter(entity_kind::text, entity_id) is not null
                   then public.can_review_matter(public.comment_matter(entity_kind::text, entity_id))
                   else public.can_write_workspace(workspace_id) end);
drop policy if exists "authors delete comments" on public.comments;
create policy "authors delete comments" on public.comments for delete
  using (author_id = auth.uid()
         or case when public.comment_matter(entity_kind::text, entity_id) is not null
                 then public.is_matter_lead(public.comment_matter(entity_kind::text, entity_id))
                 else public.can_admin_workspace(workspace_id) end);

drop policy if exists "members read approvals" on public.approvals;
create policy "members read approvals" on public.approvals for select
  using (case when public.comment_matter(entity_kind::text, entity_id) is not null
              then public.is_matter_member(public.comment_matter(entity_kind::text, entity_id))
              else public.is_workspace_member(workspace_id) end);
drop policy if exists "writers insert approvals" on public.approvals;
create policy "writers insert approvals" on public.approvals for insert
  with check (case when public.comment_matter(entity_kind::text, entity_id) is not null
                   then public.can_review_matter(public.comment_matter(entity_kind::text, entity_id))
                   else public.can_write_workspace(workspace_id) end);

-- Deciding an approval on a matter you cannot read was the sharpest of the
-- three administrative reaches. Now it is a Lead or a Reviewer on that matter.
drop policy if exists "admins decide approvals" on public.approvals;
create policy "admins decide approvals" on public.approvals for update
  using (case when public.comment_matter(entity_kind::text, entity_id) is not null
              then public.can_review_matter(public.comment_matter(entity_kind::text, entity_id))
              else public.can_admin_workspace(workspace_id) end)
  with check (case when public.comment_matter(entity_kind::text, entity_id) is not null
                   then public.can_review_matter(public.comment_matter(entity_kind::text, entity_id))
                   else public.can_admin_workspace(workspace_id) end);
drop policy if exists "admins delete approvals" on public.approvals;
create policy "admins delete approvals" on public.approvals for delete
  using (case when public.comment_matter(entity_kind::text, entity_id) is not null
              then public.is_matter_lead(public.comment_matter(entity_kind::text, entity_id))
              else public.can_admin_workspace(workspace_id) end);

-- ---------------------------------------------------------------------------
-- 6. Links, locks, profiles
-- ---------------------------------------------------------------------------

drop policy if exists "members read links" on public.links;
create policy "members read links" on public.links for select
  using (case when matter_id is not null then public.is_matter_member(matter_id)
              else public.is_workspace_member(workspace_id) end);
drop policy if exists "writers insert links" on public.links;
create policy "writers insert links" on public.links for insert
  with check (case when matter_id is not null then public.can_write_matter(matter_id)
                   else public.can_write_workspace(workspace_id) end);
drop policy if exists "writers delete links" on public.links;
create policy "writers delete links" on public.links for delete
  using (case when matter_id is not null then public.can_write_matter(matter_id)
              else public.can_write_workspace(workspace_id) end);

drop policy if exists "members read locks" on public.edit_locks;
create policy "members read locks" on public.edit_locks for select
  using (case when matter_id is not null then public.is_matter_member(matter_id)
              else user_id = auth.uid() end);

-- One clause more than before: "or we share a matter". Correct today, and
-- necessary the day an external collaborator is on a file with people whose
-- names they have to be able to see.
drop policy if exists "read own profile and co-members" on public.profiles;
create policy "read own profile and co-members" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (select 1 from public.workspace_members m
                where m.user_id = profiles.id and public.is_workspace_member(m.workspace_id))
    or exists (select 1 from public.matter_members mine
                join public.matter_members theirs on theirs.matter_id = mine.matter_id
               where mine.user_id = auth.uid() and theirs.user_id = profiles.id));

-- ---------------------------------------------------------------------------
-- 7. Storage
-- ---------------------------------------------------------------------------

-- Paths are `<workspace>/<matter>/<file>` for matter documents and
-- `<workspace>/letterheads/...` or `<workspace>/research/...` for the firm's
-- own. Phase 1 added `<workspace>/personal/<user>/...` for an attachment on a
-- task filed to nothing. Reading the matter out of segment two is why no file
-- has to move.
create or replace function public.can_read_storage_path(_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare
  parts text[] := storage.foldername(_name);
  ws uuid;
  seg2 text;
begin
  if array_length(parts, 1) is null or array_length(parts, 1) < 2 then
    return false;
  end if;
  begin
    ws := parts[1]::uuid;
  exception when others then
    return false;
  end;
  seg2 := parts[2];
  if seg2 ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return public.is_matter_member(seg2::uuid);
  end if;
  if seg2 = 'personal' then
    return array_length(parts, 1) >= 3 and parts[3] = auth.uid()::text;
  end if;
  -- letterheads, research and anything else firm-level
  return public.is_workspace_member(ws);
end;
$$;

create or replace function public.can_write_storage_path(_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare
  parts text[] := storage.foldername(_name);
  ws uuid;
  seg2 text;
begin
  if array_length(parts, 1) is null or array_length(parts, 1) < 2 then
    return false;
  end if;
  begin
    ws := parts[1]::uuid;
  exception when others then
    return false;
  end;
  seg2 := parts[2];
  if seg2 ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return public.can_write_matter(seg2::uuid);
  end if;
  if seg2 = 'personal' then
    return array_length(parts, 1) >= 3 and parts[3] = auth.uid()::text;
  end if;
  return public.can_write_workspace(ws);
end;
$$;

drop policy if exists "workspace members read matter documents" on storage.objects;
create policy "workspace members read matter documents" on storage.objects for select to authenticated
  using (bucket_id = 'matter-documents' and public.can_read_storage_path(name));
drop policy if exists "workspace writers upload matter documents" on storage.objects;
create policy "workspace writers upload matter documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'matter-documents' and public.can_write_storage_path(name));
drop policy if exists "workspace writers update matter documents" on storage.objects;
create policy "workspace writers update matter documents" on storage.objects for update to authenticated
  using (bucket_id = 'matter-documents' and public.can_write_storage_path(name))
  with check (bucket_id = 'matter-documents' and public.can_write_storage_path(name));
drop policy if exists "workspace writers delete matter documents" on storage.objects;
create policy "workspace writers delete matter documents" on storage.objects for delete to authenticated
  using (bucket_id = 'matter-documents' and public.can_write_storage_path(name));

-- ---------------------------------------------------------------------------
-- 8. Team management becomes Lead-controlled, in the same breath
-- ---------------------------------------------------------------------------

-- These three were written in Phase 2 against `can_write_workspace`, which was
-- harmless while firm membership already granted everything. From the moment
-- the policies above take effect it would be the way round them: add yourself
-- to a matter, gain the matter. They change here, in the same transaction, so
-- no deployed state ever has one without the other.

create or replace function public.add_matter_member(
  p_matter uuid, p_user uuid, p_role public.matter_role default 'editor')
returns void language plpgsql security definer set search_path = public
as $$
declare who text;
begin
  if not public.is_matter_lead(p_matter) then
    raise exception 'Only the Lead of this matter may change its team.';
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
declare who text;
begin
  if not public.is_matter_lead(p_matter) then
    raise exception 'Only the Lead of this matter may change its team.';
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
begin
  if not public.is_matter_lead(p_matter) then
    raise exception 'Only the Lead of this matter may change its team.';
  end if;
  if p_role = 'lead' then
    raise exception 'Use the handover to change who leads a matter.';
  end if;
  update public.matter_members set role = p_role
   where matter_id = p_matter and user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. The administrative register
-- ---------------------------------------------------------------------------

-- A firm has to know what files it holds — for conflicts, for continuity, for
-- knowing what is open — and `matters` is now member-gated, so an administrator
-- querying the table sees nothing.
--
-- Widening a policy to let them see it would leak matter metadata into every
-- ordinary query in the product. So the register is not a table read. It is one
-- function, available to an owner or administrator, returning the agreed
-- metadata and NOTHING ELSE — no clause, no document, no note, no counterparty
-- detail beyond the client name — and it writes an audit line every time it is
-- called. Administrative oversight is a deliberate, logged act rather than an
-- ambient privilege.
--
-- It must not grow. Anything more than this list is a route around the boundary
-- wearing an administrator's coat.
create or replace function public.matter_register(p_workspace uuid)
returns table (
  reference text,
  name text,
  client text,
  lead_name text,
  member_count integer,
  archived boolean,
  binned boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_admin_workspace(p_workspace) then
    raise exception 'The matter register is for an owner or administrator of the firm.';
  end if;

  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (p_workspace, auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), 'An administrator'),
    'workspace.register_viewed', 'workspace', p_workspace,
    'Viewed the matter register', '{}'::jsonb);

  return query
    select m.reference, m.name, m.client,
           coalesce(p.full_name, p.email, 'Unassigned') as lead_name,
           (select count(*)::integer from public.matter_members mm where mm.matter_id = m.id),
           m.archived_at is not null,
           m.deleted_at is not null
      from public.matters m
      left join public.matter_members l on l.matter_id = m.id and l.role = 'lead'
      left join public.profiles p on p.id = l.user_id
     where m.workspace_id = p_workspace
     order by m.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Purge, which was a hole
-- ---------------------------------------------------------------------------

-- `purge_recently_deleted` was SECURITY DEFINER with no authorisation check at
-- all, and its deletes were not scoped to a workspace: any signed-in user could
-- call it and permanently destroy every firm's binned matters, documents,
-- playbooks and precedents. It predates this work; it is fixed here because
-- requirement 4 makes every security-definer function part of this boundary,
-- and this one was the reason that requirement was right.
create or replace function public.purge_recently_deleted()
returns integer language plpgsql security definer set search_path = public
as $$
declare
  t text;
  removed integer := 0;
  n integer;
  ws uuid;
  cut timestamptz := now() - make_interval(days => public.recently_deleted_days());
begin
  for ws in
    select m.workspace_id from public.workspace_members m
     where m.user_id = auth.uid() and m.role in ('owner', 'admin')
  loop
    foreach t in array array[
      'matters', 'documents', 'playbooks', 'templates', 'corporate_documents',
      'research_matters', 'flow_presets', 'flow_preset_families', 'precedents',
      'contract_drafts'
    ] loop
      -- `documents` has no workspace of its own; it reaches one through its
      -- matter, which is also how it is gated everywhere else.
      if t = 'documents' then
        execute 'delete from public.documents d where d.deleted_at is not null and d.deleted_at < $1'
              || ' and exists (select 1 from public.matters m where m.id = d.matter_id and m.workspace_id = $2)'
          using cut, ws;
      else
        execute format('delete from public.%I where deleted_at is not null and deleted_at < $1 and workspace_id = $2', t)
          using cut, ws;
      end if;
      get diagnostics n = row_count;
      removed := removed + n;
    end loop;
  end loop;
  return removed;
end;
$$;

comment on function public.purge_recently_deleted() is
  'Empties the bin, for the caller''s own firms only, and only if they own or administer them. Was previously callable by anyone and scoped to nothing.';
