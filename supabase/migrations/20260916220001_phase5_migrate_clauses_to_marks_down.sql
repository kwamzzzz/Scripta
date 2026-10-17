-- ROLLBACK for `20260916220000_phase5_migrate_clauses_to_marks.sql`.
--
-- Safe because the forward migration was ADDITIVE: it wrote `clauses.doc` and
-- it wrote revisions, and it deleted nothing. All 428 rows of
-- `clause_segments` are still in place, so every clause can be reconverted or
-- read the old way.
--
-- THE ONE THING TO KNOW BEFORE RUNNING THIS. Five clauses had a document before
-- the migration; four of those were overwritten with their marked versions.
-- Blanking every document would therefore lose the formatting those five
-- carried — a bold word in clause 1.2, a table in clause 1.5 — which the
-- segments cannot give back.
--
-- So the rollback blanks only the documents the migration BUILT, identified by
-- the shape it built them in: one block, one text node, no marks. The five are
-- listed and must be restored from their marked form by running
-- `convertClause()` in reverse — or, more simply, left alone, because a marked
-- document is still a correct document and the readings handle it.

delete from public.clause_revisions where kind = 'baseline';

update public.clauses c
   set doc = null
 where jsonb_array_length(c.doc->'content') = 1
   and jsonb_array_length(coalesce(c.doc->'content'->0->'content','[]'::jsonb)) = 1
   and c.doc::text not like '%"insertion"%'
   and c.doc::text not like '%"deletion"%'
   and c.doc::text not like '%"marks"%';

-- Left deliberately: 4cc8d875 (1.1), 381ae26f (1.2), 8aa2cd70 (1.3),
-- 9b65aee6 (1.5), 0456fb38 (2.4).
