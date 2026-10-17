-- The history of the mark-up: what the document said, at every step.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
--
-- A tracked change is visible while it is outstanding and gone the moment it
-- is settled. Accept an insertion and the words become ordinary words; reject
-- a deletion and the strike disappears; lift a highlight and there is nothing
-- to say it was ever there. So the one question a lawyer asks a week later —
-- "what did we change, and what did it say before?" — had no answer in the
-- product. `clause_revisions` existed but only held what somebody had chosen
-- to keep by hand, and 417 rows of it were the one-off migration baseline.
--
-- Now every save writes the version it produced, so the history is the
-- sequence of documents and every step can be read as the redline between two
-- of them: wording, highlights, and the fate of each tracked change.
--
-- ---------------------------------------------------------------------------
-- A REVISION IS ABOUT WORDING, NOT ABOUT A ROW
-- ---------------------------------------------------------------------------
--
-- `clause_id` used to be NOT NULL with ON DELETE CASCADE, and a revision was
-- immutable against UPDATE as well as DELETE. Those three facts together had a
-- consequence nobody had tried: re-reading a document deletes its clauses, the
-- cascade tried to delete their revisions, the immutability trigger refused —
-- and so ANY MATTER THAT HAD EVER KEPT A VERSION COULD NOT HAVE ITS DOCUMENT
-- READ AGAIN. Eight matters were in that state, and the failure would have
-- surfaced as a flat refusal with no way round it.
--
-- So a revision now outlives the row: `clause_id` may be null, the clause's
-- number and title at the time are kept on the revision itself, and the
-- immutability trigger allows exactly one change — re-pointing `clause_id` —
-- so a re-read can reattach the history of a clause whose wording survived.
-- Everything a revision RECORDS is still unchangeable, and none of it can be
-- deleted.

-- What the clause was called when this version was written, so the history
-- still reads after the register has been rebuilt under it.
alter table public.clause_revisions
  add column if not exists clause_num text not null default '',
  add column if not exists clause_title text not null default '';

/* The backfill is the one write to an existing revision there will ever be,
   and the immutability trigger is right to refuse it — so it is switched off
   for the length of it and switched straight back on. */
alter table public.clause_revisions disable trigger clause_revisions_immutable;

update public.clause_revisions r
   set clause_num = coalesce(c.num, ''), clause_title = coalesce(c.title, '')
  from public.clauses c
 where c.id = r.clause_id and r.clause_num = '' and r.clause_title = '';

alter table public.clause_revisions enable trigger clause_revisions_immutable;

-- The row may go; the record does not.
alter table public.clause_revisions alter column clause_id drop not null;
alter table public.clause_revisions drop constraint clause_revisions_clause_id_fkey;
alter table public.clause_revisions
  add constraint clause_revisions_clause_id_fkey
  foreign key (clause_id) references public.clauses(id) on delete set null;

-- Every save is a step. `baseline` is how a clause arrived, `kept` and
-- `milestone` are a lawyer's own bookmarks, `restored` is a going-back.
alter table public.clause_revisions drop constraint clause_revisions_kind_check;
alter table public.clause_revisions
  add constraint clause_revisions_kind_check
  check (kind = any (array['baseline', 'step', 'kept', 'milestone', 'restored']));

create index if not exists clause_revisions_matter_time
  on public.clause_revisions (matter_id, created_at desc);

-- The history is read clause by clause as well as matter-wide.
create index if not exists clause_revisions_clause_time
  on public.clause_revisions (clause_id, created_at);

/*
 * Who may re-point a revision: anyone who may write to the matter. What they
 * may change is the trigger's business, and the answer is `clause_id` and
 * nothing else — so this policy cannot be used to rewrite history.
 *
 * Without it the re-pointing failed SILENTLY: the table grants UPDATE, but
 * with row-level security on and no UPDATE policy an update matches no rows
 * and reports success, so a re-read left every clause's history detached and
 * said nothing. Found by reading the rows back after a re-read rather than by
 * trusting the call that returned no error.
 */
create policy "writers repoint clause revisions"
  on public.clause_revisions for update
  using (public.can_write_matter(matter_id))
  with check (public.can_write_matter(matter_id));

/*
 * Immutable in everything it records. `clause_id` is the exception, and the
 * only one: a re-read of the document rebuilds the register, and the history
 * of a clause whose wording survived belongs with the row that now holds that
 * wording. Nothing about what the document SAID can be touched.
 */
