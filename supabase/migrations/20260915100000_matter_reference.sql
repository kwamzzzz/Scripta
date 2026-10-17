-- A stable file identifier for every matter.
--
-- The card reads as a legal file largely because of one line: the reference,
-- set in the mono face, above the name. A matter without one has nothing to be
-- called in an email, a file note or a conversation across a desk.
--
-- Two things this must respect.
--
-- FIRST, references already exist and they are the firm's own, not a scheme
-- Scripta invented: NAF-SUP-001, MKA-SKA-010626. A typed reference is never
-- touched. Generation fills the gap where nobody supplied one; it does not
-- impose a convention on work that already has one.
--
-- SECOND, the number cannot be worked out by the client. Two matters created
-- in the same second from two tabs would both read the same maximum and both
-- claim it. The counter is therefore a row the database increments inside the
-- insert, which is atomic whatever the callers are doing.

create table if not exists public.matter_reference_counters (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  year integer not null,
  next_value integer not null default 0,
  primary key (workspace_id, year)
);

comment on table public.matter_reference_counters is
  'Per workspace, per year: the last number handed out for a generated matter reference. Incremented inside the insert so concurrent creates cannot collide.';

alter table public.matter_reference_counters enable row level security;

-- Nobody reads or writes this directly; the trigger runs as definer.
drop policy if exists "no direct access to counters" on public.matter_reference_counters;

/* One number, claimed atomically. `on conflict do update` takes the row lock,
   so two simultaneous inserts serialise rather than racing. */
create or replace function public.next_matter_reference(ws uuid, yr integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.matter_reference_counters (workspace_id, year, next_value)
  values (ws, yr, 1)
  on conflict (workspace_id, year)
  do update set next_value = matter_reference_counters.next_value + 1
  returning next_value into n;
  return 'MAT-' || yr::text || '-' || lpad(n::text, 3, '0');
end;
$$;

/* Fill the gap, never overwrite. A matter created with the firm's own
   reference keeps it exactly as typed. */
create or replace function public.set_matter_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reference is null or btrim(new.reference) = '' then
    new.reference := public.next_matter_reference(
      new.workspace_id,
      extract(year from now())::integer
    );
  end if;
  return new;
end;
$$;

drop trigger if exists matters_set_reference on public.matters;
create trigger matters_set_reference
  before insert on public.matters
  for each row execute function public.set_matter_reference();

-- Two matters must not answer to the same name. Blank references are exempt,
-- because rows predating this may legitimately have none.
create unique index if not exists matters_reference_unique
  on public.matters (workspace_id, reference)
  where reference is not null and btrim(reference) <> '';
