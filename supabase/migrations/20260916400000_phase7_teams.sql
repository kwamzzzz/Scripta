-- PHASE 7, STEP 1: Teams.
--
-- ---------------------------------------------------------------------------
-- A TEAM IS AN ADDRESSING MECHANISM, NOT A SECURITY BOUNDARY
-- ---------------------------------------------------------------------------
--
-- This is the whole of Phase 7 and every decision below is made to keep it
-- true. Phases 3 to 6 established where confidentiality lives:
--
--   a matter is governed by `matter_members`, and by nothing else;
--   knowledge is governed by its own visibility, and by nothing else.
--
-- Teams do not join that list. A Team is a saved list of colleagues that makes
-- selecting people faster. Nothing reads a Team to decide whether somebody may
-- open a matter, and the suite asserts that directly rather than trusting this
-- paragraph.
--
-- ---------------------------------------------------------------------------
-- THE ONE DISTINCTION THAT MAKES THIS WORK
-- ---------------------------------------------------------------------------
--
--   MATTER STAFFING THROUGH A TEAM IS A SNAPSHOT.
--   KNOWLEDGE SHARED WITH A TEAM IS DYNAMIC.
--
-- They differ because the two things mean different sentences.
--
-- "Staff this matter with the Transactions team" means the people who are in
-- it now. It is an act of staffing, performed once, and it resolves into
-- ordinary `matter_members` rows that the matter's own rules then govern. If
-- somebody joins Transactions next month they have not been staffed on
-- anything, and a matter that quietly acquired a new reader because an
-- unrelated list changed would be a second confidentiality boundary wearing a
-- disguise.
--
-- "Share this precedent with the Transactions team" means whoever is in
-- Transactions. It is an ongoing statement about a group, not an act performed
-- on individuals, and the person who joins next month is exactly who it was
-- meant for.
--
-- So the first copies, and the second looks.

-- ---------------------------------------------------------------------------
-- 1. The tables
-- ---------------------------------------------------------------------------

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

