-- Essentials or full corporate services: which optional areas a client's file
-- carries. A display setting of the firm's, never a permission, and switching
-- an area off deletes nothing.
--
-- Mawusi (workspace owner) creates the clients. Podrick (lawyer in the same
-- firm) changes the setting on one of them.
-- Runs against the live database and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values ('ws','d832b081-cf82-4dc0-a5b9-b0241fe50d9b');

set local role authenticated;

-- ------------------------------------------------------------- Mawusi creates
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  plain uuid; full_ uuid; e uuid;
begin
  insert into public.clients (workspace_id, name) values (ws, 'ZZ Advisory Client') returning id into plain;
  insert into r select 'A01 a client created without a choice carries the essentials only',
    (select optional_areas::text from public.clients where id = plain), '{}';

  insert into public.clients (workspace_id, name, optional_areas)
    values (ws, 'ZZ Managed Client', array['licences','calendar','processes','marketing'])
    returning id into full_;
  insert into r select 'A02 full corporate services is stored as all four areas',
    (select optional_areas::text from public.clients where id = full_), '{licences,calendar,processes,marketing}';

  begin
    insert into public.clients (workspace_id, name, optional_areas) values (ws, 'ZZ Bad', array['payroll']);
    insert into r values ('A03 an unknown area is refused', 'accepted', 'refused');
  exception when check_violation then
    insert into r values ('A03 an unknown area is refused', 'refused', 'refused');
  end;

  insert into public.org_entities (workspace_id, client_id, name) values (ws, full_, 'ZZ Managed Ltd') returning id into e;
  insert into public.org_licences (workspace_id, client_id, entity_id, name) values (ws, full_, e, 'ZZ Trading licence');
  insert into fx values ('plain', plain::text), ('full', full_::text);
end
$t$;

-- ------------------------------------------------- Podrick changes the setting
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare
  full_ uuid := (select v::uuid from fx where k='full');
  plain uuid := (select v::uuid from fx where k='plain');
begin
  update public.clients set optional_areas = array['marketing'] where id = full_;
  insert into r select 'A04 a firm lawyer may change a client''s areas',
    (select optional_areas::text from public.clients where id = full_), '{marketing}';
  insert into r select 'A05 switching licences off deletes no licence',
    (select count(*)::text from public.org_licences where client_id = full_), '1';

  update public.clients set optional_areas = array['licences'] where id = plain;
  insert into r select 'A06 one area can be turned on alone',
    (select optional_areas::text from public.clients where id = plain), '{licences}';
end
$t$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
