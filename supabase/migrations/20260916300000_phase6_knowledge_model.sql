-- PHASE 6, STEP 1: knowledge gets a visibility of its own.
--
-- ---------------------------------------------------------------------------
-- MATTER ACCESS AND KNOWLEDGE ACCESS ARE DIFFERENT THINGS
-- ---------------------------------------------------------------------------
--
-- Phase 3 recorded that playbooks, precedents and templates were firm-shared:
-- every SELECT policy on them reads `is_workspace_member(workspace_id)` and
-- nothing else. That was never a decision about knowledge, it was the absence
-- of one — the same simplification Phase 3 removed from matters.
--
-- Phase 6 replaces it. Belonging to the firm stops being permission in itself,
-- except where a knowledge object has deliberately been made firm-wide.
--
-- ---------------------------------------------------------------------------
-- VISIBILITY AND APPROVAL ARE TWO COLUMNS, NOT ONE STATUS
-- ---------------------------------------------------------------------------
--
-- The lawyer sees four states. The database keeps two facts, because they
-- answer different questions and drift apart if they share a column:
--
--   visibility   who may use this
--   approval     whether the firm stands behind this wording
--
--   Private                    private
--   Shared                     shared
--   Firm-wide                  firm, unapproved or stale
--   Approved firm knowledge    firm, approved and current
--
-- MAKING SOMETHING AVAILABLE TO THE FIRM DOES NOT MAKE IT APPROVED. That is
-- the invariant this split exists to protect, and one overloaded status column
-- is precisely how it would be lost.
--
-- ---------------------------------------------------------------------------
-- WHAT MAKES AN APPROVAL STALE
-- ---------------------------------------------------------------------------
--
-- `approved_at >= content_changed_at`, and nothing else.
--
-- BOTH SIDES USE clock_timestamp(), NOT now(). `now()` is the transaction
-- timestamp and does not advance within one, so an approval and a later
-- amendment in the same transaction carried the identical instant, `>=` held,
-- and the approval survived the wording changing — the one thing this rule
-- exists to prevent. Each RPC is its own transaction in production, so it
-- would have looked correct right up until something batched two calls.
-- Phase 4 learned this on mention markers; the suite caught it here.
--
-- No digests, no version table, no publishing workflow. A trigger moves
-- `content_changed_at` when the SUBSTANCE moves and leaves it alone for
-- metadata, so renaming a precedent or adding a sector keeps the approval and
-- rewriting the clause does not. A playbook's substance is its rules and a
-- template's substance is its sections, so those children bump their parent.
--
-- An approval that applied to earlier wording must never silently survive the
-- wording changing. This is the cheapest honest way to say so.

create type public.knowledge_visibility as enum ('private', 'shared', 'firm');

-- ---------------------------------------------------------------------------
-- 1. The columns, on the three knowledge types
-- ---------------------------------------------------------------------------
--
-- Added to each table rather than gathered into one `knowledge_objects`
-- registry. A registry would be a second identity for every object and a
-- second place for its access rules to live, which is the parallel permission
-- system this phase is told not to build.

do $$
declare t text;
begin
  foreach t in array array['playbooks', 'precedents', 'templates'] loop
    execute format($f$
      alter table public.%I
        add column if not exists visibility public.knowledge_visibility not null default 'firm',
        add column if not exists content_changed_at timestamptz,
        add column if not exists approved_at timestamptz,
        add column if not exists approved_by uuid references auth.users(id) on delete set null
    $f$, t);
  end loop;
end $$;

-- `playbooks` is the only one without a creator column at all.
alter table public.playbooks
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists playbooks_visibility_idx on public.playbooks (workspace_id, visibility);
create index if not exists precedents_visibility_idx on public.precedents (workspace_id, visibility);
create index if not exists templates_visibility_idx on public.templates (workspace_id, visibility);

-- ---------------------------------------------------------------------------
-- 2. Sharing: one table, and the seam Phase 7 extends
-- ---------------------------------------------------------------------------
--
-- `subject_type` is the whole of the Phase 7 seam. Today it is 'user'. Adding
-- teams means adding one value and one branch in `knowledge_visible()`; three
-- typed tables would mean doing that three times and keeping them agreeing.
--
-- No teams, no groups, no membership are built here.

create table if not exists public.knowledge_shares (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('playbook', 'precedent', 'template')),
  object_id uuid not null,
  -- 'user' today. 'team' in Phase 7, and nothing else changes shape.
  subject_type text not null default 'user' check (subject_type in ('user', 'team')),
  subject_id uuid not null,
  -- Denormalised so a policy is a column comparison, the same shape
  -- clause_revisions uses. Stamped by trigger, never sent.
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shared_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kind, object_id, subject_type, subject_id)
);

