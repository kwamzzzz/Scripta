-- A task keeps its own correspondence: the draft that is never sent, and the
-- replies that came back.
--
-- Both are jsonb on the task, the way `checklist` already is. They belong to
-- exactly one task, they are read every time the task is read, and nothing
-- queries inside them except the search the client already does over the task
-- it has in hand — so a table of their own would buy a join and nothing else.
--
-- Attachment bytes are not here. A thread's attachments carry a `fileRef` into
-- the browser's IndexedDB store, which is where Flow's attachments live too;
-- when the storage bucket write exists, both move together.

alter table public.tasks
  -- { to, subject, body, updatedAt } — null until an email is drafted.
  add column if not exists email_draft jsonb,
  -- ThreadEntry[]: id, author, receivedAt?, text, searchText, attachments[], createdAt.
  add column if not exists threads jsonb not null default '[]'::jsonb;

comment on column public.tasks.email_draft is
  'Unsent email draft for this task: to, subject, body, updatedAt. Scripta never sends.';
comment on column public.tasks.threads is
  'Replies logged against this task, pasted verbatim, with a folded searchText and attachment metadata.';
