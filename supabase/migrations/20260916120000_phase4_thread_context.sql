-- PHASE 4, STEP 2: the one thing the thread needs from the database that it
-- cannot get from reading a table.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS AT ALL
-- ---------------------------------------------------------------------------
--
-- The rule from the Manage Team correction: every control is rendered against
-- the same predicate that will judge it, so a Viewer never sees a comment box
-- that would be refused and nobody is shown a Resolve they cannot use.
--
-- Rendering against "the same predicate" is easy to say and easy to get wrong.
-- A component that decides whether to draw Resolve has to know three things —
-- which matter the entity belongs to, who is responsible for it, and what the
-- signed-in person's role on that matter is — and every one of them is already
-- a database function. The obvious implementation re-derives them in
-- TypeScript: read the task, read its assignee, read the team, compare. That is
-- a second opinion about authorisation, written in a different language, and it
-- drifts the first time either side changes. It is the same class of mistake as
-- parsing mentions out of a comment body at read time.
--
-- So the client does not derive them. It asks, and it asks the same functions
-- the policies and the trigger call. `entity_owner()` here is the identical
-- `entity_owner()` that `enforce_comment_change()` consults when it decides
-- whether to let the update through.
--
-- ---------------------------------------------------------------------------
-- WHAT IT REFUSES TO SAY
-- ---------------------------------------------------------------------------
--
-- A non-member gets an empty result, not a row of nulls and not an error. A
-- matter you cannot open must be indistinguishable from a matter that does not
-- exist, and a function that answered "this entity exists but is not yours"
-- would be the first thing in the codebase to break that.
--
-- It also never returns the owner of an entity on a matter the caller is not
-- on, which is the narrower trap: `entity_owner()` is security definer and will
-- happily name the assignee of any task in the database.

create or replace function public.thread_context(_kind text, _id uuid)
returns table (matter_id uuid, owner_id uuid, my_role text, may_comment boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  target uuid := public.comment_matter(_kind, _id);
begin
  -- No matter: firm knowledge, or unfiled private work. Neither carries a
  -- matter team, so there is no role to report and no mention to offer. The
  -- comments policy still governs whether a thread is readable; this function
  -- simply has nothing to add, and says so by returning one row with a null
  -- matter rather than pretending the entity is unreachable.
  if target is null then
    return query select null::uuid, null::uuid, null::text, false;
    return;
  end if;

  if not public.is_matter_member(target) then
    return;  -- Empty. Not a row of nulls, and not an error.
  end if;

  return query
    select target,
           public.entity_owner(_kind, _id),
           (select mm.role::text from public.matter_members mm
             where mm.matter_id = target and mm.user_id = auth.uid()),
           public.can_review_matter(target);
end;
$$;

comment on function public.thread_context(text, uuid) is
  'What a thread component needs to render its controls: the matter, who is responsible for the entity, the caller''s role, and whether they may write. Answers with the same functions that judge the write, so the interface cannot drift from the rules. Returns nothing at all for a non-member.';
