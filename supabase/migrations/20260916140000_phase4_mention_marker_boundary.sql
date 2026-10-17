-- PHASE 4, STEP 3: the boundary of the mention marker.
--
-- Two one-word changes, found by a failing assertion rather than by reading.
--
-- ---------------------------------------------------------------------------
-- WHAT WENT WRONG
-- ---------------------------------------------------------------------------
--
-- `matters_with_unseen_mentions()` asked for mentions made STRICTLY AFTER the
-- moment you last opened the matter:
--
--   c.created_at > coalesce(mm.mentions_seen_at, '-infinity')
--
-- A mention whose `created_at` equals `mentions_seen_at` exactly is therefore
-- never marked. Not marked late, not marked once — never. The dot is the only
-- signal a mention has, so that mention is lost in silence, which is the exact
-- class of failure this phase keeps finding.
--
-- It is not as unlikely as it looks. `now()` is TRANSACTION-scoped in Postgres:
-- every statement in one transaction shares a timestamp to the microsecond. Any
-- path that opens a matter and writes a comment in the same transaction
-- produces the tie by construction, and `now() > now()` is false. The
-- assertion that caught it — S03, "a later mention marks it again" — was
-- written to test the rule and happened to run in one transaction, which is how
-- the tie surfaced at all.
--
-- ---------------------------------------------------------------------------
-- THE FIX, AND WHY THIS DIRECTION
-- ---------------------------------------------------------------------------
--
-- 1. `>=` rather than `>`. The two failure modes are not equal:
--
--      with >   a mention at exactly seen_at is never shown.     Lost.
--      with >=  a mention at exactly seen_at is shown once more, and clears on
--               the next open, because that open stamps a later time.
--
--    Showing a dot one extra time is a nuisance. Losing a mention is the
--    feature not working. The tie breaks towards being seen, which is the same
--    fail-safe direction as every other default in Phase 3 and 4.
--
-- 2. `clock_timestamp()` rather than `now()` when stamping. The seen-at should
--    be the instant the person actually opened the matter, not the instant
--    their transaction began. It is more truthful, and it makes the tie rare
--    instead of structural.
--
-- Neither changes who can see anything. The marker is still a set of matter
-- ids, still never a count, still never a timestamp anybody else can read.

create or replace function public.mark_mentions_seen(p_matter uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_matter_member(p_matter) then
    -- A matter you cannot open must be indistinguishable from one that does not
    -- exist, so this returns rather than raising.
    return;
  end if;
  -- clock_timestamp(), not now(): the moment they opened it, not the moment
  -- their transaction began.
  update public.matter_members
     set mentions_seen_at = clock_timestamp()
   where matter_id = p_matter and user_id = auth.uid();
end;
$$;

create or replace function public.matters_with_unseen_mentions()
returns setof uuid language sql stable security definer set search_path = public
as $$
  select mm.matter_id
    from public.matter_members mm
   where mm.user_id = auth.uid()
     and exists (
       select 1 from public.comments c
        where auth.uid() = any (c.mentions)
          and c.author_id is distinct from auth.uid()
          and public.comment_matter(c.entity_kind::text, c.entity_id) = mm.matter_id
          -- >= so a mention landing in the same instant as the open is shown
          -- once more rather than lost. See the header.
          and c.created_at >= coalesce(mm.mentions_seen_at, '-infinity'::timestamptz));
$$;

comment on function public.matters_with_unseen_mentions() is
  'Matter ids carrying a mention of the caller made at or after they last opened the matter. A null mentions_seen_at means never looked, so every mention counts. The tie breaks towards being seen: showing a dot twice is a nuisance, losing a mention is the feature not working.';
