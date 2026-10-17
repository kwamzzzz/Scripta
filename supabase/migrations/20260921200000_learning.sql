-- Learning: structured legal training, study discipline and CPD.
--
-- Column 8, and it stands on its own. Nothing here reads a matter, a playbook,
-- a precedent or an organisation. Two audiences only: a junior lawyer working
-- through training the firm assigned, and a lawyer keeping their own reading
-- discipline in a course they made for themselves.
--
-- Three rules decide the shape of all of it.
--
-- NUMBERS ARE DERIVED, NEVER STORED. An item's "2.1" is its parent chain and
-- its position, computed when it is read. Nothing in this file has a `number`
-- column, including the outline. A stored number is a number that goes stale
-- the first time somebody drags an item, and it takes every cross-reference,
-- every outline line and every question a learner asked about "2.1" with it.
-- Position is the only ordering fact, and it is the only one written down.
--
-- PROGRESS IS ITEM COMPLETION. Every percentage, streak and CPD figure this
-- area shows is derived from learning_item_progress and, later, from an issued
-- certificate. There is no cached percentage anywhere, and no seconds-on-page
-- column: a learner who reads slowly has not learned less, and a training tool
-- that counts minutes teaches people to leave a tab open.
--
-- BODIES ARE BLOCK DOCUMENTS. item.payload holds a block document with stable
-- block ids, not an HTML string, because a highlight, a note and a tutor
-- citation all have to point at a block that survives the paragraph above it
-- being rewritten.

-- ---------------------------------------------------------------- courses --
-- A course is either assigned training, which the firm can see and which
-- carries CPD hours, or one lawyer's own reading, which is private to them and
-- carries none. That single distinction is why `visibility` is on the course
-- and not on an enrolment.
create table public.learning_courses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null default '',
  subtitle text not null default '',
  /*
   * assigned  training the firm set: visible to the workspace, CPD-bearing,
   *           certificated on completion.
   * self      a reading course a lawyer made for themselves: private to them,
   *           no certificate, no hours. Study, not assessed training.
   */
  visibility text not null default 'assigned' check (visibility in ('assigned', 'self')),
  /* Hours claimable on completion. A self course carries none, enforced below. */
  cpd_hours numeric(5, 2) not null default 0 check (cpd_hours >= 0),
  opens_on date,
  ends_on date,
  published_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint learning_self_courses_carry_no_hours
    check (visibility = 'assigned' or cpd_hours = 0)
);

create index learning_courses_workspace_idx
  on public.learning_courses (workspace_id, updated_at desc);

-- ------------------------------------------------------------ course menu --
-- The menu is authored data, not a fixed nav. A flat ordered list where an
-- entry is a heading, a divider or a link is what produces the grouped look
-- (Welcome / Course content / Course tools) and what lets an instructor add a
-- group and drag items into it. A fixed nav cannot be regrouped by the person
-- who knows how the course should read.
create table public.learning_menu_entries (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.learning_courses(id) on delete cascade,
  kind text not null check (kind in ('heading', 'divider', 'link')),
  label text not null default '',
  /* What a link points at. A divider and a heading point at nothing. */
  target_kind text check (target_kind in ('module', 'item', 'tool', 'url')),
  target_ref text,
  /* Completion ticks render against content entries only. */
  counts_as_content boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_menu_links_have_a_target
    check (kind <> 'link' or (target_kind is not null and target_ref is not null))
);

create index learning_menu_entries_course_idx
  on public.learning_menu_entries (course_id, position);

-- --------------------------------------------------------------- modules --
-- The outline is the first thing in a module and the content below mirrors it.
-- It is stored as a structured list rather than free text so each line can name
-- the item that answers it: [{ id, text, item_id }]. No line carries a number —
-- the number comes from the item's position when it is read, which is what
-- keeps outline and content from drifting apart after a drag.
create table public.learning_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.learning_courses(id) on delete cascade,
  title text not null default '',
  week integer,
  cpd_hours numeric(5, 2) not null default 0 check (cpd_hours >= 0),
  outline jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  /* A module without an outline cannot be published. The rule is in the
     database because it is the one thing that makes a module a module. */
  constraint learning_published_modules_have_an_outline
    check (published_at is null or jsonb_array_length(outline) > 0)
);

