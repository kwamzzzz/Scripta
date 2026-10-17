-- Manuscripts: who may see and change a manuscript and everything under it.
--
-- Mawusi (workspace owner) creates the manuscripts. Podrick (lawyer in the
-- same firm, not on the test matter) and an outsider (owner of another
-- workspace only) try to reach them.
-- Runs against the live database and ROLLS BACK. The last statement raises the
-- results, so a caller that only sees errors still sees them.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
  ('ws', 'd832b081-cf82-4dc0-a5b9-b0241fe50d9b'),
  ('mawusi', '6df711b6-27b0-4aaf-8129-ef39700de7bb'),
  ('podrick', '176d2a8c-10f1-429b-82f2-dde207c99a68'),
  ('outsider', '0ba58faa-6e4f-4b25-a2a6-88229d18ec66'),
  ('firm', gen_random_uuid()::text),
  ('private', gen_random_uuid()::text),
  ('filed', gen_random_uuid()::text),
  ('matter', gen_random_uuid()::text);

set local role authenticated;

-- ---------------------------------------------------------- Mawusi creates
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  firm uuid := (select v::uuid from fx where k='firm');
  priv uuid := (select v::uuid from fx where k='private');
  filed uuid := (select v::uuid from fx where k='filed');
  mat uuid := (select v::uuid from fx where k='matter');
  v uuid;
begin
  insert into public.matters (id, workspace_id, name) values (mat, ws, 'ZZ Confidential matter');

  insert into public.manuscripts (id, workspace_id, title) values (firm, ws, 'ZZ Firm thesis');
  insert into public.manuscripts (id, workspace_id, title, private) values (priv, ws, 'ZZ Private thesis', true);
  insert into public.manuscripts (id, workspace_id, title, matter_id) values (filed, ws, 'ZZ Matter thesis', mat);

  foreach v in array array[firm, priv, filed] loop
    insert into public.manuscript_versions (id, manuscript_id, version_no, format)
      values (v, v, 1, 'docx');
    insert into public.manuscript_nodes (manuscript_id, version_id, key, ord, kind, text)
      values (v, v, 'n1', 0, 'paragraph', 'Confidential words');
    insert into public.manuscript_findings (manuscript_id, version_id, ref, pass, category, severity, action, title, fingerprint)
      values (v, v, 1, 'mechanics', 'error', 'minor', 'correction', 'A finding', 'fp');
  end loop;

  insert into r select 'M01 the author reads all three of her manuscripts',
    (select count(*)::text from public.manuscripts where id in (firm, priv, filed)), '3';
end
$t$;

-- ------------------------------------------------ Podrick, same firm, not on the matter
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  firm uuid := (select v::uuid from fx where k='firm');
  priv uuid := (select v::uuid from fx where k='private');
  filed uuid := (select v::uuid from fx where k='filed');
  mat uuid := (select v::uuid from fx where k='matter');
  n int;
begin
  insert into r select 'M02 a colleague reads an unfiled manuscript and its text',
    (select count(*)::text from public.manuscript_nodes where manuscript_id = firm), '1';
  insert into r select 'M03 a colleague cannot see a private manuscript',
    (select count(*)::text from public.manuscripts where id = priv), '0';
  insert into r select 'M04 nor its text, versions or findings',
    (select (select count(*) from public.manuscript_nodes where manuscript_id = priv)
          + (select count(*) from public.manuscript_versions where manuscript_id = priv)
          + (select count(*) from public.manuscript_findings where manuscript_id = priv))::text, '0';
  insert into r select 'M05 a colleague off the matter cannot see a manuscript filed to it',
    (select count(*)::text from public.manuscripts where id = filed), '0';
  insert into r select 'M06 nor its text or findings',
    (select (select count(*) from public.manuscript_nodes where manuscript_id = filed)
          + (select count(*) from public.manuscript_findings where manuscript_id = filed))::text, '0';

  begin
    insert into public.manuscripts (workspace_id, title, matter_id) values (ws, 'ZZ Sneaked in', mat);
    insert into r values ('M07 nobody files into a matter they cannot write to', 'accepted', 'refused');
  exception when insufficient_privilege or check_violation then
    insert into r values ('M07 nobody files into a matter they cannot write to', 'refused', 'refused');
  end;

  update public.manuscript_findings set status = 'dismissed' where manuscript_id = firm;
  get diagnostics n = row_count;
  insert into r values ('M08 a firm writer may decide findings on an unfiled manuscript', n::text, '1');

  update public.manuscript_findings set status = 'dismissed' where manuscript_id = filed;
  get diagnostics n = row_count;
  insert into r values ('M09 but not on one filed to a matter they are not on', n::text, '0');

  begin
    update public.manuscripts set private = true where id = firm;
    insert into r values ('M10 only the author can make a manuscript private', 'changed', 'refused');
  exception when raise_exception then
    insert into r values ('M10 only the author can make a manuscript private', 'refused', 'refused');
  end;

  -- Refused by the with-check; a filtered update (0 rows) would also be a refusal.
  begin
    update public.manuscripts set matter_id = mat where id = firm;
    get diagnostics n = row_count;
    insert into r values ('M11 a colleague cannot move a manuscript into a matter they cannot write to', n::text, '0');
  exception when insufficient_privilege or check_violation then
    insert into r values ('M11 a colleague cannot move a manuscript into a matter they cannot write to', '0', '0');
  end;
end
$t$;

do $t$
declare
  firm uuid := (select v::uuid from fx where k='firm');
  n int;
begin
  delete from public.manuscripts where id = firm;
  get diagnostics n = row_count;
  insert into r values ('M12 only the author deletes a manuscript', n::text, '0');
end
$t$;

-- ----------------------------------------------------- an outsider
set local request.jwt.claims = '{"sub":"0ba58faa-6e4f-4b25-a2a6-88229d18ec66","role":"authenticated"}';
do $t$
declare
  firm uuid := (select v::uuid from fx where k='firm');
  n int;
begin
  insert into r select 'M13 another workspace sees none of the firm''s manuscripts',
    (select count(*)::text from public.manuscripts where title like 'ZZ %'), '0';
  insert into r select 'M14 nor any of their text',
    (select count(*)::text from public.manuscript_nodes where manuscript_id = firm), '0';
  begin
    insert into public.manuscript_findings (manuscript_id, version_id, ref, pass, category, severity, action, title, fingerprint)
      values (firm, firm, 2, 'mechanics', 'error', 'minor', 'correction', 'Planted', 'fp2');
    insert into r values ('M15 an outsider cannot add findings', 'accepted', 'refused');
  exception when insufficient_privilege or check_violation then
    insert into r values ('M15 an outsider cannot add findings', 'refused', 'refused');
  end;
end
$t$;

-- --------------------------------------------- the author, once more
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare
  priv uuid := (select v::uuid from fx where k='private');
  filed uuid := (select v::uuid from fx where k='filed');
begin
  insert into r select 'M16 the author still reads her private and filed manuscripts in full',
    (select count(*)::text from public.manuscript_nodes where manuscript_id in (priv, filed)), '2';
end
$t$;

reset role;
do $t$
declare out text;
begin
  select string_agg(case when got = want then 'PASS ' else 'FAIL ' end || test || ' (got ' || got || ', want ' || want || ')', E'\n' order by test)
    into out from r;
  raise exception E'RESULTS\n%', out;
end
$t$;
rollback;
