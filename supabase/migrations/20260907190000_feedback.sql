-- "Share your feedback" stops being a picture.
--
-- The chip has been drawn in every topbar since the wireframe and has never
-- done anything. This table is what it writes to, and what the admin portal at
-- /settings/feedback reads back.
--
-- Two things shape the schema. First, feedback without context is close to
-- worthless: a row records the route the member was looking at and the screen
-- name that route reports, so "the export is broken" can be traced to the
-- screen it was written from. Second, feedback is written by a named colleague
-- inside a workspace, so it is scoped to that workspace and only the people
-- who run the workspace (owner, admin) may read what everyone else wrote.

-- Three kinds, because a longer list makes the sender classify instead of
-- write. "other" is the honest bucket for praise, a question, or a rename
-- request that is neither a defect nor a proposal.
create type public.feedback_kind as enum ('bug', 'idea', 'other');

-- The whole workflow: it arrives unread, an admin reads it, an admin resolves
-- it. Nothing here is a ticketing system; the transitions the app allows are
-- in src/lib/feedback.ts and are covered by tests.
create type public.feedback_status as enum ('unread', 'read', 'resolved');

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Cascading on delete is deliberate: this is a named colleague's own words
  -- about the product, not a record of the firm's work, so it leaves with them.
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind public.feedback_kind not null default 'other',
  -- Bounded in the database as well as the composer, so a scripted client
  -- cannot post a megabyte into a list the admins have to read.
  message text not null check (length(btrim(message)) between 1 and 2000),

  -- Where the sender was. `route` is the pathname plus its search string, which
  -- is what the router actually holds; `screen` is the human name the shell
  -- already knows for that screen ("Active Mandates", the matter's own name).
  -- Free text on both: a route is not a foreign key, and a screen name changes
  -- with the copy. Recording them as strings preserves what was true then.
  route text not null default '',
  screen text not null default '',

  status public.feedback_status not null default 'unread',
  -- Null until an admin first moves it; set by the trigger below, never by the
  -- client, so "read by" cannot be claimed by whoever writes the request.
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

grant select, insert, update on public.feedback to authenticated;
grant all on public.feedback to service_role;
alter table public.feedback enable row level security;

-- Admin-only reading, enforced here rather than in the portal's markup: a
-- lawyer or viewer who calls /rest/v1/feedback directly gets back their own
-- rows and nothing else, because can_admin_workspace() is the only policy that
-- widens the result beyond author_id = auth.uid(). Two permissive policies are
-- OR'd, which is exactly the rule wanted: your own, plus everyone's if you run
-- the workspace.
create policy "admins read workspace feedback" on public.feedback for select to authenticated
  using (public.can_admin_workspace(workspace_id));
create policy "authors read own feedback" on public.feedback for select to authenticated
  using (author_id = auth.uid());

-- Any member may submit, viewers included — the people most likely to hit a
-- rough edge are the ones with the fewest permissions. The author must be
-- themselves; feedback cannot be filed in someone else's name.
create policy "members submit feedback" on public.feedback for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and author_id = auth.uid());

create policy "admins update feedback status" on public.feedback for update to authenticated
  using (public.can_admin_workspace(workspace_id))
  with check (public.can_admin_workspace(workspace_id));

-- No delete policy, so nobody deletes attributed feedback through the API. The
-- workspace cascade still removes it when the workspace itself goes.

-- An admin may move the status and nothing else. Without this, the update
-- policy would also let an admin rewrite a colleague's message and leave it
-- attributed to them.
create or replace function public.feedback_status_only()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.author_id is distinct from old.author_id
     or new.kind is distinct from old.kind
     or new.message is distinct from old.message
     or new.route is distinct from old.route
     or new.screen is distinct from old.screen
     or new.created_at is distinct from old.created_at then
    raise exception 'Feedback records what a member wrote: only its status may change.';
  end if;
  new.status_changed_at = now();
  new.status_changed_by = auth.uid();
  return new;
end; $$;

create trigger feedback_status_only before update on public.feedback
  for each row execute function public.feedback_status_only();

-- The portal's only query: one workspace, newest first.
create index on public.feedback (workspace_id, created_at desc);
