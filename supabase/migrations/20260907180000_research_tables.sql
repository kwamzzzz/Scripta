-- Research leaves the browser.
--
-- Until now the whole Research workspace lived in localStorage: the matter
-- index (px.research.index.<workspace>), the question and its answer
-- (px.research.<workspace>.<id>) and the working records
-- (px.research.records.<workspace>.<id>). One cleared cache lost the lot, with
-- no backup, no sharing and no audit trail. These tables give research the
-- same workspace scoping, row level security and audit history the rest of the
-- schema has.
--
-- Shape: one research_matters row per research matter holds the scalars, and
-- the repeating parts (authorities, findings, pins, memo sections, issues,
-- facts, assumptions, risks) are ordered child rows. Children are rewritten
-- wholesale on each save — the same pattern diffDocuments uses for clauses —
-- so they carry an ordinal and a created_at but no per-row updated_at.

create type public.research_kind as enum ('simple', 'comprehensive');
create type public.research_draft_state as enum ('pending', 'accepted', 'rejected');

create table public.research_matters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Optional link to the contract matter the research was raised from. Set
  -- null on delete: research outlives the matter that prompted it.
  matter_id uuid references public.matters(id) on delete set null,
  -- The localStorage id this row was imported from ("simple-<uuid>"), so the
  -- one-time import runs once per matter and an old /research/<id> link still
  -- resolves. Null for anything created after the import.
  legacy_id text,
  kind public.research_kind not null,
  title text not null,

  -- px.research.<workspace>.<id> — the question and its answer.
  topic text not null default '',
  question text not null default '',
  jurisdiction text not null default '',
  sources text not null default '',
  -- "since" is a reserved word in enough dialects to be worth avoiding, and
  -- the value is a label ("Since 2010", "Any date"), not a date.
  since_filter text not null default '',
  linked_clause text not null default '',
  selected_authority integer,
  -- The client state's `answer` is nullable: null means the research has not
  -- been run, which is NOT the same as a run whose short answer came back
  -- empty. Without this flag the two collapse into each other on reload.
  has_answer boolean not null default false,
  short_answer text not null default '',

  -- The memo header. Its sections are rows.
  memo_title text not null default '',
  memo_intro text not null default '',
  memo_style text not null default 'OSCOLA',

  -- px.research.records.<workspace>.<id> — the working records' scalars.
  selected_issue integer not null default 0,
  analysis_format text not null default 'IRAC',
  draft_rejected boolean not null default false,
  report_version text not null default 'v0.4',
  report_locked boolean not null default false,
  report_draft public.research_draft_state not null default 'pending',
  report_track boolean not null default false,
  report_approval_sent boolean not null default false,
  -- Free text on purpose: the export screen writes a display string ("12 Sep"),
  -- not an instant. Storing it as timestamptz would invent precision.
  report_approved_at text not null default '',
  -- A flat key -> boolean map of the export's section toggles, keyed by the
  -- deliverable layout. A checkbox set, never queried across matters: JSON is
  -- the honest model, and a table of one boolean per key would buy nothing.
  deliverable_sections jsonb not null default '{}'::jsonb,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, legacy_id)
);

grant select, insert, update, delete on public.research_matters to authenticated;
grant all on public.research_matters to service_role;
alter table public.research_matters enable row level security;
create trigger research_matters_updated_at before update on public.research_matters
  for each row execute function public.set_updated_at();

create policy "members read research matters" on public.research_matters for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "writers insert research matters" on public.research_matters for insert to authenticated
  with check (public.can_write_workspace(workspace_id));
create policy "writers update research matters" on public.research_matters for update to authenticated
  using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id));
create policy "writers delete research matters" on public.research_matters for delete to authenticated
  using (public.can_write_workspace(workspace_id));

