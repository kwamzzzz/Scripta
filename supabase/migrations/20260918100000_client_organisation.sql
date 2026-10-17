-- The client as an organisation.
--
-- A client in Scripta was a name that matters, flows and tasks could be filed
-- under. For an organisation that is not enough to act for it: a lawyer is
-- asked who signs, which company should contract, who owns the subsidiary, who
-- the finance manager reports to and when the export licence runs out. This
-- migration gives each client the records those answers come from.
--
-- ---------------------------------------------------------------------------
-- TWO STRUCTURES, NEVER ONE
-- ---------------------------------------------------------------------------
--
-- Reporting and ownership answer different legal questions and are stored
-- apart. `org_roles` is the organogram: roles, the person holding each, and the
-- role each reports to. `org_entities` and `org_holdings` are the group
-- structure: companies and who holds their shares. A holding is an edge in a
-- directed graph, not a tree, because joint ventures and minority partners are
-- not trees. Nothing links the two except a role's optional entity.
--
-- ---------------------------------------------------------------------------
-- ROLES HOLD AUTHORITY, PEOPLE HOLD ROLES
-- ---------------------------------------------------------------------------
--
-- Authority, responsibilities and process steps name roles. A person leaving
-- clears the role's holder and leaves every rule standing, and a role that a
-- rule still names cannot be deleted (`on delete restrict`).
--
-- ---------------------------------------------------------------------------
-- THE ORGANISATION IS FIRM BUSINESS; THE WORK IS NOT
-- ---------------------------------------------------------------------------
--
-- Like the client record, these rows are readable by every member of the
-- workspace and written by anyone who may write in it. None of them grants
-- access to anything else: no matter, flow or task policy reads them, and a
-- matter's link to an entity is a column on the matter, read through the
-- matter's own policy. Seeing Neemba's group structure never shows a Neemba
-- matter the reader is not on.
--
-- ---------------------------------------------------------------------------
-- ONE CLIENT PER RECORD, ENFORCED
-- ---------------------------------------------------------------------------
--
-- Every table carries `(workspace_id, client_id)` with a composite key into
-- `clients`, and every reference between organisation rows is a composite key
-- on `(client_id, id)`. A Neemba role cannot report to a Goldenmark role and a
-- rule cannot name another client's entity, whatever the application sends.
--
-- ---------------------------------------------------------------------------
-- HISTORY
-- ---------------------------------------------------------------------------
--
-- Dated facts carry their dates: appointments and holdings have from/to,
-- roles have effective from/to, authority rules belong to an instrument that
-- can be superseded. Every insert, change and removal is also written to
-- `audit_events` against the client, with the fields that changed, and with
-- the effective date and reference (a board minute, a filing) the writer gave
-- in `last_change_on` / `last_change_ref`.

-- ===========================================================================
-- 1. Tables
-- ===========================================================================

create table public.org_structure_changes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  title text not null check (btrim(title) <> ''),
  detail text not null default '',
  status text not null default 'planned' check (status in ('planned', 'done', 'dropped')),
  position integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_structure_changes_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_structure_changes_client_id_key unique (client_id, id)
);

create table public.org_entities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  name text not null check (btrim(name) <> ''),
  short_name text not null default '',
  entity_type text not null default '',
  jurisdiction text not null default '',
  registration_no text not null default '',
  tax_no text not null default '',
  incorporated_on date,
  registered_office text not null default '',
  activity text not null default '',
  share_capital text not null default '',
  status text not null default 'active'
    check (status in ('active', 'dormant', 'in_liquidation', 'dissolved')),
  -- An entity that exists only in the target structure.
  proposed_change_id uuid,
  notes text not null default '',
  -- { fieldKey: { value, documentId, page, confidence, conflicts: [...] } }
  field_sources jsonb not null default '{}'::jsonb,
  last_change_on date,
  last_change_ref text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint org_entities_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_entities_client_id_key unique (client_id, id),
  constraint org_entities_proposed_fk foreign key (client_id, proposed_change_id)
    references public.org_structure_changes (client_id, id) on delete set null (proposed_change_id)
);

create table public.org_people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  full_name text not null check (btrim(full_name) <> ''),
  email text not null default '',
  phone text not null default '',
  location text not null default '',
  notes text not null default '',
  last_change_on date,
  last_change_ref text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint org_people_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_people_client_id_key unique (client_id, id)
);

