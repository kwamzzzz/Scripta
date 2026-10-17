-- An optional cover image for a module, as for a course: a stored path shown
-- through a signed link, and the photographer's credit. A module without one
-- looks as it always has.

alter table public.learning_modules
  add column if not exists cover_path text,
  add column if not exists cover_credit text not null default '';
