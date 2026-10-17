-- Phase 1 of the collaboration plan: the foundation, and nothing else.
--
-- Every statement in this file is ADDITIVE. No existing policy is rewritten, no
-- predicate body is replaced, and nobody's access changes by one row. That is
-- the whole point of the phase.
--
-- The reason is the revert. Phase 3 rewrites roughly two dozen policies to move
-- the confidentiality boundary from the firm to the matter, and a migration
-- that both adds tables and rewrites policies cannot be rolled back cleanly
-- under pressure. So every table, column, enum and resolver that Phase 3 will
-- need is created here, where it changes nothing and can be reverted at
-- leisure, leaving Phase 3 to be a migration that swaps predicates and can be
-- undone in a single statement.
--
-- Read the RLS on the new tables with that in mind: it deliberately reproduces
-- today's rule — anyone in the firm — rather than the rule we are heading for.
-- Writing the stricter policy now would be a behaviour change smuggled into a
-- phase that promised not to make one, and it would be untested, since the
-- suite that proves the boundary is written against Phase 3.

-- ---------------------------------------------------------------------------
-- 1. Matter membership
-- ---------------------------------------------------------------------------

-- Four roles. The database will eventually distinguish three things among them
-- (member, writer, reviewer) but the role a person holds is a professional
-- fact, not a permission bitmask, so it is stored as what it is.
do $$ begin
  create type public.matter_role as enum ('lead', 'editor', 'reviewer', 'viewer');
exception when duplicate_object then null;
end $$;

create table if not exists public.matter_members (
  matter_id uuid not null references public.matters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.matter_role not null default 'editor',
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  -- Stamped when the row came from adding a whole team (Phase 7), so a Lead can
  -- later remove that group together. A label on the grant, never a route to
  -- it: no policy may ever read this column.
  added_via_team uuid,
  primary key (matter_id, user_id)
);

comment on table public.matter_members is
  'Who is authorised on a matter, and in what role. From Phase 3 this is the confidentiality boundary: no row here, no access to the matter or anything beneath it. Deliberately does not reference workspace_members, so that an external collaborator can later be admitted to one matter without joining the firm.';

comment on column public.matter_members.added_via_team is
  'The team this membership came from, if it came from one. For grouped removal only. No policy reads this: team membership never grants matter access by itself.';

create index if not exists matter_members_user_idx on public.matter_members (user_id);

alter table public.matter_members enable row level security;

-- PHASE 1 POLICY, NOT THE DESTINATION. This reproduces today's visibility so
-- that adding the table changes nothing. Phase 3 replaces all four with
-- membership-based rules and Lead-only writes.
drop policy if exists "members read matter members" on public.matter_members;
create policy "members read matter members" on public.matter_members
  for select using (public.is_workspace_member(public.matter_workspace(matter_id)));

drop policy if exists "writers insert matter members" on public.matter_members;
create policy "writers insert matter members" on public.matter_members
  for insert with check (public.can_write_workspace(public.matter_workspace(matter_id)));

drop policy if exists "writers update matter members" on public.matter_members;
create policy "writers update matter members" on public.matter_members
  for update using (public.can_write_workspace(public.matter_workspace(matter_id)));

drop policy if exists "writers delete matter members" on public.matter_members;
create policy "writers delete matter members" on public.matter_members
  for delete using (public.can_write_workspace(public.matter_workspace(matter_id)));

-- A matter with no members is unreachable by everybody the moment Phase 3
-- lands, including the person who made it. So a Lead is written in the same
-- breath as the matter, and again if the matter is ever handed on.
create or replace function public.seed_matter_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_id uuid;
begin
  lead_id := coalesce(new.owner_id, auth.uid());
  if lead_id is null then
    return new;
  end if;
  insert into public.matter_members (matter_id, user_id, role, added_by)
  values (new.id, lead_id, 'lead', coalesce(auth.uid(), lead_id))
  on conflict (matter_id, user_id) do update set role = 'lead';
  return new;
end;
$$;

drop trigger if exists matters_seed_lead on public.matters;
create trigger matters_seed_lead
  after insert or update of owner_id on public.matters
  for each row execute function public.seed_matter_lead();

-- ---------------------------------------------------------------------------
-- 2. Resolvers Phase 3 will gate on
-- ---------------------------------------------------------------------------

