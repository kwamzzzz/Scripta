-- A research discussion is usable on research that is not filed to a matter.
--
-- thread_context answered "may not comment" for anything whose comments do not
-- resolve to a matter. Research that is not filed to a matter is exactly that,
-- so its Discussion hid the composer and told the author they were "following
-- this matter rather than working on it", although the comments policy already
-- lets whoever can write the research post there (COALESCE(can_write_research,
-- author)). The context now says the same thing as the policy for research:
-- members of the research may read, and those who may write it may comment.
--
-- Other kinds that do not resolve to a matter (client-held tasks, flows and
-- documents) keep today's answer until the client-level visibility change.

create or replace function public.thread_context(_kind text, _id uuid)
 returns table(matter_id uuid, owner_id uuid, my_role text, may_comment boolean)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  target uuid := public.comment_matter(_kind, _id);
begin
  if target is null then
    if _kind = 'research' then
      if not coalesce(public.is_research_member(_id), false) then
        return;
      end if;
      return query select null::uuid,
                          public.entity_owner(_kind, _id),
                          null::text,
                          coalesce(public.can_write_research(_id), false);
      return;
    end if;
    return query select null::uuid, null::uuid, null::text, false;
    return;
  end if;
  if not public.is_matter_member(target) then
    return;
  end if;
  return query
    select target,
           public.entity_owner(_kind, _id),
           (select mm.role::text from public.matter_members mm
             where mm.matter_id = target and mm.user_id = auth.uid()),
           public.can_review_matter(target);
end;
$function$;
