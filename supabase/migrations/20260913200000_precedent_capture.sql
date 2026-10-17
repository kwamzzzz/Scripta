-- Precedents as drafting memory rather than a clause table.
--
-- A precedent's value is its provenance: which matter it came from, which side
-- we acted for, whether it was merely drafted or actually executed, and why it
-- is worth keeping. `source_note` held a sentence of free text, so "where did
-- this wording come from?" could not be answered and the bank aged into a pile
-- of anonymous clauses.
--
-- The source columns are deliberately soft: a precedent outlives the matter it
-- came from, so losing the matter must not lose the drafting.

alter table public.precedents
  add column if not exists kind text not null default 'clause',
  add column if not exists our_role text,
  add column if not exists status text not null default 'draft',
  add column if not exists why_useful text,
  add column if not exists counterparty_type text,
  add column if not exists used_at date,
  add column if not exists matter_id uuid references public.matters(id) on delete set null,
  add column if not exists document_id uuid references public.documents(id) on delete set null,
  add column if not exists clause_id uuid references public.clauses(id) on delete set null,
  add column if not exists source_kind text,
  add column if not exists superseded_by uuid references public.precedents(id) on delete set null,
  add column if not exists playbook_rule_id uuid references public.playbook_rules(id) on delete set null,
  add column if not exists archived_at timestamptz;

alter table public.precedents drop constraint if exists precedents_kind_check;
alter table public.precedents add constraint precedents_kind_check
  check (kind in ('clause', 'section', 'document'));

alter table public.precedents drop constraint if exists precedents_status_check;
alter table public.precedents add constraint precedents_status_check
  check (status in ('draft', 'negotiated', 'approved', 'executed', 'superseded'));

-- Rows written before a status existed said only whether they were approved.
update public.precedents set status = 'approved' where approved and status = 'draft';

comment on column public.precedents.kind is
  'clause, section or document. A lawyer reuses whole agreements as often as single clauses.';
comment on column public.precedents.status is
  'draft, negotiated, approved, executed or superseded. Executed drafting is worth more than drafted.';
comment on column public.precedents.source_kind is
  'Where it was captured from: review, corporate, drafting or flow.';
comment on column public.precedents.superseded_by is
  'A newer precedent for the same drafting. Surfaced, never applied automatically.';

create index if not exists precedents_workspace_status_idx
  on public.precedents (workspace_id, status, archived_at);
create index if not exists precedents_matter_idx on public.precedents (matter_id);
create index if not exists precedents_playbook_rule_idx on public.precedents (playbook_rule_id);
