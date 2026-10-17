do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='seed_demo_matter';
  src := replace(src, '''May 6, 2026 · 67 min''', '''Otter.ai''');
  execute src;
end $$;

update public.transcripts set source_label = 'Otter.ai' where source_label <> 'Otter.ai';