-- The memo's words were plain strings, so the composer's ribbon — undo, redo,
-- heading, font, bold, italic, underline, alignment, numbering, indent — was
-- drawn but did nothing. A memo is a document a lawyer signs their name to, so
-- it needs the formatting a string cannot hold.
--
-- `doc` on each section, and `memo_intro_doc` on the matter, hold the editor
-- document (ProseMirror JSON). `body` and `memo_intro` remain the plain text of
-- that document and stay in step with it, so everything that reads the memo as
-- text — the citation checker, the pinned-passage insert, the export — is
-- unaffected. Both are null for a memo written before this migration, which
-- reads exactly as it always did.
alter table public.research_memo_sections
  add column if not exists doc jsonb;

alter table public.research_matters
  add column if not exists memo_intro_doc jsonb;

comment on column public.research_memo_sections.doc is
  'The section as an editor document (ProseMirror JSON). Null means the section is exactly its body text.';

comment on column public.research_matters.memo_intro_doc is
  'The memo introduction as an editor document (ProseMirror JSON). Null means it is exactly memo_intro.';
