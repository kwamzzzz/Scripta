-- A client's marketing is its creator's until they share it; deleting a client
-- is its creator's too.
--
-- Mawusi (workspace owner) creates the client. Podrick (lawyer in the same
-- firm) starts with no access, is let in as a contributor, then removed.
-- Runs against the live database and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('ws','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');

set local role authenticated;

-- --------------------------------------------------------------- Mawusi sets up
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  c uuid; e uuid; camp uuid; asset uuid;
begin
  insert into public.clients (workspace_id, name) values (ws, 'ZZ Marketing Client') returning id into c;
  insert into public.org_entities (workspace_id, client_id, name) values (ws, c, 'ZZ Trading Ltd') returning id into e;
  insert into public.org_licences (workspace_id, client_id, entity_id, name, expires_on)
    values (ws, c, e, 'ZZ Export licence', current_date - 10);
  insert into public.mkt_brand_kits (workspace_id, client_id, tone, avoid_words)
    values (ws, c, 'Plain, specific, no hype.', array['guaranteed']);
  insert into public.mkt_campaigns (workspace_id, client_id, name, entity_id) values (ws, c, 'ZZ Q4 campaign', e) returning id into camp;
  insert into public.mkt_consents (workspace_id, client_id, party, status) values (ws, c, 'Kessler AG', 'requested');
  insert into public.mkt_assets (workspace_id, client_id, name, kind) values (ws, c, 'ZZ Post frame', 'template') returning id into asset;
  insert into fx values ('c', c::text), ('camp', camp::text), ('asset', asset::text);
  insert into r select 'M01 the creator owns the client''s marketing', public.marketing_level(c), 'owner';
end
$t$;

-- --------------------------------------------------- Podrick, before he is let in
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  c uuid := (select v::uuid from fx where k='c');
begin
  insert into r select 'M02 a firm lawyer has no marketing access by default', coalesce(public.marketing_level(c), 'none'), 'none';
  insert into r select 'M03 he sees no campaign', (select count(*)::text from public.mkt_campaigns where client_id = c), '0';
  insert into r select 'M04 no brand kit, assets or consents',
    (select ((select count(*) from public.mkt_brand_kits where client_id = c)
           + (select count(*) from public.mkt_assets where client_id = c)
           + (select count(*) from public.mkt_consents where client_id = c))::text), '0';
  insert into r select 'M05 no marketing history', (select count(*)::text from public.audit_events where entity_type = 'marketing' and entity_id = c), '0';
  insert into r select 'M06 but still the client itself', (select count(*)::text from public.clients where id = c), '1';
  insert into r select 'M07 no marketing files', public.can_read_storage_path(ws || '/marketing/' || c || '/x.png')::text, 'false';
  begin
    insert into public.client_marketing_access (workspace_id, client_id, user_id, level)
      values (ws, c, auth.uid(), 'approver');
    insert into r select 'M08 he cannot let himself in', 'allowed', 'refused';
  exception when others then
    insert into r select 'M08 he cannot let himself in', 'refused', 'refused';
  end;
  begin
    insert into public.mkt_content (workspace_id, client_id, title) values (ws, c, 'Planted');
    insert into r select 'M09 nor write a post', 'allowed', 'refused';
  exception when others then
    insert into r select 'M09 nor write a post', 'refused', 'refused';
  end;
end
$t$;

-- ----------------------------------------------------- Mawusi lets him contribute
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into public.client_marketing_access (workspace_id, client_id, user_id, level)
values ((select v::uuid from fx where k='ws'), (select v::uuid from fx where k='c'), (select v::uuid from fx where k='them'), 'contributor');

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  c uuid := (select v::uuid from fx where k='c');
  camp uuid := (select v::uuid from fx where k='camp');
  asset uuid := (select v::uuid from fx where k='asset');
  post uuid;