-- The six flow tables carry a workspace and no matter, so the whole of Flow is
-- currently firm-visible and the matter predicate does not reach it. This is
-- the hop Phase 3 needs.
create or replace function public.flow_matter(_flow_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select matter_id from public.matter_flows where id = _flow_id;
$$;

create or replace function public.deliverable_matter(_deliverable_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.flow_matter(flow_id) from public.flow_deliverables where id = _deliverable_id;
$$;

create or replace function public.phase_matter(_phase_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.flow_matter(flow_id) from public.flow_phases where id = _phase_id;
$$;

-- One comment table serves every context in the product, so one function has to
-- say which matter a comment belongs to — and, for the knowledge assets, that
-- it belongs to none. A precedent's comment is firm business; dragging it into
-- the matter boundary because the code path is shared would be a bug.
create or replace function public.comment_matter(_kind text, _id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
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
    -- playbook, precedent, template, preset: firm knowledge, no matter. Null is
    -- the answer, and Phase 3 must read it as "gate on the workspace", never as
    -- "deny".
    else null
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Columns Phase 3 needs in place
-- ---------------------------------------------------------------------------

-- `links` is the one table in the cascade with no way to say which matter it
-- belongs to, so it cannot be gated at all until it has one.
alter table public.links add column if not exists matter_id uuid references public.matters(id) on delete cascade;
create index if not exists links_matter_idx on public.links (matter_id);

comment on column public.links.matter_id is
  'The matter this link belongs to, where it belongs to one. Added in Phase 1 so Phase 3 has something to gate on; links created before this are workspace-scoped and stay so.';

-- Who finished it, not just that it was finished. In a firm of one these are
-- the same fact; from the first second person they are not, and the Daily Work
-- Report is personal to its author, so it needs to know.
alter table public.tasks add column if not exists completed_by uuid references public.profiles(id) on delete set null;

comment on column public.tasks.completed_by is
  'The person who marked this complete. The Daily Work Report reads it to stay personal: a report is a statement about your own day, not a view of a colleague''s.';

-- Set in the database rather than only in the client, because a completion that
-- records the wrong author is worse than one that records none, and every path
-- that closes a task must be covered — not only the ones we remember.
create or replace function public.stamp_task_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.completed_at is not null and new.completed_by is null then
      new.completed_by := auth.uid();
    end if;
    return new;
  end if;
  if new.completed_at is not null and old.completed_at is null and new.completed_by is null then
    new.completed_by := auth.uid();
  end if;
  -- Reopening a task takes the name off it. A task that is not finished has
  -- nobody who finished it, and leaving the old name behind would put the work
  -- back into that person's day the next time it closed.
  if new.completed_at is null then
    new.completed_by := null;
  end if;
  return new;
end;
$$;

-- Insert as well as update: nothing creates a task already complete today, but
-- the column is only trustworthy if no path can write around it.
drop trigger if exists tasks_stamp_completion on public.tasks;
create trigger tasks_stamp_completion
  before insert or update on public.tasks
  for each row execute function public.stamp_task_completion();

-- ---------------------------------------------------------------------------
-- 4. Edit locks
-- ---------------------------------------------------------------------------

-- Held on a clause, not a document. Scripta's drafts are already one row per
-- clause with the numbering, parts and semantics stored beside the text rather
-- than inside it, so two lawyers can work the same agreement at once provided
-- they are in different clauses. A lock refused out loud beats a merge done
-- quietly.
--
-- Advisory: it exists to prevent silent collision, not to enforce anything. It
-- expires on its own so a closed laptop never shuts anybody out.
create table if not exists public.edit_locks (
  entity_kind text not null,
  entity_id uuid not null,
  matter_id uuid references public.matters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 minutes',
  primary key (entity_kind, entity_id)
);

comment on table public.edit_locks is
  'Advisory soft locks, held at the clause. Prevents two lawyers silently overwriting one another; never prevents reading. Expires by itself. Used from Phase 5.';

create index if not exists edit_locks_matter_idx on public.edit_locks (matter_id);

alter table public.edit_locks enable row level security;

-- Phase 1 policy: today's rule. Phase 3 narrows to matter membership.
drop policy if exists "members read locks" on public.edit_locks;
create policy "members read locks" on public.edit_locks
  for select using (
    matter_id is null or public.is_workspace_member(public.matter_workspace(matter_id))
  );

drop policy if exists "holders take locks" on public.edit_locks;
create policy "holders take locks" on public.edit_locks
  for insert with check (user_id = auth.uid());

drop policy if exists "holders refresh locks" on public.edit_locks;
create policy "holders refresh locks" on public.edit_locks
  for update using (user_id = auth.uid() or expires_at < now());

drop policy if exists "holders release locks" on public.edit_locks;
create policy "holders release locks" on public.edit_locks
  for delete using (user_id = auth.uid() or expires_at < now());

-- ---------------------------------------------------------------------------
-- 5. Invitations
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.invite_status as enum ('pending', 'accepted', 'revoked', 'expired', 'superseded');
exception when duplicate_object then null;
end $$;

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'lawyer',
  -- Held open for external matter collaborators. Phase 1 only ever writes
  -- 'workspace' and no interface offers the other, but the column exists now so
  -- that admitting counsel to a single matter later needs no migration.
  scope text not null default 'workspace',
  matter_id uuid references public.matters(id) on delete cascade,
  matter_role public.matter_role,
  token text not null unique,
  status public.invite_status not null default 'pending',
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  constraint workspace_invites_scope_check check (
    (scope = 'workspace' and matter_id is null)
    or (scope = 'matter' and matter_id is not null)
  )
);

comment on table public.workspace_invites is
  'The invitation lifecycle: invited, pending, accepted, with revoke, expiry and supersede as the three side exits. An address is invited, not an account, so the same person can be invited before they have ever signed in.';

comment on column public.workspace_invites.scope is
  'workspace (Phase 1, the only value written) or matter (external collaborators, later). Present from the start so the table needs no migration when that arrives.';

create index if not exists workspace_invites_workspace_idx on public.workspace_invites (workspace_id, status);

-- One live invitation per address per workspace. A resend updates the row it
-- already has; a second invitation supersedes the first rather than being
-- refused, which is why this is partial rather than a plain unique constraint.
create unique index if not exists workspace_invites_live_unique
  on public.workspace_invites (workspace_id, lower(email))
  where status = 'pending';

alter table public.workspace_invites enable row level security;

-- Managing who joins the firm is administration, and stays administration after
-- Phase 3: it has nothing to do with matter content.
drop policy if exists "admins read invites" on public.workspace_invites;
create policy "admins read invites" on public.workspace_invites
  for select using (public.can_admin_workspace(workspace_id));

drop policy if exists "admins create invites" on public.workspace_invites;
create policy "admins create invites" on public.workspace_invites
  for insert with check (public.can_admin_workspace(workspace_id));

drop policy if exists "admins update invites" on public.workspace_invites;
create policy "admins update invites" on public.workspace_invites
  for update using (public.can_admin_workspace(workspace_id));

drop policy if exists "admins delete invites" on public.workspace_invites;
create policy "admins delete invites" on public.workspace_invites
  for delete using (public.can_admin_workspace(workspace_id));

-- Accepting is one statement or none.
--
-- A half-accepted invitation — membership created, invite left pending; or
-- invite closed, membership never written — is the kind of state that produces
-- a person who cannot sign in and an administrator who cannot see why. So the
-- whole of it happens inside one function, and the function is the only way in.
--
-- Bound to the address, not only the token: a link that leaks admits nobody but
-- the person it was written for.
create or replace function public.accept_workspace_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.workspace_invites;
  caller_email text;
begin
  if auth.uid() is null then
    raise exception 'Sign in before accepting an invitation.';
  end if;

  select email into caller_email from public.profiles where id = auth.uid();

  select * into inv from public.workspace_invites
   where token = p_token
   for update;

  if inv.id is null then
    raise exception 'That invitation could not be found.';
  end if;

  if inv.status <> 'pending' then
    raise exception 'That invitation is no longer open (%).', inv.status;
  end if;

  if inv.expires_at < now() then
    update public.workspace_invites set status = 'expired' where id = inv.id;
    raise exception 'That invitation has expired. Ask for a new one.';
  end if;

  if lower(coalesce(caller_email, '')) <> lower(inv.email) then
    raise exception 'That invitation was sent to a different address.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, auth.uid(), inv.role)
  on conflict (workspace_id, user_id) do nothing;

  -- Held open for scope = 'matter'. No interface writes such an invite in
  -- Phase 1, so this branch is unreachable today and correct when it is not.
  if inv.scope = 'matter' and inv.matter_id is not null then
    insert into public.matter_members (matter_id, user_id, role, added_by)
    values (inv.matter_id, auth.uid(), coalesce(inv.matter_role, 'viewer'), inv.invited_by)
    on conflict (matter_id, user_id) do nothing;
  end if;

  update public.workspace_invites
     set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
   where id = inv.id;

  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (
    inv.workspace_id, auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), caller_email, 'A new member'),
    'workspace.invite_accepted', 'workspace_invite', inv.id,
    'Joined the firm as ' || inv.role::text,
    jsonb_build_object('invite_id', inv.id, 'scope', inv.scope)
  );

  return inv.workspace_id;
end;
$$;

-- The one thing an invited person may read before they are a member: whether
-- the link they were sent is any good. Returns no token and no workspace id.
create or replace function public.peek_workspace_invite(p_token text)
returns table (workspace_name text, invited_role text, status text, expires_at timestamptz, email text)
language sql
stable
security definer
set search_path = public
as $$
  select w.name, i.role::text,
         case when i.status = 'pending' and i.expires_at < now() then 'expired' else i.status::text end,
         i.expires_at, i.email
    from public.workspace_invites i
    join public.workspaces w on w.id = i.workspace_id
   where i.token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- 6. Backfills
-- ---------------------------------------------------------------------------

-- Every matter gets its Lead. Binned matters included, deliberately: a restore
-- that hands back a file nobody can open is worse than no restore.
--
-- WHY TWO MEMBERSHIPS HAVE A LEAD NOBODY CHOSE. Two matters carried no
-- `owner_id` at all, both of them already binned:
--
--     144242f6  Trading Management Agreement (MKA x SKA)   MKA-SKA-010626
--     81340643  Consultancy Matter                         (no reference)
--
-- `coalesce(m.owner_id, w.owner_id)` gives those two the firm's owner. This was
-- put to Kwame and accepted on 15 September 2026, so it is a decision rather
-- than a default that happened to fire, and it is recorded here because the two
-- rows it produced are the only memberships in the table that nobody created by
-- hand and nobody would be able to explain later.
--
-- The alternative was to skip them, and the alternative is worse: an ownerless
-- matter gets no Lead, and a matter with no Lead is one that Phase 3 locks
-- everybody out of permanently — including whoever restores it from the bin
-- expecting to find their file. If either matter is ever restored and belongs
-- to somebody else, reassigning it is one change of Lead.
insert into public.matter_members (matter_id, user_id, role, added_by)
select m.id, coalesce(m.owner_id, w.owner_id), 'lead', coalesce(m.owner_id, w.owner_id)
  from public.matters m
  join public.workspaces w on w.id = m.workspace_id
 where coalesce(m.owner_id, w.owner_id) is not null
on conflict (matter_id, user_id) do nothing;

-- The assertion that makes the lock-out risk impossible rather than unlikely.
-- If any matter would be left unreachable, the whole migration fails here and
-- nothing is committed.
do $$
declare
  orphans integer;
begin
  select count(*) into orphans
    from public.matters m
   where not exists (
     select 1 from public.matter_members mm
      where mm.matter_id = m.id and mm.role = 'lead');
  if orphans > 0 then
    raise exception
      'Refusing to continue: % matter(s) would have no Lead and would be unreachable after Phase 3.', orphans;
  end if;
end $$;

-- NO AUDIT BACKFILL. The plan called for one and it turned out to be wrong.
--
-- The audit reported that all 222 audit_events carried a null workspace_id and
-- concluded the history could not be scoped to a firm. That read the schema
-- backwards. There is a check constraint on the table:
--
--     check (num_nonnulls(matter_id, workspace_id) = 1)
--
-- An event has exactly ONE subject. A matter event is attributed to its matter
-- and its workspace_id is null because filling it is forbidden; a firm event is
-- attributed to the workspace and its matter_id is null. 208 rows are
-- matter-scoped, 14 are workspace-scoped, and nothing is unattributed. Writing
-- the backfill this file originally contained raised 23514 and rolled the whole
-- migration back, which is how the constraint was found.
--
-- So the work is already done, and it was done better than the plan assumed:
-- Phase 3 gates matter-scoped audit rows on the matter and firm-scoped rows on
-- the workspace, exactly as intended, with no migration at all.
--
-- The assertion below states the property the plan actually wanted, so that a
-- future row breaking it is caught here rather than in Phase 3.
do $$
declare
  unattributed integer;
begin
  select count(*) into unattributed
    from public.audit_events
   where num_nonnulls(matter_id, workspace_id) <> 1;
  if unattributed > 0 then
    raise exception 'audit_events has % row(s) with no single subject.', unattributed;
  end if;
end $$;

-- Completed tasks predate the column. Every workspace has had exactly one
-- member for the whole of its life, so the person who completed them is not in
-- doubt — but it is an inference, and inferring an author is exactly the thing
-- this column exists to stop, so it is written from membership rather than
-- assumed by the reader.
update public.tasks t
   set completed_by = wm.user_id
  from public.workspace_members wm
 where t.completed_at is not null
   and t.completed_by is null
   and wm.workspace_id = t.workspace_id
   and (select count(*) from public.workspace_members x where x.workspace_id = t.workspace_id) = 1;

-- ---------------------------------------------------------------------------
-- 7. Managing invitations
-- ---------------------------------------------------------------------------

-- Creating an invitation is two writes — close the old one, open the new — and
-- two writes from a browser are one dropped connection away from an address
-- that has been superseded and never reinvited. So it happens here, once.
--
-- These run as definer and therefore bypass RLS, which means each has to check
-- the caller itself. Inviting people is administration and stays administration
-- after Phase 3: it has nothing to do with the contents of any matter.

create or replace function public.new_invite_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function public.create_workspace_invite(
  p_workspace uuid, p_email text, p_role public.app_role default 'lawyer')
returns public.workspace_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  addr text := lower(btrim(p_email));
  row public.workspace_invites;
begin
  if not public.can_admin_workspace(p_workspace) then
    raise exception 'Only an owner or administrator may invite someone to this firm.';
  end if;
  if addr = '' or addr not like '%_@_%.__%' then
    raise exception 'That does not look like an email address.';
  end if;
  if exists (select 1 from public.workspace_members m
              join public.profiles pr on pr.id = m.user_id
             where m.workspace_id = p_workspace and lower(pr.email) = addr) then
    raise exception 'That person is already a member of this firm.';
  end if;

  -- Superseded, not rejected. Inviting the same person twice is a thing people
  -- do when they think the first one went astray, and refusing it would be
  -- pedantry; the older row is closed so the history still reads correctly.
  update public.workspace_invites
     set status = 'superseded'
   where workspace_id = p_workspace and lower(email) = addr and status = 'pending';

  insert into public.workspace_invites (workspace_id, email, role, token, invited_by)
  values (p_workspace, addr, p_role, public.new_invite_token(), auth.uid())
  returning * into row;

  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (p_workspace, auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), 'An administrator'),
    'workspace.invite_created', 'workspace_invite', row.id,
    'Invited ' || addr || ' as ' || p_role::text,
    jsonb_build_object('email', addr, 'role', p_role::text));

  return row;
