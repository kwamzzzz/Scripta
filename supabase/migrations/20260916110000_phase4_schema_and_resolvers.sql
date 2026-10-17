-- PHASE 4, STEP 1b: the schema, the two resolvers, and the rules that judge a
-- change to a comment.
--
-- No new table. Eleven changes, eight of them single columns, on tables that
-- have been there since the premium schema. The security question was settled
-- in Phase 3: if Scripta shows collaborative matter content, matter membership
-- has already established entitlement. Nothing here negotiates with that.
--
-- Read alongside `supabase/tests/phase4_schema_and_resolvers.sql`, which was
-- written first and run first, and whose fourteen structural assertions were
-- seen to fail against the live database before this file existed.
--
-- ---------------------------------------------------------------------------
-- THE RULE PHASE 3 BOUGHT IN BLOOD, applied here
-- ---------------------------------------------------------------------------
--
-- Every new `entity_kind` a thread can attach to is added to
-- `comment_matter()` IN THIS MIGRATION, beside the columns that depend on it.
-- A kind that function does not recognise returns null, and null is not a
-- refusal — it sends the comments policy to its author-only branch, so the
-- thread is invisible to everybody except the person who wrote it. It does not
-- raise, it does not log, and it looks exactly like the feature not working.
-- All three Phase 3 defects behaved that way.
--
-- `entity_owner()` has the same property in the other direction: a kind it does
-- not know returns null, resolution narrows to the raiser and the Lead, and
-- Resolve quietly stops appearing for the person actually responsible. Safe,
-- and wrong.
--
-- So the two are written together, the null branch of each is asserted in the
-- suite before the feature above it exists, and assertion P01 walks the list of
-- thread targets and fails if either function has stopped answering for one.

-- ---------------------------------------------------------------------------
-- 1. comments — a reply, an edit, and who was named
-- ---------------------------------------------------------------------------

-- A discussion is a flat list in creation order today, because every comment is
-- a root. `on delete cascade`: deleting the comment somebody replied to takes
-- the replies with it, which is the only coherent reading of a thread whose
-- first post is gone.
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

-- NOT `default now()`. `updated_at` is the edited-at, and it is null until
-- somebody edits. A default would print "Edited" against every comment in the
-- database from the moment it was written, including the two that are already
-- there.
alter table public.comments
  add column if not exists updated_at timestamptz;

-- Who was named, recorded as a fact at write time rather than re-parsed out of
-- the body on every read. A parse is a second opinion about what the comment
-- says, and the two drift the first time somebody edits.
alter table public.comments
  add column if not exists mentions uuid[] not null default '{}';

create index if not exists comments_parent_idx on public.comments (parent_id)
  where parent_id is not null;
create index if not exists comments_mentions_idx on public.comments using gin (mentions)
  where mentions <> '{}';

-- `kind` has been free text with a check constraint holding two values. The
-- constraint already stopped a typo becoming a silent third class; an enum
-- moves that from a rule the table carries to a rule the type carries, so a new
-- kind has to be declared rather than spelled.
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'comment_kind') then
    create type public.comment_kind as enum ('note', 'instruction');
  end if;
end $$;

do $$
begin
  if (select udt_name from information_schema.columns
       where table_schema = 'public' and table_name = 'comments' and column_name = 'kind')
     <> 'comment_kind' then
    alter table public.comments drop constraint if exists comments_kind_check;
    alter table public.comments alter column kind drop default;
    alter table public.comments alter column kind type public.comment_kind
      using kind::public.comment_kind;
    alter table public.comments alter column kind set default 'note'::public.comment_kind;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. approvals — the column nobody had noticed
-- ---------------------------------------------------------------------------
--
-- The table records who asked and who decided, and never who is being asked. So
-- the central question — what is waiting for me — was not answerable from it.
-- Zero rows, so nothing to backfill; this was found by reading the table rather
-- than the proposal that described it as ready to use.

alter table public.approvals
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