begin
  insert into r select 'M10 a contributor is a contributor', public.marketing_level(c), 'contributor';
  insert into r select 'M11 and reads the campaign', (select count(*)::text from public.mkt_campaigns where client_id = c), '1';
  insert into r select 'M12 and the files', public.can_read_storage_path(ws || '/marketing/' || c || '/x.png')::text, 'true';
  insert into public.mkt_content (workspace_id, client_id, campaign_id, title, body, stage, asset_id)
    values (ws, c, camp, 'Offtake milestone',
            'Guaranteed returns: our first licensed offtake with Kessler AG.', 'drafting', asset)
    returning id into post;
  insert into fx values ('post', post::text);
  insert into r select 'M13 a contributor drafts a post', (select stage from public.mkt_content where id = post), 'drafting';
  insert into r select 'M14 the checks see the avoided word, the lapsed licence and the missing consent',
    (select string_agg(check_key || ':' || level, ',' order by check_key) from public.mkt_content_checks(post)),
    'asset:warn,consent:kessler ag:block,licence:block,tone:block';
  begin
    insert into public.mkt_campaigns (workspace_id, client_id, name) values (ws, c, 'Planted');
    insert into r select 'M15 the brief stays with approvers', 'allowed', 'refused';
  exception when others then
    insert into r select 'M15 the brief stays with approvers', 'refused', 'refused';
  end;
  begin
    update public.mkt_assets set status = 'approved' where id = asset;
    insert into r select 'M16 a contributor cannot approve an asset', 'allowed', 'refused';
  exception when others then
    insert into r select 'M16 a contributor cannot approve an asset', 'refused', 'refused';
  end;
  begin
    insert into public.mkt_overrides (workspace_id, client_id, content_id, check_key, version, reason)
      values (ws, c, post, 'tone', 1, 'Fine');
    insert into r select 'M17 nor override a check', 'allowed', 'refused';
  exception when others then
    insert into r select 'M17 nor override a check', 'refused', 'refused';
  end;
  insert into public.mkt_approvals (workspace_id, client_id, content_id, kind) values (ws, c, post, 'director_approval');
  update public.mkt_content set stage = 'review' where id = post;
  begin
    update public.mkt_content set stage = 'scheduled', scheduled_at = now() + interval '1 day' where id = post;
    insert into r select 'M18 nor schedule it', 'allowed', 'refused';
  exception when others then
    insert into r select 'M18 nor schedule it', 'refused', 'refused';
  end;
  begin
    update public.client_marketing_access set level = 'approver' where client_id = c;
    insert into r select 'M19 nor promote himself', (select level from public.client_marketing_access where client_id = c and user_id = auth.uid()), 'contributor';
  exception when others then
    insert into r select 'M19 nor promote himself', 'contributor', 'contributor';
  end;
end
$t$;

-- ------------------------------------------------------------- Mawusi approves
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  c uuid := (select v::uuid from fx where k='c');
  post uuid := (select v::uuid from fx where k='post');
  k text;
begin
  update public.mkt_approvals set status = 'approved' where content_id = post and kind = 'director_approval';
  begin
    update public.mkt_content set stage = 'scheduled', scheduled_at = now() + interval '1 day' where id = post;
    insert into r select 'M20 approval alone does not get past blocked checks', 'allowed', 'refused';
  exception when others then
    insert into r select 'M20 approval alone does not get past blocked checks', 'refused', 'refused';
  end;
  foreach k in array array['tone', 'licence', 'consent:kessler ag'] loop
    insert into public.mkt_overrides (workspace_id, client_id, content_id, check_key, version, reason)
      values (ws, c, post, k, 1, 'Reviewed with the client; wording approved for this post.');
  end loop;
  update public.mkt_content set stage = 'scheduled', scheduled_at = now() + interval '1 day' where id = post;
  insert into r select 'M21 approved and overridden, it is scheduled', (select stage from public.mkt_content where id = post), 'scheduled';
  update public.mkt_content set body = body || ' Updated.' where id = post;
  insert into r select 'M22 changing the text sends it back to review as a new version',
    (select stage || ' v' || version from public.mkt_content where id = post), 'review v2';
  insert into r select 'M23 the earlier version is kept', (select count(*)::text from public.mkt_content_versions where content_id = post), '2';
  begin
    update public.mkt_content set stage = 'scheduled', scheduled_at = now() + interval '1 day' where id = post;
    insert into r select 'M24 the new version needs its own approval', 'allowed', 'refused';
  exception when others then
    insert into r select 'M24 the new version needs its own approval', 'refused', 'refused';
  end;
  -- Podrick's access ends.
  delete from public.client_marketing_access where client_id = c;
