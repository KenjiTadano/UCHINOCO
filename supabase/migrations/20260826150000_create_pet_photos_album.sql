create table public.photos (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  uploader_user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  taken_at timestamptz,
  caption text,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index photos_pet_timeline_idx
on public.photos using btree (pet_id, taken_at desc nulls last, created_at desc);

create index photos_uploader_user_id_idx
on public.photos using btree (uploader_user_id);

alter table public.photos enable row level security;

create policy "Users can view photos for their own pets"
on public.photos
for select
to authenticated
using (
  exists (
    select 1
    from public.pets
    where public.pets.id = photos.pet_id
      and public.pets.owner_user_id = (select auth.uid())
  )
);

create policy "Users can create photos for their own pets"
on public.photos
for insert
to authenticated
with check (
  uploader_user_id = (select auth.uid())
  and exists (
    select 1
    from public.pets
    where public.pets.id = photos.pet_id
      and public.pets.owner_user_id = (select auth.uid())
  )
);

create policy "Users can update photos for their own pets"
on public.photos
for update
to authenticated
using (
  exists (
    select 1
    from public.pets
    where public.pets.id = photos.pet_id
      and public.pets.owner_user_id = (select auth.uid())
  )
)
with check (
  uploader_user_id = (select auth.uid())
  and exists (
    select 1
    from public.pets
    where public.pets.id = photos.pet_id
      and public.pets.owner_user_id = (select auth.uid())
  )
);

create policy "Users can delete photos for their own pets"
on public.photos
for delete
to authenticated
using (
  exists (
    select 1
    from public.pets
    where public.pets.id = photos.pet_id
      and public.pets.owner_user_id = (select auth.uid())
  )
);

create trigger set_photos_updated_at
before update on public.photos
for each row execute function public.set_updated_at();

grant select, insert, update, delete on table public.photos to authenticated;

create function public.is_owned_pet(pet_id_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pets
    where public.pets.id::text = pet_id_text
      and public.pets.owner_user_id = auth.uid()
  );
$$;

revoke all on function public.is_owned_pet(text) from public, anon;
grant execute on function public.is_owned_pet(text) to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'pet-photos',
  'pet-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy "Users can upload photos for their own pets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pet-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
  and public.is_owned_pet((storage.foldername(name))[2])
);

create policy "Users can view photos for their own pets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pet-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.is_owned_pet((storage.foldername(name))[2])
);

create policy "Users can delete photos for their own pets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pet-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.is_owned_pet((storage.foldername(name))[2])
);
