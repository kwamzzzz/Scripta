-- Archiving a matter.
--
-- Until now "I am finished with this" had one answer: delete, which takes the
-- documents, clauses, drafting points and audit trail with it. That is the
-- wrong verb for a legal file. A closed matter is still a record: it may be
-- reopened, it may be asked about years later, and its audit trail is the
-- reason the work can be defended.
--
-- A timestamp rather than a boolean, because when a matter was closed is
-- itself worth knowing, and because "not archived" is then simply null.

alter table public.matters add column archived_at timestamptz;

comment on column public.matters.archived_at is
  'When the matter was archived. Null means active. Archived matters are hidden from the default views but never deleted.';

-- The default listing filters on this, so it is worth an index.
create index matters_workspace_archived_idx on public.matters (workspace_id, archived_at);