-- A review that arrives as a notice is a review nobody checks. `on delete set
-- null`: losing the task must not lose the review.
alter table public.approvals
  add column if not exists task_id uuid references public.tasks(id) on delete set null;

-- The lifecycle moves more than once, so the last move needs a time of its own.
-- `decided_at` is the terminal one and keeps that meaning.
alter table public.approvals
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists approvals_updated_at on public.approvals;
create trigger approvals_updated_at before update on public.approvals
  for each row execute function public.set_updated_at();

create index if not exists approvals_assigned_idx on public.approvals (assigned_to)
  where assigned_to is not null;

-- ---------------------------------------------------------------------------
-- 3. matter_members.mentions_seen_at — the whole mention signal
-- ---------------------------------------------------------------------------
--
-- One timestamp per person per matter. A matter whose threads mention you after
-- that moment carries a marker; opening the matter clears it. No read-state
-- table, no per-message row, no counter to maintain, nothing to mark read. It
-- is deliberately the lightest thing that works, and it is not the seed of a
-- notification system.
--
-- Null means never looked, which is the common case and the one the suite
-- asserts: a member added today must see mentions made before they arrived
-- rather than none.

alter table public.matter_members
  add column if not exists mentions_seen_at timestamptz;

-- NOBODY LEARNS WHEN A COLLEAGUE LAST READ THEIR MENTIONS.
--
-- This cannot be a policy. RLS is row-level, and the matter_members select
-- policy is `is_matter_member(matter_id)` because the team card lists the whole
-- team — narrowing it to your own row would empty that card. So the privacy of
-- this one column is a column privilege: `authenticated` cannot read or write
-- it at all, and both directions go through the security-definer functions
-- below, which only ever touch the caller's own row.
--
-- A COLUMN-LEVEL REVOKE DOES NOT WORK ON ITS OWN. `authenticated` and `anon`
-- hold table-level SELECT and UPDATE on this table, and a table-level grant
-- outranks a column-level revoke — `revoke select (mentions_seen_at)` against
-- it is accepted and changes nothing. So the table grant comes off and the
-- columns are granted back one by one. Checked against
-- information_schema.table_privileges rather than assumed.
--
-- TWO CONSEQUENCES TO REMEMBER:
--
--   1. `select *` on matter_members now fails for `authenticated`. Every caller
--      in the application names its columns (src/lib/matter-team.ts) and the
--      RPCs are security definer, so nothing reads it that way today. A future
--      `select('*')` fails loudly at the first call rather than leaking
--      quietly, which is the right way round.
--   2. A column added to this table later will NOT be readable until it is
--      added to the grant below. That is the cost of column privileges, and it
--      fails in the safe direction.
revoke select, update on public.matter_members from authenticated, anon;
grant select (matter_id, user_id, role, added_by, added_at, added_via_team)
  on public.matter_members to authenticated, anon;
grant update (matter_id, user_id, role, added_by, added_at, added_via_team)
  on public.matter_members to authenticated, anon;

