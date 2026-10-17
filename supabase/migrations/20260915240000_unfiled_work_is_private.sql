-- Unfiled work belongs to whoever made it.
--
-- A leak in my own Phase 3 migration, found the first time two real people were
-- signed into Scripta at once. Six tables were gated as "matter membership
-- where a matter is set, FIRM membership where it is not", with the comment
-- "a task filed to nothing is personal firm business". That reasoning was
-- wrong. An unfiled task, draft or research note is not firm business; it is
-- the author's own unfinished work, and the fallback made it readable by every
-- member of the firm.
--
-- Podrick joined the firm with zero matter memberships and his dashboard
-- showed three of Kwame's tasks by title.
--
-- THE RULE, now uniform:
--
--   unfiled          author only
--   filed to matter  matter membership and matter role decide
--   firm knowledge   playbooks, precedents, templates, presets, letterheads —
--                    firm-wide, governed by their own rules, untouched here
--
-- Note the shape: `case when matter_id is not null then <matter> else <author>`.
-- It is deliberately a CASE and never an OR. Once something is filed to a
-- matter, authorship stops counting — so a person who drafts something
-- privately, files it to a matter and is later removed from that matter loses
-- it, rather than keeping a private key to it forever.
--
-- WHY THE TESTS MISSED IT: assertion 22 of the Phase 3 suite read
-- `tasks where matter_id is not null`. I scoped the test around the branch I
-- had just written instead of challenging it, so sixty assertions passed while
-- this sat in the open. The suite now tests the null branch explicitly.

-- ---------------------------------------------------------------------------
-- 1. Every unfiled row must know its author
-- ---------------------------------------------------------------------------

-- AUTHORISED MIGRATION DECISION, recorded because it is an inference rather
-- than a fact the database held: the three unfiled tasks carry no `created_by`.
-- They predate the column being populated and were made when Kwame was the only
-- person with an account. He confirmed they are his and authorised this
-- backfill. Without it they would belong to nobody and be visible to nobody —
-- including him.
update public.tasks
   set created_by = '6df711b6-27b0-4aaf-8129-ef39700de7bb'
 where matter_id is null and created_by is null;

-- From here on the database stamps the author itself. A policy that depends on
-- `created_by` is only as good as the code that remembers to set it, and the
-- three rows above are what forgetting looks like.
create or replace function public.stamp_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['tasks','contract_drafts','corporate_documents','drafts',
                           'research_matters','links'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_stamp_author', t);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.stamp_created_by()',
      t || '_stamp_author', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The six tables
-- ---------------------------------------------------------------------------

-- `links` was not among the five the browser exposed — it has no rows yet, so
-- nothing leaked through it — but it carried the identical fallback and is
-- fixed with the others rather than left to be discovered later.
do $$
declare
  t text; sel text; ins text; upd text; del text;
  read_rule constant text :=
    'case when matter_id is not null then public.is_matter_member(matter_id) else created_by = auth.uid() end';
  write_rule constant text :=
    'case when matter_id is not null then public.can_write_matter(matter_id) else created_by = auth.uid() end';
begin
  foreach t in array array['tasks','contract_drafts','corporate_documents','drafts',
                           'research_matters','links'] loop
    -- The policy names were inherited and are not uniform; they are matched
    -- exactly so nothing is left behind under an old name.
    select case t
             when 'corporate_documents' then 'members read corporate documents'
             when 'research_matters' then 'members read research matters'
             else 'members read ' || t end,
           case t
             when 'corporate_documents' then 'writers insert corporate documents'
             when 'research_matters' then 'writers insert research matters'
             else 'writers insert ' || t end,
           case t
             when 'corporate_documents' then 'writers update corporate documents'
             when 'research_matters' then 'writers update research matters'
             else 'writers update ' || t end,
           case t
             when 'corporate_documents' then 'writers delete corporate documents'
             when 'research_matters' then 'writers delete research matters'
             else 'writers delete ' || t end
      into sel, ins, upd, del;

    execute format('drop policy if exists %I on public.%I', sel, t);
    execute format('create policy %I on public.%I for select using (%s)', sel, t, read_rule);

    execute format('drop policy if exists %I on public.%I', ins, t);
    execute format('create policy %I on public.%I for insert with check (%s)', ins, t, write_rule);

    execute format('drop policy if exists %I on public.%I', del, t);
    execute format('create policy %I on public.%I for delete using (%s)', del, t, write_rule);

    -- `links` has no update policy and never had one.
    if t <> 'links' then
      execute format('drop policy if exists %I on public.%I', upd, t);
      execute format('create policy %I on public.%I for update using (%s) with check (%s)',
                     upd, t, write_rule, write_rule);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Research children, which reach their subject through a predicate
-- ---------------------------------------------------------------------------

-- Nine tables hang off `research_matters` through these two functions, so the
-- same fallback was leaking a research note's findings, authorities, risks and
-- memo sections even where the note itself had been fixed.
create or replace function public.is_research_member(_research_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select case
    when r.matter_id is not null then public.is_matter_member(r.matter_id)
    else r.created_by = auth.uid()
  end
  from public.research_matters r where r.id = _research_id;
$$;

create or replace function public.can_write_research(_research_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select case
    when r.matter_id is not null then public.can_write_matter(r.matter_id)
    else r.created_by = auth.uid()
  end
  from public.research_matters r where r.id = _research_id;
$$;

-- ---------------------------------------------------------------------------
-- 4. What is deliberately NOT changed
-- ---------------------------------------------------------------------------
--
-- `audit_events` keeps `matter_id -> matter member, workspace_id -> firm
-- member`. It looks like the same pattern and is not: an audit row carries
-- exactly one subject, and a workspace-scoped one records firm business — an
-- invitation sent, a firm renamed — which the firm may properly see.
--
-- `edit_locks` already read `else user_id = auth.uid()`. It was author-only
-- from the day it was written.
--
-- Firm knowledge — playbooks, precedents, templates, flow presets, letterheads
-- — stays firm-wide. It is not unfiled work; it is the firm's own material, and
-- a new joiner who could see no precedents would have been given a worse
-- product, not a safer one.

do $$
declare leaked integer;
begin
  select count(*) into leaked
    from pg_policies
   where schemaname = 'public'
     and tablename in ('tasks','contract_drafts','corporate_documents','drafts','research_matters','links')
     and (coalesce(qual,'') || coalesce(with_check,'')) like '%workspace_id%';
  if leaked > 0 then
    raise exception 'Refusing to finish: % policy(ies) on the unfiled tables still consult the workspace.', leaked;
  end if;
end $$;
