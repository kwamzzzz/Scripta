-- PHASE 6, STEP 2: who may use knowledge, and what provenance may say.
--
-- ---------------------------------------------------------------------------
-- ONE RULE, SIX TABLES
-- ---------------------------------------------------------------------------
--
-- Every knowledge policy below is `knowledge_visible(...)` and nothing else, so
-- there is one place where "may this lawyer use this" is decided. Three tables
-- each carrying their own copy of the rule is three chances for them to
-- disagree, and the disagreement would be silent.
--
-- The child tables read through their parent. A playbook rule is not separately
-- shareable and neither is a template section: they are the substance of the
-- thing above them, and a rule readable when its playbook is not would be the
-- whole playbook readable one row at a time.

-- ---------------------------------------------------------------------------
-- 1. Reading
-- ---------------------------------------------------------------------------

drop policy if exists "members read playbooks" on public.playbooks;
create policy "knowledge visible playbooks" on public.playbooks for select to authenticated
  using (public.knowledge_visible(workspace_id, visibility, coalesce(owner_id, created_by), 'playbook', id));

drop policy if exists "members read precedents" on public.precedents;
create policy "knowledge visible precedents" on public.precedents for select to authenticated
  using (public.knowledge_visible(workspace_id, visibility, coalesce(owner_id, created_by), 'precedent', id));

drop policy if exists "members read templates" on public.templates;
create policy "knowledge visible templates" on public.templates for select to authenticated
  using (public.knowledge_visible(workspace_id, visibility, coalesce(owner_id, created_by), 'template', id));

drop policy if exists "members read rules" on public.playbook_rules;
create policy "knowledge visible rules" on public.playbook_rules for select to authenticated
  using (exists (select 1 from public.playbooks p where p.id = playbook_rules.playbook_id));

drop policy if exists "members read template sections" on public.template_sections;
create policy "knowledge visible template sections" on public.template_sections for select to authenticated
  using (exists (select 1 from public.templates t where t.id = template_sections.template_id));

-- The `exists` above is not a weaker check than it looks. `playbooks` and
-- `templates` have row-level security of their own, so the subquery can only
-- find a parent this caller may already read. Repeating `knowledge_visible`
-- here would be a second copy of the rule that could drift from the first.

-- ---------------------------------------------------------------------------
-- 2. Writing
-- ---------------------------------------------------------------------------
--
-- Creating is a workspace matter; changing is a knowledge matter. A lawyer may
-- keep private knowledge of their own in a firm where they are not an admin,
-- and `can_write_knowledge` lets an owner edit their own work while leaving
-- firm playbooks admin-governed as they have always been.

drop policy if exists "admins write playbooks" on public.playbooks;
create policy "writers create playbooks" on public.playbooks for insert to authenticated
  with check (public.can_write_workspace(workspace_id));
drop policy if exists "admins update playbooks" on public.playbooks;
create policy "owners update playbooks" on public.playbooks for update to authenticated
  using (public.can_write_knowledge('playbook', id))
  with check (public.can_write_knowledge('playbook', id));
drop policy if exists "admins delete playbooks" on public.playbooks;
create policy "owners delete playbooks" on public.playbooks for delete to authenticated
  using (public.can_write_knowledge('playbook', id));

drop policy if exists "writers update precedents" on public.precedents;
create policy "owners update precedents" on public.precedents for update to authenticated
  using (public.can_write_knowledge('precedent', id))
  with check (public.can_write_knowledge('precedent', id));
drop policy if exists "writers delete precedents" on public.precedents;
create policy "owners delete precedents" on public.precedents for delete to authenticated
  using (public.can_write_knowledge('precedent', id));

drop policy if exists "writers update templates" on public.templates;
create policy "owners update templates" on public.templates for update to authenticated
  using (public.can_write_knowledge('template', id))
  with check (public.can_write_knowledge('template', id));
drop policy if exists "writers delete templates" on public.templates;
create policy "owners delete templates" on public.templates for delete to authenticated
  using (public.can_write_knowledge('template', id));

drop policy if exists "admins insert rules" on public.playbook_rules;
drop policy if exists "admins update rules" on public.playbook_rules;
drop policy if exists "admins delete rules" on public.playbook_rules;
create policy "owners write rules" on public.playbook_rules for insert to authenticated
  with check (public.can_write_knowledge('playbook', playbook_id));
create policy "owners update rules" on public.playbook_rules for update to authenticated
  using (public.can_write_knowledge('playbook', playbook_id))
  with check (public.can_write_knowledge('playbook', playbook_id));
create policy "owners delete rules" on public.playbook_rules for delete to authenticated
  using (public.can_write_knowledge('playbook', playbook_id));

drop policy if exists "writers insert template sections" on public.template_sections;
drop policy if exists "writers update template sections" on public.template_sections;
drop policy if exists "writers delete template sections" on public.template_sections;
create policy "owners write template sections" on public.template_sections for insert to authenticated
  with check (public.can_write_knowledge('template', template_id));