create index learning_modules_course_idx on public.learning_modules (course_id, position);

-- ----------------------------------------------------------------- items --
-- One row for every kind of content. The payload varies behind one interface
-- rather than nine tables, because author and learner render the whole list
-- through one component and forking the page by kind is how that stops being
-- true.
create table public.learning_items (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.learning_modules(id) on delete cascade,
  /* Nesting. A child's number is the parent's plus its own position: 2 -> 2.1. */
  parent_item_id uuid references public.learning_items(id) on delete cascade,
  position integer not null default 0,
  /* The outline is not in here: it is a field on the module, rendered above
     the content. An item kind for it would be a second place to store the
     same list, and they would disagree within a week. */
  kind text not null default 'item'
    check (kind in ('item', 'video', 'link', 'file', 'folder',
                    'discussion', 'assignment', 'quiz')),
  title text not null default '',
  /*
   * A block document with stable block ids — { blocks: [{ id, type, ... }] } —
   * never an HTML string. Notes anchor to a block id, the tutor cites one, and
   * the clause block, the authority citation and the ungraded check are real
   * block types rather than styled text.
   */
  payload jsonb not null default '{}'::jsonb,
  /* Per item, so a module can be published while one item is still being written. */
  visible boolean not null default true,
  /*
   * What has to be true before a learner can open this. This is what holds a
   * quiz locked until the module has been worked through:
   *   { "after": ["<item id>", ...] }  or  { "on": "2026-10-01" }
   */
  release_rule jsonb,
  /* Drives weakest-areas later; lives on the item so a low score points back here. */
  topic_tags text[] not null default '{}',
  /* Which outline line this item answers. An item answering none is flagged
     before publish — a warning the author sees, not a constraint, because it
     has to be possible to write the item before the outline line. */
  outline_line_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index learning_items_module_idx
  on public.learning_items (module_id, parent_item_id, position);

-- ------------------------------------------------------------- enrolment --
create table public.learning_enrolments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.learning_courses(id) on delete cascade,
  person_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null default 'learner' check (role in ('learner', 'author')),
  enrolled_at timestamptz not null default now(),
  unique (course_id, person_id)
);

create index learning_enrolments_person_idx on public.learning_enrolments (person_id);

-- -------------------------------------------------------------- progress --
-- The only record of what a learner has done, and the source of every figure
-- this area shows. `completed_on` is set by an explicit action — never by
-- scrolling, and never by time on page.
create table public.learning_item_progress (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id uuid not null references public.learning_items(id) on delete cascade,
  state text not null default 'started' check (state in ('started', 'complete')),
  started_on timestamptz not null default now(),
  completed_on timestamptz,
  updated_at timestamptz not null default now(),
  unique (person_id, item_id),
  constraint learning_complete_progress_has_a_date
    check (state <> 'complete' or completed_on is not null)
);

create index learning_item_progress_person_idx
  on public.learning_item_progress (person_id, completed_on desc);

create trigger learning_courses_updated_at before update on public.learning_courses
  for each row execute function public.set_updated_at();
create trigger learning_menu_entries_updated_at before update on public.learning_menu_entries
  for each row execute function public.set_updated_at();
create trigger learning_modules_updated_at before update on public.learning_modules
  for each row execute function public.set_updated_at();
create trigger learning_items_updated_at before update on public.learning_items
  for each row execute function public.set_updated_at();
create trigger learning_item_progress_updated_at before update on public.learning_item_progress
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------- access --
-- Assigned training is firm business: anybody in the workspace can read it, and
-- its author can change it. A self course is one lawyer's reading and nobody
-- else's business. Both answers come from the course, so everything hanging off
-- a course asks the course rather than repeating the test.
create or replace function public.learning_course_readable(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.learning_courses c
    where c.id = p_course
      and public.is_workspace_member(c.workspace_id)
      and (c.visibility = 'assigned' or c.created_by = auth.uid())
  );
$$;

create or replace function public.learning_course_writable(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.learning_courses c
    where c.id = p_course
      and public.is_workspace_member(c.workspace_id)
      and (
        c.created_by = auth.uid()
        or exists (
          select 1 from public.learning_enrolments e
          where e.course_id = c.id and e.person_id = auth.uid() and e.role = 'author'
        )
      )
  );
