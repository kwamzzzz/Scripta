-- PHASE 5, STEP 8: compare, and going back.
--
-- ---------------------------------------------------------------------------
-- RESTORING IS SETTLING EVERYTHING AT ONCE
-- ---------------------------------------------------------------------------
--
-- This is the whole of the permission question and it is worth being blunt
-- about, because "restore an earlier version" sounds like an undo and is not.
--
-- Bringing back Tuesday's wording throws away every proposal made since. If
-- three of those were Podrick's, restoring has rejected Podrick's drafting
-- without anybody pressing Reject on it. Kwame's second refinement was that
-- Editor permission must not silently become the authority to settle a
-- colleague's wording, and a restore is the largest possible version of
-- exactly that.
--
-- So the right required is not a new one. It is the right the lawyer would
-- need to reject each of those changes individually, asked for all of them at
-- once: `can_settle_change()` must answer yes for EVERY author whose work is
-- in the clause now. The Lead passes trivially, the clause's assignee passes,
-- a reviewer the wording is addressed to passes, and an Editor who simply
-- happens to be on the matter does not.
--
-- Written this way rather than as "Lead only" because inventing a second,
-- coarser rule for the same question is how two rules about one thing end up
-- disagreeing — which is what Phase 4 spent its length on.
--
-- ---------------------------------------------------------------------------
-- GOING BACK IS ITSELF HISTORY
-- ---------------------------------------------------------------------------
--
-- A restore writes a NEW revision (kind 'restored') and a new current document.
-- Nothing is rewound and nothing is removed. `clause_revisions` has no update
-- and no delete policy and a trigger that refuses both, so the record of what
-- the clause said on Tuesday survives somebody going back to it — and survives
-- somebody going back past it.

-- ---------------------------------------------------------------------------
-- 1. The list
-- ---------------------------------------------------------------------------
--
-- SECURITY INVOKER: `clause_revisions` has a membership policy and it is the
-- right one. A function that reports on a row must not read that row with more
-- authority than its caller.

create or replace function public.clause_revision_list(_clause uuid)
returns table (id uuid, kind text, label text, note text,
               created_by uuid, created_by_name text, created_at timestamptz)
language sql stable security invoker set search_path = public
as $$
  select r.id, r.kind, r.label, r.note, r.created_by,
         coalesce(p.full_name, p.email, 'Somebody'), r.created_at
    from public.clause_revisions r
    left join public.profiles p on p.id = r.created_by
   where r.clause_id = _clause
   order by r.created_at desc;
$$;

comment on function public.clause_revision_list(uuid) is
  'Every kept version of a clause, newest first. SECURITY INVOKER, so the matter decides who sees the history exactly as it decides who sees the clause.';

-- ---------------------------------------------------------------------------
-- 2. Keeping one
-- ---------------------------------------------------------------------------
--
-- Deliberate, and only ever of the document as it stands. There is no way to
-- keep a version of something other than what is in the clause right now,
-- because a revision is a record of what the document said and a record you
-- can compose is not a record.

create or replace function public.keep_clause_revision(
  _clause uuid, _label text default null, _note text default null, _kind text default 'kept')
returns uuid language plpgsql security definer set search_path = public
as $$
declare target uuid; current_doc jsonb; made uuid;
begin
  select matter_id, doc into target, current_doc from public.clauses where id = _clause;
  if target is null then
    raise exception 'That clause is unavailable.' using errcode = '42501';
  end if;
  if not public.can_write_matter(target) then
    raise exception 'That clause is not yours to edit.' using errcode = '42501';
  end if;
  if current_doc is null then
    raise exception 'There is nothing in that clause to keep.' using errcode = '22023';
  end if;
  -- 'baseline' is not on offer. There is exactly one, it is written when the
  -- clause arrives, and a unique index enforces it — but refusing here gives
  -- the caller a sentence rather than a constraint violation.
  if _kind not in ('kept', 'milestone') then
    raise exception 'A version can be kept or marked as a milestone. As received is written once, when the clause arrives.'
      using errcode = '22023';
  end if;

  insert into public.clause_revisions (clause_id, doc, kind, label, note)
  values (_clause, current_doc, _kind, _label, _note)
  returning id into made;

  insert into public.audit_events
    (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (target, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                     where p.id = auth.uid()), 'Unknown'),
          'revision.kept', 'clause', _clause,
          coalesce(nullif(_label, ''), 'A version was kept'),
          jsonb_build_object('revision', made, 'kind', _kind));
  return made;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Going back
