-- PHASE 5, STEP 2b: 417 clauses move from segments to marks.
--
-- The only part of Phase 5 that touches existing legal text. Run against the
-- live matter on 16 September 2026, in pieces, each verifying itself.
--
-- ---------------------------------------------------------------------------
-- WHAT THE DATA ACTUALLY LOOKED LIKE
-- ---------------------------------------------------------------------------
--
--   417 clauses, every one with segments
--     4 carrying a redline at all — the rest are entirely `n`
--     5 with a ProseMirror document, four of which are the redlined four
--
-- So the migration is overwhelmingly trivial and has exactly four interesting
-- rows. That is worth stating, because it is the reason this could be done
-- carefully by hand rather than by a script nobody reads.
--
-- ---------------------------------------------------------------------------
-- THE DOCUMENT WINS, AND CLAUSE 1.5 IS WHY
-- ---------------------------------------------------------------------------
--
-- `wordDiff()` runs on `normalizeText()`, which collapses all whitespace, so
-- segments hold no paragraphs, no lists and no tables. Clause 1.5 has a
-- two-column table whose entire contents the old model recorded as ONE
-- insertion of the concatenated cell text. Rebuilding that clause from its
-- segments would have destroyed a table on live legal text.
--
-- Hence `convertClause()` in `src/wireframe/segments-to-marks.ts`, and its four
-- routes: keep the document where there is no redline; rebuild from segments
-- where the document is flat and so holds nothing more than its words; mark the
-- document in place where it has structure; and REFUSE where a structured
-- document also has deletions, because putting deleted wording back inside a
-- table is a guess. No clause was in that fourth state.
--
-- ---------------------------------------------------------------------------
-- WHAT RAN
-- ---------------------------------------------------------------------------
--
-- 1. The 413 clauses with no redline got a document built from their segments,
--    below. Existing documents were never overwritten.
-- 2. The 4 redlined clauses were converted by `convertClause()` — the product's
--    own code, not a second implementation in SQL — and applied individually by
--    id. Their converted documents are not reproduced in this file: they are
--    the client's contract text, and this repository is not where that belongs.
--    They are reproducible at any time by running the converter against the
--    segments, which are still in place.
--
--      4cc8d875-a232-4141-aedd-64f7be1e2033  clause 1.1  rebuilt, 5 changes
--      8aa2cd70-90fa-461e-ad97-9ea58d73dbef  clause 1.3  rebuilt, 1 change
--      9b65aee6-2ba8-49a3-b93e-cc957e58fd9d  clause 1.5  marked in place, table kept
--      0456fb38-c45d-406c-bbcc-ee44971d2242  clause 2.4  rebuilt, 1 change
--
-- 3. Every clause got its baseline revision.
--
-- ---------------------------------------------------------------------------
-- NOTHING IS DELETED
-- ---------------------------------------------------------------------------
--
-- `clause_segments` is untouched — all 428 rows. It remains the table the
-- existing screens read, and it is the fallback from which any clause can be
-- reconverted. Retiring it is a separate decision taken after step 3, when the
-- editor writes documents and the segment-writing path is removed in the same
-- change rather than left running alongside.
--
-- ---------------------------------------------------------------------------
-- VERIFIED, ON LIVE DATA, AFTER THE ROUND TRIP THROUGH POSTGRES
-- ---------------------------------------------------------------------------
--
-- For each redlined clause, three independent representations were compared and
-- agreed exactly:
--
--   Operative derived from the stored document
--   the original rebuilt from the old segments
--   the stored baseline revision
--
-- An earlier run of this migration REFUSED ITSELF — its wording check read only
-- the first text node of a document, and clause 1.2 has three because one word
-- is bold. The check was wrong, not the data. It is recorded because a
-- migration that stops on its own check is the behaviour to want.

-- ---------------------------------------------------------------------------
-- 1. Every clause with no redline
-- ---------------------------------------------------------------------------

with joined as (
  select s.clause_id, rtrim(string_agg(s.text, '' order by s.ordinal)) as txt
    from public.clause_segments s
   where not exists (select 1 from public.clause_segments x
                      where x.clause_id = s.clause_id and x.kind::text <> 'n')
   group by s.clause_id
)
update public.clauses c
   set doc = jsonb_build_object('type','doc','content', jsonb_build_array(
         case when j.txt = '' then jsonb_build_object('type','paragraph')
              else jsonb_build_object('type','paragraph','content',
                     jsonb_build_array(jsonb_build_object('type','text','text', j.txt))) end))
  from joined j
 where c.id = j.clause_id
   and c.doc is null;   -- never overwrite a document that already exists

-- ---------------------------------------------------------------------------
-- 2. The four redlined clauses: applied separately, see the header
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. A baseline for every clause
-- ---------------------------------------------------------------------------
--
-- Not a history convenience. Accepting a change removes its mark, so once
-- anything is accepted the document stops containing the wording it started
-- from. If the baseline is not written, "as received" is gone.

insert into public.clause_revisions (clause_id, matter_id, doc, kind, label)
select c.id, c.matter_id, c.doc, 'baseline', 'As received'
  from public.clauses c
 where not exists (select 1 from public.clause_revisions r
                    where r.clause_id = c.id and r.kind = 'baseline');

-- ---------------------------------------------------------------------------
-- 4. The migration refuses itself rather than half-finishing
-- ---------------------------------------------------------------------------

do $$
declare bad integer;
begin
  select count(*) into bad from public.clauses where doc is null;
  if bad > 0 then raise exception 'Refusing: % clauses have no document.', bad; end if;

  select count(*) into bad from public.clauses c
   where (select count(*) from public.clause_revisions r
           where r.clause_id = c.id and r.kind = 'baseline') <> 1;
  if bad > 0 then raise exception 'Refusing: % clauses lack exactly one baseline.', bad; end if;

  -- Every clause this migration BUILT holds exactly its segments' words. A
  -- clause that already had a document is excluded by shape, because it was
  -- kept rather than built.
  select count(*) into bad from public.clauses c
   where jsonb_array_length(c.doc->'content') = 1
     and jsonb_array_length(coalesce(c.doc->'content'->0->'content','[]'::jsonb)) = 1
     and not exists (select 1 from public.clause_segments x
                      where x.clause_id = c.id and x.kind::text <> 'n')
     and rtrim(c.doc->'content'->0->'content'->0->>'text') is distinct from
         rtrim((select coalesce(string_agg(s.text,'' order by s.ordinal),'')
                  from public.clause_segments s where s.clause_id = c.id));
  if bad > 0 then raise exception 'Refusing: % built clauses lost their wording.', bad; end if;
end $$;