-- Opening the matter clears the marker. Writes only the caller's own row, and
-- only this column, so it can never become a way to change a role.
create or replace function public.mark_mentions_seen(p_matter uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_matter_member(p_matter) then
    -- A matter you cannot open must be indistinguishable from one that does not
    -- exist, so this returns rather than raising.
    return;
  end if;
  update public.matter_members
     set mentions_seen_at = now()
   where matter_id = p_matter and user_id = auth.uid();
end;
$$;

comment on function public.mark_mentions_seen(uuid) is
  'Clears the caller''s own mention marker on one matter. Touches one column of one row and cannot reach a role.';

-- The marker itself: which of my matters have mentioned me since I last looked.
-- Returns matter ids and nothing else — never a timestamp, never whose mention
-- it was, and never a count, because a count is the first step towards an
-- inbox.
create or replace function public.matters_with_unseen_mentions()
returns setof uuid language sql stable security definer set search_path = public
as $$
  select mm.matter_id
    from public.matter_members mm
   where mm.user_id = auth.uid()
     and exists (
       select 1 from public.comments c
        where auth.uid() = any (c.mentions)
          and c.author_id is distinct from auth.uid()
          and public.comment_matter(c.entity_kind::text, c.entity_id) = mm.matter_id
          and c.created_at > coalesce(mm.mentions_seen_at, '-infinity'::timestamptz));
$$;

comment on function public.matters_with_unseen_mentions() is
  'Matter ids carrying a mention of the caller made after they last opened the matter. A null mentions_seen_at means never looked, so every mention counts — which is what a person added to a matter today should see.';

-- ---------------------------------------------------------------------------
-- 4. comment_matter(), extended to every kind a thread attaches to
-- ---------------------------------------------------------------------------
--
-- Three kinds are added: `deliverable` and `flow_phase` already had branches
-- and no enum value to reach them; `research_finding` is new on both sides.
--
-- A FINDING IS THE CASE WORTH READING TWICE. `research_finding` resolves
-- through its research matter, and research filed to no matter returns null —
-- which is correct, and which sends the comment to the author-only branch of
-- the policy. That is right for unfiled private research and wrong for nothing,
-- but only because section 5 below teaches the comments policy about the kind
-- in the same migration. A `research_finding` branch here without the policy
-- branch there would have made every thread on a finding invisible to the rest
-- of the team, in silence.

create or replace function public.finding_research(_finding_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select research_matter_id from public.research_findings where id = _finding_id; $$;

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
    when 'research_finding' then
      (select matter_id from public.research_matters
        where id = public.finding_research(_id))
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
-- 5. entity_owner() — who is responsible for the thing a thread is about
-- ---------------------------------------------------------------------------
--
-- Resolution is earned, not granted by role. Not every Editor may close every
-- thread: it is the person who raised it, the person responsible for the work
-- it is about, or the Lead. This function answers the middle one.
--
-- It never widens anything on its own. Its null is a narrowing — where nobody
-- is responsible, resolution falls back to the raiser and the Lead — so the
-- honest failure here is a kind that should have an owner and silently does
-- not. Assertions O08 to O12 exist for exactly that.

create or replace function public.entity_owner(_kind text, _id uuid)
returns uuid language plpgsql stable security definer set search_path = public
as $$
begin
  return case _kind
    -- Work somebody is doing: whoever it is assigned to. Unassigned is null,
    -- which is the branch that matters.
    when 'task' then (select assignee_id from public.tasks where id = _id)
    when 'deliverable' then (select owner_id from public.flow_deliverables where id = _id)
    when 'clause' then (select assignee_id from public.clauses where id = _id)
    -- Work somebody produced: its author.
    when 'research' then (select created_by from public.research_matters where id = _id)
    when 'research_finding' then
      (select created_by from public.research_matters where id = public.finding_research(_id))
    -- The file itself: its Lead. The supervisory answer, and the only case
    -- where the owner is read out of the team rather than off the row.
    when 'matter' then (select user_id from public.matter_members
                         where matter_id = _id and role = 'lead' limit 1)
    -- Deliberately ownerless, each for its own reason: a document and a
    -- corporate document carry no responsible person on the row; a flow and a
    -- phase are containers, and the responsibility inside them sits on the
    -- deliverables. Resolution on these falls to the raiser and the Lead, which
    -- is the correct answer rather than a gap.
    else null
  end;
end;
$$;

comment on function public.entity_owner(text, uuid) is
  'Who is responsible for one entity, or null where nobody is. Drives who may resolve a thread, alongside the raiser and the Lead. Never widens: a kind it does not know returns null and narrows resolution.';

-- ---------------------------------------------------------------------------
-- 6. A reply inherits its root's entity
-- ---------------------------------------------------------------------------
--
-- Without this, `parent_id` is a way to smuggle a thread onto another matter: a
-- member of matter A replies to a comment with A's entity in the row and B's
-- id in the parent, and the reply reads as belonging to whichever the policy
-- happens to consult. So the row does not get to say. The trigger takes the
-- entity, the workspace and the root from the parent, and the policy then judges
-- the same values the parent was judged on.
--
-- Threads are one level deep. A reply to a reply is re-parented to the root
-- rather than refused, because the alternative is a UI bug becoming an error
-- the person cannot act on, and a two-level thread has no meaning here anyway.

create or replace function public.inherit_comment_parent()
returns trigger language plpgsql security definer set search_path = public
as $$
declare root record;
begin
  if new.parent_id is null then return new; end if;

  select c.id, c.parent_id, c.entity_kind, c.entity_id, c.workspace_id
    into root
    from public.comments c where c.id = new.parent_id;
  if not found then
    raise exception 'The comment being replied to does not exist.' using errcode = '23503';
  end if;

  -- Flatten: reply to the root, whatever was pointed at.
  if root.parent_id is not null then
    select c.id, c.entity_kind, c.entity_id, c.workspace_id into root
      from public.comments c where c.id = root.parent_id;
  end if;

  new.parent_id   := root.id;
  new.entity_kind := root.entity_kind;
  new.entity_id   := root.entity_id;
  new.workspace_id := root.workspace_id;
  return new;
end;
$$;

-- INSERT ONLY, and section 8 refuses to let `parent_id` change afterwards.
--
-- The reason is trigger ordering, which is alphabetical among BEFORE triggers:
-- `comments_enforce_change` runs before `comments_inherit_parent`. If this one
-- fired on update it could rewrite `entity_kind` after the check in section 8
-- had already approved the row — which is precisely the move that check exists
-- to stop. A reply's parent is fixed when it is written.
drop trigger if exists comments_inherit_parent on public.comments;
create trigger comments_inherit_parent before insert on public.comments
  for each row execute function public.inherit_comment_parent();

-- ---------------------------------------------------------------------------
-- 7. A mention names somebody who can open the file
-- ---------------------------------------------------------------------------
--
-- The one control in Phase 4 able to pull a person toward content they are not
-- entitled to. Phase 3 established that firm membership grants nothing, so the
-- picker offers the matter team only — and because a picker is a rule the
-- interface remembers, the rule is also here, where it is refused at write time
-- rather than filtered at read.
--
-- Where the comment has no matter — unfiled private work, a precedent, a
-- playbook — there is no team to name, and a mention is refused outright. That
-- is the narrow default rather than the obvious alternative of falling back to
-- the firm, and it is the third time in this codebase that the fallback is the
-- thing worth being suspicious of.

create or replace function public.validate_comment_mentions()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  m uuid;
  target uuid;
begin
  if new.mentions is null then new.mentions := '{}'; end if;
  if array_length(new.mentions, 1) is null then return new; end if;

  -- Deduplicate rather than reject: naming somebody twice is a typing accident,
  -- not an attack.
  select array_agg(distinct x) into new.mentions from unnest(new.mentions) x;

  target := public.comment_matter(new.entity_kind::text, new.entity_id);
  if target is null then
    raise exception 'A mention needs a matter team. This comment is not on a matter.'
      using errcode = '42501';
  end if;

  foreach m in array new.mentions loop
    if not exists (select 1 from public.matter_members
                    where matter_id = target and user_id = m) then
      raise exception 'You can only mention people on this matter.' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists comments_validate_mentions on public.comments;
create trigger comments_validate_mentions before insert or update of mentions on public.comments
  for each row execute function public.validate_comment_mentions();

-- ---------------------------------------------------------------------------
-- 8. What may change about a comment, and who may change it
-- ---------------------------------------------------------------------------
--
-- One UPDATE policy cannot tell editing from resolving, and they have different
-- rules: the body is the author's alone, and resolving is the raiser's, the
-- responsible person's or the Lead's. So the policy admits anybody who may do
-- either, and this trigger decides which was actually attempted.
--
-- AN EDIT ALTERS THE PROFESSIONAL RECORD. A comment is not a draft, so an edit
-- is not a correction — it says Edited, and the audit trail keeps what it said
-- before. One row per edit, in the row's own metadata. Not a versions table,
-- and deliberately not a diff: an audit row says THAT something changed and by
-- whom, and a structure you can accept and reject is Phase 5's model, not
-- something to approximate here. See section 13 of the plan.

create or replace function public.enforce_comment_change()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  target uuid := public.comment_matter(new.entity_kind::text, new.entity_id);
  owner  uuid := public.entity_owner(new.entity_kind::text, new.entity_id);
  lead   boolean := target is not null and public.is_matter_lead(target);
begin
  -- The entity is not a thing the row may change about itself; a reply gets it
  -- from its root and a root keeps what it was written with. Allowing it would
  -- move a whole thread onto another matter in one update.
  if new.entity_kind is distinct from old.entity_kind
     or new.entity_id is distinct from old.entity_id
     or new.workspace_id is distinct from old.workspace_id
     or new.parent_id is distinct from old.parent_id then
    raise exception 'A comment cannot be moved to another entity or thread.'
      using errcode = '42501';
  end if;

  -- The author's alone: the words, who they named, and which kind of writing it
  -- is. A Lead may delete a comment; a Lead may not rewrite one.
  if new.body is distinct from old.body
     or new.mentions is distinct from old.mentions
     or new.kind is distinct from old.kind then
    if old.author_id is distinct from auth.uid() then
      raise exception 'Only the author can edit a comment.' using errcode = '42501';
    end if;
    if new.body is distinct from old.body then
      new.updated_at := now();
      -- Not `from profiles` — a missing profile row must not be the reason an
      -- edit goes unrecorded. The name is looked up and falls back; the row is
      -- written either way.
      insert into public.audit_events
        (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
      values (target, auth.uid(),
              coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                         where p.id = auth.uid()), 'Unknown'),
              'comment.edited', 'comment', new.id,
              'Comment edited',
              jsonb_build_object('previous', old.body, 'current', new.body));
    end if;
  end if;

  -- Resolution is earned. Three grounds, any one of which is enough, and where
  -- nobody is responsible it narrows to the raiser and the Lead rather than
  -- widening to every Editor.
  if new.resolved is distinct from old.resolved then
    if not (old.author_id = auth.uid()
            or (owner is not null and owner = auth.uid())
            or lead) then
      raise exception 'Only the person who raised this, the person responsible for it, or the matter Lead can resolve it.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists comments_enforce_change on public.comments;
create trigger comments_enforce_change before update on public.comments
  for each row execute function public.enforce_comment_change();

-- The policy widens to admit the resolvers; the trigger above is what keeps
-- editing to the author. `can_review_matter` in the check clause means a
-- Viewer, and anybody demoted to Viewer mid-thread, stops being able to write
-- at all.
drop policy if exists "authors update comments" on public.comments;
create policy "authors update comments" on public.comments for update
  using (
    author_id = auth.uid()
    or case
         when public.comment_matter(entity_kind::text, entity_id) is not null
           then public.is_matter_lead(public.comment_matter(entity_kind::text, entity_id))
                or public.entity_owner(entity_kind::text, entity_id) = auth.uid()
         when entity_kind::text in ('playbook', 'precedent')
           then public.can_admin_workspace(workspace_id)
         else false
       end)
  with check (
    case
      when public.comment_matter(entity_kind::text, entity_id) is not null
        then public.can_review_matter(public.comment_matter(entity_kind::text, entity_id))
      when entity_kind::text = 'research'
        then coalesce(public.can_write_research(entity_id), author_id = auth.uid())
      when entity_kind::text = 'research_finding'
        then coalesce(public.can_write_research(public.finding_research(entity_id)),
                      author_id = auth.uid())
      when entity_kind::text in ('playbook', 'precedent')
        then public.can_write_workspace(workspace_id)
      else author_id = auth.uid()
    end);

-- ---------------------------------------------------------------------------
-- 9. research_finding taught to the policies, in this same migration
-- ---------------------------------------------------------------------------
--
-- The obligation stated at the top of this file, discharged. `comment_matter()`
-- now resolves a finding on FILED research to its matter; a finding on unfiled
-- research resolves to null, and without these branches that thread would fall
-- to `author_id = auth.uid()` — author-only, in silence, for work that is
-- properly shared with whoever can see the research.

drop policy if exists "members read comments" on public.comments;
create policy "members read comments" on public.comments for select
  using (
    case
      when public.comment_matter(entity_kind::text, entity_id) is not null
        then public.is_matter_member(public.comment_matter(entity_kind::text, entity_id))
      when entity_kind::text = 'research'
        then coalesce(public.is_research_member(entity_id), author_id = auth.uid())
      when entity_kind::text = 'research_finding'
        then coalesce(public.is_research_member(public.finding_research(entity_id)),
                      author_id = auth.uid())
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
      when entity_kind::text = 'research_finding'
        then coalesce(public.can_write_research(public.finding_research(entity_id)),
                      author_id = auth.uid())
      when entity_kind::text in ('playbook', 'precedent')
        then public.can_write_workspace(workspace_id)
      else author_id = auth.uid()
    end);

drop policy if exists "authors delete comments" on public.comments;
create policy "authors delete comments" on public.comments for delete
  using (
    author_id = auth.uid()
    or case
         when public.comment_matter(entity_kind::text, entity_id) is not null
           then public.is_matter_lead(public.comment_matter(entity_kind::text, entity_id))
         when entity_kind::text in ('playbook', 'precedent')
           then public.can_admin_workspace(workspace_id)
         else false
       end);

drop policy if exists "members read approvals" on public.approvals;
create policy "members read approvals" on public.approvals for select
  using (
    case
      when public.comment_matter(entity_kind::text, entity_id) is not null
        then public.is_matter_member(public.comment_matter(entity_kind::text, entity_id))
      when entity_kind::text = 'research'
        then coalesce(public.is_research_member(entity_id), requested_by = auth.uid())
      when entity_kind::text = 'research_finding'
        then coalesce(public.is_research_member(public.finding_research(entity_id)),
                      requested_by = auth.uid())
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
      when entity_kind::text = 'research_finding'
        then coalesce(public.can_write_research(public.finding_research(entity_id)),
                      requested_by = auth.uid())
      when entity_kind::text in ('playbook', 'precedent')
        then public.can_write_workspace(workspace_id)
      else requested_by = auth.uid()
    end);

-- ---------------------------------------------------------------------------
-- 10. The refusal to finish on a silent kind
-- ---------------------------------------------------------------------------
--
-- The cheapest possible guard against the defect this whole file is shaped by:
-- if a kind a thread attaches to has stopped resolving, the migration does not
-- commit. It is a weaker check than the suite — it cannot see the policy — but
-- it runs inside the transaction that would have caused the problem.

do $$
declare
  kind text;
  missing text := '';
begin
  foreach kind in array array['matter','clause','document','task','deliverable',
                              'flow_phase','research','research_finding'] loop
    if not exists (select 1 from unnest(enum_range(null::public.source_kind)) e
                    where e::text = kind) then
      missing := missing || kind || ' ';
    end if;
  end loop;
  if missing <> '' then
    raise exception 'Refusing to finish: source_kind cannot hold: %', missing;
  end if;

  -- And both resolvers must answer for every one of them without raising.
  foreach kind in array array['matter','clause','document','task','deliverable',
                              'flow_phase','research','research_finding'] loop
    perform public.comment_matter(kind, '00000000-0000-0000-0000-000000000000');
    perform public.entity_owner(kind, '00000000-0000-0000-0000-000000000000');
  end loop;
end $$;
