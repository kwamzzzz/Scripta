-- PHASE 4: research collaboration sits on the research matter, not the finding.
--
-- Step 2 added `research_finding` as a thread target. It is removed here,
-- before anything was built on it, because a finding is not a durable entity.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS FOUND, AND HOW
-- ---------------------------------------------------------------------------
--
-- `replaceChildren()` in `src/lib/research-store.functions.ts` deletes every
-- `research_findings` row for a research matter and inserts them again on EVERY
-- save — not only when the research is re-run. So `research_findings.id` does
-- not survive a save.
--
-- A thread attached to one behaves like this, proved against the live database
-- rather than reasoned about:
--
--   before a save   the thread resolves to its matter; a colleague reads it
--   after a save    the comment rows still exist — `comments.entity_id` is
--                   polymorphic and carries no foreign key, so nothing
--                   cascades — but `comment_matter()` now returns null, the
--                   comments policy falls to its author-only branch, and the
--                   thread is visible to its writer and to nobody else
--
-- No error. No log. Invisible in the direction that looks like the feature
-- simply not working, which is the signature all three Phase 3 defects shared.
--
-- Flow phases and deliverables were checked for the same property and do not
-- have it: `flow-db.ts` upserts them by id against an explicit inserted /
-- updated / deletedIds diff, so their ids are stable across saves. This is
-- isolated to findings.
--
-- ---------------------------------------------------------------------------
-- THE DECISION
-- ---------------------------------------------------------------------------
--
-- Research collaboration attaches to the RESEARCH MATTER, which is a durable
-- row with a stable id. A finding gets no thread of its own.
--
-- The underlying requirement is not discarded: a finding should eventually be a
-- durable object able to carry its own discussion and its own review, and there
-- is real value in a lawyer asking a colleague to check one finding rather than
-- a whole note. That belongs with deeper Legal Research and Workflow Tool
-- collaboration, where finding identity can be made stable properly. It is
-- recorded in `docs/research-finding-identity.md` rather than patched here.
--
-- ---------------------------------------------------------------------------
-- 1. The resolvers stop claiming to support it
-- ---------------------------------------------------------------------------
--
-- This is the point of the migration. A branch that resolves a kind the product
-- does not offer is exactly the unreachable support that made
-- `comment_matter()` misleading about `task`, `deliverable` and `flow_phase`
-- for the whole of Phase 3. Leaving a second one behind, knowingly, would be
-- worse than the first.

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
    -- Research collaboration lives here, on the durable row.
    when 'research' then (select matter_id from public.research_matters where id = _id)
    when 'draft' then (select matter_id from public.drafts where id = _id)
    when 'contract_draft' then (select matter_id from public.contract_drafts where id = _id)
    when 'task' then (select matter_id from public.tasks where id = _id)
    when 'resolution' then public.resolution_matter(_id)
    when 'flow_phase' then public.phase_matter(_id)
    when 'deliverable' then public.deliverable_matter(_id)
    -- playbook, precedent, manual: firm knowledge. Null means "gate on the
    -- workspace", never "deny".
    --
    -- research_finding: deliberately absent. See the header.
    else null
  end;
end;
$$;

create or replace function public.entity_owner(_kind text, _id uuid)
returns uuid language plpgsql stable security definer set search_path = public
as $$
begin
  return case _kind
    when 'task' then (select assignee_id from public.tasks where id = _id)
    when 'deliverable' then (select owner_id from public.flow_deliverables where id = _id)
    when 'clause' then (select assignee_id from public.clauses where id = _id)
    when 'research' then (select created_by from public.research_matters where id = _id)
    when 'matter' then (select user_id from public.matter_members
                         where matter_id = _id and role = 'lead' limit 1)
    else null
  end;
end;
$$;

drop function if exists public.finding_research(uuid);

-- ---------------------------------------------------------------------------
-- 2. The policies stop carrying a branch for it
-- ---------------------------------------------------------------------------

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
      when entity_kind::text in ('playbook', 'precedent')
        then public.can_write_workspace(workspace_id)
      else author_id = auth.uid()
    end);

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
-- 3. The one thing that cannot be removed, and why that is safe
-- ---------------------------------------------------------------------------
--
-- `research_finding` stays in the `source_kind` enum. Postgres has no
-- `ALTER TYPE ... DROP VALUE`; removing it means rebuilding the type and
-- rewriting five columns across four tables — `comments.entity_kind`,
-- `approvals.entity_kind`, `links.from_kind`, `links.to_kind` and
-- `tasks.origin_kind` — which is a large, risky change to buy a cosmetic one.
-- That is the concrete reason for preserving it, and the only one.
--
-- WHAT MAKES THE LEFTOVER DIFFERENT FROM THE DEAD BRANCHES IT REPLACES. The
-- Phase 3 problem was never the enum; it was a resolver that CLAIMED to handle
-- a kind. `task`, `deliverable` and `flow_phase` had branches in
-- `comment_matter()` that read as working support and could never run.
-- `research_finding` now has the opposite shape: no resolver branch, no policy
-- branch, no entry in `THREAD_KINDS`, and no interface that can produce one.
-- A row written with it would resolve to null and fall to the author-only
-- branch, which is the fail-safe default rather than a leak.
--
-- And it is asserted rather than assumed. The step 1 suite now tests that
-- `research_finding` resolves to NOTHING, so the unsupported kind is a checked
-- property of the schema instead of an unexamined leftover. If somebody adds it
-- back, that assertion fails and they are made to read this file.

do $$
begin
  if public.comment_matter('research_finding', '00000000-0000-0000-0000-000000000000') is not null then
    raise exception 'Refusing to finish: research_finding still resolves. Read docs/research-finding-identity.md before re-adding it.';
  end if;
  if public.entity_owner('research_finding', '00000000-0000-0000-0000-000000000000') is not null then
    raise exception 'Refusing to finish: entity_owner still answers for research_finding.';
  end if;
end $$;
