-- Manuscripts and Book Review.
--
-- ---------------------------------------------------------------------------
-- WHAT A MANUSCRIPT IS
-- ---------------------------------------------------------------------------
--
-- A thesis, dissertation, book or long report, held as a first-class record
-- beside clients and matters. It may be filed to a client or a matter, or to
-- neither: a lawyer reviewing a colleague's PhD has no matter to file it to.
--
-- Firm-readable by default, like the Library. `private` makes it the author's
-- alone — a thesis somebody is writing is not a firm document until they say
-- so.
--
-- ---------------------------------------------------------------------------
-- VERSIONS, ATOMS, CHAPTERS
-- ---------------------------------------------------------------------------
--
-- Every upload is a version. A version is read into atoms
-- (`manuscript_nodes`): headings, paragraphs, notes, tables, figures,
-- captions, bibliography entries, each knowing its chapter and where in the
-- source it came from. Nothing is flattened into paragraphs and nothing loses
-- its provenance. Old versions are kept, because the verification pass after
-- the author's amendments compares the new reading with the old one.
--
-- Chapters are first-class (`manuscript_chapters`): each carries its review
-- state, a descriptive summary and, kept apart from it, an editorial
-- assessment. The summaries are what manuscript-wide reasoning reads, so the
-- whole book never has to be loaded into one model call.
--
-- ---------------------------------------------------------------------------
-- FINDINGS AND THE STYLE SHEET
-- ---------------------------------------------------------------------------
--
-- A finding is a correction (objectively wrong, with its fix), an author
-- query (only the author can say which of two dates is right) or a
-- suggestion. Its fingerprint identifies the same problem at the same words
-- across runs and versions, so a second run does not raise it twice and a new
-- version can say whether it survived, was fixed, or is new.
--
-- The style sheet holds the manuscript's own conventions — some detected,
-- some set by a person. An accepted author preference stops being flagged.

create table public.manuscripts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (title <> ''),
  kind text not null default 'thesis'
    check (kind in ('thesis', 'dissertation', 'book', 'monograph', 'report', 'other')),
  author text not null default '',
  client_id uuid references public.clients(id) on delete set null,
  matter_id uuid references public.matters(id) on delete set null,
  private boolean not null default false,
  current_version_id uuid,
  /* The manuscript map: thesis, research questions, how chapters relate. */
  map jsonb,
  mapped_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.manuscripts is
  'A long-form manuscript under Book Review: thesis, dissertation, book, report.';

create index manuscripts_workspace on public.manuscripts (workspace_id, updated_at desc);
create index manuscripts_client on public.manuscripts (client_id) where client_id is not null;
create index manuscripts_matter on public.manuscripts (matter_id) where matter_id is not null;

create table public.manuscript_versions (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  file_name text not null default '',
  format text not null check (format in ('docx', 'pdf')),
  storage_path text,
  word_count integer not null default 0,
  warnings text[] not null default '{}',
  /* Set once the verification pass has compared this version with the last. */
  verified_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (manuscript_id, version_no)
);

alter table public.manuscripts
  add constraint manuscripts_current_version
  foreign key (current_version_id) references public.manuscript_versions(id) on delete set null;

create table public.manuscript_nodes (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  version_id uuid not null references public.manuscript_versions(id) on delete cascade,
  key text not null,
  ord integer not null,
  kind text not null,
  level integer not null default 0,
  number text not null default '',
  label text not null default '',
  text text not null default '',
  parent_key text,
  chapter_key text,
  page integer,
  source integer,
  note_refs text[] not null default '{}',
  rows jsonb,
  style text,
  unique (version_id, key)
);

create index manuscript_nodes_order on public.manuscript_nodes (version_id, ord);
create index manuscript_nodes_chapter on public.manuscript_nodes (version_id, chapter_key, ord);

create table public.manuscript_chapters (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  version_id uuid not null references public.manuscript_versions(id) on delete cascade,
  chapter_key text not null,
  ord integer not null,
  number text not null default '',
  title text not null default '',
  word_count integer not null default 0,
  state text not null default 'not_reviewed'
    check (state in ('not_reviewed', 'reviewing', 'reviewed')),
  /* Descriptive: what the chapter says. */
  summary jsonb,
  summarised_at timestamptz,
  /* Editorial: how well it does its job. Never merged with the summary. */
  assessment jsonb,
  reviewed_at timestamptz,
  unique (version_id, chapter_key)
);

create index manuscript_chapters_order on public.manuscript_chapters (version_id, ord);

