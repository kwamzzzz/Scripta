-- Deleting stops being the end of the story.
--
-- Scripta had two lifecycles: Archive, which is reversible and never asks,
-- and Delete, which was final and always asked. That is a coherent pair, but
-- it put the whole weight of the decision on one click. A lawyer who deletes
-- the wrong matter at half past six has no recourse at all.
--
-- So Delete now moves a record to Recently Deleted and it stays there for
-- fifteen days before it is removed for good. Archive keeps its meaning —
-- "I am done with this, keep it" — and Delete becomes "get rid of this",
-- with a grace period rather than a cliff.
--
-- The important consequence is in the words, not the schema: every delete
-- dialog in Scripta says "This cannot be undone", and after this that
-- sentence is false. It is replaced wherever a record goes to the bin. A
-- confirmation that overstates what it is doing teaches people to ignore
-- confirmations.
--
-- Scope is deliberate. Only records that live in a collection get a bin,
-- because Recently Deleted is itself a collection and a lawyer recovers
-- things from where they were. The parts of a record — a position inside a
-- playbook, a section inside a template — are not records, and a global bin
-- full of orphaned fragments with nothing to return them to would be worse
-- than the current behaviour. Those still delete outright, and still ask.

alter table public.matters              add column if not exists deleted_at timestamptz;
alter table public.documents            add column if not exists deleted_at timestamptz;
alter table public.playbooks            add column if not exists deleted_at timestamptz;
alter table public.templates            add column if not exists deleted_at timestamptz;
alter table public.corporate_documents  add column if not exists deleted_at timestamptz;
alter table public.research_matters     add column if not exists deleted_at timestamptz;
alter table public.flow_presets         add column if not exists deleted_at timestamptz;
alter table public.flow_preset_families add column if not exists deleted_at timestamptz;
alter table public.precedents           add column if not exists deleted_at timestamptz;
alter table public.contract_drafts      add column if not exists deleted_at timestamptz;

comment on column public.matters.deleted_at is
  'In Recently Deleted since this moment. Purged fifteen days later. Null means live.';

-- Every collection filters on it, so every collection wants it indexed.
create index if not exists matters_deleted_idx              on public.matters (workspace_id, deleted_at);
create index if not exists documents_deleted_idx            on public.documents (deleted_at);
create index if not exists playbooks_deleted_idx            on public.playbooks (workspace_id, deleted_at);
create index if not exists templates_deleted_idx            on public.templates (workspace_id, deleted_at);
create index if not exists corporate_documents_deleted_idx  on public.corporate_documents (workspace_id, deleted_at);
create index if not exists research_matters_deleted_idx     on public.research_matters (workspace_id, deleted_at);
create index if not exists flow_presets_deleted_idx         on public.flow_presets (workspace_id, deleted_at);
create index if not exists flow_preset_families_deleted_idx on public.flow_preset_families (workspace_id, deleted_at);
create index if not exists precedents_deleted_idx           on public.precedents (workspace_id, deleted_at);
create index if not exists contract_drafts_deleted_idx      on public.contract_drafts (workspace_id, deleted_at);

-- The fifteen days, in one place. Both the purge and the sentence a lawyer
-- reads come from here, so they cannot disagree.
create or replace function public.recently_deleted_days()
returns integer language sql immutable as $$ select 15 $$;

/**
 * Remove for good everything whose grace period has run out.
 *
 * Written as a function rather than a scheduled job alone so that correctness
 * does not depend on a scheduler existing: the app calls it when Recently
 * Deleted is opened, and a cron entry calls it when nobody does. Running it
 * twice is harmless.
 *
 * SECURITY DEFINER because purging is a caretaking act, not a user action —
 * it must clear expired rows from every workspace, not only the caller's.
 * It can only ever delete rows already past the cut-off, which is why that is
 * safe: there is no argument, so there is nothing for a caller to widen.
 */
create or replace function public.purge_recently_deleted()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  removed integer := 0;
  n integer;
  cut timestamptz := now() - make_interval(days => public.recently_deleted_days());
begin
  foreach t in array array[
    'matters', 'documents', 'playbooks', 'templates', 'corporate_documents',
    'research_matters', 'flow_presets', 'flow_preset_families', 'precedents',
    'contract_drafts'
  ] loop
    execute format('delete from public.%I where deleted_at is not null and deleted_at < $1', t)
      using cut;
    get diagnostics n = row_count;
    removed := removed + n;
  end loop;
  return removed;
end $$;

revoke all on function public.purge_recently_deleted() from public;
grant execute on function public.purge_recently_deleted() to authenticated;
grant execute on function public.recently_deleted_days() to authenticated;
