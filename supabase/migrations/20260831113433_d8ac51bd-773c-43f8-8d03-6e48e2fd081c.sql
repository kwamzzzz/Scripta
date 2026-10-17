create policy "workspace members read matter documents"
on storage.objects for select to authenticated
using (bucket_id = 'matter-documents' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));

create policy "workspace writers upload matter documents"
on storage.objects for insert to authenticated
with check (bucket_id = 'matter-documents' and public.can_write_workspace(((storage.foldername(name))[1])::uuid));

create policy "workspace writers update matter documents"
on storage.objects for update to authenticated
using (bucket_id = 'matter-documents' and public.can_write_workspace(((storage.foldername(name))[1])::uuid))
with check (bucket_id = 'matter-documents' and public.can_write_workspace(((storage.foldername(name))[1])::uuid));

create policy "workspace writers delete matter documents"
on storage.objects for delete to authenticated
using (bucket_id = 'matter-documents' and public.can_write_workspace(((storage.foldername(name))[1])::uuid));