end;
$$;

-- A resend reissues the token and pushes the expiry on the row that already
-- exists. It does not create a second invitation, which is what stops a list of
-- pending invites turning into a list of the same person five times.
create or replace function public.resend_workspace_invite(p_id uuid)
returns public.workspace_invites
language plpgsql
security definer
set search_path = public
as $$
declare row public.workspace_invites;
begin
  select * into row from public.workspace_invites where id = p_id;
  if row.id is null then raise exception 'That invitation could not be found.'; end if;
  if not public.can_admin_workspace(row.workspace_id) then
    raise exception 'Only an owner or administrator may resend an invitation.';
  end if;
  if row.status = 'accepted' then
    raise exception 'That invitation has already been accepted.';
  end if;
  update public.workspace_invites
     set token = public.new_invite_token(),
         status = 'pending',
         expires_at = now() + interval '14 days'
   where id = p_id
  returning * into row;
  return row;
end;
$$;

create or replace function public.revoke_workspace_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare ws uuid; addr text;
begin
  select workspace_id, email into ws, addr from public.workspace_invites where id = p_id;
  if ws is null then raise exception 'That invitation could not be found.'; end if;
  if not public.can_admin_workspace(ws) then
    raise exception 'Only an owner or administrator may cancel an invitation.';
  end if;
  update public.workspace_invites set status = 'revoked' where id = p_id and status = 'pending';
  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (ws, auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), 'An administrator'),
    'workspace.invite_revoked', 'workspace_invite', p_id,
    'Cancelled the invitation to ' || addr, jsonb_build_object('email', addr));
end;
$$;
