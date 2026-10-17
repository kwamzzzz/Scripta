-- A cover image for a course, shown on its tile and at the top of the course.
--
-- The path is stored, never a link: a short-lived signed link is made when the
-- cover is shown, as for every other learning file. It lives where the
-- course's privacy says (the author's personal folder for their own reading,
-- the course's folder for firm training) and moves with the course when that
-- changes. The credit is the photographer's line for a photo that asks for one.

alter table public.learning_courses
  add column if not exists cover_path text,
  add column if not exists cover_credit text not null default '';