create index if not exists knowledge_shares_subject_idx
  on public.knowledge_shares (subject_type, subject_id);
create index if not exists knowledge_shares_object_idx
  on public.knowledge_shares (kind, object_id);

alter table public.knowledge_shares enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Where a knowledge object lives, and who owns it
-- ---------------------------------------------------------------------------

create or replace function public.knowledge_workspace(_kind text, _id uuid)
returns uuid language sql stable security definer set search_path = public
as $$
  select case _kind
    when 'playbook'  then (select workspace_id from public.playbooks  where id = _id)
    when 'precedent' then (select workspace_id from public.precedents where id = _id)
    when 'template'  then (select workspace_id from public.templates  where id = _id)
  end;
$$;

create or replace function public.knowledge_owner(_kind text, _id uuid)
returns uuid language sql stable security definer set search_path = public
as $$
  select case _kind
    when 'playbook'  then (select coalesce(owner_id, created_by) from public.playbooks  where id = _id)
    when 'precedent' then (select coalesce(owner_id, created_by) from public.precedents where id = _id)
    when 'template'  then (select coalesce(owner_id, created_by) from public.templates  where id = _id)
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4. THE ACCESS RULE
-- ---------------------------------------------------------------------------
--
-- One function, used by every knowledge policy, so there is one place where
-- "may this lawyer use this" is decided and no chance of three tables
-- disagreeing.
--
-- Workspace membership is a PRECONDITION for all three states, not a grant for
-- any of them. Somebody who has left the firm reads none of its knowledge,
-- including knowledge they own — the object lives in the firm's workspace and
-- §14 says approved institutional knowledge belongs to the firm even though
-- its authorship stays attributable.
--
-- Unknown visibility is not reachable (the enum has three values) but the CASE
-- still ends in `false`. Unknown fails closed.

