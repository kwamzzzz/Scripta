-- PHASE 5, STEP 2a: document history stops living in the audit trail.
--
-- `audit_events` records ACTS. It has been recording document state as well —
-- `editClauseText()` writes the whole previous redline into
-- `prior_segments`, and `restorePriorText()` reads it back — which is the
-- prohibition in section 13 of the Phase 4 plan, in the codebase, today. It
-- works, and it is why version history cannot currently be better than a
-- one-step undo.
--
-- This table takes that job. The audit trail goes back to saying what happened.
--
-- ---------------------------------------------------------------------------
-- WHY THE BASELINE IS LOAD-BEARING RATHER THAN A HISTORY CONVENIENCE
-- ---------------------------------------------------------------------------
--
-- The first draft of the Phase 5 plan claimed all four readings of a clause
-- were derivable from its document. They are not, and chasing the terminology
-- ambiguity is what exposed it: ACCEPTING A CHANGE REMOVES ITS MARK — that is
-- what accepting means — so the moment anything is accepted, the document stops
-- containing the wording it started from.
--
-- So "as received" is not a derivation. It is the clause's first revision, and
-- if it is not written the counterparty's original wording is gone the first
-- time anybody accepts anything. That is why step 2 writes revisions rather
-- than leaving history for a later step.

create table if not exists public.clause_revisions (
  id uuid primary key default gen_random_uuid(),
  clause_id uuid not null references public.clauses(id) on delete cascade,
  -- Denormalised so RLS is a column comparison rather than a function call per
  -- row, the same shape `document_versions` already uses. Set by trigger from
  -- the clause, never by the caller.
  matter_id uuid not null references public.matters(id) on delete cascade,
  doc jsonb not null,
  -- baseline   as received, written once, never again
  -- kept       somebody deliberately kept this version
  -- milestone  a review was approved, an export was taken, the contract was sent
  -- restored   an earlier revision was brought back — which is itself history
  kind text not null default 'kept',
  label text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint clause_revisions_kind_check
    check (kind in ('baseline', 'kept', 'milestone', 'restored'))
);

create index if not exists clause_revisions_clause_idx
  on public.clause_revisions (clause_id, created_at desc);

-- Exactly one baseline per clause. The constraint rather than a convention,
-- because a second baseline would make "as received" ambiguous and there would
-- be no way to tell which was right.
create unique index if not exists clause_revisions_one_baseline
  on public.clause_revisions (clause_id) where kind = 'baseline';

alter table public.clause_revisions enable row level security;

-- ---------------------------------------------------------------------------
-- The matter governs, as it governs everything else
-- ---------------------------------------------------------------------------

drop policy if exists "members read clause revisions" on public.clause_revisions;
create policy "members read clause revisions" on public.clause_revisions for select to authenticated
  using (public.is_matter_member(matter_id));

drop policy if exists "writers insert clause revisions" on public.clause_revisions;
create policy "writers insert clause revisions" on public.clause_revisions for insert to authenticated
  with check (public.can_write_matter(matter_id));

-- No update policy and no delete policy, deliberately. A revision is a record
-- of what a document said at a moment; editing one would make the history a
-- worse copy of the present, and deleting one would remove evidence. Restoring
-- an earlier revision writes a NEW revision rather than rewinding, so going
-- back is itself in the history.

-- ---------------------------------------------------------------------------
-- Stamped by the database, not by the caller
-- ---------------------------------------------------------------------------
--
-- Phase 4's worst defect was `comments.author_id`, which nothing stamped and
-- nothing checked, so any member could post a comment signed as a colleague. A
-- revision makes the same claim about a person. `created_by` and `matter_id`
-- are both taken from the server, and a caller's values are discarded rather
-- than validated — there is no legitimate reason to send either.

create or replace function public.stamp_clause_revision()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.created_by := auth.uid();
  select c.matter_id into new.matter_id from public.clauses c where c.id = new.clause_id;
  if new.matter_id is null then
    raise exception 'That clause is unavailable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists clause_revisions_stamp on public.clause_revisions;
create trigger clause_revisions_stamp before insert on public.clause_revisions
  for each row execute function public.stamp_clause_revision();

-- Belt and braces against a future policy that admits an update by accident.
create or replace function public.protect_clause_revision()
returns trigger language plpgsql
as $$
begin
  raise exception 'A revision records what a document said. It cannot be changed or removed.'
    using errcode = '42501';
end;
$$;

drop trigger if exists clause_revisions_immutable on public.clause_revisions;
create trigger clause_revisions_immutable before update or delete on public.clause_revisions
  for each row execute function public.protect_clause_revision();

-- ---------------------------------------------------------------------------
-- As received
-- ---------------------------------------------------------------------------
--
-- The one reading that is not a derivation. Security definer so it can answer
-- for a clause the caller reaches through the matter, and it checks membership
-- itself rather than trusting the caller — the rule Phase 4 left behind after
-- `task_actions()` and `review_for()` were found reading with more authority
-- than their callers.

create or replace function public.clause_baseline(_clause uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare target uuid; result jsonb;
begin
  select matter_id into target from public.clauses where id = _clause;
  if target is null or not public.is_matter_member(target) then
    return null;  -- Indistinguishable from a clause that does not exist.
  end if;
  select doc into result from public.clause_revisions
   where clause_id = _clause and kind = 'baseline';
  return result;
end;
$$;

comment on function public.clause_baseline(uuid) is
  'The clause as received. Not derivable from the current document, because accepting a change removes its mark — so it is read from the first revision or it is lost.';
