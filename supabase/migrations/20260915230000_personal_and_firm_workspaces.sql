-- A personal workspace stops pretending to be a firm.
--
-- Found during the Phase 3 acceptance test, and it is a foundation correction
-- rather than a new phase: `workspace_kind` has existed as an enum
-- ('personal','firm') since the schema was written, and nothing read it. One
-- policy consulted it, to stop a personal workspace being deleted. Everything
-- else — members, invitations, matters, knowledge, letterheads — behaved
-- identically in both. So the Settings screen offered "Invite someone" on a
-- personal workspace under the heading "Your firm, the people in it, and its
-- paper", and an invitation was created into one.
--
-- The model, now made real:
--
--   PERSONAL  one user, created automatically at signup, never has a second
--             member, cannot issue an invitation, is not a firm.
--   FIRM      an organisation: owner/admin/lawyer, invitations, shared matters
--             and matter teams, firm knowledge and paper.
--
-- A person has their personal workspace and belongs to zero or more firms.
--
-- WHAT THIS DOES NOT TOUCH: the Phase 3 matter boundary. Firm membership still
-- grants no matter access whatsoever. Firm membership says you belong to the
-- organisation; matter membership says you are authorised on the file. This
-- correction is entirely above that line.

-- ---------------------------------------------------------------------------
-- 1. A personal workspace cannot gain a second member
-- ---------------------------------------------------------------------------

-- Enforced in the database, not by hiding a button. The invitation function
-- below refuses too, but a guard that only exists in the caller is not a guard:
-- this is the one that holds however the row is written.
create or replace function public.protect_personal_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
begin
  select kind, owner_id into w from public.workspaces where id = new.workspace_id;
  if w.kind = 'personal' and new.user_id is distinct from w.owner_id then
    raise exception
      'A personal workspace belongs to one person. Create a firm workspace to work with colleagues.';
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_members_personal_guard on public.workspace_members;
create trigger workspace_members_personal_guard
  before insert or update on public.workspace_members
  for each row execute function public.protect_personal_workspace();

-- ---------------------------------------------------------------------------
-- 2. A personal workspace cannot issue an invitation
-- ---------------------------------------------------------------------------

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
  k public.workspace_kind;
begin
  select kind into k from public.workspaces where id = p_workspace;
  if k is null then
    raise exception 'That workspace could not be found.';
  end if;
  if k = 'personal' then
    raise exception
      'A personal workspace is for one person. Create a firm workspace to invite colleagues.';
  end if;
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

-- Defence in depth: an invitation created before this correction, or by any
-- future path, still cannot be used to join a personal workspace.
create or replace function public.accept_workspace_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.workspace_invites;
  caller_email text;
  k public.workspace_kind;
begin
  if auth.uid() is null then
    raise exception 'Sign in before accepting an invitation.';
  end if;
  select email into caller_email from public.profiles where id = auth.uid();
  select * into inv from public.workspace_invites where token = p_token for update;
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

  select kind into k from public.workspaces where id = inv.workspace_id;
  if k = 'personal' then
    update public.workspace_invites set status = 'revoked' where id = inv.id;
    raise exception 'That invitation is no longer valid.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, auth.uid(), inv.role)
  on conflict (workspace_id, user_id) do nothing;

  if inv.scope = 'matter' and inv.matter_id is not null then
    insert into public.matter_members (matter_id, user_id, role, added_by)
    values (inv.matter_id, auth.uid(), coalesce(inv.matter_role, 'viewer'), inv.invited_by)
    on conflict (matter_id, user_id) do nothing;
  end if;

  update public.workspace_invites
     set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
   where id = inv.id;

  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (inv.workspace_id, auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), caller_email, 'A new member'),
    'workspace.invite_accepted', 'workspace_invite', inv.id,
    'Joined the firm as ' || inv.role::text,
    jsonb_build_object('invite_id', inv.id, 'scope', inv.scope));

  return inv.workspace_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Creating a firm
-- ---------------------------------------------------------------------------

-- There was no path to this at all: the INSERT policy permitted it and nothing
-- called it. A firm is a name and an owner; everything else it grows later.
create or replace function public.create_firm_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := btrim(p_name);
  ws uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  if clean = '' then
    raise exception 'A firm needs a name.';
  end if;

  insert into public.workspaces (name, kind, owner_id)
  values (clean, 'firm', auth.uid())
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, auth.uid(), 'owner');

  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (ws, auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), 'Someone'),
    'workspace.firm_created', 'workspace', ws,
    'Created the firm ' || clean, jsonb_build_object('name', clean));

  return ws;
