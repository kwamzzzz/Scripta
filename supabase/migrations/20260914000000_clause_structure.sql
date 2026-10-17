-- What parsing already worked out, kept rather than rediscovered.
--
-- Splitting a document tells us two things beyond the wording: what kind of
-- provision each row is, and what it points at. Both were computed at parse
-- time and then dropped on the floor, so every screen that wanted them had to
-- derive them again from the text — and would have derived them slightly
-- differently, which is how one document ends up meaning two things.
--
-- Hierarchy is deliberately NOT stored. Parent, children and depth are already
-- in `num`: "8.3" sits under "8", its children are the rows beginning "8.3.",
-- and its depth is the number of dots. Adding columns for facts the number
-- already carries would create two sources of truth and let them disagree.
--
-- `refs` keeps the type beside the target because "2" on its own cannot say
-- whether the source wrote clause 2 or Schedule 2, and those resolve to
-- different places. The question this has to answer later is not "which
-- numbers were mentioned" but "which provision does this point to".
--
-- Both are additive and nullable. Rows parsed before this have kind null and
-- no refs, which is honest: nothing was recorded about them, as opposed to
-- nothing being there.

alter table public.clauses
  add column if not exists kind text,
  add column if not exists refs jsonb not null default '[]'::jsonb;

alter table public.clauses drop constraint if exists clauses_kind_check;
alter table public.clauses add constraint clauses_kind_check
  check (kind is null or kind in ('section', 'definition', 'provision'));

comment on column public.clauses.kind is
  'Structural, not semantic: section (holds parts), definition, or operative provision. Null for rows parsed before this was recorded.';
comment on column public.clauses.refs is
  'What this provision points at, as written: [{"type":"schedule","target":"2"}]. The type is kept because "2" alone cannot say whether the source wrote clause 2 or Schedule 2. Records that an edge exists; resolving it is a later layer.';

-- "Every definition in this matter" is the query this exists to make cheap.
create index if not exists clauses_kind_idx on public.clauses (matter_id, kind);
