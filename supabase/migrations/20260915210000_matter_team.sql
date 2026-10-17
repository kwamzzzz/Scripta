-- Phase 2: the matter team, and the one rule that holds it together.
--
-- A matter has exactly one Lead. Not as a convention the interface observes,
-- but as something the database will not let go of — because the Lead is what
-- Phase 3 turns into reachability, and a matter that loses its Lead becomes a
-- file nobody can open, discovered weeks later by whoever needed it.
--
-- Three things enforce it:
--
--   a partial unique index, so two Leads cannot exist;
--   a delete guard, so the Lead cannot be removed from the team;
--   an update guard, so the Lead cannot be quietly demoted.
--
-- And one function to move it, because a handover is a deliberate act and
-- should be a single one.

-- ---------------------------------------------------------------------------
-- 1. One Lead
-- ---------------------------------------------------------------------------

create unique index if not exists matter_members_one_lead
  on public.matter_members (matter_id)
  where role = 'lead';

comment on index public.matter_members_one_lead is
  'Exactly one Lead per matter. Co-leads were considered and declined: the Lead is primary responsibility for the file, and responsibility that two people hold is responsibility nobody holds.';

-- ---------------------------------------------------------------------------
-- 2. The Lead cannot be taken off the team
-- ---------------------------------------------------------------------------

/* Tolerant of the matter itself going away: when a matter is purged its team
   goes with it by cascade, and the parent row is already gone by the time this
   runs, which is how the guard tells a purge from a mistake. */
create or replace function public.protect_matter_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role <> 'lead' then
    return old;
  end if;
  if not exists (select 1 from public.matters where id = old.matter_id) then
    return old;
  end if;
  raise exception
    'A matter keeps its Lead. Hand the matter to somebody else before removing %.', old.user_id;
end;
$$;

drop trigger if exists matter_members_protect_lead on public.matter_members;
create trigger matter_members_protect_lead
  before delete on public.matter_members
  for each row execute function public.protect_matter_lead();

-- ---------------------------------------------------------------------------
-- 3. The Lead cannot be demoted except by handing the matter on
-- ---------------------------------------------------------------------------

/* The guard reads a flag that only `set_matter_lead` sets, and `set local`
   means it lasts exactly as long as the transaction that set it. An ordinary
   role change — making an Editor a Reviewer — never touches it; a demotion of
   the Lead from anywhere else raises.

   This is the only clever thing in the file, and it is here because the
   alternative is an invariant that holds only as long as every future caller
   remembers it. */
create or replace function public.protect_lead_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'lead' and new.role <> 'lead'
     and coalesce(current_setting('scripta.handover', true), '') <> '1' then
    raise exception
      'The Lead of a matter changes by handing the matter on, not by changing a role.';
  end if;
  return new;
end;
$$;

drop trigger if exists matter_members_protect_lead_role on public.matter_members;
create trigger matter_members_protect_lead_role
  before update on public.matter_members
  for each row execute function public.protect_lead_role();

-- ---------------------------------------------------------------------------
-- 4. The handover
-- ---------------------------------------------------------------------------

/* Demote, then move `matters.owner_id` and let the Phase 1 seed trigger promote
   the new Lead. Done in that order because the unique index is checked
   immediately: two Leads may not exist even for one statement.

   Who may do this: the current Lead, or an owner/administrator of the firm.
   The administrator case is the one that matters in practice — somebody leaves
   and their files have to go on without them — and it is deliberately a change
   to the matter's record rather than a grant of access to its contents. An
   administrator can hand a file to a colleague without being able to open it. */
create or replace function public.set_matter_lead(p_matter uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
  current_lead uuid;
  new_name text;
begin
  select workspace_id into ws from public.matters where id = p_matter;
  if ws is null then
    raise exception 'That matter could not be found.';
  end if;

  select user_id into current_lead
    from public.matter_members where matter_id = p_matter and role = 'lead';

  if auth.uid() is distinct from current_lead and not public.can_admin_workspace(ws) then
    raise exception 'Only the Lead of this matter, or an administrator, may hand it on.';
  end if;

  if not exists (select 1 from public.matter_members where matter_id = p_matter and user_id = p_user) then
    raise exception 'Add them to the matter team before making them its Lead.';
  end if;

  if p_user = current_lead then
    return;
  end if;

  perform set_config('scripta.handover', '1', true);

  update public.matter_members set role = 'editor'
   where matter_id = p_matter and role = 'lead';

  -- Moves the owner and fires `seed_matter_lead`, which promotes the new Lead.
  update public.matters set owner_id = p_user where id = p_matter;

  perform set_config('scripta.handover', '', true);

  select coalesce(full_name, email) into new_name from public.profiles where id = p_user;

  insert into public.audit_events (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (
    p_matter, auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), 'Someone'),
    'matter.lead_changed', 'matter', p_matter,
    'Handed the matter to ' || coalesce(new_name, 'a colleague'),
    jsonb_build_object('from', current_lead, 'to', p_user)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Adding and removing, with the reasons said out loud
-- ---------------------------------------------------------------------------

create or replace function public.add_matter_member(
  p_matter uuid, p_user uuid, p_role public.matter_role default 'editor')
returns void
language plpgsql
security definer
set search_path = public
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
returns void
language plpgsql
security definer
set search_path = public
as $$
declare ws uuid; who text;
begin
  select workspace_id into ws from public.matters where id = p_matter;
  if ws is null then raise exception 'That matter could not be found.'; end if;
  if not public.can_write_workspace(ws) then
    raise exception 'You do not have permission to change this matter team.';
  end if;

  select coalesce(full_name, email) into who from public.profiles where id = p_user;

  -- Raises through protect_matter_lead if this is the Lead, with its wording.
  delete from public.matter_members where matter_id = p_matter and user_id = p_user;

  insert into public.audit_events (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (p_matter, auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), 'Someone'),
    'matter.member_removed', 'matter', p_matter,
    coalesce(who, 'A colleague') || ' left the matter team',
    jsonb_build_object('user', p_user));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Responsibility points at a person, or at nobody
-- ---------------------------------------------------------------------------

-- `flow_deliverables.owner` has been free text, which is how an em dash came to
-- render as somebody's name. It becomes a real person, and the text column is
-- kept beside it rather than dropped: it holds initials typed months ago that
-- may still be the only record of who was meant to do something.
alter table public.flow_deliverables
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

comment on column public.flow_deliverables.owner_id is
  'Who is responsible for this deliverable: a member of the matter team, or nobody. The older free-text `owner` column is kept for what was typed before this existed.';

create index if not exists flow_deliverables_owner_idx on public.flow_deliverables (owner_id);

-- Changing an ordinary role. Lead is refused here on purpose: it moves through
-- `set_matter_lead`, which is the only place that can leave the matter with
-- exactly one of them.
create or replace function public.set_matter_member_role(
  p_matter uuid, p_user uuid, p_role public.matter_role)
returns void
language plpgsql
security definer
set search_path = public
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
-- 7. The creator's membership dates from the matter, not from the backfill
-- ---------------------------------------------------------------------------

-- Phase 1 wrote every matter's Lead in one pass, so `added_at` on those rows was
-- the day of the migration. The card reads it as "Created the matter · 15
-- September", which for a file opened in August is simply untrue — and a line
-- whose whole job is to save somebody opening the audit trail has to be right.
--
-- A membership that was created with the matter began when the matter did.
update public.matter_members mm
   set added_at = m.created_at
  from public.matters m
 where mm.matter_id = m.id
   and mm.user_id = mm.added_by
   and mm.added_at > m.created_at;