create table public.org_holdings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  -- Exactly one holder: a group entity, a person, or someone outside the group
  -- the client does not need a record for ("minority partner").
  owner_entity_id uuid,
  owner_person_id uuid,
  owner_name text,
  subsidiary_entity_id uuid not null,
  percent numeric(7, 4) check (percent is null or (percent > 0 and percent <= 100)),
  instrument text not null default '',
  effective_from date,
  effective_to date,
  -- A holding that exists only in the target structure, or one the target
  -- structure removes.
  proposed_change_id uuid,
  removed_by_change_id uuid,
  last_change_on date,
  last_change_ref text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_holdings_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_holdings_one_holder check (
    (owner_entity_id is not null)::int + (owner_person_id is not null)::int
      + (nullif(btrim(owner_name), '') is not null)::int = 1),
  constraint org_holdings_not_self check (owner_entity_id is distinct from subsidiary_entity_id),
  constraint org_holdings_dates check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint org_holdings_owner_entity_fk foreign key (client_id, owner_entity_id)
    references public.org_entities (client_id, id) on delete cascade,
  constraint org_holdings_owner_person_fk foreign key (client_id, owner_person_id)
    references public.org_people (client_id, id) on delete restrict,
  constraint org_holdings_subsidiary_fk foreign key (client_id, subsidiary_entity_id)
    references public.org_entities (client_id, id) on delete cascade,
  constraint org_holdings_proposed_fk foreign key (client_id, proposed_change_id)
    references public.org_structure_changes (client_id, id) on delete cascade,
  constraint org_holdings_removed_fk foreign key (client_id, removed_by_change_id)
    references public.org_structure_changes (client_id, id) on delete set null (removed_by_change_id)
);

create table public.org_roles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  title text not null check (btrim(title) <> ''),
  function_name text not null default '',
  kind text not null default 'role' check (kind in ('leadership', 'head', 'role')),
  entity_id uuid,
  parent_role_id uuid,
  holder_person_id uuid,
  acting boolean not null default false,
  cover_role_id uuid,
  cover_note text not null default '',
  position integer not null default 0,
  effective_from date,
  effective_to date,
  last_change_on date,
  last_change_ref text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_roles_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_roles_client_id_key unique (client_id, id),
  constraint org_roles_not_own_parent check (parent_role_id is distinct from id),
  constraint org_roles_entity_fk foreign key (client_id, entity_id)
    references public.org_entities (client_id, id) on delete set null (entity_id),
  constraint org_roles_parent_fk foreign key (client_id, parent_role_id)
    references public.org_roles (client_id, id) on delete set null (parent_role_id),
  constraint org_roles_holder_fk foreign key (client_id, holder_person_id)
    references public.org_people (client_id, id) on delete set null (holder_person_id),
  constraint org_roles_cover_fk foreign key (client_id, cover_role_id)
    references public.org_roles (client_id, id) on delete set null (cover_role_id)
);

-- Dotted, functional lines beside the one reporting line.
create table public.org_role_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  role_id uuid not null,
  to_role_id uuid not null,
  note text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_role_lines_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_role_lines_not_self check (role_id <> to_role_id),
  constraint org_role_lines_unique unique (role_id, to_role_id),
  constraint org_role_lines_role_fk foreign key (client_id, role_id)
    references public.org_roles (client_id, id) on delete cascade,
  constraint org_role_lines_to_fk foreign key (client_id, to_role_id)
    references public.org_roles (client_id, id) on delete cascade
);

-- Formal offices in an entity, with their history: directors, the secretary.
create table public.org_appointments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  person_id uuid not null,
  entity_id uuid not null,
  capacity text not null check (capacity in
    ('director', 'alternate_director', 'secretary', 'chair', 'managing_director', 'signatory', 'auditor', 'officer')),
  title text not null default '',
  appointed_on date,
  ceased_on date,
  last_change_on date,
  last_change_ref text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_appointments_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_appointments_dates check (ceased_on is null or appointed_on is null or ceased_on >= appointed_on),
  constraint org_appointments_person_fk foreign key (client_id, person_id)
    references public.org_people (client_id, id) on delete restrict,
  constraint org_appointments_entity_fk foreign key (client_id, entity_id)
    references public.org_entities (client_id, id) on delete cascade
);

create table public.org_responsibilities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  area text not null check (btrim(area) <> ''),
  detail text not null default '',
  role_id uuid not null,
  deputy_role_id uuid,
  position integer not null default 0,
  last_change_on date,
  last_change_ref text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_responsibilities_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_responsibilities_role_fk foreign key (client_id, role_id)
    references public.org_roles (client_id, id) on delete restrict,
  constraint org_responsibilities_deputy_fk foreign key (client_id, deputy_role_id)
    references public.org_roles (client_id, id) on delete set null (deputy_role_id)
);

-- The instrument authority is recorded in: a delegation of authority policy,
-- articles, a board resolution. Amending it means superseding it, so a question
-- about a past date can still be answered.
create table public.org_authority_instruments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  title text not null check (btrim(title) <> ''),
  approved_on date,
  approved_by text not null default '',
  scope_note text not null default '',
  review_due_on date,
  reference text not null default '',
  document_id uuid references public.documents(id) on delete set null,
  superseded_on date,
  last_change_on date,
  last_change_ref text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_authority_instruments_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_authority_instruments_client_id_key unique (client_id, id)
);

