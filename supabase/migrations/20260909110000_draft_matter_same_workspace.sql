-- A draft and the matter it is filed against must be in the same workspace.
--
-- `drafts` carried a workspace_id and, separately, a matter_id pointing at any
-- matter at all. RLS authorises each row independently, so a lawyer who is a
-- member of two workspaces could — through a crafted call — file a draft in one
-- against a matter in the other. Membership of both is not permission to mix
-- them.
--
-- Codex found the better answer while building the letterheads: say it in the
-- schema with a composite foreign key, rather than in a predicate that every
-- future server function has to remember. The database refuses it now, whatever
-- the caller asks for.
alter table public.matters add constraint matters_workspace_id_id_key unique (workspace_id, id);

alter table public.drafts drop constraint drafts_matter_id_fkey;
alter table public.drafts add constraint drafts_matter_workspace_fkey
  foreign key (workspace_id, matter_id) references public.matters(workspace_id, id)
  on delete set null;