create or replace function public.protect_clause_revision()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'A revision records what a document said. It cannot be changed or removed.'
      using errcode = '42501';
  end if;

  if new.doc is distinct from old.doc
     or new.kind is distinct from old.kind
     or new.label is distinct from old.label
     or new.note is distinct from old.note
     or new.matter_id is distinct from old.matter_id
     or new.clause_num is distinct from old.clause_num
     or new.clause_title is distinct from old.clause_title
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'A revision records what a document said. It cannot be changed or removed.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

/*
 * Fill in what the revision is about. The clause's number and title are copied
 * as they stand, unless the caller gave them — a revision written while the
 * register is being rebuilt says what the clause was called then, not what it
 * is called now.
 */
create or replace function public.stamp_clause_revision()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());

  if new.clause_id is not null then
    select c.matter_id,
           case when coalesce(new.clause_num, '') = '' then coalesce(c.num, '') else new.clause_num end,
           case when coalesce(new.clause_title, '') = '' then coalesce(c.title, '') else new.clause_title end
      into new.matter_id, new.clause_num, new.clause_title
      from public.clauses c where c.id = new.clause_id;
  end if;

  if new.matter_id is null then
    raise exception 'That clause is unavailable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

/*
 * Saving a clause document, with the step written down.
 *
 * Unchanged in every other respect — the matter check, the edit lock, the
 * "moved while you were editing it" guard, authorship of a new change, and who
 * may settle one. The single addition is the revision at the end: the version
 * this save produced, so the step from the previous version can be read as a
 * redline long after the change itself has been settled.
 */
create or replace function public.save_clause_doc(_clause uuid, _doc jsonb, _seen timestamp with time zone DEFAULT NULL::timestamp with time zone)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target uuid; previous jsonb; moved timestamptz;
  me text := auth.uid()::text;
  live record; rec record;
  added integer := 0; settled integer := 0;
begin
  select matter_id, doc, updated_at into target, previous, moved
    from public.clauses where id = _clause;
  if target is null then
    raise exception 'That clause is unavailable.' using errcode = '42501';
  end if;
  if not public.can_write_matter(target) then
    raise exception 'That clause is not yours to edit.' using errcode = '42501';
  end if;

  select l.user_id, l.expires_at into live
    from public.edit_locks l
   where l.entity_kind = 'clause' and l.entity_id = _clause and l.expires_at > now();
  if live.user_id is not null and live.user_id <> auth.uid() then
    raise exception 'This clause is open with %. Your changes have not been saved - they are still on your screen.',
      coalesce((select coalesce(p.full_name, p.email) from public.profiles p where p.id = live.user_id), 'another lawyer')
      using errcode = '55006';
  end if;

  if _seen is not null and moved is not null and moved > _seen then
    raise exception 'This clause moved while you were editing it. Your changes have not been saved - they are still on your screen.'
      using errcode = '40001';
  end if;

  for rec in
    select n.change_id, n.author_id, p.author_id as was
      from public.doc_change_marks(_doc) n
      left join public.doc_change_marks(coalesce(previous, '{}'::jsonb)) p on p.change_id = n.change_id
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

  update public.edit_locks
     set refreshed_at = now(), expires_at = now() + interval '2 minutes'
   where entity_kind = 'clause' and entity_id = _clause
     and user_id = auth.uid() and expires_at > now();

  /* The step. Only where something actually changed, so a save that wrote the
     same document does not add a version that says nothing. */
  if previous is distinct from _doc then
    insert into public.clause_revisions (clause_id, doc, kind)
    values (_clause, _doc, 'step');
  end if;

  if added > 0 or settled > 0 then
    insert into public.audit_events
      (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
    values (target, auth.uid(),
            coalesce((select coalesce(p.full_name, p.email) from public.profiles p where p.id = auth.uid()), 'Unknown'),
            case when added > 0 and settled > 0 then 'clause.edited'
                 when added > 0 then 'change.proposed' else 'change.settled' end,
            'clause', _clause,
            format('%s proposed, %s settled', added, settled),
            jsonb_build_object('proposed', added, 'settled', settled));
  end if;

  return jsonb_build_object('proposed', added, 'settled', settled);
end;
$$;
