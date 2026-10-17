-- PHASE 4, STEP 6: realtime, last and on its own.
--
-- The original plan treated this as a line in a phase — "publish some tables,
-- it respects RLS". Two of those words are doing more work than they can bear,
-- so this is its own step, after the data work rather than alongside it, with
-- its own assertions.
--
-- ---------------------------------------------------------------------------
-- WHAT RESPECTS RLS AND WHAT DOES NOT
-- ---------------------------------------------------------------------------
--
--   postgres_changes INSERT/UPDATE   Yes. Realtime evaluates the table's SELECT
--                                    policy as the subscribing user and drops
--                                    the row if it would not be readable. The
--                                    boundary Phase 3 built is the boundary
--                                    here, unchanged.
--
--   postgres_changes DELETE          NO. The payload carries only the primary
--                                    key, because the row is gone and there is
--                                    nothing left to run a policy against. A
--                                    delete therefore reaches EVERY subscriber
--                                    — it leaks the existence and the id of a
--                                    row on a matter you are not on. Not
--                                    subscribed to. A screen that needs to know
--                                    something vanished refetches.
--
--   presence / broadcast             Not gated by table policies at all.
--                                    Channel membership is its own
--                                    authorisation surface, and a matter-keyed
--                                    channel would need its own join check.
--                                    OUT of Phase 4. Showing who currently has
--                                    a matter open does not earn a new
--                                    authorisation surface; it returns in Phase
--                                    5, where knowing who is editing a document
--                                    is load-bearing rather than decorative.
--
-- ---------------------------------------------------------------------------
-- WHAT IS PUBLISHED, AND WHAT IS DELIBERATELY NOT
-- ---------------------------------------------------------------------------
--
-- Published: comments, approvals, tasks, flow_deliverables. Threads appear,
-- review state moves, assignments land, flow changes show.
--
-- NOT published: `clauses`, `documents`, and anything else carrying document
-- text. This is the third prohibition in section 13 of the plan and the reason
-- is not performance. Turning on live clause updates now would establish
-- last-write-wins as the concurrent-editing behaviour, and Phase 5 would have
-- to unpick that from a product people had already learned. Structured
-- collaboration goes live; document content waits for a model that can merge
-- it.

-- ---------------------------------------------------------------------------
-- 1. Deletes are not published at all
-- ---------------------------------------------------------------------------
--
-- Publication-wide rather than per table, because the hole is a property of
-- what a delete payload can contain rather than of any one table. The
-- publication currently carries no tables, so nothing is losing a delete stream
-- it was relying on — checked before this ran.

alter publication supabase_realtime set (publish = 'insert, update');

-- ---------------------------------------------------------------------------
-- 2. The four tables
-- ---------------------------------------------------------------------------
--
-- REPLICA IDENTITY IS LEFT AT DEFAULT, deliberately. `replica identity full`
-- would put the entire previous row in every update payload. Realtime does
-- filter the old record too, but the narrower setting is the one that cannot be
-- wrong: with the default, an update payload carries the new row and the
-- primary key of the old, which is all any of the four listeners here needs.
-- Nothing in Phase 4 renders a before-and-after, and the one thing that might
-- want to — a redline — is exactly what section 13 says not to approximate.

do $$
declare t text;
begin
  foreach t in array array['comments', 'approvals', 'tasks', 'flow_deliverables'] loop
    if not exists (
      select 1 from pg_publication_rel pr
        join pg_publication p on p.oid = pr.prpubid
        join pg_class c on c.oid = pr.prrelid
        join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime' and n.nspname = 'public' and c.relname = t)
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Nothing is published before its policy has been re-asserted
-- ---------------------------------------------------------------------------
--
-- Realtime's filtering IS the table's SELECT policy. A published table with RLS
-- disabled, or with a permissive policy, is a firehose — so the migration
-- refuses to finish unless every published table has row-level security on.
--
-- This guard is cheap and narrow: it proves RLS is enabled, not that the policy
-- is correct. Correctness is `phase4_realtime.sql`, which asks the four
-- policies the question Realtime will ask them — as a non-member, for a matter
-- they are not on.

do $$
declare
  t record;
  bad text := '';
begin
  for t in
    select c.relname, c.relrowsecurity
      from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
     where p.pubname = 'supabase_realtime' and n.nspname = 'public'
  loop
    if not t.relrowsecurity then bad := bad || t.relname || ' '; end if;
  end loop;
  if bad <> '' then
    raise exception 'Refusing to publish a table without row-level security: %', bad;
  end if;
end $$;

-- And the prohibition, enforced rather than written down. Document text does
-- not go live in Phase 4.
do $$
declare leaked text := '';
begin
  select string_agg(c.relname, ' ') into leaked
    from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
   where p.pubname = 'supabase_realtime' and n.nspname = 'public'
     and c.relname in ('clauses', 'documents', 'contract_drafts', 'drafts',
                       'corporate_documents', 'document_versions');
  if leaked is not null then
    raise exception 'Refusing to finish: document text must not be published to realtime in Phase 4 (%). See section 13 of the plan.', leaked;
  end if;
end $$;
