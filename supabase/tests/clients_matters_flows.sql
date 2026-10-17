-- Clients, and work organised after it has begun.
--
-- What this proves, against the live database, as two real people:
--
--   A  a client is firm business; what is filed under it is not
--   B  a flow with no matter is its author's, and nobody else's, by every route
--   C  filing a flow into a matter keeps its id and everything in it, and from
--      then on the matter team governs it — including the author
--   D  one path to a client: the database refuses or clears the second answer
--   E  a standalone flow's files follow the flow into the matter
--   F  moving a matter to another workspace leaves its client behind
--
-- Kwame (Owner of the firm) makes everything. Podrick (Lawyer in the firm, on
-- no matter this suite creates) tries to reach it.
--
-- Runs as real users and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('ws','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),
 ('personal','f3c5215d-ba97-43fc-8c43-0b5278675194'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');

set local role authenticated;

-- ===========================================================================
-- Kwame builds the fixture through the policies, as the app would
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  c uuid; c2 uuid; m1 uuid; m2 uuid; m3 uuid;
  f1 uuid; f2 uuid; f3 uuid; f4 uuid;
  p1 uuid; d1 uuid; t1 uuid; t2 uuid; t3 uuid; e1 uuid;
begin
  insert into public.clients (workspace_id, name) values (ws, 'ZZ Suite Client') returning id into c;
  insert into public.clients (workspace_id, name) values (ws, 'ZZ Other Client') returning id into c2;
  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary)
    values (ws, auth.uid(), 'Kwame', 'client.created', 'client', c, 'Client created');

  -- Ids chosen up front, as the app does: a matter cannot be read back in the
  -- statement that makes it, because its Lead is seeded after the row exists.
  m1 := gen_random_uuid(); m2 := gen_random_uuid(); m3 := gen_random_uuid();
  -- The matter concerns one of the client's entities (client organisation workspace).
  insert into public.org_entities (workspace_id, client_id, name) values (ws, c, 'ZZ Suite Entity') returning id into e1;
  insert into public.matters (id, workspace_id, name, client_id, owner_id, client_entity_id)
    values (m1, ws, 'ZZ Client matter', c, auth.uid(), e1);
  insert into public.matters (id, workspace_id, name, owner_id)
    values (m2, ws, 'ZZ Standalone matter', auth.uid());
  insert into public.matters (id, workspace_id, name, client_id, owner_id)
    values (m3, ws, 'ZZ Other client matter', c2, auth.uid());

  -- A standalone flow with something in every table.
  insert into public.matter_flows (workspace_id, name) values (ws, 'ZZ Standalone flow') returning id into f1;
  insert into public.flow_phases (workspace_id, flow_id, name) values (ws, f1, 'Phase one') returning id into p1;
  insert into public.flow_deliverables (workspace_id, flow_id, phase_id, name) values (ws, f1, p1, 'Deliverable one') returning id into d1;
  insert into public.flow_versions (workspace_id, deliverable_id, label) values (ws, d1, 'v1');
  insert into public.flow_evidence (workspace_id, deliverable_id, name) values (ws, d1, 'Evidence');
  insert into public.flow_threads (workspace_id, deliverable_id, author, body) values (ws, d1, 'Them', 'A reply');
  insert into public.flow_emails (workspace_id, deliverable_id, subject) values (ws, d1, 'Draft');
  insert into public.comments (workspace_id, entity_kind, entity_id, author_id, body)
    values (ws, 'flow_phase', p1, auth.uid(), 'Private note on the phase');

  insert into public.matter_flows (workspace_id, name, client_id) values (ws, 'ZZ Client flow', c) returning id into f2;
  insert into public.matter_flows (workspace_id, name, client_id) values (ws, 'ZZ Clashing flow', c) returning id into f3;
  insert into public.matter_flows (workspace_id, name) values (ws, 'ZZ Flow with files') returning id into f4;

  insert into public.tasks (workspace_id, title, client_id) values (ws, 'ZZ Client task', c) returning id into t1;
  insert into public.tasks (workspace_id, title, flow_deliverable_id) values (ws, 'ZZ Flow task', d1) returning id into t2;
  insert into public.tasks (workspace_id, title) values (ws, 'ZZ Standalone task') returning id into t3;

  insert into fx values ('c',c::text),('c2',c2::text),('m1',m1::text),('m2',m2::text),('m3',m3::text),
    ('f1',f1::text),('f2',f2::text),('f3',f3::text),('f4',f4::text),('p1',p1::text),('d1',d1::text),
    ('t1',t1::text),('t2',t2::text),('t3',t3::text);

  insert into r select 'A01 a matter filed under a client carries its name',
    (select client from public.matters where id = m1), 'ZZ Suite Client';
  insert into r select 'B01 the author reads her standalone flow',
    (select count(*)::text from public.matter_flows where id in (f1, f2, f3, f4)), '4';
  insert into r select 'B02 and everything in it',
    (select (select count(*) from public.flow_phases where flow_id = f1)
          + (select count(*) from public.flow_deliverables where flow_id = f1)
          + (select count(*) from public.flow_versions where deliverable_id = d1)
          + (select count(*) from public.flow_evidence where deliverable_id = d1)
          + (select count(*) from public.flow_threads where deliverable_id = d1)
          + (select count(*) from public.flow_emails where deliverable_id = d1))::text, '6';
  insert into r select 'B03 a task raised from an unfiled flow is unfiled',
    (select coalesce(matter_id::text, 'none') from public.tasks where id = t2), 'none';
  insert into r select 'E01 the author may open a standalone flow''s files',
    public.can_read_storage_path(ws || '/flows/' || f4 || '/x.pdf')::text, 'true';
  insert into r select 'E02 and write them',
    public.can_write_storage_path(ws || '/flows/' || f4 || '/x.pdf')::text, 'true';
end
$t$;

-- ===========================================================================
-- Podrick, a firm lawyer on none of it
-- ===========================================================================
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  c uuid := (select v::uuid from fx where k='c');
  m1 uuid := (select v::uuid from fx where k='m1');
  m2 uuid := (select v::uuid from fx where k='m2');
  f1 uuid := (select v::uuid from fx where k='f1');
  f2 uuid := (select v::uuid from fx where k='f2');
  f4 uuid := (select v::uuid from fx where k='f4');
  p1 uuid := (select v::uuid from fx where k='p1');
  d1 uuid := (select v::uuid from fx where k='d1');
  mine uuid; n integer;
begin
  insert into r select 'A02 the client record is firm business',
    (select count(*)::text from public.clients where id = c), '1';
  insert into r select 'A03 its matters are not',
    (select count(*)::text from public.matters where client_id = c), '0';
  insert into r select 'A04 nor its flows',
    (select count(*)::text from public.matter_flows where client_id = c), '0';
  insert into r select 'A05 nor its tasks',
    (select count(*)::text from public.tasks where client_id = c), '0';
  insert into r select 'A06 nor the activity of its matters',
    (select count(*)::text from public.audit_events where matter_id in (m1, m2)), '0';
  insert into r select 'A07 the client''s own activity is firm business',
    -- Only the creation event: recording an entity writes organisation history against the client too.
    (select count(*)::text from public.audit_events where entity_type = 'client' and entity_id = c and event_type = 'client.created'), '1';
  delete from public.clients where id = c;
  get diagnostics n = row_count;
  insert into r select 'A08 nobody but its creator deletes a client', n::text, '0';

  insert into r select 'B04 a standalone flow is invisible by id',
    (select count(*)::text from public.matter_flows where id in (f1, f2, f4)), '0';
  insert into r select 'B05 every standalone flow is invisible',
    (select count(*)::text from public.matter_flows where matter_id is null and name like 'ZZ %'), '0';
  insert into r select 'B06 its phases, deliverables and leaves are invisible',
    (select (select count(*) from public.flow_phases where flow_id = f1)
          + (select count(*) from public.flow_deliverables where flow_id = f1)
          + (select count(*) from public.flow_versions where deliverable_id = d1)
          + (select count(*) from public.flow_evidence where deliverable_id = d1)
          + (select count(*) from public.flow_threads where deliverable_id = d1)
          + (select count(*) from public.flow_emails where deliverable_id = d1))::text, '0';
  insert into r select 'B07 the discussion on its phase is invisible',
    (select count(*)::text from public.comments where entity_id = p1), '0';
  insert into r select 'B08 the flow task is invisible',
    (select count(*)::text from public.tasks where flow_deliverable_id = d1), '0';
  insert into r select 'B09 the predicates agree',
    (public.is_flow_member(f1) or public.can_write_flow(f1)
      or public.is_deliverable_member(d1) or public.can_write_deliverable(d1))::text, 'false';

  update public.matter_flows set name = 'taken' where id = f1;
  get diagnostics n = row_count;
  insert into r select 'B10 cannot rename it', n::text, '0';
  update public.matter_flows set matter_id = m2 where id = f4;
  get diagnostics n = row_count;
  insert into r select 'B11 cannot file it anywhere', n::text, '0';
  delete from public.matter_flows where id = f4;
  get diagnostics n = row_count;
  insert into r select 'B12 cannot delete it', n::text, '0';
  begin
    insert into public.flow_phases (workspace_id, flow_id, name) values (ws, f1, 'Planted');
    insert into r select 'B13 cannot add a phase to it', 'allowed', 'refused';
  exception when others then
    insert into r select 'B13 cannot add a phase to it', 'refused', 'refused';
  end;
  begin
    insert into public.flow_versions (workspace_id, deliverable_id, label) values (ws, d1, 'planted');
    insert into r select 'B14 cannot attach a version to it', 'allowed', 'refused';
  exception when others then
    insert into r select 'B14 cannot attach a version to it', 'refused', 'refused';
  end;
  insert into r select 'E03 cannot open its files',
    public.can_read_storage_path(ws || '/flows/' || f4 || '/x.pdf')::text, 'false';
  insert into r select 'E04 cannot write its files',
    public.can_write_storage_path(ws || '/flows/' || f4 || '/x.pdf')::text, 'false';
  insert into r select 'E05 a flow path under another workspace is refused',
    public.can_read_storage_path((select v from fx where k='personal') || '/flows/' || f4 || '/x.pdf')::text, 'false';

  begin
    insert into public.matter_flows (workspace_id, name, created_by)
      values (ws, 'Forged', (select v::uuid from fx where k='me'));
    insert into r select 'B15 cannot make a flow in somebody else''s name', 'allowed', 'refused';
  exception when others then
    insert into r select 'B15 cannot make a flow in somebody else''s name', 'refused', 'refused';
  end;
  begin
    insert into public.matter_flows (workspace_id, name, matter_id) values (ws, 'Planted', m1);
    insert into r select 'B16 cannot put a flow on a matter he is not on', 'allowed', 'refused';
  exception when others then
    insert into r select 'B16 cannot put a flow on a matter he is not on', 'refused', 'refused';
  end;

  -- His own standalone flow works exactly as hers does.
  insert into public.matter_flows (workspace_id, name) values (ws, 'ZZ Podrick flow') returning id into mine;
  insert into fx values ('pf', mine::text);
  insert into r select 'B17 his own standalone flow is his',
    (select count(*)::text from public.matter_flows where id = mine), '1';
  begin
    update public.matter_flows set matter_id = m1 where id = mine;
    insert into r select 'B18 cannot file his flow into a matter he is not on', 'allowed', 'refused';
  exception when others then
    insert into r select 'B18 cannot file his flow into a matter he is not on',
      case when sqlerrm = 'That matter is unavailable.' then 'refused' else sqlerrm end, 'refused';
  end;
end
$t$;

-- ===========================================================================
-- Kwame organises the work
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare
  c uuid := (select v::uuid from fx where k='c');
  c2 uuid := (select v::uuid from fx where k='c2');
  m1 uuid := (select v::uuid from fx where k='m1');
  m2 uuid := (select v::uuid from fx where k='m2');
  m3 uuid := (select v::uuid from fx where k='m3');
  f1 uuid := (select v::uuid from fx where k='f1');
  f2 uuid := (select v::uuid from fx where k='f2');
  f3 uuid := (select v::uuid from fx where k='f3');
  d1 uuid := (select v::uuid from fx where k='d1');
  t1 uuid := (select v::uuid from fx where k='t1');
  t2 uuid := (select v::uuid from fx where k='t2');
begin
  insert into r select 'B19 she cannot see his flow',
    (select count(*)::text from public.matter_flows where id = (select v::uuid from fx where k='pf')), '0';

  -- Standalone flow into a standalone matter.
  update public.matter_flows set matter_id = m2 where id = f1;
  insert into r select 'C01 filing keeps the flow''s id',
    (select count(*)::text from public.matter_flows where id = f1 and matter_id = m2), '1';
  insert into r select 'C02 and everything in it',
    (select (select count(*) from public.flow_phases where flow_id = f1)
          + (select count(*) from public.flow_deliverables where flow_id = f1)
          + (select count(*) from public.flow_versions where deliverable_id = d1)
          + (select count(*) from public.flow_evidence where deliverable_id = d1)
          + (select count(*) from public.flow_threads where deliverable_id = d1)
          + (select count(*) from public.flow_emails where deliverable_id = d1))::text, '6';
  insert into r select 'C03 its task followed it into the matter',
    (select matter_id::text from public.tasks where id = t2), m2::text;
  insert into r select 'C04 and the filing is on the record',
    (select count(*)::text from public.audit_events where matter_id = m2 and event_type = 'flow.filed' and entity_id = f1), '1';
  begin
    update public.matter_flows set matter_id = null where id = f1;
    insert into r select 'C05 a filed flow cannot be unfiled', 'allowed', 'refused';
  exception when others then
    insert into r select 'C05 a filed flow cannot be unfiled', 'refused', 'refused';
  end;
  begin
    update public.matter_flows set matter_id = m1 where id = f1;
    insert into r select 'C06 nor moved to another matter', 'allowed', 'refused';
  exception when others then
    insert into r select 'C06 nor moved to another matter', 'refused', 'refused';
  end;

  -- A client flow into a matter with no client: the matter takes the client.
  update public.matter_flows set matter_id = m2 where id = f2;
  insert into r select 'D01 a matter with no client takes the flow''s',
    (select client_id::text from public.matters where id = m2), c::text;
  insert into r select 'D02 and the flow stops holding its own',
    (select coalesce(client_id::text, 'none') from public.matter_flows where id = f2), 'none';
  insert into r select 'C07 a matter may hold more than one flow',
    (select count(*)::text from public.matter_flows where matter_id = m2), '2';

  -- A client flow into a matter filed under somebody else.
  begin
    update public.matter_flows set matter_id = m3 where id = f3;
    insert into r select 'D03 a flow cannot be filed across clients', 'allowed', 'refused';
  exception when others then
    insert into r select 'D03 a flow cannot be filed across clients', 'refused', 'refused';
  end;
  insert into r select 'D04 and the refusal changed nothing',
    (select coalesce(matter_id::text, 'none') || '/' || client_id::text from public.matter_flows where id = f3), 'none/' || c::text;

  -- A client task filed to a matter drops its own client.
  update public.tasks set matter_id = m1 where id = t1;
  insert into r select 'D05 a task filed to a matter reaches its client through it',
    (select coalesce(client_id::text, 'none') from public.tasks where id = t1), 'none';
  update public.tasks set matter_id = m1, flow_deliverable_id = d1 where id = t2;
  insert into r select 'D07 a task with a deliverable is filed where the deliverable is',
    (select matter_id::text from public.tasks where id = t2), m2::text;
  begin
    insert into public.matter_flows (workspace_id, name, matter_id, client_id)
      values ((select v::uuid from fx where k='ws'), 'ZZ Both', m1, c);
    insert into r select 'D08 a flow on a matter never stores a client too',
      (select coalesce(client_id::text,'none') from public.matter_flows where name = 'ZZ Both'), 'none';
  exception when others then
    insert into r select 'D08 a flow on a matter never stores a client too', sqlerrm, 'none';
  end;

  -- Renaming the client reaches the matters filed under it.
  update public.clients set name = 'ZZ Suite Client Ltd' where id = c;
  insert into r select 'A09 a renamed client renames its matters'' client line',
    (select string_agg(distinct client, ',') from public.matters where client_id = c), 'ZZ Suite Client Ltd';

  -- Podrick joins the matter the flow was filed into.
  perform public.add_matter_member(m2, (select v::uuid from fx where k='them'), 'editor');
end
$t$;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare
  c uuid := (select v::uuid from fx where k='c');
  m2 uuid := (select v::uuid from fx where k='m2');
  f1 uuid := (select v::uuid from fx where k='f1');
  f3 uuid := (select v::uuid from fx where k='f3');
  f4 uuid := (select v::uuid from fx where k='f4');
  d1 uuid := (select v::uuid from fx where k='d1');
  p1 uuid := (select v::uuid from fx where k='p1');
  n integer;
begin
  insert into r select 'C08 once filed, the matter team reads the flow',
    (select count(*)::text from public.matter_flows where id = f1), '1';
  insert into r select 'C09 and all of its work',
    (select (select count(*) from public.flow_phases where flow_id = f1)
          + (select count(*) from public.flow_deliverables where flow_id = f1)
          + (select count(*) from public.flow_versions where deliverable_id = d1)
          + (select count(*) from public.flow_evidence where deliverable_id = d1)
          + (select count(*) from public.flow_threads where deliverable_id = d1)
          + (select count(*) from public.flow_emails where deliverable_id = d1))::text, '6';
  insert into r select 'C10 including its task',
    (select count(*)::text from public.tasks where flow_deliverable_id = d1), '1';
  insert into r select 'C11 and the discussion that was private while unfiled',
    (select count(*)::text from public.comments where entity_id = p1), '1';
  update public.matter_flows set phases_title = 'Workstreams' where id = f1;
  get diagnostics n = row_count;
  insert into r select 'C12 an editor on the matter writes it, though he did not make it', n::text, '1';
  -- His own standalone flow, filed into a matter he is on.
  update public.matter_flows set matter_id = m2 where id = (select v::uuid from fx where k='pf');
  insert into r select 'C14 he may file his own flow into a matter he writes',
    (select count(*)::text from public.matter_flows where id = (select v::uuid from fx where k='pf') and matter_id = m2), '1';
  insert into r select 'A10 the client page counts what he can open, and only that',
    (select count(*)::text from public.matters where client_id = c), '1';
  insert into r select 'A11 his client flows are the filed ones he can open (hers, hers, and his own)',
    (select count(*)::text from public.matter_flows f
      where f.client_id = c or f.matter_id in (select id from public.matters where client_id = c)), '3';
  insert into r select 'B20 her other standalone flows are still hers',
    (select count(*)::text from public.matter_flows where id in (f3, f4)), '0';
  insert into r select 'E06 files at the flow path now answer to the matter',
    public.can_read_storage_path((select v from fx where k='ws') || '/flows/' || f1 || '/x.pdf')::text, 'true';
end
$t$;

-- Kwame takes Podrick off the matter. He made the flow he filed into it; once
-- filed, authorship stops counting, exactly as for a task.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.remove_matter_member((select v::uuid from fx where k='m2'), (select v::uuid from fx where k='them'));
do $t$
declare
  m1 uuid := (select v::uuid from fx where k='m1');
  personal uuid := (select v::uuid from fx where k='personal');
begin
  insert into r select 'C15 the matter Lead holds the flow Podrick filed',
    (select count(*)::text from public.matter_flows where id = (select v::uuid from fx where k='pf')), '1';
  -- F. Moving a client matter to another workspace leaves the client behind.
  perform public.move_matter_to_workspace(m1, personal);
  insert into r select 'F01 a moved matter leaves its client in the firm',
    (select coalesce(client_id::text, 'none') || ' / ' || client from public.matters where id = m1),
    'none / ZZ Suite Client Ltd';
  insert into r select 'F02 and the client entity it concerned',
    (select coalesce(client_entity_id::text, 'none') from public.matters where id = m1), 'none';
end
$t$;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'C13 authorship is not a key once filed: off the matter, his flow is gone',
  (select count(*)::text from public.matter_flows where id = (select v::uuid from fx where k='pf')), '0';

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
