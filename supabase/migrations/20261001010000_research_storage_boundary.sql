-- Research files answer to their research, not to the whole workspace.
--
-- Research documents are uploaded to `<workspace>/research/<research id>/...`.
-- The storage helpers had no branch for that second segment, so those paths
-- fell through to the final `is_workspace_member` / `can_write_workspace`
-- check: any member of the firm could list, read, overwrite or remove a
-- colleague's research files, although the `research_documents` rows
-- themselves are limited to the research's members. (Audit finding X-5.03.)
--
-- Both helpers gain a `research` branch that asks the research, exactly as the
-- `flows` branch asks the flow: the research must belong to the workspace in
-- the first segment, and the caller must be one of its members (read) or able
-- to write it (write). Everything else is unchanged.

create or replace function public.can_read_storage_path(_name text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare parts text[] := storage.foldername(_name); ws uuid; seg2 text; flow uuid; client uuid; research uuid;
begin
  if array_length(parts,1) is null or array_length(parts,1) < 2 then return false; end if;
  begin ws := parts[1]::uuid; exception when others then return false; end;
  seg2 := parts[2];
  if seg2 ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return public.is_matter_member(seg2::uuid);
  end if;
  if seg2 = 'personal' then
    return array_length(parts,1) >= 3 and parts[3] = auth.uid()::text;
  end if;
  if seg2 = 'flows' then
    if array_length(parts,1) < 3 then return false; end if;
    begin flow := parts[3]::uuid; exception when others then return false; end;
    return exists (select 1 from public.matter_flows f where f.id = flow and f.workspace_id = ws)
       and public.is_flow_member(flow);
  end if;
  if seg2 = 'research' then
    if array_length(parts,1) < 3 then return false; end if;
    begin research := parts[3]::uuid; exception when others then return false; end;
    return exists (select 1 from public.research_matters r where r.id = research and r.workspace_id = ws)
       and coalesce(public.is_research_member(research), false);
  end if;
  if seg2 in ('clients', 'marketing') then
    if array_length(parts,1) < 3 then return false; end if;
    begin client := parts[3]::uuid; exception when others then return false; end;
    if not exists (select 1 from public.clients c where c.id = client and c.workspace_id = ws) then
      return false;
    end if;
    return case when seg2 = 'marketing' then public.can_see_marketing(client)
                else public.is_workspace_member(ws) end;
  end if;
  return public.is_workspace_member(ws);
end;
$function$;

create or replace function public.can_write_storage_path(_name text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare parts text[] := storage.foldername(_name); ws uuid; seg2 text; flow uuid; client uuid; research uuid;
begin
  if array_length(parts,1) is null or array_length(parts,1) < 2 then return false; end if;
  begin ws := parts[1]::uuid; exception when others then return false; end;
  seg2 := parts[2];
  if seg2 ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return public.can_write_matter(seg2::uuid);
  end if;
  if seg2 = 'personal' then
    return array_length(parts,1) >= 3 and parts[3] = auth.uid()::text;
  end if;
  if seg2 = 'flows' then
    if array_length(parts,1) < 3 then return false; end if;
    begin flow := parts[3]::uuid; exception when others then return false; end;
    return exists (select 1 from public.matter_flows f where f.id = flow and f.workspace_id = ws)
       and public.can_write_flow(flow);
  end if;
  if seg2 = 'research' then
    if array_length(parts,1) < 3 then return false; end if;
    begin research := parts[3]::uuid; exception when others then return false; end;
    return exists (select 1 from public.research_matters r where r.id = research and r.workspace_id = ws)
       and coalesce(public.can_write_research(research), false);
  end if;
  if seg2 in ('clients', 'marketing') then
    if array_length(parts,1) < 3 then return false; end if;
    begin client := parts[3]::uuid; exception when others then return false; end;
    if not exists (select 1 from public.clients c where c.id = client and c.workspace_id = ws) then
      return false;
    end if;
    return case when seg2 = 'marketing' then public.can_see_marketing(client)
                else public.can_write_workspace(ws) end;
  end if;
  return public.can_write_workspace(ws);
end;
$function$;