create table public.org_authority_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  instrument_id uuid,
  matter_type text not null check (btrim(matter_type) <> ''),
  -- Null: every entity the instrument covers.
  entity_id uuid,
  min_amount numeric(18, 2),
  max_amount numeric(18, 2),
  currency text not null default '',
  -- Recorded: written in an instrument. Inferred: what the lawyer believes the
  -- position is without one (articles silent, practice observed). Shown apart.
  basis text not null default 'recorded' check (basis in ('recorded', 'inferred')),
  note text not null default '',
  position integer not null default 0,
  effective_from date,
  effective_to date,
  last_change_on date,
  last_change_ref text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_authority_rules_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_authority_rules_client_id_key unique (client_id, id),
  constraint org_authority_rules_band check (min_amount is null or max_amount is null or max_amount >= min_amount),
  constraint org_authority_rules_instrument_fk foreign key (client_id, instrument_id)
    references public.org_authority_instruments (client_id, id) on delete set null (instrument_id),
  constraint org_authority_rules_entity_fk foreign key (client_id, entity_id)
    references public.org_entities (client_id, id) on delete cascade
);

-- Who recommends, approves and signs under a rule: a role, a capacity in the
-- contracting entity ("one director"), or a body ("board resolution").
create table public.org_authority_parties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  rule_id uuid not null,
  step text not null check (step in ('recommend', 'approve', 'sign')),
  role_id uuid,
  capacity text check (capacity in ('director', 'secretary', 'signatory')),
  body text check (body in ('board', 'shareholders', 'committee')),
  count integer not null default 1 check (count between 1 and 20),
  position integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_authority_parties_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_authority_parties_one_kind check (
    (role_id is not null)::int + (capacity is not null)::int + (body is not null)::int = 1),
  constraint org_authority_parties_rule_fk foreign key (client_id, rule_id)
    references public.org_authority_rules (client_id, id) on delete cascade,
  constraint org_authority_parties_role_fk foreign key (client_id, role_id)
    references public.org_roles (client_id, id) on delete restrict
);

-- Licence types are configuration. Rows with no workspace are Scripta's
-- defaults; a workspace may add its own.
create table public.org_licence_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]+$'),
  label text not null,
  jurisdiction text not null default '',
  -- [{ key, label, type: text|date|entity|number|list, required, hint }]
  fields jsonb not null default '[]'::jsonb,
  default_lead_days integer not null default 60,
  typical_prerequisites text[] not null default '{}',
  has_expiry boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index org_licence_types_key on public.org_licence_types (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

create table public.org_licences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  entity_id uuid,
  type_key text not null default 'other',
  name text not null check (btrim(name) <> ''),
  authority text not null default '',
  country text not null default '',
  reference text not null default '',
  issued_on date,
  -- When only an approximation is known ("Nov 2024").
  issued_note text not null default '',
  expires_on date,
  renewal_lead_days integer not null default 60 check (renewal_lead_days between 0 and 730),
  owner_role_id uuid,
  owner_person_id uuid,
  -- [{ id, label, done }]
  prerequisites jsonb not null default '[]'::jsonb,
  renewal_state text not null default 'none' check (renewal_state in ('none', 'preparing', 'lodged')),
  renewal_lodged_on date,
  conditions text not null default '',
  recurring_note text not null default '',
  original_location text not null default '',
  -- Unverified until a document backs it. Missing fields are derived, not stored.
  verified boolean not null default false,
  field_sources jsonb not null default '{}'::jsonb,
  last_change_on date,
  last_change_ref text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint org_licences_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_licences_client_id_key unique (client_id, id),
  constraint org_licences_one_owner check (owner_role_id is null or owner_person_id is null),
  constraint org_licences_entity_fk foreign key (client_id, entity_id)
    references public.org_entities (client_id, id) on delete set null (entity_id),
  constraint org_licences_owner_role_fk foreign key (client_id, owner_role_id)
    references public.org_roles (client_id, id) on delete set null (owner_role_id),
  constraint org_licences_owner_person_fk foreign key (client_id, owner_person_id)
    references public.org_people (client_id, id) on delete set null (owner_person_id)
);

