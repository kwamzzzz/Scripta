alter table public.matters
  add column if not exists matter_type text not null default 'Other',
  add column if not exists governing_law text,
  add column if not exists value numeric,
  add column if not exists currency text,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists target_date date,
  add column if not exists reference text;

alter table public.matters drop constraint if exists matters_matter_type_check;
alter table public.matters add constraint matters_matter_type_check
  check (matter_type in ('Vendor agreement','NDA','Services','Licence','Employment','Other'));

update public.matters set matter_type = 'Vendor agreement'
  where is_sample and matter_type = 'Other';
update public.matters set governing_law = 'England and Wales'
  where is_sample and governing_law is null;
update public.matters set owner_id = created_by where owner_id is null;