create policy "owners update template sections" on public.template_sections for update to authenticated
  using (public.can_write_knowledge('template', template_id))
  with check (public.can_write_knowledge('template', template_id));
create policy "owners delete template sections" on public.template_sections for delete to authenticated
  using (public.can_write_knowledge('template', template_id));

-- ---------------------------------------------------------------------------
-- 3. Shares
-- ---------------------------------------------------------------------------
--
-- A share row names a person. Reading the shares on an object therefore tells
-- you who else has it, so it is limited to people who could change them anyway
-- — and to the person named, who is entitled to know they have been given
-- something.

create policy "read shares i manage or am named in" on public.knowledge_shares
  for select to authenticated
  using (
    (subject_type = 'user' and subject_id = auth.uid())
    or public.can_write_knowledge(kind, object_id));

-- Writes go through share_knowledge()/unshare_knowledge(), which stamp the
-- sharer and check the target is in the firm. No direct insert.
create policy "no direct share writes" on public.knowledge_shares
  for insert to authenticated with check (false);

-- ---------------------------------------------------------------------------
-- 4. Server-owned attribution
-- ---------------------------------------------------------------------------
--
-- Phase 4's worst defect was `comments.author_id`, which nothing stamped and
-- nothing checked. Knowledge makes three claims of the same kind — who made
-- it, who owns it, and who approved it — and approval is the one a lawyer
-- would actually rely on.
--
-- `capturePrecedent()` was found sending `approved: status === 'approved' ||
-- status === 'executed'` straight from the client, with no approver and no
-- date. So the columns come off the table grant and are handed back one by one,
-- the same way `clauses.doc` and `matter_members.mentions_seen_at` were.

create or replace function public.stamp_knowledge_author()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  if to_jsonb(new) ? 'owner_id' then
    new.owner_id := coalesce(new.owner_id, auth.uid());
  end if;
  -- Nothing arrives approved. Approval is an act, performed later, by somebody
  -- entitled to perform it.
  new.approved_at := null;
  new.approved_by := null;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['playbooks', 'precedents', 'templates'] loop
    execute format('drop trigger if exists %I_stamp_author on public.%I', t, t);
    execute format($f$create trigger %I_stamp_author before insert on public.%I
                      for each row execute function public.stamp_knowledge_author()$f$, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Server-owned columns come off the grant
-- ---------------------------------------------------------------------------
--
-- `capturePrecedent()` was sending `approved: status === 'approved' ||
-- status === 'executed'` straight from the client, with no approver and no
-- date. Stamping is not enough on its own: the column has to stop being
-- writable, or the next screen to forget will forge it again. Same shape as
-- `clauses.doc` and `matter_members.mentions_seen_at` — the table grant comes
-- off and the columns are handed back one by one, so a column added later is
-- unwritable until somebody adds it here, which fails in the safe direction.

do $$
declare t text; cols text; guarded text[];
begin
  foreach t in array array['playbooks', 'precedents', 'templates'] loop
    guarded := array['visibility','approved_at','approved_by','content_changed_at','created_by']
               || case when t = 'precedents' then array['approved'] else array[]::text[] end;
    select string_agg(quote_ident(column_name), ', ') into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = t and not (column_name = any(guarded));
    execute format('revoke update on public.%I from authenticated, anon', t);
    execute format('grant update (%s) on public.%I to authenticated, anon', cols, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. PROVENANCE COMES OFF THE READ GRANT
-- ---------------------------------------------------------------------------
--
-- The structural links out of a precedent and back into a matter — the matter,
-- the document, the clause — plus `source_note`, which in practice reads
-- "taken from the Westpoint Mining SPA" and is therefore the counterparty.
--
-- Revoked outright rather than filtered, because a column that is readable is
-- readable by every query anybody writes later. They come back only through
-- `precedent_provenance()`, which asks about the matter first.

do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'precedents'
     and column_name not in ('matter_id', 'document_id', 'clause_id', 'source_note');
  execute 'revoke select on public.precedents from authenticated, anon';
  execute format('grant select (%s) on public.precedents to authenticated, anon', cols);
end $$;

do $$
begin
  if has_column_privilege('authenticated', 'public.precedents', 'matter_id', 'SELECT') then
    raise exception 'Refusing to finish: a precedent still reveals the matter it came from.';
  end if;
  if has_column_privilege('authenticated', 'public.precedents', 'approved', 'UPDATE') then
    raise exception 'Refusing to finish: approval is still writable by the client.';
  end if;
  if not has_column_privilege('authenticated', 'public.precedents', 'body', 'SELECT') then
    raise exception 'Refusing to finish: precedents stopped being readable.';
  end if;
  if not has_column_privilege('authenticated', 'public.precedents', 'title', 'UPDATE') then
    raise exception 'Refusing to finish: precedents stopped being editable.';
  end if;
end $$;
