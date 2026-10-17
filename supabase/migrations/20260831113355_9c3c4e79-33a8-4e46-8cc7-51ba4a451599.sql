-- restrict helper execution to signed-in users
do $do$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon', fn.sig);
    execute format('grant execute on function %s to authenticated, service_role', fn.sig);
  end loop;
end $do$;

create or replace function public.seed_demo_matter(_workspace_id uuid, _user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  pb uuid; m uuid; tr uuid;
  d1 uuid; d2 uuid; d3 uuid; d4 uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid; c7 uuid;
  q1 uuid; q2 uuid; q3 uuid; q4 uuid; q5 uuid; q6 uuid; q7 uuid; q8 uuid; q9 uuid;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; r6 uuid;
begin
  insert into public.playbooks(workspace_id, name, version_label, status, owner_id)
  values (_workspace_id, 'Vendor Agreement Playbook', 'v3', 'Active', _user_id) returning id into pb;

  insert into public.playbook_rules(playbook_id, topic, preferred, fallback, redflag, escalate, approved_clause_text, owner_id, owner_name, usage_note, suggestion_note, ordinal) values
   (pb,'Termination for Convenience','60 days’ written notice, either party','30 days’ written notice','No termination for convenience','Fixed term above 24 months without termination for convenience','Either party may terminate this Agreement for convenience on sixty (60) days’ prior written notice to the other party.',_user_id,'Priya Sharma','Applied in 12 matters',null,1) returning id into p1;
  insert into public.playbook_rules(playbook_id, topic, preferred, fallback, redflag, escalate, approved_clause_text, owner_id, owner_name, usage_note, suggestion_note, ordinal) values
   (pb,'Payment Terms','Net 30 from receipt of valid invoice','Net 45','Net 60 or longer; payment contingent on end-client receipts','Prepayment above 25% of annual fees','Client shall pay each undisputed invoice within thirty (30) days of receipt.',_user_id,'Priya Sharma','Applied in 9 matters','Net 45 has been accepted in 4 recent matters. Consider promoting it to the preferred position.',2) returning id into p2;
  insert into public.playbook_rules(playbook_id, topic, preferred, fallback, redflag, escalate, approved_clause_text, owner_id, owner_name, usage_note, suggestion_note, ordinal) values
   (pb,'Data Protection','Breach notice within 24 hours; GDPR + CCPA compliance','Breach notice within 48 hours','No breach-notice obligation, or notice beyond 72 hours','Processing of special-category data','Vendor shall notify Client of any personal data breach without undue delay and in any event within twenty-four (24) hours.',_user_id,'Mark Reyes','Applied in 7 matters',null,3) returning id into p3;
  insert into public.playbook_rules(playbook_id, topic, preferred, fallback, redflag, escalate, approved_clause_text, owner_id, owner_name, usage_note, suggestion_note, ordinal) values
   (pb,'Intellectual Property','Client owns deliverables; Vendor retains pre-existing IP with perpetual licence-back','Joint ownership of improvements to Vendor tools','Blanket assignment of all Vendor IP, including pre-existing materials','Any assignment of Vendor platform IP','All deliverables are assigned to Client on payment. Vendor retains its pre-existing materials and grants Client a perpetual, irrevocable licence to use them as embedded in the deliverables.',_user_id,'Priya Sharma','Applied in 11 matters',null,4) returning id into p4;
  insert into public.playbook_rules(playbook_id, topic, preferred, fallback, redflag, escalate, approved_clause_text, owner_id, owner_name, usage_note, suggestion_note, ordinal) values
   (pb,'Governing Law','England and Wales','Delaware','Jurisdictions without reliable enforcement of exclusion clauses','Any jurisdiction outside the approved list','This Agreement is governed by the laws of England and Wales, and the parties submit to the exclusive jurisdiction of its courts.',_user_id,'Priya Sharma','Applied in 12 matters',null,5) returning id into p5;
  insert into public.playbook_rules(playbook_id, topic, preferred, fallback, redflag, escalate, approved_clause_text, owner_id, owner_name, usage_note, suggestion_note, ordinal) values
   (pb,'Limitation of Liability','Cap at 12 months’ fees; carve-outs for confidentiality and IP indemnity','Cap at 150% of annual fees','Uncapped liability or uncapped indemnities','Any cap below 100% of annual fees','Each party’s aggregate liability is capped at the fees paid or payable in the twelve (12) months preceding the claim.',_user_id,'Priya Sharma','Applied in 10 matters',null,6) returning id into p6;

  insert into public.matters(workspace_id, name, client, counterparty, stage, playbook_id, is_sample, created_by)
  values (_workspace_id,'Atlas Software Vendor Agreement','Meridian Group (Client)','Atlas Software Ltd (Vendor)','Amendment v4 under review', pb, true, _user_id) returning id into m;

  insert into public.documents(matter_id,name,kind,version_label,doc_date,parse_status,uploaded_by) values
   (m,'Master Services Agreement','contract','v3 (Original)','2026-05-10','parsed',_user_id) returning id into d1;
  insert into public.documents(matter_id,name,kind,version_label,doc_date,parse_status,uploaded_by) values
   (m,'Amendment','amendment','v4 (Proposed)','2026-05-16','parsed',_user_id) returning id into d2;
  insert into public.documents(matter_id,name,kind,version_label,doc_date,parse_status,uploaded_by) values
   (m,'Steering Committee Transcript','transcript','May 6, 2026 · 67 min','2026-05-06','parsed',_user_id) returning id into d3;
  insert into public.documents(matter_id,name,kind,version_label,doc_date,parse_status,uploaded_by) values
   (m,'Vendor Agreement Playbook','playbook','v3 · Active','2026-04-28','parsed',_user_id) returning id into d4;

  insert into public.clauses(matter_id,source_document_id,compared_to_document_id,num,title,change,risk,status,page_ref,diff_summary,analysis,analysis_source,ordinal) values
   (m,d2,d1,'1','Definitions','Modified','Low','Accepted','p.3','“Affiliate” definition expanded: adds ownership of 50% or more of voting interests.','Clarification only. Broader Affiliate definition slightly widens confidentiality and assignment reach; no material risk in this context.','ai',1) returning id into c1;
  insert into public.clause_segments(clause_id,ordinal,text,kind) values
   (c1,1,'“Affiliate” means any entity that directly or indirectly owns, is controlled by, or is under common control with a party under this Agreement','n'),
   (c1,2,', including by ownership of 50% or more of the voting interests','i'),
   (c1,3,'.','n');

  insert into public.clauses(matter_id,source_document_id,compared_to_document_id,num,title,change,risk,status,page_ref,diff_summary,analysis,analysis_source,ordinal) values
   (m,d2,d1,'2','Term and Termination','Modified','Low','Accepted','p.7','Term extended 12 → 36 months. Termination notice increased 30 → 60 days.','Notice period increased from 30 to 60 days — consistent with the preferred Playbook position. 36-month term is above the 24-month escalation threshold, but the retained termination for convenience removes the trigger.','ai',2) returning id into c2;
  insert into public.clause_segments(clause_id,ordinal,text,kind) values
   (c2,1,'The term of this Agreement shall commence on the Effective Date and continue for ','n'),
   (c2,2,'twelve (12)','d'),
   (c2,3,'thirty-six (36)','i'),
   (c2,4,' months. Either party may terminate this Agreement on ','n'),
   (c2,5,'thirty (30)','d'),
   (c2,6,'sixty (60)','i'),
   (c2,7,' days’ written notice.','n');
  insert into public.clause_assessments(clause_id,playbook_rule_id,verdict,detail,source)
   values (c2,p1,'Consistent','Preferred position: 60 days. Amendment matches.','ai');

  insert into public.clauses(matter_id,source_document_id,compared_to_document_id,num,title,change,risk,status,page_ref,diff_summary,analysis,analysis_source,ordinal) values
   (m,d2,d1,'3','Fees and Payment','Modified','Medium','For discussion','p.12','Invoice payment period extended 30 → 45 days; ACH added.','Net 45 departs from the preferred Net 30 position but sits within the approved fallback. Confirm cash-flow impact with finance before accepting.','ai',3) returning id into c3;
  insert into public.clause_segments(clause_id,ordinal,text,kind) values
   (c3,1,'Invoices are due within ','n'),
   (c3,2,'thirty (30)','d'),
   (c3,3,'forty-five (45)','i'),
   (c3,4,' days of receipt','n'),
   (c3,5,', payable by ACH transfer','i'),
   (c3,6,'.','n');
  insert into public.clause_assessments(clause_id,playbook_rule_id,verdict,detail,source)
   values (c3,p2,'Fallback','Preferred: Net 30. Fallback: Net 45 — within approved range; record rationale.','ai');

  insert into public.clauses(matter_id,source_document_id,compared_to_document_id,num,title,change,risk,status,page_ref,diff_summary,analysis,analysis_source,ordinal) values
   (m,d2,d1,'4','Data Protection','Added','Low','Accepted','p.14','New clause: GDPR/CCPA compliance and 24-hour breach notice.','New clause matches the preferred Playbook position on breach notification. Confirm the security schedule references SOC 2 Type II reporting agreed in the meeting.','ai',4) returning id into c4;
  insert into public.clause_segments(clause_id,ordinal,text,kind) values
   (c4,1,'Vendor shall process personal data in accordance with GDPR and CCPA and shall notify Client of any data breach within twenty-four (24) hours of becoming aware of it.','i');
  insert into public.clause_assessments(clause_id,playbook_rule_id,verdict,detail,source)
   values (c4,p3,'Consistent','Preferred: breach notice within 24 hours. Amendment matches.','ai');

  insert into public.clauses(matter_id,source_document_id,compared_to_document_id,num,title,change,risk,status,page_ref,diff_summary,analysis,analysis_source,ordinal) values
   (m,d2,d1,'5','Confidentiality','Modified','Medium','Open','p.16','Carve-out for disclosures to professional advisers deleted.','Deleting the adviser carve-out would technically prohibit sharing with external counsel and auditors. Likely a drafting error — restore the carve-out or obtain written waiver.','ai',5) returning id into c5;
  insert into public.clause_segments(clause_id,ordinal,text,kind) values
   (c5,1,'Each party shall maintain the confidentiality of the other party’s confidential information','n'),
   (c5,2,', except disclosures to professional advisers under equivalent duties of confidence','d'),
   (c5,3,'.','n');

  insert into public.clauses(matter_id,source_document_id,compared_to_document_id,num,title,change,risk,status,page_ref,diff_summary,analysis,analysis_source,ordinal) values
   (m,d2,d1,'6','Intellectual Property','Modified','High','Escalated','p.19','Blanket assignment: all IP created or used during engagement owned by Client.','“Created or used” captures Vendor’s pre-existing tools and libraries — a red-flag position under the Playbook. The meeting resolution (R5) contemplates Client owning engagement IP with Vendor retaining pre-existing IP plus licence-back; the amendment does not reflect that.','ai',6) returning id into c6;
  insert into public.clause_segments(clause_id,ordinal,text,kind) values
   (c6,1,'All deliverables shall be assigned to Client upon payment. ','n'),
   (c6,2,'Vendor retains all rights in pre-existing materials and tools.','d'),
   (c6,3,'All intellectual property created or used during the engagement shall be owned exclusively by Client.','i');
  insert into public.clause_assessments(clause_id,playbook_rule_id,verdict,detail,source)
   values (c6,p4,'Red flag','Red flag: blanket assignment of all Vendor IP. Preferred: Client owns deliverables; Vendor retains pre-existing IP with licence-back.','ai');

  insert into public.clauses(matter_id,source_document_id,compared_to_document_id,num,title,change,risk,status,page_ref,diff_summary,analysis,analysis_source,ordinal) values
   (m,d2,d1,'7','Governing Law','Modified','High','Escalated','p.22','Governing law changed from England and Wales to New York.','New York is outside the approved jurisdictions (England & Wales preferred; Delaware fallback). Escalation required under the Playbook before acceptance.','ai',7) returning id into c7;
  insert into public.clause_segments(clause_id,ordinal,text,kind) values
   (c7,1,'This Agreement is governed by the laws of ','n'),
   (c7,2,'England and Wales','d'),
   (c7,3,'the State of New York','i'),
   (c7,4,'.','n');
  insert into public.clause_assessments(clause_id,playbook_rule_id,verdict,detail,source)
   values (c7,p5,'Escalate','Approved: England & Wales (preferred), Delaware (fallback). New York requires GC sign-off.','ai');

  insert into public.transcripts(matter_id,document_id,meeting_title,meeting_date,duration_minutes,source_label,speaker_count)
  values (m,d3,'Steering Committee','2026-05-06',67,'May 6, 2026 · 67 min',4) returning id into tr;

  insert into public.discussion_points(transcript_id,timestamp_label,speaker_name,speaker_role,text,ordinal) values
   (tr,'01:12:35','Sarah Lindqvist','Client','Can we extend the term to align with our budget cycle? We’d prefer 36 months.',1) returning id into q1;
  insert into public.discussion_points(transcript_id,timestamp_label,speaker_name,speaker_role,text,ordinal) values
   (tr,'01:20:46','John Okafor','Vendor','We can agree 36 months provided there is a 60-day termination for convenience.',2) returning id into q2;
  insert into public.discussion_points(transcript_id,timestamp_label,speaker_name,speaker_role,text,ordinal) values
   (tr,'01:33:02','Priya Sharma','Legal','Data protection must meet GDPR and CCPA. We also need breach notice within 24 hours.',3) returning id into q3;
  insert into public.discussion_points(transcript_id,timestamp_label,speaker_name,speaker_role,text,ordinal) values
   (tr,'01:41:27','Mark Reyes','Security','We can support 24-hour notice and provide annual SOC 2 Type II reports.',4) returning id into q4;
  insert into public.discussion_points(transcript_id,timestamp_label,speaker_name,speaker_role,text,ordinal) values
   (tr,'02:05:51','Sarah Lindqvist','Client','Payment terms — can we move to Net 45? Our AP team is stretched.',5) returning id into q5;
  insert into public.discussion_points(transcript_id,timestamp_label,speaker_name,speaker_role,text,ordinal) values
   (tr,'02:21:01','John Okafor','Vendor','We can do Net 45 with ACH payments.',6) returning id into q6;
  insert into public.discussion_points(transcript_id,timestamp_label,speaker_name,speaker_role,text,ordinal) values
   (tr,'02:30:12','Priya Sharma','Legal','All IP created during the engagement should be owned by Client.',7) returning id into q7;
  insert into public.discussion_points(transcript_id,timestamp_label,speaker_name,speaker_role,text,ordinal) values
   (tr,'02:34:40','John Okafor','Vendor','We need to retain our pre-existing tools and libraries, with a licence-back for anything built on them.',8) returning id into q8;
  insert into public.discussion_points(transcript_id,timestamp_label,speaker_name,speaker_role,text,ordinal) values
   (tr,'02:47:18','Priya Sharma','Legal','On governing law — our board is asking for New York.',9) returning id into q9;

  insert into public.resolutions(matter_id,title,status,text,owner_id,owner_name,playbook_verdict,playbook_detail,ordinal) values
   (m,'Term Extension','Accepted','36-month term with 60-day termination for convenience.',_user_id,'John Okafor','Consistent','60-day termination matches the preferred Playbook position.',1) returning id into r1;
  insert into public.resolutions(matter_id,title,status,text,owner_id,owner_name,playbook_verdict,playbook_detail,ordinal) values
   (m,'Data Protection & Breach Notice','Accepted','Comply with GDPR and CCPA; breach notice within 24 hours.',_user_id,'Mark Reyes','Consistent','24-hour breach notice matches the preferred position.',2) returning id into r2;
  insert into public.resolutions(matter_id,title,status,text,owner_id,owner_name,playbook_verdict,playbook_detail,ordinal) values
   (m,'Security Reports','Accepted','Vendor to provide annual SOC 2 Type II reports and audit rights.',_user_id,'Mark Reyes',null,null,3) returning id into r3;
  insert into public.resolutions(matter_id,title,status,text,owner_id,owner_name,playbook_verdict,playbook_detail,ordinal) values
   (m,'Payment Terms','Accepted','Net 45 via ACH.',_user_id,'Sarah Lindqvist','Fallback','Departs from preferred Net 30; within approved fallback. Rationale recorded: AP capacity.',4) returning id into r4;
  insert into public.resolutions(matter_id,title,status,text,owner_id,owner_name,playbook_verdict,playbook_detail,ordinal) values
   (m,'Intellectual Property','Open','Client owns engagement IP; Vendor retains pre-existing IP with licence-back — wording to be agreed.',_user_id,'Priya Sharma','Fallback','Acceptable if licence-back is perpetual and irrevocable. Amendment v4 does not yet reflect this.',5) returning id into r5;
  insert into public.resolutions(matter_id,title,status,text,owner_id,owner_name,playbook_verdict,playbook_detail,ordinal) values
   (m,'Governing Law','Escalated','New York proposed — outside approved jurisdictions. Escalated to GC.',_user_id,'Priya Sharma','Escalate','Approved jurisdictions: England & Wales, Delaware.',6) returning id into r6;

  insert into public.resolution_sources(resolution_id,discussion_point_id) values
   (r1,q1),(r1,q2),(r2,q3),(r2,q4),(r3,q4),(r4,q5),(r4,q6),(r5,q7),(r5,q8),(r6,q9);

  insert into public.drafting_points(matter_id,resolution_id,title,status,text,clause_id,ordinal) values
   (m,r1,'Term & Termination Clause','Draft','Update clause 2 to reflect 36-month term and 60-day termination for convenience.',c2,1),
   (m,r2,'Data Protection Clause','Draft','Draft clause covering GDPR, CCPA and 24-hour breach notification.',c4,2),
   (m,r3,'Security & Audit Rights','Draft','Draft clause for annual SOC 2 Type II reports and audit rights.',null,3),
   (m,r4,'Payment Terms','Draft','Amend clause 3.2 from 30 to 45 days; add ACH as payment method.',c3,4),
   (m,r5,'IP Ownership Clause','Open','Redraft clause 6: Client owns engagement IP; Vendor retains pre-existing IP with perpetual licence-back.',c6,5),
   (m,r6,'Governing Law Escalation','Escalated','Obtain GC sign-off before accepting New York governing law.',c7,6);

  insert into public.audit_events(matter_id,actor_id,actor_name,event_type,entity_type,entity_id,summary,created_at) values
   (m,_user_id,'Priya Sharma','playbook.applied','playbook',pb,'Playbook v3 applied to matter','2026-04-28T09:00:00Z'),
   (m,_user_id,'System','transcript.imported','transcript',tr,'Steering committee meeting — transcript imported','2026-05-06T17:30:00Z'),
   (m,_user_id,'John Okafor','document.uploaded','document',d1,'Original MSA v3 uploaded','2026-05-10T10:15:00Z'),
   (m,_user_id,'Sarah Lindqvist','document.uploaded','document',d2,'Amendment v4 uploaded — review generated','2026-05-16T09:45:00Z'),
   (m,_user_id,'Priya Sharma','clause.escalated','clause',c6,'IP clause escalated to General Counsel','2026-05-16T14:20:00Z');

  return m;
end $fn$;
revoke all on function public.seed_demo_matter(uuid,uuid) from public, anon;

-- bootstrap: profile + personal workspace + sample matter
create or replace function public.bootstrap_user(_user_id uuid, _email text, _full_name text, _avatar_url text)
returns void language plpgsql security definer set search_path = public as $fn$
declare ws uuid;
begin
  insert into public.profiles(id, email, full_name, avatar_url)
  values (_user_id, _email, _full_name, _avatar_url)
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  select w.id into ws from public.workspaces w
   where w.owner_id = _user_id and w.kind = 'personal' limit 1;

  if ws is null then
    insert into public.workspaces(name, kind, owner_id)
    values (coalesce(nullif(_full_name,''), 'Personal'), 'personal', _user_id) returning id into ws;
    insert into public.workspace_members(workspace_id, user_id, role) values (ws, _user_id, 'owner');
    -- Demo seeding removed: Praxis ships no sample data (see 20260901_no_sample_data.sql).
  end if;
end $fn$;
revoke all on function public.bootstrap_user(uuid,text,text,text) from public, anon;

-- called by the client right after sign-in; idempotent safety net for the signup trigger
create or replace function public.bootstrap_current_user()
returns void language plpgsql security definer set search_path = public as $fn$
declare u record;
begin
  if auth.uid() is null then return; end if;
  select id, email, raw_user_meta_data into u from auth.users where id = auth.uid();
  perform public.bootstrap_user(
    u.id, u.email,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email,'@',1)),
    u.raw_user_meta_data->>'avatar_url');
end $fn$;
revoke all on function public.bootstrap_current_user() from public, anon;
grant execute on function public.bootstrap_current_user() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  perform public.bootstrap_user(
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url');
  return new;
end $fn$;
revoke all on function public.handle_new_user() from public, anon;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();