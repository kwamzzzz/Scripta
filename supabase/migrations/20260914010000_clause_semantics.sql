-- What a provision legally does.
--
-- Everything Scripta records about a provision today is a judgement about its
-- QUALITY: is it lawful, is it market standard, how serious is the problem,
-- where does it sit on the playbook ladder. Nothing records its FUNCTION. A
-- liability cap and a notice period are both "provision / market_standard /
-- medium", and the fact that one caps liability and the other requires notice
-- exists only inside prose no query can reach.
--
-- This is the smallest experiment that tests whether Scripta can change that:
-- two fields, on the provisions review already looks at, from the AI call
-- review already makes. It answers one question — "what obligations does the
-- Supplier have?" — and if it cannot answer that reliably, a richer model
-- would have failed for the same reasons and cost more to find out.
--
-- A table rather than two columns on `clauses`, for one reason. A provision
-- may well contain several legal propositions: "maintain insurance, comply
-- with Applicable Law and ensure each Subcontractor complies" is one provision
-- and three obligations. That decomposition is deliberately not built here,
-- but the day it is, the only thing standing in the way is
-- clause_semantics_one_per_clause. Dropping a constraint is the migration;
-- columns on `clauses` would have been a rewrite.
--
-- `actor` is text, not an enum, because real contracts name their parties
-- Supplier and Buyer, Investor and Manager, Employer and Employee, and a fixed
-- list would force every one of them into the wrong word. Null is a real
-- answer: a definition has no actor, and inventing one would be worse than
-- saying so.
--
-- `source` and `confirmed_at` exist so a lawyer's reading outlives Scripta's.
-- A re-run deletes only what the AI wrote and never touches a confirmed row —
-- the same rule already protecting decided issues and human assessments.

create table public.clause_semantics (
  id uuid primary key default gen_random_uuid(),
  clause_id uuid not null references public.clauses(id) on delete cascade,
  matter_id uuid not null references public.matters(id) on delete cascade,
  -- Thirteen, chosen to be useful, separable and to unlock a workflow.
  -- "remedy" was considered and left out: an indemnity is an obligation to a
  -- lawyer and a remedy to a model, and that ambiguity would have made the
  -- reliability this experiment measures impossible to read.
  function text not null check (function in (
    'obligation','right','prohibition','condition','exception','definition',
    'deadline','payment','liability_limit','termination_right',
    'notice_requirement','approval_requirement','other'
  )),
  actor text,
  source analysis_source not null default 'ai',
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Drop this to allow several propositions per provision. That is the whole
  -- migration path, and it is why this is a table.
  constraint clause_semantics_one_per_clause unique (clause_id)
);

-- "Every obligation on the Supplier in this matter" is the query this exists for.
create index clause_semantics_matter_function_idx
  on public.clause_semantics (matter_id, function);
create index clause_semantics_actor_idx on public.clause_semantics (matter_id, actor);

comment on table public.clause_semantics is
  'What a provision legally does, as interpreted. One row per provision today; the unique constraint is the only thing standing between this and several propositions per provision.';
comment on column public.clause_semantics.actor is
  'Who bears or exercises it, in the contract''s own words: "Supplier", "Both Parties", "Either Party". Null where none applies, as for a definition. Not an enum — real contracts name their parties differently.';
comment on column public.clause_semantics.confirmed_at is
  'Set when a lawyer confirms or corrects the reading. A re-run must never overwrite a row that carries this.';

grant select, insert, update, delete on public.clause_semantics to authenticated;
grant all on public.clause_semantics to service_role;
alter table public.clause_semantics enable row level security;

create policy "members read clause_semantics" on public.clause_semantics
  for select to authenticated using (public.is_matter_member(matter_id));
create policy "writers insert clause_semantics" on public.clause_semantics
  for insert to authenticated with check (public.can_write_matter(matter_id));
create policy "writers update clause_semantics" on public.clause_semantics
  for update to authenticated using (public.can_write_matter(matter_id))
  with check (public.can_write_matter(matter_id));
create policy "writers delete clause_semantics" on public.clause_semantics
  for delete to authenticated using (public.can_write_matter(matter_id));
