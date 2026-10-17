-- The two halves of a career that are not a role and not evidence: who you
-- are, and who you know.
--
-- PROFILE is the record a lawyer keeps of themselves — the positions held, the
-- degrees, the practising certificate, the skills they want to be known for.
-- It looks like the profile everybody already keeps on a professional network,
-- and it is deliberately the same shape, because that is the shape lawyers
-- already think in. What it is not is a page anybody else reads: there is no
-- feed, no follower, no endorsement from a stranger. It is the raw material a
-- CV, an application, an appraisal or a promotion case is written from, kept
-- once instead of retyped into each of them.
--
-- NETWORK is the register of people. Not contacts in the address-book sense —
-- a phone already does that — but who you actually know, what they are good
-- at, what you could reasonably call on them for, and how you know them well
-- enough to ask. A lawyer's practice runs on this and it is normally kept in
-- their head, where it decays: you remember that somebody does shipping work
-- and forget which firm they moved to.
--
-- MILESTONES are what has happened to those people: made partner, moved firm,
-- took silk, published, won something. Recorded so that reaching out is
-- informed rather than awkward, and read when the lawyer goes looking — never
-- pushed at them as a task. This is a register, not a CRM that nags.
--
-- All of it is private to its author, on the same argument as the rest of the
-- career record.

create table public.career_profile (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  /* What you call yourself, under your name. */
  headline text not null default '',
  /* The paragraph: years, practice, what you are known for. */
  about text not null default '',
  location text not null default '',
  /* Kept here rather than on the workspace profile, because these are the
     lawyer's own details for their own applications, not the firm's record. */
  email text not null default '',
  phone text not null default '',
  website text not null default '',
  /* Admitted where, and when. A lawyer's first line in most rooms. */
  admissions text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, created_by)
);

create table public.career_positions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null default '',
  organisation text not null default '',
  /* Pupillage and a secondment are not the same thing as a job, and a career
     in law is full of both. */
  employment text not null default 'full_time'
    check (employment in ('full_time', 'part_time', 'pupillage', 'secondment',
                          'internship', 'consultant', 'self_employed', 'other')),
  location text not null default '',
  started_on date,
  ended_on date,
  /* Null end date and this true is "present". Stored rather than inferred so a
     position that simply has no recorded end is not read as current. */
  current boolean not null default false,
  summary text not null default '',
  /* What this position is where your skill in something comes from. */
  skills text[] not null default '{}',
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.career_education (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  institution text not null default '',
  qualification text not null default '',
  field text not null default '',
  started_on date,
  ended_on date,
  note text not null default '',
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.career_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default '',
  issuer text not null default '',
  issued_on date,
  /* A practising certificate lapses; a degree does not. */
  expires_on date,
  credential_id text not null default '',
  url text not null default '',
  skills text[] not null default '{}',
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Skills a lawyer wants to be known for, named once. Where a skill is also
-- claimed by a position or a credential, the profile shows that; where it is
-- evidenced in the portfolio, the progression already says so. Nothing here
-- endorses anything: a skill nobody can point at is a skill you have asserted.
create table public.career_skills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default '',
  note text not null default '',
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workspace_id, created_by, name)
);

create table public.career_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default '',
  organisation text not null default '',
  role text not null default '',
  location text not null default '',
  email text not null default '',
  phone text not null default '',
  /* How you know them, in your own words: "opposite side on Bugatti", "pupil
     supervisor", "met at the AfCFTA conference". */
  how_you_met text not null default '',
  /*
   * How well, which decides what you can reasonably ask.
   *   close     you would call them today
   *   known     you have worked together and would be remembered
   *   met       you have met; they may need reminding who you are
   */
  closeness text not null default 'known' check (closeness in ('close', 'known', 'met')),
  /* What they are good at — the bubbles you search by. */
  expertise text[] not null default '{}',
  /* What you could reasonably call on them for, said plainly. */
  call_on text not null default '',
  /* And what they might call on you for. A network runs both ways. */
  they_call_on text not null default '',
  notes text not null default '',
  last_contact_on date,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index career_contacts_author_idx on public.career_contacts (created_by, workspace_id, name);
create index career_contacts_expertise_idx on public.career_contacts using gin (expertise);

create table public.career_milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  /* Whose milestone. Null is your own — a career keeps both, and the lawyer's
     own milestones are the ones a promotion case is written from. */
  contact_id uuid references public.career_contacts(id) on delete cascade,
  kind text not null default 'other'
    check (kind in ('promotion', 'move', 'qualification', 'award', 'publication',
                    'appointment', 'deal', 'other')),
  headline text not null default '',
  note text not null default '',
  happened_on date,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index career_milestones_contact_idx on public.career_milestones (contact_id, happened_on desc);
create index career_milestones_mine_idx on public.career_milestones (created_by, workspace_id, happened_on desc);

create trigger career_profile_updated_at before update on public.career_profile
  for each row execute function public.set_updated_at();
create trigger career_positions_updated_at before update on public.career_positions
  for each row execute function public.set_updated_at();
create trigger career_education_updated_at before update on public.career_education
  for each row execute function public.set_updated_at();
create trigger career_credentials_updated_at before update on public.career_credentials
  for each row execute function public.set_updated_at();
create trigger career_contacts_updated_at before update on public.career_contacts
  for each row execute function public.set_updated_at();
create trigger career_milestones_updated_at before update on public.career_milestones
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['career_profile', 'career_positions', 'career_education',
                           'career_credentials', 'career_skills', 'career_contacts',
                           'career_milestones']
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

comment on table public.career_contacts is
  'Who a lawyer actually knows: what they are good at, what they can be called on for, and how well. Private to its author.';
comment on table public.career_milestones is
  'What has happened to the people in the register, and to the lawyer. Read when they go looking; never pushed at them.';
