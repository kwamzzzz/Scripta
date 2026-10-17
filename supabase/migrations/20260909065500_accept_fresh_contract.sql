-- Accept a fully drafted contract in one transaction.
--
-- The AI drafting call is read-only. This is the deliberate lawyer action that
-- first creates product rows, and PostgreSQL owns the transaction so a failed
-- segment insert cannot leave half a contract behind.

create or replace function public.accept_fresh_contract(
  _workspace_id uuid,
  _matter_id uuid,
  _matter_name text,
  _agreement_type text,
  _governing_law text,
  _clauses jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_matter_id uuid;
  v_document_id uuid;
  v_clause_id uuid;
  v_clause jsonb;
  v_ordinal integer := 0;
  v_title text;
  v_num text;
  v_text text;
begin
  if not public.can_write_workspace(_workspace_id) then
    raise exception 'This workspace is unavailable or read-only.';
  end if;
  if jsonb_typeof(_clauses) is distinct from 'array' or jsonb_array_length(_clauses) = 0 then
    raise exception 'A completed draft needs at least one clause.';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(_clauses) item
     where btrim(coalesce(item->>'num', '')) = ''
        or btrim(coalesce(item->>'title', '')) = ''
        or btrim(coalesce(item->>'text', '')) = ''
  ) then
    raise exception 'Every accepted clause needs a number, title and wording.';
  end if;
  if (
    select count(*) from jsonb_array_elements(_clauses)
  ) <> (
    select count(distinct btrim(item->>'num')) from jsonb_array_elements(_clauses) item
  ) then
    raise exception 'Accepted clause numbers must be unique.';
  end if;

  if _matter_id is null then
    insert into public.matters (
      workspace_id,
      name,
      stage,
      governing_law,
      front_matter,
      created_by
    )
    values (
      _workspace_id,
      coalesce(nullif(btrim(_matter_name), ''), 'Untitled contract'),
      'Drafting',
      nullif(btrim(_governing_law), ''),
      jsonb_build_object('agreementType', btrim(_agreement_type)),
      auth.uid()
    )
    returning id into v_matter_id;
  else
    select id into v_matter_id
      from public.matters
     where id = _matter_id and workspace_id = _workspace_id
     for update;
    if v_matter_id is null then
      raise exception 'This matter is unavailable in the current workspace.';
    end if;
    if exists (select 1 from public.clauses where matter_id = v_matter_id) then
      raise exception 'This matter already has clauses. Open it instead of replacing its contract.';
    end if;
    update public.matters
       set governing_law = coalesce(nullif(governing_law, ''), nullif(btrim(_governing_law), '')),
           front_matter = coalesce(front_matter, '{}'::jsonb)
             || jsonb_build_object('agreementType', btrim(_agreement_type)),
           stage = coalesce(nullif(stage, ''), 'Drafting')
     where id = v_matter_id;
  end if;

  insert into public.documents (
    matter_id,
    name,
    kind,
    version_label,
    doc_date,
    uploaded_by,
    parse_status
  ) values (
    v_matter_id,
    coalesce(nullif(btrim(_matter_name), ''), 'Untitled contract'),
    'contract',
    'Draft v1',
    current_date,
    auth.uid(),
    'parsed'
  ) returning id into v_document_id;

  for v_clause in select value from jsonb_array_elements(_clauses)
  loop
    v_ordinal := v_ordinal + 1;
    v_num := btrim(v_clause->>'num');
    v_title := btrim(v_clause->>'title');
    v_text := btrim(v_clause->>'text');

    insert into public.clauses (
      matter_id,
      source_document_id,
      num,
      title,
      status,
      analysis_source,
      ordinal
    ) values (
      v_matter_id,
      v_document_id,
      v_num,
      v_title,
      'Open',
      'ai',
      v_ordinal
    ) returning id into v_clause_id;

    insert into public.clause_segments (clause_id, ordinal, text, kind)
    values (v_clause_id, 1, v_text, 'n');
  end loop;

  insert into public.audit_events (
    matter_id,
    actor_id,
    event_type,
    entity_type,
    entity_id,
    summary,
    metadata
  ) values (
    v_matter_id,
    auth.uid(),
    'contract.accepted',
    'document',
    v_document_id,
    'Fresh contract accepted from the drafting workspace',
    jsonb_build_object('clauses', v_ordinal, 'agreement_type', _agreement_type)
  );

  return jsonb_build_object(
    'matterId', v_matter_id,
    'documentId', v_document_id,
    'clauseCount', v_ordinal
  );
end;
$$;

revoke all on function public.accept_fresh_contract(uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.accept_fresh_contract(uuid, uuid, text, text, text, jsonb) to authenticated;