$$;

grant execute on function public.learning_course_readable(uuid) to authenticated;
grant execute on function public.learning_course_writable(uuid) to authenticated;

alter table public.learning_courses enable row level security;
grant select, insert, update, delete on public.learning_courses to authenticated;
grant all on public.learning_courses to service_role;

create policy "members read learning courses" on public.learning_courses
  for select to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (visibility = 'assigned' or created_by = auth.uid())
  );
create policy "members create learning courses" on public.learning_courses
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));
create policy "authors update learning courses" on public.learning_courses
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));
create policy "authors delete learning courses" on public.learning_courses
  for delete to authenticated
  using (created_by = auth.uid());

-- The menu, the modules and the items all inherit the course's answer.
do $$
declare t text;
begin
  foreach t in array array['learning_menu_entries', 'learning_modules']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format($p$create policy "read %1$s" on public.%1$I
      for select to authenticated using (public.learning_course_readable(course_id))$p$, t);
    execute format($p$create policy "write %1$s" on public.%1$I
      for insert to authenticated with check (public.learning_course_writable(course_id))$p$, t);
    execute format($p$create policy "update %1$s" on public.%1$I
      for update to authenticated
      using (public.learning_course_writable(course_id))
      with check (public.learning_course_writable(course_id))$p$, t);
    execute format($p$create policy "delete %1$s" on public.%1$I
      for delete to authenticated using (public.learning_course_writable(course_id))$p$, t);
  end loop;
end $$;

alter table public.learning_items enable row level security;
grant select, insert, update, delete on public.learning_items to authenticated;
grant all on public.learning_items to service_role;

create policy "read learning items" on public.learning_items
  for select to authenticated
  using (exists (
    select 1 from public.learning_modules m
    where m.id = module_id and public.learning_course_readable(m.course_id)
  ));
create policy "write learning items" on public.learning_items
  for insert to authenticated
  with check (exists (
    select 1 from public.learning_modules m
    where m.id = module_id and public.learning_course_writable(m.course_id)
  ));
create policy "update learning items" on public.learning_items
  for update to authenticated
  using (exists (
    select 1 from public.learning_modules m
    where m.id = module_id and public.learning_course_writable(m.course_id)
  ))
  with check (exists (
    select 1 from public.learning_modules m
    where m.id = module_id and public.learning_course_writable(m.course_id)
  ));
create policy "delete learning items" on public.learning_items
  for delete to authenticated
  using (exists (
    select 1 from public.learning_modules m
    where m.id = module_id and public.learning_course_writable(m.course_id)
  ));

-- An enrolment is readable by the person enrolled and by whoever can author the
-- course. Progress is readable by the learner alone: a record of how somebody
-- studies, readable by their firm, is surveillance, and the gradebook is the
-- only place a mark is ever anybody else's business.
alter table public.learning_enrolments enable row level security;
grant select, insert, update, delete on public.learning_enrolments to authenticated;
grant all on public.learning_enrolments to service_role;

create policy "read learning enrolments" on public.learning_enrolments
  for select to authenticated
  using (person_id = auth.uid() or public.learning_course_writable(course_id));
create policy "enrol in learning courses" on public.learning_enrolments
  for insert to authenticated
  with check (
    (person_id = auth.uid() and public.learning_course_readable(course_id))
    or public.learning_course_writable(course_id)
  );
create policy "leave learning courses" on public.learning_enrolments
  for delete to authenticated
  using (person_id = auth.uid() or public.learning_course_writable(course_id));

alter table public.learning_item_progress enable row level security;
grant select, insert, update, delete on public.learning_item_progress to authenticated;
grant all on public.learning_item_progress to service_role;

create policy "learners read their own progress" on public.learning_item_progress
  for select to authenticated using (person_id = auth.uid());
create policy "learners record their own progress" on public.learning_item_progress
  for insert to authenticated with check (person_id = auth.uid());
create policy "learners update their own progress" on public.learning_item_progress
  for update to authenticated
  using (person_id = auth.uid()) with check (person_id = auth.uid());
create policy "learners clear their own progress" on public.learning_item_progress
  for delete to authenticated using (person_id = auth.uid());
