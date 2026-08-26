drop policy if exists "Users can upload avatars for their own pets"
on storage.objects;

drop policy if exists "Users can view avatars for their own pets"
on storage.objects;

drop policy if exists "Users can delete avatars for their own pets"
on storage.objects;

create policy "Users can upload avatars for their own pets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pet-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
);

create policy "Users can view avatars for their own pets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pet-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can delete avatars for their own pets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pet-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