create or replace function public.knowledge_visible(
  _workspace uuid, _visibility public.knowledge_visibility, _owner uuid, _kind text, _id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_workspace_member(_workspace)
     and case _visibility
           when 'firm' then true
           when 'private' then _owner is not null and _owner = auth.uid()
           when 'shared' then
             (_owner is not null and _owner = auth.uid())
             or exists (select 1 from public.knowledge_shares s
                         where s.kind = _kind and s.object_id = _id
                           and s.subject_type = 'user' and s.subject_id = auth.uid())
           else false
         end;
$$;

comment on function public.knowledge_visible(uuid, public.knowledge_visibility, uuid, text, uuid) is
  'Whether the caller may use one knowledge object. Firm membership is a precondition for every state and a grant for none except firm-wide. Unknown visibility fails closed.';

-- Whether the caller may change it. Owning private work is enough; otherwise
-- the workspace write rule applies, and playbooks keep their admin rule.
create or replace function public.can_write_knowledge(_kind text, _id uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare ws uuid; owner uuid;
begin
  ws := public.knowledge_workspace(_kind, _id);
  if ws is null then return false; end if;
  owner := public.knowledge_owner(_kind, _id);
  if owner is not null and owner = auth.uid() and public.is_workspace_member(ws) then
    return true;
  end if;
  if _kind = 'playbook' then return public.can_admin_workspace(ws); end if;
  return public.can_write_workspace(ws);
end;
$$;

-- APPROVAL AUTHORITY. Owner or admin of the workspace, and nothing wider.
--
-- Derived from what is already there rather than invented: playbooks and their
-- rules have always been admin-governed, and a `lawyer` who may write firm
-- knowledge is not thereby a person who may declare it authoritative. Editing
-- and approving are different acts, which is the same distinction Phase 5 drew
-- between writing a clause and settling somebody else's wording.
create or replace function public.can_approve_knowledge(_kind text, _id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.can_admin_workspace(public.knowledge_workspace(_kind, _id)); $$;

-- ---------------------------------------------------------------------------
-- 5. Substance moving, and approval going stale with it
-- ---------------------------------------------------------------------------

create or replace function public.stamp_knowledge_content()
returns trigger language plpgsql set search_path = public
as $$
declare moved boolean := false;
begin
  if tg_op = 'INSERT' then
    new.content_changed_at := coalesce(new.content_changed_at, clock_timestamp());
    return new;
  end if;

  -- What counts as substance, per type. Everything absent from these lists is
  -- metadata: a description, a sector, a jurisdiction note, an archive flag.
  -- Changing those keeps an approval, which is the point of listing them.
  if tg_table_name = 'precedents' then
    moved := new.title is distinct from old.title
          or new.body is distinct from old.body
          or new.kind is distinct from old.kind
          or new.clause_type is distinct from old.clause_type;
  elsif tg_table_name = 'templates' then
    moved := new.name is distinct from old.name
          or new.doc_type is distinct from old.doc_type;
  elsif tg_table_name = 'playbooks' then
    moved := new.name is distinct from old.name
          or new.version_label is distinct from old.version_label;
  end if;

  if moved then new.content_changed_at := clock_timestamp(); end if;
  return new;
end;
$$;

-- A playbook's substance is its rules and a template's substance is its
-- sections, so the child moves the parent. Without this, rewriting every rule
-- in an approved playbook would leave the approval standing.
create or replace function public.bump_knowledge_parent()
returns trigger language plpgsql security definer set search_path = public
as $$
declare parent uuid;
begin
  if tg_table_name = 'playbook_rules' then
    parent := coalesce(new.playbook_id, old.playbook_id);
    update public.playbooks set content_changed_at = clock_timestamp() where id = parent;
  elsif tg_table_name = 'template_sections' then
    parent := coalesce(new.template_id, old.template_id);
    update public.templates set content_changed_at = clock_timestamp() where id = parent;
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['playbooks', 'precedents', 'templates'] loop
    execute format('drop trigger if exists %I_knowledge_content on public.%I', t, t);
    execute format($f$create trigger %I_knowledge_content before insert or update on public.%I
                      for each row execute function public.stamp_knowledge_content()$f$, t, t);
  end loop;
  foreach t in array array['playbook_rules', 'template_sections'] loop
    execute format('drop trigger if exists %I_bump_parent on public.%I', t, t);
    execute format($f$create trigger %I_bump_parent after insert or update or delete on public.%I
                      for each row execute function public.bump_knowledge_parent()$f$, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Approval is live, or it is not
-- ---------------------------------------------------------------------------

create or replace function public.knowledge_approved(
  _approved_at timestamptz, _content_changed_at timestamptz)
returns boolean language sql immutable
as $$
  select _approved_at is not null
     and _approved_at >= coalesce(_content_changed_at, '-infinity'::timestamptz);
$$;

comment on function public.knowledge_approved(timestamptz, timestamptz) is
  'Whether an approval still applies to the wording it was given for. An amendment moves content_changed_at past approved_at and the approval stops counting — it is never deleted, so the record of who approved what, and when, survives.';

-- `precedents.approved` predates this phase and is read by the drafting and
-- review server functions to label a precedent. It becomes a mirror of live
-- approval, maintained here, so those consumers keep working and the client
-- stops being able to set it. See step 2 for the revoke that enforces that.
create or replace function public.mirror_precedent_approved()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.approved := public.knowledge_approved(new.approved_at, new.content_changed_at);
  return new;
end;
$$;

drop trigger if exists precedents_mirror_approved on public.precedents;
create trigger precedents_mirror_approved before insert or update on public.precedents
  for each row execute function public.mirror_precedent_approved();

-- ---------------------------------------------------------------------------
-- 7. Existing knowledge: firm-wide, and unapproved
-- ---------------------------------------------------------------------------
--
-- The conservative migration, and deliberately so on both halves.
--
-- FIRM-WIDE, because these rows have been readable by the whole workspace for
-- their entire life and making them private would delete a library out from
-- under the people using it.
--
-- UNAPPROVED, because nothing here was ever approved by anybody. There is one
-- precedent with `status = 'executed'` and `approved = true`, set by the client
-- at capture time with no approver and no date. Carrying that forward would
-- manufacture institutional approval out of a boolean nobody checked.
--
-- Creator information is preserved where it exists and is NOT invented where it
-- does not. It does not exist on any live precedent or template.

update public.playbooks
   set visibility = 'firm',
       content_changed_at = coalesce(content_changed_at, updated_at, created_at),
       approved_at = null, approved_by = null;

update public.templates
   set visibility = 'firm',
       content_changed_at = coalesce(content_changed_at, updated_at, created_at),
       approved_at = null, approved_by = null;

update public.precedents
   set visibility = 'firm',
       content_changed_at = coalesce(content_changed_at, updated_at, created_at),
       approved_at = null, approved_by = null;

do $$
declare bad integer;
begin
  select count(*) into bad from (
    select 1 from public.playbooks where visibility is null or content_changed_at is null
    union all select 1 from public.precedents where visibility is null or content_changed_at is null
    union all select 1 from public.templates where visibility is null or content_changed_at is null
  ) x;
  if bad > 0 then
    raise exception 'Refusing to finish: % knowledge rows were not migrated.', bad;
  end if;

  select count(*) into bad from public.precedents where approved;
  if bad > 0 then
    raise exception 'Refusing to finish: % precedents are still marked approved after a migration that approves nothing.', bad;
  end if;
end $$;
