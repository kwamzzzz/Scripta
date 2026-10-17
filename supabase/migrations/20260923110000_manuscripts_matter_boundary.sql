-- Manuscripts filed to a matter sit inside the matter's boundary.
--
-- The first manuscripts migration made every manuscript that was not private
-- readable by the whole workspace. That is right for a thesis filed to nobody,
-- or to a client (the client register is the firm's), but it is wrong for one
-- filed to a matter: a matter is read by its team alone, and a document filed
-- to it must not be readable by a colleague who cannot open the matter. Flows
-- already work this way (`matter_flows`); manuscripts now do the same.
--
--   filed to a matter   read by the matter's members; written by those who
--                       may write to the matter
--   not filed to one    read by the workspace; written by its writers
--   private             the author alone, whichever of the above applies
--
-- Filing to a matter needs write access to that matter, so nobody can file a
-- document into a matter they could not otherwise put anything in.
--
-- The stored file follows the same line: a filed manuscript's file is kept
-- under `<workspace>/<matter>/manuscripts/…`, which the storage policies
-- already check against matter membership.

create or replace function public.can_read_manuscript(_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.manuscripts m
    where m.id = _id
      and (not m.private or m.created_by = auth.uid())
      and case when m.matter_id is not null then public.is_matter_member(m.matter_id)
               else public.is_workspace_member(m.workspace_id) end
  );
$$;

create or replace function public.can_write_manuscript(_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.manuscripts m
    where m.id = _id
      and (not m.private or m.created_by = auth.uid())
      and case when m.matter_id is not null then public.can_write_matter(m.matter_id)
               else public.can_write_workspace(m.workspace_id) end
  );
$$;

drop policy if exists "read manuscripts" on public.manuscripts;
create policy "read manuscripts"
  on public.manuscripts for select
  using (
    (not private or created_by = auth.uid())
    and case when matter_id is not null then public.is_matter_member(matter_id)
             else public.is_workspace_member(workspace_id) end
  );

drop policy if exists "create manuscripts" on public.manuscripts;
create policy "create manuscripts"
  on public.manuscripts for insert
  with check (
    created_by = auth.uid()
    and public.can_write_workspace(workspace_id)
    and (matter_id is null or public.can_write_matter(matter_id))
  );

drop policy if exists "amend manuscripts" on public.manuscripts;
create policy "amend manuscripts"
  on public.manuscripts for update
  using (
    (not private or created_by = auth.uid())
    and case when matter_id is not null then public.can_write_matter(matter_id)
             else public.can_write_workspace(workspace_id) end
  )
  with check (
    (not private or created_by = auth.uid())
    and public.can_write_workspace(workspace_id)
    and (matter_id is null or public.can_write_matter(matter_id))
  );
