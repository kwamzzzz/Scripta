-- Inserting a clause into a document that has already been read.
--
-- Two things are needed for it, and neither is a new table.
--
-- 1. THE REGISTER HAS TO MAKE ROOM. `ordinal` is the order clauses are read,
--    written and exported in, and a clause going in at position six means
--    everything from six down moves by one. That is one statement here and
--    eighty round trips from the application, which is why it is a function:
--    the shift and the insert are one transaction, so a register cannot be
--    left half-shifted by a dropped connection.
--
--    `security invoker`, so the caller's own row-level security decides
--    whether they may write to this matter. A definer function here would be
--    a way to write to any matter in the database.
--
-- 2. THE DOCUMENT HAS TO KNOW WHICH CLAUSES ARE NOT ITS OWN. A clause we
--    drafted has no counterpart in the counterparty's file, so when the file
--    is read again — which rebuilds the register from scratch — it would be
--    deleted without anyone being told. `drafted_here` marks it, and
--    `extractClauses` keeps those rows and puts them back where they were.
--
-- Numbering is deliberately NOT this function's business. The clause is given
-- the number it is handed, and the application offers "5.2A" for a clause
-- inserted after 5.2 — see `suggestClauseNumber`. Nothing is renumbered, ever:
-- the document's own cross-references are prose, and a register that renumbers
-- itself leaves every one of them pointing at the wrong provision.

alter table public.clauses
  add column if not exists drafted_here boolean not null default false;

comment on column public.clauses.drafted_here is
  'True for a clause written in Scripta rather than read out of the document. Survives a re-read.';

create or replace function public.insert_clause(
  _matter uuid,
  _after uuid,
  _num text,
  _title text
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  _at integer;
  _id uuid;
begin
  if _after is null then
    /* Before everything: one below the first clause there is. */
    _at := coalesce((select min(ordinal) from clauses where matter_id = _matter), 1) - 1;
  else
    select ordinal into _at from clauses where id = _after and matter_id = _matter;
    if _at is null then
      raise exception 'That clause is not on this matter';
    end if;
  end if;

  update clauses
     set ordinal = ordinal + 1
   where matter_id = _matter
     and ordinal > _at;

  insert into clauses (matter_id, source_document_id, num, title, status, ordinal, drafted_here)
  values (_matter, null, coalesce(_num, ''), coalesce(_title, ''), 'Open', _at + 1, true)
  returning id into _id;

  return _id;
end
$$;

grant execute on function public.insert_clause(uuid, uuid, text, text) to authenticated;