-- A recurring or one-off obligation. Its dated occurrences are generated from
-- the rule, never stored in advance; only what has been done to one is stored.
create table public.org_obligations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  entity_id uuid,
  licence_id uuid,
  title text not null check (btrim(title) <> ''),
  kind text not null default 'filing'
    check (kind in ('filing', 'return', 'meeting', 'register', 'payment', 'renewal', 'other')),
  recurrence text not null default 'none' check (recurrence in ('none', 'monthly', 'quarterly', 'annual')),
  -- The first (or only) due date; later occurrences keep its day of month.
  due_on date not null,
  ends_on date,
  owner_role_id uuid,
  owner_person_id uuid,
  penalty_note text not null default '',
  detail text not null default '',
  last_change_on date,
  last_change_ref text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint org_obligations_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_obligations_client_id_key unique (client_id, id),
  constraint org_obligations_one_owner check (owner_role_id is null or owner_person_id is null),
  constraint org_obligations_entity_fk foreign key (client_id, entity_id)
    references public.org_entities (client_id, id) on delete set null (entity_id),
  constraint org_obligations_licence_fk foreign key (client_id, licence_id)
    references public.org_licences (client_id, id) on delete set null (licence_id),
  constraint org_obligations_owner_role_fk foreign key (client_id, owner_role_id)
    references public.org_roles (client_id, id) on delete set null (owner_role_id),
  constraint org_obligations_owner_person_fk foreign key (client_id, owner_person_id)
    references public.org_people (client_id, id) on delete set null (owner_person_id)
);

create table public.org_obligation_occurrences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  obligation_id uuid not null,
  due_on date not null,
  state text not null default 'open' check (state in ('open', 'done', 'waived')),
  completed_on date,
  note text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_obligation_occurrences_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_obligation_occurrences_unique unique (obligation_id, due_on),
  constraint org_obligation_occurrences_obligation_fk foreign key (client_id, obligation_id)
    references public.org_obligations (client_id, id) on delete cascade
);

create table public.org_processes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  name text not null check (btrim(name) <> ''),
  summary text not null default '',
  owner_role_id uuid,
  cadence text not null default '',
  source_document_id uuid references public.documents(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  preset_id uuid references public.flow_presets(id) on delete set null,
  last_change_on date,
  last_change_ref text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint org_processes_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_processes_client_id_key unique (client_id, id),
  constraint org_processes_owner_fk foreign key (client_id, owner_role_id)
    references public.org_roles (client_id, id) on delete set null (owner_role_id)
);

create table public.org_process_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  process_id uuid not null,
  position integer not null default 0,
  title text not null check (btrim(title) <> ''),
  detail text not null default '',
  owner_role_id uuid,
  duration_days integer check (duration_days is null or duration_days between 0 and 365),
  source_section text not null default '',
  source_page integer,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_process_steps_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_process_steps_process_fk foreign key (client_id, process_id)
    references public.org_processes (client_id, id) on delete cascade,
  constraint org_process_steps_owner_fk foreign key (client_id, owner_role_id)
    references public.org_roles (client_id, id) on delete set null (owner_role_id)
);

-- A document that evidences a record: the certificate behind an entity's
-- registration number, the licence behind a licence row.
create table public.org_record_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  document_id uuid not null references public.documents(id) on delete cascade,
  record_type text not null check (record_type in
    ('entity', 'licence', 'instrument', 'process', 'holding', 'appointment', 'obligation', 'person')),
  record_id uuid not null,
  page integer,
  note text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_record_documents_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_record_documents_unique unique (document_id, record_type, record_id)
);

-- ===========================================================================
-- 2. Indexes, stamps, access
-- ===========================================================================

do $$
declare t text;
begin
  foreach t in array array['org_structure_changes','org_entities','org_people','org_holdings','org_roles',
    'org_role_lines','org_appointments','org_responsibilities','org_authority_instruments',
    'org_authority_rules','org_authority_parties','org_licences','org_obligations',
    'org_obligation_occurrences','org_processes','org_process_steps','org_record_documents'] loop
    execute format('create index %I on public.%I (client_id)', t || '_client_idx', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.stamp_created_by()',
                   t || '_stamp_author', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))',
                   'members read ' || t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write_workspace(workspace_id))',
                   'writers insert ' || t, t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id))',
                   'writers update ' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_write_workspace(workspace_id))',
                   'writers delete ' || t, t);
  end loop;
end $$;

alter table public.org_licence_types enable row level security;
grant select, insert, update, delete on public.org_licence_types to authenticated;
grant all on public.org_licence_types to service_role;
create trigger org_licence_types_updated_at before update on public.org_licence_types
  for each row execute function public.set_updated_at();
create policy "read licence types" on public.org_licence_types for select to authenticated
  using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy "writers insert licence types" on public.org_licence_types for insert to authenticated
  with check (workspace_id is not null and public.can_write_workspace(workspace_id));
create policy "writers update licence types" on public.org_licence_types for update to authenticated
  using (workspace_id is not null and public.can_write_workspace(workspace_id))
  with check (workspace_id is not null and public.can_write_workspace(workspace_id));
