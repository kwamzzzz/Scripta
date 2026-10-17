-- A clause's words used to be a string, because the redline only ever needed
-- words. Formatting a lawyer actually uses — bold, italics, underlining, a
-- link on a defined term, a sub-list, a rates table — has nowhere to live in a
-- string, which is why the editor's formatting tools were drawn but inert.
--
-- `doc` holds the clause as an editor document (ProseMirror JSON). It is null
-- for every clause written before this migration and for every clause nobody
-- has formatted: those are still exactly their text, and the plain text the
-- diff engine compares is derived from this column when it is present. The
-- redline itself stays in clause_segments, so nothing that reads a clause today
-- has to change.
alter table public.clauses
  add column if not exists doc jsonb;

comment on column public.clauses.doc is
  'The clause as an editor document (ProseMirror JSON). Null means the clause is plain text, held as segments.';
