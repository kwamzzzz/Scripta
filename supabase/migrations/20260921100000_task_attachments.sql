-- A task carries its own files.
--
-- Correspondence already held attachments, but only on a message: the only way
-- to put a document on a task was to pretend it arrived in an email. Most of
-- what a lawyer attaches is not correspondence — it is the draft being worked
-- on, the ID that has to go with the filing, the portal the thing is submitted
-- through — so the task itself holds them.
--
-- jsonb on the task, the way `checklist`, `email_draft` and `threads` already
-- are: they belong to exactly one task, they are read whenever the task is
-- read, and nothing queries inside them. Three kinds live in the one column
-- and are told apart by `kind`:
--   file      bytes uploaded to the matter-documents bucket; `fileRef` is the path
--   document  a document Scripta already holds; `documentId` and its storage path,
--             never a second copy of the bytes
--   link      an address and nothing else; `url` is set and `fileRef` is empty
--
-- The draft's own attachments ride on `email_draft.attachments` rather than
-- here, because what goes out with an email is a different fact from what the
-- task holds, and they move onto the thread entry when the draft is marked sent.

alter table public.tasks
  -- Attachment[]: id, name, kind, fileRef, documentId?, url?, bytes, mime, addedAt.
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.tasks.attachments is
  'Files, linked documents and links kept on this task. Bytes live in the matter-documents bucket; only metadata is here.';
