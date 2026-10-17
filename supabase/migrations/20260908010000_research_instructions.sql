-- The instructions a lawyer writes to start a piece of research.
--
-- Research had no room for them at all: a matter held a question, a
-- jurisdiction, a source filter and a date cut-off, so everything about who
-- the work is for and what it must cover had nowhere to live and never
-- reached the model. One column on the matter, owned by the records save.
alter table public.research_matters
  add column if not exists instructions text not null default '';

comment on column public.research_matters.instructions is
  'What the lawyer asked for: scope, audience, constraints. Read into the research prompt.';