create policy "writers delete licence types" on public.org_licence_types for delete to authenticated
  using (workspace_id is not null and public.can_write_workspace(workspace_id));

create index org_roles_parent_idx on public.org_roles (parent_role_id);
create index org_holdings_subsidiary_idx on public.org_holdings (subsidiary_entity_id);
create index org_record_documents_record_idx on public.org_record_documents (record_type, record_id);
create index org_licences_expiry_idx on public.org_licences (client_id, expires_on);

-- A document link must stay inside the client: the document is the client's own
-- or filed on one of the client's matters. Checked here because the record id
-- points at one of several tables.
create or replace function public.guard_org_record_document()
returns trigger language plpgsql security definer set search_path = public
as $$
declare doc_client uuid; doc_matter uuid; matter_client uuid; found boolean;
begin
  select client_id, matter_id into doc_client, doc_matter from public.documents where id = new.document_id;
  if doc_matter is not null then
    select client_id into matter_client from public.matters where id = doc_matter;
    if matter_client is distinct from new.client_id then
      raise exception 'That document is not filed with this client.' using errcode = '22023';
    end if;
  elsif doc_client is distinct from new.client_id then
    raise exception 'That document is not filed with this client.' using errcode = '22023';
  end if;
  execute format('select exists (select 1 from public.%I where id = $1 and client_id = $2)',
                 case new.record_type
                   when 'entity' then 'org_entities' when 'licence' then 'org_licences'
                   when 'instrument' then 'org_authority_instruments' when 'process' then 'org_processes'
                   when 'holding' then 'org_holdings' when 'appointment' then 'org_appointments'
                   when 'obligation' then 'org_obligations' when 'person' then 'org_people' end)
    into found using new.record_id, new.client_id;
  if not found then
    raise exception 'That record is not part of this client.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger org_record_documents_guard before insert or update on public.org_record_documents
  for each row execute function public.guard_org_record_document();

-- Instruments and processes point at documents with a plain key; hold them to
-- the same rule.
create or replace function public.guard_org_document_ref()
returns trigger language plpgsql security definer set search_path = public
as $$
declare ref uuid; doc_client uuid; doc_matter uuid; matter_client uuid;
begin
  -- Read through jsonb: each table has only one of the two columns.
  ref := coalesce((to_jsonb(new) ->> 'document_id')::uuid, (to_jsonb(new) ->> 'source_document_id')::uuid);
  if ref is null then return new; end if;
  select client_id, matter_id into doc_client, doc_matter from public.documents where id = ref;
  if doc_matter is not null then
    select client_id into matter_client from public.matters where id = doc_matter;
    doc_client := matter_client;
  end if;
  if doc_client is distinct from new.client_id then
    raise exception 'That document is not filed with this client.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger org_authority_instruments_document before insert or update of document_id
  on public.org_authority_instruments for each row execute function public.guard_org_document_ref();
create trigger org_processes_document before insert or update of source_document_id
  on public.org_processes for each row execute function public.guard_org_document_ref();

-- ===========================================================================
-- 3. History: every change to the organisation, against the client
-- ===========================================================================

