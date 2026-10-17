-- Client organisation workspace: structure, integrity, history and the
-- confidentiality boundary.
--
-- Two users in the Nexis Africa workspace: Mawusi (owner) and Podrick (lawyer,
-- on no matter). Mawusi's personal workspace stands in for a firm Podrick is not
-- part of. Run inside begin … rollback; nothing persists.
--
-- What must hold:
--   * the organogram and the group structure are separate records, and no
--     reference can cross from one client to another;
--   * roles named by authority cannot be deleted from under it;
--   * every organisational change lands in the client's history;
--   * the organisation is readable by the firm, and seeing it — an entity, a
--     linked document, the history — never exposes a matter the reader is not on.

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

-- ---------------------------------------------------------------- Mawusi
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  personal uuid := (select v::uuid from fx where k='personal');
  c uuid; c2 uuid; cp uuid;
  e1 uuid; e2 uuid; e3 uuid;
  p1 uuid; p2 uuid;
  r1 uuid; r2 uuid; r3 uuid; rx uuid;
  h1 uuid; inst uuid; rule uuid;
  m1 uuid := gen_random_uuid();
  d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid(); d3 uuid := gen_random_uuid();
  lic uuid; ob uuid; t1 uuid;
  n integer;
begin
  insert into public.clients (workspace_id, name) values (ws, 'ZZ Org Group') returning id into c;
  insert into public.clients (workspace_id, name) values (ws, 'ZZ Other Client') returning id into c2;
  insert into public.clients (workspace_id, name) values (personal, 'ZZ Private Client') returning id into cp;

  insert into public.org_entities (workspace_id, client_id, name, jurisdiction) values (ws, c, 'ZZ Holdings LLC', 'UAE') returning id into e1;
  insert into public.org_entities (workspace_id, client_id, name, jurisdiction) values (ws, c, 'ZZ Operating Ltd', 'Ghana') returning id into e2;
  insert into public.org_entities (workspace_id, client_id, name) values (ws, c2, 'ZZ Unrelated Ltd') returning id into e3;
  insert into public.org_people (workspace_id, client_id, full_name) values (ws, c, 'ZZ Ada Owner') returning id into p1;
  insert into public.org_people (workspace_id, client_id, full_name) values (ws, c, 'ZZ Kofi Manager') returning id into p2;

  -- Organogram: roles and reporting lines.
  insert into public.org_roles (workspace_id, client_id, title, kind, holder_person_id) values (ws, c, 'Chief Executive', 'leadership', p1) returning id into r1;
  insert into public.org_roles (workspace_id, client_id, title, kind, parent_role_id, holder_person_id) values (ws, c, 'Country Manager', 'leadership', r1, p2) returning id into r2;
  insert into public.org_roles (workspace_id, client_id, title, parent_role_id) values (ws, c, 'Finance', r2) returning id into r3;
  insert into r select 'A01 a role reports to a role', (select parent_role_id::text from public.org_roles where id = r3), r2::text;

  begin
    insert into public.org_roles (workspace_id, client_id, title, parent_role_id) values (ws, c2, 'Planted', r1);
    insert into r select 'A02 a role cannot report into another client', 'allowed', 'refused';
  exception when others then
    insert into r select 'A02 a role cannot report into another client', 'refused', 'refused';
  end;

  -- Group structure: holdings between entities, a person, and an outsider.
  insert into public.org_holdings (workspace_id, client_id, owner_person_id, subsidiary_entity_id, percent) values (ws, c, p1, e1, 100);
  insert into public.org_holdings (workspace_id, client_id, owner_entity_id, subsidiary_entity_id, percent) values (ws, c, e1, e2, 51) returning id into h1;
  insert into public.org_holdings (workspace_id, client_id, owner_name, subsidiary_entity_id, percent) values (ws, c, 'Minority partner', e2, 49);
  insert into r select 'A03 ownership is stored as edges', (select count(*)::text from public.org_holdings where client_id = c), '3';
  insert into r select 'A04 the organogram and the structure do not share rows',
    (select count(*)::text from public.org_roles where client_id = c and entity_id is not null), '0';

  begin
    insert into public.org_holdings (workspace_id, client_id, owner_entity_id, subsidiary_entity_id, percent) values (ws, c, e1, e3, 10);
    insert into r select 'A05 a holding cannot reach another client''s entity', 'allowed', 'refused';
  exception when others then
    insert into r select 'A05 a holding cannot reach another client''s entity', 'refused', 'refused';
  end;
  begin
    insert into public.org_holdings (workspace_id, client_id, subsidiary_entity_id, percent) values (ws, c, e2, 10);
    insert into r select 'A06 a holding needs exactly one holder', 'allowed', 'refused';
  exception when others then
    insert into r select 'A06 a holding needs exactly one holder', 'refused', 'refused';
  end;
  begin
    insert into public.org_holdings (workspace_id, client_id, owner_entity_id, subsidiary_entity_id) values (ws, c, e2, e2);
    insert into r select 'A07 an entity cannot hold itself', 'allowed', 'refused';
  exception when others then
    insert into r select 'A07 an entity cannot hold itself', 'refused', 'refused';
  end;

  -- Authority names roles; a named role survives its holder and cannot be deleted.
  insert into public.org_authority_instruments (workspace_id, client_id, title, approved_on) values (ws, c, 'ZZ Delegation of Authority v1', '2026-09-02') returning id into inst;
  insert into public.org_authority_rules (workspace_id, client_id, instrument_id, matter_type, min_amount, max_amount, currency)
    values (ws, c, inst, 'Supply contract', null, 250000, 'GHS') returning id into rule;
  insert into public.org_authority_parties (workspace_id, client_id, rule_id, step, role_id) values (ws, c, rule, 'approve', r2);
  insert into public.org_authority_parties (workspace_id, client_id, rule_id, step, capacity, count) values (ws, c, rule, 'sign', 'director', 1);
  begin
    insert into public.org_authority_parties (workspace_id, client_id, rule_id, step, role_id, body) values (ws, c, rule, 'sign', r1, 'board');
    insert into r select 'A08 a party is a role, a capacity or a body, not two', 'allowed', 'refused';
  exception when others then
    insert into r select 'A08 a party is a role, a capacity or a body, not two', 'refused', 'refused';
  end;
  update public.org_roles set holder_person_id = null where id = r2;
  insert into r select 'A09 a leaver leaves the rule standing',
    (select count(*)::text from public.org_authority_parties where rule_id = rule and role_id = r2), '1';
  begin
    delete from public.org_roles where id = r2;
    insert into r select 'A10 a role named by authority cannot be deleted', 'allowed', 'refused';
  exception when others then
    insert into r select 'A10 a role named by authority cannot be deleted', 'refused', 'refused';
  end;

  -- Appointments keep history; a person holding one cannot be deleted.
  insert into public.org_appointments (workspace_id, client_id, person_id, entity_id, capacity, appointed_on, ceased_on)
    values (ws, c, p2, e2, 'director', '2024-01-01', '2025-06-30');
  insert into public.org_appointments (workspace_id, client_id, person_id, entity_id, capacity, appointed_on)
    values (ws, c, p1, e2, 'director', '2025-07-01');
  insert into r select 'A11 appointments keep past directors',
    (select count(*)::text from public.org_appointments where entity_id = e2 and capacity = 'director'), '2';
  begin
    delete from public.org_people where id = p2;
    insert into r select 'A12 a person with a recorded appointment cannot be deleted', 'allowed', 'refused';
  exception when others then
    insert into r select 'A12 a person with a recorded appointment cannot be deleted', 'refused', 'refused';
  end;

  -- History, with the date and reference the writer gave.
  update public.org_roles set parent_role_id = r1, last_change_on = '2026-09-02', last_change_ref = 'BM-2026-07' where id = r3;
  insert into r select 'A13 a change is written to the client''s history',
    (select count(*)::text from public.audit_events
      where entity_type = 'client' and entity_id = c and event_type = 'org.roles.update'
        and metadata->>'record_id' = r3::text and metadata->>'reference' = 'BM-2026-07'
        and metadata->'changed' ? 'parent_role_id' and not (metadata->'changed' ? 'updated_at')), '1';
  update public.org_roles set last_change_ref = 'nothing else' where id = r3;
  insert into r select 'A14 a write that changes nothing writes no history',
    (select count(*)::text from public.audit_events where entity_id = c and event_type = 'org.roles.update'
       and metadata->>'record_id' = r3::text), '1';

  -- A matter may concern an entity of its own client, and only that.
  insert into public.matters (id, workspace_id, name, client_id, owner_id, client_entity_id)
    values (m1, ws, 'ZZ Confidential supply matter', c, auth.uid(), e2);
  insert into r select 'A15 a matter records the entity it concerns',
    (select client_entity_id::text from public.matters where id = m1), e2::text;
  begin
    update public.matters set client_entity_id = e3 where id = m1;
    insert into r select 'A16 a matter cannot name another client''s entity', 'allowed', 'refused';
  exception when others then
    insert into r select 'A16 a matter cannot name another client''s entity', 'refused', 'refused';
  end;

  -- Documents: the client's own, and one filed on the confidential matter.
  insert into public.documents (id, workspace_id, client_id, name, kind, org_category, storage_path)
    values (d1, ws, c, 'ZZ Certificate of incorporation', 'reference', 'certificate', ws::text || '/clients/' || c::text || '/cert.pdf');
  insert into public.documents (id, matter_id, name, kind) values (d2, m1, 'ZZ Confidential supply agreement', 'contract');
  begin
    insert into public.documents (id, name, kind) values (gen_random_uuid(), 'ZZ Homeless', 'reference');
    insert into r select 'A17 a document needs a home', 'allowed', 'refused';
  exception when others then
    insert into r select 'A17 a document needs a home', 'refused', 'refused';
  end;
  begin
    insert into public.documents (id, matter_id, workspace_id, client_id, name, kind) values (gen_random_uuid(), m1, ws, c, 'ZZ Two homes', 'reference');
    insert into r select 'A18 a document has one home, not two', 'allowed', 'refused';
  exception when others then
    insert into r select 'A18 a document has one home, not two', 'refused', 'refused';
  end;
  begin
    update public.documents set client_id = null, workspace_id = null, matter_id = m1 where id = d1;
    insert into r select 'A19 a client document cannot be moved onto a matter', 'allowed', 'refused';
  exception when others then
    insert into r select 'A19 a client document cannot be moved onto a matter', 'refused', 'refused';
  end;

  insert into public.org_record_documents (workspace_id, client_id, document_id, record_type, record_id, page) values (ws, c, d1, 'entity', e1, 1);
  insert into public.org_record_documents (workspace_id, client_id, document_id, record_type, record_id) values (ws, c, d2, 'entity', e2);
  insert into public.documents (id, workspace_id, client_id, name, kind) values (d3, ws, c2, 'ZZ Other client paper', 'reference');
  begin
    insert into public.org_record_documents (workspace_id, client_id, document_id, record_type, record_id) values (ws, c, d3, 'entity', e1);
    insert into r select 'A20 a record cannot cite another client''s document', 'allowed', 'refused';
  exception when others then
    insert into r select 'A20 a record cannot cite another client''s document', 'refused', 'refused';
  end;
  begin
    insert into public.org_record_documents (workspace_id, client_id, document_id, record_type, record_id) values (ws, c, d1, 'entity', e3);
    insert into r select 'A21 a document cannot evidence another client''s record', 'allowed', 'refused';
  exception when others then
    insert into r select 'A21 a document cannot evidence another client''s record', 'refused', 'refused';
  end;

  -- Licences and obligations; an occurrence becomes an ordinary task.
  insert into public.org_licences (workspace_id, client_id, entity_id, name, expires_on, renewal_lead_days)
    values (ws, c, e2, 'ZZ Export licence', '2026-10-17', 60) returning id into lic;
  insert into public.org_obligations (workspace_id, client_id, entity_id, title, recurrence, due_on)
    values (ws, c, e2, 'ZZ VAT return', 'monthly', '2026-01-15') returning id into ob;
  insert into public.org_obligation_occurrences (workspace_id, client_id, obligation_id, due_on, state, completed_on)
    values (ws, c, ob, '2026-08-15', 'done', '2026-08-14');
  begin
    insert into public.org_obligation_occurrences (workspace_id, client_id, obligation_id, due_on) values (ws, c, ob, '2026-08-15');
    insert into r select 'A22 an occurrence is recorded once', 'allowed', 'refused';
  exception when others then
    insert into r select 'A22 an occurrence is recorded once', 'refused', 'refused';
  end;
  insert into public.tasks (workspace_id, title, client_id, origin_kind, origin_id, due_date)
    values (ws, 'ZZ File VAT return', c, 'org_obligation', ob, '2026-09-15') returning id into t1;
  insert into r select 'A23 the obligation''s task is ordinary work filed to the client',
    (select client_id::text from public.tasks where id = t1), c::text;
  insert into r select 'A24 Scripta''s licence types are there to choose from',
    (select (count(*) >= 9)::text from public.org_licence_types where workspace_id is null), 'true';

  -- A client in a firm Podrick is not part of.
  insert into public.org_entities (workspace_id, client_id, name) values (personal, cp, 'ZZ Private Holdings');

  insert into fx values ('c',c::text),('c2',c2::text),('cp',cp::text),('e1',e1::text),('e2',e2::text),
    ('r1',r1::text),('r2',r2::text),('m1',m1::text),('d1',d1::text),('d2',d2::text),('lic',lic::text),
    ('ob',ob::text),('t1',t1::text),('p1',p1::text);
