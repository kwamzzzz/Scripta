-- A clause carries two different kinds of writing from a reviewer: a note kept
-- on the record for a human to read later, and an instruction handed to the
-- redraft. They are the same shape, so they share the comments table; `kind` is
-- the only thing that tells them apart. Everything written before this
-- migration was a note, which is why that is the default.
alter table public.comments
  add column if not exists kind text not null default 'note';

alter table public.comments
  drop constraint if exists comments_kind_check;

alter table public.comments
  add constraint comments_kind_check check (kind in ('note', 'instruction'));

create index if not exists comments_entity_kind_idx
  on public.comments (entity_id, kind);