create or replace function public.org_record_change()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  prev jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  changed jsonb := '{}'::jsonb;
  was jsonb := '{}'::jsonb;
  k text;
  noun text;
  label text;
  verb text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(rec) loop
      if k in ('updated_at', 'last_change_on', 'last_change_ref', 'field_sources', 'created_at', 'created_by') then
        continue;
      end if;
      if (rec -> k) is distinct from (prev -> k) then
        changed := changed || jsonb_build_object(k, rec -> k);
        was := was || jsonb_build_object(k, prev -> k);
      end if;
    end loop;
    if changed = '{}'::jsonb then return null; end if;
  end if;

  noun := case tg_table_name
    when 'org_entities' then 'Entity' when 'org_people' then 'Person'
    when 'org_holdings' then 'Holding' when 'org_roles' then 'Role'
    when 'org_role_lines' then 'Functional line' when 'org_appointments' then 'Appointment'
    when 'org_responsibilities' then 'Responsibility' when 'org_authority_instruments' then 'Authority instrument'
    when 'org_authority_rules' then 'Authority rule' when 'org_authority_parties' then 'Authority party'
    when 'org_licences' then 'Licence' when 'org_obligations' then 'Obligation'
    when 'org_obligation_occurrences' then 'Obligation occurrence' when 'org_processes' then 'Process'
    when 'org_process_steps' then 'Process step' when 'org_structure_changes' then 'Planned structure change'
    when 'org_record_documents' then 'Supporting document' else tg_table_name end;
  label := coalesce(nullif(rec ->> 'name', ''), nullif(rec ->> 'title', ''), nullif(rec ->> 'full_name', ''),
                    nullif(rec ->> 'area', ''), nullif(rec ->> 'matter_type', ''), nullif(rec ->> 'capacity', ''),
                    nullif(rec ->> 'due_on', ''), '');
  verb := case tg_op when 'INSERT' then 'added' when 'DELETE' then 'removed' else 'changed' end;

  insert into public.audit_events
    (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values ((rec ->> 'workspace_id')::uuid, auth.uid(), public.actor_label(),
          'org.' || regexp_replace(tg_table_name, '^org_', '') || '.' || lower(tg_op),
          'client', (rec ->> 'client_id')::uuid,
          noun || ' ' || verb || case when label <> '' then ': ' || label else '' end,
          jsonb_build_object(
            'record_type', regexp_replace(tg_table_name, '^org_', ''),
            'record_id', rec ->> 'id',
            'changed', case when tg_op = 'UPDATE' then changed when tg_op = 'INSERT' then rec else null end,
            'before', case when tg_op = 'UPDATE' then was when tg_op = 'DELETE' then prev else null end,
            'effective_on', rec ->> 'last_change_on',
            'reference', rec ->> 'last_change_ref'));
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['org_structure_changes','org_entities','org_people','org_holdings','org_roles',
    'org_role_lines','org_appointments','org_responsibilities','org_authority_instruments',
    'org_authority_rules','org_authority_parties','org_licences','org_obligations',
    'org_obligation_occurrences','org_processes','org_process_steps','org_record_documents'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.org_record_change()',
                   t || '_history', t);
  end loop;
end $$;

-- ===========================================================================
-- 4. Documents a client holds that belong to no matter
-- ===========================================================================
--
-- The certificate of incorporation, the constitution, the licence: records of
-- the organisation rather than work on a matter. They go in `documents` like
-- every other document — one repository, one viewer, one parser — with the
-- same CASE the unfiled flow set down: filed to a matter, the matter decides;
-- held by a client, the client's workspace decides. Never both, never neither.

alter table public.documents alter column matter_id drop not null;
alter table public.documents
  add column workspace_id uuid,
  add column client_id uuid,
  add column org_category text check (org_category is null or org_category in
    ('constitution', 'certificate', 'register', 'resolution', 'minutes', 'policy', 'licence',
     'agreement', 'filing', 'correspondence', 'other'));
alter table public.documents add constraint documents_client_fk
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id);
alter table public.documents add constraint documents_one_home check (
  (matter_id is not null and client_id is null)
  or (matter_id is null and client_id is not null and workspace_id is not null));
create index documents_client_idx on public.documents (client_id) where client_id is not null;

drop policy if exists "members read documents" on public.documents;
create policy "members read documents" on public.documents for select to authenticated
  using (case when matter_id is not null then public.is_matter_member(matter_id)
              else public.is_workspace_member(workspace_id) end);
drop policy if exists "writers insert documents" on public.documents;
create policy "writers insert documents" on public.documents for insert to authenticated
  with check (case when matter_id is not null then public.can_write_matter(matter_id)
                   else public.can_write_workspace(workspace_id) end);
drop policy if exists "writers update documents" on public.documents;
create policy "writers update documents" on public.documents for update to authenticated
  using (case when matter_id is not null then public.can_write_matter(matter_id)
              else public.can_write_workspace(workspace_id) end)
  with check (case when matter_id is not null then public.can_write_matter(matter_id)
                   else public.can_write_workspace(workspace_id) end);
drop policy if exists "writers delete documents" on public.documents;
create policy "writers delete documents" on public.documents for delete to authenticated
  using (case when matter_id is not null then public.can_write_matter(matter_id)
              else public.can_write_workspace(workspace_id) end);

-- A client document cannot be quietly moved onto a matter or into another
-- client: the two homes have different readers.
create or replace function public.guard_document_home()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (new.client_id is distinct from old.client_id
      or new.workspace_id is distinct from old.workspace_id
      or (old.matter_id is null) <> (new.matter_id is null)) then
    raise exception 'A document stays where it was filed.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger documents_guard_home before update on public.documents
  for each row execute function public.guard_document_home();

