alter table public.photos add column thumbnail_path text unique;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pet-photo-thumbnails', 'pet-photo-thumbnails', false, 1048576, array['image/webp']);

create policy "Users can upload thumbnails for their own pets"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'pet-photo-thumbnails'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.is_owned_pet((storage.foldername(name))[2])
  and lower(storage.extension(name)) = 'webp'
);

create policy "Users can view thumbnails for their own pets"
on storage.objects for select to authenticated
using (
  bucket_id = 'pet-photo-thumbnails'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.is_owned_pet((storage.foldername(name))[2])
);

create policy "Users can delete thumbnails for their own pets"
on storage.objects for delete to authenticated
using (
  bucket_id = 'pet-photo-thumbnails'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (public.is_owned_pet((storage.foldername(name))[2]) or owner_id = (select auth.uid()::text))
);

drop function public.get_pet_photos_page(uuid, integer, timestamptz, uuid, boolean);
drop function public.search_pet_photos_page(uuid, text, timestamptz, timestamptz, boolean, integer, timestamptz, uuid);
drop function public.get_dashboard_photos(boolean, integer);

create function public.get_pet_photos_page(p_pet_id uuid, p_limit integer default 30, p_cursor_at timestamptz default null, p_cursor_id uuid default null, p_favorite_only boolean default false)
returns table (id uuid, pet_id uuid, storage_path text, thumbnail_path text, taken_at timestamptz, created_at timestamptz, caption text, favorite boolean, timeline_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.pet_id, p.storage_path, p.thumbnail_path, p.taken_at, p.created_at, p.caption, p.favorite, p.timeline_at
  from public.photos p where p.pet_id = p_pet_id and (not p_favorite_only or p.favorite)
    and (p_cursor_at is null or (p.timeline_at, p.id) < (p_cursor_at, p_cursor_id))
  order by p.timeline_at desc, p.id desc limit least(greatest(p_limit, 1), 61);
$$;

create function public.search_pet_photos_page(p_pet_id uuid, p_query text default null, p_from timestamptz default null, p_to timestamptz default null, p_favorite_only boolean default false, p_limit integer default 50, p_cursor_at timestamptz default null, p_cursor_id uuid default null)
returns table (id uuid, pet_id uuid, storage_path text, thumbnail_path text, taken_at timestamptz, created_at timestamptz, caption text, favorite boolean, timeline_at timestamptz, description text, tags text[])
language sql stable security invoker set search_path = '' as $$
  select p.id, p.pet_id, p.storage_path, p.thumbnail_path, p.taken_at, p.created_at, p.caption, p.favorite, p.timeline_at, a.description, coalesce(a.tags, '{}')
  from public.photos p left join public.photo_ai_analyses a on a.photo_id = p.id and a.status = 'completed'
  where p.pet_id = p_pet_id and (not p_favorite_only or p.favorite)
    and (p_from is null or p.timeline_at >= p_from) and (p_to is null or p.timeline_at < p_to)
    and (p_cursor_at is null or (p.timeline_at, p.id) < (p_cursor_at, p_cursor_id))
    and (nullif(btrim(p_query), '') is null
      or p.caption ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
      or a.description ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
      or a.activity ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
      or a.scene ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
      or a.emotion ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
      or exists (select 1 from unnest(coalesce(a.tags, '{}')) tag where tag ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'))
  order by p.timeline_at desc, p.id desc limit least(greatest(p_limit, 1), 50);
$$;

create function public.get_dashboard_photos(p_favorite_only boolean default false, p_limit integer default 6)
returns table (id uuid, pet_id uuid, storage_path text, thumbnail_path text, taken_at timestamptz, created_at timestamptz, favorite boolean, timeline_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.pet_id, p.storage_path, p.thumbnail_path, p.taken_at, p.created_at, p.favorite, p.timeline_at
  from public.photos p join public.pets pet on pet.id = p.pet_id
  where pet.owner_user_id = auth.uid() and (not p_favorite_only or p.favorite)
  order by p.timeline_at desc, p.id desc limit least(greatest(p_limit, 1), 6);
$$;

revoke all on function public.get_pet_photos_page(uuid, integer, timestamptz, uuid, boolean) from public, anon;
grant execute on function public.get_pet_photos_page(uuid, integer, timestamptz, uuid, boolean) to authenticated;
revoke all on function public.search_pet_photos_page(uuid, text, timestamptz, timestamptz, boolean, integer, timestamptz, uuid) from public, anon;
grant execute on function public.search_pet_photos_page(uuid, text, timestamptz, timestamptz, boolean, integer, timestamptz, uuid) to authenticated;
revoke all on function public.get_dashboard_photos(boolean, integer) from public, anon;
grant execute on function public.get_dashboard_photos(boolean, integer) to authenticated;
