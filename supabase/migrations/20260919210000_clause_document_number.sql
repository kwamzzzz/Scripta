-- Renumbering a contract whose own numbering is wrong.
--
-- A renumber changes `num` itself: there is one numbering, and after the
-- lawyer renumbers it is theirs, so "clause 1" means the same clause to them,
-- to the review, to the assistant and in the export. Parts move with their
-- clause, and the references between clauses are remapped with it.
--
-- `document_num` remembers what the uploaded document called the clause, the
-- first time it is renumbered: for "numbered 2.4 in the document", and to put
-- the document's numbering back. Null means the clause has its document number.
alter table public.clauses add column if not exists document_num text;

-- Clause updates are granted column by column (the wording goes through
-- save_clause_doc, never a plain update); the renumber writes this one.
grant update (document_num) on public.clauses to authenticated;

-- A renumber lands whole or not at all. Security invoker: the caller's own
-- rights on clauses apply, exactly as for a plain update.
create or replace function public.renumber_clauses(p_matter uuid, p_changes jsonb, p_reset boolean default false)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update clauses c
     set num = x.to_num,
         document_num = case when p_reset then null else coalesce(c.document_num, c.num) end
    from jsonb_to_recordset(p_changes) as x(id uuid, to_num text)
   where c.id = x.id and c.matter_id = p_matter;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(p_changes) then
    raise exception 'Only % of % clauses could be renumbered; nothing was changed.', n, jsonb_array_length(p_changes);
  end if;
  return n;
end; $$;
revoke all on function public.renumber_clauses(uuid, jsonb, boolean) from public, anon;
grant execute on function public.renumber_clauses(uuid, jsonb, boolean) to authenticated;
