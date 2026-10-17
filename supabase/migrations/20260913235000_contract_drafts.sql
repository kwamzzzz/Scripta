-- Contract Drafting gets somewhere to keep work in progress.
--
-- Contract Drafting is the only tool in Scripta with no collection in front of
-- it: clicking it in the sidebar opens a new-contract wizard at stage "brief".
-- That is not merely an entry-behaviour inconsistency. Nothing the wizard
-- produces is written down until the moment it is accepted — the brief, the
-- approved clause plan and every drafted clause live in React state and are
-- gone on a refresh. A lawyer who plans a forty-clause agreement before lunch
-- has nothing to come back to.
--
-- The finished contract already has a home: acceptDraft creates a matter, a
-- document and its clauses, and that is right — an accepted contract is a
-- contract, not a draft. What has no home is the work before that point.
--
-- Its own table rather than columns on `matters` or a row in `documents`:
--   - A draft has no matter yet. Most begin before the mandate is opened, and
--     matter_id stays null until one exists, which a column on `matters`
--     cannot express.
--   - `documents` holds a document that exists. A plan of clauses that have
--     not been drafted is not one, and forcing it in would mean every consumer
--     of `documents` learning to skip rows with no text.
--   - The shape is genuinely different: a stage, a plan, and per-clause
--     drafting outcomes, none of which any other table wants.
--
-- plan and outcomes are jsonb because, unlike a flow deliverable, nothing
-- outside this table ever references an individual clause in a draft. They are
-- read and written whole, by one screen. When a clause does become referable
-- it will be because the draft was accepted, and it will then be a real row in
-- `clauses`.

create table public.contract_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Null until the draft belongs to a mandate. Most start before one exists.
  matter_id uuid references public.matters(id) on delete set null,
  -- What the lawyer calls it while it is being written. Becomes the matter
  -- title on acceptance, which is why it is required from the first save.
  title text not null,
  agreement_type text not null default '',
  governing_law text not null default '',
  instructions text not null default '',
  -- Where the work has got to. The wizard's own three steps, so a draft
  -- reopens where it was left rather than at the beginning.
  stage text not null default 'brief' check (stage in ('brief', 'plan', 'draft')),
  -- ContractPlan: agreementType, governingLaw and the approved clause skeleton.
  -- Null until a plan has been proposed and approved.
  plan jsonb,
  -- ClauseDraftOutcome[]: the drafted text per clause, with its failures, so a
  -- part-drafted contract survives a refresh and a single clause can be retried.
  outcomes jsonb not null default '[]'::jsonb,
  -- What it became. Set once, on acceptance, and the draft is then history:
  -- the contract itself lives in documents and clauses from that point.
  accepted_at timestamptz,
  accepted_matter_id uuid references public.matters(id) on delete set null,
  -- Archive is reversible and never asks; delete asks and is final. Same
  -- column, same vocabulary and same shared helpers as every other collection.
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A draft must not name a matter it became without saying when. The reverse
  -- is allowed on purpose: accepted_matter_id is nulled if that matter is later
  -- deleted, and accepted_at still records that acceptance happened. Requiring
  -- both would make deleting an accepted matter fail the check and abort the
  -- delete, so a draft would be able to block a matter from being removed.
  constraint contract_drafts_accepted_pair check (
    accepted_matter_id is null or accepted_at is not null
  )
);

-- The library's default view: this workspace's live drafts, newest work first.
create index contract_drafts_workspace_idx
  on public.contract_drafts (workspace_id, archived_at, updated_at desc);
create index contract_drafts_matter_idx on public.contract_drafts (matter_id);

comment on table public.contract_drafts is
  'A contract being planned and drafted. Becomes a matter, document and clauses on acceptance.';
comment on column public.contract_drafts.stage is
  'brief, plan or draft — where the wizard left off, so it reopens there.';
comment on column public.contract_drafts.plan is
  'ContractPlan. Read and written whole; nothing outside this table references a clause in it.';
comment on column public.contract_drafts.accepted_matter_id is
  'The matter this draft became, while that matter exists. Nulled if the matter is later deleted — accepted_at still records that acceptance happened.';

grant select, insert, update, delete on public.contract_drafts to authenticated;
grant all on public.contract_drafts to service_role;
alter table public.contract_drafts enable row level security;

create policy "members read contract_drafts" on public.contract_drafts
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "writers insert contract_drafts" on public.contract_drafts
  for insert to authenticated
  with check (public.can_write_workspace(workspace_id));

create policy "writers update contract_drafts" on public.contract_drafts
  for update to authenticated
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));

create policy "writers delete contract_drafts" on public.contract_drafts
  for delete to authenticated
  using (public.can_write_workspace(workspace_id));
