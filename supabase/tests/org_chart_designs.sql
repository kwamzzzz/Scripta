-- A chart's design is the firm's: every member reads it, writers change it,
-- nobody outside the workspace sees it, and it is not the client's history.
--
-- Mawusi owns the Nexis Africa workspace and her own personal workspace;
-- Podrick is a lawyer in Nexis Africa only.
-- Runs against the live database and ROLLS BACK. Results come back as the
-- message of the error raised at the end, which also undoes everything.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;
insert into fx values
 ('firm','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),
 ('mine','f3c5215d-ba97-43fc-8c43-0b5278675194');

set local role authenticated;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare
  firm uuid := (select v::uuid from fx where k='firm');
  mine uuid := (select v::uuid from fx where k='mine');
  c uuid; p uuid; before int;
begin
  insert into public.clients (workspace_id, name) values (firm, 'ZZ Chart Client') returning id into c;
  insert into public.clients (workspace_id, name) values (mine, 'ZZ Private Chart Client') returning id into p;
  before := (select count(*) from public.audit_events where entity_type = 'client' and entity_id = c);
  insert into public.org_chart_designs (workspace_id, client_id, kind, design)
    values (firm, c, 'ownership', '{"nodes":{"x":{"fill":"#C8373B"}}}');
  insert into public.org_chart_designs (workspace_id, client_id, kind, design)
    values (mine, p, 'ownership', '{}');
  insert into r select 'D01 a design is kept, one per chart',
    (select count(*)::text from public.org_chart_designs where client_id = c), '1';
  begin
    insert into public.org_chart_designs (workspace_id, client_id, kind) values (firm, c, 'ownership');
    insert into r values ('D02 a second design for the same chart is refused', 'accepted', 'refused');
  exception when unique_violation then
    insert into r values ('D02 a second design for the same chart is refused', 'refused', 'refused');
  end;
  insert into r select 'D03 drawing is not written to the client''s history',
    (select (count(*) - before)::text from public.audit_events where entity_type = 'client' and entity_id = c), '0';
  insert into fx values ('c', c::text), ('p', p::text);
end
$t$;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare
  c uuid := (select v::uuid from fx where k='c');
  p uuid := (select v::uuid from fx where k='p');
  n int;
begin
  insert into r select 'D04 a colleague in the firm reads the design',
    (select design #>> '{nodes,x,fill}' from public.org_chart_designs where client_id = c), '#C8373B';
  update public.org_chart_designs set design = '{"direction":"right"}', version = version + 1
    where client_id = c and kind = 'ownership' and version = 1;
  get diagnostics n = row_count;
  insert into r select 'D05 and may change it', n::text, '1';
  insert into r select 'D06 which records who changed it',
    (select updated_by::text from public.org_chart_designs where client_id = c), '176d2a8c-10f1-429b-82f2-dde207c99a68';
  update public.org_chart_designs set design = '{}', version = version + 1
    where client_id = c and kind = 'ownership' and version = 1;
  get diagnostics n = row_count;
  insert into r select 'D07 a save from an older version changes nothing', n::text, '0';
  insert into r select 'D08 nobody outside a workspace sees its designs',
    (select count(*)::text from public.org_chart_designs where client_id = p), '0';
end
$t$;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
reset role;
delete from public.clients where id = (select v::uuid from fx where k='c');
insert into r select 'D09 deleting the client deletes its designs',
  (select count(*)::text from public.org_chart_designs where client_id = (select v::uuid from fx where k='c')), '0';

do $$ begin raise exception 'RESULTS (rolled back): %', (select string_agg(test || ' => ' || case when got = want then 'PASS' else 'FAIL got ' || coalesce(got, 'null') end, ' | ' order by test) from r); end $$;
