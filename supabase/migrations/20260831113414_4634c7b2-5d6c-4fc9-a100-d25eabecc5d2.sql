revoke all on function public.seed_demo_matter(uuid,uuid) from public, anon, authenticated;
revoke all on function public.bootstrap_user(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.seed_demo_matter(uuid,uuid) to service_role;
grant execute on function public.bootstrap_user(uuid,text,text,text) to service_role;