-- Files for client documents live under `<ws>/clients/<client>/…`.
create or replace function public.can_read_storage_path(_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare parts text[] := storage.foldername(_name); ws uuid; seg2 text; flow uuid; client uuid;
begin
  if array_length(parts,1) is null or array_length(parts,1) < 2 then return false; end if;
  begin ws := parts[1]::uuid; exception when others then return false; end;
  seg2 := parts[2];
  if seg2 ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return public.is_matter_member(seg2::uuid);
  end if;
  if seg2 = 'personal' then
    return array_length(parts,1) >= 3 and parts[3] = auth.uid()::text;
  end if;
  if seg2 = 'flows' then
    if array_length(parts,1) < 3 then return false; end if;
    begin flow := parts[3]::uuid; exception when others then return false; end;
    return exists (select 1 from public.matter_flows f where f.id = flow and f.workspace_id = ws)
       and public.is_flow_member(flow);
  end if;
  if seg2 = 'clients' then
    if array_length(parts,1) < 3 then return false; end if;
    begin client := parts[3]::uuid; exception when others then return false; end;
    return exists (select 1 from public.clients c where c.id = client and c.workspace_id = ws)
       and public.is_workspace_member(ws);
  end if;
  return public.is_workspace_member(ws);
end;
$$;

create or replace function public.can_write_storage_path(_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare parts text[] := storage.foldername(_name); ws uuid; seg2 text; flow uuid; client uuid;
begin
  if array_length(parts,1) is null or array_length(parts,1) < 2 then return false; end if;
  begin ws := parts[1]::uuid; exception when others then return false; end;
  seg2 := parts[2];
  if seg2 ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return public.can_write_matter(seg2::uuid);
  end if;
  if seg2 = 'personal' then
    return array_length(parts,1) >= 3 and parts[3] = auth.uid()::text;
  end if;
  if seg2 = 'flows' then
    if array_length(parts,1) < 3 then return false; end if;
    begin flow := parts[3]::uuid; exception when others then return false; end;
    return exists (select 1 from public.matter_flows f where f.id = flow and f.workspace_id = ws)
       and public.can_write_flow(flow);
  end if;
  if seg2 = 'clients' then
    if array_length(parts,1) < 3 then return false; end if;
    begin client := parts[3]::uuid; exception when others then return false; end;
    return exists (select 1 from public.clients c where c.id = client and c.workspace_id = ws)
       and public.can_write_workspace(ws);
  end if;
  return public.can_write_workspace(ws);
end;
$$;

-- The bin finishes client documents as well as matter ones.
create or replace function public.purge_recently_deleted()
returns integer language plpgsql security definer set search_path = public
as $$
declare t text; removed integer := 0; n integer; ws uuid;
  cut timestamptz := now() - make_interval(days => public.recently_deleted_days());
begin
  for ws in select m.workspace_id from public.workspace_members m
             where m.user_id = auth.uid() and m.role in ('owner','admin') loop
    foreach t in array array['matters','documents','playbooks','templates','corporate_documents',
                             'research_matters','flow_presets','flow_preset_families','precedents',
                             'contract_drafts','matter_flows'] loop
      if t = 'documents' then
        execute 'delete from public.documents d where d.deleted_at is not null and d.deleted_at < $1'
              || ' and (exists (select 1 from public.matters m where m.id = d.matter_id and m.workspace_id = $2)'
              || '      or (d.matter_id is null and d.workspace_id = $2))'
          using cut, ws;
      else
        execute format('delete from public.%I where deleted_at is not null and deleted_at < $1 and workspace_id = $2', t)
          using cut, ws;
      end if;
      get diagnostics n = row_count;
      removed := removed + n;
    end loop;
  end loop;
  return removed;
end;
$$;

-- ===========================================================================
-- 5. A matter may concern one of its client's entities
-- ===========================================================================

alter table public.matters add column client_entity_id uuid;
alter table public.matters add constraint matters_client_entity_fk
  foreign key (client_id, client_entity_id) references public.org_entities (client_id, id)
  on delete set null (client_entity_id);
create index matters_client_entity_idx on public.matters (client_entity_id) where client_entity_id is not null;

-- The entity belongs to the client; a matter that changes client, or leaves
-- one, leaves the entity behind with it.
create or replace function public.matter_entity_follows_client()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.client_id is distinct from old.client_id then
    new.client_entity_id := null;
  end if;
  return new;
end;
$$;
create trigger matters_entity_follows_client before update of client_id on public.matters
  for each row execute function public.matter_entity_follows_client();

-- ===========================================================================
-- 6. Scripta's default licence types
-- ===========================================================================

insert into public.org_licence_types (workspace_id, key, label, jurisdiction, fields, default_lead_days, typical_prerequisites, has_expiry, position) values
 (null, 'sector_minerals_export', 'Sector licence — minerals export', '',
  '[{"key":"authority","label":"Authority","type":"text","required":true},
    {"key":"reference","label":"Licence number","type":"text","required":true},
    {"key":"entity","label":"Holder entity","type":"entity","required":true},
    {"key":"issued_on","label":"Valid from","type":"date","required":true},
    {"key":"expires_on","label":"Expires","type":"date","required":true},
    {"key":"permitted","label":"Permitted minerals","type":"text","required":false,"hint":"Recorded in the conditions"},
    {"key":"conditions","label":"Conditions","type":"text","required":false}]'::jsonb,
  60, array['Audited accounts','Tax clearance certificate','Identification of directors'], true, 10),
 (null, 'operating_permit', 'Business operating permit', '',
  '[{"key":"authority","label":"Authority","type":"text","required":true},
    {"key":"reference","label":"Permit number","type":"text","required":true},
    {"key":"entity","label":"Holder entity","type":"entity","required":true},
    {"key":"issued_on","label":"Issued","type":"date","required":false},
    {"key":"expires_on","label":"Expires","type":"date","required":true}]'::jsonb,
  30, array['Payment of permit fee'], true, 20),
 (null, 'tax_registration', 'Tax registration (TIN / VAT)', '',
  '[{"key":"authority","label":"Authority","type":"text","required":true},
    {"key":"reference","label":"Registration number","type":"text","required":true},
    {"key":"entity","label":"Registered entity","type":"entity","required":true},
    {"key":"issued_on","label":"Registered","type":"date","required":false},
    {"key":"recurring_note","label":"Returns","type":"text","required":false,"hint":"e.g. Monthly return, 15th"}]'::jsonb,
  0, array[]::text[], false, 30),
 (null, 'employer_registration', 'Employer registration (social security)', '',
  '[{"key":"authority","label":"Authority","type":"text","required":true},
    {"key":"reference","label":"Employer number","type":"text","required":true},
    {"key":"entity","label":"Registered entity","type":"entity","required":true},
    {"key":"issued_on","label":"Registered","type":"date","required":false},
    {"key":"recurring_note","label":"Contributions","type":"text","required":false,"hint":"e.g. Due 14th monthly"}]'::jsonb,
  0, array[]::text[], false, 40),
 (null, 'environmental_permit', 'Environmental permit', '',
  '[{"key":"authority","label":"Authority","type":"text","required":true},
    {"key":"reference","label":"Permit number","type":"text","required":true},
    {"key":"entity","label":"Holder entity","type":"entity","required":true},
    {"key":"issued_on","label":"Issued","type":"date","required":false},
    {"key":"expires_on","label":"Expires","type":"date","required":false},
    {"key":"conditions","label":"Conditions","type":"text","required":false}]'::jsonb,
  90, array['Environmental management plan','Annual environmental report'], true, 50),
 (null, 'data_protection', 'Data-protection registration', '',
  '[{"key":"authority","label":"Authority","type":"text","required":true},
    {"key":"reference","label":"Registration number","type":"text","required":true},
    {"key":"entity","label":"Controller entity","type":"entity","required":true},
    {"key":"issued_on","label":"Registered","type":"date","required":false},
    {"key":"expires_on","label":"Renewal due","type":"date","required":false}]'::jsonb,
  30, array[]::text[], true, 60),
 (null, 'free_zone_trade', 'Free-zone / trade licence', '',
  '[{"key":"authority","label":"Authority","type":"text","required":true},
    {"key":"reference","label":"Licence number","type":"text","required":true},
    {"key":"entity","label":"Licensee","type":"entity","required":true},
    {"key":"issued_on","label":"Issued","type":"date","required":false},
    {"key":"expires_on","label":"Expires","type":"date","required":true},
    {"key":"permitted","label":"Licensed activities","type":"text","required":false}]'::jsonb,
  45, array['Lease or flexi-desk agreement','Passport copies of shareholders'], true, 70),
 (null, 'professional_licence', 'Professional / practising licence', '',
  '[{"key":"authority","label":"Authority","type":"text","required":true},
    {"key":"reference","label":"Licence number","type":"text","required":true},
    {"key":"entity","label":"Holder","type":"entity","required":false},
    {"key":"issued_on","label":"Issued","type":"date","required":false},
    {"key":"expires_on","label":"Expires","type":"date","required":true}]'::jsonb,
  30, array['Continuing education hours','Practising fee'], true, 80),
 (null, 'other', 'Something else', '',
  '[{"key":"authority","label":"Authority","type":"text","required":false},
    {"key":"reference","label":"Reference","type":"text","required":false},
    {"key":"entity","label":"Holder entity","type":"entity","required":false},
    {"key":"issued_on","label":"Issued","type":"date","required":false},
    {"key":"expires_on","label":"Expires","type":"date","required":false}]'::jsonb,
  60, array[]::text[], true, 90);

-- ===========================================================================
-- 7. Function hardening, as for every definer function before this
-- ===========================================================================

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig,
           pg_catalog.pg_get_function_result(p.oid) = 'trigger' AS is_trigger
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
       AND p.proname IN ('guard_org_record_document', 'guard_org_document_ref', 'org_record_change',
                         'guard_document_home', 'can_read_storage_path', 'can_write_storage_path',
                         'purge_recently_deleted', 'matter_entity_follows_client')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, public', f.sig);
    IF f.is_trigger THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
  END LOOP;
END $$;