-- ---------------------------------------------------------------------------

create or replace function public.restore_clause_revision(_revision uuid, _note text default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  target uuid; the_clause uuid; earlier jsonb; current_doc jsonb;
  rec record; discarded integer := 0;
  live record;
begin
  select r.clause_id, r.doc, r.matter_id into the_clause, earlier, target
    from public.clause_revisions r where r.id = _revision;
  if the_clause is null or not public.is_matter_member(target) then
    raise exception 'That version is unavailable.' using errcode = '42501';
  end if;
  if not public.can_write_matter(target) then
    raise exception 'That clause is not yours to edit.' using errcode = '42501';
  end if;

  -- The lease rule applies here as it applies to any other write. Going back
  -- while a colleague is in the clause would take the sentence they are typing
  -- with it.
  select l.user_id into live from public.edit_locks l
   where l.entity_kind = 'clause' and l.entity_id = the_clause and l.expires_at > now();
  if live.user_id is not null and live.user_id <> auth.uid() then
    raise exception 'This clause is open with %. Nothing has been restored.',
      coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                 where p.id = live.user_id), 'another lawyer')
      using errcode = '55006';
  end if;

  select doc into current_doc from public.clauses where id = the_clause;

  -- THE PERMISSION. Every author whose work would be discarded, checked with
  -- the same function that judges a single Reject.
  for rec in
    select distinct p.author_id
      from public.doc_change_marks(coalesce(current_doc, '{}'::jsonb)) p
      left join public.doc_change_marks(coalesce(earlier, '{}'::jsonb)) n
        on n.change_id = p.change_id
     where n.change_id is null
  loop
    if not public.can_settle_change(the_clause, rec.author_id) then
      raise exception 'Going back would discard wording that is not yours to settle. The matter Lead, the clause''s assignee, or a reviewer it is addressed to can.'
        using errcode = '42501';
    end if;
    discarded := discarded + 1;
  end loop;

  -- The document as it stands is kept FIRST, so that going back is reversible
  -- by the same means. Somebody who restores the wrong version must be able to
  -- restore the one they were on.
  if current_doc is not null and current_doc is distinct from earlier then
    insert into public.clause_revisions (clause_id, doc, kind, label, note)
    values (the_clause, current_doc, 'kept', 'Before going back',
            'Kept automatically so the restore can itself be undone.');
  end if;

  update public.clauses set doc = earlier, updated_at = now() where id = the_clause;

  insert into public.clause_revisions (clause_id, doc, kind, label, note)
  values (the_clause, earlier, 'restored', 'Restored', _note);

  insert into public.audit_events
    (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (target, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                     where p.id = auth.uid()), 'Unknown'),
          'revision.restored', 'clause', the_clause,
          format('An earlier version was restored, discarding %s outstanding change(s)', discarded),
          jsonb_build_object('revision', _revision, 'discarded', discarded));

  return jsonb_build_object('restored', _revision, 'discarded', discarded);
end;
$$;

comment on function public.restore_clause_revision(uuid, text) is
  'Bring back an earlier version. Requires the right to settle every author''s outstanding wording, because a restore discards all of it at once. Keeps the current document first, so going back is itself reversible, and writes a restored revision rather than rewinding.';

-- ---------------------------------------------------------------------------
-- 4. Reading one, to compare against
-- ---------------------------------------------------------------------------

create or replace function public.clause_revision_doc(_revision uuid)
returns jsonb language sql stable security invoker set search_path = public
as $$
  select doc from public.clause_revisions where id = _revision;
$$;

-- ---------------------------------------------------------------------------
-- A note on what the suite found
-- ---------------------------------------------------------------------------
--
-- `clause_revisions` has no update policy, so a member's UPDATE matches no
-- rows: it is a SILENT NO-OP rather than an error. The first version of the
-- test asserted "an exception was raised" and failed while the product was
-- perfectly correct — and would have gone on passing for the wrong reason the
-- day somebody added an update policy, because the trigger would then have
-- raised and the assertion would have been satisfied by the wrong mechanism.
--
-- An error that never came is not the same as a change that never happened,
-- and only one of those is the guarantee. The test now asserts the ROW is
-- unchanged, and separately that the trigger refuses where RLS would not.
