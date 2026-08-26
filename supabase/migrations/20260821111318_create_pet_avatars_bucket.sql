insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'pet-avatars',
  'pet-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy "Users can upload avatars for their own pets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pet-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
  and exists (
    select 1
    from public.pets
    where public.pets.id::text = (storage.foldername(name))[2]
      and public.pets.owner_user_id = (select auth.uid())
  )
);

create policy "Users can view avatars for their own pets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pet-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.pets
    where public.pets.id::text = (storage.foldername(name))[2]
      and public.pets.owner_user_id = (select auth.uid())
  )
);

create policy "Users can delete avatars for their own pets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pet-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.pets
    where public.pets.id::text = (storage.foldername(name))[2]
      and public.pets.owner_user_id = (select auth.uid())
  )
);