create table public.manuscript_style_rules (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  category text not null,
  preferred text not null default '',
  variants text[] not null default '{}',
  note text not null default '',
  origin text not null default 'author' check (origin in ('detected', 'author')),
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index manuscript_style_rules_manuscript on public.manuscript_style_rules (manuscript_id);

create table public.manuscript_findings (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  version_id uuid not null references public.manuscript_versions(id) on delete cascade,
  ref integer not null,
  pass text not null,
  category text not null,
  severity text not null check (severity in ('critical', 'material', 'minor')),
  action text not null check (action in ('correction', 'query', 'suggestion')),
  title text not null,
  body text not null default '',
  original text,
  replacement text,
  evidence jsonb not null default '[]',
  chapter_keys text[] not null default '{}',
  fingerprint text not null,
  source text not null default 'rule' check (source in ('rule', 'ai')),
  rule_id uuid references public.manuscript_style_rules(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'accepted', 'resolved', 'dismissed')),
  decision_note text not null default '',
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  /* The verification pass: did this survive the amendments, or is it new? */
  carried_from uuid references public.manuscript_findings(id) on delete set null,
  verification text check (verification in ('remains', 'fixed', 'introduced')),
  created_at timestamptz not null default now(),
  unique (version_id, fingerprint),
  unique (version_id, ref)
);

create index manuscript_findings_version on public.manuscript_findings (version_id, status);

create table public.manuscript_runs (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  version_id uuid not null references public.manuscript_versions(id) on delete cascade,
  scope text not null check (scope in ('full', 'chapters', 'consistency', 'proofreading', 'verification')),
  chapter_keys text[] not null default '{}',
  passes text[] not null default '{}',
  status text not null default 'running' check (status in ('running', 'done', 'failed', 'cancelled')),
  progress jsonb not null default '{}',
  error text,
  started_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index manuscript_runs_manuscript on public.manuscript_runs (manuscript_id, started_at desc);

-- ---------------------------------------------------------------------------
-- ACCESS
-- ---------------------------------------------------------------------------

create or replace function public.can_read_manuscript(_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.manuscripts m
    where m.id = _id
      and public.is_workspace_member(m.workspace_id)
      and (not m.private or m.created_by = auth.uid())
  );
$$;

create or replace function public.can_write_manuscript(_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.manuscripts m
    where m.id = _id
      and public.can_write_workspace(m.workspace_id)
      and (not m.private or m.created_by = auth.uid())
  );
$$;

revoke all on function public.can_read_manuscript(uuid) from public;
revoke all on function public.can_write_manuscript(uuid) from public;
grant execute on function public.can_read_manuscript(uuid) to authenticated, service_role;
grant execute on function public.can_write_manuscript(uuid) to authenticated, service_role;

alter table public.manuscripts enable row level security;

create policy "read manuscripts"
  on public.manuscripts for select
  using (public.is_workspace_member(workspace_id) and (not private or created_by = auth.uid()));

create policy "create manuscripts"
  on public.manuscripts for insert
  with check (created_by = auth.uid() and public.can_write_workspace(workspace_id));

create policy "amend manuscripts"
  on public.manuscripts for update
  using (public.can_write_workspace(workspace_id) and (not private or created_by = auth.uid()))
  with check (public.can_write_workspace(workspace_id) and (not private or created_by = auth.uid()));

/* Deleting is the author's, as elsewhere; colleagues archive. */
create policy "delete own manuscripts"
  on public.manuscripts for delete
  using (created_by = auth.uid());

/* Only the author may make a manuscript private or public again. */
create or replace function public.manuscripts_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'The author of a manuscript cannot be changed';
  end if;
  if new.private is distinct from old.private and old.created_by <> auth.uid() then
    raise exception 'Only the author can change who may see a manuscript';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger manuscripts_guard
  before update on public.manuscripts
  for each row execute function public.manuscripts_guard();

do $$
declare t text;
begin
  foreach t in array array[
    'manuscript_versions', 'manuscript_nodes', 'manuscript_chapters',
    'manuscript_style_rules', 'manuscript_findings', 'manuscript_runs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "read %1$s" on public.%1$I for select using (public.can_read_manuscript(manuscript_id))', t);
    execute format(
      'create policy "insert %1$s" on public.%1$I for insert with check (public.can_write_manuscript(manuscript_id))', t);
    execute format(
      'create policy "update %1$s" on public.%1$I for update using (public.can_write_manuscript(manuscript_id)) with check (public.can_write_manuscript(manuscript_id))', t);
    execute format(
      'create policy "delete %1$s" on public.%1$I for delete using (public.can_write_manuscript(manuscript_id))', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.manuscripts, public.manuscript_versions, public.manuscript_nodes,
  public.manuscript_chapters, public.manuscript_style_rules, public.manuscript_findings,
  public.manuscript_runs
to authenticated;
grant all on
  public.manuscripts, public.manuscript_versions, public.manuscript_nodes,
  public.manuscript_chapters, public.manuscript_style_rules, public.manuscript_findings,
  public.manuscript_runs
to service_role;
