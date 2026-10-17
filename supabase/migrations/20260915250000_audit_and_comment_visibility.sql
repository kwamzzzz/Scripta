-- An audit event must never reveal more than the thing it records.
--
-- The third defect of the same shape, and the reason for the bounded review
-- below rather than another spot fix. Podrick, a firm member with no access to
-- Kwame's unfiled research, could read the audit trail about it:
--
--   Research matter renamed — "Untitled research note" → "Enforceability of
--   Liability Cap for breach of contract UAE"
--   Research answer recorded — 6 authorities, 4 findings
--
-- `research_matters` correctly returned nothing to him. `audit_events` read the
-- titles out loud, because its policy had two branches — matter-scoped to the
-- matter, everything else to the firm — and research events are workspace
-- scoped. I had looked at this policy during the previous fix and written that
-- it "records firm business — an invitation sent, a firm renamed — which the
-- firm may properly see". That was true of the examples I thought of and false
-- of the table's actual contents.
--
-- THE GOVERNING RULE, applied here and to be applied to anything added later:
--
--   matter-scoped event        the matter governs
--   event about private work   resolve the subject; its own rule governs
--   firm administration        the firm may see it, BY EXPLICIT CLASSIFICATION
--   anything else              the actor alone, until somebody classifies it
--
-- The last line is the important one. Three defects in this phase have come
-- from a fallback that widened access when a more specific scope was absent.
-- The default is now the narrow one, so the next unclassified event type is
-- private by omission rather than public by omission.

-- ---------------------------------------------------------------------------
-- 1. Audit events
-- ---------------------------------------------------------------------------

-- The event types were enumerated from the table and from every emitter in the
-- application, not reasoned about from examples. Firm-visible is an explicit
-- list; everything absent from it falls to the actor.
create or replace function public.audit_event_visible(
  _matter uuid, _research uuid, _workspace uuid,
  _entity_type text, _entity_id uuid, _event text, _actor uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  subject uuid;
  verdict boolean;
begin
  -- A matter's own history follows the matter.
  if _matter is not null then
    return public.is_matter_member(_matter);
  end if;

  -- Research events are workspace-scoped rows about work that may be unfiled
  -- and private. Older rows carry the subject only in `entity_id`, so both are
  -- consulted.
  subject := coalesce(_research,
                      case when _entity_type = 'research_matter' then _entity_id end);
  if subject is not null then
    verdict := public.is_research_member(subject);
    -- The subject has been deleted and cannot answer for itself. The person who
    -- did it keeps their own record; nobody else inherits it.
    return coalesce(verdict, _actor = auth.uid());
  end if;

  -- Firm administration, listed rather than pattern-matched. A future
  -- `workspace.something_private` must not become firm-visible by sharing a
  -- prefix with these.
  if _workspace is not null and _event = any (array[
       'workspace.invite_created',
       'workspace.invite_accepted',
       'workspace.invite_revoked',
       'workspace.renamed',
       'workspace.firm_created',
       'workspace.register_viewed'
     ]) then
    return public.is_workspace_member(_workspace);
  end if;

  -- Unclassified. Narrow by default.
  return _actor = auth.uid();
end;
$$;

comment on function public.audit_event_visible(uuid, uuid, uuid, text, uuid, text, uuid) is
  'Who may read one audit row. An audit event never reveals more than the thing it records: the matter governs a matter event, the subject governs an event about private work, a short explicit list is firm-visible, and anything unclassified is the actor''s alone.';

drop policy if exists "members read audit events" on public.audit_events;
create policy "members read audit events" on public.audit_events for select to authenticated
  using (public.audit_event_visible(
    matter_id, research_matter_id, workspace_id, entity_type, entity_id, event_type, actor_id));

-- ---------------------------------------------------------------------------
-- 2. Comments and approvals
-- ---------------------------------------------------------------------------

-- Found by the same review, not by a leak: `comment_matter()` returns null for
-- two very different reasons — the entity is firm knowledge (a precedent, a
-- playbook), or the entity is unfiled private work. Both fell to the firm.
--
-- Nothing has escaped through this yet; every comment in the database is on a
-- clause, and a clause always has a matter. It is fixed now rather than left
-- for the first person to comment on an unfiled draft.
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
-- 3. The review's findings, recorded
-- ---------------------------------------------------------------------------
--
-- Every policy consulting `is_workspace_member`, classified:
--
--   FIRM-SHARED, fallback correct and unchanged —
--     playbooks, playbook_rules, precedents, templates, template_sections,
--     flow_presets, flow_preset_families, letterheads. The firm's own material.
--     A new joiner who could see no precedents would have a worse product, not
--     a safer one.
--
--   FIRM MEMBERSHIP ITSELF, correct —
--     workspaces, workspace_members, profiles (own, co-member, or co-matter).
--
--   PERSONAL, already narrow —
--     work_reports (`auth.uid() = user_id`), feedback insert (`author_id =
--     auth.uid()`), edit_locks (`user_id = auth.uid()`).
--
--   WRONG, fixed above —
--     audit_events, comments, approvals.
--
--   WRONG, fixed in the previous migration —
--     tasks, contract_drafts, corporate_documents, drafts, research_matters,
--     links, and the nine research child tables behind is_research_member.
--
-- No other permissive fallback remains in the collaboration surface.

do $$
declare offenders integer;
begin
  select count(*) into offenders
    from pg_policies
   where schemaname = 'public'
     and tablename in ('audit_events', 'comments', 'approvals')
     and cmd = 'SELECT'
     and coalesce(qual, '') like '%is_workspace_member(workspace_id)%'
     and coalesce(qual, '') not like '%playbook%';
  if offenders > 0 then
    raise exception 'Refusing to finish: % policy(ies) still fall back to the firm.', offenders;
  end if;
end $$;
