-- Archive wherever there is a Delete.
--
-- Matters and documents could already be put aside; every other reusable item
-- could only be destroyed. A lawyer clearing a stale playbook out of the
-- workspace had to choose between leaving clutter and losing the drafting in
-- it. `archived_at` is the same shape it already has on matters: null means
-- live, a timestamp means put aside, and nothing is lost either way.

alter table public.playbooks add column if not exists archived_at timestamptz;
alter table public.templates add column if not exists archived_at timestamptz;
alter table public.corporate_documents add column if not exists archived_at timestamptz;
alter table public.research_matters add column if not exists archived_at timestamptz;
alter table public.flow_presets add column if not exists archived_at timestamptz;
alter table public.flow_preset_families add column if not exists archived_at timestamptz;

comment on column public.playbooks.archived_at is
  'Put aside and out of the active workspace. Null means live.';
comment on column public.templates.archived_at is
  'Put aside and out of the active workspace. Null means live.';
comment on column public.corporate_documents.archived_at is
  'Put aside and out of the active workspace. Null means live.';
comment on column public.research_matters.archived_at is
  'Put aside and out of the active workspace. Null means live.';
comment on column public.flow_presets.archived_at is
  'Put aside and out of the active workspace. Null means live.';
comment on column public.flow_preset_families.archived_at is
  'Put aside and out of the active workspace. Null means live.';

-- The live list is the common read on every one of these.
create index if not exists playbooks_workspace_archived_idx
  on public.playbooks (workspace_id, archived_at);
create index if not exists templates_workspace_archived_idx
  on public.templates (workspace_id, archived_at);
create index if not exists corporate_documents_workspace_archived_idx
  on public.corporate_documents (workspace_id, archived_at);
create index if not exists research_matters_workspace_archived_idx
  on public.research_matters (workspace_id, archived_at);
create index if not exists flow_presets_workspace_archived_idx
  on public.flow_presets (workspace_id, archived_at);
create index if not exists flow_preset_families_workspace_archived_idx
  on public.flow_preset_families (workspace_id, archived_at);