end
$t$;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  c uuid := (select v::uuid from fx where k='c');
  n integer;
begin
  insert into r select 'M25 removed, he sees no posts', (select count(*)::text from public.mkt_content where client_id = c), '0';
  insert into r select 'M26 nor their history', (select count(*)::text from public.audit_events where entity_type = 'marketing' and entity_id = c), '0';
  -- Deleting belongs to the client's owner.
  begin
    update public.clients set deleted_at = now() where id = c;
    insert into r select 'M27 a lawyer cannot delete someone else''s client', 'allowed', 'refused';
  exception when others then
    insert into r select 'M27 a lawyer cannot delete someone else''s client', 'refused', 'refused';
  end;
end
$t$;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare c uuid := (select v::uuid from fx where k='c'); n integer;
begin
  delete from public.clients where id = c;
  get diagnostics n = row_count;
  insert into r select 'M28 nor delete it for good', n::text, '0';
end
$t$;

-- ---------------------------------------------------- Mawusi deletes her client
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare
  ws uuid := (select v::uuid from fx where k='ws');
  c uuid := (select v::uuid from fx where k='c');
  m uuid := gen_random_uuid();
  t uuid;
  n integer;
begin
  insert into public.matters (id, workspace_id, name, client_id, owner_id) values (m, ws, 'ZZ Matter under the client', c, auth.uid());
  insert into public.tasks (workspace_id, title, client_id) values (ws, 'ZZ Client task', c) returning id into t;
  update public.clients set deleted_at = now() where id = c;
  insert into r select 'M29 the owner moves it to Recently Deleted', (select (deleted_at is not null)::text from public.clients where id = c), 'true';
  update public.clients set deleted_at = null where id = c;
  insert into r select 'M30 and can restore it', (select (deleted_at is null)::text from public.clients where id = c), 'true';
  delete from public.clients where id = c;
  get diagnostics n = row_count;
  insert into r select 'M31 and delete it for good', n::text, '1';
  insert into r select 'M32 its matter is kept, unfiled, with the name as text',
    (select coalesce(client_id::text, 'none') || ' / ' || client from public.matters where id = m), 'none / ZZ Marketing Client';
  insert into r select 'M33 its task is kept, unfiled', (select coalesce(client_id::text, 'none') from public.tasks where id = t), 'none';
  insert into r select 'M34 its organisation and marketing are gone',
    (select ((select count(*) from public.org_entities where client_id = c)
           + (select count(*) from public.mkt_content where client_id = c)
           + (select count(*) from public.mkt_campaigns where client_id = c))::text), '0';
end
$t$;

-- ------------------------------------- a client nobody is recorded as creating
reset role;
do $t$
declare c uuid;
begin
  insert into public.clients (workspace_id, name, created_by)
    values ((select v::uuid from fx where k='ws'), 'ZZ Migrated Client', null) returning id into c;
  update public.clients set created_by = null where id = c;
  insert into fx values ('old', c::text);
end
$t$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into r select 'M35 with no creator, a workspace owner stands in',
  coalesce(public.marketing_level((select v::uuid from fx where k='old')), 'none'), 'owner';
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'M36 and a lawyer does not',
  coalesce(public.marketing_level((select v::uuid from fx where k='old')), 'none'), 'none';

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
