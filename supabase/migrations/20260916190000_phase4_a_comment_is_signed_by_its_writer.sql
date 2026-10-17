-- PHASE 4: a comment is signed by whoever wrote it, and by nobody else.
--
-- Found in the two-user browser test, in the first five minutes, by reading the
-- word "Unknown" where a name should have been.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG
-- ---------------------------------------------------------------------------
--
-- Nothing set `comments.author_id`, and nothing checked it.
--
-- The old server functions — `addMatterNote`, `addClauseComment` — set it by
-- hand: `author_id: server.userId`. The `<Thread>` composer that replaced them
-- writes the row directly and did not. There is no trigger on `comments` doing
-- it either, unlike `tasks`, which has had `stamp_created_by` since Phase 3c.
--
-- Four consequences, all proved against the live database before this ran:
--
--   1. Every comment written through the new composer has author_id NULL, and
--      renders as "Unknown".
--
--   2. Its own author cannot edit it. `mayEdit` compares author_id to the
--      signed-in user, and so does the UPDATE policy. Null matches nobody, so
--      the Edit control never appears and the write would be refused anyway.
--
--   3. COMMENTING ON YOUR OWN UNFILED WORK IS REFUSED OUTRIGHT. Where
--      `comment_matter()` is null the insert policy falls to
--      `author_id = auth.uid()`, which a null author fails. Not invisible —
--      refused, with an RLS error, on a person's own private task.
--
--   4. IMPERSONATION. The insert policy for a matter comment checks
--      `can_review_matter()` and says nothing about author_id, so any member
--      could post a comment attributed to a colleague. Podrick could sign a
--      comment as Mawusi, on the professional record, and the audit trail would
--      agree with him.
--
-- The fourth is the one that matters. A comment is part of the record of a
-- legal file; who said a thing is most of what it is worth.
--
-- ---------------------------------------------------------------------------
-- WHY THE SUITES MISSED IT, WHICH IS THE USEFUL PART
-- ---------------------------------------------------------------------------
--
-- Every assertion in the Phase 4 suites writes comments like this:
--
--   insert into public.comments (..., body, author_id) values (..., me);
--
-- I set `author_id` by hand in the fixtures because it made the assertions
-- about authorship readable. So the suites tested a row shape THE APPLICATION
-- NEVER PRODUCES, and proved a set of rules about a column the product was
-- silently leaving empty.
--
-- That is a new failure mode to write down, distinct from the four "fallback
-- widened access" defects: A FIXTURE THAT IS MORE CORRECT THAN THE PRODUCT.
-- The suite passes, the rules it proves are real, and the application takes a
-- different path to the same table. Two users in a browser found it in minutes.
--
-- The remedy is in this file: the column stops depending on any caller getting
-- it right.

-- ---------------------------------------------------------------------------
-- The stamp
-- ---------------------------------------------------------------------------
--
-- FORCED, not defaulted. `coalesce(new.author_id, auth.uid())` would fix the
-- null and leave the impersonation, because a client that sends a colleague's
-- id is not sending null. The author of a comment is not a field the writer
-- gets an opinion about.
--
-- Deliberately only on INSERT. `author_id` is `on delete set null` against
-- auth.users, so a departed colleague's comments legitimately hold null, and a
-- trigger that forced a value on every write would rewrite history the first
-- time somebody resolved one of them.

create or replace function public.stamp_comment_author()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.author_id := auth.uid();
  return new;
end;
$$;

comment on function public.stamp_comment_author() is
  'A comment is signed by whoever wrote it. Forced rather than defaulted: the author is not a field the writer gets an opinion about.';

drop trigger if exists comments_stamp_author on public.comments;
create trigger comments_stamp_author before insert on public.comments
  for each row execute function public.stamp_comment_author();

-- ---------------------------------------------------------------------------
-- The one row already written this way
-- ---------------------------------------------------------------------------
--
-- A single comment was posted through the new composer during the acceptance
-- test and carries no author. It is attributed here because we know from the
-- test who wrote it, and because leaving it would leave a comment on a live
-- matter that its own author cannot edit.
--
-- Scoped to exactly that row by id. The two comments that predate Phase 4 are
-- left alone: their authorship is not something this migration knows.
--
-- It runs BEFORE the re-attribution rule below rather than suspending it.
-- Written in that order on the second attempt: the first put the rule first,
-- and the migration was refused by its own guard — which is the guard working,
-- and a worse thing to leave in a file than a sensible order.

update public.comments
   set author_id = '6df711b6-27b0-4aaf-8129-ef39700de7bb'
 where id = 'a1272406-5475-4d22-929a-82b6bc17df1b'
   and author_id is null;

-- ---------------------------------------------------------------------------
-- And it cannot be re-attributed afterwards
-- ---------------------------------------------------------------------------
--
-- Without this the insert is honest and the next update is not.

create or replace function public.enforce_comment_change()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  target uuid := public.comment_matter(new.entity_kind::text, new.entity_id);
  owner  uuid := public.entity_owner(new.entity_kind::text, new.entity_id);
  lead   boolean := target is not null and public.is_matter_lead(target);
begin
  if new.entity_kind is distinct from old.entity_kind
     or new.entity_id is distinct from old.entity_id
     or new.workspace_id is distinct from old.workspace_id
     or new.parent_id is distinct from old.parent_id then
    raise exception 'A comment cannot be moved to another entity or thread.'
      using errcode = '42501';
  end if;

  -- Who said it does not change. Not by the author, not by the Lead.
  if new.author_id is distinct from old.author_id then
    raise exception 'A comment cannot be re-attributed.' using errcode = '42501';
  end if;

  if new.body is distinct from old.body
     or new.mentions is distinct from old.mentions
     or new.kind is distinct from old.kind then
    if old.author_id is distinct from auth.uid() then
      raise exception 'Only the author can edit a comment.' using errcode = '42501';
    end if;
    if new.body is distinct from old.body then
      new.updated_at := now();
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

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'comments' and t.tgname = 'comments_stamp_author')
  then
    raise exception 'Refusing to finish: comments are not signed.';
  end if;
end $$;