end;
$$;

-- Renaming a firm. Display only: the workspace keeps its id, and with it every
-- matter, reference, storage path, membership and permission. A firm called
-- something else yesterday is the same firm.
create or replace function public.rename_workspace(p_workspace uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := btrim(p_name);
  old_name text;
  k public.workspace_kind;
begin
  select name, kind into old_name, k from public.workspaces where id = p_workspace;
  if old_name is null then raise exception 'That workspace could not be found.'; end if;
  if not public.can_admin_workspace(p_workspace) then
    raise exception 'Only an owner or administrator may rename this workspace.';
  end if;
  -- A personal workspace is shown as "Personal" whatever it is called, so
  -- renaming one would change nothing a person could see.
  if k = 'personal' then
    raise exception 'A personal workspace is always called Personal.';
  end if;
  if clean = '' then raise exception 'A firm needs a name.'; end if;
  if clean = old_name then return old_name; end if;

  update public.workspaces set name = clean where id = p_workspace;

  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (p_workspace, auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), 'An administrator'),
    'workspace.renamed', 'workspace', p_workspace,
    'Renamed the firm from ' || old_name || ' to ' || clean,
    jsonb_build_object('from', old_name, 'to', clean));

  return clean;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. An invitation addressed to you should be findable
-- ---------------------------------------------------------------------------

-- `workspace_invites` is readable only by an administrator of the firm that
-- sent it, which is right — and it meant the only way to accept was to be
-- holding the token URL. This returns the invitations addressed to the caller's
-- own address and nothing else: no token for other people, no listing of a
-- firm's other invitations.
create or replace function public.my_pending_invites()
returns table (token text, firm_name text, invited_role text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.token, w.name, i.role::text, i.expires_at
    from public.workspace_invites i
    join public.workspaces w on w.id = i.workspace_id
    join public.profiles p on lower(p.email) = lower(i.email)
   where p.id = auth.uid()
     and i.status = 'pending'
     and i.expires_at > now()
     and w.kind = 'firm'
   order by i.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 5. The conversion
-- ---------------------------------------------------------------------------

-- The workspace holding all ten matters has substantively been the firm from
-- the first day; only its type said otherwise. Converting in place keeps its
-- id, and therefore every matter, reference, storage path, audit row and Phase
-- 3 membership exactly as it is. Nothing moves.
--
-- The name was `mawusi kwame`, which is a person. Kwame chose `Nexis Africa`;
-- it is not guessed here.
update public.workspaces
   set kind = 'firm', name = 'Nexis Africa'
 where id = 'd832b081-cf82-4dc0-a5b9-b0241fe50d9b'
   and kind = 'personal';

-- The pending invitation was issued while this workspace was still typed
-- personal. It is closed rather than carried over: a fresh one is created from
-- the firm through the ordinary interface.
update public.workspace_invites
   set status = 'revoked'
 where workspace_id = 'd832b081-cf82-4dc0-a5b9-b0241fe50d9b'
   and status = 'pending';

-- Converting took away the owner's personal workspace, because it was the same
-- row. Give it back through the ordinary bootstrap, which is idempotent and is
-- the same path every new account takes.
select public.bootstrap_user(
  p.id, p.email, coalesce(p.full_name, split_part(p.email, '@', 1)), p.avatar_url)
from public.profiles p
where p.id = '6df711b6-27b0-4aaf-8129-ef39700de7bb';

-- ---------------------------------------------------------------------------
-- 6. Assertions
-- ---------------------------------------------------------------------------

do $$
declare
  n integer;
begin
  select count(*) into n from public.matters
   where workspace_id = 'd832b081-cf82-4dc0-a5b9-b0241fe50d9b';
  if n <> 10 then
    raise exception 'The converted workspace should still hold 10 matters, found %.', n;
  end if;

  select count(*) into n from public.workspaces
   where id = 'd832b081-cf82-4dc0-a5b9-b0241fe50d9b' and kind = 'firm' and name = 'Nexis Africa';
  if n <> 1 then
    raise exception 'The firm workspace was not converted.';
  end if;

  select count(*) into n from public.workspaces
   where owner_id = '6df711b6-27b0-4aaf-8129-ef39700de7bb' and kind = 'personal';
  if n <> 1 then
    raise exception 'The owner should have exactly one personal workspace, found %.', n;
  end if;

  select count(*) into n from public.matters m
    join public.workspaces w on w.id = m.workspace_id
   where w.kind = 'personal';
  if n <> 0 then
    raise exception 'No matter should have been left in a personal workspace, found %.', n;
  end if;
end $$;
