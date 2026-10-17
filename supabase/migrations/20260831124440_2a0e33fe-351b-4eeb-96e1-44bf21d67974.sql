alter table public.resolutions add column if not exists source public.analysis_source not null default 'human';
alter table public.drafting_points add column if not exists source public.analysis_source not null default 'human';
alter table public.clauses add column if not exists analysis_error text;