-- Transcript Distiller 2.0: the matter boundary and the raw-record guard, proved.
--
-- Run against the live database; everything is ROLLED BACK (the block ends by
-- raising its result). Three people on one matter's transcript:
--   A  the matter's lead                     reads and writes
--   B  put on the matter as a viewer         reads, writes nothing
--   C  not on the matter                     sees nothing, not even by id
-- Row-level security denies by returning nothing, so the negative cases count
-- rows rather than waiting for an error.
--
-- Expected:
--   guard:ok labelguard:ok displayname-editable:ok tasklink-keeps:approved
--   A-read:1 A-insert:ok edit-unapproves:distilled
--   B-read:2 B-insert:denied B-update-rows:0 B-approve-rows:0 B-delete-rows:0
--   C-units:0 C-items:0 C-transcript:0 C-points:0 C-insert:denied

do $$
declare
  m uuid := 'd9c86cc1-c947-421e-984e-48733f20658e';  -- WAGAS-Group
  a uuid := '6df711b6-27b0-4aaf-8129-ef39700de7bb';
  b uuid := '176d2a8c-10f1-429b-82f2-dde207c99a68';
  c uuid := '4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7';
  t uuid; p1 uuid; p2 uuid; u1 uuid; i1 uuid;
  r text := ''; n int; st text;
begin
  insert into matter_members(matter_id, user_id, role) values (m, b, 'viewer')
    on conflict (matter_id, user_id) do update set role = 'viewer';
  delete from matter_members where matter_id = m and user_id = c;
  insert into transcripts(matter_id, meeting_title, distill_status) values (m, 'ZZ RLS', 'approved') returning id into t;
  insert into discussion_points(transcript_id, text, ordinal, speaker_label, timestamp_label)
    values (t, 'hello', 1, 'Speaker 1', '0:01') returning id into p1;
  insert into discussion_points(transcript_id, text, ordinal, speaker_label)
    values (t, 'world', 2, 'Speaker 2') returning id into p2;
  insert into transcript_units(transcript_id, text, point_ids) values (t, 'Hello world', array[p1, p2]) returning id into u1;
  insert into transcript_insights(transcript_id, category, title, kind, unit_ids, point_ids)
    values (t, 'decisions', 'D1', 'decision', array[u1], array[p1]) returning id into i1;
  update transcripts set distill_status = 'approved' where id = t;

  -- The raw record is evidence: its words and labels never change.
  begin update discussion_points set text = 'changed' where id = p1; r := r || 'guard:FAIL ';
  exception when others then r := r || 'guard:ok '; end;
  begin update discussion_points set speaker_label = 'Mawusi' where id = p1; r := r || 'labelguard:FAIL ';
  exception when others then r := r || 'labelguard:ok '; end;
  update discussion_points set speaker_name = 'Mawusi' where id = p1; r := r || 'displayname-editable:ok ';

  -- Linking a task is not a change to what the record says.
  update transcript_insights set task_id = null where id = i1;
  select distill_status into st from transcripts where id = t; r := r || 'tasklink-keeps:' || st || ' ';

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into n from transcript_units where transcript_id = t; r := r || 'A-read:' || n || ' ';
  insert into transcript_units(transcript_id, text) values (t, 'by A'); r := r || 'A-insert:ok ';
  update transcript_insights set title = 'D1 edited' where id = i1;
  select distill_status into st from transcripts where id = t; r := r || 'edit-unapproves:' || st || ' ';

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from transcript_units where transcript_id = t; r := r || 'B-read:' || n || ' ';
  begin insert into transcript_units(transcript_id, text) values (t, 'by B'); r := r || 'B-insert:FAIL ';
  exception when others then r := r || 'B-insert:denied '; end;
  update transcript_insights set title = 'by B' where id = i1; get diagnostics n = row_count; r := r || 'B-update-rows:' || n || ' ';
  update transcripts set distill_status = 'approved' where id = t; get diagnostics n = row_count; r := r || 'B-approve-rows:' || n || ' ';
  delete from transcript_units where transcript_id = t; get diagnostics n = row_count; r := r || 'B-delete-rows:' || n || ' ';

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from transcript_units where transcript_id = t; r := r || 'C-units:' || n || ' ';
  select count(*) into n from transcript_insights where transcript_id = t; r := r || 'C-items:' || n || ' ';
  select count(*) into n from transcripts where id = t; r := r || 'C-transcript:' || n || ' ';
  select count(*) into n from discussion_points where transcript_id = t; r := r || 'C-points:' || n || ' ';
  begin insert into transcript_units(transcript_id, text) values (t, 'by C'); r := r || 'C-insert:FAIL ';
  exception when others then r := r || 'C-insert:denied '; end;

  raise exception 'RESULT: %', r;
end $$;
