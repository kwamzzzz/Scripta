-- Career progression: what a role asks of you, and what you can prove you did.
--
-- Five tables, and the shape of them is the whole argument.
--
-- A ROLE is a job description, role profile or competency framework, kept
-- verbatim. The original text is never replaced by what was made of it: a
-- lawyer reading their progression must be able to go back to the words the
-- firm actually wrote.
--
-- CRITERIA are those words broken into the things that can be evidenced one at
-- a time. They belong to one role, because two firms asking for "drafting
-- experience" are not asking the same question.
--
-- EVIDENCE is the opposite: it belongs to the person, not to a role. The same
-- transaction proves something about drafting, about client handling and about
-- managing a deadline, and it proves those things in an application to one
-- firm and a promotion case in another. So evidence is stored once and claimed
-- many times, which is what career_claims is for. A store per role would mean
-- a lawyer re-typing their own career every time they looked at a new job, and
-- would make a Career Ledger, a CV or an appraisal into three more copies.
--
-- LINKS point evidence at work Scripta already holds — the matter, the
-- document, the task, the deliverable, the research, the transcript, the
-- precedent — using `source_kind`, the vocabulary the rest of the app already
-- speaks. A link is a reference, never a copy: the work stays where it is,
-- under its own access rules, and if the lawyer later loses access to it the
-- evidence still carries the label of what it was.
--
-- ALL OF IT IS PRIVATE TO ITS AUTHOR, on the same argument the work report
-- makes at length: a record of what one person has done, readable by their
-- firm, is surveillance, and the day it becomes surveillance is the day people
-- stop writing honestly in it. A supervisor sees the work itself — the matter,
-- the deliverable, the approval — where they have access to it. If a lawyer
-- ever wants to show their progression to somebody, that is an export they
-- choose to make, not a door left open.

create table public.career_roles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null default '',
  -- The firm, chambers or authority whose role this is.
  organisation text not null default '',
  -- What the document is: a job description, a role profile, or a competency
  -- framework a professional body publishes.
  kind text not null default 'jd' check (kind in ('jd', 'role_profile', 'framework')),
  /* The original, kept verbatim and never rewritten. */
  source_text text not null default '',
  /* An uploaded copy, where there is one: a path in the documents bucket. */
  file_ref text,
  file_name text,
  note text not null default '',
  /* When the lawyer means to be ready for it. Not a deadline anybody set. */
  target_on date,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index career_roles_author_idx on public.career_roles (created_by, workspace_id, updated_at desc);

create table public.career_criteria (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role_id uuid not null references public.career_roles(id) on delete cascade,
  /* What kind of requirement this is, in the words job descriptions use. */
  kind text not null default 'responsibility'
    check (kind in ('responsibility', 'skill', 'competency', 'qualification', 'experience')),
  /* The heading it sat under in the original, where it had one. */
  section text not null default '',
  /* The requirement itself, as close to the original wording as possible. */
  text text not null default '',
  note text not null default '',
  /* Job descriptions distinguish these, so the assessment does too. */
  essential boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index career_criteria_role_idx on public.career_criteria (role_id, sort_order);

create table public.career_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null default '',
  /* What kind of professional experience this is. */
  kind text not null default 'work'
    check (kind in ('work', 'matter', 'responsibility', 'research', 'advice',
                    'achievement', 'training', 'feedback', 'statement', 'other')),
  /*
   * WHAT YOU DID, YOUR ROLE IN IT, HOW HARD IT WAS, WHAT CAME OF IT.
   * The written statement. It is where a lawyer says the things a link to a
   * document cannot say — and it is also where "I know how to do this" gets
   * written, which is why it is never enough on its own.
   */
  statement text not null default '',
  outcome text not null default '',
  /*
   * How far in you were. This is the distinction the whole assessment turns
   * on, and it is the lawyer's own answer, not a guess from a timestamp:
   *   exposure     you saw it done
   *   assisted     you did part of it, supervised
   *   performed    you did it, with review
   *   independent  you did it on your own judgement
   *   led          you owned it: the decisions and the outcome were yours
   */
  level text not null default 'performed'
    check (level in ('exposure', 'assisted', 'performed', 'independent', 'led')),
  /* Once is a fact; many times is a capability. */
  repetition text not null default 'once'
    check (repetition in ('once', 'several', 'routine')),
  complexity text not null default 'standard'
    check (complexity in ('routine', 'standard', 'complex')),
  /* When the work happened. Recency is part of the reading, not a ranking. */
  happened_on date,
  through_to date,
  /* Somebody who saw it and would say so. A name, not an approval workflow. */
  corroborated_by text not null default '',
  /* An uploaded file: a path in the documents bucket. */
  file_ref text,
  file_name text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index career_evidence_author_idx on public.career_evidence (created_by, workspace_id, happened_on desc);

-- What in Scripta this evidence points at. `source_kind` is the app's existing
-- vocabulary, so a matter, a document, a task, a deliverable, a research run, a
-- transcript, a precedent and a clause are all sayable without a new one.
create table public.career_evidence_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  evidence_id uuid not null references public.career_evidence(id) on delete cascade,
  kind public.source_kind not null,
  ref_id uuid not null,
  /* What it was called when it was linked, so the evidence still reads when
     the work is archived, renamed, or no longer yours to open. */
  label text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (evidence_id, kind, ref_id)
);

create index career_evidence_links_evidence_idx on public.career_evidence_links (evidence_id);

-- One piece of evidence, claimed against one criterion. The many-to-many is
-- the point: evidence is reused across criteria and across roles rather than
-- copied, so strengthening one piece strengthens every claim that rests on it.
create table public.career_claims (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  criterion_id uuid not null references public.career_criteria(id) on delete cascade,
  evidence_id uuid not null references public.career_evidence(id) on delete cascade,
  /* Why this piece meets this requirement, where that is not obvious. */
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (criterion_id, evidence_id)
);

create index career_claims_criterion_idx on public.career_claims (criterion_id);
create index career_claims_evidence_idx on public.career_claims (evidence_id);

create trigger career_roles_updated_at before update on public.career_roles
  for each row execute function public.set_updated_at();
create trigger career_criteria_updated_at before update on public.career_criteria
  for each row execute function public.set_updated_at();
create trigger career_evidence_updated_at before update on public.career_evidence
  for each row execute function public.set_updated_at();

-- Every table: yours alone, inside a workspace you belong to.
do $$
declare t text;
begin
  foreach t in array array['career_roles', 'career_criteria', 'career_evidence',
                           'career_evidence_links', 'career_claims']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format($p$create policy "authors read %1$s" on public.%1$I
      for select to authenticated
      using (created_by = auth.uid() and public.is_workspace_member(workspace_id))$p$, t);
    execute format($p$create policy "authors insert %1$s" on public.%1$I
      for insert to authenticated
      with check (created_by = auth.uid() and public.is_workspace_member(workspace_id))$p$, t);
    execute format($p$create policy "authors update %1$s" on public.%1$I
      for update to authenticated
      using (created_by = auth.uid())
      with check (created_by = auth.uid() and public.is_workspace_member(workspace_id))$p$, t);
    execute format($p$create policy "authors delete %1$s" on public.%1$I
      for delete to authenticated
      using (created_by = auth.uid())$p$, t);
  end loop;
end $$;

comment on table public.career_evidence is
  'A lawyer''s own professional evidence, stored once and claimed against many criteria and many roles. Private to its author.';
comment on table public.career_evidence_links is
  'What in Scripta a piece of evidence points at. A reference, never a copy.';
