-- Feedback that says exactly where, and shows it.
--
-- `target` is the thing the sender pointed at on the screen: its readable name
-- ("Button ‘Add source’ in Library"), a selector to find it again, and where
-- it sat on their screen. `context` is what was open and how it was seen:
-- the client, matter or record, screen and window size, browser, Scripta's
-- version, the screens visited just before, and any errors the app hit.
-- `screenshot` is the screen as the sender saw it with the target marked, a
-- compressed image the sender may leave out; it is kept on the row so the
-- row's own policies (author and reviewers only) govern who sees it.
--
-- A reviewer can now answer: `reply` is shown to the sender under their own
-- feedback. What the sender wrote and the evidence captured with it still
-- cannot be changed by anyone.

alter table public.feedback
  add column target jsonb,
  add column context jsonb not null default '{}'::jsonb,
  add column screenshot text check (screenshot is null or length(screenshot) <= 1500000),
  add column reply text check (reply is null or length(btrim(reply)) between 1 and 2000),
  add column replied_at timestamptz,
  add column replied_by uuid references public.profiles(id) on delete set null;

create or replace function public.feedback_status_only()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.author_id is distinct from old.author_id
     or new.kind is distinct from old.kind
     or new.message is distinct from old.message
     or new.route is distinct from old.route
     or new.screen is distinct from old.screen
     or new.target is distinct from old.target
     or new.context is distinct from old.context
     or new.screenshot is distinct from old.screenshot
     or new.created_at is distinct from old.created_at then
    raise exception 'Feedback records what a member wrote and saw: only its status and reply may change.';
  end if;
  if new.status is distinct from old.status then
    new.status_changed_at = now();
    new.status_changed_by = auth.uid();
  else
    new.status_changed_at = old.status_changed_at;
    new.status_changed_by = old.status_changed_by;
  end if;
  if new.reply is distinct from old.reply then
    new.replied_at = case when new.reply is null then null else now() end;
    new.replied_by = case when new.reply is null then null else auth.uid() end;
  else
    new.replied_at = old.replied_at;
    new.replied_by = old.replied_by;
  end if;
  return new;
end; $$;