-- Two live teams called "Transactions" in one firm is a selector nobody can
-- use. Archived ones are allowed to collide: they are history, not choices.
create unique index if not exists teams_one_live_name
  on public.teams (workspace_id, lower(btrim(name))) where archived_at is null;

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_members_user_idx on public.team_members (user_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Provenance on a matter member, which is NOT permission
-- ---------------------------------------------------------------------------
--
-- Useful to know that somebody was staffed through a Team. Never consulted by
-- any policy: their access comes from the `matter_members` row itself, exactly
-- as it does for anybody added by hand.
--
-- ON DELETE SET NULL, deliberately. A matter's staffing must not depend on a
-- Team continuing to exist — deleting an organisational list is not a reason
-- for a lawyer to lose a file.

-- The constraint is added separately rather than inline. `ADD COLUMN IF NOT
-- EXISTS ... REFERENCES` left the column without its foreign key when this
-- first ran, and a provenance reference that does not tidy itself up leaves a
-- dangling team id behind after a delete. Harmless to security — nothing reads
-- this column — but "matter access must never depend on a team still existing"
-- is only honest if the reference behaves.
alter table public.matter_members
  add column if not exists added_via_team uuid;
alter table public.matter_members
  drop constraint if exists matter_members_added_via_team_fkey;
alter table public.matter_members
  add constraint matter_members_added_via_team_fkey
  foreign key (added_via_team) references public.teams(id) on delete set null;

comment on column public.matter_members.added_via_team is
  'Which Team was used to staff this person, if any. Provenance only — no policy reads it, and it is set null if the Team is deleted, because matter access must never depend on a Team still existing.';

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------

create or replace function public.team_workspace(_team uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select workspace_id from public.teams where id = _team; $$;

create or replace function public.is_team_member(_team uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.team_members m
                  where m.team_id = _team and m.user_id = auth.uid());
$$;

-- The teams this caller is actually in, live only. Archived teams address
-- nobody: they are kept for history and stop functioning as a target.
create or replace function public.my_team_ids()
returns setof uuid language sql stable security definer set search_path = public
as $$
  select m.team_id from public.team_members m
    join public.teams t on t.id = m.team_id
   where m.user_id = auth.uid() and t.archived_at is null;
$$;

comment on function public.my_team_ids() is
  'The live teams the caller belongs to. Archived teams are excluded: an archived team stops addressing anybody, which is what makes archiving meaningful for dynamic knowledge sharing.';

-- ---------------------------------------------------------------------------
-- 4. Teams belong to firms, and contain that firm's people
-- ---------------------------------------------------------------------------
--
-- A personal workspace has one member, cannot be joined and cannot be invited
-- to. A Team in one would be an administration surface that can never contain
-- a second person, so it is refused at the database rather than merely hidden.

create or replace function public.guard_team_workspace()
returns trigger language plpgsql security definer set search_path = public
as $$
declare kind text;
begin
  select w.kind into kind from public.workspaces w where w.id = new.workspace_id;
  if kind is distinct from 'firm' then
    raise exception 'Teams belong to a firm workspace. A personal workspace has one person in it.'
      using errcode = '42501';
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists teams_guard_workspace on public.teams;
create trigger teams_guard_workspace before insert or update on public.teams
  for each row execute function public.guard_team_workspace();

-- A Team may only contain members of its own firm. Checked here rather than in
-- the policy because the policy governs who may ADD, and this governs who may
-- BE added — two different questions that would otherwise share one answer.
create or replace function public.guard_team_member()
returns trigger language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  ws := public.team_workspace(new.team_id);
  if ws is null then
    raise exception 'That team does not exist.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = ws and m.user_id = new.user_id) then
    raise exception 'A team can only contain people who are in the firm.' using errcode = '42501';
  end if;
  new.added_by := coalesce(new.added_by, auth.uid());
  return new;
end;
$$;

drop trigger if exists team_members_guard on public.team_members;
create trigger team_members_guard before insert or update on public.team_members
  for each row execute function public.guard_team_member();

-- Leaving the firm leaves its teams. Without this a removed colleague would
-- keep team-derived knowledge access through a membership nobody can see any
-- more — the dangling membership §14 forbids.
create or replace function public.drop_team_memberships_on_leave()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  delete from public.team_members tm
   using public.teams t
   where tm.team_id = t.id
     and t.workspace_id = old.workspace_id
     and tm.user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists workspace_members_drop_teams on public.workspace_members;
create trigger workspace_members_drop_teams after delete on public.workspace_members
  for each row execute function public.drop_team_memberships_on_leave();

-- ---------------------------------------------------------------------------
-- 5. Who sees teams, and who changes them
-- ---------------------------------------------------------------------------
--
-- Firm members may know which teams exist and who is in them. That is
-- organisational information — the firm's own shape — and hiding it would make
-- the selector useless without protecting anything.
--
-- What a team must never reveal is which matters its people are on. There is
-- no "team → matters" relation here and none is added: the only link runs the
-- other way, as provenance on a matter member, readable only by people who can
-- already read that matter.

create policy "firm members see teams" on public.teams for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "admins create teams" on public.teams for insert to authenticated
  with check (public.can_admin_workspace(workspace_id));
create policy "admins change teams" on public.teams for update to authenticated
  using (public.can_admin_workspace(workspace_id))
  with check (public.can_admin_workspace(workspace_id));
create policy "admins delete teams" on public.teams for delete to authenticated
  using (public.can_admin_workspace(workspace_id));

create policy "firm members see team members" on public.team_members for select to authenticated
  using (public.is_workspace_member(public.team_workspace(team_id)));
create policy "admins add team members" on public.team_members for insert to authenticated
  with check (public.can_admin_workspace(public.team_workspace(team_id)));
create policy "admins remove team members" on public.team_members for delete to authenticated
  using (public.can_admin_workspace(public.team_workspace(team_id)));
