-- PHASE 5, STEP 3: editing that carries a name, and settlement that carries a right.
--
-- Two questions, kept apart because they have different answers:
--
--   WHO WROTE THIS?   Stamped and validated. Never accepted from the client.
--   WHO MAY SETTLE IT? Earned from responsibility, never implied by write access.
--
-- ---------------------------------------------------------------------------
-- THE AUTHORSHIP CHECK, AND WHY IT IS NOT A SECOND COPY OF THE MODEL
-- ---------------------------------------------------------------------------
--
-- The obvious way to validate a saved document is to reimplement the change
-- model in plpgsql — walk the tree, work out which changes are new, compare.
-- That is a second implementation of the thing `tracked-change.ts` already
-- does, in a different language, and Phase 4 spent its whole length finding out
-- what happens when two implementations of one rule drift.
--
-- So the database does not reason about documents at all. It extracts a FLAT
-- SET of (changeId, authorId, kind) from the marks — which needs no
-- understanding of paragraphs, tables or nesting — and checks two things about
-- that set:
--
--   a change that existed before must keep the author it had
--   a change that is new must be attributed to whoever is saving
--
-- Those two rules are sufficient. Together they make it impossible to introduce
-- wording in a colleague's name, and impossible to re-attribute wording that is
-- already there, without the database needing an opinion about what a document
-- is.

-- ---------------------------------------------------------------------------
-- 1. The marks in a document, flattened
-- ---------------------------------------------------------------------------
--
-- An explicit recursive walk rather than a `$.**` jsonpath. `**` matches at
-- every depth and yields the same string more than once when nodes nest, which
-- was found the hard way while verifying the step 2 migration — it reported a
-- table cell's text as "BandBand". A recursion that descends `content` once per
-- node cannot do that.

create or replace function public.doc_change_marks(_doc jsonb)
returns table (change_id text, author_id text, kind text)
language sql immutable
as $$
  with recursive nodes(n) as (
    select _doc
    union all
    select child
      from nodes, lateral jsonb_array_elements(coalesce(n->'content', '[]'::jsonb)) as child
  )
  select distinct
         m->'attrs'->>'changeId',
         m->'attrs'->>'authorId',
         m->>'type'
    from nodes, lateral jsonb_array_elements(coalesce(n->'marks', '[]'::jsonb)) as m
   where m->>'type' in ('insertion', 'deletion')
     and m->'attrs'->>'changeId' is not null;
$$;

comment on function public.doc_change_marks(jsonb) is
  'Every tracked change in a document as a flat set of (changeId, authorId, kind). Deliberately knows nothing about document structure, so it can never disagree with the editor about what a document means.';

-- ---------------------------------------------------------------------------
-- 2. Who may settle another lawyer's wording
-- ---------------------------------------------------------------------------
--
-- `can_write_matter` means "may edit this file". It must not quietly become
-- "may decide what the contract says". Accepting a colleague's proposed wording
-- into the operative text is a substantive legal act and is earned the same way
-- resolving a thread is.
--
--   the author            may always withdraw their own proposal
--   the Lead              may always
--   the clause's assignee entity_owner('clause', id) — already built
--   a named reviewer      somebody a change set on this clause is addressed to
--   any other Editor      may propose, may not settle
--
-- Most clauses have no assignee today, so in practice the Lead or a named
-- reviewer settles wording until clauses are assigned. That is the narrow
-- default, it fails safe, and it gives clause assignment a reason to exist.