end
$t$;

-- ---------------------------------------------------------------- Podrick
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  personal uuid := (select v::uuid from fx where k='personal');
  c uuid := (select v::uuid from fx where k='c');
  cp uuid := (select v::uuid from fx where k='cp');
  e2 uuid := (select v::uuid from fx where k='e2');
  r1 uuid := (select v::uuid from fx where k='r1');
  m1 uuid := (select v::uuid from fx where k='m1');
  d1 uuid := (select v::uuid from fx where k='d1');
  d2 uuid := (select v::uuid from fx where k='d2');
  t1 uuid := (select v::uuid from fx where k='t1');
  n integer;
begin
  insert into r select 'B01 the firm reads the client''s entities', (select count(*)::text from public.org_entities where client_id = c), '2';
  insert into r select 'B02 the firm reads the organogram', (select count(*)::text from public.org_roles where client_id = c), '3';
  insert into r select 'B03 the firm reads the client''s own documents', (select count(*)::text from public.documents where id = d1), '1';
  insert into r select 'B04 but not a document filed on a matter they are not on',
    (select count(*)::text from public.documents where id = d2), '0';
  insert into r select 'B05 even when an entity cites it',
    (select count(*)::text from public.documents d join public.org_record_documents l on l.document_id = d.id where l.record_id = e2), '0';
  insert into r select 'B06 an entity does not reveal the matters about it',
    (select count(*)::text from public.matters where client_entity_id = e2 or id = m1), '0';
  insert into r select 'B07 nor the client''s tasks',
    (select count(*)::text from public.tasks where client_id = c or id = t1), '0';
  insert into r select 'B08 the client''s history is readable',
    (select (count(*) > 0)::text from public.audit_events where entity_type = 'client' and entity_id = c and event_type like 'org.%'), 'true';
  insert into r select 'B09 the confidential matter''s history is not',
    (select count(*)::text from public.audit_events where matter_id = m1), '0';
  insert into r select 'B10 client files are readable by path', public.can_read_storage_path(ws::text || '/clients/' || c::text || '/cert.pdf')::text, 'true';
  insert into r select 'B11 matter files are not', public.can_read_storage_path(ws::text || '/' || m1::text || '/x.pdf')::text, 'false';
  insert into r select 'B12 a client path must name a client of that workspace',
    public.can_read_storage_path(ws::text || '/clients/' || cp::text || '/x.pdf')::text, 'false';

  -- A lawyer maintains the organisation.
  insert into public.org_roles (workspace_id, client_id, title, parent_role_id) values (ws, c, 'Company Secretary', r1);
  insert into r select 'B13 a lawyer can add to the organogram',
    (select count(*)::text from public.org_roles where client_id = c and title = 'Company Secretary'), '1';

  -- Nothing from a firm they are not in.
  insert into r select 'B14 no organisation from another firm', (select count(*)::text from public.org_entities where client_id = cp), '0';
  begin
    insert into public.org_entities (workspace_id, client_id, name) values (personal, cp, 'Planted');
    insert into r select 'B15 no writing into another firm''s client', 'allowed', 'refused';
  exception when others then
    insert into r select 'B15 no writing into another firm''s client', 'refused', 'refused';
  end;
  begin
    insert into public.documents (id, workspace_id, client_id, name, kind) values (gen_random_uuid(), personal, cp, 'Planted', 'reference');
    insert into r select 'B16 no documents into another firm''s client', 'allowed', 'refused';
  exception when others then
    insert into r select 'B16 no documents into another firm''s client', 'refused', 'refused';
  end;
  update public.org_entities set name = 'Hijacked' where client_id = cp;
  get diagnostics n = row_count;
  insert into r select 'B17 nor changing it', n::text, '0';
end
$t$;

-- ------------------------------------------------- Podrick as a viewer
reset role;
update public.workspace_members set role = 'viewer'
 where workspace_id = (select v::uuid from fx where k='ws') and user_id = (select v::uuid from fx where k='them');
set local role authenticated;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  c uuid := (select v::uuid from fx where k='c');
  n integer;
begin
  insert into r select 'C01 a viewer reads the organisation', (select count(*)::text from public.org_entities where client_id = c), '2';
  begin
    insert into public.org_people (workspace_id, client_id, full_name) values (ws, c, 'Planted');
    insert into r select 'C02 a viewer cannot add to it', 'allowed', 'refused';
  exception when others then
    insert into r select 'C02 a viewer cannot add to it', 'refused', 'refused';
  end;
  delete from public.org_entities where client_id = c;
  get diagnostics n = row_count;
  insert into r select 'C03 nor remove from it', n::text, '0';
  insert into r select 'C04 nor write client files', public.can_write_storage_path(ws::text || '/clients/' || c::text || '/x.pdf')::text, 'false';
end
$t$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
