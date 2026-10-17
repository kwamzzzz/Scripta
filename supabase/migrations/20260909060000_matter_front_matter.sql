-- The first page of a contract, editable.
--
-- An exported contract's cover and preamble were derived entirely from the
-- matter's own fields, so a lawyer could not correct a party's name, add an
-- address, write the recitals, or say what the agreement is actually called
-- without renaming the matter. None of that belongs to the matter record; it
-- belongs to the document the matter produces.
--
-- Null means "derive it from the matter", which is what every existing matter
-- does today and continues to do until someone edits the first page.
alter table public.matters add column if not exists front_matter jsonb;

comment on column public.matters.front_matter is
  'The editable first page and preamble of an exported contract: agreement type, party names and roles, date, recitals. Null means derive from the matter''s own fields.';