-- Resolved through SECURITY DEFINER helpers so no child policy queries
-- workspace_members inline, matching matter_workspace/is_matter_member.
create or replace function public.research_workspace(_research_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from public.research_matters where id = _research_id;
$$;
create or replace function public.is_research_member(_research_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_workspace_member(public.research_workspace(_research_id));
$$;
create or replace function public.can_write_research(_research_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_write_workspace(public.research_workspace(_research_id));
$$;

-- The authorities the answer relies on. Numbered by `n`, which is the citation
-- key the memo and the pins both use.
create table public.research_authorities (
  id uuid primary key default gen_random_uuid(),
  research_matter_id uuid not null references public.research_matters(id) on delete cascade,
  n integer not null,
  cite text not null,
  kind text not null default 'UNVERIFIED',
  source text not null default '',
  -- Free text: "In force", "Current", "14 May 2019". Not a date column.
  cite_date text not null default '',
  held text not null default '',
  -- [{ title, paragraphs: [] }] — the reading view. Kept as JSON because a pin
  -- addresses a passage by (section index, paragraph index): the array order
  -- IS the data, and splitting it into two more ordered tables would add an
  -- ordering contract to maintain with nothing to query or filter on.
  sections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (research_matter_id, n)
);

-- Each finding cites one or more authorities by number.
create table public.research_findings (
  id uuid primary key default gen_random_uuid(),
  research_matter_id uuid not null references public.research_matters(id) on delete cascade,
  ordinal integer not null,
  text text not null default '',
  cites integer[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (research_matter_id, ordinal)
);

-- A pinned passage. authority_n is deliberately not a foreign key: re-running
-- the research can replace the authority set while a pin still points at a
-- number, and the citation checker is what reports that dangling pin to the
-- lawyer. A foreign key would delete the evidence of the problem instead.
create table public.research_pins (
  id uuid primary key default gen_random_uuid(),
  research_matter_id uuid not null references public.research_matters(id) on delete cascade,
  ordinal integer not null,
  authority_n integer not null,
  section_index integer not null default 0,
  paragraph_index integer not null default 0,
  text text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (research_matter_id, ordinal)
);

create table public.research_memo_sections (
  id uuid primary key default gen_random_uuid(),
  research_matter_id uuid not null references public.research_matters(id) on delete cascade,
  ordinal integer not null,
  no text not null default '',
  title text not null default '',
  body text not null default '',
  cites integer[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (research_matter_id, ordinal)
);

create table public.research_issues (
  id uuid primary key default gen_random_uuid(),
  research_matter_id uuid not null references public.research_matters(id) on delete cascade,
  ordinal integer not null,
  no text not null default '',
  short text not null default '',
  question text not null default '',
  jurisdiction text not null default '',
  priority text not null default '',
  state text not null default '',
  answer text not null default '',
  -- `position` is a SQL keyword; the column holds the drawn label
  -- ("Likely", "Clear", "Depends on further facts").
  position_label text not null default '',
  risk text not null default '',
  authority text not null default '',
  assignee text not null default '',
  in_report boolean not null default false,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  unique (research_matter_id, ordinal)
);

create table public.research_facts (
  id uuid primary key default gen_random_uuid(),
  research_matter_id uuid not null references public.research_matters(id) on delete cascade,
  ordinal integer not null,
  -- "F-01": the lawyer-facing label the analysis screen cites, not the row id.
  ref text not null default '',
  fact text not null default '',
  source text not null default '',
  classification text not null default '',
  -- A comma-joined list of issue numbers ("1, 2") or "—". Kept verbatim as
  -- text: the screen parses and re-emits this string, so normalising it to
  -- integer[] would silently drop anything a lawyer typed that is not a number.
  issue_refs text not null default '',
  confidence text not null default '',
  created_at timestamptz not null default now(),
  unique (research_matter_id, ordinal)
);

create table public.research_assumptions (
  id uuid primary key default gen_random_uuid(),
  research_matter_id uuid not null references public.research_matters(id) on delete cascade,
  ordinal integer not null,
  assumption text not null default '',
  why text not null default '',
  risk text not null default '',
  state text not null default '',
  created_at timestamptz not null default now(),
  unique (research_matter_id, ordinal)
);

create table public.research_risks (
  id uuid primary key default gen_random_uuid(),
  research_matter_id uuid not null references public.research_matters(id) on delete cascade,
  ordinal integer not null,
  title text not null default '',
  issue text not null default '',
  likelihood text not null default '',
  impact text not null default '',
  rating text not null default '',
  -- Null means "take the computed rating"; a value means a lawyer overrode it.
  rating_override text,
  mitigation text not null default '',
  action text not null default '',
  priority text not null default '',
  owner text not null default '',
  -- Free text due label ("12 Sept", "TBC", "Immediate").
  due text not null default '',
  status text not null default 'Open',
  created_at timestamptz not null default now(),
  unique (research_matter_id, ordinal)
);

do $$
declare t text;
begin
  foreach t in array array[
    'research_authorities', 'research_findings', 'research_pins',
    'research_memo_sections', 'research_issues', 'research_facts',
    'research_assumptions', 'research_risks'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "members read %1$s" on public.%1$I for select to authenticated
         using (public.is_research_member(research_matter_id))', t);
    execute format(
      'create policy "writers insert %1$s" on public.%1$I for insert to authenticated
         with check (public.can_write_research(research_matter_id))', t);
    execute format(
      'create policy "writers update %1$s" on public.%1$I for update to authenticated
         using (public.can_write_research(research_matter_id))
         with check (public.can_write_research(research_matter_id))', t);
    execute format(
      'create policy "writers delete %1$s" on public.%1$I for delete to authenticated
         using (public.can_write_research(research_matter_id))', t);
    -- Each child table's unique (research_matter_id, ordinal | n) constraint
    -- already indexes the parent lookup, so no extra index is needed here.
  end loop;
end $$;

create index on public.research_matters (workspace_id, updated_at desc);
create index on public.research_matters (matter_id);

-- One audit trail, not two. A research matter is not a `matters` row, so
-- audit_events gains a workspace subject alongside the matter one.
--
-- An audit row must outlive what it describes, so the durable subject is the
-- workspace and research_matter_id is a nullable pointer that goes null when
-- the research matter is deleted — the "research deleted" entry survives its
-- own subject. Every existing row has matter_id set and workspace_id null, so
-- the new constraint holds on current data and the matter branch of each
-- policy behaves exactly as before.
alter table public.audit_events
  add column workspace_id uuid references public.workspaces(id) on delete cascade,
  add column research_matter_id uuid references public.research_matters(id) on delete set null;
alter table public.audit_events alter column matter_id drop not null;
alter table public.audit_events
  add constraint audit_events_one_subject check (num_nonnulls(matter_id, workspace_id) = 1),
  add constraint audit_events_research_in_workspace
    check (research_matter_id is null or workspace_id is not null);

drop policy "members read audit events" on public.audit_events;
drop policy "writers insert audit events" on public.audit_events;
create policy "members read audit events" on public.audit_events for select to authenticated
  using (
    (matter_id is not null and public.is_matter_member(matter_id))
    or (workspace_id is not null and public.is_workspace_member(workspace_id))
  );
create policy "writers insert audit events" on public.audit_events for insert to authenticated
  with check (
    (matter_id is not null and public.can_write_matter(matter_id))
    or (workspace_id is not null and public.can_write_workspace(workspace_id))
  );

create index on public.audit_events (research_matter_id, created_at desc);
create index on public.audit_events (workspace_id, created_at desc);