create or replace function public.can_settle_change(_clause uuid, _change_author text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare target uuid;
begin
  select matter_id into target from public.clauses where id = _clause;
  if target is null or not public.can_review_matter(target) then return false; end if;

  -- Taking back your own proposal is not deciding anything.
  if _change_author = auth.uid()::text then return true; end if;

  if public.is_matter_lead(target) then return true; end if;
  if public.entity_owner('clause', _clause) = auth.uid() then return true; end if;

  -- A reviewer a change set on this clause is addressed to, while it is live.
  return exists (
    select 1 from public.approvals a
     where a.entity_kind::text = 'clause' and a.entity_id = _clause
       and a.assigned_to = auth.uid()
       and a.status in ('Requested', 'In review'));
end;
$$;

comment on function public.can_settle_change(uuid, text) is
  'Whether the caller may accept or reject one change. The author may always withdraw their own; the Lead always may; the clause''s assignee may; a reviewer it is addressed to may. Any other Editor may propose and may not settle.';

-- ---------------------------------------------------------------------------
-- 3. Saving a clause
-- ---------------------------------------------------------------------------
--
-- One entry point, so there is one place where authorship is enforced. The
-- editor never writes `clauses.doc` directly, and the policy below stops it
-- from trying.

create or replace function public.save_clause_doc(_clause uuid, _doc jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  target uuid;
  previous jsonb;
  me text := auth.uid()::text;
  rec record;
  added integer := 0;
  settled integer := 0;
begin
  select matter_id, doc into target, previous from public.clauses where id = _clause;
  if target is null then
    raise exception 'That clause is unavailable.' using errcode = '42501';
  end if;
  if not public.can_write_matter(target) then
    raise exception 'That clause is not yours to edit.' using errcode = '42501';
  end if;

  -- (a) Nothing may be introduced in somebody else's name, and nothing already
  --     here may be re-attributed.
  for rec in
    select n.change_id, n.author_id, p.author_id as was
      from public.doc_change_marks(_doc) n
      left join public.doc_change_marks(coalesce(previous, '{}'::jsonb)) p
        on p.change_id = n.change_id
  loop
    if rec.was is null then
      if rec.author_id is distinct from me then
        raise exception 'A change can only be made in your own name.' using errcode = '42501';
      end if;
      added := added + 1;
    elsif rec.author_id is distinct from rec.was then
      raise exception 'A change cannot be re-attributed.' using errcode = '42501';
    end if;
  end loop;

  -- (b) Anything that has GONE was settled, and settling is a right.
  for rec in
    select p.change_id, p.author_id
      from public.doc_change_marks(coalesce(previous, '{}'::jsonb)) p
      left join public.doc_change_marks(_doc) n on n.change_id = p.change_id
     where n.change_id is null
  loop
    if not public.can_settle_change(_clause, rec.author_id) then
      raise exception 'That wording is not yours to settle. The matter Lead, the clause''s assignee, or a reviewer it is addressed to can.'
        using errcode = '42501';
    end if;
    settled := settled + 1;
  end loop;

  update public.clauses set doc = _doc, updated_at = now() where id = _clause;

  -- The audit trail records the ACT and counts, never the words. The words live
  -- in the document and in its revisions, where they can be diffed.
  if added > 0 or settled > 0 then
    insert into public.audit_events
      (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
    values (target, auth.uid(),
            coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                       where p.id = auth.uid()), 'Unknown'),
            case when added > 0 and settled > 0 then 'clause.edited'
                 when added > 0 then 'change.proposed'
                 else 'change.settled' end,
            'clause', _clause,
            format('%s proposed, %s settled', added, settled),
            jsonb_build_object('proposed', added, 'settled', settled));
  end if;

  return jsonb_build_object('proposed', added, 'settled', settled);
end;
$$;

comment on function public.save_clause_doc(uuid, jsonb) is
  'The one way a clause document is written. Validates that no change is introduced in another lawyer''s name, that nothing is re-attributed, and that anything settled was the caller''s to settle.';

-- ---------------------------------------------------------------------------
-- 4. The direct write is closed
-- ---------------------------------------------------------------------------
--
-- Without this the function above is a convention rather than a rule, and a
-- screen that writes `clauses.doc` straight through would bypass every check in
-- it. `doc` becomes unwritable by `authenticated`; everything else on the
-- clause — status, risk, assignee, the review state — is untouched.
--
-- Same shape as `matter_members.mentions_seen_at` in Phase 4: a table-level
-- grant outranks a column-level revoke, so the grant comes off and the columns
-- are handed back one by one. A column added to `clauses` later will not be
-- writable until it is added here, which fails in the safe direction.

revoke update on public.clauses from authenticated, anon;
grant update (
  matter_id, source_document_id, compared_to_document_id, num, title, change, risk,
  status, page_ref, diff_summary, analysis, analysis_source, ordinal, created_at,
  updated_at, analysis_error, review_state, approval, assignee_id, suggested_text,
  confidence, classification, classification_reason, classification_source,
  kind, refs, parts_numbered
) on public.clauses to authenticated, anon;

do $$
begin
  if has_column_privilege('authenticated', 'public.clauses', 'doc', 'UPDATE') then
    raise exception 'Refusing to finish: clauses.doc is still writable directly.';
  end if;
  if not has_column_privilege('authenticated', 'public.clauses', 'status', 'UPDATE') then
    raise exception 'Refusing to finish: the rest of the clause stopped being writable.';
  end if;
end $$;
