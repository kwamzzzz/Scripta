-- Research becomes a workstation rather than a set of screens.
--
-- The chain a lawyer actually works through is facts → questions → sources →
-- propositions → analysis → draft, and the old tables could only hold the two
-- ends of it. Three things were missing:
--
--   1. A question could not carry its own research or its own analysis. The
--      analysis body was synthesised in the browser from the issue card, which
--      meant the screen showed reasoning nobody had written.
--   2. A source had no provenance and no status. Everything came from one AI
--      answer, so a lawyer could neither add an authority they had found nor
--      record that a provision has since been repealed — the single most
--      useful thing a legal research tool can tell you.
--   3. Nothing could be filed against a research matter. `documents.matter_id`
--      is a non-null reference to `matters`, and a research matter usually has
--      no `matters` row, so the Documents tab could only apologise.
--
-- Columns are added with defaults so every existing row stays valid and the
-- two halves of the save (state vs records) keep owning disjoint columns.

-- A question presented: what it asks, what the research found, and the
-- analysis written on it. `confidence` is a legal state, not a percentage.
alter table public.research_issues
  add column if not exists rule text not null default '',
  add column if not exists application text not null default '',
  add column if not exists counterpoint text not null default '',
  add column if not exists conclusion text not null default '',
  add column if not exists confidence text not null default '',
  add column if not exists research_status text not null default '',
  -- How the authorities lead to the provisional answer. Scripta's own words,
  -- shown as its reasoning and never as the lawyer's analysis.
  add column if not exists reasoning text not null default '';

-- What a source is and whether it can still be relied on. `tier` is primary or
-- secondary, `status` is current/repealed/superseded/unverified, `weight` is
-- binding or persuasive, and `added_by` separates what the model proposed from
-- what a lawyer put there themselves — only the first needs verifying.
alter table public.research_authorities
  add column if not exists tier text not null default '',
  add column if not exists status text not null default '',
  add column if not exists weight text not null default '',
  add column if not exists added_by text not null default 'ai',
  add column if not exists url text not null default '',
  add column if not exists note text not null default '',
  -- Which questions this source is used in, as a comma-separated list of
  -- question numbers. A denormalised convenience: the authoritative link is
  -- the citation on each finding, and this is what the Sources table shows.
  add column if not exists issue_nos text not null default '';

-- A finding belongs to the question it answers. Empty means the matter-level
-- answer, which is what a research matter run before this migration has.
alter table public.research_findings
  add column if not exists issue_no text not null default '';

-- The brief: what the lawyer asked for, and the plan Scripta proposed for it.
alter table public.research_matters
  add column if not exists area_of_law text not null default '',
  -- Free text on purpose: "as at 12 September 2026", "current". The law-as-at
  -- date is a statement in the memo, not a timestamp to compute with.
  add column if not exists law_as_at text not null default '',
  add column if not exists output_kind text not null default '',
  add column if not exists depth text not null default '',
  -- { legislation: [], caseLaw: [], secondary: [], themes: [] } — the research
  -- plan, edited as lists and never queried across matters.
  add column if not exists plan jsonb not null default '{}'::jsonb;

-- Documents filed against a research matter: the instructing email, the
-- contract under advice, a downloaded judgment. Bytes live in the existing
-- private `matter-documents` bucket, whose storage policies already authorize
-- paths whose first segment is a workspace id, so the path is constrained the
-- way a letterhead's is.
create table if not exists public.research_documents (
  id uuid primary key default gen_random_uuid(),
  research_matter_id uuid not null references public.research_matters(id) on delete cascade,
  -- Denormalised from the parent so the storage path can be constrained and
  -- the workspace is known without a join.
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  mime_type text not null default '',
  bytes bigint not null default 0,
  -- What the document is to this research: instruction, evidence, authority,
  -- or background.
  kind text not null default 'background',
  note text not null default '',
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  constraint research_documents_path_in_workspace check (
    storage_path like workspace_id::text || '/research/%'
  )
);

grant select, insert, update, delete on public.research_documents to authenticated;
grant all on public.research_documents to service_role;
alter table public.research_documents enable row level security;
create policy "members read research documents" on public.research_documents for select to authenticated
  using (public.is_research_member(research_matter_id));
create policy "writers insert research documents" on public.research_documents for insert to authenticated
  with check (public.can_write_research(research_matter_id));
create policy "writers update research documents" on public.research_documents for update to authenticated
  using (public.can_write_research(research_matter_id))
  with check (public.can_write_research(research_matter_id));
create policy "writers delete research documents" on public.research_documents for delete to authenticated
  using (public.can_write_research(research_matter_id));
create index if not exists research_documents_matter_idx
  on public.research_documents (research_matter_id, created_at desc);
