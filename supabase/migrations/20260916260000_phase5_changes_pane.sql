-- PHASE 5, STEP 6: the Changes pane.
--
-- Kwame asked for one and, in the same sentence, asked that it not become
-- another workflow product. So this migration adds exactly one function, and
-- adds it for a reason that is about correctness rather than convenience.
--
-- ---------------------------------------------------------------------------
-- WHY THE CHANGES THEMSELVES ARE NOT COMPUTED HERE
-- ---------------------------------------------------------------------------
--
-- The obvious server function is `matter_changes(_matter)`, walking every
-- clause document and returning the marks with their text. It is the wrong
-- shape, for the reason step 3 gave when it refused to reimplement the change
-- model in plpgsql: there would then be two implementations of what a change
-- IS, in two languages, and Phase 4 spent its whole length on what happens when
-- two implementations of one rule drift.
--
-- `changesIn()` in `tracked-change.ts` is the implementation. The pane reads
-- the clause documents it is already entitled to read and runs it. What it
-- CANNOT work out for itself is who may settle what — so that, and only that,
-- comes from the database.
--
-- ---------------------------------------------------------------------------
-- ONE CALL, NOT ONE PER CLAUSE
-- ---------------------------------------------------------------------------
--
-- A document has four hundred clauses and a marked-up one has changes in
-- dozens. Asking `clause_context()` per clause would be dozens of round trips
-- to answer a question with at most a handful of distinct answers. This returns
-- the whole grid — clause by author — in one.

create or replace function public.matter_clause_context(_matter uuid, _authors text[] default '{}')
returns table (clause_id uuid, may_edit boolean, may_break boolean, settleable text[])
language plpgsql stable security definer set search_path = public
as $$
begin
  -- A non-member gets no rows, rather than rows of falses. The difference is
  -- the same one clause_context() draws: a row of falses confirms the clauses
  -- exist and says how many there are.
  if _matter is null or not public.is_matter_member(_matter) then
    return;
  end if;

  return query
  select c.id,
         public.can_write_matter(_matter),
         public.is_matter_lead(_matter),
         coalesce(
           (select array_agg(a)
              from unnest(coalesce(_authors, '{}'::text[])) a
             where public.can_settle_change(c.id, a)),
           '{}'::text[])
    from public.clauses c
   where c.matter_id = _matter;
end;
$$;

comment on function public.matter_clause_context(uuid, text[]) is
  'Standing across a whole matter: which clauses this caller may write, whether they may break a lease, and whose changes they may settle on each clause. Decided by the same functions that judge the write.';
