-- Templates: the reusable starting structure for a piece of legal drafting.
--
-- Distinct from the two neighbouring concepts, and shaped differently on
-- purpose. A playbook holds decision logic (preferred position, fallback,
-- red flag) and answers "what should this say". A precedent holds one body
-- of text that was actually agreed, and answers "what did we accept before".
-- A template holds ordered sections a document is built from, and answers
-- "what goes in this document, in what order". Merging any two of them would
-- mean storing one shape badly.
--
-- Placeholders are deliberately not a table. They are {{markers}} inside a
-- section's body, derived when read. Giving them rows before anything needs
-- per-placeholder metadata would be inventing a schema for a screen.

create type public.template_status as enum ('Draft', 'Active', 'Retired');

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  -- What kind of document this builds: contract, memorandum, opinion, board
  -- resolution, letter, notice, policy. Free text rather than an enum, because
  -- the list of things a lawyer drafts is not one an app should close.
  doc_type text not null,
  jurisdiction text,
  description text,
  status public.template_status not null default 'Draft',
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  heading text not null,
  -- The drafting itself, carrying {{placeholders}} where facts belong.
  body text not null default '',
  -- Why this section exists and how to complete it. Read by the drafter and,
  -- later, by the drafting workflow; never printed into the document.
  guidance text,
  -- An optional section is offered and can be declined; a required one is not.
  optional boolean not null default false,
  ordinal integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index templates_workspace_idx on public.templates (workspace_id, status);
create index template_sections_template_idx on public.template_sections (template_id, ordinal);

alter table public.templates enable row level security;
alter table public.template_sections enable row level security;

grant select, insert, update, delete on public.templates to authenticated;
grant select, insert, update, delete on public.template_sections to authenticated;

create policy "members read templates" on public.templates
  for select using (is_workspace_member(workspace_id));
create policy "writers insert templates" on public.templates
  for insert with check (can_write_workspace(workspace_id));
create policy "writers update templates" on public.templates
  for update using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
create policy "writers delete templates" on public.templates
  for delete using (can_write_workspace(workspace_id));

-- Sections carry no workspace of their own; they inherit their template's,
-- so a member can never reach a section of a template they cannot read.
create policy "members read template sections" on public.template_sections
  for select using (
    exists (
      select 1 from public.templates t
      where t.id = template_id and is_workspace_member(t.workspace_id)
    )
  );
create policy "writers insert template sections" on public.template_sections
  for insert with check (
    exists (
      select 1 from public.templates t
      where t.id = template_id and can_write_workspace(t.workspace_id)
    )
  );
create policy "writers update template sections" on public.template_sections
  for update using (
    exists (
      select 1 from public.templates t
      where t.id = template_id and can_write_workspace(t.workspace_id)
    )
  ) with check (
    exists (
      select 1 from public.templates t
      where t.id = template_id and can_write_workspace(t.workspace_id)
    )
  );
create policy "writers delete template sections" on public.template_sections
  for delete using (
    exists (
      select 1 from public.templates t
      where t.id = template_id and can_write_workspace(t.workspace_id)
    )
  );
