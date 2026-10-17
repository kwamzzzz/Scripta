-- PHASE 5, STEP 3c: what this lawyer may do to this clause, answered once.
--
-- ---------------------------------------------------------------------------
-- WHY THE INTERFACE IS NOT ALLOWED TO WORK THIS OUT
-- ---------------------------------------------------------------------------
--
-- Every control on the clause rail — Accept, Reject, Withdraw, edit, and from
-- step 5, Take it from a colleague — is a claim about what the server will
-- permit. Phase 4 ended with three defects of exactly one kind: a screen that
-- decided for itself, and was wrong.
--
-- So the standing is returned by the same functions that will judge the write.
-- `can_settle_change()` is what `save_clause_doc()` consults; `is_matter_lead()`
-- is what `break_clause_lease()` consults. A control that is drawn is a control
-- that works, because the thing that drew it and the thing that will allow it
-- are one function.
--
-- One call rather than one per change: `can_settle_change` depends on the
-- change's AUTHOR and on nothing else about it, so the answer is identical for
-- every change by the same person and the rail can ask once for the set.
--
-- ---------------------------------------------------------------------------
-- THE AUTHORS ARRIVE FROM THE CLIENT, AND THAT IS SAFE
-- ---------------------------------------------------------------------------
--
-- `_authors` is whatever the rail found in the document. A caller could pass
-- names that are not in the clause, or omit ones that are. Neither buys them
-- anything: the answer for each is computed from the caller's own standing, and
-- the answer is only ever read back by the caller. Lying to it changes which
-- buttons YOU see, which is not a right.
--
-- Recorded because it looks like an injection point and is not.

-- Dropped rather than replaced: `may_break` widens the return type, and a
-- `create or replace` cannot change one.
drop function if exists public.clause_context(uuid, text[]);

create function public.clause_context(_clause uuid, _authors text[] default '{}')
returns table (matter_id uuid, may_edit boolean, may_break boolean, settleable text[])
language plpgsql stable security definer set search_path = public
as $$
declare target uuid;
begin
  select c.matter_id into target from public.clauses c where c.id = _clause;

  -- A non-member gets no row at all, rather than a row of falses. The
  -- difference matters: a row of falses confirms the clause exists.
  if target is null or not public.is_matter_member(target) then
    return;
  end if;

  return query
  select target,
         public.can_write_matter(target),
         public.is_matter_lead(target),
         coalesce(
           (select array_agg(a)
              from unnest(coalesce(_authors, '{}'::text[])) a
             where public.can_settle_change(_clause, a)),
           '{}'::text[]);
end;
$$;

comment on function public.clause_context(uuid, text[]) is
  'What the caller may do to one clause: write it, break a colleague''s lease on it, and whose changes they may settle. Decided by the same functions that judge the write, so a control that is drawn is a control that works.';
