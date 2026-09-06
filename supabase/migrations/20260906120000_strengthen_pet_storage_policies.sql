drop policy if exists "Users can upload avatars for their own pets" on storage.objects;
drop policy if exists "Users can view avatars for their own pets" on storage.objects;
drop policy if exists "Users can delete avatars for their own pets" on storage.objects;

create policy "Users can upload avatars for their own pets"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'pet-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
  and public.is_owned_pet((storage.foldername(name))[2])
);

create policy "Users can view avatars for their own pets"
on storage.objects for select to authenticated
using (
  bucket_id = 'pet-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.is_owned_pet((storage.foldername(name))[2])
);

create policy "Users can delete avatars for their own pets"
on storage.objects for delete to authenticated
using (
  bucket_id = 'pet-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (
    public.is_owned_pet((storage.foldername(name))[2])
    or owner_id = (select auth.uid()::text)
  )
);

-- DB先行削除後の孤立object cleanupを許可する。アップロード時の所有者と
-- user_id階層が現在ユーザーに一致するobjectだけが対象になる。
drop policy if exists "Users can delete photos for their own pets" on storage.objects;
create policy "Users can delete photos for their own pets"
on storage.objects for delete to authenticated
using (
  bucket_id = 'pet-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (
    public.is_owned_pet((storage.foldername(name))[2])
    or owner_id = (select auth.uid()::text)
  )
);
