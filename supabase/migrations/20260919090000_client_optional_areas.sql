-- Which of the corporate-services areas a client's file carries.
--
-- Every organisation client has the essentials: organogram, group structure,
-- people, authority, entities, key documents and Ask. A client whose company
-- the firm helps run also needs licences, the compliance calendar, processes
-- and marketing; an advisory client does not, and showing them is noise.
--
-- This is what the file shows, not what anyone may read. Switching an area off
-- hides it and deletes nothing; switching it back on brings the records back.
-- The setting is the firm's, like the organisation itself, so any writer in
-- the workspace may change it through the existing update policy.

alter table public.clients
  add column optional_areas text[] not null default '{}'
  constraint clients_optional_areas_known
    check (optional_areas <@ array['licences', 'calendar', 'processes', 'marketing']::text[]);

-- Clients that already exist keep everything they had. Their "Updated" date is
-- not a change anyone made, so the stamp is held still.
alter table public.clients disable trigger clients_updated_at;
update public.clients
   set optional_areas = array['licences', 'calendar', 'processes', 'marketing']::text[];
alter table public.clients enable trigger clients_updated_at;
