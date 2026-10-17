-- Where a corporate document has got to.
--
-- A lawyer inside the editor had no way of knowing whether the document was
-- finished, and no next action to press. Setup happens before the row exists,
-- and export is something you do rather than somewhere you are, so the stages
-- a saved document can be in are these three: being written, being checked,
-- and settled. A settled document is locked against accidental editing, and
-- the lock is the lawyer's to lift.

alter table public.corporate_documents
  add column if not exists stage text not null default 'drafting';

alter table public.corporate_documents
  drop constraint if exists corporate_documents_stage_check;

alter table public.corporate_documents
  add constraint corporate_documents_stage_check
  check (stage in ('drafting', 'review', 'final'));

comment on column public.corporate_documents.stage is
  'drafting, review or final. Final is locked against editing until the lawyer unlocks it.';

create index if not exists corporate_documents_workspace_stage_idx
  on public.corporate_documents (workspace_id, stage);
