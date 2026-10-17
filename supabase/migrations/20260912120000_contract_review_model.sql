-- Contract review becomes a decision-making process rather than a document.
--
-- Everything in the review used to hang off one row. A clause carried its own
-- analysis, its own single suggested wording, its own risk and its own status,
-- which meant a clause and an issue were the same object. That is why the
-- matter drawer could say "56 clauses · 56 open items": a lawyer can review
-- fifty-six clauses and find eight things worth deciding, and the model had no
-- way to say so.
--
-- Six objects, separately:
--
--   Clause       a structural part of the document            (clauses)
--   Assessment   Scripta's reading of one clause              (clause_assessments)
--   Issue        something that needs a decision              (contract_issues)
--   Instruction  something the lawyer told Scripta            (comments, kind='instruction')
--   Decision     what the lawyer decided                      (on the issue, plus audit_events)
--   Amendment    a proposed change to the words               (contract_amendments)
--
-- One clause can then carry three assessments, two issues, one instruction,
-- two proposed amendments and one accepted one, and each of those can be
-- counted, filtered and reported on its own terms.

/* ------------------------------------------------------------ assessment -- */

-- clause_assessments was a playbook verdict and nothing else: a rule id, a
-- verdict and a line of detail. It becomes the general reading of a clause,
-- of which a playbook comparison is one kind. The table is empty, so widening
-- the verdict is safe: it is meaningful only where a playbook rule was applied.
alter table public.clause_assessments
  alter column verdict drop not null;

alter table public.clause_assessments
  -- legal, commercial, drafting, playbook, or standard where the clause is
  -- unremarkable and the assessment exists to say so.
  add column if not exists kind text not null default 'legal',
  add column if not exists severity text not null default 'low',
  add column if not exists summary text not null default '',
  -- What the clause means for the party we act for, which is not the same as
  -- what it means in the abstract.
  add column if not exists client_impact text not null default '',
  add column if not exists recommendation text not null default '',
  -- [{ cite, kind, status }] — the authority the reading rests on.
  add column if not exists authorities jsonb not null default '[]'::jsonb;

create index if not exists clause_assessments_clause_idx
  on public.clause_assessments (clause_id, created_at desc);

/* ---------------------------------------------------------------- issue -- */

create table if not exists public.contract_issues (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters(id) on delete cascade,
  -- An issue outlives the clause it was raised on: re-parsing a document
  -- rebuilds the clauses, and a decision already taken must survive that.
  clause_id uuid references public.clauses(id) on delete set null,
  -- Where it came from, when Scripta raised it.
  assessment_id uuid references public.clause_assessments(id) on delete set null,
  -- The number a lawyer refers to it by: #07. Unique within the matter.
  ref integer not null,
  kind text not null default 'legal',
  severity text not null default 'medium',
  title text not null,
  detail text not null default '',
  recommendation text not null default '',
  -- open, resolved, dismissed. A dismissed issue is kept: "we considered this
  -- and decided it did not matter" is itself a record worth having.
  status text not null default 'open',
  decision_note text not null default '',
  decided_by uuid,
  decided_at timestamptz,
  source public.analysis_source not null default 'ai',
  ordinal integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (matter_id, ref)
);

/* ------------------------------------------------------------ amendment -- */

create table if not exists public.contract_amendments (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters(id) on delete cascade,
  clause_id uuid not null references public.clauses(id) on delete cascade,
  -- The issue this answers, where it answers one.
  issue_id uuid references public.contract_issues(id) on delete set null,
  proposed_text text not null default '',
  rationale text not null default '',
  -- ai, human, playbook or precedent: where the wording came from.
  origin text not null default 'ai',
  -- proposed, accepted, rejected. Accepting writes the words into the clause
  -- as a tracked change; the row stays, so the trail survives the acceptance.
  status text not null default 'proposed',
  decided_by uuid,
  decided_at timestamptz,
  ordinal integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/* ------------------------------------------------------------- key term -- */

-- The contract's own terms, by contract type. A summary that shows "Principal,
-- Annual interest, Default interest" over an employment agreement is showing a
-- financing schema to a lawyer reading about probation and notice. What a
-- contract's key terms ARE depends on what kind of contract it is, so they are
-- rows keyed by the schema for that type rather than fixed columns.
create table if not exists public.contract_key_terms (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters(id) on delete cascade,
  -- The schema key: "probation", "notice_period", "share_capital".
  term_key text not null,
  label text not null,
  value text not null default '',
  -- Where in the document it was found, so the reader can check it.
  clause_id uuid references public.clauses(id) on delete set null,
  source public.analysis_source not null default 'ai',
  ordinal integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (matter_id, term_key)
);

/* --------------------------------------------------------- the mandate -- */

-- Who we act for and what success looks like. More important to the review
-- than the matter reference, and currently nowhere: Scripta has been reading
-- contracts without being told whose side it is on.
alter table public.matters
  add column if not exists review_for text not null default '',
  add column if not exists review_role text not null default '',
  add column if not exists review_instructions text not null default '',
  add column if not exists review_depth text not null default '',
  add column if not exists review_priorities text[] not null default '{}',
  -- Set when the whole document has been read, so the screens can tell "no
  -- issues found" from "not looked at yet" — which are not the same thing.
  add column if not exists reviewed_at timestamptz;

/* ------------------------------------------------- research from review -- */

-- A research matter raised from a clause keeps its anchor, so the answer can
-- come back to the clause that asked the question.
alter table public.research_matters
  add column if not exists source_clause_id uuid references public.clauses(id) on delete set null,
  add column if not exists source_issue_id uuid references public.contract_issues(id) on delete set null;

/* -------------------------------------------------------------- access -- */

do $$
declare t text;
begin
  foreach t in array array['contract_issues', 'contract_amendments', 'contract_key_terms'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "members read %1$s" on public.%1$I for select to authenticated
         using (public.is_matter_member(matter_id))', t);
    execute format(
      'create policy "writers insert %1$s" on public.%1$I for insert to authenticated
         with check (public.can_write_matter(matter_id))', t);
    execute format(
      'create policy "writers update %1$s" on public.%1$I for update to authenticated
         using (public.can_write_matter(matter_id))
         with check (public.can_write_matter(matter_id))', t);
    execute format(
      'create policy "writers delete %1$s" on public.%1$I for delete to authenticated
         using (public.can_write_matter(matter_id))', t);
    execute format('create index on public.%I (matter_id, ordinal)', t);
  end loop;
end $$;

create index if not exists contract_issues_clause_idx on public.contract_issues (clause_id);
create index if not exists contract_amendments_clause_idx on public.contract_amendments (clause_id, status);
